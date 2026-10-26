"""Ball labels: proposals for the labelling page, and the label file next to each clip.

Label file `<clip>.ball.json` (kept in git, beside the clip): {"v": 1, "samples": {"<t ms>": [x, y] | "out" | "none"}}
- [x, y]: the ball, 0..1 of the frame, origin top-left.  "out": ball not in play.  "none": in play but not visible.
Only labelled samples count in the metrics; labelling one sample in five (2 per second) is enough.
"""

from __future__ import annotations

import json
import os

import cv2

from .clips import frames_on_grid
from .tracker import PREDICTED, SEEN



def label_path(clip_path: str) -> str:
    return os.path.splitext(clip_path)[0] + ".ball.json"


def _check(t, v):
    if isinstance(v, str):
        if v not in ("out", "none"):
            raise ValueError(f"label {t}: {v!r} is not 'out' or 'none'")
        return v
    x, y = float(v[0]), float(v[1])
    if not (0 <= x <= 1 and 0 <= y <= 1):
        raise ValueError(f"label {t}: point {v} outside 0..1")
    return (x, y)


def save_labels(path: str, labels: dict) -> None:
    samples = {}
    for t in sorted(labels):
        v = _check(t, labels[t])
        samples[str(int(t))] = v if isinstance(v, str) else [round(v[0], 4), round(v[1], 4)]
    with open(path + ".tmp", "w") as f:
        json.dump({"v": 1, "samples": samples}, f, indent=0)
    os.replace(path + ".tmp", path)


def load_labels(path: str) -> dict:
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        raw = json.load(f)
    return {int(t): (v if isinstance(v, str) else (float(v[0]), float(v[1]))) for t, v in _items(raw)}


def _items(raw):
    for t, v in raw.get("samples", {}).items():
        yield t, _check(t, v)


def proposals_from(samples: list[dict], rows: list[tuple]) -> dict:
    """The tracker's ball (seen or predicted) per sample, or None: the page's starting point."""
    return {s["t"]: ([round(r[0], 4), round(r[1], 4)] if r[2] in (SEEN, PREDICTED) else None)
            for s, r in zip(samples, rows)}


def write_label_folder(clip_path: str, start_ms: int, end_ms: int, proposals: dict, out_dir: str,
                       long_side: int = 1280) -> int:
    """One JPEG per sample (`t_<ms>.jpg`) and `proposal.json`, for label/index.html. Returns the frame count."""
    os.makedirs(out_dir, exist_ok=True)
    count = 0
    for f in frames_on_grid(clip_path, start_ms, end_ms, 100, long_side=long_side):
        cv2.imwrite(os.path.join(out_dir, f"t_{f.tick}.jpg"), f.image, [cv2.IMWRITE_JPEG_QUALITY, 82])
        count += 1
    existing = load_labels(label_path(clip_path))
    with open(os.path.join(out_dir, "proposal.json"), "w") as f:
        json.dump({"clip": os.path.basename(clip_path), "startMs": start_ms, "endMs": end_ms,
                   "proposals": {str(t): p for t, p in proposals.items()},
                   "labels": {str(t): (v if isinstance(v, str) else list(v)) for t, v in existing.items()}}, f)
    return count
