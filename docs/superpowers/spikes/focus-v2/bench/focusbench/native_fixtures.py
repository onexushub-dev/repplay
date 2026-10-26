"""Fixtures for the Part 3 native pieces that live in ReplayCore (`python run.py native-fixtures`):

- `motion.json`: three synthetic grey frames and candidates with their `motion_score` (ReplayCore `MotionScore`).
- `tiles.json`: the tile rects of each grid (ReplayCore `FocusDetection.tiles`).
- `dfine-decode.json`: D-FINE-S raw outputs on `convert/tests/data/sample.jpg`, full frame and 3×2 or 2×3 tiles, and
  what decoding, merging and the sample rules give (ReplayCore `FocusDetection`). Logits are stored sparsely (the
  entries above −6; every other one reads as −20), and the expected values are computed from exactly what is stored,
  in float64, as the Swift side does.
"""

from __future__ import annotations

import json
import os

import numpy as np

from . import detect
from .detect import BALL_MIN, NMS_IOU, PEOPLE_MIN, grid_tiles
from .fixtures import FIXTURE_DIR
from .motion import blur, motion_score

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE = os.path.abspath(os.path.join(HERE, "../../convert/tests/data/sample.jpg"))
SPARSE_MIN, SPARSE_FILL = -3.0, -20.0  # below −1.73 (score 0.15) a pair never becomes a detection
PERSON, BALL = 0, 32


def motion_fixture() -> dict:
    rng = np.random.RandomState(0)
    w, h = 64, 48
    base = rng.randint(60, 90, size=(h, w)).astype(np.uint8)
    frames = []
    for k in range(3):
        f = base.copy()
        f[20:26, 10 + 6 * k:16 + 6 * k] = 220
        f[2:5, 60:64] = 30 + 40 * k  # a patch changing at the right edge
        frames.append(f)
    b = [blur(f) for f in frames]
    cands = [(50 / 64, 10 / 48, 0.01), (19 / 64, 23 / 48, 0.03), (0.0, 0.999, 0.01), (0.99, 0.06, 0.02),
             (19 / 64, 23 / 48, 0.001), (0.5, 0.5, 0.2), (1.0, 1.0, 0.05)]
    rows = []
    for x, y, r in cands:
        rows.append({"x": x, "y": y, "r": r, "score": motion_score(b[0], b[1], b[2], x, y, r),
                     "noPrevious": motion_score(None, b[1], b[2], x, y, r)})
    return {"width": w, "height": h, "frames": [f.reshape(-1).tolist() for f in frames], "candidates": rows}


def tiles_fixture() -> dict:
    return {f"{c}x{r}": [list(t) for t in grid_tiles(c, r)] for c, r in ((3, 2), (2, 3), (4, 3), (3, 4))}


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1 / (1 + np.exp(-x))


def decode_dfine(logits: np.ndarray, boxes: np.ndarray) -> list[tuple]:
    """float64 D-FINE decode for a stretched input: the best 300 (query, class) pairs by score, those ≥ BALL_MIN for
    person and ball, boxes top-left. Ties: the lower flat index first."""
    scores = _sigmoid(logits.astype(np.float64))
    flat = scores.reshape(-1)
    order = sorted(range(flat.size), key=lambda i: (-flat[i], i))[: boxes.shape[0]]
    out = []
    for i in order:
        q, c = divmod(i, scores.shape[1])
        s = flat[i]
        if s < BALL_MIN or c not in (PERSON, BALL):
            continue
        cx, cy, bw, bh = (float(v) for v in boxes[q].astype(np.float64))
        out.append((int(c), float(s), cx - bw / 2, cy - bh / 2, bw, bh))
    return out


def _nms(dets: list[tuple]) -> list[tuple]:
    keep: list[tuple] = []
    for d in sorted(range(len(dets)), key=lambda i: (-dets[i][1], i)):
        d = dets[d]
        if all(k[0] != d[0] or detect.decode.iou(k, d) <= NMS_IOU for k in keep):
            keep.append(d)
    return keep


