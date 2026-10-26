"""FocusPath v2 prototype (spec 2026-10-24 §4.3)."""

import random

import pytest
from test_v1path import NAMES, load

from focusbench.path_v2 import TUNING_V2, max_zoom_for, v2_rects
from focusbench.tracker import LOST, SEEN
from focusbench.v1path import v1_rects

STEP = 100
W, H = 1920, 1080  # landscape


def walkers(k, around=0.5, n=4):
    """n players near `around` that keep moving (so the still filter keeps them)."""
    return [(around - 0.15 + 0.1 * j + 0.01 * ((k + 3 * j) % 7), 0.35, 0.04, 0.3, 0.9) for j in range(n)]


def scene(n, ball, around=lambda k: 0.5):
    samples = [{"t": k * STEP, "people": walkers(k, around(k)), "balls": []} for k in range(n)]
    track = [(*ball(k), SEEN, 0.6) for k in range(n)]
    return samples, track


def centres(rects):
    return [r[0] + r[2] / 2 for r in rects]


@pytest.mark.parametrize("name", NAMES[:2] + NAMES[3:4])
def test_no_ball_track_equals_v1(name):
    samples_v1, w, h = load(name)
    samples = [{"t": t, "people": [(*b, 0.9) for b in boxes], "balls": []} for t, boxes in samples_v1]
    track = [(0.0, 0.0, LOST, 0.0)] * len(samples)
    aspect = "landscape" if name.startswith("landscape") else "portrait"
    assert v2_rects(samples, track, w, h, aspect, True, 1.5) == v1_rects(samples_v1, w, h, aspect, True, 1.5)


def test_max_zoom_by_resolution():
    assert max_zoom_for(1080) == 1.5
    assert max_zoom_for(1440) == 2
    assert max_zoom_for(2160) == 3
    assert max_zoom_for(607) == 1
    assert max_zoom_for(1215) == pytest.approx(1215 / 720)
    assert max_zoom_for(720) == 1


def test_crop_never_tighter_than_max_zoom():
    samples, track = scene(60, lambda k: (0.5, 0.5))
    rects = v2_rects(samples, track, W, H, "landscape", True, 2.0)
    assert min(r[2] for r in rects) >= 1 / 2.0 - 1e-9


def test_dead_zone_holds_still():
    samples, track = scene(30, lambda k: (0.5 + 0.05 * (1 if (k // 5) % 2 else -1), 0.5))
    c = centres(v2_rects(samples, track, W, H, "landscape", True, 1.5))
    assert max(c) - min(c) < 0.005


def test_lead_room_points_where_the_ball_goes():
    """The same scene with and without lead room: the difference points the way the ball goes, ≤ 15% of the crop."""
    for direction in (1, -1):
        ball = lambda k: (0.5 + direction * (-0.3 + 0.02 * k), 0.5)  # 0.2 frame widths / s
        samples, track = scene(30, ball, around=lambda k: ball(k)[0])
        with_lead = v2_rects(samples, track, W, H, "landscape", True, 3.0)
        without = v2_rects(samples, track, W, H, "landscape", True, 3.0, {"lead_max": 0.0})
        for k in range(15, 26):  # the camera follows by then, away from the frame edges
            lead = (centres(with_lead)[k] - centres(without)[k]) * direction
            assert 0 < lead <= 0.15 * with_lead[k][2] + 1e-9


def test_speed_and_acceleration_limits():
    ball = lambda k: (0.42, 0.5) if k < 10 else (0.58, 0.5)  # a jump the crop can follow without reaching an edge
    samples, track = scene(50, ball, around=lambda k: 0.42 if k < 10 else 0.58)
    rects = v2_rects(samples, track, W, H, "landscape", True, 1.5)
    c, dt = centres(rects), STEP / 1000
    t = TUNING_V2
    for k in range(1, len(c)):
        vmax = max(t["pan_base"], t["pan_fast"] * rects[k][2])
        assert abs(c[k] - c[k - 1]) / dt <= vmax + 1e-9
    for k in range(2, len(c)):
        assert abs(c[k] - 2 * c[k - 1] + c[k - 2]) / dt ** 2 <= t["accel_max"] * rects[k][2] + 1e-6


def test_rects_inside_the_video():
    rnd = random.Random(7)
    samples, track = scene(80, lambda k: (rnd.random(), rnd.random()), around=lambda k: rnd.random())
    for aspect, zoom in (("landscape", True), ("portrait", False)):
        for x, y, w, h in v2_rects(samples, track, W, H, aspect, zoom, 1.5):
            assert -1e-9 <= x and x + w <= 1 + 1e-9 and -1e-9 <= y and y + h <= 1 + 1e-9


def test_none_when_too_few_people():
    samples, track = scene(40, lambda k: (0.5, 0.5))
    for k in range(40):
        if k % 7:  # people in about 15% of the samples
            samples[k]["people"] = []
    assert v2_rects(samples, track, W, H, "landscape", True, 1.5) is None


# --- Frozen ball-led path (spec §13.1 decision 13) and players preset (decision 12) ---

from focusbench.path_v2 import TUNING_PLAYERS, ball_rects, smooth_rects  # noqa: E402


@pytest.mark.parametrize("name", NAMES[:2] + NAMES[3:4])
def test_ball_rects_without_track_equal_players_path(name):
    samples_v1, w, h = load(name)
    samples = [{"t": t, "people": [(*b, 0.9) for b in boxes], "balls": []} for t, boxes in samples_v1]
    track = [(0.0, 0.0, LOST, 0.0)] * len(samples)
    aspect = "landscape" if name.startswith("landscape") else "portrait"
    assert ball_rects(samples, track, w, h, aspect, 3.0) == v1_rects(samples_v1, w, h, aspect, True, 3.0,
                                                                      TUNING_PLAYERS)


def test_players_preset_values():
    assert (TUNING_PLAYERS["spreadScale"], TUNING_PLAYERS["spreadMargin"], TUNING_PLAYERS["sigmaXMs"]) == (1.1, 0.10, 800.0)


def test_smooth_rects_holds_edges_and_stays_inside():
    rects = [(0.0 if k < 20 else 0.6, 0.3, 0.4, 0.4) for k in range(40)]
    out = smooth_rects(rects, 600, 100)
    assert abs(out[0][0]) < 1e-9 and abs(out[-1][0] - 0.6) < 1e-9
    for x, y, w, h in out:
        assert -1e-9 <= x and x + w <= 1 + 1e-9 and -1e-9 <= y and y + h <= 1 + 1e-9


def test_ball_rects_follow_the_ball_without_controller_limits():
    """No dead zone: a ball that moves inside the middle of the crop still moves the camera."""
    samples, track = scene(30, lambda k: (0.5 + 0.05 * (1 if (k // 5) % 2 else -1), 0.5))
    c = centres(ball_rects(samples, track, W, H, "landscape", 1.5))
    assert max(c) - min(c) > 0.01


def test_ball_rects_respect_the_zoom_cap_and_stay_inside():
    rnd = random.Random(3)
    samples, track = scene(80, lambda k: (rnd.random(), rnd.random()), around=lambda k: rnd.random())
    for mz in (1.5, 3.0):
        for x, y, w, h in ball_rects(samples, track, W, H, "landscape", mz):
            assert w >= 1 / mz - 1e-9
            assert -1e-9 <= x and x + w <= 1 + 1e-9 and -1e-9 <= y and y + h <= 1 + 1e-9
