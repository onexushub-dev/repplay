#!/usr/bin/env python3
"""Modo Foco lab, test 12: Foco na Bola with ONE EdgeTAM pass instead of two.

Today's reference (spec 4.4) runs EdgeTAM twice at 10 fps: (1) the whole frame, (2) a 40% square crop cut from the
full-resolution video around pass 1's trusted ball. Two ways to keep the crop with a single pass:

(a) crops guided by the players' path only: `roi.py --guide p` + `oneclick.py --model edgetam --variant roi40p`
    (nothing new here; `report` scores it).
(b) `track` below: crops that FOLLOW THE BALL while tracking. Causal, as the phone would run it: from the click
    forwards, then from the click backwards (one memory bank, as coreml_export.py `track`). Each frame's crop is
    centred on the last plausible ball (plus its velocity when `--vel 1`), held for `--hold` frames after a loss, then
    glides back to the players' path (today's framing, the same path as roi.py's "p" guide). The crop is cut from the
    video at full resolution (decoded once into lab/cache/, same ffmpeg call as roi.py) and goes through JPEG q92 like
    roi.py's crops, so the only difference from the reference is where the crop is.
    `--lost full` (variant ...w): after a lost ball (past `--hold`) the tracker sees the WHOLE frame, squeezed to
    1024x1024 as in pass 1, until it finds a plausible ball again; then back to the 40% crop around it. Still one
    pass: each frame is encoded once, either the crop or the whole frame.
    `--probe N` (variant ...p): the crop goes back to the players as usual, but while the ball is lost the tracker
    also looks at the whole frame every N frames, with the same memory and without writing it to the bank (no change
    of scale in the memory); two hits in a row near each other move the crop there. Cost: one extra frame per search.
    Box seeds (basket-app-1031-a) go to the decoder as SAM's box prompt (two corners, labels 2 and 3); EdgeTAM's
    predictor uses its single-mask output for a box, this loop the best of the three (as for a click).
    "Plausible" = round 6's shape filters (hybrid.T: size, box, fill, aspect, largest piece; the racket-sport shape for
    racket sports) and the jump limit from the last plausible ball (growing with the gap up to jump_cap frames). The
    filters that look ahead in time (still ball, racket identity) stay in hybrid.py, which frames the result as usual.

The tracker is coreml_export.py's loop (fixed bank, empty slots switched off = EdgeTAM's predictor, test 10) on the
PyTorch wrappers (`--run torch`) or the Core ML models (`--run coreml:ne`). Each run is saved as an oneclick track
(lab/tests/oneclick/<clip>.ball.<tag>.json, with the crops), so hybrid.py --model <tag> frames and renders it.

    cd docs/focus-refs
    lab/.venv-edgetam/bin/python tools/lab/single_pass.py track bt-wa-1028 yt-basket-04 --vel 1
    lab/.venv-edgetam/bin/python tools/lab/single_pass.py report --tags edgetam-roi40b,edgetam-roi40p,edgetam-torch-fp16-roi40f
"""

from __future__ import annotations

import argparse
import io
import json
import math
import os
import subprocess
import sys
import time

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import evaluate as ev  # noqa: E402
import hybrid as hb  # noqa: E402
import roi as R  # noqa: E402

CACHE = os.path.join(ev.ROOT, "lab", "cache")
SINGLE = os.path.join(ev.ROOT, "lab", "tests", "single")
ONECLICK = os.path.join(ev.ROOT, "lab", "tests", "oneclick")
DEFAULT_CLIPS = ("bt-wa-1028", "yt-basket-04", "yt-bt-06", "volei-app-1102", "basket-v-01", "bt-E5003B6B",
                 "bt-0AE39B33", "basket-app-1031-a", "basket-app-1031-b")


# ---------------------------------------------------------------- full-resolution frames