def merge(full: list, tiled: list) -> list:
    out = list(full)
    for (tx, ty, tw, th), dets in tiled:
        out += [(c, s, tx + x * tw, ty + y * th, w * tw, h * th) for c, s, x, y, w, h in dets]
    return _nms(out)


def _sparse(logits: np.ndarray) -> list:
    return [[int(q), int(c), float(logits[q, c])] for q, c in zip(*np.nonzero(logits > SPARSE_MIN))]


def _dense(sparse: list, queries: int = 300, classes: int = 80) -> np.ndarray:
    out = np.full((queries, classes), SPARSE_FILL, dtype=np.float32)
    for q, c, v in sparse:
        out[q, c] = v
    return out


def _boxes(sparse: dict, queries: int = 300) -> np.ndarray:
    out = np.zeros((queries, 4), dtype=np.float32)
    for q, b in sparse.items():
        out[int(q)] = b
    return out


def dfine_fixture() -> dict:
    import cv2

    det = detect.Detector("dfine_s")
    bgr = cv2.imread(SAMPLE)
    h, w = bgr.shape[:2]
    portrait = h >= w
    cols, rows = (2, 3) if portrait else (3, 2)
    passes = [("full", (0.0, 0.0, 1.0, 1.0), bgr)]
    for t in grid_tiles(cols, rows):
        x0, y0 = round(t[0] * w), round(t[1] * h)
        x1, y1 = min(w, round((t[0] + t[2]) * w)), min(h, round((t[1] + t[3]) * h))
        passes.append(("tile", t, bgr[y0:y1, x0:x1]))
    stored, decoded = [], []
    for kind, rect, img in passes:
        x, _ = detect.decode.preprocess("dfine_s", img)
        logits, boxes = det.session.run(None, {"images": x})
        logits, boxes = logits[0].astype(np.float32), boxes[0].astype(np.float32)
        reference = detect.decode.decode("dfine_s", [logits[None], boxes[None]], detect.decode.Letterbox(640, 640, 1, 1),
                                         conf_min=BALL_MIN, classes=(PERSON, BALL))
        mine = decode_dfine(logits, boxes)
        assert len(reference) == len(mine), (len(reference), len(mine))
        for a, b in zip(sorted(reference, key=lambda d: -d[1]), mine):
            assert a[0] == b[0] and all(abs(u - v) < 1e-5 for u, v in zip(a[1:], b[1:])), (a, b)
        sp = _sparse(logits)
        used = sorted({q for q, _, _ in sp})
        stored.append({"kind": kind, "tile": list(rect), "logits": sp,
                       "boxes": {str(q): [round(float(v), 7) for v in boxes[q]] for q in used}})
    # boxes as stored (rounded): recompute from them
    decoded = [decode_dfine(_dense(p["logits"]), _boxes(p["boxes"])) for p in stored]
    merged = merge(decoded[0], [(tuple(p["tile"]), d) for p, d in zip(stored[1:], decoded[1:])])
    people = [[x, y, bw, bh, s] for c, s, x, y, bw, bh in merged if c == PERSON and s >= PEOPLE_MIN]
    balls = [[x + bw / 2, y + bh / 2, (bw + bh * h / w) / 4, s] for c, s, x, y, bw, bh in merged
             if c == BALL and s >= BALL_MIN]
    return {"width": w, "height": h, "cols": cols, "rows": rows, "sparseFill": SPARSE_FILL, "passes": stored,
            "decoded": [[list(d) for d in ds] for ds in decoded], "merged": [list(d) for d in merged],
            "people": people, "balls": balls}


def write_all(out_dir: str = FIXTURE_DIR) -> list[tuple[str, int]]:
    os.makedirs(out_dir, exist_ok=True)
    done = []
    for name, build in (("motion", motion_fixture), ("tiles", tiles_fixture), ("dfine-decode", dfine_fixture)):
        path = os.path.join(out_dir, f"{name}.json")
        with open(path, "w") as f:
            json.dump(build(), f, separators=(",", ":"))
        done.append((path, os.path.getsize(path)))
    return done
