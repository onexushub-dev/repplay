"""Modo Foco v2 bench runner.

    python run.py detect  --model yolox_s [--clips <glob>] [--threads N] [--refresh]
    python run.py propose --model yolox_s [--clips <glob>]      # folders for label/index.html
    python run.py all     --model yolox_s [--clips <glob>] [--previews]   # v1 vs v2 report (+ side-by-side videos)
    python run.py compare --models yolox_s,dfine_s [--clips <glob>]       # detector comparison table

The window of each clip is the part the app analyses: from `bounds_start_ms` to the trim end (or the file end).
"""

from __future__ import annotations

import argparse
import fnmatch
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from focusbench.clips import load_manifest, parse_name  # noqa: E402
from focusbench.detect import OUT, REPO, Detector, cache_path, detect_clip  # noqa: E402
from focusbench.labels import label_path, load_labels, proposals_from, write_label_folder  # noqa: E402
from focusbench.metrics import clip_metrics, overall  # noqa: E402
from focusbench.path_v2 import TUNING_V2, max_zoom_for, v2_rects  # noqa: E402
from focusbench.report import markdown, render_preview  # noqa: E402
from focusbench.tracker import HELD, LOST, PREDICTED, SEEN, track_ball  # noqa: E402
from focusbench.v1path import v1_rects  # noqa: E402

CLIPS = os.environ.get("FOCUS_REFS_CLIPS", os.path.join(REPO, "docs/focus-refs/clips"))


def clip_windows(pattern: str = "*") -> list[tuple[str, int, int]]:
    """(path, start_ms, end_ms) for every manifest clip matching `pattern`."""
    out = []
    for row in load_manifest(os.path.join(CLIPS, "manifest.csv")):
        name = row["file"]
        parse_name(name)  # a bad name fails here, loudly
        if not fnmatch.fnmatch(name, pattern):
            continue
        start = int(float(row["bounds_start_ms"]))
        end = int(float(row["trim_end_ms"])) if row.get("trim_end_ms") else int(float(row["duration_s"]) * 1000)
        out.append((os.path.join(CLIPS, name), start, end))
    return out


def cmd_detect(a: argparse.Namespace) -> None:
    detector = Detector(a.model, threads=a.threads)
    windows = clip_windows(a.clips)
    for i, (path, start, end) in enumerate(windows, 1):
        if not os.path.exists(path):
            print(f"[{i}/{len(windows)}] missing {path}", flush=True)
            continue
        cached = os.path.exists(cache_path(path, a.model)) and not a.refresh
        t = time.time()
        r = detect_clip(path, a.model, start, end, detector, refresh=a.refresh)
        people = sum(len(s["people"]) for s in r["samples"]) / max(1, len(r["samples"]))
        balls = sum(1 for s in r["samples"] if s["balls"]) / max(1, len(r["samples"]))
        print(f"[{i}/{len(windows)}] {os.path.basename(path)} {'(cache) ' if cached else ''}samples={len(r['samples'])} "
              f"tiled={r['tiled']} people/sample={people:.1f} ball-samples={balls:.0%} {time.time() - t:.0f}s", flush=True)


def cmd_propose(a: argparse.Namespace) -> None:
    import json

    for path, start, end in clip_windows(a.clips):
        det = cache_path(path, a.model)
        if not os.path.exists(det):
            print(f"no detections for {os.path.basename(path)}: run detect first", flush=True)
            continue
        with open(det) as f:
            d = json.load(f)
        rows = track_ball(d["samples"], hw=d["H"] / d["W"])
        out = os.path.join(OUT, "label", os.path.splitext(os.path.basename(path))[0])
        n = write_label_folder(path, start, end, proposals_from(d["samples"], rows), out)
        print(f"{os.path.basename(path)}: {n} frames → {out}", flush=True)


def framings(d: dict, tuning: dict | None = None) -> dict:
    """v1 and v2 rects of a detections file in the clip's own aspect, the track and the max zoom used."""
    W, H = d["W"], d["H"]
    aspect = "portrait" if H >= W else "landscape"
    rows = track_ball(d["samples"], tuning, hw=H / W)
    boxes = [(s["t"], [tuple(p[:4]) for p in s["people"]]) for s in d["samples"]]
    max_zoom = max_zoom_for(min(W, H))  # the same-aspect crop: its short side is the video's short side
    return {"aspect": aspect, "track": rows, "max_zoom": max_zoom,
            "v1": v1_rects(boxes, W, H, aspect, True, 1.5),  # the app today: zoom capped at 1.5x whatever the source
            "v2": v2_rects(d["samples"], rows, W, H, aspect, True, max_zoom, tuning)}


