#!/usr/bin/env python3
"""Modo Foco lab, test 8: give the tracker a closer picture. RUNS ANYWHERE (ffmpeg + numpy + PIL).

EdgeTAM sees the whole frame squeezed to 1024x1024, where a far ball is a few pixels; at 20/30 fps it did no better
(test 7), so the limit is the ball's size, not its speed. Here the tracker gets a square region of interest (ROI)
instead, cut from the ORIGINAL video at full resolution (1080x1920 for the app clips), so the ball has more real pixels.

ROI path, per 100 ms frame (offline: known in advance, so a plain list of crops = a "video" for the tracker):
- guide "b": the ball from a first pass on the whole frame (the round-5 trusted points, bridged over gaps up to 1 s),
  else the centre of today's (players) framing; "p": today's framing only (one pass)
- smoothed (Gaussian σ 0.3 s), a square of side `size` x the frame's long side (capped at the short side), inside the
  picture

Writes lab/frames/<clip>@<variant>/NNNNN.jpg (the crops, same frame times as the 10 fps frames) and roi.json
({"size": [W, H] of the source, "side": px, "rois": [[x0, y0] px per frame], ...}). oneclick.py --variant <variant>
runs the tracker on it and maps the masks back to the whole frame.

    cd docs/focus-refs && python3 tools/lab/roi.py bt-wa-1028 --size 0.4 --guide b --first edgetam
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import evaluate as ev  # noqa: E402
import hybrid as hb  # noqa: E402


def upright_size(video):
    st = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_streams", "-of", "json",
                                    video], capture_output=True, text=True, check=True).stdout)["streams"][0]
    W, H = st["width"], st["height"]
    rot = int(st.get("tags", {}).get("rotate", 0))
    for side in st.get("side_data_list", []):
        if "rotation" in side:
            rot = int(side["rotation"])
    if abs(rot) % 180 == 90:
        W, H = H, W
    return W, H


def guide_path(name, guide, first):
    meta = ev.clip_meta(name)
    n = meta["count"]
    with open(os.path.join(hb.OUT, f"{name}.current.focus.json")) as f:
        fc = json.load(f)
    aspect = "portrait" if meta["size"][1] > meta["size"][0] else "landscape"
    off = int(round((meta["startMs"] - fc["startMs"]) / 100))
    players = fc[aspect][off:off + n]
    cx = np.array([r[0] + r[2] / 2 for r in players])
    cy = np.array([r[1] + r[3] / 2 for r in players])
    used = 0
    if guide == "b":
        with open(os.path.join(hb.TESTS, "oneclick", f"{name}.ball.{first}.json")) as f:
            oc = json.load(f)
        tr = hb.trusted(oc["pred_one"], n, meta["size"], meta["sport"])
        for a, b in hb.ball_mode(tr, meta["size"]):
            idx = [k for k in range(a, b + 1) if tr[k] is not None]
            cx[a:b + 1] = np.interp(range(a, b + 1), idx, [tr[k][0] for k in idx])
            cy[a:b + 1] = np.interp(range(a, b + 1), idx, [tr[k][1] for k in idx])
            used += b - a + 1
    return hb.gauss(cx, 3.0), hb.gauss(cy, 3.0), used / n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("clips", nargs="+")
    ap.add_argument("--size", type=float, default=0.4, help="ROI side as a share of the frame's long side")
    ap.add_argument("--guide", choices=("b", "p"), default="b", help="b: first-pass ball + players; p: players only")
    ap.add_argument("--first", default="edgetam", help="first-pass track (oneclick tag) for --guide b")
    a = ap.parse_args()
    variant = f"roi{int(round(a.size * 100))}{a.guide}"
    for name in a.clips:
        meta = ev.clip_meta(name)
        video = os.path.join(ev.ROOT, meta["video"])
        W, H = upright_size(video)
        side = int(min(round(a.size * max(W, H)), min(W, H))) // 2 * 2
        cx, cy, share = guide_path(name, a.guide, a.first)
        x0 = np.clip(np.round(cx * W - side / 2), 0, W - side).astype(int)
        y0 = np.clip(np.round(cy * H - side / 2), 0, H - side).astype(int)
        out = os.path.join(ev.FRAMES, f"{name}@{variant}")
        os.makedirs(out, exist_ok=True)
        # the same frames as extract.sh (same -ss and fps filter), at the source's full size
        dec = subprocess.Popen(["ffmpeg", "-nostdin", "-v", "error", "-ss", f"{meta['startMs'] / 1000}", "-i", video,
                                "-t", f"{meta['durMs'] / 1000}", "-vf", "fps=10:start_time=0", "-f", "rawvideo",
                                "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
        fb = W * H * 3
        k = 0
        while k < meta["count"]:
            buf = dec.stdout.read(fb)
            if len(buf) < fb:
                break
            fr = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
            crop = fr[y0[k]:y0[k] + side, x0[k]:x0[k] + side]
            Image.fromarray(crop).save(os.path.join(out, f"{k:05d}.jpg"), quality=92)
            k += 1
        dec.stdout.close()
        dec.wait()
        with open(os.path.join(out, "roi.json"), "w") as f:
            json.dump({"name": name, "variant": variant, "size": [W, H], "side": side, "guide": a.guide,
                       "first": a.first if a.guide == "b" else None, "ballGuidedShare": round(share, 3),
                       "count": k, "rois": [[int(x0[i]), int(y0[i])] for i in range(k)]}, f)
        print(f"{name}@{variant}: {k} crops of {side}x{side} from {W}x{H} "
              f"(ball-guided {100 * share:.0f}% of the time)", flush=True)


if __name__ == "__main__":
    main()
