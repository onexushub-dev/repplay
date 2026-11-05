#!/usr/bin/env python3
"""Modo Foco lab: labelling server with SAM 2 assist (test bench only, nothing here goes into the app).

Serves the labelling page (index.html) on http://127.0.0.1:8765 and runs SAM 2 on the frames made by extract.sh:
every click on the ball (or a player) becomes a SAM 2 prompt, SAM 2 follows the object through the clip, and the page
shows where it thinks the object is on every frame, so labelling is mostly accepting (Enter) and fixing where it is lost.

    cd docs/focus-refs
    lab/.venv/bin/python tools/lab/server.py                    # SAM 2.1 tiny on the Mac GPU (MPS)
    lab/.venv/bin/python tools/lab/server.py --model small      # slower, more precise
    python3 tools/lab/server.py --backend none                  # no SAM: the proposal is the last click (page check)

Files (paths relative to docs/focus-refs):
- lab/frames/<clip>/NNNNN.jpg + frames.json   one frame every 100 ms (extract.sh)
- labels/<clip>.<mode>.json                   the labels (mode: ball | person); kept in git
- lab/sam/<clip>.<mode>.json                  last SAM 2 result per clip and mode (cache)

Label file: {"v": 2, "name", "mode", "video", "startMs", "stepMs": 100, "size": [w, h],
             "samples": {"<ms>": [x, y] | [x, y, w, h] | "out" | "none"},   ms from the start of the window
             "src": {"<ms>": "sam" | "click"},                               accepted SAM 2 proposal or a human click
             "prompts": [{"ms", "kind": "point" | "box", "xy": [...], "neg": bool}], "updated"}
Points and boxes are 0..1 of the frame, origin top-left; a box is [x, y, w, h].
"ball": [x, y] is the ball's centre. "person": [x, y, w, h] is the chosen player's box.
"out": ball not in play / player out of the picture. "none": in play but not visible (hidden, blurred away).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import queue
import sys
import threading
import time
import traceback
import webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))  # docs/focus-refs
FRAMES = os.path.join(ROOT, "lab", "frames")
CACHE = os.path.join(ROOT, "lab", "sam")
LABELS = os.path.join(ROOT, "labels")
MODES = ("ball", "person")

SAM_MODELS = {
    # name: (config inside the sam2 package, checkpoint file in lab/models)
    "tiny": ("configs/sam2.1/sam2.1_hiera_t.yaml", "sam2.1_hiera_tiny.pt"),
    "small": ("configs/sam2.1/sam2.1_hiera_s.yaml", "sam2.1_hiera_small.pt"),
    "base_plus": ("configs/sam2.1/sam2.1_hiera_b+.yaml", "sam2.1_hiera_base_plus.pt"),
    # EdgeTAM (facebookresearch/EdgeTAM, Apache-2.0): SAM 2 distilled for phones. Needs its own env:
    # lab/.venv-edgetam (tools/lab/setup-edgetam.sh), since its package is also called sam2.
    "edgetam": ("configs/edgetam.yaml", "edgetam.pt"),
}


# ---------------------------------------------------------------- data


def clip_names() -> list[str]:
    names = []
    with open(os.path.join(HERE, "clips.txt")) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                name = line.split("|")[0]
                if os.path.exists(os.path.join(FRAMES, name, "frames.json")):
                    names.append(name)
    return names


def meta(name: str) -> dict:
    with open(os.path.join(FRAMES, name, "frames.json")) as f:
        return json.load(f)


def label_path(name: str, mode: str) -> str:
    return os.path.join(LABELS, f"{name}.{mode}.json")


def load_labels(name: str, mode: str) -> dict:
    p = label_path(name, mode)
    if os.path.exists(p):
        with open(p) as f:
            return json.load(f)
    m = meta(name)
    return {"v": 2, "name": name, "mode": mode, "video": m["video"], "startMs": m["startMs"], "stepMs": 100,
            "size": m["size"], "samples": {}, "src": {}, "prompts": []}


def write_json(path: str, data: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    os.replace(tmp, path)


def prompts_hash(prompts: list) -> str:
    key = [(int(p["ms"]), p["kind"], [round(v, 4) for v in p["xy"]], bool(p.get("neg"))) for p in prompts]
    key.sort()
    return hashlib.sha1(json.dumps(key).encode()).hexdigest()[:12]


def cache_path(name: str, mode: str) -> str:
    return os.path.join(CACHE, f"{name}.{mode}.json")


def load_cache(name: str, mode: str):
    p = cache_path(name, mode)
    if not os.path.exists(p):
        return None
    with open(p) as f:
        return json.load(f)


def progress(name: str, mode: str, stride_ms: int = 200) -> dict:
    m = meta(name)
    total = len(range(0, m["count"] * 100, stride_ms))
    lab = load_labels(name, mode)["samples"]
    done = sum(1 for t in range(0, m["count"] * 100, stride_ms) if str(t) in lab)
    return {"done": done, "total": total}


# ---------------------------------------------------------------- trackers


def summarize(mask, w: int, h: int):
    """Mask (bool H x W numpy) -> [cx, cy, x, y, bw, bh, area, main] in 0..1, or None when empty.

    Only the largest connected piece of the mask counts (2026-11-03: on the full-resolution ROI crops EdgeTAM's ball
    masks came with stray specks far away, which blew the box up to 300x390 px around a 13x15 px ball and made the
    shape filters drop a correct ball). `main` = that piece's share of the whole mask (1 = clean)."""
    import numpy as np

    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    main = 1.0
    try:
        import cv2

        n, lab, stats, _c = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
        if n > 2:
            k = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
            main = float(stats[k, cv2.CC_STAT_AREA]) / len(xs)
            ys, xs = np.nonzero(lab == k)
    except ImportError:  # no OpenCV: the whole mask, as before
        pass
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    return [round(float(xs.mean()) / w, 4), round(float(ys.mean()) / h, 4), round(x0 / w, 4), round(y0 / h, 4),
            round((x1 - x0) / w, 4), round((y1 - y0) / h, 4), round(len(xs) / (w * h), 6), round(main, 3)]


