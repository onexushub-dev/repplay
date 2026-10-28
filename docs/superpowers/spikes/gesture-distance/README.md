# Gesture at a distance (gesture v2, 2026-10-27)

Goal: the gesture trigger should work from the far side of the court (15-20 m), not only when the player walks up to
the phone.

## Why it failed far away

Pixel budget for a 1.75 m player (2.2 m with the arms up), iPhone ultra-wide (0.5x, 13 mm equivalent) at 1080p:

| Distance | Player height (arms up), 1080p | 720p (free plan, hot phone) | 4K (the 1x lens: ~1.8x) |
|---|---|---|---|
| 5 m | 300 px | 200 px | 600 px |
| 10 m | 150 px | 100 px | 300 px |
| 15 m | 100 px | 70 px | 200 px |
| 20 m | 75 px | 50 px | 150 px |

Same numbers in portrait or landscape: pixels per metre do not change, only the share of the frame does.

Two steps break, in this order:

1. **Finding the person.** `VNDetectHumanRectanglesRequest` on the whole frame shrinks it to its small input. The
   Modo Foco probe (`docs/focus-refs/misc/*.probe.json`) found people in 24% of the frames of a far court, with a 5th
   percentile height of 9% of the frame: smaller players are not found at all, and then pose ran on the whole frame,
   where a far player is a few pixels. With the 0.5x lens 9% of the frame is ~12 m with the phone on its side, ~7 m upright.
2. **Reading the pose.** Proxy experiment (YOLO11-pose, spike only, on 65 arms-up moments from the beach and indoor
   volleyball references, each shrunk to a given height): the arms-up rule is read in 88% of samples at 200 px,
   74% at 140, 51% at 110, 43% at 90, 28% at 75, 11% at 60. False "arms up" stayed at 0-2% of samples.
   Relaxing the thresholds (wrists 0.2 instead of 0.35 shoulder widths above the head) changed almost nothing:
   far away the wrists are not found, they are not just a bit low.

With the old HoldTracker (gap 0.8 s, 4 hits), a gesture held for 3 s fires in 80% of attempts at 43% per-sample
(~17 m at 1080p), 43% at 28% (~20 m). With gap 1.2 s and 3 hits: 91% and 64%. Holding longer is the cheapest
"execution" lever: the same rules give 48% for a 2 s hold and 80% for 3 s at 43% per-sample.

## What changed (app)

- `GesturePipeline` (iOS): the vision work of one sample, shared by the app and this probe.
  - Whole-frame person detection **plus 2 tiles per sample** (`ScanTiles`, 3x3 overlapping half-frame regions,
    middle row first): far players appear at twice the size to the detector. Tile boxes must be confident
    (>= 0.5), person-shaped and >= 28 px tall.
  - **`PersonTracks`**: people are kept for 3 s after the last detection, so the round-robin tiles and a flickering
    detector do not lose them; pose runs on the last known box (a player making the gesture stands still).
    Somebody with the arms up goes first every sample; the others take turns (the old code always took the 4 biggest,
    so far players never got a turn when near ones were in the frame).
  - Small crops are **enlarged (Lanczos) to 384 px** before pose.
- `HoldTracker`: gap tolerance 0.8 -> 1.2 s, hits 4 -> 3. The hold still has to last 1.5 s.
- Debug event (`onGestureDebug`) also reports `posed`, `fromTiles`, `smallestPx`.

Cost: 1 + 2 person detections (was 1) and up to 4 poses per sample; when hot, 1 tile and 2 people.

Not changed: Android (ML Kit single-person pose on 640x360 frames, never field-tested; needs its own pass), and the
capture resolution (see "Next levers").

## Field test

Record with the Repplay camera itself (or the iPhone camera at 0.5x, 1080p30, same mount), phone where it would be in
a game. Mark the distances on the sand (tape measure). One clip per line, named as below:

| Clip | What the player does |
|---|---|
| `hold-5m-01`, `hold-10m-01`, `hold-15m-01`, `hold-20m-01` | 3 times, ~8 s apart: both arms straight up, still, for 3 s, then down |
| `wave-5m-01` ... `wave-20m-01` | 3 times, ~8 s apart: wave both arms above the head for 3 s |
| `play-01`, `play-02`, ... | normal play, no gesture (10+ min in total: blocks, celebrations, serves) |

Repeat the 15 m and 20 m clips facing the phone and side-on, and once in landscape and once upright if both are used.
Different players and shirt colours help.

Then, on the Mac:

```sh
cd docs/superpowers/spikes/gesture-distance
./build-probe.sh
/tmp/gesture-probe clips/*.mov        # writes clips/<clip>.gesture.json (wholeFrame and standard modes)
python3 report.py clips/              # hits per distance, false fires per 10 min, and replayed rule variants
```

The report's `app` replay must equal the probe's `standard` fires (it warns otherwise). `previousHold` shows the old
hold rule on the new people-finding; `rise0.2`, `noElbows`, `hold1.2s` are looser rules to try if far hits are low.
Pick the variant with the most far hits whose `play` false fires stay under ~1 per 10 min (spec target: 2 in 2 h).

In the app, `/spike` shows the live debug event: `people`, `fromTiles` and `smallestPx` tell whether the far player
is found, `isX`/`raised` whether the pose reads the arms.

## Next levers (if 20 m is still short)

1. **More pixels for the detector without recording more**: capture 4K and let the writer scale to 1080p
   (`AVVideoScalingModeKey`), so the gesture sees 150 px at 20 m instead of 75. Costs heat and battery; the thermal
   ladder already drops to 720p when hot.
