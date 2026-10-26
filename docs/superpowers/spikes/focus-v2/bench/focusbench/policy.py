"""Sport → framing policy (spec 2026-10-24 §13.1 decisions 8, 10, 14; ids from §13.6).

Ball-led: tennis and volleyball, indoor and beach, both from the general detector's filtered ball candidates (§13.3);
volleyball's zoom is capped at 1.5×. (Tennis used WASB until 2026-10-26: on tennis-02 the filtered detector kept the
ball in the crop 98.3% of the time at 3×, WASB 93.1%; see TUNING.md.) Every other id — `livre`, the other sports, and old or unknown ids such as `quadra` — frames the
players. The zoom cap comes from the capture's short side (decision 4: at least 720 source pixels, at most 3×).
"""

from __future__ import annotations

from .path_v2 import max_zoom_for

VOLLEYBALL_MAX_ZOOM = 1.5
BALL_SOURCE = {"tenis": "detector", "volei": "detector", "voleiPraia": "detector"}
ZOOM_CAP = {"volei": VOLLEYBALL_MAX_ZOOM, "voleiPraia": VOLLEYBALL_MAX_ZOOM}


def policy(sport: str, short_side_px: float) -> dict:
    cap = max_zoom_for(short_side_px)
    source = BALL_SOURCE.get(sport)
    if source is None:
        return {"follow": "players", "ball_source": None, "max_zoom": cap}
    if sport in ZOOM_CAP:
        cap = min(ZOOM_CAP[sport], cap)
    return {"follow": "ball", "ball_source": source, "max_zoom": cap}