class Ctx:
    """What a tracker gets from the job: progress, partial results for the page, and the cancel flag."""

    def __init__(self, report, publish, stop):
        self.report, self.publish, self.stop = report, publish, stop


def canon(p) -> tuple:
    return (int(round(p["ms"] / 100)), p["kind"], tuple(round(v, 4) for v in p["xy"]), bool(p.get("neg")))


class NoTracker:
    """No model: each frame proposes the last positive click before it (checks the page without SAM 2)."""

    name = "none"

    def run(self, clip: str, mode: str, prompts: list, ctx: Ctx):
        pos = sorted((p for p in prompts if not p.get("neg")), key=lambda p: p["ms"])
        count = meta(clip)["count"]
        out = {}
        for i in range(count):
            t = i * 100
            last = None
            for p in pos:
                if p["ms"] <= t:
                    last = p
            if last is None:
                out[i] = None
                continue
            xy = last["xy"]
            if last["kind"] == "box":
                x, y, bw, bh = xy
                out[i] = [x + bw / 2, y + bh / 2, x, y, bw, bh, bw * bh]
            else:
                out[i] = [xy[0], xy[1], xy[0] - 0.01, xy[1] - 0.01, 0.02, 0.02, 0.0004]
            ctx.report(i + 1, count)
        return out, None


