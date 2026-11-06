#!/usr/bin/env python3
"""Modo Foco lab, test 1 (and 2 for people): "click once and the framing follows", with SAM 2. RUN ON THE MAC.

For each labelled clip and mode (ball, person), starting from the FIRST click Victor made when labelling:
- one click:  SAM 2 with only that click, over the whole clip. Recall / precision / false alarms against the ground
              truth, and how long it follows before the first miss.
- with fixes: a simulated user who clicks again only when SAM 2 is wrong (at the first missed ground-truth sample,
              on the true position) and lets it continue from there. Result: clicks needed per clip, i.e. how much
              work a "tap to follow" feature would ask of the player. Forward from the first click only.

Ball: a hit is within 2% of the frame's long side (evaluate.py). Person: a hit is box overlap (IoU) >= 0.5.

    cd docs/focus-refs && lab/.venv/bin/python tools/lab/oneclick.py [--model tiny|small|base_plus] [--mode ball|person]

Writes lab/tests/oneclick/<clip>.<mode>.<model>.json and lab/tests/oneclick/summary-<mode>-<model>.md.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import evaluate as ev  # noqa: E402
import server as S  # noqa: E402

OUT = os.path.join(ev.ROOT, "lab", "tests", "oneclick")


def iou(a, b):
    ax0, ay0, ax1, ay1 = a[0], a[1], a[0] + a[2], a[1] + a[3]
    bx0, by0, bx1, by1 = b[0], b[1], b[0] + b[2], b[1] + b[3]
    iw, ih = max(0.0, min(ax1, bx1) - max(ax0, bx0)), max(0.0, min(ay1, by1) - max(ay0, by0))
    inter = iw * ih
    u = a[2] * a[3] + b[2] * b[3] - inter
    return inter / u if u > 0 else 0.0


def hit(summary, truth_value, mode, size) -> bool:
    if summary is None:
        return False
    if mode == "ball":
        return math.hypot((summary[0] - truth_value[0]) * size[0], (summary[1] - truth_value[1]) * size[1]) <= ev.radius_px(size)
    return iou(summary[2:6], truth_value) >= 0.5


def score(truth, pred: dict, mode) -> dict:
    size = truth["size"]
    pts = hits = said = fa = empty = 0
    for t, v in truth["samples"].items():
        p = pred.get(t // 100)
        if isinstance(v, tuple):
            pts += 1
            if p is not None:
                said += 1
                hits += hit(p, v, mode, size)
        else:
            empty += 1
            fa += p is not None
    return {"points": pts, "recall": hits / pts if pts else None, "precision": hits / said if said else None,
            "false_alarm": fa / empty if empty else None}


def first_miss_ms(truth, pred, mode, seed_ms):
    for t in sorted(truth["samples"]):
        v = truth["samples"][t]
        if t <= seed_ms or not isinstance(v, tuple):
            continue
        if not hit(pred.get(t // 100), v, mode, truth["size"]):
            return t - seed_ms
    return None


def add_prompt(predictor, state, frame_idx, p):
    import numpy as np

    W, H = state["video_width"], state["video_height"]
    if p["kind"] == "box":
        x, y, bw, bh = p["xy"]
        box = np.array([x * W, y * H, (x + bw) * W, (y + bh) * H], dtype=np.float32)
        predictor.add_new_points_or_box(inference_state=state, frame_idx=frame_idx, obj_id=1, box=box)
    else:
        pts = np.array([[p["xy"][0] * W, p["xy"][1] * H]], dtype=np.float32)
        predictor.add_new_points_or_box(inference_state=state, frame_idx=frame_idx, obj_id=1, points=pts,
                                        labels=np.array([0 if p.get("neg") else 1], dtype=np.int32))


def summ(logits, state):
    return S.summarize((logits[0, 0] > 0).cpu().numpy(), state["video_width"], state["video_height"])


def roi_point(p, roi, k):
    """A prompt in whole-frame 0..1 -> the ROI crop's 0..1 at 100 ms frame k."""
    W, H = roi["size"]
    side = roi["side"]
    x0, y0 = roi["rois"][k]
    q = dict(p)
    if p["kind"] == "box":
        x, y, w, h = p["xy"]
        q["xy"] = [(x * W - x0) / side, (y * H - y0) / side, w * W / side, h * H / side]
    else:
        q["xy"] = [(p["xy"][0] * W - x0) / side, (p["xy"][1] * H - y0) / side]
    return q


