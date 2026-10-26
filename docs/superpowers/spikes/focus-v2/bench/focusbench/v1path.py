"""FocusPath v1 and FocusGrid, ported operation by operation from ReplayCore (FocusPath.swift, FocusGrid.swift), so
the floating point matches the app. `tests/test_v1path.py` checks it against the Swift build."""

from __future__ import annotations

import math

Box = tuple[float, float, float, float]
Rect = tuple[float, float, float, float]

TUNING_V1 = dict(farShare=0.4, tallestCount=10, stillRadius=0.012, stillShare=0.8, stillWindowMs=3000.0, moveUnit=0.01,
                 moveCap=4.0, spreadLow=0.1, spreadHigh=0.9, sigmaXMs=500.0, sigmaYMs=800.0, sigmaSizeMs=1200.0,
                 maxPanPerSecond=0.35, spreadScale=1.3, spreadMargin=0.15, lift=0.1, minPeopleShare=0.2)
RATIO = {"landscape": 16.0 / 9.0, "portrait": 9.0 / 16.0}


def grid_samples(frames: list[tuple[float, list[Box]]], start_ms: float, end_ms: float, step_ms: float
                 ) -> list[tuple[float, list[Box]]]:
    """FocusGrid.samples: one sample per tick; the first frame inside the tick's step, else the people last seen."""
    if not frames or step_ms <= 0:
        return []
    stop = min(end_ms, frames[-1][0] + step_ms / 2)
    out, i, seen, tick = [], 0, frames[0][1], start_ms
    while tick < stop:
        while i < len(frames) and frames[i][0] < tick - 0.5:
            seen = frames[i][1]
            i += 1
        if i < len(frames) and frames[i][0] < tick + step_ms - 0.5:
            seen = frames[i][1]
            i += 1
        out.append((tick, seen))
        tick += step_ms
    return out


