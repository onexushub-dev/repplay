#!/usr/bin/env python3
"""Modo Foco lab, test 4: classical ball detection for a FIXED camera (no model, no training).

Per clip, over the labelled window of the original video:
1. Background subtraction (OpenCV MOG2) at ~30 fps (every 2nd frame of 60 fps video), 960 px long side: what moves.
2. Ball candidates at each 200 ms tick: small compact moving blobs (area, fill and aspect limits) that also appear in
   the frame before and the frame after on a near-straight line (the 3-frame idea behind TrackNet; noise does not),
   and are alone (kicked sand and compression noise come as a crowd of small blobs).
3. Scores: + orange colour for basketball; - inside a person box (Vision boxes already computed for these clips, when
   present; limbs and shoes move like a ball).
4. Track: offline best chains of candidates (dynamic programming over the whole clip; a chain may skip up to 3 ticks),
   kept while a chain is worth more than a threshold. One ball or none per tick.

Prints, per clip: ceiling (any candidate on the ball), candidates per frame, and the track's recall / precision / false
alarms (evaluate.py). Writes lab/tests/classical/<clip>.json (candidates and track) for later framing tests.

    cd docs/focus-refs && python3 tools/lab/classical.py [clip ...]       # needs opencv-python + numpy
"""

from __future__ import annotations

import json
import math
import os
import sys
import time

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import evaluate as ev  # noqa: E402

OUT = os.path.join(ev.ROOT, "lab", "tests", "classical")

# Vision people boxes already computed on these videos (docs/focus-refs/renders, whole video, t in ms of the video).
PEOPLE = {
    "bt-0AE39B33": "renders/0AE39B33.people.json",
    "bt-E5003B6B": "renders/E5003B6B.people.json",
    "bt-3B5E767B": "renders/3B5E767B.people.json",
    "bt-FE553F05": "renders/FE553F05.people.json",
    "basket-v-01": "renders/tiles/basket-v.people.json",
    "basket-h-side-01": "renders/tiles/basket-h-side.people.json",
    "basket-h-backlight-02": "renders/tiles/basket-h-backlight.people.json",
    "yt-basket-04": "renders/yt-FVUuK2ZGQtw-1m.people.json",
    "yt-bt-06": "renders/yt-g4WYPBh4UNM.people.json",
}

P = dict(long_side=960, history=150, var_threshold=24,
         r_min_px=1.5, r_max_frac=0.025, fill_min=0.35, aspect_max=3.5,
         move_min_px=1.5, move_max_frac=0.06, bend_max=0.6, bend_cost=0.5, crowd_radius_frac=0.04, crowd_max=1,
         in_person=-0.6, orange=0.8, gap_max=3, gate_frac_per_tick=0.16, chain_min=1.5, node=1.0, miss_cost=0.35)


def people_at(name: str):
    rel = PEOPLE.get(name)
    if not rel or not os.path.exists(os.path.join(ev.ROOT, rel)):
        return None
    with open(os.path.join(ev.ROOT, rel)) as f:
        d = json.load(f)
    return {int(s["t"]): s["full"] for s in d["samples"]}


def nearest_people(people, t_video_ms):
    if not people:
        return []
    k = min(people, key=lambda x: abs(x - t_video_ms)) if len(people) < 50 else 100 * round(t_video_ms / 100)
    return people.get(k, [])


def orange_score(hsv, mask):
    h, s, v = [c[mask] for c in cv2.split(hsv)]
    if len(h) == 0:
        return 0.0
    ok = ((h >= 3) & (h <= 22) & (s >= 80) & (v >= 60)).mean()
    return float(ok)


def blobs_of(fg, small, sport, W, H):
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    fg = cv2.morphologyEx((fg > 127).astype(np.uint8), cv2.MORPH_OPEN, kernel)
    n, lab, stats, cent = cv2.connectedComponentsWithStats(fg, connectivity=8)
    r_max = P["r_max_frac"] * max(W, H)
    a_min, a_max = math.pi * P["r_min_px"] ** 2, math.pi * r_max ** 2
    out = []
    hsv = None
    for k in range(1, n):
        x, y, w, h, a = stats[k]
        if a < a_min or a > a_max:
            continue
        if a / float(w * h) < P["fill_min"] or max(w, h) / max(1, min(w, h)) > P["aspect_max"]:
            continue
        col = 0.0
        if sport == "basquete":
            if hsv is None:
                hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
            col = orange_score(hsv[y:y + h, x:x + w], lab[y:y + h, x:x + w] == k)
        out.append((cent[k][0], cent[k][1], int(a), col))  # pixels at the working size
    return out


def triplet(prev, cur, nxt, long_side):
    """Candidates of `cur` that move consistently: a blob in the frame before and one after, on a near-straight line."""
    dmin, dmax = P["move_min_px"], P["move_max_frac"] * long_side
    keep = []
    for c in cur:
        best = None
        for p in prev:
            d1 = math.hypot(c[0] - p[0], c[1] - p[1])
            if not (dmin <= d1 <= dmax):
                continue
            for q in nxt:
                d2 = math.hypot(q[0] - c[0], q[1] - c[1])
                if not (dmin <= d2 <= dmax):
                    continue
                ax, ay = q[0] - 2 * c[0] + p[0], q[1] - 2 * c[1] + p[1]  # acceleration: small for a flying ball
                bend = math.hypot(ax, ay) / max(d1, d2, 2.0)
                if bend <= P["bend_max"] and (best is None or bend < best):
                    best = bend
        if best is not None:
            keep.append((c, best))
    return keep


