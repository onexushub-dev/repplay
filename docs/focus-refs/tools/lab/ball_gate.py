#!/usr/bin/env python3
"""Modo Foco lab, test 15 (2026-11-05): when is a clip good enough for the ball framing?

Victor: keep today's Modo Foco (players) for every clip and offer the ball framing only on clips where the ball is
tracked well. This script lists, per clip, the signals the phone has after the two passes (no ground truth) next to
the ground truth where the ball is labelled, to choose a threshold.

Signals (from the pass-1 and pass-2 tracks, round-6 filters of hybrid.py):
- mode: share of the clip in ball mode
- trusted: share of the frames with a trusted ball (pass 2)
- dens: share of the ball-mode frames that have a trusted ball (the rest are bridged gaps)
- agree: share of pass 2's trusted frames where pass 1 also has a trusted ball within 3% of the long side
- seg: number of ball segments and their median length (s)
- speed: median speed of the trusted ball between consecutive frames in ball mode, long sides per second; slow: share
  of those steps under 0.02 long sides per second (a ball held, lying, or something else tracked)
Proposed rule (test 15, round 2 after the validation clips): ball framing for the clip when mode >= 50%, speed >= 0.10,
slow <= 15% and dens >= 50%; else today's framing. Meant for the fused track (`low_fps.py fuse`: pass 2 where trusted,
else pass 1), e.g. --p2 edgetam-fuse5.
Ground truth (labelled clips): prec = share of the labelled balls during ball mode that the trusted ball hits (within
2% of the long side, the lab's radius); cover = share of all labelled balls that are hit in ball mode.

    cd docs/focus-refs && python3 tools/lab/ball_gate.py [--p1 edgetam-5fps --p2 edgetam-roi40b5]
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import evaluate as ev  # noqa: E402
import hybrid as hb  # noqa: E402

ONECLICK = os.path.join(ev.ROOT, "lab", "tests", "oneclick")
MODE_MIN, SPEED_MIN, SLOW_MAX, DENS_MIN = 0.5, 0.10, 0.15, 0.5  # the proposed rule (round 2)
CLIPS = ("yt-basket-04", "yt-bt-06", "bt-wa-1028", "volei-app-1102", "basket-app-1031-a", "basket-app-1031-b",
         "basket-v-01", "bt-E5003B6B", "bt-0AE39B33", "bt-rz-1105-a", "bt-rz-1105-b", "bt-rz-1105-v",
         "basket-rp-1105-h", "basket-rp-1105-v-a", "basket-rp-1105-v-b")


def signals(name, p1, p2):
    meta = ev.clip_meta(name)
    truth = ev.load_truth(name)
    n, size, sport = meta["count"], truth["size"], meta["sport"]
    L = max(size)
    t2 = hb.trusted(json.load(open(os.path.join(ONECLICK, f"{name}.ball.{p2}.json")))["pred_one"], n, size, sport)
    t1 = hb.trusted(json.load(open(os.path.join(ONECLICK, f"{name}.ball.{p1}.json")))["pred_one"], n, size, sport)
    segs = hb.ball_mode(t2, size)
    mode = np.zeros(n, bool)
    for a, b in segs:
        mode[a:b + 1] = True
    tr = [p is not None for p in t2]
    agree_n = sum(1 for k in range(n) if t2[k] is not None and t1[k] is not None
                  and math.hypot((t2[k][0] - t1[k][0]) * size[0], (t2[k][1] - t1[k][1]) * size[1]) <= 0.03 * L)
    out = {"clip": name, "sport": sport, "secs": n / 10, "mode": mode.mean(), "trusted": np.mean(tr),
           "dens": (sum(1 for k in range(n) if mode[k] and tr[k]) / mode.sum()) if mode.sum() else None,
           "agree": agree_n / sum(tr) if sum(tr) else None, "segs": len(segs),
           "seg_med": float(np.median([(b - a + 1) / 10 for a, b in segs])) if segs else 0.0}
    steps = [math.hypot((t2[k][0] - t2[k - 1][0]) * size[0], (t2[k][1] - t2[k - 1][1]) * size[1]) / L * 10
             for k in range(1, n) if mode[k] and t2[k] is not None and t2[k - 1] is not None]
    out["speed"] = float(np.median(steps)) if steps else None
    out["slow"] = float(np.mean([v < 0.02 for v in steps])) if steps else None
    out["eligible"] = bool(out["mode"] >= MODE_MIN and out["speed"] is not None and out["speed"] >= SPEED_MIN
                           and out["slow"] <= SLOW_MAX and out["dens"] is not None and out["dens"] >= DENS_MIN)
    R = ev.radius_px(size)
    pts = [(t // 100, v) for t, v in truth["samples"].items() if isinstance(v, tuple) and t // 100 < n]
    if len(pts) >= 10:
        in_mode = [(k, v) for k, v in pts if mode[k]]
        with_ball = [(k, v) for k, v in in_mode if t2[k] is not None]
        hits = sum(1 for k, v in with_ball if ev._dist_px(t2[k], v, size) <= R)
        out.update(points=len(pts), prec=hits / len(with_ball) if with_ball else None, cover=hits / len(pts))
    return out


def speed_text(r):
    return "—" if r["speed"] is None else f"{r['speed']:.2f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--p1", default="edgetam-5fps")
    ap.add_argument("--p2", default="edgetam-roi40b5")
    ap.add_argument("--name", default="gate")
    ap.add_argument("clips", nargs="*")
    a = ap.parse_args()
    rows = [signals(c, a.p1, a.p2) for c in (a.clips or CLIPS)]
    f = lambda v, pct=True: "—" if v is None else (f"{100 * v:.0f}%" if pct else f"{v:.1f}")  # noqa: E731
    lines = [f"Tracks: pass 1 {a.p1}, pass 2 {a.p2}", "",
             "| Clip | s | mode | trusted | dens | agree | segments (median s) | speed | slow | **ball framing?** "
             "| labelled | prec | cover |",
             "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        lines.append(f"| {r['clip']} | {r['secs']:.0f} | {f(r['mode'])} | {f(r['trusted'])} | {f(r['dens'])} "
                     f"| {f(r['agree'])} | {r['segs']} ({r['seg_med']:.1f}) | {speed_text(r)} "
                     f"| {f(r['slow'])} | {'**sim**' if r['eligible'] else 'não'} | {r.get('points', '—')} "
                     f"| {f(r.get('prec'))} | {f(r.get('cover'))} |")
    text = "\n".join(lines) + "\n"
    print(text)
    os.makedirs(os.path.join(ev.ROOT, "lab", "tests", "gate"), exist_ok=True)
    open(os.path.join(ev.ROOT, "lab", "tests", "gate", f"report.{a.name}.md"), "w").write(text)
    json.dump(rows, open(os.path.join(ev.ROOT, "lab", "tests", "gate", f"rows.{a.name}.json"), "w"), default=float)


if __name__ == "__main__":
    main()
