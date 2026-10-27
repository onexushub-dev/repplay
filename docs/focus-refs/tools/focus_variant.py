#!/usr/bin/env python3
"""Recomputes a Modo Foco v1 framing with other tuning values, to compare them on the same clip.

A line-by-line port of ReplayCore `FocusPath.compute` (app/modules/replay-camera/ios/Core/Sources/ReplayCore/
FocusPath.swift) and of `FocusGrid.samples`. Keep it in step with the Swift when either changes; `--check` compares
the standard tuning against the focus file the app wrote for the same clip.

People come from `vision-probe.swift` (its `full` boxes: the same Vision request and confidence the app uses).

Usage:
  python3 focus_variant.py PEOPLE.json APP.focus.json --out OUT.focus.json [--set name=value ...] [--check]
    --set spreadScale=1.1 --set spreadMargin=0.1 --set sigmaXMs=800 --set maxZoom=2
"""
import argparse
import json
import math
import sys

STANDARD = {
    "farShare": 0.4, "tallestCount": 10,
    "stillRadius": 0.012, "stillShare": 0.8, "stillWindowMs": 3000.0,
    "moveUnit": 0.01, "moveCap": 4.0,
    "spreadLow": 0.1, "spreadHigh": 0.9,
    "sigmaXMs": 600.0, "sigmaYMs": 800.0, "sigmaSizeMs": 1200.0,
    "maxPanPerSecond": 0.35,
    "spreadScale": 1.3, "spreadMargin": 0.15,
    "lift": 0.0,
    "minPeopleShare": 0.2,
    # Since 2026-10-27 (v13): someone who vanished counts where last seen for holdMs; the crop width is the widest
    # needed within ± widthHoldMs.
    "holdMs": 1000.0,
    "widthHoldMs": 1000.0,
    # Not in FocusTuning: FocusPath.compute's `maxZoom` argument (FocusAnalyzer passes the default).
    "maxZoom": 1.5,
    # Experiments (not in the app; 0 = the app's behaviour):
    # spreadFromEdges=1: the spread runs from the people's left edges to their right edges, not centre to centre.
    "spreadFromEdges": 0.0,
    # centerOnSpan=0..1: blend of the target x from the weighted mean (0) to the middle of the spread (1).
    "centerOnSpan": 0.0,
}