class Sam2Tracker:
    """SAM 2.1 video predictor (facebookresearch/sam2, Apache-2.0), one object per clip and mode.

    Incremental: the SAM 2 state stays alive between jobs of the same clip and mode. When the only change is new prompts
    (the usual case: a correction click), only the frames from the earliest new prompt onward are recomputed, and the
    frames before the first prompt only when the first prompt moved earlier. Removing a prompt redoes the whole clip.
    A newer job cancels the running one between frames; what was not recomputed is remembered and redone next time.
    """

    def __init__(self, model: str, device: str | None, random_weights: bool = False, max_cond: int = 4):
        os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
        import torch
        from sam2.build_sam import build_sam2_video_predictor

        if device is None:
            device = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")
        cfg, ckpt = SAM_MODELS[model]
        ckpt_path = os.path.join(ROOT, "lab", "models", ckpt)
        if random_weights:
            ckpt_path = None  # code-path check only: the masks mean nothing
        elif not os.path.exists(ckpt_path):
            raise RuntimeError(f"checkpoint missing: {ckpt_path} (run: bash tools/lab/setup-mac.sh {model})")
        self.torch = torch
        self.device = device
        self.name = (f"{model}@{device}" if model == "edgetam" else f"sam2.1-{model}@{device}") + ("-RANDOM" if random_weights else "")
        print(f"loading {self.name} ...", flush=True)
        if model == "edgetam":
            # EdgeTAM's RepViT trunk asks timm for ImageNet weights (a Hugging Face download, which also needs
            # huggingface_hub); the EdgeTAM checkpoint overwrites every one of them right after, so skip it.
            import sam2.modeling.backbones.timm as edgetam_trunk

            _create = edgetam_trunk.create_model
            edgetam_trunk.create_model = lambda *a, **k: _create(*a, **dict(k, pretrained=False))
        self.predictor = build_sam2_video_predictor(cfg, ckpt_path, device=device)
        # SAM 2 attends to every clicked frame by default (-1), so each correction slows every later frame (seen on the
        # Mac: 0.6 s/frame with 1 click, 3 s/frame with 30). Keep the temporally closest ones only (SAM 2's own option).
        self.predictor.max_cond_frames_in_attn = max_cond
        self.state = None
        self.state_clip = None
        self._forget()

    def _forget(self):
        self.key = None          # (clip, mode) the SAM 2 state holds prompts for
        self.applied = set()     # canon prompts already added to the state
        self.first = None        # earliest prompted frame
        self.out = {}            # frame -> summary, as of the last run
        self.fwd_dirty = None    # earliest frame whose forward result is out of date
        self.rev_dirty = False   # frames before `first` need the reverse pass

    def _state(self, clip: str):
        if self.state_clip != clip:
            self.state = None
            self._forget()
            if self.device == "mps":
                self.torch.mps.empty_cache()
            t0 = time.time()
            self.state = self.predictor.init_state(video_path=os.path.join(FRAMES, clip), offload_video_to_cpu=True)
            self.state_clip = clip
            print(f"{clip}: frames loaded in {time.time() - t0:.1f}s", flush=True)
        return self.state

    def _add(self, state, prompts_of_frame: list, idx: int):
        import numpy as np

        W, H = state["video_width"], state["video_height"]
        pts, lbl, box = [], [], None
        for p in prompts_of_frame:
            if p["kind"] == "box":
                x, y, bw, bh = p["xy"]
                box = np.array([x * W, y * H, (x + bw) * W, (y + bh) * H], dtype=np.float32)
            else:
                pts.append([p["xy"][0] * W, p["xy"][1] * H])
                lbl.append(0 if p.get("neg") else 1)
        self.predictor.add_new_points_or_box(
            inference_state=state, frame_idx=idx, obj_id=1,
            points=np.array(pts, dtype=np.float32) if pts else None,
            labels=np.array(lbl, dtype=np.int32) if lbl else None,
            box=box, clear_old_points=True)

    def run(self, clip: str, mode: str, prompts: list, ctx: Ctx):
        state = self._state(clip)
        W, H = state["video_width"], state["video_height"]
        count = state["num_frames"]
        by_frame: dict[int, list] = {}
        for p in prompts:
            by_frame.setdefault(int(round(p["ms"] / 100)), []).append(p)
        new = {canon(p) for p in prompts}
        if not by_frame:
            self.predictor.reset_state(state)
            self._forget()
            return {}, None

        incremental = self.key == (clip, mode) and self.applied and self.applied <= new
        if incremental:
            changed = {c[0] for c in new - self.applied}
            first = min(by_frame)
            if changed:
                self.fwd_dirty = min(changed | ({self.fwd_dirty} if self.fwd_dirty is not None else set()))
                if first < self.first:
                    self.rev_dirty = True
        else:
            self.predictor.reset_state(state)
            self._forget()
            changed = set(by_frame)
            first = min(by_frame)
            self.fwd_dirty = first
            self.rev_dirty = first > 0
        for idx in sorted(changed):
            self._add(state, by_frame[idx], idx)
        self.key, self.applied, self.first = (clip, mode), new, first
        out = self.out

        todo = (count - self.fwd_dirty if self.fwd_dirty is not None else 0) + (first + 1 if self.rev_dirty else 0)
        done = 0
        if self.fwd_dirty is not None:
            start, last = self.fwd_dirty, self.fwd_dirty - 1
            for f, _ids, logits in self.predictor.propagate_in_video(state, start_frame_idx=start, reverse=False):
                f = int(f)
                out[f] = summarize((logits[0, 0] > 0).cpu().numpy(), W, H)
                last, done = f, done + 1
                ctx.report(done, todo)
                if done in (2, 5) or done % 8 == 0:
                    ctx.publish(out, [f + 1, count - 1])
                if ctx.stop():
                    break
            self.fwd_dirty = last + 1 if last + 1 < count else None
            if self.fwd_dirty is not None:
                return out, [self.fwd_dirty, count - 1]
        if self.rev_dirty:
            for f, _ids, logits in self.predictor.propagate_in_video(state, start_frame_idx=first, reverse=True):
                f = int(f)
                out[f] = summarize((logits[0, 0] > 0).cpu().numpy(), W, H)
                done += 1
                ctx.report(done, todo)
                if done in (2, 5) or done % 8 == 0:
                    ctx.publish(out, [0, f - 1])
                if ctx.stop():
                    return out, [0, max(0, f - 1)]
            self.rev_dirty = False
        return out, None


