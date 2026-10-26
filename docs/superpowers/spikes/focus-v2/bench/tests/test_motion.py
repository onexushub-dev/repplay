"""Native motion score (Part 3 plan, decision 5)."""

import numpy as np
import pytest

from focusbench.detect import grid_tiles, tile_plan, tiles
from focusbench.motion import blur, motion_score, window


def frames():
    rng = np.random.RandomState(0)
    base = rng.randint(60, 90, size=(48, 64)).astype(np.uint8)
    out = []
    for k in range(3):
        f = base.copy()
        f[20:26, 10 + 6 * k:16 + 6 * k] = 220  # a bright blob moving right 6 px per frame
        out.append(blur(f))
    return out


def test_motion_still_moving_edge():
    a, b, c = frames()
    still = motion_score(a, b, c, 50 / 64, 10 / 48, 0.01)
    moving = motion_score(a, b, c, 19 / 64, 23 / 48, 0.03)
    edge = motion_score(a, b, c, 0.0, 0.999, 0.01)
    assert still == pytest.approx(0.0)
    assert moving > 4
    assert edge == pytest.approx(0.0)
    assert window(64, 48, 0.0, 0.999, 0.01) == (43, 48, 0, 5)


def test_motion_ends_are_none():
    a, b, c = frames()
    assert motion_score(None, b, c, 0.3, 0.5, 0.01) is None
    assert motion_score(a, b, None, 0.3, 0.5, 0.01) is None


def test_blur_is_opencvs_3x3_gaussian_in_float():
    """cv2's 3×3 Gaussian with σ from the size is [1 2 1]/4 with BORDER_REFLECT_101: the same definition."""
    import cv2

    g = np.random.RandomState(1).randint(0, 256, size=(7, 9)).astype(np.uint8)
    assert np.allclose(blur(g), cv2.GaussianBlur(g.astype(np.float64), (3, 3), 0), atol=1e-12)


@pytest.mark.parametrize("short, orientation, ball, expected", [
    (1080, "landscape", True, (1920, 3, 2)), (1080, "portrait", False, (1920, 2, 3)),
    (720, "landscape", False, (1920, 3, 2)), (1440, "landscape", True, (2560, 4, 3)),
    (2160, "portrait", True, (2560, 3, 4)),
])
def test_tile_plan_table(short, orientation, ball, expected):
    p = tile_plan(short, orientation, ball)
    assert (p["decode_long_side"], p["cols"], p["rows"]) == expected and p["always"] == ball


def test_grid_tiles_match_the_v1_tiles():
    assert grid_tiles(3, 2) == tiles("landscape") and grid_tiles(2, 3) == tiles("portrait")