2. **Zoom in a little**: 0.7x instead of 0.5x is 1.4x the pixels, if the court still fits.
3. **Free plan at 720p** captures 50 px at 20 m: capture 1080p and export 720p, or accept a shorter gesture range there.
4. Coach the gesture: "both arms up, still, 3 seconds" (static is sharper than waving; the hold rule also fires on a
   long overhead wave).

## Files

- `probe/main.swift`, `build-probe.sh`: the Mac probe (compiles the app's ReplayCore gesture files + `GesturePipeline.swift`).
- `report.py`: summary and rule replay (Python port of ArmsUp, HoldTracker and WaveTracker: keep in sync).
- `experiment/`: the proxy experiment (YOLO11-pose, AGPL, spike only, never shipped): `distance_sim.py`, `mc.py`.

## Field test 2026-10-27 (corridor, iPhone 16 Pro Max, 1x, portrait)

- Up to ~10 m every gesture fired (9/9 in the spike report, clips 1-6 in the screen recording); the wave rule fired
  first (~0.9 s), the hold ~1 s later (the trigger bus merges them).
- At the far end of the corridor (~12 m: the player ~200 px tall at 1x, arms clearly up, crossed or waving) nothing
  fired in ~40 s. The pose was never the problem there: the whole-frame detector rarely found the player (~10% of the
  frame height), and **the tiles were broken**: Vision returns `regionOfInterest` boxes normalized to the whole frame,
  not to the region, so mapping them put every tile box in the wrong place (300 of 435 tile boxes match a real person
  once un-mapped). Those phantom boxes also took the pose slots and blocked the whole-frame fallback. Fixed in
  `GesturePipeline.detect`; the Modo Foco `vision-probe.swift` had the same mapping, so its "tiled" numbers are wrong too.
- Vision's shoulder joints are ~0.31 m apart with the arms up (not 0.36): the distance estimate uses that now.

## Field test 2026-10-28 (same corridor, after the tile fix)

- Pose read on 86-91% of the people looked at (was 23-34%): the tile fix worked. Every deliberate gesture fired at
  3, 5, 10 and the marked 15 m (player 118-132 px tall at 1x, wrist confidence 0.26-0.71); at 15 m the player was kept
  by PersonTracks in almost every sample (`kept`), the whole-frame detector found them rarely.
- The far limit was not reached: walking in from 15 m added nothing (already recognized at 15 m).
- The "not recognized" attempts are 1-3 sample flickers with no wrists read, or a second track on the same person
  (box changing between arms up and arms out): PersonTracks now drops a track not seen whose box lies mostly inside one
  seen in the same sample.
- Marked distance vs. estimate: the arms-up box is ~1.35 m tall at every marked distance, ~1.55x short of a real
  arms-up height, so either the marks are ~0.6x the real distance or the focal estimate is off. Measure once with a tape.

## Field test 2026-10-28 (open street, tape-measured, iPhone 16 Pro Max, 1x, portrait)

- 3/3 gestures at 5, 10, 15, 20 and 25 m (player 107-130 px tall at 20-25 m); 1/3 at 30 m (~79 px).
- Distance estimates now match the tape (5.8 / 9.7 / 14.3 / 19.3 / 23.0 m at 5-25 m): the 1.55x gap of the corridor
  test was the eye-measured marks, not the focal estimate.
- 30 m: the phone was hot from 25 m on (sun), so 2 samples/s, 1 tile per sample (a full tile pass every 4.5 s) and
  2 people. The player was found by a tile, kept 3 s, then went 12 s unseen while standing still and gesturing: the
  two missed gestures were never looked at. Added close looks (`ScanTiles.focusRegion`, ~4 heights around a small
  tracked person, or where one was lost in the last 10 s: `PersonTracks.lost` / `focusTargets`), 2 per sample, 1 when hot.

## Field test 2026-10-28 afternoon (20-35 m, after the close looks)

- 3/3 at 20, 25 and 30 m; at ~35 m (marked 30, player ~72 px) 1/3: the close looks kept the player found in every
  sample (`focus`), but at that size the wrists drop out every other sample, so only a gesture held ~2.5 s fires.
- Thermal: nominal 65%, fair 35%, never serious, with the phone in direct sun for the whole test (~3 min of this
  file, after the morning session also in the sun). A good sign, not the long test: heat builds up over an hour.
- Many players (next): the hold was one tracker for everybody (two players' blocks one after the other could add up
  to a hold) and the wave matched people by position only (players standing close could mix). Now `PersonHold` keeps a
  HoldTracker per tracked person and WaveTracker follows `Sighting.id`. `play-probe.sh` replays the 12 reference games
  (many players, no deliberate gesture) to count false fires.

## Two people, ~5 m (2026-10-28)

- 2 people moving (one walked right past the camera), only one making the gesture: 4/4 recognized, no fire from the
  other person or from the gesturer's brief raises while moving. The report's reading of the scene matched what was done.
- One gesture fired the wave at 70.0 s and a slow hold at 73.0 s, right at the trigger bus's 3 s: two clips for one
  gesture. `FireGate` (after a fire, nothing until nobody had the arms up for 1 s and 3 s passed) removes the repeats;
  replayed on the last three tests it keeps every real gesture (4/4, 11/11, 16/16).
- Track ids change when a person walks or crosses another (the gesturer had 4); a person standing still to gesture keeps
  theirs, so it only restarts a hold already broken by walking.