def roi_back(v, roi, k):
    """A mask summary in the ROI crop's 0..1 -> whole-frame 0..1."""
    if v is None:
        return None
    W, H = roi["size"]
    side = roi["side"]
    x0, y0 = roi["rois"][k]
    cx, cy, x, y, w, h, a = v[:7]
    return [round((x0 + cx * side) / W, 4), round((y0 + cy * side) / H, 4), round((x0 + x * side) / W, 4),
            round((y0 + y * side) / H, 4), round(w * side / W, 4), round(h * side / H, 4),
            round(a * side * side / (W * H), 6)] + list(v[7:])


def run_clip(predictor, name, mode, chunk=10, fps=10, fixes=True, variant=None):
    """fps > 10: the tracker runs on lab/frames/<name>@<fps> (extract.sh with FPS=...), and its result is brought back
    to the 100 ms grid (the frame nearest each tick), so the scores and hybrid.py are unchanged."""
    truth = ev.load_truth(name, mode)
    seeds = [p for p in truth["prompts"] if not p.get("neg")]
    if not seeds:
        return None
    seed = seeds[0]
    frames_dir = os.path.join(S.FRAMES, name if fps == 10 else f"{name}@{fps}")
    roi = None
    step, offset10 = 1, 0  # test 14: a sparser copy (every `step`-th 10 fps frame from `offset10`, low_fps.py / roi.py --step)
    if variant:  # roi.py crops: same 10 fps frames, a square region at full resolution
        frames_dir = os.path.join(S.FRAMES, f"{name}@{variant}")
        with open(os.path.join(frames_dir, "roi.json")) as fr:
            roi = json.load(fr)
        fps = 10
        step, offset10 = int(roi.get("step", 1)), int(roi.get("offset10", 0))
    # the 10 fps frames (where the clicks were made) sit ~33 ms after the nominal tick: a denser copy's frame matching
    # 10 fps frame k is round(k * fps / 10) + alignTo10 (measured by image comparison, stored in its frames.json)
    off = 0
    if fps != 10:
        with open(os.path.join(frames_dir, "frames.json")) as fm:
            fj = json.load(fm)
        off = int(fj.get("alignTo10", 0))
        if fps < 10:
            step, offset10 = int(fj.get("step", round(10 / fps))), int(fj.get("offset10", 0))
    seed10 = int(round(seed["ms"] / 100))
    if step > 1:
        if (seed10 - offset10) % step:
            raise SystemExit(f"{name}: the sparse frames do not go through the click's frame (low_fps.py frames)")
        s = (seed10 - offset10) // step
    else:
        s = int(round(seed["ms"] * fps / 1000)) + off
    state = predictor.init_state(video_path=frames_dir, offload_video_to_cpu=True)
    n = state["num_frames"]

    # one click
    t0 = time.time()
    predictor.reset_state(state)
    add_prompt(predictor, state, s, roi_point(seed, roi, s) if roi else seed)
    one = {}
    for f, _ids, lg in predictor.propagate_in_video(state, start_frame_idx=s):
        one[int(f)] = summ(lg, state)
    if s > 0:
        for f, _ids, lg in predictor.propagate_in_video(state, start_frame_idx=s, reverse=True):
            one[int(f)] = summ(lg, state)
    t_one = time.time() - t0
    if roi:
        one = {k: roi_back(v, roi, k) for k, v in one.items()}
        fixes = False
    if step > 1:
        import low_fps
        n10 = ev.clip_meta(name)["count"]
        one = low_fps.upsample({offset10 + j * step: v for j, v in one.items()}, n10, step, offset10)
        s = seed10
        fixes = False
    elif fps != 10:
        n10 = ev.clip_meta(name)["count"]
        one = {k: one.get(int(round(k * 100 * fps / 1000)) + off) for k in range(n10)}
        s = int(round(seed["ms"] / 100))
    fixes = fixes and fps == 10
    # with fixes (forward only)
    t0 = time.time()
    if fixes or step == 1:  # a sparse copy has no frame s (10 fps index) and no fixes anyway
        predictor.reset_state(state)
        add_prompt(predictor, state, s, seed)
    fixed, clicks, f, last_click = {}, [s * 100], s, s
    while fixes and f < n:
        miss, last = None, f
        for g, _ids, lg in predictor.propagate_in_video(state, start_frame_idx=f, max_frame_num_to_track=chunk):
            g = int(g)
            fixed[g] = summ(lg, state)
            last = g
            v = truth["samples"].get(g * 100)
            if g > last_click and isinstance(v, tuple) and not hit(fixed[g], v, mode, truth["size"]):
                miss = g
                break
        if miss is not None:
            v = truth["samples"][miss * 100]
            p = {"kind": "point", "xy": [v[0], v[1]]} if mode == "ball" else {"kind": "box", "xy": list(v)}
            add_prompt(predictor, state, miss, p)
            clicks.append(miss * 100)
            f = last_click = miss
            continue
        if last >= n - 1:
            break
        f = last + 1
    t_fix = time.time() - t0

    after_seed = {t: v for t, v in truth["samples"].items() if t >= s * 100}
    pts_after = sum(1 for v in after_seed.values() if isinstance(v, tuple))
    res = {
        "clip": name, "mode": mode, "seedMs": s * 100, "seedKind": seed["kind"], "frames": n, "fps": fps,
        "one_click": {**score(truth, one, mode), "first_miss_ms": first_miss_ms(truth, one, mode, s * 100),
                      "seconds": round(t_one, 1)},
        "with_fixes": {"clicks": len(clicks), "click_ms": clicks, "points_after_seed": pts_after,
                       "false_alarm": score(truth, fixed, mode)["false_alarm"], "seconds": round(t_fix, 1)},
        "pred_one": {str(k): v for k, v in sorted(one.items())},
        "pred_fixed": {str(k): v for k, v in sorted(fixed.items())},
    }
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="tiny", choices=sorted(S.SAM_MODELS))
    ap.add_argument("--mode", default="ball", choices=("ball", "person"))
    ap.add_argument("--device", default=None)
    ap.add_argument("--fps", type=int, default=10, help="tracker frame rate (20/30 need extract.sh with FPS=...)")
    ap.add_argument("--no-fixes", action="store_true", help="skip the simulated fixes (always skipped at fps > 10)")
    ap.add_argument("--variant", default=None, help="frames from roi.py, e.g. roi40b (lab/frames/<clip>@roi40b)")
    ap.add_argument("--random-weights", action="store_true", help=argparse.SUPPRESS)  # code-path check only
    ap.add_argument("clips", nargs="*")
    a = ap.parse_args()
    tag = a.model if a.fps == 10 else f"{a.model}-{a.fps}fps"  # hybrid.py --model <tag>
    if a.fps < 10 and not a.variant:
        a.no_fixes = True
    if a.variant:
        tag = f"{a.model}-{a.variant}"
    names = a.clips or ev.labelled_clips(a.mode)
    missing = [n for n in names if not os.path.exists(os.path.join(ev.LABELS, f"{n}.{a.mode}.json"))]
    if missing:
        raise SystemExit(f"no {a.mode} click saved yet for: {', '.join(missing)}. Open the labelling page "
                         f"(tools/lab/server.py), pick the clip, click the {a.mode} once, then run this again.")
    if not names:
        raise SystemExit(f"no {a.mode} labels yet")
    tracker = S.Sam2Tracker(a.model, a.device, a.random_weights)  # builds the predictor (same settings as the labelling page)
    predictor = tracker.predictor
    os.makedirs(OUT, exist_ok=True)
    lines = [f"# One click, SAM 2.1 {a.model} ({tracker.device}), {a.mode} — {time.strftime('%Y-%m-%d %H:%M')}", "",
             "| Clip | Points | One click: recall | precision | false alarm | follows for | With fixes: clicks | per 10 points |",
             "|---|---|---|---|---|---|---|---|"]
    for name in names:
        r = run_clip(predictor, name, a.mode, fps=a.fps, fixes=not a.no_fixes, variant=a.variant)
        if r is None:
            print(f"{name}: no first click, skipped")
            continue
        with open(os.path.join(OUT, f"{name}.{a.mode}.{tag}.json"), "w") as f:
            json.dump(r, f, separators=(",", ":"))
        o, w = r["one_click"], r["with_fixes"]
        follows = "whole clip" if o["first_miss_ms"] is None else f"{o['first_miss_ms'] / 1000:.1f} s"
        per10 = 10 * w["clicks"] / w["points_after_seed"] if w["points_after_seed"] else 0
        line = (f"| {name} | {o['points']} | {ev.fmt(o['recall'])} | {ev.fmt(o['precision'])} | {ev.fmt(o['false_alarm'])} "
                f"| {follows} | {w['clicks']} | {per10:.1f} |")
        lines.append(line)
        print(line, f"({o['seconds']:.0f}s + {w['seconds']:.0f}s)", flush=True)
    path = os.path.join(OUT, f"summary-{a.mode}-{tag}.md")
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")
    print("written", path)


if __name__ == "__main__":
    main()
