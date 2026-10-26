"""Ball candidate filters for the general detector (spec 2026-10-24 §13.3, rules 1-3).

Rule 4 (static scenery) stays in the tracker (`TRACKER_TUNING` static_radius / static_share).

1. Motion: keep a candidate only when its motion score (mean |Δ| of its grey patch vs the previous and the next sample,
   the min of both; computed by the native analyzer) is ≥ `motion_min`. A candidate without a score (first or last
   sample, a patch cut by the frame edge) is kept, and so is every candidate of a sample without scores at all (WASB,
   TrackNetV3).
2. Feet: a candidate inside the bottom `feet_share` of a person box is a shoe → dropped.
3. Body: inside a person box, above the feet, only confidence ≥ `body_conf_min` stays.
Person boxes are inclusive on every edge; the first box (detector order) that holds the candidate decides its zone.
"""

from __future__ import annotations

Ball = tuple[float, float, float, float]  # x, y, r, conf

FILTER_TUNING = dict(motion_min=4.0, feet_share=0.15, body_conf_min=0.3)


def _zone(b: Ball, people: list, feet_share: float) -> str:
    for p in people:
        x, y, w, h = p[0], p[1], p[2], p[3]
        if x <= b[0] <= x + w and y <= b[1] <= y + h:
            return "feet" if (b[1] - y) / h >= 1 - feet_share else "body"
    return "out"


def filter_balls(sample: dict, motion: list | None, t: dict = FILTER_TUNING) -> list[Ball]:
    """The sample's ball candidates that pass rules 1-3, in their original order."""
    keep = []
    for i, b in enumerate(sample["balls"]):
        if motion is not None:
            m = motion[i]
            if m is not None and m < t["motion_min"]:
                continue
        zone = _zone(b, sample["people"], t["feet_share"])
        if zone == "feet":
            continue
        if zone == "body" and b[3] < t["body_conf_min"]:
            continue
        keep.append(b)
    return keep