class FullFrames:
    """The clip's 10 fps frames (the same as extract.sh / roi.py) at the video's full upright resolution, decoded once
    into lab/cache/<clip>.<W>x<H>.rgb and read back as a memmap."""

    def __init__(self, name):
        meta = ev.clip_meta(name)
        video = os.path.join(ev.ROOT, meta["video"])
        self.W, self.H = R.upright_size(video)
        fb = self.W * self.H * 3
        path = os.path.join(CACHE, f"{name}.{self.W}x{self.H}.rgb")
        info = path + ".json"
        count = None
        if os.path.exists(info) and os.path.exists(path):
            with open(info) as f:
                count = json.load(f)["count"]
            if os.path.getsize(path) != count * fb:
                count = None
        if count is None:
            os.makedirs(CACHE, exist_ok=True)
            t = time.time()
            dec = subprocess.Popen(["ffmpeg", "-nostdin", "-v", "error", "-ss", f"{meta['startMs'] / 1000}", "-i",
                                    video, "-t", f"{meta['durMs'] / 1000}", "-vf", "fps=10:start_time=0", "-f",
                                    "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
            count = 0
            with open(path, "wb") as f:
                while count < meta["count"]:
                    buf = dec.stdout.read(fb)
                    if len(buf) < fb:
                        break
                    f.write(buf)
                    count += 1
            dec.stdout.close()
            dec.wait()
            with open(info, "w") as f:
                json.dump({"count": count, "size": [self.W, self.H]}, f)
            print(f"{name}: {count} full-resolution frames cached ({time.time() - t:.0f} s, "
                  f"{count * fb / 1e9:.1f} GB in lab/cache/)", flush=True)
        self.count = count
        self.mm = np.memmap(path, dtype=np.uint8, mode="r", shape=(count, self.H, self.W, 3))
        self.crop_secs = 0.0

    def place(self, cx, cy, side):
        """Crop corner in px for a centre in whole-frame 0..1, kept inside the picture (as roi.py)."""
        x0 = int(np.clip(round(cx * self.W - side / 2), 0, self.W - side))
        y0 = int(np.clip(round(cy * self.H - side / 2), 0, self.H - side))
        return x0, y0

    def crop(self, k, rect, size=1024):
        """As roi.py writes it (JPEG q92) and coreml_export.Frames reads it (PIL resize to 1024, /255).
        rect = [x0, y0, w, h] px; the whole frame is squeezed to 1024x1024 as in pass 1."""
        t = time.perf_counter()
        x0, y0, w, h = rect
        c = np.ascontiguousarray(self.mm[k, y0:y0 + h, x0:x0 + w])
        buf = io.BytesIO()
        Image.fromarray(c).save(buf, format="JPEG", quality=92)
        buf.seek(0)
        with Image.open(buf) as im:
            a = np.array(im.convert("RGB").resize((size, size))) / 255.0
        self.crop_secs += time.perf_counter() - t
        return a.transpose(2, 0, 1)[None].astype(np.float32)


# ---------------------------------------------------------------- where the crop goes

def plausible(v, size, racket):
    """Round 6's per-frame shape filters (hybrid.trusted without the look-ahead ones). v: summary in 0..1."""
    if v is None:
        return False
    T = hb.T
    W, H = size
    L = max(W, H)
    area = v[6]
    if area <= 0 or area > T["area_max"]:
        return False
    wpx, hpx = v[4] * W, v[5] * H
    fill = area * W * H / max(1.0, wpx * hpx)
    main = v[7] if len(v) > 7 else 1.0
    if max(wpx, hpx) > T["box_max_frac"] * L or fill < T["fill_min"] or main < T["main_min"]:
        return False
    aspect_max = T["r_aspect_max"] if racket else T["aspect_max"]
    if max(wpx, hpx) / max(1e-6, min(wpx, hpx)) > aspect_max:
        return False
    if racket and fill < T["r_fill_min"]:
        return False
    return True


class Guide:
    """Crop centre per frame, for one direction of tracking (a new Guide from the click for each direction)."""

    def __init__(self, size, players, seed_frame, click, a):
        self.size, self.players, self.a = size, players, a
        self.last = (seed_frame, click[0], click[1])     # last plausible ball: (frame, x, y) in 0..1
        self.vel = (0.0, 0.0)                            # per frame index (signed: works both ways)
        self.c = (click[0], click[1])                    # current crop centre
        self.racket = False
        self.step = 1  # test 14: frames tracked (every step-th 10 fps frame)

    def centre(self, f):
        a = self.a
        i1, x1, y1 = self.last
        gap = abs(f - i1)
        if gap <= a.hold + 1:
            dx, dy = self.vel[0] * (f - i1), self.vel[1] * (f - i1)
            W, H = self.size
            L = max(W, H)
            d = math.hypot(dx * W, dy * H) / L
            lim = a.max_step * gap
            if d > lim > 0:
                dx, dy = dx * lim / d, dy * lim / d
            k = a.follow  # 1: the crop jumps onto the ball; < 1: it moves that share of the way per frame
            self.c = (self.c[0] + (x1 + dx - self.c[0]) * k, self.c[1] + (y1 + dy - self.c[1]) * k)
            how = "ball" if gap <= self.step else "hold"
        else:
            px, py = float(self.players[0][f]), float(self.players[1][f])
            self.c = (self.c[0] + (px - self.c[0]) * a.glide, self.c[1] + (py - self.c[1]) * a.glide)
            how = "players"
        return self.c[0], self.c[1], how

    def relocate(self, f, v):
        """The whole-frame search found the ball: the crop goes there at once."""
        self.last = (f, v[0], v[1])
        self.vel = (0.0, 0.0)
        self.c = (v[0], v[1])

    def update(self, f, v):
        if not plausible(v, self.size, self.racket):
            return False
        W, H = self.size
        L = max(W, H)
        i1, x1, y1 = self.last
        gap = abs(f - i1)
        d = math.hypot((v[0] - x1) * W, (v[1] - y1) * H) / L
        if d > hb.T["jump_frac"] * min(gap, hb.T["jump_cap"]):
            return False
        if self.a.vel and gap <= self.a.hold + 1:
            k = self.a.vel_alpha
            vx, vy = (v[0] - x1) / (f - i1), (v[1] - y1) / (f - i1)
            self.vel = (k * vx + (1 - k) * self.vel[0], k * vy + (1 - k) * self.vel[1])
        else:
            self.vel = (0.0, 0.0)
        self.last = (f, v[0], v[1])
        return True


# ---------------------------------------------------------------- the tracking loop

def track_follow(run, ff, side, seed_frame, click, nme, new_guide, store, lost="players", probe=0, step=1):
    """coreml_export.track with the crop chosen per frame by a Guide. Returns per frame: summary (whole frame 0..1),
    crop rect [x0, y0, w, h] px, how it was chosen, plausible or not. click: {"kind", "xy" (centre), "box"}."""
    import torch
    import torch.nn.functional as F

    import server as S
    from coreml_export import N_MEM, N_PTR

    n = ff.count
    out, rois, hows, oks = {}, {}, {}, {}
    probes = {}  # frame -> whole-frame search result (summary or None), only while the ball is lost

    def summary(mask, rect):
        x0, y0, w, h = rect
        m = F.interpolate(torch.from_numpy(mask), size=(h, w), mode="bilinear", align_corners=False)
        v = S.summarize((m[0, 0] > 0).numpy(), w, h)
        if v is None:
            return None
        cx, cy, x, y, bw, bh, ar = v[:7]
        return [round((x0 + cx * w) / ff.W, 4), round((y0 + cy * h) / ff.H, 4), round((x0 + x * w) / ff.W, 4),
                round((y0 + y * h) / ff.H, 4), round(bw * w / ff.W, 4), round(bh * h / ff.H, 4),
                round(ar * w * h / (ff.W * ff.H), 6)] + list(v[7:])

    def to1024(px, py, rect):
        return [(px * ff.W - rect[0]) / rect[2] * 1024, (py * ff.H - rect[1]) / rect[3] * 1024]

    bank = {}
    x0, y0 = ff.place(click["xy"][0], click["xy"][1], side)
    rect = [x0, y0, side, side]
    rois[seed_frame] = rect
    hows[seed_frame] = "seed"
    s0, s1, vis = run("encoder", ff.crop(seed_frame, rect))
    pix = vis + nme.reshape(1, -1, 1, 1)
    if click["kind"] == "box":  # SAM's box prompt: the two corners, labels 2 and 3
        bx, by, bw, bh = click["box"]
        pts = np.array([[to1024(bx, by, rect), to1024(bx + bw, by + bh, rect)]], np.float32)
        labels = np.array([[2.0, 3.0]], np.float32)
    else:
        pts = np.array([[to1024(click["xy"][0], click["xy"][1], rect), [0.0, 0.0]]], np.float32)
        labels = np.array([[1.0, -1.0]], np.float32)
    mask, ptr, _score, _ = run("decoder", pix, s0, s1, pts, labels)
    (mem,) = run("memory", vis, mask, np.ones((1, 1), np.float32))
    cond = (store(mem[0]), ptr[0])
    out[seed_frame] = summary(mask, rect)
    oks[seed_frame] = True
    pad = np.zeros((1, 2, 2), np.float32)
    none = np.array([[-1.0, -1.0]], np.float32)
    full = [0, 0, ff.W, ff.H]
    for sign, order in ((1, range(seed_frame + step, n, step)), (-1, range(seed_frame - step, -1, -step))):
        g = new_guide()
        g.step = step
        cand = None  # last whole-frame search hit: (frame, summary)
        lost_n = 0
        for f in order:
            cx, cy, how = g.centre(f)
            if how == "players" and lost == "full":
                rect = [0, 0, ff.W, ff.H]
                how = "full"
            else:
                x0, y0 = ff.place(cx, cy, side)
                rect = [x0, y0, side, side]
            rois[f] = rect
            hows[f] = how
            s0, s1, vis = run("encoder", ff.crop(f, rect))
            prev = [bank.get(f - sign * step * (N_MEM - t)) for t in range(1, N_MEM)]
            pprev = [bank.get(f - sign * step * t) for t in range(1, N_PTR)]
            mems = [cond[0]] + [cond[0] if p is None else p[0] for p in prev]
            ptrs = [cond[1]] + [cond[1] if p is None else p[1] for p in pprev]
            mon = np.array([[1.0] + [0.0 if p is None else 1.0 for p in prev]], np.float32)
            pon = np.array([[1.0] + [0.0 if p is None else 1.0 for p in pprev]], np.float32)
            (pix,) = run("attention", vis, np.stack(mems).astype(np.float32), np.stack(ptrs).astype(np.float32),
                         mon, pon)
            mask, ptr, _score, _ = run("decoder", pix, s0, s1, pad, none)
            (mem,) = run("memory", vis, mask, np.zeros((1, 1), np.float32))
            bank[f] = (store(mem[0]), ptr[0])
            v = summary(mask, rect)
            out[f] = v
            oks[f] = g.update(f, v)
            lost_n = lost_n + 1 if how == "players" else 0
            if probe and how == "players" and not oks[f] and (lost_n - 1) % probe == 0:
                # search the whole frame with the same memory, without writing it to the bank (the bank stays at
                # the crop's scale); two hits in a row near each other move the crop there
                ps0, ps1, pvis = run("encoder", ff.crop(f, full))
                (ppix,) = run("attention", pvis, np.stack(mems).astype(np.float32),
                              np.stack(ptrs).astype(np.float32), mon, pon)
                pmask, _pp, _ps, _ = run("decoder", ppix, ps0, ps1, pad, none)
                pv = summary(pmask, full)
                probes[f] = pv
                if plausible(pv, g.size, g.racket):
                    if cand is not None:
                        W_, H_ = g.size
                        gap = abs(f - cand[0])
                        d = math.hypot((pv[0] - cand[1][0]) * W_, (pv[1] - cand[1][1]) * H_) / max(W_, H_)
                        if d <= hb.T["jump_frac"] * min(gap, hb.T["jump_cap"]):
                            g.relocate(f, pv)
                            out[f] = pv
                            oks[f] = True
                            hows[f] = "found"
                            lost_n = 0
                            cand = None
                            continue
                    cand = (f, pv)
                else:
                    cand = None
    return out, rois, hows, oks, probes


def make_runner(name):
    import coreml_export as C

    if name == "torch":
        return C.TorchRunner(C.make_parts(C.build_model()))
    if name.startswith("coreml:"):
        return C.CoreMLRunner(C.OUT, name.split(":")[1])
    sys.exit(f"unknown run {name}")


def cmd_track(a):
    import coreml_export as C

    os.makedirs(SINGLE, exist_ok=True)
    with open(os.path.join(C.OUT, "edgetam_constants.json")) as f:
        nme = np.array(json.load(f)["no_mem_embed"], np.float32)
    run = make_runner(a.run)
    variant = f"roi{int(round(a.size * 100))}f" + ("" if a.vel else "0") + ("w" if a.lost == "full" else "") + \
        (f"s{int(round(a.follow * 100))}" if a.follow < 1 else "") + \
        (("p" if a.probe == 1 else f"p{a.probe}") if a.probe else "") + a.suffix + \
        ("" if a.step == 1 else f"-{10 // a.step}fps")
    tag = "edgetam-" + a.run.replace(":", "-") + f"-{a.store}-{variant}"
    for name in a.clips or DEFAULT_CLIPS:
        meta = ev.clip_meta(name)
        truth = ev.load_truth(name)
        seed = [p for p in truth["prompts"] if not p.get("neg")][0]
        if seed["kind"] == "box":
            bx, by, bw, bh = seed["xy"]
            click = {"kind": "box", "xy": [bx + bw / 2, by + bh / 2], "box": [bx, by, bw, bh]}
        else:
            click = {"kind": "point", "xy": list(seed["xy"])}
        s = int(round(seed["ms"] / 100))
        ff = FullFrames(name)
        side = int(min(round(a.size * max(ff.W, ff.H)), min(ff.W, ff.H))) // 2 * 2
        cx, cy, _ = R.guide_path(name, "p", None)
        racket = meta["sport"] in hb.RACKET_SPORTS and bool(hb.T["racket"])

        def new_guide():
            g = Guide(meta["size"], (cx, cy), s, click["xy"], a)
            g.racket = racket
            return g

        for k in C.NAMES:
            run.secs[k], run.calls[k] = 0.0, 0
        ff.crop_secs = 0.0
        t = time.time()
        out, rois, hows, oks, probes = track_follow(run, ff, side, s, click, nme, new_guide, C.STORES[a.store],
                                                    a.lost, a.probe, a.step)
        secs = time.time() - t
        tracked = len(out)
        if a.step > 1:
            import low_fps
            off10 = s % a.step
            out = low_fps.upsample(out, ff.count, a.step, off10)
            for f in range(ff.count):
                if f not in rois:
                    g0 = max(off10, off10 + ((f - off10) // a.step) * a.step)
                    rois[f], hows[f], oks[f] = rois.get(g0, rois[s]), "interp", False
        pred_one = {str(f): out[f] for f in sorted(out)}
        res = judge(name, truth, pred_one, rois, side, (ff.W, ff.H))
        per = {p: round(1000 * run.secs[p] / max(1, run.calls[p]), 1) for p in C.NAMES}
        share = {h: round(sum(1 for x in hows.values() if x == h) / len(hows), 3)
                 for h in ("ball", "hold", "players", "full", "found")}
        extra = {"tag": tag, "run": a.run, "store": a.store, "side": side, "size": [ff.W, ff.H],
                 "vel": a.vel, "lost": a.lost, "follow": a.follow, "probe": a.probe,
                 "probes": len(probes), "passes": round((tracked + len(probes)) / max(1, tracked), 2), "seed_kind": click["kind"], "hold": a.hold, "glide": a.glide, "max_step": a.max_step, "vel_alpha": a.vel_alpha,
                 "step": a.step, "frames_tracked": tracked,
                 "seconds": round(secs, 1), "ms_per_frame_models": round(sum(per.values()), 1),
                 "ms_per_frame_crop": round(1000 * ff.crop_secs / max(1, tracked), 1), "ms_per_call": per,
                 "centre_from": share, "judge": res}
        with open(os.path.join(ONECLICK, f"{name}.ball.{tag}.json"), "w") as f:
            json.dump({"clip": name, "mode": "ball", "seedMs": s * 100, "frames": len(out), "fps": 10,
                       "source": "single_pass.py track", "side": side, "size": [ff.W, ff.H],
                       "rois": [rois[f] for f in range(len(out))], "how": [hows[f] for f in range(len(out))],
                       "plausible": [bool(oks.get(f, False)) for f in range(len(out))], "pred_one": pred_one,
                       "extra": extra}, f, separators=(",", ":"))
        with open(os.path.join(SINGLE, f"{name}.{tag}.json"), "w") as f:
            json.dump(extra, f, indent=1)
        lab = f", hits {100 * res['recall']:.0f}%" if res.get("recall") is not None else ""
        inroi = f", ball in ROI {100 * res['ball_in_roi']:.0f}%" if res.get("ball_in_roi") is not None else ""
        print(f"{name} [{tag}] ball mode {100 * res['ball_mode']:.0f}%{lab}{inroi}; crop from ball/hold/players/"
              f"whole frame {100 * share['ball']:.0f}/{100 * share['hold']:.0f}/{100 * share['players']:.0f}/"
              f"{100 * share['full']:.0f}%; whole-frame searches {len(probes)} ({extra['passes']} passes); {secs:.0f} s "
              f"({extra['ms_per_frame_models']} ms/frame models)", flush=True)
        if not a.keep_cache:
            path = ff.mm.filename
            del ff
            for p in (path, path + ".json"):
                if os.path.exists(p):
                    os.remove(p)


# ---------------------------------------------------------------- scoring

def judge(clip, truth, pred_one, rois=None, side=None, full=None):
    """coreml_export.judge (ball mode, round 6; hits on labelled clips) + the share of labelled balls inside the
    crop the tracker saw."""
    meta = ev.clip_meta(clip)
    n = meta["count"]
    tr = hb.trusted(pred_one, n, truth["size"], meta["sport"])
    segs = hb.ball_mode(tr, truth["size"])
    res = {"ball_mode": round(sum(b - a + 1 for a, b in segs) / n, 3)}
    pred = {int(f) * 100: (None if v is None else (v[0], v[1])) for f, v in pred_one.items()}
    sc = ev.score_track(truth, pred)
    if sc["points"] >= 10:
        res.update({k: (round(v, 3) if isinstance(v, float) else v) for k, v in sc.items()})
        if rois is not None:
            W, H = full
            inside = pts = 0
            look = rois if isinstance(rois, dict) else dict(enumerate(rois))
            for t, v in truth["samples"].items():
                k = t // 100
                if not isinstance(v, tuple) or k not in look:
                    continue
                r = look[k]
                x0, y0 = r[0], r[1]
                w, h = (r[2], r[3]) if len(r) > 2 else (side, side)
                pts += 1
                if x0 <= v[0] * W <= x0 + w and y0 <= v[1] * H <= y0 + h:
                    inside += 1
            res["ball_in_roi"] = round(inside / pts, 3) if pts else None
    return res


def load_rois(name, tag, oc):
    if "rois" in oc:
        return oc["rois"], oc["side"], oc["size"]
    variant = tag.split("-")[-1]
    path = os.path.join(ev.FRAMES, f"{name}@{variant}", "roi.json")
    if variant.startswith("roi") and os.path.exists(path):
        with open(path) as f:
            r = json.load(f)
        return r["rois"], r["side"], r["size"]
    return None, None, None


def cmd_report(a):
    tags = a.tags.split(",")
    rows = ["| Clip | Run | Ball mode | Hits (labels) | Ball in ROI | Hybrid: ball in crop | off centre | jerk p95 |",
            "|---|---|---|---|---|---|---|---|"]
    res = {}
    for name in a.clips or DEFAULT_CLIPS:
        meta = ev.clip_meta(name)
        truth = ev.load_truth(name)
        with open(os.path.join(hb.OUT, f"{name}.current.focus.json")) as f:
            fc = json.load(f)
        aspect = "portrait" if truth["size"][1] > truth["size"][0] else "landscape"
        off = int(round((meta["startMs"] - fc["startMs"]) / 100))
        n = meta["count"]
        cur = fc[aspect][off:off + n]
        zoom = max(1 / r[2] for r in cur)
        for tag in tags:
            path = os.path.join(ONECLICK, f"{name}.ball.{tag}.json")
            if not os.path.exists(path):
                rows.append(f"| {name} | {tag} | (not run) | | | | | |")
                continue
            with open(path) as f:
                oc = json.load(f)
            rois, side, full = load_rois(name, tag, oc)
            j = judge(name, truth, oc["pred_one"], rois, side, full)
            tr = hb.trusted(oc["pred_one"], n, truth["size"], meta["sport"])
            hyb, _mode, _segs = hb.hybrid_rects(cur, tr, truth["size"], zoom)
            sh = hb.scores(hyb, truth, truth["size"])
            res.setdefault(name, {})[tag] = {"judge": j, "hybrid": sh}
            oc_ = lambda v: "—" if v is None else f"{v:.2f}"  # noqa: E731
            few = sh["points"] < 10  # clips with only the click labelled: no crop scores
            rows.append(f"| {name} | {tag} | {100 * j['ball_mode']:.0f}% | {ev.fmt(j.get('recall'))} "
                        f"| {ev.fmt(j.get('ball_in_roi'))} | {'—' if few else ev.fmt(sh['ball_in_crop'])} "
                        f"| {'—' if few else oc_(sh['ball_off_centre'])} | {sh['jerk_p95']:.2f} |")
    os.makedirs(SINGLE, exist_ok=True)
    with open(os.path.join(SINGLE, f"report.{a.name}.md"), "w") as f:
        f.write("# One pass vs two (test 12)\n\nBall mode = share of the clip in ball mode (round 6). Hits = one-click "
                "track on the labelled ball points. Ball in ROI = labelled balls inside the crop the tracker saw. "
                "Hybrid = hybrid.py round 6 on the labelled points.\n\n" + "\n".join(rows) + "\n")
    with open(os.path.join(SINGLE, f"report.{a.name}.json"), "w") as f:
        json.dump(res, f, indent=1)
    print("\n".join(rows))
    print(f"\nsaved lab/tests/single/report.{a.name}.md")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("track", help="(b) one pass, the crop following the previous frame's ball")
    t.add_argument("clips", nargs="*")
    t.add_argument("--run", default="torch", help="torch | coreml:ne | coreml:all | coreml:gpu | coreml:cpu")
    t.add_argument("--store", default="fp16", choices=("fp16", "bf16", "fp32"))
    t.add_argument("--size", type=float, default=0.4, help="crop side as a share of the long side (capped)")
    t.add_argument("--vel", type=int, default=1, help="1: lead the crop by the ball's velocity; 0: last position")
    t.add_argument("--vel-alpha", type=float, default=0.5, help="velocity smoothing (EMA weight of the newest)")
    t.add_argument("--max-step", type=float, default=0.1, help="max predicted move per frame, long sides")
    t.add_argument("--follow", type=float, default=1.0,
                   help="share of the way to the ball the crop moves per frame (1 = jump onto it; variant ...sNN)")
    t.add_argument("--hold", type=int, default=3, help="frames the crop stays on a lost ball before going back")
    t.add_argument("--glide", type=float, default=0.35, help="share of the way to the players' centre per frame")
    t.add_argument("--lost", choices=("players", "full"), default="players",
                   help="after a lost ball: players = the 40%% crop glides to the players' path; full = the tracker "
                        "sees the whole frame (as pass 1) until the ball is found again (variant ...w)")
    t.add_argument("--probe", type=int, default=0,
                   help="N > 0: while the ball is lost, also search the whole frame every N frames (no memory "
                        "written); two hits in a row near each other move the crop there (variant ...p / ...pN)")
    t.add_argument("--suffix", default="", help="added to the variant name (tag), for tuning runs")
    t.add_argument("--step", type=int, default=1,
                   help="test 14: track every STEP-th 10 fps frame (2 = 5 fps), interpolated back (tag ...-5fps)")
    t.add_argument("--keep-cache", action="store_true", help="keep the decoded full-resolution frames (lab/cache/)")
    r = sub.add_parser("report", help="score oneclick tracks side by side (judge + hybrid round 6)")
    r.add_argument("clips", nargs="*")
    r.add_argument("--tags", required=True, help="comma list of oneclick tags, e.g. edgetam-roi40b,edgetam-roi40p")
    r.add_argument("--name", default="single", help="report file name: lab/tests/single/report.<name>.md")
    a = ap.parse_args()
    {"track": cmd_track, "report": cmd_report}[a.cmd](a)


if __name__ == "__main__":
    main()
