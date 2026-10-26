"""Motion score per ball candidate, as the native analyser computes it (spec 2026-10-24 §13.3 rule 1; Part 3 plan,
decision 5). ReplayCore `MotionScore` ports it; `native_fixtures.py` writes the fixture that holds it.

On the grey (luma) frames at the decode size (the clip's own pixels up to 1920 px on the long side):
1. a 3×3 binomial blur ([1 2 1] / 4 horizontally, then vertically), edges reflected without repeating the edge pixel;
2. a square window around the candidate: centre (int(x·W), int(y·H)) clamped inside the frame, radius
   max(4, round(1.5 · r · W)) px, cut at the frame edges;
3. mean |blurred current − blurred previous| and the same against the next sample; the score is the smaller one.
No previous or no next frame (the first and last samples) → None. All arithmetic in float64.
"""

from __future__ import annotations

import numpy as np

MIN_RADIUS_PX = 4
RADIUS_SCALE = 1.5


def blur(grey: np.ndarray) -> np.ndarray:
    g = grey.astype(np.float64)
    p = np.pad(g, ((0, 0), (1, 1)), mode="reflect")
    h = (p[:, :-2] + 2 * p[:, 1:-1] + p[:, 2:]) / 4
    p = np.pad(h, ((1, 1), (0, 0)), mode="reflect")
    return (p[:-2] + 2 * p[1:-1] + p[2:]) / 4


def window(width: int, height: int, x: float, y: float, r: float) -> tuple[int, int, int, int]:
    """Rows y0..y1 and columns x0..x1 (end exclusive) of the candidate's patch."""
    cx = min(max(int(x * width), 0), width - 1)
    cy = min(max(int(y * height), 0), height - 1)
    radius = max(MIN_RADIUS_PX, int(round(RADIUS_SCALE * r * width)))
    return max(0, cy - radius), min(height, cy + radius + 1), max(0, cx - radius), min(width, cx + radius + 1)


def motion_score(prev: np.ndarray | None, cur: np.ndarray, nxt: np.ndarray | None, x: float, y: float,
                 r: float) -> float | None:
    """`prev`, `cur`, `nxt`: blurred frames (`blur`), same size. None at the clip's ends."""
    if prev is None or nxt is None:
        return None
    h, w = cur.shape
    y0, y1, x0, x1 = window(w, h, x, y, r)
    c = cur[y0:y1, x0:x1]
    a = float(np.abs(c - prev[y0:y1, x0:x1]).mean())
    b = float(np.abs(c - nxt[y0:y1, x0:x1]).mean())
    return min(a, b)
