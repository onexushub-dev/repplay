#!/usr/bin/env python3
"""Modo Foco lab, test 14 (2026-11-04): Foco na Bola at 5 fps, to bring its cost near today's Modo Foco (~15 s per
30 s clip on the iPhone 16 Pro Max): the same EdgeTAM tracking on every 2nd 100 ms frame, the track brought back to the
10 fps grid by linear interpolation (centre and box; the other mask numbers from the earlier frame), then framed by
hybrid.py round 6 as v6.

The 5 fps grid goes through the click's frame (offset10 = click frame % 2), so the click is never moved in time.

    cd docs/focus-refs
    python3 tools/lab/low_fps.py frames [clip ...]          # lab/frames/<clip>@5: hard links to every 2nd 10 fps frame
    python3 tools/lab/low_fps.py sub TAG [clip ...]         # simulate: keep every 2nd frame of an existing 10 fps track
    python3 tools/lab/low_fps.py report TAG [TAG ...]       # ball mode + hybrid scores vs v6 (edgetam-roi40b)

Runs on the Mac (EdgeTAM, lab/.venv-edgetam) — the commands are in README test 14:
    oneclick.py --model edgetam --fps 5 --no-fixes             pass 1 at 5 fps            -> edgetam-5fps
    roi.py --first edgetam-5fps --step 2                        pass 2 crops, every 2nd    -> lab/frames/<clip>@roi40b5
    oneclick.py --model edgetam --variant roi40b5               pass 2 at 5 fps            -> edgetam-roi40b5
    single_pass.py track --vel 1 --step 2                       one pass at 5 fps          -> ...-roi40f-5fps
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import evaluate as ev  # noqa: E402
import hybrid as hb  # noqa: E402

ONECLICK = os.path.join(ev.ROOT, "lab", "tests", "oneclick")
CLIPS = ("bt-wa-1028", "yt-basket-04", "yt-bt-06", "volei-app-1102", "basket-v-01", "bt-E5003B6B", "bt-0AE39B33",
         "basket-app-1031-a", "basket-app-1031-b")
APP_EXPORTS = ("volei-app-1102", "basket-app-1031-a", "basket-app-1031-b")  # hybrid with ball_zoom 1.25 (clips.txt)


def seed_frame(name):
    truth = ev.load_truth(name)
    seed = [p for p in truth["prompts"] if not p.get("neg")][0]
    return int(round(seed["ms"] / 100))


def offset10(name, step=2):
    return seed_frame(name) % step


def upsample(pred, n, step, off):
    """pred: {10 fps frame: summary or None} on the grid off + j*step -> every frame 0..n-1. Between two grid frames
    with a ball: centre, box and area interpolated, the rest from the earlier one; else None."""
    out = {}
    grid = list(range(off, n, step))
    for k in range(n):
        if k in pred and (k - off) % step == 0:
            out[k] = pred[k]
            continue
        a = off + ((k - off) // step) * step
        b = a + step
        va, vb = pred.get(a), pred.get(b)
        if a < off or b >= n or va is None or vb is None:
            out[k] = None
            continue
        f = (k - a) / step
        out[k] = [round(va[i] + (vb[i] - va[i]) * f, 6) for i in range(7)] + list(va[7:])
    assert grid
    return out


def cmd_frames(a):
    for name in a.clips or CLIPS:
        meta = ev.clip_meta(name)
        src = os.path.join(ev.FRAMES, name)
        st = a.step
        fps = 10 // st
        dst = os.path.join(ev.FRAMES, f"{name}@{fps}")
        off = offset10(name, st)
        os.makedirs(dst, exist_ok=True)
        j = 0
        for k in range(off, meta["count"], st):
            p = os.path.join(dst, f"{j:05d}.jpg")
            if not os.path.exists(p):
                os.link(os.path.join(src, f"{k:05d}.jpg"), p)
            j += 1
        m = dict(meta, fps=fps, stepMs=100 * st, count=j, step=st, offset10=off)
        json.dump(m, open(os.path.join(dst, "frames.json"), "w"))
        print(f"{name}@{fps}: {j} frames (10 fps frames {off}, {off + st}, ...)")


def cmd_sub(a):
    for name in a.clips or CLIPS:
        p = os.path.join(ONECLICK, f"{name}.ball.{a.tag}.json")
        if not os.path.exists(p):
            print(f"{name}: no {a.tag}")
            continue
        oc = json.load(open(p))
        n = ev.clip_meta(name)["count"]
        st = a.step
        off = offset10(name, st)
        pred = {int(k): v for k, v in oc["pred_one"].items() if (int(k) - off) % st == 0}
        up = upsample(pred, n, st, off)
        oc["pred_one"] = {str(k): up[k] for k in range(n)}
        oc["source"] = f"low_fps.py sub {a.tag} (every {st}th frame kept, interpolated)"
        out = f"{a.tag}-sub{10 // st}"
        json.dump(oc, open(os.path.join(ONECLICK, f"{name}.ball.{out}.json"), "w"), separators=(",", ":"))
        print(f"{name}: {out}")


def cmd_fuse(a):
    """Test 15: per frame, pass 2's ball where hybrid.trusted accepts it, else pass 1's where trusted (pass 2 can lose a
    ball pass 1 follows well, e.g. yt1105-volei-a: stuck on a still object from the click), else pass 2's raw mask."""
    for name in a.clips:
        meta = ev.clip_meta(name)
        truth = ev.load_truth(name)
        n = meta["count"]
        o2 = json.load(open(os.path.join(ONECLICK, f"{name}.ball.{a.p2}.json")))
        p2 = o2["pred_one"]
        p1 = json.load(open(os.path.join(ONECLICK, f"{name}.ball.{a.p1}.json")))["pred_one"]
        t2 = hb.trusted(p2, n, truth["size"], meta["sport"])
        t1 = hb.trusted(p1, n, truth["size"], meta["sport"])
        fused = {}
        for k in range(n):
            s = str(k)
            fused[s] = p2.get(s) if t2[k] is not None else (p1.get(s) if t1[k] is not None else p2.get(s))
        o2["pred_one"] = fused
        o2["source"] = f"low_fps.py fuse {a.p2} + {a.p1}"
        json.dump(o2, open(os.path.join(ONECLICK, f"{name}.ball.{a.out}.json"), "w"), separators=(",", ":"))
        print(f"{name}: {a.out}")


