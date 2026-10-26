from __future__ import annotations

import itertools

import pytest

from focusbench.detect import choose_tiling, merge, nms, sample_from, tiles


def covers(boxes, x, y):
    return any(b[0] <= x <= b[0] + b[2] and b[1] <= y <= b[1] + b[3] for b in boxes)


@pytest.mark.parametrize("orientation,cols,rows", [("portrait", 2, 3), ("landscape", 3, 2)])
def test_tiles_cover_the_frame_with_15_percent_overlap(orientation, cols, rows):
    t = tiles(orientation)
    assert len(t) == 6
    assert all(covers(t, x / 20, y / 20) for x, y in itertools.product(range(21), range(21)))
    xs = sorted({round(b[0], 9) for b in t})
    ys = sorted({round(b[1], 9) for b in t})
    assert len(xs) == cols and len(ys) == rows
    w, h = t[0][2], t[0][3]
    if cols > 1:
        assert xs[0] + w - xs[1] == pytest.approx(0.15 * w, abs=1e-6)
    if rows > 1:
        assert ys[0] + h - ys[1] == pytest.approx(0.15 * h, abs=1e-6)


def people(h, n=3):
    return [{"t": k * 100, "people": [(0.1, 0.4, 0.03, h, 0.9)] * n, "balls": []} for k in range(10)]


def test_tiling_turns_on_below_48px_median_person_height():
    scale = 640.0  # pixels per unit of height at the model's scale
    assert choose_tiling(people(47 / 640), scale) is True
    assert choose_tiling(people(49 / 640), scale) is False
    assert choose_tiling([{"t": 0, "people": [], "balls": []}], scale) is True


def test_one_ball_seen_in_two_tiles_becomes_one_candidate():
    a = (32, 0.4, 0.500, 0.300, 0.010, 0.006)
    b = (32, 0.6, 0.501, 0.300, 0.010, 0.006)
    out = nms([a, b])
    assert len(out) == 1 and out[0][1] == 0.6


def test_thresholds_and_shapes():
    dets = [(0, 0.29, 0.1, 0.1, 0.05, 0.1), (0, 0.31, 0.3, 0.1, 0.05, 0.1),
            (32, 0.14, 0.5, 0.5, 0.01, 0.01), (32, 0.16, 0.6, 0.5, 0.01, 0.02), (2, 0.9, 0.7, 0.7, 0.1, 0.1)]
    s = sample_from(100, dets, width=1080, height=1920)
    assert s["t"] == 100
    assert s["people"] == [(0.3, 0.1, 0.05, 0.1, 0.31)]
    assert len(s["balls"]) == 1
    x, y, r, conf = s["balls"][0]
    assert (x, y, conf) == pytest.approx((0.605, 0.51, 0.16))
    assert r == pytest.approx((0.01 + 0.02 * 1920 / 1080) / 4)  # radius in frame-width units


def test_tile_boxes_map_back_to_the_frame():
    tile = (0.5, 0.25, 0.5, 0.5)  # x, y, w, h of the tile in the frame
    out = merge([], [(tile, [(0, 0.9, 0.0, 0.0, 1.0, 0.5)])])
    assert out == [pytest.approx((0, 0.9, 0.5, 0.25, 0.5, 0.25))]
