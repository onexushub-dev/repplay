#!/usr/bin/env python3
"""Modo Foco lab, test 3 scoring: Vision trajectories (lab/tests/vision/<clip>.json from vision-traj.swift).

At each 200 ms tick, the candidates are the newest points of the trajectories Vision reports at that frame.
- ceiling: any candidate on the ball (what a perfect filter could reach)
- longest: pick the trajectory that has lasted longest (a thrown ball keeps one long trajectory; limbs make short ones)
- track:   the same offline chain search as the classical test, scoring trajectories by length
Both point mappings are scored ("upright" = transform applied, "raw" = Vision's point as-is) and the better one is
reported, since how VNVideoProcessor orients rotated phone videos is not documented.

    cd docs/focus-refs && python3 tools/lab/vision_eval.py
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import evaluate as ev  # noqa: E402

IN = os.path.join(ev.ROOT, "lab", "tests", "vision")


def per_tick(rows, dur, fps, key):
    half = 1000.0 / max(fps, 1) * 0.6
    by = {}
    for r in rows:
        if key == "raw":
            xy = (r["raw"][0], 1 - r["raw"][1])
        else:
            xy = tuple(r["xy"])
        by.setdefault(int(round(r["t"] / (1000.0 / max(fps, 1)))), []).append((xy, r))
    out = {}
    step = 1000.0 / max(fps, 1)
    for t in range(0, dur, ev.GRID_MS):
        k = int(round(t / step))
        out[t] = [(xy, r) for xy, r in by.get(k, []) if abs(r["t"] - t) <= half]
    return out


def main():
    import classical  # reuse the chain search (needs opencv only for import; numpy)

    names = [n for n in ev.labelled_clips("ball") if os.path.exists(os.path.join(IN, f"{n}.json"))]
    if not names:
        raise SystemExit("no Vision results yet: run tools/lab/mac-tests.sh on the Mac")
    lines = ["| Clip | Points | Mapping | Cands/frame | Ceiling | Longest: recall | precision | false alarm | Track: recall | precision | false alarm |",
             "|---|---|---|---|---|---|---|---|---|---|---|"]
    for name in names:
        truth = ev.load_truth(name)
        with open(os.path.join(IN, f"{name}.json")) as f:
            d = json.load(f)
        dur = ev.clip_meta(name)["durMs"]
        best = None
        for key in ("upright", "raw"):
            ticks = per_tick(d["rows"], dur, d["fps"], key)
            c = ev.score_candidates(truth, {t: [xy for xy, _ in v] for t, v in ticks.items()})
            if best is None or (c["ceiling"] or 0) > (best[1]["ceiling"] or 0):
                best = (key, c, ticks)
        key, c, ticks = best
        longest = {}
        for t, v in ticks.items():
            if v:
                xy, _r = max(v, key=lambda e: (e[1]["n"], e[1]["t"] - e[1]["t0"], e[1]["conf"]))
                longest[t] = xy
        sl = ev.score_track(truth, longest)
        cands = {t: [(xy[0], xy[1], 1.0 + min(r["n"], 30) / 30.0, 0) for xy, r in v] for t, v in ticks.items()}
        st = ev.score_track(truth, classical.track(cands, truth["size"]))
        line = (f"| {name} | {sl['points']} | {key} | {c['cands_per_frame']:.1f} | {ev.fmt(c['ceiling'])} "
                f"| {ev.fmt(sl['recall'])} | {ev.fmt(sl['precision'])} | {ev.fmt(sl['false_alarm'])} "
                f"| {ev.fmt(st['recall'])} | {ev.fmt(st['precision'])} | {ev.fmt(st['false_alarm'])} |")
        lines.append(line)
        print(line, flush=True)
    with open(os.path.join(IN, "summary.md"), "w") as f:
        f.write("# Vision trajectories vs ground truth\n\n" + "\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
