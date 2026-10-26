from focusbench.report import interpolate, target_rows


def ov(ball=None, unavailable=0, zoom=1.2, jerk=1.0):
    return {"clips": 10, "unavailable": unavailable, "ball_in_crop": ball, "labelled": 100 if ball is not None else 0,
            "mean_zoom": zoom, "jerk_p95": jerk}


def test_report_marks_targets():
    rows = {r[0]: r[3] for r in target_rows(ov(0.8, 3, 1.2, 1.0), ov(0.96, 0, 1.6, 1.0))}
    assert rows == {"ball in crop ≥ 95%": True, "no unavailable clip": True, "mean zoom above v1": True,
                    "jerk not worse than v1": True}
    rows = {r[0]: r[3] for r in target_rows(ov(0.8), ov(0.90, 1, 1.1, 1.2))}
    assert rows == {"ball in crop ≥ 95%": False, "no unavailable clip": False, "mean zoom above v1": False,
                    "jerk not worse than v1": False}


def test_targets_without_labels_are_not_judged():
    rows = {r[0]: r for r in target_rows(ov(None), ov(None))}
    assert rows["ball in crop ≥ 95%"][3] is None and rows["ball in crop ≥ 95%"][1] == "n/a"


def test_rect_is_interpolated_between_keyframes_and_held_at_the_ends():
    rects = [(0.0, 0.0, 0.5, 0.5), (0.2, 0.1, 0.5, 0.5)]
    assert interpolate(rects, 0, 100, 50) == (0.1, 0.05, 0.5, 0.5)
    assert interpolate(rects, 0, 100, -20) == rects[0]
    assert interpolate(rects, 0, 100, 500) == rects[1]