def _load_det(path: str, model: str) -> dict | None:
    import json

    det = cache_path(path, model)
    if not os.path.exists(det):
        return None
    with open(det) as f:
        return json.load(f)


def cmd_all(a: argparse.Namespace) -> None:
    stamp = time.strftime("%Y%m%d-%H%M")
    clips, missing = [], []
    for path, start, end in clip_windows(a.clips):
        d = _load_det(path, a.model)
        if d is None:
            missing.append(os.path.basename(path))
            continue
        f = framings(d)
        labels = load_labels(label_path(path))
        counts = {k: sum(1 for r in f["track"] if r[2] == v)
                  for k, v in (("seen", SEEN), ("predicted", PREDICTED), ("held", HELD), ("lost", LOST))}
        clips.append({"name": os.path.basename(path), "tiled": d["tiled"], "max_zoom": f["max_zoom"], "track": counts,
                      "v1": clip_metrics(f["v1"], labels, d["startMs"]), "v2": clip_metrics(f["v2"], labels, d["startMs"])})
        if a.previews:
            out = os.path.join(OUT, "preview", os.path.basename(path))
            os.makedirs(os.path.dirname(out), exist_ok=True)
            render_preview(path, d["startMs"], d["endMs"], f["v1"], f["v2"], f["aspect"], out, labels)
        print(f"{os.path.basename(path)} done", flush=True)
    text = markdown(a.model, clips, overall([c["v1"] for c in clips]), overall([c["v2"] for c in clips]), TUNING_V2,
                    a.previews)
    if missing:
        text += "\nNo detections yet (run detect): " + ", ".join(missing) + "\n"
    report = os.path.join(OUT, f"report-{a.model}-{stamp}.md")
    with open(report, "w") as fh:
        fh.write(text)
    print(report)


def cmd_compare(a: argparse.Namespace) -> None:
    models = a.models.split(",")
    lines = ["# Detector comparison", "", "| Clip | " + " | ".join(
        f"{m} people/sample | {m} ball cand./sample | {m} ball seen | {m} ball in crop (v2) | {m} s/clip" for m in models)
        + " |", "|---|" + "---|" * (5 * len(models))]
    totals = {m: [] for m in models}
    for path, _, _ in clip_windows(a.clips):
        cells, any_det = [], False
        labels = load_labels(label_path(path))
        for m in models:
            d = _load_det(path, m)
            if d is None:
                cells += ["—"] * 5
                continue
            any_det = True
            n = max(1, len(d["samples"]))
            f = framings(d)
            seen = sum(1 for r in f["track"] if r[2] == SEEN) / n
            mt = clip_metrics(f["v2"], labels, d["startMs"])
            people = sum(len(s["people"]) for s in d["samples"]) / n
            balls = sum(len(s["balls"]) for s in d["samples"]) / n
            totals[m].append((people, balls, seen, mt))
            cells += [f"{people:.1f}", f"{balls:.2f}", f"{seen:.0%}",
                      "—" if mt.ball_in_crop is None else f"{mt.ball_in_crop:.0%}", f"{d.get('elapsedS', 0):.0f}"]
        if any_det:
            lines.append(f"| {os.path.basename(path)} | " + " | ".join(cells) + " |")
    lines.append("| **mean** | " + " | ".join(
        (f"{sum(t[0] for t in v) / len(v):.1f} | {sum(t[1] for t in v) / len(v):.2f} | {sum(t[2] for t in v) / len(v):.0%} | "
         + (lambda o: "—" if o["ball_in_crop"] is None else f"{o['ball_in_crop']:.0%}")(overall([t[3] for t in v])) + " | ")
        if v else "— | — | — | — | " for v in (totals[m] for m in models)) + " |")
    report = os.path.join(OUT, f"compare-{'-'.join(models)}-{time.strftime('%Y%m%d-%H%M')}.md")
    with open(report, "w") as fh:
        fh.write("\n".join(lines) + "\n")
    print(report)


def main() -> None:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("detect")
    d.add_argument("--model", required=True)
    d.add_argument("--clips", default="*")
    d.add_argument("--threads", type=int, default=0)
    d.add_argument("--refresh", action="store_true")
    q = sub.add_parser("propose")
    q.add_argument("--model", required=True)
    q.add_argument("--clips", default="*")
    r = sub.add_parser("all")
    r.add_argument("--model", required=True)
    r.add_argument("--clips", default="*")
    r.add_argument("--previews", action="store_true")
    c = sub.add_parser("compare")
    c.add_argument("--models", required=True)
    c.add_argument("--clips", default="*")
    a = p.parse_args()
    {"detect": cmd_detect, "propose": cmd_propose, "all": cmd_all, "compare": cmd_compare}[a.cmd](a)


if __name__ == "__main__":
    main()
