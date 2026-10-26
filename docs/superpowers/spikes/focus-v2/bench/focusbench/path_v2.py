"""FocusPath v2 prototype (spec 2026-10-24 §4.3): the framing follows the ball and the players near it.

Per sample, from the tracker rows and the people (v1's far/still filters):
1. Subject: SEEN/PREDICTED → the ball; HELD → the holder (the tracker row); LOST → v1's weighted players' centre.
2. Target: x = 0.7 subject + 0.3 centre of its 2 nearest players; y = 0.3 subject + 0.7 those players (lobs and
   sets don't drag the camera up). No players near → the subject.
3. Look-ahead: the subject at t + Δ, Δ up to 0.5 s growing with the ball's speed.
4. Lead room: shifted by the subject's horizontal speed × 0.5 s, capped at ±15% of the crop width.
5. Size: spread of the subject and its 2 nearest players × 1.3 + 0.15, widest within the next 0.8 s, smoothed 1.2 s.
6. Camera: holds while the target stays inside the central 40% of the crop width; once it leaves, follows the target
   until it is back near the middle and nearly still (hysteresis). Pan limit 0.35 frame widths/s, up to 0.8 crop widths/s when the
   target is outside the middle 70%; acceleration ≤ 1.5 crop widths/s².
7. y smoothed as v1 (0.8 s); placement as v1 (lift, clamped inside the video); None as v1 (< 20% samples with people).
A clip whose track never finds the ball gets exactly v1's rects.

`ball_rects` is the frozen ball-led path (spec §13.1 decision 13; ReplayCore `FocusBallPath` ports it): steps 1-5 and
7 as above, but no controller (step 6): the camera is the target, placed as v1, then a Gaussian (σ `camera_sigma_ms`,
v1's edge-held kernel) on the rects' centre x, centre y, width and height, clamped inside the video. A clip whose
track never finds the ball gets exactly the players path (`v1_rects` with `TUNING_PLAYERS`).
"""

from __future__ import annotations

import math

from .tracker import HELD, LOST, PREDICTED, SEEN, TRACKER_TUNING
from .v1path import TUNING_V1, enough_people, fill, filter_people, gaussian, place, v1_rects, v1_targets

TUNING_V2 = dict(
    TRACKER_TUNING,
    ball_weight_x=0.7, ball_weight_y=0.3, near_players=2,
    lookahead_max_s=0.5, lookahead_full_speed=1.0,  # Δ reaches its max at this ball speed (frame widths / s)
    lead_s=0.5, lead_max=0.15,  # lead = speed × lead_s, capped at lead_max of the crop width
    dead_zone_w=0.40, settle=0.05,  # follow until the target is within `settle` crop widths of the centre…
    settle_speed=0.1,  # …and moves slower than this (frame widths / s)
    sigma_lead_ms=300.0,  # the speed behind the lead room is smoothed, so jitter does not push the camera
    size_lookahead_s=0.8, spread_scale=1.3, spread_margin=0.15, sigma_size_ms=1200.0,
    sigma_x_ms=200.0, sigma_y_ms=800.0,
    pan_base=0.35,  # frame widths / s
    pan_fast=0.8, fast_when_outside=0.70,  # crop widths / s when the target is outside the middle 70%
    accel_max=1.5,  # crop widths / s²
    camera_sigma_ms=600.0,  # ball_rects: Gaussian on the placed rects (decision 13)
)

# Players framing tuned for zoom (spec §13.1 decision 12).
TUNING_PLAYERS = dict(TUNING_V1, spreadScale=1.1, spreadMargin=0.10, sigmaXMs=800.0)

MIN_CROP_PX = 720  # the crop keeps at least this many source pixels on its short side (spec decision 4)


def max_zoom_for(fit_short_px: float) -> float:
    """Max zoom from the short side (source pixels) of the largest rect of the target aspect that fits the video."""
    return max(1.0, min(3.0, fit_short_px / MIN_CROP_PX))


def _centre(b) -> tuple[float, float]:
    return b[0] + b[2] / 2, b[1] + b[3] / 2


