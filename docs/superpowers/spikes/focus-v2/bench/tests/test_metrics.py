import pytest

from focusbench.metrics import clip_metrics, overall


def still(n, w=0.5):
    return [(0.25, 0.25, w, w)] * n


def test_ball_share_counts_only_in_play_points():
    labels = {0: "out", 100: "out", 200: "none"}
    labels.update({300 + 100 * k: (0.5, 0.5) for k in range(6)})  # inside
    labels[900] = (0.95, 0.5)  # outside
    m = clip_metrics(still(10), labels, start_ms=0)
    assert m.ball_in_crop == pytest.approx(6 / 7)
    assert m.labelled == 7


def test_clip_without_in_play_labels_is_not_scored():
    m = clip_metrics(still(5), {0: "out", 100: "none"}, start_ms=0)
    assert m.ball_in_crop is None and m.available


def test_unavailable_clip():
    m = clip_metrics(None, {0: (0.5, 0.5)}, start_ms=0)
    assert not m.available and m.ball_in_crop is None and m.mean_zoom is None and m.jerk_p95 is None


def test_still_crop_has_zero_jerk_and_half_width_crop_zooms_2x():
    m = clip_metrics(still(20), {}, start_ms=0)
    assert m.jerk_p95 == 0 and m.mean_zoom == pytest.approx(2)


def test_jerk_is_in_crop_widths_per_second_squared():
    rects = [(0.1 + 0.001 * k * k, 0.25, 0.5, 0.5) for k in range(20)]  # x'' = 0.002 per step² = 0.2 frame widths/s²
    m = clip_metrics(rects, {}, start_ms=0)
    assert m.jerk_p95 == pytest.approx(0.2 / 0.5)


def test_labels_outside_the_window_are_ignored():
    m = clip_metrics(still(3), {0: (0.5, 0.5), 5000: (0.99, 0.99)}, start_ms=0)
    assert m.labelled == 1 and m.ball_in_crop == 1


def test_overall_weights_ball_share_by_labelled_samples():
    a = clip_metrics(still(10), {k * 100: (0.5, 0.5) for k in range(9)}, start_ms=0)  # 9/9
    b = clip_metrics(still(10), {0: (0.99, 0.5)}, start_ms=0)  # 0/1
    c = clip_metrics(None, {}, start_ms=0)
    o = overall([a, b, c])
    assert o["ball_in_crop"] == pytest.approx(9 / 10)
    assert o["unavailable"] == 1 and o["clips"] == 3
    assert o["mean_zoom"] == pytest.approx(2)
