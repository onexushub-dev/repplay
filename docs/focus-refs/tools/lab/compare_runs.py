#!/usr/bin/env python3
"""Modo Foco lab, test 12: one video comparing two ball tracks framed by hybrid.py (round 6), side by side.

Default: the two-pass reference (EdgeTAM roi40b) vs the one-pass track that follows the ball (single_pass.py roi40f).
Layout: the whole picture with both crops (green = A, magenta = B) and both trusted balls, then crop A | crop B,
each labelled BOLA / jogadores (ball mode or players at that moment).

    cd docs/focus-refs && python3 tools/lab/compare_runs.py bt-wa-1028 yt-bt-06 volei-app-1102
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import evaluate as ev  # noqa: E402
import hybrid as hb  # noqa: E402
import roi as R  # noqa: E402


def framing(name, tag, sets=()):
    saved = dict(hb.T)
    for item in sets:
        k, _, v = item.partition("=")
        if k not in hb.T:
            raise SystemExit(f"unknown value {k}")
        hb.T[k] = float(v) if isinstance(hb.T[k], float) else int(float(v))
    try:
        return _framing(name, tag)
    finally:
        hb.T.clear()
        hb.T.update(saved)


def _framing(name, tag):
    meta = ev.clip_meta(name)
    truth = ev.load_truth(name)
    with open(os.path.join(hb.OUT, f"{name}.current.focus.json")) as f:
        fc = json.load(f)
    aspect = "portrait" if truth["size"][1] > truth["size"][0] else "landscape"
    off = int(round((meta["startMs"] - fc["startMs"]) / 100))
    n = meta["count"]
    cur = fc[aspect][off:off + n]
    with open(os.path.join(hb.TESTS, "oneclick", f"{name}.ball.{tag}.json")) as f:
        oc = json.load(f)
    tr = hb.trusted(oc["pred_one"], n, truth["size"], meta["sport"])
    zoom = max(1 / r[2] for r in cur)
    hyb, mode, _segs = hb.hybrid_rects(cur, tr, truth["size"], zoom)
    return meta, truth, hyb, mode, tr


def render(name, tag_a, tag_b, label_a, label_b, out_path, set_a=(), set_b=()):
    import cv2

    meta, truth, ha, ma, ta = framing(name, tag_a, set_a)
    _m, _t, hb_, mb, tb = framing(name, tag_b, set_b)
    video = os.path.join(ev.ROOT, meta["video"])
    W, H = R.upright_size(video)
    st = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                    "stream=r_frame_rate", "-of", "json", video], capture_output=True, text=True,
                                   check=True).stdout)["streams"][0]
    num, den = st["r_frame_rate"].split("/")
    fps = float(num) / float(den)
    keep = 2 if fps > 40 else 1
    portrait = H > W
    if portrait:
        ph = 960
        pw = round(W * ph / H) // 2 * 2
        size_out = (pw * 3, ph)
    else:
        pw, ph = 1280, 720
        size_out = (1280, 720 + 360)
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", f"{meta['startMs'] / 1000:.3f}", "-i", video, "-t",
                            f"{meta['durMs'] / 1000:.3f}", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"],
                           stdout=subprocess.PIPE)
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s",
                            f"{size_out[0]}x{size_out[1]}", "-r", f"{fps / keep}", "-i", "-", "-c:v", "libx264",
                            "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", out_path],
                           stdin=subprocess.PIPE)
    font = cv2.FONT_HERSHEY_SIMPLEX
    GREEN, MAGENTA = (63, 242, 214), (230, 80, 230)

    def text(img, s, org, scale=0.6):
        cv2.putText(img, s, org, font, scale, (0, 0, 0), 4, cv2.LINE_AA)
        cv2.putText(img, s, org, font, scale, (255, 255, 255), 2, cv2.LINE_AA)

    def crop(frame, r, w, h):
        x0, y0 = int(round(r[0] * W)), int(round(r[1] * H))
        x1, y1 = int(round((r[0] + r[2]) * W)), int(round((r[1] + r[3]) * H))
        c = frame[max(0, y0):min(H, y1), max(0, x0):min(W, x1)]
        return cv2.resize(c, (w, h), interpolation=cv2.INTER_AREA)

    fb = W * H * 3
    n = 0
    while True:
        buf = dec.stdout.read(fb)
        if len(buf) < fb:
            break
        if n % keep:
            n += 1
            continue
        frame = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
        t = n * 1000 / fps
        ra, rb = hb.rect_at(t, ha), hb.rect_at(t, hb_)
        i = min(int(round(t / 100)), len(ta) - 1)
        left = cv2.resize(frame, (pw, ph), interpolation=cv2.INTER_AREA)
        s = ph / H
        for r, col in ((ra, GREEN), (rb, MAGENTA)):
            cv2.rectangle(left, (int(r[0] * W * s), int(r[1] * H * s)),
                          (int((r[0] + r[2]) * W * s), int((r[1] + r[3]) * H * s)), col, 3)
        g = truth["samples"].get(int(round(t / 200)) * 200)
        if isinstance(g, tuple):
            cv2.circle(left, (int(g[0] * W * s), int(g[1] * H * s)), 14, (255, 255, 255), 2, cv2.LINE_AA)
        for tr, col, rad in ((ta, GREEN, 7), (tb, MAGENTA, 4)):
            if tr[i] is not None:
                cv2.circle(left, (int(tr[i][0] * W * s), int(tr[i][1] * H * s)), rad, col, -1, cv2.LINE_AA)
        text(left, f"{t / 1000:4.1f}s", (12, 28))
        text(left, f"verde: {label_a}  magenta: {label_b}  pontos: bola", (12, ph - 14), 0.45)
        if portrait:
            a, b = crop(frame, ra, pw, ph), crop(frame, rb, pw, ph)
        else:
            a, b = crop(frame, ra, 640, 360), crop(frame, rb, 640, 360)
        text(a, f"{label_a}: {'BOLA' if ma[i] else 'jogadores'}", (12, 28))
        text(b, f"{label_b}: {'BOLA' if mb[i] else 'jogadores'}", (12, 28))
        img = np.hstack([left, a, b]) if portrait else np.vstack([left, np.hstack([a, b])])
        enc.stdin.write(np.ascontiguousarray(img).tobytes())
        n += 1
    enc.stdin.close()
    enc.wait()
    dec.wait()
    print(f"{name}: ball mode {label_a} {100 * ma.mean():.0f}% vs {label_b} {100 * mb.mean():.0f}% -> "
          f"{os.path.relpath(out_path, ev.ROOT)}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("clips", nargs="+")
    ap.add_argument("--a", default="edgetam-roi40b", help="oneclick tag on the left (default: two passes)")
    ap.add_argument("--b", default="edgetam-torch-fp16-roi40f", help="oneclick tag on the right (default: one pass)")
    ap.add_argument("--label-a", default="2 passadas")
    ap.add_argument("--label-b", default="1 passada")
    ap.add_argument("--set-a", action="append", default=[], help="hybrid.py tuning for the left, e.g. ramp_out=7")
    ap.add_argument("--set-b", action="append", default=[], help="hybrid.py tuning for the right, e.g. ease=1")
    ap.add_argument("--tag", default="1v2", help="output: lab/tests/framing/<clip>.compare-<tag>.mp4")
    a = ap.parse_args()
    for name in a.clips:
        render(name, a.a, a.b, a.label_a, a.label_b, os.path.join(hb.OUT, f"{name}.compare-{a.tag}.mp4"),
               a.set_a, a.set_b)


if __name__ == "__main__":
    main()
