"""Human paddle: tracks the player with the RealSense depth camera and publishes the bottom
paddle's state and position over MQTT. The decisions live in presence.PaddlePresence."""
import logging
import queue
import signal
import sys
import time

from dw import Config
from dw.state_machine import PongAPI, Topics
from presence import IDLE, PaddlePresence

logging.basicConfig(level=logging.INFO)
log = logging.getLogger('human-paddle-control')

FEED_INTERVAL_S = 1 / 15  # the human visualizer doesn't need the full 30 fps


def publish(api, messages):
    for kind, value in messages:
        if kind == 'state':
            log.info('paddle/bottom/state -> %s', value)
            api.update(Topics.PADDLE_BOTTOM_STATE, {'state': value}, retain=True)
        elif kind == 'position':
            api.update(Topics.PADDLE_BOTTOM_POSITION, {'position': {'x': value}})


def main():
    from depth_source import RealSenseSource  # needs the camera libraries; tests don't

    config = Config.instance()
    source = RealSenseSource(crop_rows=config.CROP_PERCENTAGE_W, crop_cols=config.CROP_PERCENTAGE_H)

    # If this service dies, the broker tells the gameboard the player is gone.
    api = PongAPI('human-paddle-control', will=(Topics.PADDLE_BOTTOM_STATE, {'state': 'stop'}))
    transitions = queue.Queue()  # MQTT callbacks run on paho's thread; hand them to the loop
    api.register_observer(Topics.GAME_STATE, lambda message: transitions.put(message.get('transition')))
    api.start()

    presence = PaddlePresence(now=time.monotonic())
    publish(api, presence.start(time.monotonic()))

    def shutdown(signum, frame):
        publish(api, [('state', 'not_ready' if presence.phase == IDLE else 'stop')])
        time.sleep(0.3)
        api.stop()
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    next_feed = 0.0
    while True:
        try:
            now = time.monotonic()
            while not transitions.empty():
                publish(api, presence.on_transition(transitions.get_nowait(), now))
            want_feed = now >= next_feed
            position, feed = source.read(want_feed=want_feed)  # blocks until the next frame
            if feed is not None:
                api.update(Topics.DEPTH_FEED, {'feed': feed})
                next_feed = now + FEED_INTERVAL_S
            publish(api, presence.on_sample(position, time.monotonic()))
        except Exception:
            log.exception('error in the camera loop; carrying on')
            time.sleep(0.1)


if __name__ == '__main__':
    main()
