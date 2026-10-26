"""ReplayCore v2 fixtures (Part 2, task 1): the bench's inputs and expected outputs for four clips.

Each file holds the analyser's samples (people, ball candidates, motion scores) and what the frozen bench computes
from them: the filtered candidates (the tracker's input), the track and the crop rects. ReplayCore's `BallFilter`,
`BallTracker`, `FocusBallPath`, `FocusPath` (players preset) and `FocusV2` must reproduce them (spec §13, plan Part 2).

Inputs are rounded *before* the outputs are computed, so Swift reads exactly what Python used: coordinates, sizes and
confidences to 6 decimals (a 4-decimal confidence flips a candidate across the 0.3 body rule on tennis-02 and moves its
score from 98.3% to 94.8%), motion scores and people confidences (unused by the
paths) to 3, so each file stays under 2 MB. Outputs are rounded to 8 decimals.

File: { clip, sport, W, H, stepMs, startMs, maxZoom, follow, ballSource,
        samples: [{t, people: [[x,y,w,h,c]], balls: [[x,y,r,c]], motion: [m|null] | null}],
        filtered: [[[x,y,r,c]]],  # per sample, the tracker's input; [] for players sports
        track: [[x,y,state,conf]],  # state 0 seen, 1 predicted, 2 held, 3 lost; [] for players sports
        rects: [[x,y,w,h]] | null }
"""

from __future__ import annotations

import json
import os

from .filters import filter_balls
from .labels import load_labels
from .metrics import clip_metrics
from .path_v2 import TUNING_PLAYERS, ball_rects
from .policy import policy
from .tracker import track_ball
from .v1path import v1_rects

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "../../../../../.."))
REFS = os.path.join(REPO, "docs/focus-refs")
SEG = os.path.join(REFS, "refs4k/seg")
FIXTURE_DIR = os.path.join(REPO, "app/modules/replay-camera/ios/Core/Tests/ReplayCoreTests/Fixtures/v2")

CLIPS = {
    "basket-v-corner-normal-01": dict(sport="basquete", det=os.path.join(REFS, "bench-out/det/basket-v-corner-normal-01.yolox_s.json"),
                                      labels=os.path.join(REFS, "clips/basket-v-corner-normal-01.ball.json")),
    "basket-v-corner-unavailable-01": dict(sport="basquete",
                                           det=os.path.join(REFS, "bench-out/det/basket-v-corner-unavailable-01.yolox_s.json"),
                                           labels=os.path.join(REFS, "clips/basket-v-corner-unavailable-01.ball.json")),
    "tennis-02": dict(sport="tenis", det=os.path.join(SEG, "det/tennis-02-2160.dfine_s.json"),
                      labels=os.path.join(REFS, "refs4k/tennis-02.ball.json")),
    "volley-01": dict(sport="volei", det=os.path.join(SEG, "det/volley-01-2160.dfine_s.json"),
                      labels=os.path.join(REFS, "refs4k/volley-01.ball.json")),
}


def _r(v, k: int = 6):
    return None if v is None else round(float(v), k)


def _inputs(clip: str) -> tuple[dict, list[dict]]:
    src = CLIPS[clip]
    with open(src["det"]) as f:
        d = json.load(f)
    plan = policy(src["sport"], min(d["W"], d["H"]))
    samples = []
    for s in d["samples"]:
        people = [[_r(p[0]), _r(p[1]), _r(p[2]), _r(p[3]), _r(p[4], 3)] for p in s["people"]]
        if plan["ball_source"] == "detector":
            balls = [[_r(b[0]), _r(b[1]), _r(b[2]), _r(b[3])] for b in s["balls"]]
            motion = s.get("motion")
            motion = None if motion is None else [_r(m, 3) for m in motion]
        else:
            balls, motion = [], None
        samples.append({"t": int(s["t"]), "people": people, "balls": balls, "motion": motion})
    return dict(d, plan=plan, sport=src["sport"]), samples


def build(clip: str) -> dict:
    d, samples = _inputs(clip)
    W, H, plan = d["W"], d["H"], d["plan"]
    aspect = "portrait" if H >= W else "landscape"
    as_tuples = [{"t": s["t"], "people": [tuple(p) for p in s["people"]], "balls": [tuple(b) for b in s["balls"]]}
                 for s in samples]
    filtered, track = [], []
    if plan["follow"] == "players":
        boxes = [(s["t"], [p[:4] for p in s["people"]]) for s in as_tuples]
        rects = v1_rects(boxes, W, H, aspect, True, plan["max_zoom"], TUNING_PLAYERS)
    else:
        filtered = [filter_balls(s, x["motion"]) for s, x in zip(as_tuples, samples)]  # every ball sport: detector
        tracked = [dict(s, balls=f) for s, f in zip(as_tuples, filtered)]
        track = track_ball(tracked, hw=H / W)
        rects = ball_rects(tracked, track, W, H, aspect, plan["max_zoom"])
    return {
        "clip": clip, "sport": d["sport"], "W": W, "H": H, "stepMs": 100, "startMs": d["startMs"],
        "maxZoom": plan["max_zoom"], "follow": plan["follow"],
        "ballSource": plan["ball_source"],
        "samples": samples,
        "filtered": [[list(b) for b in f] for f in filtered],
        "track": [[_r(r[0], 8), _r(r[1], 8), r[2], _r(r[3], 8)] for r in track],
        "rects": None if rects is None else [[_r(v, 8) for v in r] for r in rects],
    }


def players_rects(fixture: dict) -> list | None:
    """The players path on a fixture's own samples (for the ball-led vs players comparison)."""
    boxes = [(s["t"], [tuple(p[:4]) for p in s["people"]]) for s in fixture["samples"]]
    aspect = "portrait" if fixture["H"] >= fixture["W"] else "landscape"
    return v1_rects(boxes, fixture["W"], fixture["H"], aspect, True, fixture["maxZoom"], TUNING_PLAYERS)


def score(fixture: dict, rects: list | None):
    return clip_metrics(rects, load_labels(CLIPS[fixture["clip"]]["labels"]), fixture["startMs"])


def write_all(out_dir: str = FIXTURE_DIR) -> list[tuple[str, int, dict]]:
    os.makedirs(out_dir, exist_ok=True)
    done = []
    for clip in CLIPS:
        fx = build(clip)
        path = os.path.join(out_dir, f"{clip}.json")
        with open(path, "w") as f:
            json.dump(fx, f, separators=(",", ":"))
        done.append((path, os.path.getsize(path), fx))
    return done
