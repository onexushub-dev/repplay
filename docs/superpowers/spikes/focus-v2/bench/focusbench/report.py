"""Bench report: the spec §1 targets, a per-clip table (v1 → v2), the tuning used, and side-by-side preview videos."""

from __future__ import annotations

import subprocess
from datetime import datetime

import cv2
import numpy as np

from .metrics import ClipMetrics

Rect = tuple[float, float, float, float]


def target_rows(v1: dict, v2: dict) -> list[tuple[str, str, str, bool | None]]:
    """(target, v2 value, the target, met?) — met is None when it cannot be judged (no labels yet)."""
    rows = []
    b = v2["ball_in_crop"]
    rows.append(("ball in crop ≥ 95%", "n/a" if b is None else f"{b:.1%}", "≥ 95%", None if b is None else b >= 0.95))
    rows.append(("no unavailable clip", str(v2["unavailable"]), "0", v2["unavailable"] == 0))
    z1, z2 = v1["mean_zoom"], v2["mean_zoom"]
    rows.append(("mean zoom above v1", "n/a" if z2 is None else f"{z2:.2f}×", "> " + ("n/a" if z1 is None else f"{z1:.2f}×"),
                 None if z1 is None or z2 is None else z2 > z1))
    j1, j2 = v1["jerk_p95"], v2["jerk_p95"]
    rows.append(("jerk not worse than v1", "n/a" if j2 is None else f"{j2:.2f}", "≤ " + ("n/a" if j1 is None else f"{j1:.2f}"),
                 None if j1 is None or j2 is None else j2 <= j1 + 1e-9))
    return rows


def _fmt(v, kind: str) -> str:
    if v is None:
        return "—"
    return {"pct": f"{v:.0%}", "zoom": f"{v:.2f}×", "jerk": f"{v:.2f}"}[kind]


def markdown(model: str, clips: list[dict], v1: dict, v2: dict, tuning: dict, previews: bool) -> str:
    """`clips`: [{name, v1: ClipMetrics, v2: ClipMetrics, track: {seen, predicted, held, lost}, max_zoom, tiled}]."""
    mark = {True: "✓", False: "✗", None: "—"}
    out = [f"# Modo Foco v2 bench — {model}", "", f"> {datetime.now():%Y-%m-%d %H:%M} · {len(clips)} clips · "
           f"spec targets (§1) judged on v2", "", "## Targets", "", "| Target | v2 | Goal | Met |", "|---|---|---|---|"]
    for name, value, goal, ok in target_rows(v1, v2):
        out.append(f"| {name} | {value} | {goal} | {mark[ok]} |")
    out += ["", f"Labelled in-play samples: {v2['labelled']}. Unavailable clips: v1 {v1['unavailable']}, "
            f"v2 {v2['unavailable']} of {v2['clips']}.", "", "## Clips", "",
            "| Clip | Tiled | Max zoom | Ball (seen/pred/held/lost %) | Ball in crop v1 → v2 | Zoom v1 → v2 | Jerk v1 → v2 |"
            + (" Preview |" if previews else ""),
            "|---|---|---|---|---|---|---|" + ("---|" if previews else "")]
    for c in clips:
        a: ClipMetrics = c["v1"]
        b: ClipMetrics = c["v2"]
        tr = c["track"]
        total = max(1, sum(tr.values()))
        ball = "/".join(f"{100 * tr[k] / total:.0f}" for k in ("seen", "predicted", "held", "lost"))
        avail = lambda m, kind, v: "unavailable" if not m.available else _fmt(v, kind)  # noqa: E731
        row = (f"| {c['name']} | {'yes' if c['tiled'] else 'no'} | {c['max_zoom']:.2f}× | {ball} | "
               f"{avail(a, 'pct', a.ball_in_crop)} → {avail(b, 'pct', b.ball_in_crop)} ({b.labelled}) | "
               f"{avail(a, 'zoom', a.mean_zoom)} → {avail(b, 'zoom', b.mean_zoom)} | "
               f"{avail(a, 'jerk', a.jerk_p95)} → {avail(b, 'jerk', b.jerk_p95)} |")
        if previews:
            row += f" [mp4](preview/{c['name'].replace('.mp4', '')}.mp4) |"
        out.append(row)
    out += ["", "## Tuning", "", "```", *(f"{k} = {v}" for k, v in sorted(tuning.items())), "```", ""]
    return "\n".join(out)


def interpolate(rects: list[Rect], start_ms: float, step_ms: float, t_ms: float) -> Rect:
    """The crop at any time: linear between the two nearest keyframes, the end ones held (like framingAt)."""
    pos = (t_ms - start_ms) / step_ms
    if pos <= 0:
        return rects[0]
    if pos >= len(rects) - 1:
        return rects[-1]
    i = int(pos)
    f = pos - i
    a, b = rects[i], rects[i + 1]
    return tuple(a[k] + (b[k] - a[k]) * f for k in range(4))


def _crop(frame: np.ndarray, rect: Rect, size: tuple[int, int]) -> np.ndarray:
    h, w = frame.shape[:2]
    x0, y0 = int(round(rect[0] * w)), int(round(rect[1] * h))
    x1, y1 = max(x0 + 2, int(round((rect[0] + rect[2]) * w))), max(y0 + 2, int(round((rect[1] + rect[3]) * h)))
    return cv2.resize(frame[y0:y1, x0:x1], size, interpolation=cv2.INTER_AREA)


def render_preview(clip_path: str, start_ms: int, end_ms: int, v1: list[Rect] | None, v2: list[Rect] | None,
                   aspect: str, out_path: str, labels: dict | None = None, step_ms: int = 100) -> None:
    """v1 | v2 side by side at a small export size, every source frame; the labelled ball is a green dot."""
    size = (360, 640) if aspect == "portrait" else (640, 360)
    cap = cv2.VideoCapture(clip_path)
    cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, start_ms - 1000.0))
    width, height = size[0] * 2 + 8, size[1] + 36
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{width}x{height}",
                            "-r", f"{fps:.3f}", "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
                            "-pix_fmt", "yuv420p", out_path], stdin=subprocess.PIPE)
    points = {int(t): v for t, v in (labels or {}).items() if not isinstance(v, str)}
    try:
        while True:
            ok = cap.grab()
            if not ok:
                break
            t = cap.get(cv2.CAP_PROP_POS_MSEC)
            if t < start_ms - 0.5:
                continue
            if t >= end_ms:
                break
            ok, frame = cap.retrieve()
            if not ok:
                break
            tick = start_ms + round((t - start_ms) / step_ms) * step_ms
            if tick in points:
                px, py = points[tick]
                cv2.circle(frame, (int(px * frame.shape[1]), int(py * frame.shape[0])), 14, (80, 230, 80), 4)
            canvas = np.full((height, width, 3), 11, np.uint8)
            for k, (name, rects) in enumerate((("v1", v1), ("v2", v2))):
                x = k * (size[0] + 8)
                if rects is None:
                    cv2.putText(canvas, f"{name}: unavailable", (x + 12, 36 + size[1] // 2), 0, 0.8, (60, 140, 255), 2)
                    continue
                canvas[36:, x:x + size[0]] = _crop(frame, interpolate(rects, start_ms, step_ms, t), size)
                cv2.putText(canvas, name, (x + 10, 26), 0, 0.8, (63, 242, 214), 2)
            cv2.putText(canvas, f"{t / 1000:.1f}s", (width - 90, 26), 0, 0.7, (200, 200, 200), 1)
            enc.stdin.write(canvas.tobytes())
    finally:
        cap.release()
        enc.stdin.close()
        enc.wait()
