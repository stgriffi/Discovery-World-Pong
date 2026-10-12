import numpy as np
import pytest

from blob import blob_center_column, position_from_mask


def original_position(mask):
    """The original get_human() algorithm, verbatim except for taking a mask."""
    avg_x_array = np.array([])
    count = 0
    for a in range(np.size(mask, 0)):
        for b in range(np.size(mask, 1)):
            if mask[a, b]:
                avg_x_array = np.append(avg_x_array, b)
                count += 1
    if count <= 40:
        return None
    avg_x_array.sort()
    islands = []
    i_min = 0
    i_max = 0
    p = avg_x_array[0]
    for index in range(np.size(avg_x_array, 0)):
        n = avg_x_array[index]
        if n > p + 1 and not i_min == i_max:
            islands.append(avg_x_array[i_min:i_max])
            i_min = index
        i_max = index
        p = n
    if not i_min == i_max:
        islands.append(avg_x_array[i_min:i_max])
    big = np.array([])
    for array in islands:
        if np.size(array, 0) > np.size(big, 0):
            big = array
    m = np.median(big)
    return (m / (np.size(mask, 1)) * 1.4) - 0.2


def person_mask(rng, rows=32, cols=85):
    mask = np.zeros((rows, cols), dtype=bool)
    center = rng.integers(5, cols - 5)
    width = rng.integers(4, 20)
    mask[:, max(0, center - width // 2):center + width // 2] = rng.random((rows, len(range(max(0, center - width // 2), min(cols, center + width // 2))))) < 0.9
    noise = rng.random((rows, cols)) < 0.02  # a few stray pixels elsewhere
    return mask | noise


@pytest.mark.parametrize('seed', range(40))
def test_matches_the_original_algorithm(seed):
    rng = np.random.default_rng(seed)
    mask = person_mask(rng)
    expected = original_position(mask)
    actual = position_from_mask(mask)
    if expected is None:
        assert actual is None
    else:
        assert actual == pytest.approx(min(1.0, max(0.0, expected)), abs=1e-12)


def test_nobody_there_is_none_not_center():
    assert position_from_mask(np.zeros((32, 85), dtype=bool)) is None


def test_a_player_in_the_middle_is_present():
    mask = np.zeros((32, 85), dtype=bool)
    mask[:, 40:46] = True
    column = blob_center_column(mask)
    assert column == pytest.approx(42.5, abs=1)
    assert position_from_mask(mask) == pytest.approx((column / 85) * 1.4 - 0.2)


def test_positions_are_clamped_to_the_board():
    mask = np.zeros((32, 85), dtype=bool)
    mask[:, 0:5] = True  # far left: the raw formula goes below 0
    assert position_from_mask(mask) == 0.0
    mask = np.zeros((32, 85), dtype=bool)
    mask[:, 80:85] = True
    assert position_from_mask(mask) == 1.0