def candidates(name: str, truth: dict):
    meta = ev.clip_meta(name)
    video = os.path.join(ev.ROOT, meta["video"])
    start, dur = meta["startMs"], meta["durMs"]
    sport = meta["sport"]
    people = people_at(name)
    cap = cv2.VideoCapture(video)
    warm = min(1000, start)  # warm up the background model on the second before the window
    cap.set(cv2.CAP_PROP_POS_MSEC, start - warm)
    mog = cv2.createBackgroundSubtractorMOG2(history=P["history"], varThreshold=P["var_threshold"], detectShadows=False)
    frames = []  # (ms in window, blobs) at ~30 fps
    i, scale, W, H = 0, None, 0, 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        pos = cap.get(cv2.CAP_PROP_POS_MSEC) - start
        if pos > dur + 100:
            break
        i += 1
        if scale is None:
            h0, w0 = frame.shape[:2]
            scale = P["long_side"] / max(h0, w0)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        if fps > 40 and i % 2:
            continue
        small = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        fg = mog.apply(small)
        H, W = fg.shape
        if pos >= -100:
            frames.append((pos, blobs_of(fg, small, sport, W, H)))
    cap.release()
    times = [f[0] for f in frames]
    out = {}
    for t in range(0, dur, ev.GRID_MS):
        k = min(range(len(times)), key=lambda j: abs(times[j] - t))
        if k == 0 or k == len(frames) - 1:
            out[t] = []
            continue
        boxes = nearest_people(people, start + t)
        cs = []
        moving = triplet(frames[k - 1][1], frames[k][1], frames[k + 1][1], max(W, H))
        near = P["crowd_radius_frac"] * max(W, H)
        for c, bend in moving:
            crowd = sum(1 for o, _ in moving if o is not c and math.hypot(o[0] - c[0], o[1] - c[1]) <= near)
            if crowd > P["crowd_max"]:
                continue  # kicked sand, compression noise: many small blobs moving together; the ball is alone
            cx, cy = c[0] / W, c[1] / H
            score = P["node"] + P["orange"] * c[3] - P["bend_cost"] * bend
            for b in boxes:
                if b[0] <= cx <= b[0] + b[2] and b[1] <= cy <= b[1] + b[3]:
                    score += P["in_person"]
                    break
            cs.append((round(cx, 4), round(cy, 4), round(score, 3), c[2]))
        out[t] = cs
    return out


def track(cands: dict, size) -> dict:
    """Best chains of candidates; one point or None per tick."""
    ticks = sorted(cands)
    gate = P["gate_frac_per_tick"] * max(size)
    used = set()
    pred = {}
    for _round in range(40):
        best = {}  # (ti, j) -> (value, prev)
        top = None
        for ti, t in enumerate(ticks):
            if t in used:
                continue
            for j, c in enumerate(cands[t]):
                v = c[2]
                val, prev = v, None
                for g in range(1, P["gap_max"] + 1):
                    if ti - g < 0:
                        break
                    tp = ticks[ti - g]
                    if tp in used:
                        break
                    for jp, cp in enumerate(cands[tp]):
                        b = best.get((ti - g, jp))
                        if b is None:
                            continue
                        d = math.hypot((c[0] - cp[0]) * size[0], (c[1] - cp[1]) * size[1])
                        if d > gate * g:
                            continue
                        cand = b[0] + v - (d / (gate * g)) ** 2 * 0.5 - P["miss_cost"] * (g - 1)
                        if cand > val:
                            val, prev = cand, (ti - g, jp)
                best[(ti, j)] = (val, prev)
                if top is None or val > top[0]:
                    top = (val, (ti, j))
        if top is None or top[0] < P["chain_min"]:
            break
        node = top[1]
        chain = []
        while node is not None:
            chain.append(node)
            node = best[node][1]
        chain.reverse()
        for (ti, j) in chain:
            t = ticks[ti]
            pred[t] = cands[t][j][:2]
        lo, hi = ticks[chain[0][0]], ticks[chain[-1][0]]
        for t in ticks:
            if lo <= t <= hi:
                used.add(t)
    return pred


def main():
    names = sys.argv[1:] or ev.labelled_clips("ball")
    os.makedirs(OUT, exist_ok=True)
    rows = []
    for name in names:
        truth = ev.load_truth(name)
        t0 = time.time()
        cands = candidates(name, truth)
        pred = track(cands, truth["size"])
        c = ev.score_candidates(truth, {t: [x[:2] for x in v] for t, v in cands.items()})
        s = ev.score_track(truth, pred)
        rows.append((name, c, s, time.time() - t0))
        with open(os.path.join(OUT, f"{name}.json"), "w") as f:
            json.dump({"params": P, "cands": {str(t): v for t, v in cands.items()},
                       "track": {str(t): v for t, v in pred.items()}}, f, separators=(",", ":"))
        print(f"{name:16s} points {s['points']:3d} | ceiling {ev.fmt(c['ceiling'])} cands/frame {c['cands_per_frame']:.1f}"
              f" | track recall {ev.fmt(s['recall'])} precision {ev.fmt(s['precision'])}"
              f" false alarm {ev.fmt(s['false_alarm'])} | {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
