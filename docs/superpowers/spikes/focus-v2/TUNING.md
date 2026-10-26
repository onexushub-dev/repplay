# Modo Foco v2 — tuning round (plan part 1, task 11)

> 2026-10-25 · 37 basketball clips (16 portrait, 21 landscape), 35 labelled · 849 in-play ball points
> (1 every 500 ms) · detections: YOLOX-S on all 37, D-FINE-S on an 8-clip subset · people tiling as in the bench.

## TL;DR

- **The ball tracker does not earn its place on these clips.** The COCO detectors find the ball in 17% (YOLOX-S) or
  56% (D-FINE-S, at ~8% precision) of the labelled samples. The tracker locks on the wrong object in 21% (YOLOX) to
  62–79% (D-FINE) of them, and every ball-led framing scored *below* the player-only framing at the same zoom.
- **Player-only framing with the new people detector meets all four spec §1 targets** once the zoom cap is lifted to
  3× (needs a ≥ 2K capture; spec decision 4) and the crop is tightened and smoothed:

| Framing | Ball in crop | Mean zoom | Jerk p95 | Unavailable |
|---|---|---|---|---|
| v1 path + YOLOX people, 1.5× cap (today's tuning) — reference | 99.6% | 1.34× | 0.22 | 0 |
| v1 path + YOLOX people, 1.5× cap, proposal tuning | 99.1% | 1.44× | 0.25 | 0 |
| v2 ball-led (current prototype), 3× cap | 94.1% | 1.91× | 1.22 | 0 |
| **Players only, 3× cap, tuned (proposal)** | **97.3%** | **2.01×** | **0.17** | **0** |

Proposal tuning (over `TUNING_V1`): `spreadScale 1.3 → 1.1`, `spreadMargin 0.15 → 0.10`, `sigmaXMs 500 → 800`, max
zoom `min(3, fitShort / 720)`. Worst clip: 82% (basket-v-corner-unavailable-04, 9/11).

## Zoom vs ball in crop, player-only (3× cap unless noted)

| spreadScale / margin | Ball in crop | Mean zoom | Jerk |
|---|---|---|---|
| 1.3 / 0.15 (v1) | 99.3% | 1.76× | 0.32 |
| 1.1 / 0.10 | 97.8% | 2.01× | 0.37 |
| 1.0 / 0.05 | 89.6% | 2.23× | 0.41 |
| 0.9 / 0.03 | 80.8% | 2.42× | 0.44 |
| 0.8 / 0.00 | 71.8% | 2.65× | 0.48 |

Smoothing at 1.1 / 0.10: `sigmaXMs` 800 → jerk 0.17 (97.3%); 1000 → 0.12 (97.1%). 800 is the pick.

## Why the ball path failed

1. **Recall.** The basketball is ~0.008 frame widths (~15 px at 1080p, ~5 px at the 640 input even with tiling).
   YOLOX-S sees it in 137 of 849 labelled samples.
2. **Clutter.** D-FINE-S sees it far more often but returns ~10 candidates per sample; 92% are scenery or players'
   heads/hands. A wider static filter (`static_radius 0.02, static_share 0.5`) removes 54% of them and keeps 88% of
   the true ball, still leaving ~3 junk candidates per sample.
3. **Association.** With that clutter the constant-velocity tracker builds "chimera" tracks hopping between junk: the
   wrong tracks have the same extent, speed, duration and confidence as the right ones (median 0.17 vs 0.16 frame
   widths extent, 0.15 vs 0.15 fw/s), so no score can pick between them. Tighter gates (`gate_new` 0.12–0.15,
   `gate_base` 0.04–0.05, `start_hits` 4) moved tracked-right by a few points at most.
4. **Camera.** The bang-bang controller (acceleration-limited) put jerk at the `accel_max` ceiling (1.5) in every
   clip with a track. Not worth fixing while the input is this noisy.

When the tracker is off, v2 falls back to v1 and misses 4 of 457 samples; with a track on, it misses 46 of 392.

## Recommendation

- **v2 = better people detector (YOLOX-S + tiling) + v1 path with the tuning above + 3× cap from a ≥ 2K capture.**
  This fixes "Modo Foco indisponível", gives +50% zoom and a smoother camera, and needs no ball model.
  ReplayCore changes: tuning constants and the max-zoom rule only; `BallTracker` is not needed for this release.
- Ball tracking stays a research item for sports where the ball leaves the players (beach tennis, volleyball,
  table tennis). It needs a ball-specific model (e.g. a TrackNet-style heatmap net, open-source for tennis/badminton)
  or a small detector fine-tuned on our own labels, plus labels for those sports. None of the 28 refs are labelled.
- D-FINE-S vs YOLOX-S: for people only, YOLOX-S is enough (0 unavailable). Device timing (task 2) still decides.

## Caveats

- Basketball only. The reference (beach tennis) is the case where the ball matters most; this round cannot speak to it.
- 21 landscape clips are 720p (old thermal behaviour); at 3× their framing is right but they would be soft. New
  captures are 1080p+; the 3× cap needs 2K/4K (spec decision 4).
- Labels are 1 per 500 ms and points only; "ball in crop" counts the point, not the whole ball.
- Scripts used: `bench/run.py`, plus ad-hoc grids over `focusbench` (not committed). Previews of the proposal:
  `docs/focus-refs/bench-out/preview-people3x/` (left: today, 1.5×; right: proposal, 3×; green dot: label).

## Test D — motion filter on D-FINE-S candidates (2026-10-25, 8-clip subset, 155 labelled points)

Fixed camera, so a real ball changes its patch between grid frames. Motion score per candidate: mean |Δ| of a
grey patch (radius 1.5 r, ≥ 4 px at 960 px) vs the previous *and* the next sample (min of both).

| Filter | True ball kept | Junk kept |
|---|---|---|
| motion ≥ 4 | 91% | 31% |
| motion ≥ 8 | 78% | 25% |

What survives is mostly players: of the moving junk, 145 candidates sit in the bottom 15% of a person box (shoes; the
real ball: 4) and 150 in the body (real ball: 31). Outside any person: 21 junk vs 35 real.

| Tracker input (all + static 0.02/0.5) | Tracked right | Tracked wrong | Not tracked | Ball-led framing |
|---|---|---|---|---|
| raw | 19% | 79% | 1% | 76.8% |
| motion ≥ 4 | 25% | 72% | 4% | 70.3% |
| motion ≥ 4, no feet zone | 48% | 44% | 8% | 77.4% |
| motion ≥ 4, no feet, body needs conf ≥ 0.3 | 45% | 24% | 31% | 83.9% |
| motion ≥ 8, no feet, body needs conf ≥ 0.3 | 44% | 19% | 37% | 86.5% |

Players-only (proposal tuning, 3×) on the same points: **97.4%**. A hybrid (players-only crop, shifted to include a
SEEN ball near/over its edge; margins 0.10–0.20, smoothing 300–800 ms) scored 96.1–96.8%: players-only misses only 4
of these 155 points, and the wrong tracks cost more than they recover.

Verdict: the filters are worth keeping (they turn the tracker from mostly wrong to mostly right), but on basketball
the ball still does not beat players-only framing. Ball tracking has to prove itself on sports where the ball leaves
the players (beach tennis, table tennis) — the 4K round.
