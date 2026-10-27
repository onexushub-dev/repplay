#!/usr/bin/env python3
"""Renders a clip with a Modo Foco framing, the way the app's export applies it, to compare framings by eye.

The framing comes from a focus file (`<clip>.focus.json`, v1): one rect per `stepMs` from `startMs`, 0..1 of the
upright video. Between rows the rect moves linearly (`FocusRamp.rect` in ReplayCore), so this matches the export.

Outputs, next to `--out` (a path without extension):
  <out>.focus.mp4    the framed video at the export size (1080x1920 for a vertical clip), with the clip's sound
  <out>.compare.mp4  side by side: the whole picture with the framing drawn on it | the framed video

Usage:
  python3 render_focus.py CLIP.mp4 CLIP.focus.json --out OUT [--aspect portrait|landscape] [--label TEXT]
Needs ffmpeg, numpy and opencv-python (cv2).
"""
import argparse
import json
import subprocess
import sys

import cv2
import numpy as np


def probe(path):
    """Upright width, height and frame rate (ffmpeg turns rotated clips upright when decoding)."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_streams", "-of", "json", path],
        capture_output=True, text=True, check=True).stdout
    s = json.loads(out)["streams"][0]
    w, h = s["width"], s["height"]
    rot = int(s.get("tags", {}).get("rotate", 0))
    for side in s.get("side_data_list", []):
        if "rotation" in side:
            rot = int(side["rotation"])
    if abs(rot) % 180 == 90:
        w, h = h, w
    num, den = s["r_frame_rate"].split("/")
    return w, h, float(num) / float(den)


def rect_at(t_ms, rects, start_ms, step_ms):
    """ReplayCore `FocusRamp.rect`: linear between the two nearest rows, held outside them."""
    pos = (t_ms - start_ms) / step_ms
    if pos <= 0:
        return rects[0]
    if pos >= len(rects) - 1:
        return rects[-1]
    i = int(pos)
    f = pos - i
    a, b = rects[i], rects[i + 1]
    return [a[k] + (b[k] - a[k]) * f for k in range(4)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("clip")
    ap.add_argument("focus")
    ap.add_argument("--out", required=True)
    ap.add_argument("--aspect", choices=["portrait", "landscape"], help="default: the shape the clip was recorded in")
    ap.add_argument("--label", default="", help="text burnt into the compare video (e.g. the tuning used)")
    ap.add_argument("--end-ms", type=float, help="default: 30 s after the file's startMs")
    args = ap.parse_args()

    focus = json.load(open(args.focus))
    if focus.get("v") not in (1, 2):
        sys.exit("unsupported focus file version")
    W, H, fps = probe(args.clip)
    aspect = args.aspect or ("landscape" if W >= H else "portrait")
    rects = focus[aspect]
    if not rects:
        sys.exit(f"no {aspect} framing in this file (Modo Foco unavailable)")
    start_ms, step_ms = float(focus["startMs"]), float(focus["stepMs"])
    end_ms = args.end_ms if args.end_ms else start_ms + len(rects) * step_ms
    # Export size: the recorded shape at full size, the other shape at the largest size that fits.
    if aspect == "portrait":
        ow, oh = (min(W, H), max(W, H)) if H >= W else (round(H * 9 / 16) // 2 * 2, H)
    else:
        ow, oh = (max(W, H), min(W, H)) if W >= H else (W, round(W * 9 / 16) // 2 * 2)

    # The compare video: both halves at the same height.
    ch = 960
    left_w = round(W * ch / H) // 2 * 2
    right_w = round(ow * ch / oh) // 2 * 2

    dur = (end_ms - start_ms) / 1000
    dec = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-ss", f"{start_ms / 1000:.3f}", "-i", args.clip, "-t", f"{dur:.3f}",
         "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], stdout=subprocess.PIPE)

    def encoder(path, w, h):
        return subprocess.Popen(
            ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", f"{fps}",
             "-i", "-", "-ss", f"{start_ms / 1000:.3f}", "-t", f"{dur:.3f}", "-i", args.clip,
             "-map", "0:v", "-map", "1:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
             "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path], stdin=subprocess.PIPE)

    enc_focus = encoder(args.out + ".focus.mp4", ow, oh)
    enc_cmp = encoder(args.out + ".compare.mp4", left_w + right_w, ch)

    frame_bytes = W * H * 3
    n = 0
    while True:
        buf = dec.stdout.read(frame_bytes)
        if len(buf) < frame_bytes:
            break
        frame = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
        t_ms = start_ms + n * 1000 / fps
        x, y, w, h = rect_at(t_ms, rects, start_ms, step_ms)
        x0, y0 = int(round(x * W)), int(round(y * H))
        x1, y1 = int(round((x + w) * W)), int(round((y + h) * H))
        crop = frame[max(y0, 0):min(y1, H), max(x0, 0):min(x1, W)]
        framed = cv2.resize(crop, (ow, oh), interpolation=cv2.INTER_LINEAR)
        enc_focus.stdin.write(framed.tobytes())

        left = cv2.resize(frame, (left_w, ch), interpolation=cv2.INTER_AREA)
        s = ch / H
        cv2.rectangle(left, (int(x0 * s), int(y0 * s)), (int(x1 * s), int(y1 * s)), (63, 242, 214), 3)
        zoom = 1 / w if aspect == "portrait" or W >= H else 1 / h
        info = f"{(t_ms - start_ms) / 1000:5.1f}s  zoom {zoom:.2f}x"
        cv2.putText(left, info, (12, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 4, cv2.LINE_AA)
        cv2.putText(left, info, (12, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
        if args.label:
            cv2.putText(left, args.label, (12, ch - 16), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 4, cv2.LINE_AA)
            cv2.putText(left, args.label, (12, ch - 16), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)
        right = cv2.resize(framed, (right_w, ch), interpolation=cv2.INTER_AREA)
        enc_cmp.stdin.write(np.hstack([left, right]).tobytes())
        n += 1

    for enc in (enc_focus, enc_cmp):
        enc.stdin.close()
        enc.wait()
    dec.wait()
    print(f"{n} frames, {aspect}, {ow}x{oh} → {args.out}.focus.mp4, {args.out}.compare.mp4")


if __name__ == "__main__":
    main()