def _targets(samples: list[dict], boxes: list, track: list[tuple], W: float, H: float, aspect: str, zoom: bool,
             max_zoom: float, t: dict) -> tuple | None:
    """Steps 1-5 and the y smoothing of 7: (tx with lead room, ty, widths, step, dt); None as v1 (too few people)."""
    n = len(samples)
    step = (samples[-1]["t"] - samples[0]["t"]) / (n - 1) if n > 1 else 100.0
    dt = step / 1000
    hw = H / W

    people = filter_people(boxes, W, H, TUNING_V1)
    if not enough_people(people, TUNING_V1):
        return None
    v1x, v1y, v1spread = v1_targets(people, W, H, TUNING_V1)
    v1x, v1y = fill(v1x), fill(v1y)

    # Subject per sample (frame coordinates) and its horizontal speed.
    subj = [(r[0], r[1]) if r[2] in (SEEN, PREDICTED, HELD) else (v1x[i], v1y[i]) for i, r in enumerate(track)]
    is_ball = [r[2] in (SEEN, PREDICTED) for r in track]
    vx = [0.0] * n
    for i in range(n):
        a, b = max(0, i - 1), min(n - 1, i + 1)
        if b > a and is_ball[a] and is_ball[b]:
            vx[i] = (subj[b][0] - subj[a][0]) / ((b - a) * dt)
    speed = [0.0] * n
    for i in range(n):
        a, b = max(0, i - 1), min(n - 1, i + 1)
        if b > a and is_ball[a] and is_ball[b]:
            speed[i] = math.hypot(subj[b][0] - subj[a][0], (subj[b][1] - subj[a][1]) * hw) / ((b - a) * dt)

    tx, ty, spread = [], [], []
    for i in range(n):
        if track[i][2] == LOST:
            tx.append(v1x[i])
            ty.append(v1y[i])
            spread.append(v1spread[i])
            continue
        ahead = t["lookahead_max_s"] * min(1.0, speed[i] / t["lookahead_full_speed"])
        j = min(n - 1, i + int(round(ahead / dt)))
        if track[j][2] == LOST:
            j = i
        sx, sy = subj[j]
        near = sorted((_centre(b) for b in people[i]), key=lambda c: math.hypot(c[0] - sx, (c[1] - sy) * hw))
        near = near[: t["near_players"]]
        if near:
            px = sum(c[0] for c in near) / len(near)
            py = sum(c[1] for c in near) / len(near)
            tx.append(t["ball_weight_x"] * sx + (1 - t["ball_weight_x"]) * px)
            ty.append(t["ball_weight_y"] * sy + (1 - t["ball_weight_y"]) * py)
            xs = [sx] + [c[0] for c in near]
            spread.append(max(xs) - min(xs))
        else:
            tx.append(sx)
            ty.append(sy)
            spread.append(None)

    # Size: widest spread within the look-ahead window, then v1's clamp and smoothing.
    sp = fill(spread)
    k_ahead = int(round(t["size_lookahead_s"] / dt))
    sp = [max(sp[i:i + k_ahead + 1]) for i in range(n)]
    if zoom:
        widths = gaussian([min(max(v * t["spread_scale"] + t["spread_margin"], 1 / max_zoom), 1) for v in sp],
                          t["sigma_size_ms"] / step)
    else:
        ratio = 16 / 9 if aspect == "landscape" else 9 / 16
        widths = [min(1, ratio * H / W)] * n

    tx = gaussian(tx, t["sigma_x_ms"] / step)
    ty = gaussian(ty, t["sigma_y_ms"] / step)
    vx = gaussian(vx, t["sigma_lead_ms"] / step)
    for i in range(n):  # lead room
        tx[i] += max(-t["lead_max"] * widths[i], min(t["lead_max"] * widths[i], vx[i] * t["lead_s"]))
    return tx, ty, widths, step, dt


def v2_rects(samples: list[dict], track: list[tuple], W: float, H: float, aspect: str, zoom: bool,
             max_zoom: float, tuning: dict | None = None) -> list | None:
    """The round-1 prototype: steps 1-7 with the dead-zone controller (kept for the round's numbers and tests)."""
    t = dict(TUNING_V2, **(tuning or {}))
    n = len(samples)
    if n == 0 or W <= 0 or H <= 0:
        return None
    boxes = [(s["t"], [tuple(p[:4]) for p in s["people"]]) for s in samples]
    if all(r[2] == LOST for r in track):
        return v1_rects(boxes, W, H, aspect, zoom, max_zoom, TUNING_V1)
    got = _targets(samples, boxes, track, W, H, aspect, zoom, max_zoom, t)
    if got is None:
        return None
    tx, ty, widths, step, dt = got
    tv = [0.0] + [(tx[i] - tx[i - 1]) / dt for i in range(1, n)]  # the target's own speed

    # Camera: dead zone with hysteresis, speed and acceleration limits.
    cam = [0.0] * n
    c, v, following = tx[0], 0.0, False
    for i in range(n):
        w = widths[i]
        err = tx[i] - c
        if not following and abs(err) > t["dead_zone_w"] * w / 2:
            following = True
        if following and abs(err) < t["settle"] * w and abs(tv[i]) < t["settle_speed"]:
            following = False
        desired = tx[i] if following else c
        fast = abs(err) > t["fast_when_outside"] * w / 2
        vmax = max(t["pan_base"], t["pan_fast"] * w) if fast else t["pan_base"]
        v_des = max(-vmax, min(vmax, (desired - c) / dt))
        a = max(-t["accel_max"] * w, min(t["accel_max"] * w, (v_des - v) / dt))
        v = max(-vmax, min(vmax, v + a * dt))
        c = c + v * dt
        cam[i] = c
    return place(cam, ty, widths, W, H, aspect, zoom, TUNING_V1)


def smooth_rects(rects: list, sigma_ms: float, step_ms: float) -> list:
    """Gaussian (v1's edge-held kernel) on centre x, centre y, width and height; then clamped inside the video."""
    sigma = sigma_ms / step_ms
    xs = gaussian([r[0] + r[2] / 2 for r in rects], sigma)
    ys = gaussian([r[1] + r[3] / 2 for r in rects], sigma)
    ws = gaussian([r[2] for r in rects], sigma)
    hs = gaussian([r[3] for r in rects], sigma)
    out = []
    for cx, cy, w, h in zip(xs, ys, ws, hs):
        out.append((min(max(cx - w / 2, 0), 1 - w), min(max(cy - h / 2, 0), 1 - h), w, h))
    return out


def ball_rects(samples: list[dict], track: list[tuple], W: float, H: float, aspect: str, max_zoom: float,
               tuning: dict | None = None) -> list | None:
    """The frozen ball-led path (decision 13): camera = target, placed, then `smooth_rects`. Always zooms."""
    t = dict(TUNING_V2, **(tuning or {}))
    n = len(samples)
    if n == 0 or W <= 0 or H <= 0:
        return None
    boxes = [(s["t"], [tuple(p[:4]) for p in s["people"]]) for s in samples]
    if all(r[2] == LOST for r in track):
        return v1_rects(boxes, W, H, aspect, True, max_zoom, TUNING_PLAYERS)
    got = _targets(samples, boxes, track, W, H, aspect, True, max_zoom, t)
    if got is None:
        return None
    tx, ty, widths, step, _ = got
    return smooth_rects(place(tx, ty, widths, W, H, aspect, True, TUNING_V1), t["camera_sigma_ms"], step)
