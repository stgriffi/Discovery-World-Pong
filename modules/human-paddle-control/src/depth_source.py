"""Reads the player's position from the Intel RealSense depth camera."""
import base64
import logging
import time

import cv2
import numpy as np
import pyrealsense2 as rs

from blob import blob_center_column, in_range_mask, position_from_mask

log = logging.getLogger(__name__)


class RealSenseSource:
    def __init__(self, crop_rows=0.4, crop_cols=0.8, clipping_distance_m=2.0, frame_timeout_ms=1000):
        self.crop_rows = crop_rows
        self.crop_cols = crop_cols
        self.clipping_distance_m = clipping_distance_m
        self.frame_timeout_ms = frame_timeout_ms
        self.decimation = rs.decimation_filter()
        self.decimation.set_option(rs.option.filter_magnitude, 6)
        self.pipeline = rs.pipeline()
        self.failures = 0
        self._start()

    def _start(self):
        config = rs.config()
        config.enable_stream(rs.stream.depth, 640, 480, rs.format.z16, 30)
        profile = self.pipeline.start(config)
        depth_scale = profile.get_device().first_depth_sensor().get_depth_scale()
        # Ignore everything farther away than this (in raw depth units).
        self.clipping_distance = self.clipping_distance_m / depth_scale
        self.failures = 0
        log.info('depth camera started (clipping distance %.0f units)', self.clipping_distance)

    def _restart(self):
        log.warning('restarting the depth camera pipeline after %d failed reads', self.failures)
        try:
            self.pipeline.stop()
        except Exception:
            pass
        time.sleep(1.0)
        self._start()

    def read(self, want_feed=False):
        """Wait for the next frame. Returns (position in [0, 1] or None, base64 JPEG or None)."""
        try:
            frames = self.pipeline.wait_for_frames(self.frame_timeout_ms)
        except RuntimeError as e:
            self.failures += 1
            log.warning('no depth frame (%s)', e)
            if self.failures >= 5:
                self._restart()
            return None, None
        self.failures = 0

        depth = frames.get_depth_frame()
        if not depth:
            return None, None
        image = np.asanyarray(self.decimation.process(depth).get_data())
        rows, cols = image.shape
        r0 = int(rows / 2 - (rows * self.crop_rows) / 2)
        r1 = int(rows / 2 + (rows * self.crop_rows) / 2)
        c0 = int(cols / 2 - (cols * self.crop_cols) / 2)
        c1 = int(cols / 2 + (cols * self.crop_cols) / 2)
        cropped = image[r0:r1, c0:c1]

        mask = in_range_mask(cropped, self.clipping_distance)
        position = position_from_mask(mask)
        feed = self._feed_image(cropped, mask) if want_feed else None
        return position, feed

    @staticmethod
    def _feed_image(cropped, mask):
        """Heat map for the human visualizer: in-range pixels colored, a line at the player."""
        colored = cv2.applyColorMap(cv2.convertScaleAbs(cropped, alpha=0.03), cv2.COLORMAP_RAINBOW)
        colored[~mask] = 40
        column = blob_center_column(mask)
        if column is not None:
            colored = cv2.line(colored, (int(column), colored.shape[0]), (int(column), 0), (255, 255, 255), 1)
        ok, buffer = cv2.imencode('.jpg', colored)
        return base64.b64encode(buffer.tobytes()).decode() if ok else None
