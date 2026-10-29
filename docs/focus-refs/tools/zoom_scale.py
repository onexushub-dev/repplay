#!/usr/bin/env python3
"""Zooms a Modo Foco framing in by a share, to compare zoom levels on the same clip (2026-10-28).

Every rect of the focus file shrinks by 1 + share around its own centre and is kept inside the picture: +0.2 makes
each moment 20% closer than the input framing (so the 1.5x cap becomes 1.8x). Both tracks (portrait and landscape).

Usage: python3 zoom_scale.py IN.focus.json OUT.focus.json 0.2
"""
import json
import sys


def scaled(rect, factor):
    x, y, w, h = rect
    cx, cy = x + w / 2, y + h / 2
    w2, h2 = w / factor, h / factor
    x2 = min(max(cx - w2 / 2, 0.0), 1.0 - w2)
    y2 = min(max(cy - h2 / 2, 0.0), 1.0 - h2)
    return [round(v, 4) for v in (x2, y2, w2, h2)]


def main():
    src, dst, share = sys.argv[1], sys.argv[2], float(sys.argv[3])
    focus = json.load(open(src))
    factor = 1.0 + share
    for track in ("portrait", "landscape"):
        focus[track] = [scaled(r, factor) for r in focus.get(track, [])]
    focus.setdefault("tuning", {})["zoomIn"] = share
    json.dump(focus, open(dst, "w"))
    main_track = "portrait" if focus["size"][0] < focus["size"][1] else "landscape"
    rows = focus[main_track]
    if rows:
        zooms = sorted(1 / (r[2] if main_track == "portrait" else r[3]) for r in rows)
        print(f"  +{share * 100:.0f}%: zoom median {zooms[len(zooms) // 2]:.2f}x, min {zooms[0]:.2f}x, max {zooms[-1]:.2f}x")


if __name__ == "__main__":
    main()