def frame_tag(name, tag):
    """hybrid round 6 on one track: (scores or None, ball-mode share)."""
    meta = ev.clip_meta(name)
    truth = ev.load_truth(name)
    fc = json.load(open(os.path.join(hb.OUT, f"{name}.current.focus.json")))
    aspect = "portrait" if truth["size"][1] > truth["size"][0] else "landscape"
    off = int(round((meta["startMs"] - fc["startMs"]) / 100))
    n = meta["count"]
    cur = fc[aspect][off:off + n]
    oc = json.load(open(os.path.join(ONECLICK, f"{name}.ball.{tag}.json")))
    saved = dict(hb.T)
    if name in APP_EXPORTS:
        hb.T["ball_zoom"] = 1.25
    try:
        tr = hb.trusted(oc["pred_one"], n, truth["size"], meta["sport"])
        hyb, mode, _ = hb.hybrid_rects(cur, tr, truth["size"], max(1 / r[2] for r in cur))
    finally:
        hb.T.clear()
        hb.T.update(saved)
    pts = sum(1 for v in truth["samples"].values() if isinstance(v, tuple))
    sc = hb.scores(hyb, truth, truth["size"]) if pts >= 10 else None
    return sc, float(mode.mean()), hyb


def cmd_report(a):
    tags = ["edgetam-roi40b"] + a.tags
    lines = ["| Clip | " + " | ".join(tags) + " |", "|---" * (len(tags) + 1) + "|"]
    for name in a.clips or CLIPS:
        cells = []
        for tag in tags:
            if not os.path.exists(os.path.join(ONECLICK, f"{name}.ball.{tag}.json")):
                cells.append("—")
                continue
            sc, share, _ = frame_tag(name, tag)
            c = f"mode {100 * share:.0f}%"
            if sc is not None:
                c += f", in crop {100 * sc['ball_in_crop']:.0f}%, off {sc['ball_off_centre']:.2f}"
            cells.append(c)
        lines.append(f"| {name} | " + " | ".join(cells) + " |")
    # agreement of the framings with v6: median distance of the crop centres, in crop widths
    lines += ["", "Crop centre vs v6 (median / p90, in crop widths):", "",
              "| Clip | " + " | ".join(tags[1:]) + " |", "|---" * len(tags) + "|"]
    for name in a.clips or CLIPS:
        if not os.path.exists(os.path.join(ONECLICK, f"{name}.ball.edgetam-roi40b.json")):
            continue
        _, _, ref = frame_tag(name, "edgetam-roi40b")
        ref = np.array(ref)
        cells = []
        for tag in tags[1:]:
            if not os.path.exists(os.path.join(ONECLICK, f"{name}.ball.{tag}.json")):
                cells.append("—")
                continue
            _, _, h = frame_tag(name, tag)
            h = np.array(h)
            d = np.hypot((h[:, 0] + h[:, 2] / 2 - ref[:, 0] - ref[:, 2] / 2) / ref[:, 2],
                         (h[:, 1] + h[:, 3] / 2 - ref[:, 1] - ref[:, 3] / 2) / ref[:, 3])
            cells.append(f"{np.median(d):.2f} / {np.percentile(d, 90):.2f}")
        lines.append(f"| {name} | " + " | ".join(cells) + " |")
    text = "\n".join(lines) + "\n"
    print(text)
    os.makedirs(os.path.join(ev.ROOT, "lab", "tests", "lowfps"), exist_ok=True)
    open(os.path.join(ev.ROOT, "lab", "tests", "lowfps", f"report.{a.name}.md"), "w").write(
        "# Test 14: Foco na Bola at 5 fps vs v6 (two passes at 10 fps)\n\nmode = share of the clip in ball mode "
        "(round 6); in crop / off = labelled balls inside the hybrid crop / distance to its centre (clips with labels).\n\n"
        + text)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("frames")
    p.add_argument("--step", type=int, default=2, help="2 = 5 fps, 3 = 3.3 fps (@3), 4 = 2.5 fps (@2)")
    p.add_argument("clips", nargs="*")
    p = sub.add_parser("sub")
    p.add_argument("--step", type=int, default=2)
    p.add_argument("tag")
    p.add_argument("clips", nargs="*")
    p = sub.add_parser("fuse")
    p.add_argument("--p1", default="edgetam-5fps")
    p.add_argument("--p2", default="edgetam-roi40b5")
    p.add_argument("--out", default="edgetam-fuse5")
    p.add_argument("clips", nargs="+")
    p = sub.add_parser("report")
    p.add_argument("tags", nargs="+")
    p.add_argument("--name", default="lowfps")
    p.add_argument("--clips", nargs="*")
    a = ap.parse_args()
    {"frames": cmd_frames, "sub": cmd_sub, "fuse": cmd_fuse, "report": cmd_report}[a.cmd](a)


if __name__ == "__main__":
    main()
