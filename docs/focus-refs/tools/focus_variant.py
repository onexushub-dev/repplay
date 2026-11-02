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
    # activity=1 (2026-10-28): people followed between samples (tracks); "still" and the movement weight measured per
    # track in body heights, not in fixed pixels. The pixel still filter above drops nobody in practice (boxes jitter
    # more than stillRadius and come and go), so the bench and the stands counted as players.
    "activity": 0.0,
    "trackGapMs": 1000.0,     # a track not seen for this long ends
    "trackMatch": 0.7,        # a box joins a track whose last centre is within this many body heights
    "stillBodies": 0.3,       # feet staying within this many body heights over ±activityWindowMs: still
    "activityWindowMs": 6000.0,  # long enough that a player in a ready stance between rallies still counts
    # stillScope=1: only a whole track that stays still for at least spectatorMinMs is left out (the bench, the
    # stands); players who stand still for a while (beach tennis, ready stance) keep counting, with a low weight.
    "stillScope": 1.0,
    "spectatorMinMs": 8000.0,
    # activeSpread=1: the crop width covers the people moving (weight >= activeWeight) when there are any, so the
    # frame closes on the action instead of on everybody; the others still pull the centre a little.
    "activeSpread": 0.0,
    "activeWeight": 2.0,
    "stillMinSeen": 4,        # samples needed in the window to call someone still
    "speedUnit": 0.6,         # body heights per second that add 1 to the weight (capped at moveCap)
    "speedWindowMs": 500.0,
    # lance=1 (experiment, 2026-10-28, needs activity=1): the frame closes on the play instead of on everybody: the
    # lanceTop fastest people (weight >= lanceMinWeight) set the centre and the width (from their boxes' edges), with
    # lanceLeadMs of look-ahead (the analysis runs after the clip is saved, so it knows what comes next). With nobody
    # that fast, the frame opens back to everybody (the activeSpread rule). Meant with a higher maxZoom (2).
    # zoomIn (FocusTuning.zoomIn, v15 = 1.1 since 2026-10-28): the zoomed rect made this much closer once fitted.
    "zoomIn": 1.0,
    "lance": 0.0,
    "lanceTop": 2,
    "lanceMinWeight": 2.5,
    "lanceLeadMs": 800.0,
}


def tracks_of(samples, W, H, t):
    """Greedy tracks over the samples: [(sample index, box)] lists. Distances in pixels, scaled by body height."""
    tracks = []  # each: {"items": [(i, box)], "last": (cx, cy, h), "seen": tMs}
    for i, (now, boxes) in enumerate(samples):
        open_ = [k for k, tr in enumerate(tracks) if now - tr["seen"] <= t["trackGapMs"]]
        pairs = []
        for j, b in enumerate(boxes):
            c = ((b[0] + b[2] / 2) * W, (b[1] + b[3] / 2) * H)
            for k in open_:
                lx, ly, lh = tracks[k]["last"]
                d = math.hypot(c[0] - lx, c[1] - ly) / max(lh, b[3] * H, 1e-9)
                if d <= t["trackMatch"]:
                    pairs.append((d, j, k))
        used_b, used_t = set(), set()
        for d, j, k in sorted(pairs):
            if j in used_b or k in used_t:
                continue
            used_b.add(j); used_t.add(k)
            b = boxes[j]
            tracks[k]["items"].append((i, b))
            tracks[k]["last"] = ((b[0] + b[2] / 2) * W, (b[1] + b[3] / 2) * H, b[3] * H)
            tracks[k]["seen"] = now
        for j, b in enumerate(boxes):
            if j not in used_b:
                tracks.append({"items": [(i, b)], "last": ((b[0] + b[2] / 2) * W, (b[1] + b[3] / 2) * H, b[3] * H), "seen": now})
    return [tr["items"] for tr in tracks]


