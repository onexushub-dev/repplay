#!/usr/bin/env python3
"""Modo Foco lab, test 13 (2026-11-04): a more "broadcast" camera from the players alone, at today's cost.

Variants of today's framing (focus_variant.py --preset acao = FocusTuning.action) with faster and closer camera rules,
a lead on the play and, optionally, an optical-flow signal; scored on the labelled ball clips next to today's framing
and Foco na Bola v6 (the EdgeTAM roi40b track framed by hybrid.py round 6).

    cd docs/focus-refs
    python3 tools/lab/broadcast.py flow [clip ...]          # OpenCV Farneback stand-in for Vision's optical flow
    python3 tools/lab/broadcast.py scores [--only a,b] [clip ...]
    python3 tools/lab/broadcast.py render VARIANT [clip ...] # today | variant video

Flow files: lab/tests/broadcast/<clip>.flow.json, per 100 ms frame of the lab window [x, y, strength] or null
(from tools/lab/flow-probe.swift on the Mac, or from `flow` here). Outputs: lab/tests/broadcast/.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import evaluate as ev  # noqa: E402
import focus_variant as fv  # noqa: E402
import hybrid as hb  # noqa: E402

OUT = os.path.join(ev.ROOT, "lab", "tests", "broadcast")
PEOPLE = {
    "bt-0AE39B33": "renders/0AE39B33.people.json",
    "bt-E5003B6B": "renders/E5003B6B.people.json",
    "basket-v-01": "renders/tiles/basket-v.people.json",
    "yt-basket-04": "renders/yt-FVUuK2ZGQtw-1m.people.json",
    "yt-bt-06": "renders/yt-g4WYPBh4UNM.people.json",
    "bt-wa-1028": "renders/bt-wa-1028.people.json",
}
NEW_CLIPS = ["bt-rz-1105-a", "bt-rz-1105-b", "bt-rz-1105-v", "basket-rp-1105-h", "basket-rp-1105-v-a", "basket-rp-1105-v-b",
             "yt1105-basket-a", "yt1105-voleipraia", "yt1105-futevolei", "yt1105-volei-a", "yt1105-volei-b",
             "yt1105-basket-b", "yt1105-bt"]
for _c in NEW_CLIPS:  # people files of 2026-11-05: today's framing from whole frame + tiles (the app since v14)
    PEOPLE[_c] = f"renders/{_c}.people.json"
BOXES = {c: "tiled" for c in NEW_CLIPS}
LABELLED = ["basket-v-01", "bt-0AE39B33", "bt-E5003B6B", "yt-basket-04"]
ALL_LABELLED = LABELLED + NEW_CLIPS
BALL_REF = "hybrid.v6-edgetam-roi40b"

ACAO = dict(activity=1.0, activeSpread=1.0, zoomIn=1.1)
# maxZoom is the cap before zoomIn (×1.1): 1.82 → 2.0x on screen, as the ball framing.
VARIANTS = {
    "current": {},
    # 13a: faster and closer camera rules
    "a1-fast": dict(sigmaXMs=350, maxPanPerSecond=0.7),
    "a2-fast-zoom": dict(sigmaXMs=350, maxPanPerSecond=0.7, maxZoom=1.82, sigmaSizeMs=800),
    "a3-fast-zoom-vert": dict(sigmaXMs=350, maxPanPerSecond=0.7, maxZoom=1.82, sigmaSizeMs=800, vertAsym=1),
    "a4-faster": dict(sigmaXMs=250, maxPanPerSecond=1.0, maxZoom=1.82, sigmaSizeMs=700, widthHoldMs=700, vertAsym=1),
    # 13b: lead on the play, pulled by whoever runs fastest
    "b1-lead": dict(sigmaXMs=350, maxPanPerSecond=0.7, maxZoom=1.82, sigmaSizeMs=800, vertAsym=1, leadMs=500),
    "b2-lead-runner": dict(sigmaXMs=350, maxPanPerSecond=0.7, maxZoom=1.82, sigmaSizeMs=800, vertAsym=1, leadMs=500,
                           speedPow=2),
    "b3-lead-runner-300": dict(sigmaXMs=350, maxPanPerSecond=0.7, maxZoom=1.82, sigmaSizeMs=800, vertAsym=1,
                               leadMs=300, speedPow=2),
    "b4-lead-runner-700": dict(sigmaXMs=350, maxPanPerSecond=0.7, maxZoom=1.82, sigmaSizeMs=800, vertAsym=1,
                               leadMs=700, speedPow=2),
    # 13c: optical flow pulls the camera (needs flow files)
    "c1-flow": dict(sigmaXMs=350, maxPanPerSecond=0.7, maxZoom=1.82, sigmaSizeMs=800, vertAsym=1, leadMs=500,
                    speedPow=2, flowPull=0.4, flowRef=0.02),
    "c2-flow-spread": dict(sigmaXMs=350, maxPanPerSecond=0.7, maxZoom=1.82, sigmaSizeMs=800, vertAsym=1, leadMs=500,
                           speedPow=2, flowPull=0.4, flowRef=0.02, flowSpread=1),
}
# Round 2 (2026-11-04, after round 1: the ball is lost ABOVE the crop on lobs and shots, more so with zoom):
B2 = dict(sigmaXMs=350, maxPanPerSecond=0.7, maxZoom=1.82, sigmaSizeMs=800, leadMs=500, speedPow=2)
VARIANTS.update({
    "d1-feet": dict(B2, anchorFeet=1),
    "d2-feet-vert": dict(B2, anchorFeet=1, vertAsym=1),
    "d3-feet-widen": dict(B2, anchorFeet=1, widenPerSpeed=0.6),
    "d4-feet-widen-flow": dict(B2, anchorFeet=1, widenPerSpeed=0.6, flowPull=0.4, flowRef=0.02),
    "d5-feet-z17": dict(B2, anchorFeet=1, maxZoom=1.55, widenPerSpeed=0.6),
    "d6-feet-m03": dict(B2, anchorFeet=1, footMargin=0.03, widenPerSpeed=0.6),
})
# Round 3 (finalists): the feet anchor (the gain on lobs and shots) with today's size smoothing (1.2 s) and a calmer
# height (dead band 5%, σ 0.8 s) against the bobbing the zoom changes caused; the widen-on-pan zoom; lead + runner pull.
TV = dict(sigmaXMs=350, maxPanPerSecond=0.7, sigmaSizeMs=1200, anchorFeet=1, vertAsym=1, vDeadband=0.05, vSigmaMs=800,
          widenPerSpeed=0.6, leadMs=500, speedPow=2)
VARIANTS.update({
    "tv18": dict(TV, maxZoom=1.65),               # up to 1.8x on screen
    "tv20": dict(TV, maxZoom=1.82),               # up to 2.0x on screen (the ball framing's zoom)
    "tv18m": dict(TV, maxZoom=1.65, anchorShare=0.5),  # half way to the feet anchor: less sky above the players
    "tv18-nolead": dict(TV, maxZoom=1.65, leadMs=0, speedPow=1),
    "tv18-flow": dict(TV, maxZoom=1.65, flowPull=0.7, flowRef=0.015, flowSpread=1),
    "tv20-flow": dict(TV, maxZoom=1.82, flowPull=0.7, flowRef=0.015, flowSpread=1),
})


def extra_variants(items):
    """--var name:key=value,key=value (on top of round 2's B2 when it starts with +)."""
    for item in items or []:
        name, _, body = item.partition(":")
        base = {}
        if body.startswith("+"):
            base, body = dict(B2), body[1:]
        for kv in filter(None, body.split(",")):
            k, _, v = kv.partition("=")
            base[k] = float(v)
        VARIANTS[name] = base


def tuning(sets):
    t = dict(fv.STANDARD)
    t.update(ACAO)
    for k, v in sets.items():
        if k not in t:
            raise SystemExit(f"unknown tuning value {k}")
        t[k] = float(v) if isinstance(t[k], float) else int(v)
    return t


def load_people(name):
    with open(os.path.join(ev.ROOT, "lab", "tests", "framing", f"{name}.current.focus.json")) as f:
        app = json.load(f)
    probe = json.load(open(os.path.join(ev.ROOT, PEOPLE[name])))
    W, H = app["size"]
    start, step = app["startMs"], app["stepMs"]
    rows = len(app["landscape"]) or len(app["portrait"])
    end = start + rows * step
    frames = [(s["t"], [tuple(b[:4]) for b in s[BOXES.get(name, "full")]]) for s in probe["samples"]]
    frames = [f for f in frames if start - 0.5 <= f[0] < end]
    return app, fv.grid(frames, start, end, step), W, H


def flow_for(name, app, n):
    """Flow per focus sample (None outside the lab window or without a flow file)."""
    path = os.path.join(OUT, f"{name}.flow.json")
    if not os.path.exists(path):
        return None
    fl = json.load(open(path))
    meta = ev.clip_meta(name)
    off = int(round((meta["startMs"] - app["startMs"]) / 100))
    out = [None] * n
    for k, v in enumerate(fl["frames"]):
        if 0 <= off + k < n and v is not None:
            out[off + k] = tuple(v)
    return out


def variant_rects(name, sets, flow_needed=False):
    app, samples, W, H = load_people(name)
    aspect = "landscape" if W >= H else "portrait"
    t = tuning(sets)
    flow = flow_for(name, app, len(samples)) if t["flowPull"] > 0 else None
    if t["flowPull"] > 0 and flow is None:
        return None, None
    rects = fv.compute(samples, W, H, aspect, True, t, flow=flow)
    meta = ev.clip_meta(name)
    off = int(round((meta["startMs"] - app["startMs"]) / 100))
    return [list(r) for r in rects[off:off + meta["count"]]], (samples[off:off + meta["count"]], W, H, t)


def people_cut(rects, ctx):
    """Share of frames where a moving player (weight >= 2) is more than 25% outside the crop; and any player."""
    samples, W, H, t = ctx
    near = []
    for tm, boxes in samples:
        if not boxes:
            near.append((tm, []))
            continue
        tallest = sorted((b[3] for b in boxes), reverse=True)[: t["tallestCount"]]
        ref = fv.median(tallest)
        near.append((tm, [b for b in boxes if b[3] >= t["farShare"] * ref]))
    act = fv.activity_people(near, W, H, fv.STANDARD | ACAO)
    cut_m = cut_a = 0
    for k, a in enumerate(act):
        if k >= len(rects):
            break
        x, y, w, h = rects[k]
        cm = ca = False
        for b, wt in a:
            ix = max(0, min(b[0] + b[2], x + w) - max(b[0], x))
            iy = max(0, min(b[1] + b[3], y + h) - max(b[1], y))
            outside = 1 - ix * iy / max(b[2] * b[3], 1e-9)
            if outside > 0.25:
                ca = True
                cm = cm or wt >= 2
        cut_m += cm
        cut_a += ca
    n = max(len(act), 1)
    return cut_m / n, cut_a / n


def motion(rects, size):
    W, H = size
    cx = np.array([r[0] + r[2] / 2 for r in rects])
    v = np.abs(np.diff(cx)) / 0.1  # frame widths per second
    return float(np.percentile(v, 95)), float(np.mean(v))


def score(name, rects, ctx=None):
    truth = ev.load_truth(name)
    s = hb.scores(rects, truth, truth["size"])
    s["pan_p95"], s["pan_mean"] = motion(rects, truth["size"])
    s["zoom_max"] = float(max(1 / r[2] for r in rects))
    if ctx is not None:
        s["cut_moving"], s["cut_any"] = people_cut(rects, ctx)
    return s


def ball_ref(name):
    p = os.path.join(hb.OUT, f"{name}.{BALL_REF}.focus.json")
    if not os.path.exists(p):
        return None
    d = json.load(open(p))
    aspect = "portrait" if "portrait" in d else "landscape"
    return d[aspect]


COLS = [("ball_in_crop", "Ball in crop", "pct"), ("ball_off_centre", "Off centre", "f2"), ("zoom", "Zoom", "x"),
        ("zoom_max", "Zoom max", "x"), ("pan_p95", "Pan p95 (w/s)", "f2"), ("pan_mean", "Pan mean (w/s)", "f3"),
        ("jerk_p95", "Jerk p95", "f2"), ("v_flips_per_10s", "V flips/10 s", "f1"), ("cut_moving", "Moving cut", "pct"),
        ("cut_any", "Anyone cut", "pct")]


def fmt(v, kind):
    if v is None:
        return "—"
    return {"pct": f"{100 * v:.0f}%", "f2": f"{v:.2f}", "f3": f"{v:.3f}", "x": f"{v:.2f}x", "f1": f"{v:.1f}"}[kind]


def cmd_scores(a):
    os.makedirs(OUT, exist_ok=True)
    names = a.clips or (ALL_LABELLED if a.all else LABELLED)
    extra_variants(a.var)
    only = a.only.split(",") if a.only else list(VARIANTS)
    rows = {}
    for name in names:
        for vname in only:
            rects, ctx = variant_rects(name, VARIANTS[vname])
            if rects is None:
                continue
            rows.setdefault(vname, {})[name] = score(name, rects, ctx)
            meta = ev.clip_meta(name)
            json.dump({"v": 1, "stepMs": 100, "startMs": meta["startMs"], "size": ev.load_truth(name)["size"],
                       "rects": [[round(x, 4) for x in r] for r in rects], "tuning": VARIANTS[vname]},
                      open(os.path.join(OUT, f"{name}.{vname}.focus.json"), "w"))
        br = ball_ref(name)
        if br is not None:
            rows.setdefault("ball-v6", {})[name] = score(name, br[:ev.clip_meta(name)["count"]],
                                                         variant_rects(name, {})[1])
    head = "| Variant | " + " | ".join(c[1] for c in COLS) + " |"
    sep = "|---" * (len(COLS) + 1) + "|"
    lines = ["## Mean over " + ", ".join(names), "", head, sep]
    for vname, per in rows.items():
        vals = []
        for key, _, kind in COLS:
            xs = [s[key] for s in per.values() if s.get(key) is not None]
            vals.append(fmt(float(np.mean(xs)) if xs else None, kind))
        lines.append(f"| {vname} | " + " | ".join(vals) + " |")
    lines += ["", "## Per clip", "", "| Clip | Variant | " + " | ".join(c[1] for c in COLS) + " |",
              "|---" * (len(COLS) + 2) + "|"]
    for name in names:
        for vname, per in rows.items():
            if name in per:
                s = per[name]
                lines.append(f"| {name} | {vname} | " + " | ".join(fmt(s.get(k), kind) for k, _, kind in COLS) + " |")
    text = "\n".join(lines) + "\n"
    print(text)
    tag = a.tag or "scores"
    open(os.path.join(OUT, f"summary-{tag}.md"), "w").write(
        "# Test 13: broadcast camera from the players (lab)\n\nBall in crop / off centre on the labelled ball points; "
        "pan in frame widths per second; jerk in frame long sides / s²; moving cut = share of frames with a moving "
        "player more than 25% outside the crop.\n\n" + text)


def cmd_flow(a):
    import cv2
    os.makedirs(OUT, exist_ok=True)
    for name in a.clips or LABELLED + ["yt-bt-06", "bt-wa-1028"]:
        meta = ev.clip_meta(name)
        d = os.path.join(ev.FRAMES, name)
        files = sorted(f for f in os.listdir(d) if f.endswith(".jpg"))[: meta["count"]]
        prev, out = None, []
        long_side = a.size
        for f in files:
            img = cv2.imread(os.path.join(d, f), cv2.IMREAD_GRAYSCALE)
            h, w = img.shape
            s = long_side / max(h, w)
            img = cv2.resize(img, (int(round(w * s)), int(round(h * s))), interpolation=cv2.INTER_AREA)
            if prev is None:
                out.append(None)
                prev = img
                continue
            fl = cv2.calcOpticalFlowFarneback(prev, img, None, 0.5, 3, 15, 3, 5, 1.2, 0)
            prev = img
            out.append(flow_peak(fl))
        json.dump({"source": f"opencv-farneback-{long_side}", "stepMs": 100, "startMs": meta["startMs"],
                   "frames": out}, open(os.path.join(OUT, f"{name}.flow.json"), "w"))
        st = [v[2] for v in out if v is not None]
        print(f"{name}: {len(out)} frames, strength median {np.median(st):.4f}, p90 {np.percentile(st, 90):.4f}",
              flush=True)


def flow_peak(fl):
    """Fast-motion region: the peak of the flow magnitude (minus the frame's median, the camera's own shake) blurred
    over ~1/12 of the long side. Returns (x, y, strength) normalized (strength: long sides per 100 ms) or None."""
    import cv2
    h, w = fl.shape[:2]
    mag = np.hypot(fl[..., 0], fl[..., 1])
    mag = np.maximum(mag - np.median(mag), 0)
    k = max(3, int(max(h, w) / 12) | 1)
    blur = cv2.blur(mag, (k, k))
    yy, xx = np.unravel_index(int(np.argmax(blur)), blur.shape)
    strength = float(blur[yy, xx]) / max(h, w)
    if strength < 1e-4:
        return None
    return [round((xx + 0.5) / w, 4), round((yy + 0.5) / h, 4), round(strength, 5)]


def cmd_render(a):
    extra_variants(a.var)
    for name in a.clips or LABELLED:
        meta = ev.clip_meta(name)
        truth = ev.load_truth(name)
        with open(os.path.join(hb.OUT, f"{name}.current.focus.json")) as f:
            fc = json.load(f)
        aspect = "portrait" if truth["size"][1] > truth["size"][0] else "landscape"
        off = int(round((meta["startMs"] - fc["startMs"]) / 100))
        cur = fc[aspect][off:off + meta["count"]]
        var, _ = variant_rects(name, VARIANTS[a.variant])
        n = len(cur)
        tr = [None] * n
        mode = np.zeros(n)
        path = os.path.join(OUT, f"{name}.compare.{a.variant}.mp4")
        render(meta, cur, var, truth, path, a.variant)
        print("video:", os.path.relpath(path, ev.ROOT), flush=True)


def render(meta, cur, var, truth, out_path, label):
    """hybrid.render's layout with today's framing (orange) and the variant (cyan), and the labelled ball."""
    import cv2
    video = os.path.join(ev.ROOT, meta["video"])
    st = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_streams", "-of", "json",
                                    video], capture_output=True, text=True, check=True).stdout)["streams"][0]
    W, H = st["width"], st["height"]
    rot = int(st.get("tags", {}).get("rotate", 0))
    for side in st.get("side_data_list", []):
        if "rotation" in side:
            rot = int(side["rotation"])
    if abs(rot) % 180 == 90:
        W, H = H, W
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
                            "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", out_path], stdin=subprocess.PIPE)
    font = cv2.FONT_HERSHEY_SIMPLEX

    def text(img, s, org, scale=0.6):
        cv2.putText(img, s, org, font, scale, (0, 0, 0), 4, cv2.LINE_AA)
        cv2.putText(img, s, org, font, scale, (255, 255, 255), 2, cv2.LINE_AA)

    def crop(frame, r, w, h):
        x0, y0 = int(round(r[0] * W)), int(round(r[1] * H))
        x1, y1 = int(round((r[0] + r[2]) * W)), int(round((r[1] + r[3]) * H))
        return cv2.resize(frame[max(0, y0):min(H, y1), max(0, x0):min(W, x1)], (w, h), interpolation=cv2.INTER_AREA)

    fb, n = W * H * 3, 0
    while True:
        buf = dec.stdout.read(fb)
        if len(buf) < fb:
            break
        if n % keep:
            n += 1
            continue
        frame = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
        t = n * 1000 / fps
        rc, rv = hb.rect_at(t, cur), hb.rect_at(t, var)
        left = cv2.resize(frame, (pw, ph), interpolation=cv2.INTER_AREA)
        s = ph / H
        for r, col in ((rc, (0, 165, 255)), (rv, (255, 200, 0))):
            cv2.rectangle(left, (int(r[0] * W * s), int(r[1] * H * s)),
                          (int((r[0] + r[2]) * W * s), int((r[1] + r[3]) * H * s)), col, 3)
        g = truth["samples"].get(int(round(t / 200)) * 200) if truth else None
        if isinstance(g, tuple):
            cv2.circle(left, (int(g[0] * W * s), int(g[1] * H * s)), 14, (255, 255, 255), 2, cv2.LINE_AA)
        text(left, f"{t / 1000:4.1f}s", (12, 28))
        text(left, f"laranja: atual  azul: {label}", (12, ph - 14), 0.45)
        if portrait:
            a_, b_ = crop(frame, rc, pw, ph), crop(frame, rv, pw, ph)
            text(a_, "Modo Foco atual", (12, 28))
            text(b_, label, (12, 28))
            img = np.hstack([left, a_, b_])
        else:
            a_, b_ = crop(frame, rc, 640, 360), crop(frame, rv, 640, 360)
            text(a_, "Modo Foco atual", (12, 28))
            text(b_, label, (12, 28))
            img = np.vstack([left, np.hstack([a_, b_])])
        enc.stdin.write(np.ascontiguousarray(img).tobytes())
        n += 1
    enc.stdin.close()
    enc.wait()
    dec.wait()


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("scores")
    p.add_argument("--only")
    p.add_argument("--tag")
    p.add_argument("--var", action="append")
    p.add_argument("--all", action="store_true", help="the 17 labelled clips (4 + the 13 of 2026-11-05)")
    p.add_argument("clips", nargs="*")
    p = sub.add_parser("flow")
    p.add_argument("--size", type=int, default=320)
    p.add_argument("clips", nargs="*")
    p = sub.add_parser("render")
    p.add_argument("variant")
    p.add_argument("--var", action="append")
    p.add_argument("clips", nargs="*")
    a = ap.parse_args()
    {"scores": cmd_scores, "flow": cmd_flow, "render": cmd_render}[a.cmd](a)


if __name__ == "__main__":
    main()
