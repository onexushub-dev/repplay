"""Sport → framing policy (spec 2026-10-24 §13.1 decisions 8, 10, 14; §13.6)."""

import pytest

from focusbench.policy import policy


@pytest.mark.parametrize("sport, short, follow, source, max_zoom", [
    ("tenis", 2160, "ball", "detector", 3.0),
    ("tenis", 1440, "ball", "detector", 2.0),
    ("volei", 2160, "ball", "detector", 1.5),
    ("voleiPraia", 1080, "ball", "detector", 1.5),
    ("basquete", 1080, "players", None, 1.5),
    ("livre", 2160, "players", None, 3.0),
    ("beachTennis", 2160, "players", None, 3.0),
    ("quadra", 2160, "players", None, 3.0),  # saved before 2026-10-25
    ("xyz", 2160, "players", None, 3.0),
])
def test_policy_table(sport, short, follow, source, max_zoom):
    assert policy(sport, short) == {"follow": follow, "ball_source": source, "max_zoom": max_zoom}


def test_volleyball_cap_never_above_the_resolution_cap():
    assert policy("volei", 900)["max_zoom"] == 1.25
