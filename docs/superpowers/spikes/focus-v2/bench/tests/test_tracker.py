"""Ball tracker prototype (spec 2026-10-24 §4.2, tests from §6). One sample every 100 ms; coordinates 0..1."""

from __future__ import annotations

import pytest

from focusbench.tracker import HELD, LOST, PREDICTED, SEEN, track_ball

STEP = 100


def samples(n, ball=None, people=None, extra=None):
    """`ball(k)` → (x, y) or None; `people(k)` → boxes; `extra(k)` → more ball candidates."""
    out = []
    for k in range(n):
        balls = []
        if ball is not None and ball(k) is not None:
            x, y = ball(k)
            balls.append((x, y, 0.01, 0.6))
        if extra is not None:
            balls += extra(k)
        out.append({"t": k * STEP, "people": people(k) if people else [], "balls": balls})
    return out


def line(k):
    return (0.2 + 0.05 * k, 0.5)  # 0.5 frame widths per second


def test_parabola_is_tracked():
    def arc(k):
        t = k / 10
        return (0.2 + 0.4 * t, 0.8 - 2.4 * t + 3 * t * t)
    rows = track_ball(samples(15, arc))
    assert [r[2] for r in rows] == [SEEN] * 15
    for k, r in enumerate(rows):
        assert r[0] == pytest.approx(arc(k)[0], abs=0.01) and r[1] == pytest.approx(arc(k)[1], abs=0.01)


def test_straight_pass_is_tracked():
    rows = track_ball(samples(12, line))
    assert all(r[2] == SEEN for r in rows)


def test_static_candidate_is_dropped():
    rows = track_ball(samples(40, lambda k: (0.7, 0.24)))
    assert all(r[2] == LOST for r in rows)


def test_short_gap_is_predicted():
    rows = track_ball(samples(14, lambda k: None if 5 <= k < 10 else line(k)))  # 0.5 s without candidates
    assert [r[2] for r in rows[5:10]] == [PREDICTED] * 5
    for k in range(5, 10):
        assert rows[k][0] == pytest.approx(line(k)[0], abs=0.03) and rows[k][1] == pytest.approx(0.5, abs=0.03)


def test_long_gap_is_held_by_nearest_player():
    def player(k):  # walks right; centre at k=7 is (0.564, 0.425), the nearest to the last ball seen at (0.55, 0.5)
        return (0.52 + 0.002 * k, 0.30, 0.06, 0.25)
    def far(k):
        return (0.05 + 0.002 * k, 0.30, 0.06, 0.25)
    rows = track_ball(samples(23, lambda k: line(k) if k < 8 else None,
                              people=lambda k: [(*player(k), 0.9), (*far(k), 0.9)]))
    # last seen at k=7; up to 0.7 s predicted (k 8..14), then held (k 15..22, before 3 s)
    assert all(r[2] == PREDICTED for r in rows[8:15])
    assert all(r[2] == HELD for r in rows[15:23])
    assert rows[18][0] == pytest.approx(0.55 + 0.002 * 18) and rows[18][1] == pytest.approx(0.425)


def test_very_long_gap_is_lost():
    rows = track_ball(samples(55, lambda k: line(k) if k < 8 else None,
                              people=lambda k: [(0.52 + 0.002 * k, 0.30, 0.06, 0.25, 0.9)]))
    assert all(r[2] == LOST for r in rows[7 + 31:])  # more than 3 s after the last sighting


def test_moving_ball_beats_static_ball():
    rows = track_ball(samples(20, line, extra=lambda k: [(0.7, 0.24, 0.02, 0.9)]))
    for k, r in enumerate(rows):
        assert r[2] == SEEN and r[0] == pytest.approx(line(k)[0], abs=0.01)


def test_nothing_before_the_first_sighting_and_rows_per_sample():
    rows = track_ball(samples(10, lambda k: line(k) if k >= 5 else None))
    assert len(rows) == 10 and all(r[2] == LOST for r in rows[:5])


def test_height_is_measured_in_frame_widths():
    """A portrait frame (H = 16/9 W): a jump of 0.05 in y is 0.089 widths, still one smooth vertical pass."""
    rows = track_ball(samples(12, lambda k: (0.5, 0.2 + 0.05 * k)), hw=16 / 9)
    assert all(r[2] == SEEN for r in rows)


def test_intermittent_static_candidate_is_dropped():
    """A low-confidence blob in the same place every other sample (about the 50% share of rule 1) is scenery too."""
    rows = track_ball(samples(40, lambda k: (0.964, 0.883) if k % 2 == 0 else None))
    assert all(r[2] == LOST for r in rows)


def test_held_follows_moving_players_only():
    """A painted wall figure (same box all along) is not a player who can have the ball."""
    mural = (0.53, 0.28, 0.05, 0.2)  # closest to where the ball was last seen, but never moves
    def player(k):
        return (0.20 + 0.01 * k, 0.30, 0.06, 0.25)
    rows = track_ball(samples(30, lambda k: line(k) if k < 8 else None,
                              people=lambda k: [(*mural, 0.9), (*player(k), 0.9)]))
    assert rows[20][2] == HELD and rows[20][0] == pytest.approx(player(20)[0] + 0.03)
