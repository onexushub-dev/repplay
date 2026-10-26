"""Shared pre-processing and decoding for the Modo Foco v2 candidates (plan part 1, task 1).

The converted models return raw heads; this file is the decoder spec the Swift side (part 3) follows.
Every detection is returned in the source image, normalized 0..1, origin top-left: (cls, conf, x, y, w, h).
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

SIZE = 640
PERSON, BALL = 0, 32


@dataclass(frozen=True)
class Letterbox:
    """How the source image was put into the 640×640 input: input = source × scale + pad (per axis)."""

    src_w: int
    src_h: int
    scale_x: float
    scale_y: float
    pad_x: float = 0.0
    pad_y: float = 0.0


Det = tuple[int, float, float, float, float, float]


def preprocess(name: str, bgr: np.ndarray) -> tuple[np.ndarray, Letterbox]:
    """1×3×640×640 float32 input for `name` from a BGR image, and how to map boxes back."""
    h, w = bgr.shape[:2]
    if name == "yolox_s":
        # YOLOX: keep the aspect, image at the top-left, grey (114) padding, BGR 0..255.
        r = min(SIZE / h, SIZE / w)
        nh, nw = int(round(h * r)), int(round(w * r))
        canvas = np.full((SIZE, SIZE, 3), 114, dtype=np.uint8)
        canvas[:nh, :nw] = cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_LINEAR)
        x = canvas.transpose(2, 0, 1)[None].astype(np.float32)
        return x, Letterbox(w, h, r, r)
    if name == "dfine_s":
        # D-FINE: stretched to 640×640, RGB 0..1.
        rgb = cv2.cvtColor(cv2.resize(bgr, (SIZE, SIZE), interpolation=cv2.INTER_LINEAR), cv2.COLOR_BGR2RGB)
        x = (rgb.transpose(2, 0, 1)[None].astype(np.float32)) / 255.0
        return x, Letterbox(w, h, SIZE / w, SIZE / h)
    raise ValueError(f"unknown model {name}")


def _to_source(lb: Letterbox, cx: np.ndarray, cy: np.ndarray, bw: np.ndarray, bh: np.ndarray):
    """Input-pixel centre boxes → source-normalized top-left boxes."""
    x = ((cx - bw / 2) - lb.pad_x) / lb.scale_x / lb.src_w
    y = ((cy - bh / 2) - lb.pad_y) / lb.scale_y / lb.src_h
    return x, y, bw / lb.scale_x / lb.src_w, bh / lb.scale_y / lb.src_h


def _yolox_grid() -> tuple[np.ndarray, np.ndarray]:
    grids, strides = [], []
    for stride in (8, 16, 32):
        n = SIZE // stride
        yv, xv = np.meshgrid(np.arange(n), np.arange(n), indexing="ij")
        grids.append(np.stack((xv, yv), 2).reshape(-1, 2))
        strides.append(np.full((n * n, 1), stride))
    return np.concatenate(grids).astype(np.float32), np.concatenate(strides).astype(np.float32)


_GRID, _STRIDES = _yolox_grid()


def iou(a: Det, b: Det) -> float:
    ax2, ay2, bx2, by2 = a[2] + a[4], a[3] + a[5], b[2] + b[4], b[3] + b[5]
    iw = max(0.0, min(ax2, bx2) - max(a[2], b[2]))
    ih = max(0.0, min(ay2, by2) - max(a[3], b[3]))
    inter = iw * ih
    union = a[4] * a[5] + b[4] * b[5] - inter
    return inter / union if union > 0 else 0.0


def nms(dets: list[Det], threshold: float = 0.45) -> list[Det]:
    """Per-class non-maximum suppression, highest confidence first."""
    keep: list[Det] = []
    for d in sorted(dets, key=lambda d: -d[1]):
        if all(k[0] != d[0] or iou(k, d) <= threshold for k in keep):
            keep.append(d)
    return keep


def decode(name: str, raw: list[np.ndarray], lb: Letterbox, conf_min: float = 0.1,
           classes: tuple[int, ...] | None = None, nms_iou: float = 0.45) -> list[Det]:
    if name == "yolox_s":
        out = raw[0][0]  # (8400, 85): dx, dy, log w, log h (grid units), obj, 80 class scores (both after sigmoid)
        xy = (out[:, :2] + _GRID) * _STRIDES
        wh = np.exp(out[:, 2:4]) * _STRIDES
        scores = out[:, 4:5] * out[:, 5:]
        cls = scores.argmax(1)
        conf = scores[np.arange(len(cls)), cls]
        sel = conf >= conf_min
        x, y, w, h = _to_source(lb, xy[sel, 0], xy[sel, 1], wh[sel, 0], wh[sel, 1])
        dets = [(int(c), float(s), float(a), float(b), float(e), float(f))
                for c, s, a, b, e, f in zip(cls[sel], conf[sel], x, y, w, h)]
        if classes is not None:
            dets = [d for d in dets if d[0] in classes]
        return nms(dets, nms_iou)
    if name == "dfine_s":
        logits, boxes = raw[0][0], raw[1][0]  # (300, 80), (300, 4) cx, cy, w, h in 0..1 of the input
        scores = 1 / (1 + np.exp(-logits))
        flat = scores.reshape(-1)
        top = np.argsort(-flat)[: boxes.shape[0]]  # as upstream: the 300 best (query, class) pairs
        q, cls, conf = top // scores.shape[1], top % scores.shape[1], flat[top]
        sel = conf >= conf_min
        b = boxes[q[sel]] * SIZE
        x, y, w, h = _to_source(lb, b[:, 0], b[:, 1], b[:, 2], b[:, 3])
        dets = [(int(c), float(s), float(a), float(bb), float(e), float(f))
                for c, s, a, bb, e, f in zip(cls[sel], conf[sel], x, y, w, h)]
        if classes is not None:
            dets = [d for d in dets if d[0] in classes]
        return dets  # a DETR needs no NMS
    raise ValueError(f"unknown model {name}")
