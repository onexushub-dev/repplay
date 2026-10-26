"""Clips of docs/focus-refs/clips: names, manifest, and frames on the 100 ms grid the app's analysis uses."""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from typing import Iterator

import cv2
import numpy as np

CAMERAS = ("side-high", "side-low", "end", "corner")
_NAME = re.compile(
    r"^(?P<sport>[a-z0-9]+)-(?P<orientation>[vh])-(?P<camera>side-high|side-low|end|corner)-(?P<case>[a-z0-9]+)"
    r"(?P<cam4k>-cam4k)?-(?P<n>\d{2})\.mp4$"
)


@dataclass(frozen=True)
class ClipInfo:
    sport: str
    orientation: str  # 'v' | 'h'
    camera: str
    case: str
    cam4k: bool
    n: int


def parse_name(file: str) -> ClipInfo:
    """`<sport>-<v|h>-<camera>-<case>[-cam4k]-<nn>.mp4`; anything else raises ValueError."""
    m = _NAME.match(file)
    if not m:
        raise ValueError(f"not a clip name: {file}")
    return ClipInfo(m["sport"], m["orientation"], m["camera"], m["case"], m["cam4k"] is not None, int(m["n"]))


ManifestRow = dict[str, str]


def load_manifest(path: str) -> list[ManifestRow]:
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


@dataclass(frozen=True)
class GridFrame:
    tick: int  # startMs + k × stepMs
    t: float  # the frame's own time (ms), in [tick, tick + stepMs)
    image: np.ndarray  # BGR, upright (rotation metadata applied), long side ≤ long_side


def frames_on_grid(path: str, start_ms: int, end_ms: int, step_ms: int = 100,
                   long_side: int = 1920) -> Iterator[GridFrame]:
    """The first frame at or after each tick from `start_ms` up to `end_ms`, like FocusAnalyzer. Ticks without a
    frame (a gap in the file) are skipped; frames are scaled down, never up."""
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise OSError(f"cannot open {path}")
    cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
    cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, start_ms - 1000.0))  # lands on a keyframe before; read forward from there
    tick = start_ms
    try:
        while tick < end_ms:
            ok = cap.grab()
            if not ok:
                return
            t = cap.get(cv2.CAP_PROP_POS_MSEC)
            if t < tick - 0.5:
                continue
            while t >= tick + step_ms - 0.5:  # a gap: those ticks have no frame of their own
                tick += step_ms
            if tick >= end_ms:
                return
            ok, image = cap.retrieve()
            if not ok:
                return
            h, w = image.shape[:2]
            scale = long_side / max(h, w)
            if scale < 1:
                image = cv2.resize(image, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
            yield GridFrame(tick, t, image)
            tick += step_ms
    finally:
        cap.release()
