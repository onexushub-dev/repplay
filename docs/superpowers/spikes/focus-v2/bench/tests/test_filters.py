"""Ball candidate filters (spec 2026-10-24 §13.3, rules 1-3)."""

from focusbench.filters import filter_balls

PERSON = (0.4, 0.2, 0.1, 0.4, 0.9)


def sample(balls, people=(PERSON,)):
    return {"t": 0, "people": list(people), "balls": balls}


def test_feet_zone_is_dropped():
    feet = (0.45, 0.2 + 0.4 * 0.9, 0.004, 0.9)
    body_sure = (0.45, 0.2 + 0.4 * 0.5, 0.004, 0.35)
    body_unsure = (0.45, 0.2 + 0.4 * 0.5, 0.004, 0.25)
    outside = (0.8, 0.5, 0.004, 0.16)
    kept = filter_balls(sample([feet, body_sure, body_unsure, outside]), None)
    assert kept == [body_sure, outside]


def test_motion_rule_and_missing_scores():
    balls = [(0.1, 0.1, 0.004, 0.5), (0.2, 0.1, 0.004, 0.5), (0.3, 0.1, 0.004, 0.5)]
    assert filter_balls(sample(balls, people=()), [3.9, 4.0, None]) == balls[1:]
    assert filter_balls(sample(balls, people=()), None) == balls  # no scores at all: the motion rule is off


def test_box_edges_are_inside():
    left = (0.4, 0.2 + 0.4 * 0.9, 0.004, 0.9)  # on the left edge, in the feet zone
    right = (0.5, 0.2 + 0.4 * 0.9, 0.004, 0.9)  # on the right edge
    bottom = (0.45, 0.6, 0.004, 0.9)  # on the bottom edge
    assert filter_balls(sample([left, right, bottom]), None) == []