def median(values):
    s = sorted(values)
    n = len(s)
    return s[n // 2] if n % 2 == 1 else (s[n // 2 - 1] + s[n // 2]) / 2


def weighted_quantile(values, weights, q):
    order = sorted(range(len(values)), key=lambda i: values[i])
    total = sum(weights)
    acc = 0.0
    for i in order:
        acc += weights[i]
        if acc / total >= q:
            return values[i]
    return values[order[-1]]


def fill(values):
    known = [i for i, v in enumerate(values) if v is not None]
    if not known:
        return [0.5] * len(values)
    first, last = known[0], known[-1]
    out = [0.0] * len(values)
    k = 0
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


def gaussian(values, sigma):
    if sigma <= 0 or len(values) < 2:
        return list(values)
    r = math.ceil(3 * sigma)
    kernel = [math.exp(-0.5 * (j / sigma) ** 2) for j in range(-r, r + 1)]
    norm = sum(kernel)
    n = len(values)
    out = []
    for i in range(n):
        acc = 0.0
        for j, k in enumerate(kernel):
            acc += values[min(max(i + j - r, 0), n - 1)] * k
        out.append(acc / norm)
    return out


def compute(samples, W, H, aspect, zoom, t):
    """FocusPath.compute: samples = [(tMs, [(x, y, w, h), ...])]; returns [(x, y, w, h)] or None."""
    n = len(samples)
    if n == 0:
        return None
    step = 100 if n < 2 else (samples[-1][0] - samples[0][0]) / (n - 1)

    # 1. Far people out.
    near = []
    for _, boxes in samples:
        if not boxes:
            near.append([])
            continue
        tallest = sorted((b[3] for b in boxes), reverse=True)[: t["tallestCount"]]
        ref = median(tallest)
        near.append([b for b in boxes if b[3] >= t["farShare"] * ref])
    # 2. Still people out.
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
                if any(math.hypot((fx - ox) * W, (fy - oy) * H) < t["stillRadius"] * W for ox, oy in feet[k]):
                    hits += 1
            still = total > 0 and hits >= t["stillShare"] * total
            if not still:
                keep.append(box)
        people.append(keep)
    if sum(1 for p in people if p) < t["minPeopleShare"] * n:
        return None
    if t["holdMs"] > 0:
        held = [list(p) for p in people]
        memory = []  # (box, last seen tMs)
        for i in range(n):
            now = samples[i][0]
            current = people[i]
            centres = [(b[0] + b[2] / 2, b[1] + b[3] / 2) for b in current]
            kept = []
            for box, seen in memory:
                if now - seen > t["holdMs"]:
                    continue
                c = (box[0] + box[2] / 2, box[1] + box[3] / 2)
                if any(math.hypot((c[0] - o[0]) * W, (c[1] - o[1]) * H) < max(box[2] * W, box[3] * H) for o in centres):
                    continue  # found again (or someone is there): the fresh box counts
                kept.append((box, seen))
                held[i].append(box)
            memory = kept + [(b, now) for b in current]
        people = held

    # 3–4. Weights and the target per sample.
    cx, cy, spread = [None] * n, [None] * n, [None] * n
    previous = []
    for i in range(n):
        centres = [(b[0] + b[2] / 2, b[1] + b[3] / 2) for b in people[i]]
        if not centres:
            previous = []
            continue
        weights = []
        for c in centres:
            moved = min((math.hypot((c[0] - p[0]) * W, (c[1] - p[1]) * H) for p in previous), default=0)
            weights.append(1 + min(moved / (t["moveUnit"] * W), t["moveCap"]))
        total = sum(weights)
        cx[i] = sum(c[0] * w for c, w in zip(centres, weights)) / total
        cy[i] = sum(c[1] * w for c, w in zip(centres, weights)) / total
        xs = [c[0] for c in centres]
        if t["spreadFromEdges"]:
            low = weighted_quantile([b[0] for b in people[i]], weights, t["spreadLow"])
            high = weighted_quantile([b[0] + b[2] for b in people[i]], weights, t["spreadHigh"])
        else:
            low = weighted_quantile(xs, weights, t["spreadLow"])
            high = weighted_quantile(xs, weights, t["spreadHigh"])
        spread[i] = high - low
        if t["centerOnSpan"]:
            cx[i] = cx[i] * (1 - t["centerOnSpan"]) + (low + high) / 2 * t["centerOnSpan"]
        previous = centres

    # 5. Smooth with look-ahead, then limit the pan speed.
    x = gaussian(fill(cx), t["sigmaXMs"] / step)
    y = gaussian(fill(cy), t["sigmaYMs"] / step)
    limit = t["maxPanPerSecond"] * step / 1000
    for i in range(1, max(n, 1)):
        x[i] = x[i - 1] + min(max(x[i] - x[i - 1], -limit), limit)

    # 6–7. Size and placement.
    max_zoom = t["maxZoom"]
    if zoom:
        wanted = [min(max(s * t["spreadScale"] + t["spreadMargin"], 1 / max_zoom), 1) for s in fill(spread)]
        if t["widthHoldMs"] > 0:
            k = int(math.floor(t["widthHoldMs"] / step + 0.5))  # Swift .rounded()
            wanted = [max(wanted[max(0, i - k):i + k + 1]) for i in range(n)]
        widths = gaussian(wanted, t["sigmaSizeMs"] / step)
    else:
        widths = [1.0] * n
    ratio = 16 / 9 if aspect == "landscape" else 9 / 16
    out = []
    for i in range(n):
        w = widths[i] if zoom else min(1, ratio * H / W)
        h = w * W / (ratio * H)
        if h > 1:
            h = 1
            w = ratio * H / W
        left = min(max(x[i] - w / 2, 0), 1 - w)
        top = min(max(y[i] - t["lift"] * h - h / 2, 0), 1 - h)
        out.append((left, top, w, h))
    return out


def grid(frames, start_ms, end_ms, step_ms):
    """FocusGrid.samples: one sample per tick, the first frame inside the tick's step, else the people last seen."""
    if not frames or step_ms <= 0:
        return []
    stop = min(end_ms, frames[-1][0] + step_ms / 2)
    out = []
    i = 0
    seen = frames[0][1]
    tick = start_ms
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


def r4(v):
    return round(v * 10000) / 10000


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("people")
    ap.add_argument("app_focus", help="the clip's focus file from the app (its startMs, size and, for --check, rows), "
                                      "or the video itself for a clip the app never analysed (the whole video)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--set", action="append", default=[], help="tuning value, e.g. spreadScale=1.1 or maxZoom=2")
    ap.add_argument("--check", action="store_true", help="compare with the app's file")
    args = ap.parse_args()

    tuning = dict(STANDARD)
    for item in args.set:
        name, _, value = item.partition("=")
        if name not in tuning:
            sys.exit(f"unknown tuning value {name}; known: {', '.join(tuning)}")
        tuning[name] = type(tuning[name])(float(value)) if isinstance(tuning[name], float) else int(value)

    probe = json.load(open(args.people))
    if args.app_focus.endswith(".json"):
        app = json.load(open(args.app_focus))
        W, H = app["size"]
        start_ms, step_ms = app["startMs"], app["stepMs"]
        rows = len(app["landscape"]) or len(app["portrait"])
        end_ms = start_ms + rows * step_ms
    else:
        # A video the app never saw: the whole of it, on the app's 100 ms grid.
        import subprocess
        info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_streams", "-of",
                                          "json", args.app_focus], capture_output=True, text=True, check=True).stdout)
        st = info["streams"][0]
        W, H = st["width"], st["height"]
        rot = int(st.get("tags", {}).get("rotate", 0))
        for side in st.get("side_data_list", []):
            rot = int(side.get("rotation", rot))
        if abs(rot) % 180 == 90:
            W, H = H, W
        start_ms, step_ms = 0.0, 100.0
        end_ms = probe["samples"][-1]["t"] + step_ms
        app = {"size": [W, H], "landscape": [], "portrait": []}
        if args.check:
            sys.exit("--check needs the app's focus file")
    frames = [(s["t"], [tuple(b[:4]) for b in s["full"]]) for s in probe["samples"]]
    # The app reads only the cut (AVAssetReader timeRange), so no frame before startMs.
    frames = [f for f in frames if start_ms - 0.5 <= f[0] < end_ms]
    samples = grid(frames, start_ms, end_ms, step_ms)

    main_aspect = "landscape" if W >= H else "portrait"
    other = "portrait" if main_aspect == "landscape" else "landscape"
    main_rects = compute(samples, W, H, main_aspect, True, tuning)
    other_rects = None if main_rects is None else compute(samples, W, H, other, False, tuning)
    out = {"v": 1, "stepMs": step_ms, "startMs": start_ms, "size": [W, H],
           main_aspect: [[r4(v) for v in r] for r in (main_rects or [])],
           other: [[r4(v) for v in r] for r in (other_rects or [])],
           "tuning": {k: v for k, v in tuning.items() if v != STANDARD[k]}}
    json.dump(out, open(args.out, "w"))

    rects = out[main_aspect]
    if not rects:
        print("no framing (too few people)")
        return
    zooms = [1 / r[2] if main_aspect == "portrait" else 1 / r[3] for r in rects]
    cap = 1 / max(1 / tuning["maxZoom"], 1e-9)
    print(f"{args.out}: zoom median {median(zooms):.2f}x, min {min(zooms):.2f}x, max {max(zooms):.2f}x, "
          f"at the cap {100 * sum(z >= cap * 0.97 for z in zooms) / len(zooms):.0f}%")
    if args.check:
        ref = app[main_aspect]
        n = min(len(ref), len(rects))
        diffs = [max(abs(a - b) for a, b in zip(ref[i], rects[i])) for i in range(n)]
        print(f"vs app: rows {len(ref)} / {len(rects)}, mean diff {sum(diffs) / n:.4f}, max diff {max(diffs):.4f} "
              f"(share of the frame)")


if __name__ == "__main__":
    main()
