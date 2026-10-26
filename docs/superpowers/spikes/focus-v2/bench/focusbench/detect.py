"""Candidate detector over a clip on the 100 ms grid, with tiling for small players and a detections cache.

Spec values (2026-10-24, §4.1): frames at 1920 px long side; model input 640; tiles when the median person height is
under 48 px at the 640 scale, decided from the first second; portrait 2×3 / landscape 3×2 tiles with 15% overlap;
NMS IoU 0.45; people kept at ≥ 0.3, ball candidates at ≥ 0.15.
"""

from __future__ import annotations

import json
import os
import sys
import time
from statistics import median

import numpy as np

from .clips import frames_on_grid

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(HERE, "../../convert")))
import decode  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "../../../../../.."))
OUT = os.environ.get("FOCUS_BENCH_OUT", os.path.join(REPO, "docs/focus-refs/bench-out"))
MODELS = os.environ.get("FOCUS_V2_MODELS", os.path.join(OUT, "models"))

PEOPLE_MIN, BALL_MIN = 0.3, 0.15
NMS_IOU = 0.45
TILE_BELOW_PX = 48
TILE_OVERLAP = 0.15
STEP_MS = 100

Box = tuple[float, float, float, float]


def _axis(n: int) -> list[tuple[float, float]]:
    """n segments covering 0..1, neighbours overlapping by TILE_OVERLAP of a segment."""
    size = 1 / (n - (n - 1) * TILE_OVERLAP)
    starts = [i * size * (1 - TILE_OVERLAP) for i in range(n - 1)] + [1 - size]  # the last one ends exactly at 1
    return [(x, size) for x in starts]


def tiles(orientation: str) -> list[Box]:
    cols, rows = (2, 3) if orientation == "portrait" else (3, 2)
    return [(x, y, w, h) for (y, h) in _axis(rows) for (x, w) in _axis(cols)]


def choose_tiling(first_second: list[dict], scale_640: float) -> bool:
    """`scale_640`: pixels per unit of frame height at the model's 640 scale. No people at all → tile (look closer)."""
    heights = [p[3] for s in first_second for p in s["people"]]
    return not heights or median(heights) * scale_640 < TILE_BELOW_PX


def nms(dets: list, iou: float = NMS_IOU) -> list:
    return decode.nms(dets, iou)


def merge(full: list, tiled: list[tuple[Box, list]]) -> list:
    """Full-frame detections plus each tile's (in tile coords) put back into frame coords, then NMS."""
    out = list(full)
    for (tx, ty, tw, th), dets in tiled:
        out += [(c, s, tx + x * tw, ty + y * th, w * tw, h * th) for c, s, x, y, w, h in dets]
    return nms(out)


def sample_from(t: int, dets: list, width: int, height: int) -> dict:
    people = [(x, y, w, h, s) for c, s, x, y, w, h in dets if c == decode.PERSON and s >= PEOPLE_MIN]
    balls = [(x + w / 2, y + h / 2, (w + h * height / width) / 4, s)
             for c, s, x, y, w, h in dets if c == decode.BALL and s >= BALL_MIN]
    return {"t": t, "people": people, "balls": balls}


class Detector:
    def __init__(self, name: str, threads: int = 0):
        import onnxruntime as ort

        opts = ort.SessionOptions()
        if threads:
            opts.intra_op_num_threads = threads
        self.name = name
        self.session = ort.InferenceSession(os.path.join(MODELS, f"{name}.onnx"), opts, providers=["CPUExecutionProvider"])

    def run(self, bgr: np.ndarray) -> list:
        x, lb = decode.preprocess(self.name, bgr)
        raw = self.session.run(None, {"images": x})
        return decode.decode(self.name, raw, lb, conf_min=BALL_MIN, classes=(decode.PERSON, decode.BALL), nms_iou=NMS_IOU)

    def frame(self, bgr: np.ndarray, tiled: bool, orientation: str) -> list:
        full = self.run(bgr)
        if not tiled:
            return full
        h, w = bgr.shape[:2]
        parts = []
        for tile in tiles(orientation):
            x0, y0 = round(tile[0] * w), round(tile[1] * h)
            x1, y1 = min(w, round((tile[0] + tile[2]) * w)), min(h, round((tile[1] + tile[3]) * h))
            parts.append(((x0 / w, y0 / h, (x1 - x0) / w, (y1 - y0) / h), self.run(bgr[y0:y1, x0:x1])))
        return merge(full, parts)


def cache_path(clip_file: str, model: str) -> str:
    return os.path.join(OUT, "det", f"{os.path.splitext(os.path.basename(clip_file))[0]}.{model}.json")


def detect_clip(path: str, model: str, start_ms: int, end_ms: int, detector: Detector | None = None,
                refresh: bool = False) -> dict:
    """Detections of the clip between start and end, from the cache when it holds this exact run."""
    out = cache_path(path, model)
    if not refresh and os.path.exists(out):
        with open(out) as f:
            cached = json.load(f)
        if cached["startMs"] == start_ms and cached["endMs"] == end_ms:
            return cached
    detector = detector or Detector(model)
    started = time.time()
    frames = frames_on_grid(path, start_ms, end_ms, STEP_MS, long_side=1920)
    samples, tiled, width, height, orientation = [], None, 0, 0, "portrait"
    pending = []
    for f in frames:
        height, width = f.image.shape[:2]
        orientation = "portrait" if height >= width else "landscape"
        if tiled is None:
            pending.append(f)
            if f.tick - start_ms < 1000 - STEP_MS / 2:
                continue
            # Decide from the first second, full frame only; then those frames get their tiles too.
            first = [sample_from(p.tick, detector.run(p.image), width, height) for p in pending]
            tiled = choose_tiling(first, height * 640 / max(width, height))
            for p in pending:
                samples.append(sample_from(p.tick, detector.frame(p.image, tiled, orientation), width, height))
            pending = []
            continue
        samples.append(sample_from(f.tick, detector.frame(f.image, tiled, orientation), width, height))
    if tiled is None:  # a clip shorter than a second
        first = [sample_from(p.tick, detector.run(p.image), width, height) for p in pending]
        tiled = choose_tiling(first, height * 640 / max(width, height)) if pending else False
        samples += [sample_from(p.tick, detector.frame(p.image, tiled, orientation), width, height) for p in pending]
    result = {"clip": os.path.basename(path), "model": model, "W": width, "H": height, "stepMs": STEP_MS,
              "startMs": start_ms, "endMs": end_ms, "tiled": bool(tiled), "elapsedS": round(time.time() - started, 1),
              "samples": samples}
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out + ".tmp", "w") as f:
        json.dump(result, f)
    os.replace(out + ".tmp", out)
    return result
