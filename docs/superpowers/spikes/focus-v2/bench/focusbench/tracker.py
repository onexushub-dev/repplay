"""Ball tracker prototype (spec 2026-10-24 §4.2). The reference the ReplayCore `BallTracker` (part 2) must match.

Per sample (100 ms): ball candidates (x, y, r, conf) and people boxes, 0..1 of the frame, origin top-left.
Out per sample: (x, y, state, conf), state SEEN | PREDICTED | HELD | LOST.

1. Static out: a candidate with another candidate within `static_radius` (frame widths) in ≥ `static_share` of the
   samples within ±`static_window_ms` is part of the scenery (decorative balls, spare balls on the floor); so is a
   track whose matches never leave `static_track_radius` of their centre (blobs seen only now and then).
2. Tracks: constant-velocity Kalman filter in frame-width units (y × H/W), association gate growing with misses; a
   track counts once it has `start_hits` matches within `start_window_ms`; it ends after `predict_max_ms` unmatched.
3. Offline: forward filter, then a backward (RTS) smoother over each track.
4. Main track per sample: the one covering it with the highest sum of matched confidences.
5. Gaps: up to `predict_max_ms` after a track's last match → PREDICTED (extrapolated); then HELD at the centre of the
   moving player nearest the last seen ball (followed sample to sample; painted or seated figures are left out) until `held_max_ms` after the last sighting; then LOST.
   A track with one match has a wider gate (`gate_new`): its speed is not known yet.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

SEEN, PREDICTED, HELD, LOST = 0, 1, 2, 3

TRACKER_TUNING = dict(
    static_share=0.70, static_window_ms=2000.0, static_radius=0.01,
    start_hits=3, start_window_ms=500.0, predict_max_ms=700.0, held_max_ms=3000.0,
    accel_std=3.0,  # frame widths / s², process noise of the constant-velocity model
    meas_std=0.006,  # frame widths
    gate_base=0.08, gate_growth=0.05,  # frame widths; gate = base + growth × consecutive misses
    gate_new=0.35,  # frame widths per step for a track with one match (its speed is unknown yet)
    static_track_radius=0.015,  # frame widths: a track whose matches all stay this close to their centre is scenery
    # Who can have the ball: people that move (v1's still rule: feet within 1.2% of the width in 80% of ±3 s).
    still_person_radius=0.012, still_person_share=0.8, still_person_window_ms=3000.0,
)

TrackRow = tuple[float, float, int, float]


def _moving_people(samples: list[dict], hw: float, t: dict) -> list[list]:
    feet = [[(p[0] + p[2] / 2, (p[1] + p[3]) * hw) for p in s["people"]] for s in samples]
    out = []
    for i, s in enumerate(samples):
        keep = []
        for j, p in enumerate(s["people"]):
            fx, fy = feet[i][j]
            hits = total = 0
            for k, o in enumerate(samples):
                if k == i or abs(o["t"] - s["t"]) > t["still_person_window_ms"]:
                    continue
                total += 1
                if any(math.hypot(fx - gx, fy - gy) < t["still_person_radius"] for gx, gy in feet[k]):
                    hits += 1
            if not (total > 0 and hits >= t["still_person_share"] * total):
                keep.append(p)
        out.append(keep)
    return out


def _static(samples: list[dict], hw: float, t: dict) -> list[list[bool]]:
    flags = []
    for i, s in enumerate(samples):
        row = []
        for (x, y, _, _) in s["balls"]:
            hits = total = 0
            for k, o in enumerate(samples):
                if k == i or abs(o["t"] - s["t"]) > t["static_window_ms"]:
                    continue
                total += 1
                if any(math.hypot(x - ox, (y - oy) * hw) < t["static_radius"] for (ox, oy, _, _) in o["balls"]):
                    hits += 1
            row.append(total > 0 and hits >= t["static_share"] * total)
        flags.append(row)
    return flags


@dataclass
class _Track:
    x: np.ndarray  # state: x, y (width units), vx, vy (per second)
    P: np.ndarray
    last_t: float
    misses: int = 0
    score: float = 0.0
    hits: list[tuple[int, float, float, float]] = field(default_factory=list)  # (sample index, x, y_w, conf)
    states: dict = field(default_factory=dict)  # sample index → (x, P, x_pred, P_pred) forward pass

    def confirmed(self, t: dict, step: float) -> bool:
        if len(self.hits) < t["start_hits"]:
            return False
        first = self.hits[t["start_hits"] - 1][0] - self.hits[0][0]
        return first * step <= t["start_window_ms"]


def _matrices(dt: float, t: dict):
    F = np.array([[1, 0, dt, 0], [0, 1, 0, dt], [0, 0, 1, 0], [0, 0, 0, 1]], dtype=float)
    q = t["accel_std"] ** 2
    G = np.array([[dt * dt / 2, 0], [0, dt * dt / 2], [dt, 0], [0, dt]])
    Q = q * G @ G.T
    H = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], dtype=float)
    R = np.eye(2) * t["meas_std"] ** 2
    return F, Q, H, R


def track_ball(samples: list[dict], tuning: dict | None = None, hw: float = 1.0) -> list[TrackRow]:
    """`hw`: frame height over width, so distances are measured in frame widths."""
    t = dict(TRACKER_TUNING, **(tuning or {}))
    n = len(samples)
    if n == 0:
        return []
    step = (samples[-1]["t"] - samples[0]["t"]) / (n - 1) if n > 1 else 100.0
    dt = step / 1000
    F, Q, H, R = _matrices(dt, t)
    static = _static(samples, hw, t)
    max_misses = int(round(t["predict_max_ms"] / step))

    live: list[_Track] = []
    done: list[_Track] = []
    for i, s in enumerate(samples):
        cands = [(x, y * hw, c) for (x, y, _, c), st in zip(s["balls"], static[i]) if not st]
        for tr in live:  # predict
            xp, Pp = F @ tr.x, F @ tr.P @ F.T + Q
            tr.states[i] = (xp, Pp, xp, Pp)
        used = set()
        for ci in sorted(range(len(cands)), key=lambda j: -cands[j][2]):  # greedy, most confident first
            cx, cy, cc = cands[ci]
            best, best_d = None, None
            for tr in live:
                xp = tr.states[i][2]
                d = math.hypot(cx - xp[0], cy - xp[1])
                gate = t["gate_new"] * (1 + tr.misses) if len(tr.hits) == 1 else t["gate_base"] + t["gate_growth"] * tr.misses
                if d <= gate and (best_d is None or d < best_d) and id(tr) not in used:
                    best, best_d = tr, d
            if best is None:
                continue
            used.add(id(best))
            xp, Pp = best.states[i][2], best.states[i][3]
            y_res = np.array([cx, cy]) - H @ xp
            S = H @ Pp @ H.T + R
            K = Pp @ H.T @ np.linalg.inv(S)
            best.x, best.P = xp + K @ y_res, (np.eye(4) - K @ H) @ Pp
            best.states[i] = (best.x, best.P, xp, Pp)
            best.misses, best.last_t = 0, s["t"]
            best.score += cc
            best.hits.append((i, cx, cy, cc))
            cands[ci] = None
        for tr in live:
            if id(tr) not in used:
                tr.x, tr.P = tr.states[i][0], tr.states[i][1]
                tr.misses += 1
        for c in cands:  # a candidate nobody claimed starts a track
            if c is None:
                continue
            P0 = np.diag([t["meas_std"] ** 2, t["meas_std"] ** 2, 1.0, 1.0])
            tr = _Track(np.array([c[0], c[1], 0.0, 0.0]), P0, s["t"], score=c[2], hits=[(i, c[0], c[1], c[2])])
            tr.states[i] = (tr.x, tr.P, tr.x, tr.P)
            live.append(tr)
        keep = []
        for tr in live:
            (done if tr.misses > max_misses else keep).append(tr)
        live = keep
    done += live

    # Offline smoothing over each confirmed track, from its first to its last match.
    tracks = []
    for tr in done:
        if not tr.confirmed(t, step):
            continue
        mx = sum(h[1] for h in tr.hits) / len(tr.hits)
        my = sum(h[2] for h in tr.hits) / len(tr.hits)
        if max(math.hypot(h[1] - mx, h[2] - my) for h in tr.hits) < t["static_track_radius"]:
            continue  # never moved: scenery (rule 1 misses blobs seen only now and then)
        first, last = tr.hits[0][0], tr.hits[-1][0]
        idx = [k for k in sorted(tr.states) if first <= k <= last]
        xs = {k: tr.states[k][0] for k in idx}
        Ps = {k: tr.states[k][1] for k in idx}
        for a, b in zip(reversed(idx[:-1]), reversed(idx[1:])):
            xp, Pp = tr.states[b][2], tr.states[b][3]
            C = Ps[a] @ F.T @ np.linalg.inv(Pp)
            xs[a] = xs[a] + C @ (xs[b] - xp)
            Ps[a] = Ps[a] + C @ (Ps[b] - Pp) @ C.T
        matched = {h[0]: h[3] for h in tr.hits}
        last_x = xs[last]
        rows = {}
        for k in idx:
            rows[k] = (xs[k][0], xs[k][1], SEEN if k in matched else PREDICTED, matched.get(k, 0.0))
        for k in range(last + 1, min(n, last + 1 + max_misses)):  # extrapolate after the last match
            g = (k - last) * dt
            rows[k] = (last_x[0] + last_x[2] * g, last_x[1] + last_x[3] * g, PREDICTED, 0.0)
        tracks.append((tr.score, rows, (xs[last][0], xs[last][1]), last))

    movers = _moving_people(samples, hw, t)
    out: list[TrackRow] = []
    held_from: tuple[float, float] | None = None
    last_seen: tuple[int, float, float] | None = None  # sample index, x, y (width units)
    for i, s in enumerate(samples):
        cover = [(score, rows[i]) for score, rows, _, _ in tracks if i in rows]
        if cover:
            score, row = max(cover, key=lambda c: (c[1][2] == SEEN, c[0]))
            x, yw, state, conf = row
            out.append((x, yw / hw, state, conf))
            if state == SEEN:
                last_seen = (i, x, yw)
            held_from = None
            continue
        if last_seen is not None and (i - last_seen[0]) * step <= t["held_max_ms"] and movers[i]:
            ref = held_from if held_from is not None else (last_seen[1], last_seen[2])
            centres = [(p[0] + p[2] / 2, (p[1] + p[3] / 2) * hw) for p in movers[i]]
            cx, cy = min(centres, key=lambda c: math.hypot(c[0] - ref[0], c[1] - ref[1]))
            held_from = (cx, cy)
            out.append((cx, cy / hw, HELD, 0.0))
            continue
        out.append((0.0, 0.0, LOST, 0.0))
    return out