# ---------------------------------------------------------------- job queue


class Jobs:
    """One worker; a newer request for the same clip and mode replaces a waiting one and stops a running one."""

    def __init__(self, make_tracker):
        self.make_tracker = make_tracker
        self.tracker = None
        self.q: queue.Queue = queue.Queue()
        self.pending: dict = {}
        self.running = None
        self.cancel = False
        self.lock = threading.Lock()
        self.status = {"state": "idle", "name": None, "mode": None, "done": 0, "total": 0, "msg": "", "model": None}
        threading.Thread(target=self._loop, daemon=True).start()

    def submit(self, name: str, mode: str) -> None:
        with self.lock:
            if self.running == (name, mode):
                self.cancel = True
            if (name, mode) in self.pending:
                return
            self.pending[(name, mode)] = True
        self.q.put((name, mode))

    def _set(self, **kw):
        with self.lock:
            self.status.update(kw)

    def snapshot(self) -> dict:
        with self.lock:
            s = dict(self.status)
            s["queued"] = [f"{n}.{m}" for (n, m) in self.pending]
            return s

    def _write(self, name, mode, h, frames, pending, elapsed):
        write_json(cache_path(name, mode), {
            "name": name, "mode": mode, "model": self.tracker.name, "hash": h, "elapsedS": round(elapsed, 1),
            "pending": pending, "frames": {str(i): v for i, v in sorted(frames.items())}})

    def _loop(self):
        while True:
            name, mode = self.q.get()
            with self.lock:
                self.pending.pop((name, mode), None)
                self.running, self.cancel = (name, mode), False
            try:
                if self.tracker is None:
                    self._set(state="loading", name=name, mode=mode, msg="carregando o modelo")
                    self.tracker = self.make_tracker()
                    self._set(model=self.tracker.name)
                labels = load_labels(name, mode)
                prompts = labels["prompts"]
                h = prompts_hash(prompts)
                cached = load_cache(name, mode)
                if (cached and cached.get("hash") == h and cached.get("model") == self.tracker.name
                        and not cached.get("pending")):
                    self._set(state="done", name=name, mode=mode, msg="já estava pronto")
                    continue
                self._set(state="running", name=name, mode=mode, done=0, total=meta(name)["count"], msg="")
                t0 = time.time()
                ctx = Ctx(report=lambda d, t: self._set(done=d, total=t),
                          publish=lambda fr, pend: self._write(name, mode, h, fr, pend, time.time() - t0),
                          stop=lambda: self.cancel)
                frames, pending = self.tracker.run(name, mode, prompts, ctx)
                elapsed = time.time() - t0
                self._write(name, mode, h, frames, pending, elapsed)
                what = "interrupted" if pending else "done"
                print(f"{name}.{mode}: {len(prompts)} prompts, {what} in {elapsed:.1f}s", flush=True)
                self._set(state="done", name=name, mode=mode, msg=f"{elapsed:.0f}s")
            except Exception as e:  # keep serving; the page shows the error
                traceback.print_exc()
                self._set(state="error", name=name, mode=mode, msg=str(e)[:300])
            finally:
                with self.lock:
                    self.running = None


# ---------------------------------------------------------------- HTTP