def _median(values: list[float]) -> float:
    s = sorted(values)
    n = len(s)
    return s[n // 2] if n % 2 == 1 else (s[n // 2 - 1] + s[n // 2]) / 2


def _weighted_quantile(values: list[float], weights: list[float], q: float) -> float:
    order = sorted(range(len(values)), key=lambda i: values[i])
    total = 0.0
    for w in weights:
        total += w
    acc = 0.0
    for i in order:
        acc += weights[i]
        if acc / total >= q:
            return values[i]
    return values[order[-1]]


def fill(values: list[float | None]) -> list[float]:
    known = [i for i, v in enumerate(values) if v is not None]
    if not known:
        return [0.5] * len(values)
    first, last = known[0], known[-1]
    out, k = [0.0] * len(values), 0
    for i in range(len(values)):
        if i <= first:
            out[i] = values[first]
            continue
        if i >= last:
            out[i] = values[last]
            continue
        while known[k + 1] < i:
            k += 1
        a, b = known[k], known[k + 1]
        va, vb = values[a], values[b]
        out[i] = vb if i == b else va + (vb - va) * (i - a) / (b - a)
    return out


def gaussian(values: list[float], sigma: float) -> list[float]:
    if not sigma > 0 or len(values) <= 1:
        return values
    r = math.ceil(3 * sigma)
    kernel = [math.exp(-0.5 * (j / sigma) ** 2) for j in range(-r, r + 1)]
    norm = 0.0
    for k in kernel:
        norm += k
    n = len(values)
    out = []
    for i in range(n):
        acc = 0.0
        for j, k in enumerate(kernel):
            acc += values[min(max(i + j - r, 0), n - 1)] * k
        out.append(acc / norm)
    return out


def _sum(xs) -> float:
    acc = 0.0
    for x in xs:
        acc += x
    return acc


def filter_people(samples: list[tuple[float, list[Box]]], W: float, H: float, t: dict = TUNING_V1) -> list[list[Box]]:
    """Steps 1-2: far people out (shorter than farShare of the tallest ones), still people out (spectators, bench)."""
    n = len(samples)
    near = []
    for _, boxes in samples:
        if not boxes:
            near.append([])
            continue
        ref = _median(sorted((b[3] for b in boxes), reverse=True)[: t["tallestCount"]])
        near.append([b for b in boxes if b[3] >= t["farShare"] * ref])
    feet = [[(b[0] + b[2] / 2, b[1] + b[3]) for b in bs] for bs in near]
    people = []
    for i in range(n):
        keep = []
        for j, box in enumerate(near[i]):
            fx, fy = feet[i][j]
            hits = total = 0
            for k in range(n):
                if k == i or abs(samples[k][0] - samples[i][0]) > t["stillWindowMs"]:
                    continue
                total += 1
                if any(math.hypot((fx - gx) * W, (fy - gy) * H) < t["stillRadius"] * W for gx, gy in feet[k]):
                    hits += 1
            still = total > 0 and hits >= t["stillShare"] * total
            if not still:
                keep.append(box)
        people.append(keep)
    return people


def enough_people(people: list[list[Box]], t: dict = TUNING_V1) -> bool:
    """Step 8: fewer samples with someone than minPeopleShare → no framing."""
    return not sum(1 for p in people if p) < t["minPeopleShare"] * len(people)


def v1_targets(people: list[list[Box]], W: float, H: float, t: dict = TUNING_V1
               ) -> tuple[list[float | None], list[float | None], list[float | None]]:
    """Steps 3-4: per sample, the motion-weighted centre (x, y) and the 10th-90th percentile x spread; None = nobody."""
    n = len(people)
    cx: list[float | None] = [None] * n
    cy: list[float | None] = [None] * n
    spread: list[float | None] = [None] * n
    previous: list[tuple[float, float]] = []
    for i in range(n):
        centres = [(b[0] + b[2] / 2, b[1] + b[3] / 2) for b in people[i]]
        if not centres:
            previous = []
            continue
        weights = []
        for c in centres:
            moved = min((math.hypot((c[0] - p[0]) * W, (c[1] - p[1]) * H) for p in previous), default=0.0)
            weights.append(1 + min(moved / (t["moveUnit"] * W), t["moveCap"]))
        total = _sum(weights)
        cx[i] = _sum(c[0] * w for c, w in zip(centres, weights)) / total
        cy[i] = _sum(c[1] * w for c, w in zip(centres, weights)) / total
        xs = [c[0] for c in centres]
        spread[i] = _weighted_quantile(xs, weights, t["spreadHigh"]) - _weighted_quantile(xs, weights, t["spreadLow"])
        previous = centres
    return cx, cy, spread


def place(cx: list[float], cy: list[float], widths: list[float], W: float, H: float, aspect: str, zoom: bool,
          t: dict = TUNING_V1) -> list[Rect]:
    """Steps 6-7 (placement): rect of the aspect around each centre, lifted, clamped inside the video."""
    ratio = RATIO[aspect]
    out = []
    for i in range(len(cx)):
        w = widths[i] if zoom else min(1, ratio * H / W)
        h = w * W / (ratio * H)
        if h > 1:
            h = 1
            w = ratio * H / W
        left = min(max(cx[i] - w / 2, 0), 1 - w)
        top = min(max(cy[i] - t["lift"] * h - h / 2, 0), 1 - h)
        out.append((left, top, w, h))
    return out


def v1_rects(samples: list[tuple[float, list[Box]]], W: float, H: float, aspect: str, zoom: bool,
             max_zoom: float = 1.5, t: dict = TUNING_V1) -> list[Rect] | None:
    """FocusPath.compute: one crop rect per sample, or None when too few samples have people."""
    n = len(samples)
    if n == 0 or W <= 0 or H <= 0:
        return None
    step = 100 if n < 2 else (samples[-1][0] - samples[0][0]) / (n - 1)
    people = filter_people(samples, W, H, t)
    if not enough_people(people, t):
        return None
    cx, cy, spread = v1_targets(people, W, H, t)

    x = gaussian(fill(cx), t["sigmaXMs"] / step)  # 5. smoothing with look-ahead, then the pan limit
    y = gaussian(fill(cy), t["sigmaYMs"] / step)
    x = list(x)
    limit = t["maxPanPerSecond"] * step / 1000
    for i in range(1, max(n, 1)):
        x[i] = x[i - 1] + min(max(x[i] - x[i - 1], -limit), limit)

    if zoom:  # 6. size
        widths = gaussian([min(max(v * t["spreadScale"] + t["spreadMargin"], 1 / max_zoom), 1) for v in fill(spread)],
                          t["sigmaSizeMs"] / step)
    else:
        widths = [1.0] * n
    return place(x, y, widths, W, H, aspect, zoom, t)