def activity_people(samples, W, H, t):
    """Per sample: the boxes of people not still, each with its movement weight (activity=1)."""
    n = len(samples)
    out = [[] for _ in range(n)]
    for items in tracks_of(samples, W, H, t):
        times = [samples[i][0] for i, _ in items]
        feet = [((b[0] + b[2] / 2) * W, (b[1] + b[3]) * H) for _, b in items]
        heights = [b[3] * H for _, b in items]
        if t["stillScope"]:
            body = median(heights)
            mx = median([f[0] for f in feet]); my = median([f[1] for f in feet])
            reach = max(math.hypot(f[0] - mx, f[1] - my) for f in feet) / max(body, 1e-9)
            if times[-1] - times[0] >= t["spectatorMinMs"] and reach < t["stillBodies"]:
                continue  # still for the whole time it was seen: not playing
        for a, (i, b) in enumerate(items):
            near = [q for q in range(len(items)) if abs(times[q] - times[a]) <= t["activityWindowMs"]]
            body = median([heights[q] for q in near])
            if not t["stillScope"] and len(near) >= t["stillMinSeen"]:
                mx = median([feet[q][0] for q in near]); my = median([feet[q][1] for q in near])
                reach = max(math.hypot(feet[q][0] - mx, feet[q][1] - my) for q in near) / max(body, 1e-9)
                if reach < t["stillBodies"]:
                    continue  # still: the bench, the stands, someone waiting
            # speed over ±speedWindowMs, in body heights per second
            win = [q for q in range(len(items)) if abs(times[q] - times[a]) <= t["speedWindowMs"]]
            q0, q1 = min(win, key=lambda q: times[q]), max(win, key=lambda q: times[q])
            dt = (times[q1] - times[q0]) / 1000
            speed = math.hypot(feet[q1][0] - feet[q0][0], feet[q1][1] - feet[q0][1]) / max(body, 1e-9) / dt if dt > 0 else 0
            out[i].append((b, 1 + min(speed / t["speedUnit"], t["moveCap"])))
    return out


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
    weights_by_box = None
    if t["activity"]:
        act = activity_people([(samples[i][0], near[i]) for i in range(n)], W, H, t)
        people = [[b for b, _ in a] for a in act]
        weights_by_box = [{id(b): w for b, w in a} for a in act]
    feet = [[(b[0] + b[2] / 2, b[1] + b[3]) for b in bs] for bs in near]
    if t["activity"]:
        pass
    else:
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
        if weights_by_box is not None:
            # activity=1: each person's own speed (held boxes of people gone a moment: 1)
            weights = [weights_by_box[i].get(id(b), 1.0) for b in people[i]]
        else:
          for c in centres:
            moved = min((math.hypot((c[0] - p[0]) * W, (c[1] - p[1]) * H) for p in previous), default=0)
            weights.append(1 + min(moved / (t["moveUnit"] * W), t["moveCap"]))
        total = sum(weights)
        cx[i] = sum(c[0] * w for c, w in zip(centres, weights)) / total
        cy[i] = sum(c[1] * w for c, w in zip(centres, weights)) / total
        xs = [c[0] for c in centres]
        if weights_by_box is not None and t["lance"]:
            fast = sorted((k for k, w in enumerate(weights) if w >= t["lanceMinWeight"]), key=lambda k: -weights[k])
            fast = fast[: int(t["lanceTop"])]
            if fast:
                wsum = sum(weights[k] for k in fast)
                cx[i] = sum(centres[k][0] * weights[k] for k in fast) / wsum
                cy[i] = sum(centres[k][1] * weights[k] for k in fast) / wsum
                boxes = [people[i][k] for k in fast]
                spread[i] = max(b[0] + b[2] for b in boxes) - min(b[0] for b in boxes)
                previous = centres
                continue
        if weights_by_box is not None and t["activeSpread"]:
            active = [k for k, w in enumerate(weights) if w >= t["activeWeight"]]
            if active:
                xs_a = [xs[k] for k in active]
                spread[i] = max(xs_a) - min(xs_a)
                previous = centres
                continue
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

    if t["lance"] and t["lanceLeadMs"] > 0:
        lead = int(round(t["lanceLeadMs"] / step))
        cx, cy, spread = ([v[min(i + lead, n - 1)] for i in range(n)] for v in (cx, cy, spread))

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
        if zoom and t["zoomIn"] > 1:
            w /= t["zoomIn"]
            h /= t["zoomIn"]
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
    ap.add_argument("--preset", choices=["v13", "acao"], default="v13",
                    help="acao: FocusTuning.action (the app since 2026-10-28) = --set activity=1 --set activeSpread=1 --set zoomIn=1.1")
    ap.add_argument("--boxes", choices=["full", "tiled"], default="full",
                    help="people from the whole-frame detector (the app today) or the whole frame + tiles "
                         "(vision-probe.swift from 2026-10-28 on; older people files have broken tiled boxes)")
    args = ap.parse_args()

    tuning = dict(STANDARD)
    if args.preset == "acao":
        tuning.update(activity=1.0, activeSpread=1.0, zoomIn=1.1)
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
    if args.boxes == "tiled" and not probe.get("summary", {}).get("tilesFixed"):
        sys.exit("this people file was made before the tile fix (2026-10-28): re-run vision-probe.swift")
    frames = [(s["t"], [tuple(b[:4]) for b in s[args.boxes]]) for s in probe["samples"]]
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