class Handler(SimpleHTTPRequestHandler):
    jobs: Jobs = None  # type: ignore

    def log_message(self, fmt, *args):  # quiet: only errors
        if args and str(args[1]).startswith(("4", "5")):
            sys.stderr.write("%s\n" % (fmt % args))

    def _json(self, data, code=200):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _file(self, path, ctype):
        if not os.path.isfile(path):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        with open(path, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "max-age=3600" if ctype == "image/jpeg" else "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _clip_mode(self, q):
        name = (q.get("name") or [""])[0]
        mode = (q.get("mode") or ["ball"])[0]
        if name not in clip_names() or mode not in MODES:
            raise ValueError("clip or mode unknown")
        return name, mode

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        try:
            if u.path in ("/", "/index.html"):
                return self._file(os.path.join(HERE, "index.html"), "text/html; charset=utf-8")
            if u.path.startswith("/frames/"):
                parts = u.path.split("/")
                if len(parts) == 4 and parts[2] in clip_names() and parts[3].endswith(".jpg") and "/" not in parts[3]:
                    return self._file(os.path.join(FRAMES, parts[2], parts[3]), "image/jpeg")
                return self.send_error(HTTPStatus.NOT_FOUND)
            if u.path == "/api/clips":
                stride = int((q.get("stride") or ["200"])[0])
                out = []
                for n in clip_names():
                    m = meta(n)
                    out.append({"name": n, "sport": m["sport"], "count": m["count"], "size": m["size"],
                                "progress": {mode: progress(n, mode, stride) for mode in MODES}})
                return self._json(out)
            if u.path == "/api/clip":
                name, mode = self._clip_mode(q)
                labels = load_labels(name, mode)
                cached = load_cache(name, mode)
                h = prompts_hash(labels["prompts"])
                return self._json({"meta": meta(name), "labels": labels,
                                   "proposals": cached["frames"] if cached else {},
                                   "pending": cached.get("pending") if cached else None,
                                   "proposalsFor": cached["hash"] if cached else None, "promptsHash": h,
                                   "job": self.jobs.snapshot()})
            if u.path == "/api/job":
                return self._json(self.jobs.snapshot())
            return self.send_error(HTTPStatus.NOT_FOUND)
        except ValueError as e:
            return self._json({"error": str(e)}, 400)

    def do_POST(self):
        u = urlparse(self.path)
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n) or b"{}")
            name, mode = body.get("name"), body.get("mode")
            if name not in clip_names() or mode not in MODES:
                raise ValueError("clip or mode unknown")
            if u.path == "/api/save":
                labels = load_labels(name, mode)
                before = prompts_hash(labels["prompts"])
                labels["samples"] = body.get("samples", {})
                labels["src"] = body.get("src", {})
                labels["prompts"] = body.get("prompts", [])
                labels["updated"] = time.strftime("%Y-%m-%dT%H:%M:%S")
                write_json(label_path(name, mode), labels)
                after = prompts_hash(labels["prompts"])
                if after != before and labels["prompts"]:
                    self.jobs.submit(name, mode)
                return self._json({"ok": True, "promptsHash": after})
            if u.path == "/api/propagate":
                self.jobs.submit(name, mode)
                return self._json({"ok": True})
            return self.send_error(HTTPStatus.NOT_FOUND)
        except (ValueError, json.JSONDecodeError) as e:
            return self._json({"error": str(e)}, 400)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--backend", choices=("sam2", "none"), default="sam2")
    ap.add_argument("--model", choices=sorted(SAM_MODELS), default="tiny")
    ap.add_argument("--device", default=None, help="mps | cpu | cuda (default: best available)")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--max-cond", type=int, default=4,
                    help="clicked frames SAM 2 looks at per frame, the closest in time (default 4; -1 = all, slower)")
    ap.add_argument("--random-weights", action="store_true", help=argparse.SUPPRESS)  # code-path check, no checkpoint
    a = ap.parse_args()

    if a.backend == "none":
        make = NoTracker
    else:
        make = lambda: Sam2Tracker(a.model, a.device, a.random_weights, a.max_cond)  # noqa: E731
    Handler.jobs = Jobs(make)
    names = clip_names()
    if not names:
        raise SystemExit("no frames yet: run tools/lab/extract.sh first")
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    url = f"http://127.0.0.1:{a.port}/"
    print(f"{len(names)} clips · backend {a.backend}{'' if a.backend == 'none' else ' ' + a.model} · {url}", flush=True)
    if not a.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
