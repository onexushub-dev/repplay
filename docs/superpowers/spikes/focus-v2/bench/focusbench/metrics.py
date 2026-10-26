"""Spec 2026-10-24 §1 metrics for one framing of one clip, and the overall row.

- ball_in_crop: share of the labelled in-play samples (a ball point) whose point lies inside the crop; samples labelled
  "out" (ball not in play) or "none" (in play but not visible) are left out. No such sample → None (not scored).
- mean_zoom: mean of 1 / crop width.
- jerk_p95: 95th percentile of |second difference| of the crop centre x, in crop widths / s² (smoothness: lower is better).
"""

from __future__ import annotations

from dataclasses import dataclass

Rect = tuple[float, float, float, float]


@dataclass(frozen=True)
class ClipMetrics:
    available: bool
    ball_in_crop: float | None
    labelled: int  # in-play samples with a ball point inside the analysed window
    inside: int
    mean_zoom: float | None
    jerk_p95: float | None


def _p95(values: list[float]) -> float:
    s = sorted(values)
    if not s:
        return 0.0
    k = (len(s) - 1) * 0.95
    lo, hi = int(k), min(len(s) - 1, int(k) + 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def clip_metrics(rects: list[Rect] | None, labels: dict, start_ms: int, step_ms: int = 100) -> ClipMetrics:
    if rects is None:
        return ClipMetrics(False, None, 0, 0, None, None)
    n = len(rects)
    labelled = inside = 0
    for t, v in labels.items():
        if isinstance(v, str):
            continue
        k = round((int(t) - start_ms) / step_ms)
        if not 0 <= k < n:
            continue
        x, y, w, h = rects[k]
        labelled += 1
        if x <= v[0] <= x + w and y <= v[1] <= y + h:
            inside += 1
    dt = step_ms / 1000
    c = [r[0] + r[2] / 2 for r in rects]
    jerk = [abs(c[k + 1] - 2 * c[k] + c[k - 1]) / dt ** 2 / rects[k][2] for k in range(1, n - 1)]
    return ClipMetrics(True, inside / labelled if labelled else None, labelled, inside,
                       sum(1 / r[2] for r in rects) / n if n else None, _p95(jerk) if n else None)


def overall(rows: list[ClipMetrics]) -> dict:
    scored = [r for r in rows if r.available]
    labelled = sum(r.labelled for r in scored)
    zooms = [r.mean_zoom for r in scored if r.mean_zoom is not None]
    jerks = [r.jerk_p95 for r in scored if r.jerk_p95 is not None]
    return {
        "clips": len(rows),
        "unavailable": sum(1 for r in rows if not r.available),
        "ball_in_crop": sum(r.inside for r in scored) / labelled if labelled else None,
        "labelled": labelled,
        "mean_zoom": sum(zooms) / len(zooms) if zooms else None,
        "jerk_p95": sum(jerks) / len(jerks) if jerks else None,
    }
