"""Find the player's horizontal position in a depth image.

The player is the largest horizontal "island" of in-range pixels; their position is the
median column of that island, scaled so they can reach both edges of the board without
leaving the camera frame. This is the original algorithm from motion_driver.get_human
(including its habit of dropping the last pixel of each island), minus its per-pixel
np.append loop, which was quadratic in the number of pixels.
"""
import numpy as np

MIN_PIXELS = 40  # fewer in-range pixels than this means nobody is there
EDGE_GAIN = 1.4  # x = column_fraction * 1.4 - 0.2 lets the player reach both edges
EDGE_OFFSET = 0.2


def in_range_mask(depth_cropped, clipping_distance):
    """Pixels closer than the clipping distance (and not zero, i.e. no reading)."""
    return (depth_cropped < clipping_distance) & (depth_cropped > 0.1)


def blob_center_column(mask):
    """Median column of the largest island of in-range pixels, or None if there is none."""
    columns = np.sort(np.nonzero(mask)[1]).tolist()
    if len(columns) <= MIN_PIXELS:
        return None

    islands = []
    i_min = 0
    i_max = 0
    previous = columns[0]
    for index, column in enumerate(columns):
        if column > previous + 1 and i_min != i_max:  # a gap ends the island
            islands.append(columns[i_min:i_max])
            i_min = index
        i_max = index
        previous = column
    if i_min != i_max:
        islands.append(columns[i_min:i_max])

    biggest = max(islands, key=len, default=[])
    if not biggest:
        return None
    return float(np.median(biggest))


def position_from_mask(mask):
    """Normalized paddle position in [0, 1], or None if no player is visible."""
    column = blob_center_column(mask)
    if column is None:
        return None
    x = (column / mask.shape[1]) * EDGE_GAIN - EDGE_OFFSET
    return min(1.0, max(0.0, x))
