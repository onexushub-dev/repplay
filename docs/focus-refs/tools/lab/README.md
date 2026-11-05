# Modo Foco lab (2026-11-03 to 2026-11-05)

## Outcome (Victor, 2026-11-05) — read this first

**Nothing from this lab went into the app. Production keeps today's Modo Foco (players only, Vision whole frame +
9 tiles, `FocusTuning.action` / v15) unchanged.** No variant was accurate enough on video to replace it:

- **Foco na Bola** (EdgeTAM from one tap, two passes; spec `docs/superpowers/specs/2026-11-04-focus-mode-ball-design.md`,
  status *on hold*): the framing is good when the ball is big and clear (basketball, daylight, YouTube references), but
  on the app's own clips only one (basket-rp-1105-v-a) was good enough to use. Cost solved (two passes at 5 fps: 26.7 s
  per 30 s clip on the 16 Pro Max, never `serious` heat in 15 min, test 14); quality not. A rule to offer it only on
  clips tracked well exists (test 15) but there were too few such app clips.
- **Faster / closer camera from the players alone** (tests 13 and 16: σx, pan speed, zoom up to 2.0x, feet anchor,
  lead on the play, runner pull, optical flow): measurable gains in "ball in crop" (85 → 91%) but not liked on video.
- **One EdgeTAM pass, sparser pass 1, classical detection, Vision trajectories**: worse (tests 3, 4, 12, 14).

**Do not repeat** (results below, with the numbers): SAM 2 / EdgeTAM at 20–30 fps (test 8), one-pass EdgeTAM variants
(test 12), pass 1 at 2.5 / 3.3 fps (test 14), optical flow as a framing signal (test 13), zoom above ~1.5x driven by the
players alone without headroom (test 13: loses the ball above the crop), players-only "broadcast" tunings (13, 16).
**Worth trying if this is reopened**: a light per-frame ball detector (YOLOX, Apache-2.0) instead of a tracker
(spec 10.2 of the base spec); recording at 1x at night (test 15: 0.5x at night never tracked the ball; 1x sometimes);
the ball spec's two fixes (tap inside the crop, fused pass 1 / pass 2 track) and the gate rule, already designed.

**Kept for re-testing** (in git): the tools in `tools/` and `tools/lab/`, the ball labels (`labels/`, 32 clips), the clip
list (`clips.txt`), FocusBench (`ios-bench/`), this README, the specs. Kept locally (not in git): the source videos
(`clips/`, `raw-dump/`, `refs/`), the people files (`renders/**/*.people.json`), the lab's Python envs, checkpoints and
Core ML models (`lab/.venv*`, `lab/models/`, `lab/coreml/`) and every result file (`lab/tests/**/*.json|md`). The extracted
frames, the comparison videos, the old renders and FocusBench's data were deleted on 2026-11-05 to free space (~6.6 GB;
see "Regenerate" at the end).

---

Test bench for the next Modo Foco round. **Nothing here goes into the app.** The goal is to compare, on the same
static-camera clips and against the same ground truth, the ways to make the framing follow the play faster:

| # | Test | Status |
|---|---|---|
| 0 | Ground truth: ball (and one chosen player) on 18 clips, labelled with SAM 2 assist | 4 clips (ball) on 2026-11-03 |
| 1 | SAM 2 "one click on the ball": how long it follows, clicks a user would need (`oneclick.py`, Mac) | **done: first method that follows the ball** (below) |
| 2 | "One click on a player" (custom Modo Foco): SAM 2 first (`oneclick.py --mode person`); Vision `VNTrackObjectRequest`, EdgeTAM, people boxes + appearance after | needs person labels |
| 3 | Vision trajectories (`VNDetectTrajectoriesRequest`), every trajectory at every frame (`vision-traj.swift`, Mac; `vision_eval.py`) | **done: not good enough** (below) |
| 4 | Classical ball detection for a fixed camera (`classical.py`) | **done: not good enough** (below) |
| 5 | Motion (optical flow) as a lead signal for the camera | **done in test 13: no measurable gain over the players alone** |
| 6 | Hybrid framing: the ball while SAM 2 is sure of it, today's Modo Foco when not (`hybrid.py`, videos in `lab/tests/framing/`) | **first round done** (below) |
| 10 | iPhone step 1: EdgeTAM as 4 fixed-shape Core ML models + the tracking loop (`loop.py`, `coreml_export.py`, `coreml-mac.sh`) | **done: same quality as EdgeTAM, 45 ms/frame on the Mac's Neural Engine** (below) |
| 11 | iPhone step 2: time and check the Core ML models on the phones (16 Pro Max, XR) with FocusBench, a throwaway test app (`ios-bench/`, `ios_bench.py`) | **done: 16 Pro Max 122 ms/frame, all on the Neural Engine, same track as the Mac; XR 0.55–0.72 s/frame with GPU, same track, heats up** (below) |
| 16 | Today's Modo Foco a little faster and closer (`broadcast.py scores --all`) | **not adopted (Victor, 2026-11-05): today's framing stays** (below) |
| 15 | When is a clip good enough for the ball framing? A rule from the phone's own signals after the two passes (`ball_gate.py`) | **Foco na Bola on hold (only 1 app clip good enough on video). Rule round 2 on the fused track (ball mode ≥ 50%, speed ≥ 0.10, slow ≤ 15%, confirmed ≥ 50%): right on 22 clips incl. 7 validation clips; two tracking fixes (click inside the crop, pass 1 where pass 2 is not trusted)** (below) |
| 14 | Foco na Bola at 5 fps (EdgeTAM on every 2nd 100 ms frame, interpolated back), two passes and one pass, to bring its cost near today's Modo Foco (`low_fps.py`, `mac-lowfps.sh`) | **done: two passes at 5 fps chosen (quality of v6 on 13 of 15 clips; 26.7 s per 30 s clip on the phone, never serious heat); pass 1 at 2.5/3.3 fps and one pass worse** (below) |
| 13 | A more "broadcast" Modo Foco from the players alone, at today's cost: faster/closer camera rules, a lead on the play, optical flow (`broadcast.py`, `focus_variant.py` options, `flow-probe.swift`, FocusBench `peopleflow`) | **not adopted (Victor, 2026-11-05: did not like it on video); flow not worth it** (below) |
| 12 | Foco na Bola in ONE EdgeTAM pass instead of two: crops guided by the players only (`roi.py --guide p`), or following the previous frame's ball as tracking goes (`single_pass.py`) | **done: no one-pass variant ties with the two passes on every clip; keep two passes** (below) |

Run the Mac tests with `bash tools/lab/mac-tests.sh` (ball) or `bash tools/lab/mac-tests.sh person`.

### Test 6 result (2026-11-03, hybrid framing from the SAM 2 one-click track, 4 clips)

Trust the ball when the mask is ball-sized, ball-shaped, did not jump and is not lying still; ball mode after 3 trusted
frames, through gaps of up to 4; ball rect at today's zoom cap; blend smoothed over ~0.5 s.

| Clip | Ball in crop: today → hybrid | Ball off centre | Zoom | Jerk p95 | Ball mode |
|---|---|---|---|---|---|
| bt-0AE39B33 | 63% → 77% | 0.54 → 0.15 | 1.58x → 1.60x | 0.24 → 0.76 | 69% |
| bt-E5003B6B | 78% → 78% | 0.35 → 0.24 | 1.39x → 1.53x | 0.20 → 0.77 | 57% |
| basket-v-01 | 100% → 100% | 0.29 → 0.09 | 1.65x → 1.65x | 0.01 → 0.31 | 21% |
| yt-basket-04 | 100% → 100% | 0.25 → 0.06 | 1.43x → 1.64x | 0.07 → 0.66 | 91% |

Never worse at keeping the ball in the crop, much more centred on it, 3–10x more camera movement. Open issue: ball mode
also runs when the ball is out of play (64% / 45% of the "out" samples in beach tennis, all 18 in the YouTube clip):
SAM 2 keeps a ball-like mask on a ball being held or lying around between points.

### Test 6, rounds 2–3 (Victor's reviews, 2026-11-03) — `hybrid.py` (round 3 is the default; `--round2`, `--round1`)

- Round 2: back to the players 0.2 s after a lost ball (was up to 0.4 s + 0.5 s), ball zoom 2x (was today's cap).
- Round 3: vertical camera follows the ball's highest point over the last 0.8 s (rises at once, comes down at most 0.2
  frame heights/s, σ 0.4 s): no bobbing on dribbles or a ball hitting the sand. Losses up to 1 s are bridged (the
  camera glides to where the ball comes back): the drop to the players and back was the 25–28 s jolt in yt-bt-06.

| Clip | Ball in crop: today / r2 / r3 | Zoom r3 | Jerk p95: r2 → r3 | Vertical flips per 10 s: r2 → r3 |
|---|---|---|---|---|
| bt-0AE39B33 | 63% / 73% / 73% | 1.92x | 1.03 → 1.88 | 5.3 → 2.7 |
| bt-E5003B6B | 78% / 72% / 72% | 1.77x | 1.58 → 1.03 | 3.0 → 1.3 |
| basket-v-01 | 100% / 100% / 100% | 1.73x | 0.38 → 0.37 | 0.3 → 0.3 |
| yt-basket-04 | 100% / 100% / 98% | 2.00x | 1.15 → 0.43 | 8.3 → 4.0 |
| yt-bt-06 (1 label: video only) | — | 2.00x | 1.01 → 0.56 | 8.3 → 1.7 |

### Test 6, round 4 (default) — vertical: as low as the players, as high as the ball needs

Victor on round 3: the camera rose more than needed on shots and long passes over the top (it centred the ball).
Round 4: the crop's height stays at today's (players') height and moves only to keep the ball's highest point over
the window 15% of the crop below its top edge (and its lowest point 10% above the bottom); round 3's rise-at-once /
come-down-slowly and the 1 s bridges stay. Ball in crop unchanged (yt-basket-04 100%, bt-E5003B6B 72%); the crop
centre's highest point 0.25 → 0.39 (yt-basket-04) and 0.30 → 0.47 (yt-bt-06) of the frame height; vertical flips
~1 per 10 s on every clip.

### Test 6, round 5 (default) — racket-sport filters (`trusted` in hybrid.py)

Victor on bt-wa-1028 (app recording, good rally): SAM 2 slid onto a racket at 9.6 s and at the end. Colour and
"near a player" were measured and do not separate them on this clip (a far, blurred ball changes colour as much as a
racket; Vision missed the player holding it). What does, for beach tennis / tennis / padel only:
rounder masks (aspect <= 2, fill >= 0.6); a mask that suddenly grows x2.5 is suspect until it moves like a ball for
6 frames, and one that shrinks back at once is the ball found again (SAM 2 often re-finds it by itself: 10.8 s,
12.0 s); a mask moving < 0.10 frame long sides over ±0.5 s for >= 0.6 s is not a ball in a rally.

| Clip | Ball in crop: today / r4 / r5 | Ball mode r4 → r5 |
|---|---|---|
| bt-0AE39B33 | 63% / 73% / 80% | 80% → 17% (held balls between points dropped) |
| bt-E5003B6B | 78% / 72% / 100% | 59% → 15% |
| yt-bt-06 (video only) | — | 100% → 97% |
| bt-wa-1028 (video only) | — | 81% → 61% (rackets 9.6–10.6, 11.0–11.6, 15.0–16.8 s dropped) |
| basketball clips | unchanged (filters off) | unchanged |

Left for later: SAM 2 does not come back from a racket by itself every time. An automatic correction (a negative
prompt on the rejected object and a positive one on a ball candidate, then propagate again) would re-acquire it.

### Test 16: today's Modo Foco, a little faster and closer (2026-11-05) — `broadcast.py scores --all`

Victor, after the fuse5 videos: of the app clips only basket-rp-1105-v-a was good enough to use the ball framing;
**Foco na Bola is on hold, production keeps today's Modo Foco**. Next: only a faster camera and a little more zoom when
possible, tested before the app. Milder than test 13 (no lead, no runner pull, no widen by default), on the 17
labelled clips (`summary-mild.md`; the new clips with whole frame + tiles as the app):

| Variant | Ball in crop | Off centre | Zoom mean / max | Pan p95 / mean | Jerk p95 | Vertical flips / 10 s |
|---|---|---|---|---|---|---|
| today | 88% | 0.30 | 1.34x / 1.54x | 0.07 / 0.024 | 0.09 | 0.1 |
| `s1-speed`: σx 0.45 s, pan 50%/s | 88% | 0.30 | 1.34x / 1.54x | 0.08 / 0.027 | 0.12 | 0.1 |
| `s2-faster`: σx 0.35 s, pan 70%/s | 88% | 0.30 | 1.34x / 1.54x | 0.09 / 0.029 | 0.17 | 0.1 |
| `z1-zoom`: s1 + max zoom 1.6 (1.76x) | 88% | 0.31 | 1.37x / 1.60x | 0.08 / 0.027 | 0.12 | 0.1 |
| **`z2-zoom-head`**: z1 + feet anchor half way | **91%** | 0.28 | 1.37x / 1.60x | 0.08 / 0.027 | 0.12 | 0.2 |
| `z3-zoom-slow`: z2 with max 1.7 and widen on fast pans | 91% | 0.28 | 1.35x / 1.61x | 0.08 / 0.026 | 0.13 | 0.2 |

The zoom changes little on average because most clips are wide plays (the zoom is set by the players' spread); the
half feet anchor gives the extra zoom to headroom and gains ball in crop (bt-E5003B6B 78 → 88%, bt-rz-1105-b 86 → 97%).
Videos (today | variant) on the 9 app clips: `lab/tests/broadcast/<clip>.compare.{s2-faster,z2-zoom-head}.mp4`
(deleted 2026-11-05; `broadcast.py render` remakes them). **Verdict (Victor, 2026-11-05): none precise enough to replace
today's framing; today's Modo Foco stays as it is.**

### Test 15: when does a clip get the ball framing? (2026-11-05) — `ball_gate.py`

Victor: today's Modo Foco stays for every clip; the ball framing is offered on top of it only on clips where the ball
is tracked well. We need a reference value the phone can compute after the two passes, without ground truth.

`ball_gate.py` lists per clip the phone-side signals (ball-mode share, trusted share, density of trusted frames in
ball mode, pass 1 / pass 2 agreement, segments, the trusted ball's speed) next to the ground truth where labelled
(`prec`: labelled balls during ball mode that the trusted ball hits; `cover`: labelled balls hit in ball mode). Reports
`lab/tests/gate/report.{5fps,v6}.md`.

Bad clips are of two kinds: (1) the ball is found little (night beach tennis, basket-v-01: ball mode 0–19%), and
(2) the dangerous one, **ball mode most of the time on the wrong thing** (basket-rp-1105-v-b: 90% ball mode, the trusted
ball hits the labelled one only 62% of the time; basket-rp-1105-h, 80% at 10 fps, 50%). Kind (2) shows as a "ball" that
barely moves: median speed 0.03–0.07 long sides per second vs 0.12–0.38 on every good clip (a ball in play moves).

**Proposed rule: ball framing when ball mode ≥ 50% of the clip AND the median speed of the trusted ball in ball mode ≥
0.10 long sides per second; otherwise today's framing** (the chip says the ball could not be followed). On the 15 clips
it says yes to the 8 good ones (the 6 Victor approved on video with v6, plus bt-rz-1105-a: 100% prec, 81% cover, and
basket-rp-1105-v-a: 91% / 79%) and no to the 7 others, with the 5 fps tracks and with v6's 10 fps tracks alike.
Margins: ball mode 29% (worst no) vs 65% (lowest yes); speed 0.07 vs 0.12. Not used: pass 1 / pass 2 agreement (low on
good clips where pass 1 finds the small ball little, e.g. bt-wa-1028 22%, bt-rz-1105-a 12%). The thresholds were chosen
on these 15 clips: validate them on clips not used here before relying on them.

Validation (2026-11-05, 7 YouTube clips not used to choose the rule, ball labelled by Victor; `mac-validate.sh`,
`mac-pass2.sh`, reports `lab/tests/gate/report.{validate,pass2fix,fuse5fix}.md`) found two tracking problems first:

1. **The click could fall outside pass 2's crop at its own frame** (4 of 22 clips: yt1105-volei-b, yt1105-basket-b,
   bt-rz-1105-b, basket-v-01 at the edge; v6 too): the crop path follows pass 1, and where pass 1 does not trust the
   ball at the click the crop sat on the players. Fix in `roi.py` (`seed_inside`, default): the crop at the click's
   frame moves so the click is at least 25% inside it, the frames around follow over a Gaussian of 3 frames. The app's
   ROI (spec 4.4) needs the same rule. (Side effect: pass 2 is sensitive to its crops; yt1105-basket-a got worse with
   the moved crop, 80 → 27% prec.)
2. **Pass 2 can stick to something still while pass 1 follows the ball** (yt1105-volei-a: pass 1 hits 90% of the
   labelled balls, pass 2 stays on a fixed spot from the click). **Fused track** (`low_fps.py fuse`, tag
   `edgetam-fuse5`): per frame pass 2's ball where trusted, else pass 1's where trusted. Same cost. On the 22 clips it
   turns 4 more clips good (yt1105-volei-a 2 → 84% ball mode at 91% prec, yt1105-basket-b 21 → 87% at 73%,
   yt1105-basket-a 58 → 95% at 74%, yt-basket-04 cover 78 → 89%) and keeps the others.

With the validation clips the first rule let one bad clip through: bt-rz-1105-b (pass 2 after the fix: 54–61% ball mode,
speed 0.103, but the labelled ball hit 8% of the time: it follows something else, few frames confirmed). **Rule, round 2
(on the fused track): ball framing when ball mode ≥ 50%, speed ≥ 0.10 long sides/s, slow steps ≤ 15%, and ≥ 50% of
the ball-mode time with a confirmed (trusted) ball** (`dens`). On all 22 clips: no bad clip let through, no good clip
refused ("good" = the labelled ball hit ≥ 70% of the time in ball mode, or approved by Victor on v6's video). Margins
(fused): dens 0.42–0.46 (worst bad) vs 0.60 (lowest good); slow 0.22 vs 0.13; speed 0.06 vs 0.12. Four thresholds
on 22 clips: still to confirm in the field (the values go in `<clip>.ball.json` to tune them).

Lens (Victor, night beach tennis): bt-rz-1105-a (1x) works (75% ball mode, 100% prec), bt-rz-1105-b (1x) does not
(8% prec, after the fix), bt-rz-1105-v (0.5x, ball ~3 px in pass 1) 0%. 1x is not enough by itself; 0.5x at night
with a far ball did not work at all. Basketball at 0.5x works (basket-rp-1105-v-a, big ball).

Videos (today | ball framing on the fused track): `lab/tests/framing/<clip>.compare.fuse5.mp4` for the 7 YouTube clips
and bt-rz-1105-b.

### Test 14: Foco na Bola at 5 fps (2026-11-04) — `low_fps.py`, `mac-lowfps.sh`

Victor, after test 13: none of the players-only variants looks like Foco na Bola v6; the look needs the ball. So: make
the ball tracking cheaper. On the 16 Pro Max a pass costs ~84 ms per frame (test 11, optimised soak): one pass at
10 fps ~27 s per 30 s clip, two passes ~52 s. At 5 fps: **one pass ~13 s, two passes ~26 s** (on top of today's
people analysis, which the ball framing needs as its fallback), if the tracker holds the ball with twice the motion
between frames (test 8 tried more frames, never fewer).

How: the same EdgeTAM tracking on every 2nd frame, on a grid through the click's frame; the track goes back to the
10 fps grid by linear interpolation of the centre and box (`low_fps.upsample`), then hybrid.py round 6 as v6. New
options: `oneclick.py --fps 5` (frames `lab/frames/<clip>@5` from `low_fps.py frames`, hard links), `roi.py --step 2`
(pass 2 crops only on the grid: `@roi40b5`), `single_pass.py track --step 2` (tag `...-5fps`).

Simulation first (no tracker, Linux): keep every 2nd frame of the existing 10 fps tracks and interpolate
(`low_fps.py sub`; `lab/tests/lowfps/report.sim.md`). The framing barely moves: the crop centre is within 0.00 crop
widths of v6 at the median on all 9 clips (p90 ≤ 0.12), ball mode within −5…+6 points, labelled balls in the crop
the same except basket-v-01 (100 → 88%: 3 of its 24 labelled balls). So 5 fps is enough for the **framing**; what the Mac run
answers is whether EdgeTAM still **tracks** at 5 fps.

Run on the Mac: `bash tools/lab/mac-lowfps.sh 2>&1 | tee lab/tests/lowfps/mac.log` (pass 1 at 5 fps → `edgetam-5fps`,
pass 2 → `edgetam-roi40b5`, one pass → `edgetam-torch-fp16-roi40f-5fps`, report `lab/tests/lowfps/report.mac.md`).

Results (2026-11-04, Mac; ball mode = share of the clip framed on the ball, round 6; in crop / off = labelled balls
inside the hybrid crop / distance to its centre):

| Clip | v6: 2 passes, 10 fps | 2 passes, 5 fps | **1 pass, 5 fps** | 1 pass, 10 fps (test 12) |
|---|---|---|---|---|
| bt-wa-1028 | 74% | 85% | 85% | 76% |
| yt-basket-04 | 100%, 100%, 0.17 | 87%, 100%, 0.24 | 96%, 100%, 0.19 | 100%, 100%, 0.17 |
| yt-bt-06 | 84% | 83% | 84% | 87% |
| volei-app-1102 | 65% | 69% | **58%** | 47% |
| basket-v-01 | 11%, 100%, 0.40 | 12%, 100%, 0.17 | 8%, 100%, 0.28 | 1%, 100%, 0.29 |
| bt-E5003B6B | 9%, 94%, 0.34 | 19%, 94%, 0.35 | 30%, **59%**, 0.47 | 12%, 81%, 0.37 |
| bt-0AE39B33 | 14%, 80%, 0.35 | 14%, 77%, 0.37 | 16%, 80%, 0.35 | 16%, 80%, 0.36 |
| basket-app-1031-a | 100% | **83%** | **79%** | 84% |
| basket-app-1031-b | 100% | 99% | 99% | 100% |
| iPhone 16 Pro Max, 30 s clip (84 ms per frame per pass) | ~52 s | ~26 s | **~13 s** | ~27 s |

Crop centre vs v6, median: ≤ 0.01 crop widths on every clip for both 5 fps runs except one pass on volleyball (0.05);
p90 up to 0.18 (two passes) and 0.28 (one pass, bt-E5003B6B).

- 5 fps tracks as well as 10 fps on most clips; sometimes more ball mode (bt-wa-1028 74 → 85%: fewer frames, fewer
  chances for EdgeTAM to drift onto a racket).
- One pass at 5 fps (~13 s on the phone, the budget asked for) is close to v6 on 7 of 9 clips; it is worse where the
  one-pass method already was (test 12): volleyball (ball lost outside the crop, 58% vs 65%; better than one pass at
  10 fps, 47%) and bt-E5003B6B, where its ball mode rises to 30% but the ball is in the crop only 59% of the time
  (it follows something else part of the time), and basket-app-1031-a (79%, box seed).
- Two passes at 5 fps (~26 s) keep v6's quality except yt-basket-04 (87% ball mode) and basket-app-1031-a (83%).

Victor (2026-11-05): one pass at 5 fps does the job, two passes at 5 fps are better; can the frame rate go lower
with two passes? Simulation (`low_fps.py sub --step 3|4`, `report.sim-steps.md`): the framing of v6's own track kept at
3.3 fps loses ball mode on volleyball (65 → 56%) and basket-app-1031-a (100 → 84%); at 2.5 fps on most clips
(bt-wa-1028 59%, yt-bt-06 62%, volleyball 43%). But pass 1 only places pass 2's crops (smoothed, gaps bridged): with
pass 1 at 3.3 fps, ≥ 90% of v6's pass-2 balls stay inside the crop on every clip; at 2.5 fps too, except bt-0AE39B33
(78%) and volleyball (91%). Next, on the Mac (`mac-lowfps2.sh`): pass 1 at 2.5 or 3.3 fps, pass 2 at 5 fps
(~19 / ~21 s per clip on the phone, vs ~26 s for both at 5 fps).

Mac run (2026-11-05, `mac-lowfps2.sh`, `report.mac2.md`): ball mode, and labelled balls in the crop where labelled.

| Clip | v6 (2 × 10 fps) | 2 × 5 fps | **p1 3.3 + p2 5 fps** | p1 2.5 + p2 5 fps | 1 × 5 fps |
|---|---|---|---|---|---|
| bt-wa-1028 | 74% | 85% | 85% | 85% | 85% |
| yt-basket-04 | 100% / 100% | 87% / 100% | 92% / 100% | 92% / 100% | 96% / 100% |
| yt-bt-06 | 84% | 83% | 82% | 82% | 84% |
| volei-app-1102 | 65% | 69% | 62% | 57% | 58% |
| basket-v-01 | 11% / 100% | 12% / 100% | 17% / **83%** | 14% / **83%** | 8% / 100% |
| bt-E5003B6B | 9% / 94% | 19% / 94% | 20% / **81%** | 23% / **66%** | 30% / **59%** |
| bt-0AE39B33 | 14% / 80% | 14% / 77% | 17% / **60%** | 13% / **57%** | 16% / 80% |
| basket-app-1031-a | 100% | 83% | 99% | 99% | 79% |
| basket-app-1031-b | 100% | 99% | 99% | 90% | 99% |
| frames per 30 s clip / iPhone estimate | 600 / ~52 s | 300 / ~26 s | 250 / ~21 s | 225 / ~19 s | 150 / ~13 s |

A sparser pass 1 keeps the easy clips (and fixes basket-app-1031-a and yt-basket-04 vs 2 × 5 fps) but costs on the
three hard night/vertical clips (basket-v-01, bt-E5003B6B, bt-0AE39B33: 3–6 of 24–32 labelled balls), where pass 1
already finds the ball little: with fewer pass-1 frames the crops go to the wrong place more often. 2.5 fps is worse
than 3.3 fps everywhere it differs. Videos for p1 3.3 + p2 5: `<clip>.compare-v6-vs-p3.mp4`.

New clips (2026-11-05, Victor: 3 night beach tennis, 3 basketball, app exports without Modo Foco, ball labelled on the
page; `mac-newclips.sh`, `report.newclips.md`). Today's framing here uses the people file's whole frame + 9 tiles, as
the app since v14 (the whole frame alone found people in 9% of bt-rz-1105-v's frames). Ball mode / labelled balls in
the crop:

| Clip (points) | today | v6 (2 × 10 fps) | 2 × 5 fps | p1 3.3 + p2 5 fps | 1 × 5 fps |
|---|---|---|---|---|---|
| bt-rz-1105-a (73) | — / 95% | 39% / 90% | 75% / 92% | 43% / 88% | 77% / 100% |
| bt-rz-1105-b (73) | — / 86% | 0% / 86% | 9% / 79% | 9% / 79% | 36% / 79% |
| bt-rz-1105-v (54) | — / 100% | 0% / 100% | 0% / 100% | 0% / 100% | 0% / 100% |
| basket-rp-1105-h (25) | — / 100% | 80% / 100% | **29%** / 100% | 54% / 100% | 34% / 100% |
| basket-rp-1105-v-a (109) | — / 100% | 100% / 99% | 100% / 100% | 99% / 99% | 100% / 99% |
| basket-rp-1105-v-b (57) | — / 100% | 89% / 98% | 90% / 100% | 81% / 98% | 79% / 96% |

- Night beach tennis from the side (far, small ball): EdgeTAM barely holds the ball at any frame rate (v6 0–39% ball
  mode; bt-rz-1105-v 0% everywhere); the framing stays on the players, as today. One pass at 5 fps gets more ball mode
  on bt-rz-1105-a (77%, every labelled ball in the crop) but on bt-rz-1105-b its 36% is mostly something else (11% hits).
- Basketball: 2 × 5 fps ties v6 on the two vertical clips; it loses the short low-resolution horizontal clip
  (basket-rp-1105-h, 1024×576, 8 s: 80 → 29%), where p1 3.3 + p2 5 keeps more (54%).
- Videos: `lab/tests/framing/<clip>.compare-v6-vs-{2p5,p3,1p5}.mp4` for the six clips.

iPhone (to run): FocusBench's soak has three new modes, same clips and settings as test 11 (15 min each, unplugged,
brightness 50%, Low Power Mode off): **"Bola: 2 passadas a 5 fps (teste 14)"** (`ball5`), **"Bola: passada 1 a 3,3 fps +
passada 2 a 5 fps (teste 14)"** (`ball35`) and **"Bola: 1 passada a 5 fps (teste 14)"** (`ball1_5`). The tracker runs
on every 2nd (3rd) 100 ms tick on the grid through the click (`Tracker.step`, memory bank 2 or 3 ticks apart as on the
Mac); the video is still decoded in full, but only the grid's ticks are scaled and encoded (`VideoFrames.wanted`). Pass
2 uses v6's crops (the bundled roi40b): its cost does not depend on where the crop is; the quality is the Mac's above.
The comparison with the Mac's track is skipped in these modes. `ios_bench.py results` adds them to the soak table.

Soak results (2026-11-05, iPhone 16 Pro Max, iOS 27.0.1, unplugged, brightness 53%, Low Power Mode off, Neural Engine,
the same 3 clips in a loop, 15 min):

| | v6: 2 × 10 fps (test 11, optimised) | 1 × 10 fps (test 11) | **2 × 5 fps (`ball5`)** | p1 3.3 + p2 5 fps (`ball35`) |
|---|---|---|---|---|
| 30 s clip | 52 s | ~27 s | **26.7 s** (13.3 + 13.3; max 27.6 s) | **22.8 s** (9.5 + 13.3) first 7.5 min, **20.0 s** (8.4 + 11.6) after |
| processing / video | 1.7x | 0.9x | **0.89x** (38 clips, 1011 s of video in 905 s) | **0.71x** (48 clips, 1282 s in 915 s) |
| ms per frame and pass | 84 | 84–89 | 85 (models 74, image 5, mask summary 6) | 91 / 85, then 82 / 76 (decoder 5.8 → 4.4, mask summary 6.2 → 2.4 ms) |
| battery (5% steps) | 75 → 70% (20 clips) | 70 → 60% (38 clips) | **95 → 90% (38 clips)** | **95 → 95% (48 clips)** |
| heat | fair after 5 min, serious after 13 min | fair after 7 min, serious after 11 min | **fair after 7.2 min, never serious in 15 min** | **fair after 9 min, never serious** |

`ball35` got ~10% faster at 7.8 min (every part, CPU ones most: the mask summary 6.2 → 2.4 ms), as if the phone
stopped sharing the CPU with something else (a system task finishing); the first 7.5 min (22.8 s per 30 s clip) are the
comparable number. Its pass 1 costs ~6 ms more per frame (91 vs 85: three ticks decoded per tracked frame instead of
two). The battery numbers come in 5% steps: both runs used under ~5–8% in 15 min.

The video reader failure seen once in a first `ball5` run (clip 7, "video reader failed") did not come back in 38
clips; FocusBench now records the reader's error and retries such a clip up to twice (no retries in this run).

Videos (`lab/tests/framing/<clip>.compare-v6-vs-1p5.mp4` and `...-v6-vs-2p5.mp4`, v6 left in green, the 5 fps run
right in magenta; the app exports with ball zoom 1.25 as in clips.txt): all 9 clips.

### Test 13: a "broadcast" camera from the players alone (2026-11-04) — `broadcast.py`, `focus_variant.py`

Victor (handoff `handoff-players-camera.md`): today's Modo Foco ships (~15 s per 30 s clip on the 16 Pro Max, cold);
Foco na Bola has the TV look but costs 27–52 s per clip and heats up. Goal: more "TV" (faster camera, more movement and
zoom) at today's cost. Every variant below is a change of the path rules only (`FocusPath`, the same Vision boxes), so
its analysis cost is today's, except the optical-flow ones (13c).

New `focus_variant.py` options (all off by default: `--preset acao --check` still matches the app's files exactly on
the six lab clips): `speedPow` (the fastest runner pulls harder), `leadMs` (aim where the players will be),
`vertAsym` + `vDeadband`/`vUpPerSecond`/`vDownPerSecond`/`vSigmaMs` (the ball framing's height rule: dead band, up fast,
down slow), `anchorFeet` + `footMargin`/`anchorShare` (the crop's bottom just under the players' feet), `widenPerSpeed`
(open while the camera pans fast, close when the play is slow), `flowPull`/`flowRef`/`flowSpread` (the fast-motion
region of the optical flow pulls the target). `broadcast.py scores` runs the variants on the labelled clips next to
today (`current`) and Foco na Bola v6 (`hybrid.v6-edgetam-roi40b`); `broadcast.py render VARIANT` makes the
today | variant videos; `broadcast.py flow` computes the flow files with OpenCV Farneback at 320 px (a stand-in for
Vision's flow on Linux; `flow-probe.swift` writes the same file with Vision on the Mac).

Scores (mean over basket-v-01, bt-0AE39B33, bt-E5003B6B, yt-basket-04: 24 + 30 + 32 + 101 labelled ball points, so
one point is 1–4% on a clip; full tables `lab/tests/broadcast/summary-*.md`). Ball in crop / off centre on the labelled
balls; pan in frame widths per second; jerk in long sides / s²; moving cut = frames with a moving player > 25% outside.

| Variant | Ball in crop | Off centre | Zoom mean / max | Pan p95 / mean | Jerk p95 | Vertical flips / 10 s | Moving cut / anyone cut |
|---|---|---|---|---|---|---|---|
| today (`current`, v15 acao) | 85% | 0.36 | 1.51x / 1.65x | 0.10 / 0.029 | 0.13 | 0.3 | 0% / 2% |
| 13a `a1-fast`: σx 0.35 s, pan 70%/s | 85% | 0.36 | 1.51x / 1.65x | 0.14 / 0.034 | 0.21 | 0.3 | 0% / 2% |
| 13a `a2-fast-zoom`: + zoom to 2.0x | **76%** | 0.41 | 1.70x / 2.00x | 0.14 / 0.037 | 0.23 | 0.3 | 0% / 2% |
| 13b `b2-lead-runner`: + lead 0.5 s, speed² | 78% | 0.43 | 1.73x / 2.00x | 0.17 / 0.045 | 0.23 | 0.2 | 0% / 3% |
| `d1-feet`: + feet anchor | 86% | 0.36 | 1.73x / 2.00x | 0.17 / 0.045 | 0.30 | 1.2 | 2% / 4% |
| **`tv18`** (below), up to 1.8x | **91%** | 0.32 | 1.55x / 1.79x | 0.15 / 0.038 | 0.26 | 0.4 | 1% / 2% |
| `tv18m`: `tv18` with the feet anchor half way | 89% | 0.33 | 1.55x / 1.79x | 0.15 / 0.038 | 0.24 | 0.0 | 0% / 1% |
| `tv20`: `tv18` up to 2.0x | 88% | 0.34 | 1.64x / 1.96x | 0.16 / 0.040 | 0.25 | 0.8 | 1% / 3% |
| `tv18-nolead`: no lead, no speed² | 91% | 0.32 | 1.54x / 1.79x | 0.13 / 0.033 | 0.22 | 0.5 | 0% / 2% |
| 13c `tv18-flow`: + flow pull 0.7 (Farneback) | 91% | 0.31 | 1.51x / 1.78x | 0.16 / 0.041 | 0.36 | 0.3 | 1% / 2% |
| Foco na Bola v6 (EdgeTAM roi40b) | 93% | 0.32 | 1.70x / 2.00x | 0.20 / 0.049 | 0.45 | 0.8 | 2% / 26% |

`tv18` = `--preset acao --set sigmaXMs=350 --set maxPanPerSecond=0.7 --set maxZoom=1.65 --set sigmaSizeMs=1200
--set anchorFeet=1 --set footMargin=0.06 --set vertAsym=1 --set vDeadband=0.05 --set vUpPerSecond=1 --set
vDownPerSecond=0.2 --set vSigmaMs=800 --set widenPerSpeed=0.6 --set leadMs=500 --set speedPow=2` (maxZoom 1.65 × zoomIn
1.1 = 1.8x on screen; 1.82 = 2.0x).

What the rounds showed:
1. **Faster pan alone** (13a, `a1`) adds movement and keeps the ball, but is a small change (pan p95 +40%).
2. **More zoom from the players alone loses the ball**, and almost always **above** the crop (lobs in beach tennis,
   shots in basketball): 2.0x took ball in crop 85 → 76%. The players' centre is the wrong anchor once the crop is
   small. **Anchoring the crop's bottom just under the players' feet** (`anchorFeet`) gives the zoom to the headroom
   and is the round's main gain: 76 → 86% at 2.0x, 91% at 1.8x (today 85%; bt-0AE39B33 63 → 77%, bt-E5003B6B 78 → 94%).
   It made the camera bob (a zoom change moves the centre when the bottom is fixed: 2.7 flips/10 s on bt-E5003B6B) until
   the size smoothing went back to today's 1.2 s and the height got a 5% dead band and σ 0.8 s (0.4 flips/10 s).
3. **Zoom with the play's speed** (`widenPerSpeed` 0.6): open during a fast transition, close on a slow play, like a
   TV camera operator; it costs no ball and keeps people in (anyone cut 3 → 2%).
4. **The lead on the play** (13b: 0.3/0.5/0.7 s, and speed² so the fastest runner pulls) gives more movement (pan mean
   +15%) but no measurable change in the ball: the path already looks ahead (centred Gaussian), so the lead mostly
   moves the camera earlier. Kept in `tv18` for the look; `tv18-nolead` is the calmer alternative. Video decides.
5. **Optical flow** (13c, OpenCV Farneback at 320 px as the stand-in): no measurable gain on top of `tv18` (91% → 91%,
   jerk 0.26 → 0.36). Not worth an extra Vision request per frame for now. The Vision version is ready to measure
   (`flow-probe.swift` on the Mac → `lab/tests/broadcast/<clip>.flow.json`, then `broadcast.py scores`; `flowRef` was
   set on Farneback's scale and must be checked on Vision's), and its cost on the iPhone with FocusBench's soak mode
   **"Pessoas + fluxo óptico (teste 13)"** (`peopleflow`: today's analysis + `VNGenerateOpticalFlowRequest`, low
   accuracy, 320 px, between consecutive 100 ms ticks; `ios_bench.py results` shows the flow ms per tick). Not run yet.
6. Where `tv18` is worse than today: basket-v-01 loses 2 of its 24 labelled balls (100 → 92%, the zoom 1.65x → 1.77x
   on a static half-court scene), jerk p95 doubles (0.13 → 0.26, still below Foco na Bola's 0.45: it is the movement
   asked for), and a moving player is cut in 1% of the frames (today 0%).
7. App exports (volei-app-1102, basket-app-1031-a/b) are left out: they are already cropped by today's Modo Foco and
   have no people files.

Cost: `tv18` and `tv18m` change only `FocusPath` (pure Swift over ~300 samples), not the analysis, so the clip costs
what it does today (~15 s per 30 s clip, cold, test 11's soak). The new rules are a few passes over the samples.

Videos for Victor (`lab/tests/broadcast/<clip>.compare.<variant>.mp4`, left: the whole picture with today in orange
and the variant in blue and the labelled ball ring; then today | variant): `tv18`, `tv18m` and `tv20` on basket-v-01,
bt-0AE39B33, bt-E5003B6B, yt-basket-04, yt-bt-06 and bt-wa-1028 (the last two have only the first click, so video
only). Proposed amendment (pending the videos): `2026-10-23-focus-mode-design.md`, "Amendment proposal 2026-11-04".

### Test 12: one pass instead of two (2026-11-04) — `single_pass.py`, `roi.py --guide p`

Question (spec 10 item 5): can a single EdgeTAM pass keep the quality of the two-pass pipeline (pass 1 on the whole
frame, pass 2 on 40% crops around pass 1's trusted ball, `edgetam-roi40b`)? Same 10 fps frames, same seeds, same
round-6 judge (`coreml_export.judge`: share of the clip in ball mode, hits on the labelled clips) and hybrid.py.

Variants:
- **(a) players only** (`roi40p`): 40% crops on today's framing (players), EdgeTAM's predictor (`oneclick.py`).
- **(b) follow the ball** (`single_pass.py track`, coreml_export's fixed-bank loop on the PyTorch wrappers): each
  frame's crop is centred on the last plausible ball (round 6's per-frame shape filters + jump limit), held 0.3 s
  after a loss, then back to the players' path; forwards from the click, then backwards; crops cut from the
  full-resolution video (decoded once into `lab/cache/`, deleted after each clip) through JPEG q92 as roi.py.
  `roi40f` the crop jumps onto the ball (`--vel 1` adds the ball's velocity; `roi40f0` without it: same results except
  bt-E5003B6B), `roi40f0s30` the crop moves 30% of the way per frame (`--follow 0.3`), `roi40f0w` the tracker sees
  the whole frame while the ball is lost (`--lost full`, as pass 1).

Ball mode (round 6) / hits on the labels; Mac, CPU, ~295 ms per frame for the four parts:

| Clip | Two passes (roi40b) | (a) players only | (b) jump onto the ball | (b) smooth 30% | (b) whole frame when lost |
|---|---|---|---|---|---|
| bt-wa-1028 | 74% | 0% | **76%** | **76%** | 20% |
| yt-basket-04 | 100% / 98% | 74% / 69% | 100% / 98% | 100% / 97% | 88% / 92% |
| yt-bt-06 | 84% | 89% | 87% | **90%** | 87% |
| volei-app-1102 | 65% | 30% | 47% | 47% | **66%** |
| basket-v-01 | 11% / 33% | 22% / 17% | 1% / 8% | **23% / 50%** | 1% / 8% |
| bt-E5003B6B | 9% / 25% (94% ball in hybrid crop) | 9% / 16% (78%) | 12% / 22% (81%) | 1% / 6% (78%) | 0% / 6% (78%) |
| bt-0AE39B33 | 14% / 70% | 22% / 0% | 16% / 70% | 16% / 70% | 14% / 73% |
| basket-app-1031-a (box seed) | 100% | 69% | 84% | 84% | 100% |
| basket-app-1031-b | 100% | 29% | 100% | 87% | 100% |

Why none is enough:
- (a) has no idea where the ball is: lobs, serves and passes leave the players' crop (bt-wa-1028 0%, basket-app-1031-b
  29%, bt-0AE39B33 0% hits). Confirms test 8.
- (b) ties or beats the two passes where the ball stays in view (bt-wa-1028, yt-basket-04, yt-bt-06, bt-0AE39B33,
  basket-app-1031-b), but once the ball is lost the crop goes back to the players and nothing can find the ball
  elsewhere: volei-app-1102 5–12 s, the ball is outside the crop (pass 1 finds it on the whole frame).
- Showing the whole frame while lost fixes that clip (66%) and basket-app-1031-a, but the switch of scale between
  the 40% crop and the whole frame (2.5x) confuses the memory: bt-wa-1028 74% → 20%, yt-basket-04 100% → 88%.
- A crop that jumps 30–40 px per frame after the ball loses basket-v-01 at 24.9 s (ball in hand: EdgeTAM says "no
  object" and never comes back, while the two-pass crop moves ≤ 3 px per frame and keeps it); moving the crop smoothly
  fixes that clip (23% / 50% hits, better than the two passes) but breaks bt-E5003B6B (1%) and basket-app-1031-b (87%).
- Each fix moves other clips both ways: on hard clips the track is sensitive to small changes of the picture (as the
  FP16 runs in test 10). The two passes are robust because pass 1 sees the whole clip before the crops are chosen,
  and the crop path is smoothed with the future known (σ 0.3 s).

Decision: keep the two passes (spec 4.4). Options to save time stay as in spec section 5 (pass 1 at 5 fps; pass 1
only near the seed); "pass 2 only, players' path" is measured here and does not work.

Run (`docs/focus-refs`, Mac, `lab/.venv-edgetam`):

```bash
PY=lab/.venv-edgetam/bin/python
CLIPS=(bt-wa-1028 yt-basket-04 yt-bt-06 volei-app-1102 basket-v-01 bt-E5003B6B bt-0AE39B33 basket-app-1031-a basket-app-1031-b)
$PY tools/lab/roi.py $CLIPS --size 0.4 --guide p && $PY tools/lab/oneclick.py --model edgetam --variant roi40p $CLIPS
$PY tools/lab/single_pass.py track $CLIPS --vel 1                 # roi40f   (--vel 0: roi40f0)
$PY tools/lab/single_pass.py track $CLIPS --vel 0 --follow 0.3    # roi40f0s30
$PY tools/lab/single_pass.py track $CLIPS --vel 0 --lost full     # roi40f0w
$PY tools/lab/single_pass.py report --tags edgetam-roi40b,edgetam-roi40p,edgetam-torch-fp16-roi40f --name test12
# videos for review: two passes (left, green) vs one pass (right, magenta), both framed by hybrid.py round 6
python3 tools/lab/compare_runs.py bt-wa-1028 yt-bt-06 yt-basket-04 volei-app-1102 basket-app-1031-a
python3 tools/lab/compare_runs.py basket-v-01 --b edgetam-torch-fp16-roi40f0s30 --label-b "1 passada suave" --tag 1v2-suave
```

Videos: `lab/tests/framing/<clip>.compare-1v2.mp4` (and `basket-v-01.compare-1v2-suave.mp4`).

Tracks: `lab/tests/oneclick/<clip>.ball.edgetam-torch-fp16-roi40f*.json` (with the crops per frame); reports
`lab/tests/single/report.test12*.md`. Box seeds go to the decoder as SAM's box prompt (labels 2, 3).

### Test 11: FocusBench on the iPhones (2026-11-04) — `ios-bench/`, `ios_bench.py`

FocusBench is a separate test app (its own Xcode project and bundle id, nothing shared with Lance's code). It runs
the four Core ML models of test 10 with the same loop as `coreml_export.py`'s `track` (bank in fp16, empty slots
switched off), Swift only, on the ROI crops of yt-basket-04, bt-wa-1028 and yt-bt-06, and writes one JSON per clip and
compute unit: ms per model (median after 3 warm-up calls), image prep, Swift loop, first model load, thermal state,
and the track (per frame the same mask summary as `server.py`, on the mask upsampled to the crop as on the Mac).

1. Mac: `lab/.venv-edgetam/bin/python tools/lab/ios_bench.py prepare` (models + frames into
   `ios-bench/FocusBench/Data/`, about 120 MB, not in git).
2. Open `tools/lab/ios-bench/FocusBench.xcodeproj` (Xcode 16 or later). Target FocusBench > Signing & Capabilities:
   pick your Team (a personal team works; change the bundle id if Xcode says it is taken). Plug the iPhone in, pick it
   as the run destination, Run. First time on a phone: Developer Mode on, and trust the developer in Settings >
   General > VPN & Device Management.
3. On the phone: pick clips and compute units, Run (keep the app open; the screen stays on). The first Neural Engine
   load compiles the models (seconds to a minute), later loads are cached.
4. Share results (AirDrop to the Mac), or Files > On My iPhone > FocusBench. Put the .json files in
   `lab/tests/ios/` and run `lab/.venv-edgetam/bin/python tools/lab/ios_bench.py results`: a table per phone, compute
   unit and clip (ms per model, ball mode, hits, agreement with the Mac's Core ML track), and each track saved as a
   oneclick track `edgetam-ios-<device>-<units>-roi40b` for `hybrid.py --render`.

The mask summary in Swift was checked against `server.py`'s on random masks (same pixels after upsampling).

Results (2026-11-04, both phones on the cable, run from Xcode; `attention_pairs_soft`, which is now the default):

| | iPhone 16 Pro Max (iPhone17,2, iOS 27.0.1) | iPhone XR (iPhone11,8, iOS 18.7.11) |
|---|---|---|
| compute units | all four on the Neural Engine | encoder Neural Engine, attention / decoder / memory GPU |
| encoder / attention / decoder / memory, ms | 18 / 38 / 4 / 6 | 60 / 335 / 84 / 95 (whole clip; 59 / 243 / 68 / 65 in the first 50 frames) |
| image prep + Swift loop, ms | 28 + ~27 | 16 + ~60 |
| per frame (10 fps track), median | **122 ms** | **552 ms** first 50 frames, **691 ms** whole clip |
| 30 s clip (300 frames) | 37 s | 216 s |
| thermal | nominal → fair | fair → serious (slows the GPU) |
| track vs the Mac's Core ML track (centroid median, frames where only one sees a ball) | yt-basket-04 0.1 px, 1; yt-bt-06 0.1 px, 1; bt-wa-1028 0.2 px, 19 | yt-basket-04 0.1 px, 2 |
| ball mode (round 6), bt-wa-1028 | 79% (Mac Neural Engine 79%, EdgeTAM 74%) | — |

What the XR (A12) needed, from the probe (each model alone): its Neural Engine cannot run the attention (1.6–2.6 s,
mostly on the CPU; a 4-block version ran its compiler out of memory) and runs the memory model badly (0.4–0.5 s); its
GPU aborted the app on Core ML's fused attention kernel (`sdpa_fwdNew`, fixed by spelling out the softmax), refused
the RoPE-on-halves rewrite in fp16 (error -5) and a 0/1 matrix product (blob type mismatch). The 16 Pro Max runs
everything on the Neural Engine; its GPU fails the decoder (not used).

Soak test (2026-11-04, `Soak.swift`): the ticked clips back to back for N minutes, as the app would after a game, on
battery; one row per clip with time, battery (1% steps) and heat, saved after every clip as
`soak.<people|ball>.<device>.<time>.json`. `people` = today's Modo Foco analysis (FocusAnalyzer's reading, Vision on the
whole frame + 9 tiles, 10 fps); `ball` = Foco na Bola, pass 1 on the whole frame and pass 2 on the roi40b crops, both read
from the clip's video with AVAssetReader (pass 2 compared with the Mac's track). `ios_bench.py prepare` now also writes
each clip's window as `<clip>.mp4`; `ios_bench.py results` adds a soak table. Same phone, unplugged, Low Power Mode off,
the same brightness for both runs.

Soak results (2026-11-04, iPhone 16 Pro Max, 30 min each, unplugged, brightness 50%, Low Power Mode off, the same
3 clips in a loop; `ball` with all four models on the Neural Engine, `attention_pairs_soft`):

| | Foco na Bola (2 passes) | Modo Foco today (people) |
|---|---|---|
| clips processed in 30 min | 22 (591 s of video) | 136 (3634 s of video) |
| processing time / video time | **3.1x** (30 s clip: 91 s; 45 s per pass, ~150 ms per frame per pass) | **0.5x** (30 s clip: 15 s) |
| battery (iOS reports 5% steps) | 65 → 55% | 65 → 60% (the screen, on in both, is part of it) |
| per 30 s clip | ~0.45% | ~0.04% |
| heat | nominal throughout; the last clips 5–7% slower | nominal throughout |
| pass 2 vs the Mac's track (centroid median / frames where only one sees a ball) | yt-basket-04 1.2 px / 12; yt-bt-06 11.8 px / 35; bt-wa-1028 124 px / 60 | — |

Two open points: (1) a pass costs ~150 ms per frame here vs the 66 ms of the models: video decoding (every frame of
the source is decoded), Core Image scaling and the bench's array copies; (2) reading the video (frame choice at each
100 ms tick, H.264 re-encode, Core Image scaling) instead of the Mac's JPEG crops changes pass 2 on the hard clips
(bt-wa-1028 tracks something else much of the time): the phone's own track must be judged (ball mode), not only
compared with the Mac's.

Optimised soak (2026-11-04, same phone and settings, 15 min): the video read in the decoder's own format (Core Image
converts only the 100 ms ticks) and the model outputs passed on with no array copies (bank kept as the memory model's
float32 outputs, attention inputs preallocated and filled with memcpy). **30 s clip: 91 → 52 s (1.7x the clip
length)**; per frame and pass 84 ms = models 74 (encoder 20, attention 39, decoder 6, memory 9) + image 4 + mask
summary 6 + loop 0.1. 20 clips in 15 min, battery 75 → 70%. Heat: nominal → fair after 5 min → **serious after 13 min**
of non-stop work (the slower run stayed nominal for 30 min). Pass 2 vs the Mac unchanged (same numbers as above), so the
float32 bank changes nothing and the difference on bt-wa-1028 comes from the frames read from the video.

One-pass soak (2026-11-04, same phone and settings, 15 min; `ball1` = test 12's roi40f in Swift, the crop following
the ball): **30 s clip ~27 s** (0.9x the clip length; 84–89 ms per frame), 38 clips in 15 min, battery 70 → 60%;
heat fair after 7 min, **serious after 11 min** of non-stop work (the Neural Engine is busy all the time in both
versions, so the heat per minute is the same and the heat per clip halves). Track vs the Mac's one-pass track:
yt-basket-04 1.7 px / 9 frames, yt-bt-06 15 px / 43, bt-wa-1028 330 px / 50 (it follows something else: with one pass
a small difference moves the crop and the track drifts further). Victor (2026-11-04): neither ball version is ready for
production; today's Modo Foco ships; next, a faster "broadcast" camera from the players alone at today's cost
(`handoff-players-camera.md`), and later a light ball detector (YOLOX, Apache-2.0) as a reinforcement. Heat can be
traded for time (pausing between frames keeps the Neural Engine idle part of the time, as the first 91 s version did).

To test next (Victor, 2026-11-04): one pass instead of two, with crops guided by the players only or by the previous
frame's ball (spec section 10, item 5).

Not tuned yet: the Swift glue (copies between models, ~27 ms on the 16 Pro Max, ~60–90 ms on the XR) and the image
prep (JPEG decode + scale; in the app the frames come from the camera or the video decoder).

### Test 10: EdgeTAM on Core ML, step 1 (2026-11-03) — `loop.py`, `coreml_export.py`, `coreml-mac.sh`

On the phone the tracker is four Core ML models and a loop in Swift that keeps the memory bank. Core ML wants fixed
shapes, so the bank always has 7 memory frames and 16 object pointers; slots with nothing yet (just after the click,
at the clip's edges) are switched off in the attention. Quality is judged as in the framing tests: share of the clip
in ball mode (round 6) and, on the labelled clips, hits on the ball. Each run is also saved as a oneclick track
(`edgetam-<run>-roi40b`), so `hybrid.py --model ... --render` makes its framing video.

| Step | Where | Result |
|---|---|---|
| `loop.py`: EdgeTAM driven frame by frame (`parts`) and with the full fixed bank (`fixed`), vs the predictor | container, CPU, bt-wa-1028@roi40b, 50 frames | parts: IoU 1.0, 0 px; fixed: IoU mean 0.95, centroid median 0.07 px, max 0.71 px, 1 frame where only one of them sees the ball |
| `coreml_export.py export`: wrappers (RoPE with real numbers, constants baked in) vs EdgeTAM's own code | container | max abs difference 0 on every part |
| conversion to Core ML (FP16, iOS 16 target) | container | encoder 10.0 MB, attention 12.5 MB, decoder 13.1 MB, memory 4.5 MB |
| the Swift-like loop (`track`) on the PyTorch wrappers, whole clip (201 frames) | container | empty slots filled (`--fill`, as loop.py): ball mode **60%** vs EdgeTAM's 74%, mask = EdgeTAM's 66%. Empty slots switched off (attention inputs `mem_on`, `ptr_on`): ball mode **74%**, mask = EdgeTAM's **100%**, also with the bank kept in fp16 |
| the same loop on the Core ML models (FP16), quality and ms per model | Mac (2026-11-04), 4 clips | **done: same quality as EdgeTAM on every compute unit** (below) |

Mac results, ball mode share (round 6) and, on labelled clips, hits on the ball (`lab/tests/coreml/<clip>@roi40b/`):

| Clip | EdgeTAM (PyTorch) | Core ML CPU | GPU | Neural Engine | all |
|---|---|---|---|---|---|
| yt-basket-04 (labels) | 100%, 98% on the ball | 100%, 98% | 100%, 98% | 100%, 98% | 100%, 98% |
| bt-E5003B6B (labels) | 9%, 25% | 7%, 22% | 25%, 25% | 20%, 25% | 7%, 22% |
| bt-wa-1028 | 74% | 74% | 74% | 79% | 74% |
| yt-bt-06 | 84% | 86% | 84% | 82% | 90% |

Masks match EdgeTAM's 91–99% where the tracker is sure (yt-basket-04, yt-bt-06); on hard clips small FP16 differences
send the track elsewhere for a while, in both directions (bt-wa-1028: Neural Engine 79% vs 74%), without a pattern of
loss. bt-E5003B6B (far ball, ROI guided by a weak first pass) is poor for EdgeTAM itself.

Time per frame on the Mac (all four models; steady state, after the first calls): CPU 97 ms, GPU 35 ms, Neural Engine
45 ms (encoder 11.6, attention 25.5, decoder 3.4, memory 5.0), all 56 ms. Neural Engine load (compile) 5 s once. The
"ANECCompile() FAILED" line printed while converting comes from coremltools' own test load and did not stop any
model from running on the Neural Engine. The first run crashed (segfault) with the earlier attention model; with
the current models nothing crashed.

The framing video from a Core ML track: `lab/.venv/bin/python tools/lab/hybrid.py --model
edgetam-coreml-ne-fp16-roi40b --tag v6-coreml --render bt-wa-1028 yt-bt-06`.

The clicked frame skips the attention model (its features + `no_mem_embed`, in `lab/coreml/edgetam_constants.json`);
its memory is made from the binarised mask (`hard` = 1), as the video predictor does. Box seeds are not exported yet
(the decoder takes 2 prompt points: the click and a pad).

### Test 9: cleaner masks and round 6 (2026-11-03) — `hybrid.py` default

Two problems found on the ROI runs: (1) EdgeTAM's masks on the full-resolution crops carried stray specks far from the
ball (a 13x15 px ball inside a 300x390 px box), so the shape filters dropped correct balls: `summarize` now keeps the
largest connected piece and records its share (`main`, 8th field). (2) On basket-v-01 the ROI track slid onto other
objects after a short gap and was trusted. Round 6, every sport: a mask whose largest piece is < 70% of it is not the
ball; the jump allowed after a gap stops growing at 8 frames (4 cut real volleyball serves); a gap is bridged only if
the ball comes back near where it was lost. SAM 2 tiny results are identical to round 5.

Ball in crop (labelled clips) / ball mode, round 6, EdgeTAM re-run with the cleaner masks:

| Clip | SAM 2 tiny | EdgeTAM full frame | EdgeTAM ROI 40% (ball-guided) |
|---|---|---|---|
| bt-wa-1028 | — / 61% | — / 20% | — / **74%** |
| yt-basket-04 | 100% / 100% | 100% / 90% | **100% / 100%** |
| yt-bt-06 | — / 97% | — / 90% | — / 84% |
| bt-E5003B6B | 100% / 15% | 94% / 15% | 94% / 9% |
| basket-v-01 | 100% / 15% | 92% / 11% | **100%** / 11% |
| bt-0AE39B33 | 80% / 17% | 80% / 21% | 80% / 14% |
| volei-app-1102 | — / 82% | — / 71% | — / 65% |
| basket-app-1031-a / -b | — / 100% / 99% | — / 100% / 100% | — / 100% / 100% |

One-click recall (raw masks): yt-basket-04 97% (tiny) / 81% (EdgeTAM) / 98% (ROI 40%); bt-0AE39B33 67 / 53 / 70%.
Cost: two EdgeTAM passes ≈ 70 s per 30 s of video on the Mac, vs ≈ 170 s for one SAM 2 tiny pass.

### Test 8: EdgeTAM at 20/30 fps, and on a closer picture (ROI) (2026-11-03)

More frames: no gain. At 30 fps (aligned exactly to the 10 fps frames: their match is frame 3k+1, measured by image
difference and stored as `alignTo10`) EdgeTAM scores as at 10 fps (bt-E5003B6B 22%, basket-v-01 21%) for 3x the
time; 20 fps cannot align exactly (17 ms off, and bt-wa-1028 is a 30 fps source) and is not trusted.

Closer picture (`roi.py` + `oneclick.py --variant`): EdgeTAM on a square crop cut from the full-resolution video,
following the ball of a first full-frame EdgeTAM pass (bridged gaps) or, without it, today's framing; masks mapped
back to the whole frame; same round-5 hybrid. Same cost per pass (~34 s per 30 s on the Mac), two passes in total.

| Clip | Full frame | ROI 50% ball-guided | ROI 40% ball-guided | ROI 40% players only | SAM 2 tiny |
|---|---|---|---|---|---|
| bt-wa-1028: ball mode | 20% | 56% | **74%** | 0% | 61% |
| bt-E5003B6B: one-click recall | 22% | **41%** | 25% | 16% | 69% |
| bt-E5003B6B: hybrid ball in crop | 94% | 84% | 78% | 78% | 100% |
| basket-v-01: one-click recall | 21% | 21% | **33%** | 17% | 67% |
| basket-v-01: hybrid ball in crop | 92% | 92% | 100% | 100% | 100% |

The ball-guided ROI is what makes the difference (players-only fails on lobs). On bt-wa-1028 the 40% ROI follows the
ball longer than SAM 2 tiny on the whole frame, with no racket confusion (5–14 s); on bt-E5003B6B it finds the ball
more but also claims it more where it is not (false alarms 12–54%), and the ball in crop drops.

### Test 7: EdgeTAM vs SAM 2.1 tiny (2026-11-03, same seeds, same round-5 hybrid; Mac, MPS)

EdgeTAM (facebookresearch/EdgeTAM @7711e01, Apache-2.0; `setup-edgetam.sh`, `oneclick.py --model edgetam`).

| Clip | One click recall: tiny → EdgeTAM | precision | Hybrid ball in crop | Ball mode | Mac time per clip |
|---|---|---|---|---|---|
| bt-0AE39B33 | 67% → 53% | 80% → 100% | 80% → 80% | 17% → 19% | 209 → 35 s |
| bt-E5003B6B | 69% → 22% | 71% → 70% | 100% → 94% | 15% → 6% | 176 → 34 s |
| basket-v-01 | 67% → 21% | 70% → 23% | 100% → 92% | 15% → 11% | 171 → 34 s |
| yt-basket-04 | 97% → 81% | 99% → 91% | 100% → 100% | 100% → 89% | 167 → 34 s |
| yt-bt-06 | — | — | — | 97% → 90% | 170 → 35 s |
| bt-wa-1028 | — | — | — | 61% → 20% | 124 → 23 s |
| volei-app-1102 | — | — | — | 82% → 71% | 118 → 23 s |
| basket-app-1031-a / -b | — | — | — | 100% / 99% → same | 38 / 74 → 8 / 15 s |

EdgeTAM is ~5x faster on the Mac (~9 frames/s at 10 fps sampling: 30 s of video in ~35 s) and holds the easy clips
(big, clear ball: the YouTube references, the app basketball exports), but loses the ball far more on the hard ones
(small far ball, beach tennis at night, the vertical basketball clip). The hybrid falls back to the players there, so
the crop stays safe; the cost is less time framed on the ball. The official Core ML export covers only the image path
(image encoder, prompt encoder, mask decoder); the video memory modules are not exported.

### Test 6 on three app exports (volleyball, 2 basketball; 2026-11-03)

These arrived with today's Modo Foco already applied (the originals were not at hand), so "today" = the video itself
(identity framing) and the hybrid adds `--set ball_zoom=1.25` (~2x overall, like round 5). The round-5 filters now
also cover volleyball (ball only held between rallies; heads look like balls). New for every sport, from the
basketball clips (SAM 2's mask spilled onto a player at 6.6 s, 7.0 s, 9.6 s): a mask whose box is over 6% of the
frame's long side, or that fills under 45% of its box, is not the ball. The approved clips do not change
(yt-basket-04: ball in crop 100%, ball mode 100%).

| Clip | SAM 2 masks / frames | Trusted | Ball mode |
|---|---|---|---|
| volei-app-1102 | 119 / 207 | 109 | 82% (lost from 15 s) |
| basket-app-1031-a | 60 / 70 | 55 | 100% |
| basket-app-1031-b | 128 / 134 | 103 | 99% |

### Test 1 result (2026-11-03, SAM 2.1 tiny on the Mac GPU, 4 clips, 187 ball points)

Seed = the first click Victor made when labelling (a point on the ball). "With fixes" simulates a user who clicks the
true position at the first missed sample and lets SAM 2 go on (forward from the seed only).

| Clip | Points | One click: recall | precision | false alarm | follows until 1st miss | With fixes: clicks | per 10 points |
|---|---|---|---|---|---|---|---|
| bt-0AE39B33 | 30 | 67% | 80% | 62% | 1.8 s | 11 | 3.7 |
| bt-E5003B6B | 32 | 69% | 71% | 41% | 9.4 s | 11 | 3.4 |
| basket-v-01 | 24 | 67% | 70% | 11% | 1.8 s | 9 | 3.8 |
| yt-basket-04 | 101 | 97% | 99% | 43% | 3.8 s | 4 | 0.4 |

- Far above tests 3 and 4 (0–37% recall): SAM 2 loses the ball and finds it again by itself (its memory), so recall
  stays at 67–97% even when the first miss comes early.
- False alarms are high when the ball is out of play (41–62% beach tennis, 43% YouTube basketball): SAM 2 keeps a
  mask on something (another ball, a player). A framing built on it needs a guard (mask size jumps, players' area).
- Cost: ~170–210 s per 30 s clip on the Mac (tiny, MPS), i.e. ~6x slower than real time on the Mac. SAM 2 itself is
  not an on-device option; EdgeTAM (Apache-2.0, SAM 2 distilled for phones, 16 fps on an iPhone 15 Pro Max) is the
  candidate to repeat this test with.
- The seed is a human click here. In the app it could be a tap in the editor, or a detector that only has to find the
  ball once with high confidence (low recall is fine for a seed).

### Test 3 result (2026-11-03, 4 clips, 187 ball points)

Vision on the Mac, every frame (60 fps app clips, 30 fps YouTube), radius 0.002–0.06, trajectory length 5; ~8 s per
30 s clip. Candidates = the newest point of every trajectory Vision reports at the tick's frame. VNVideoProcessor
already gives points in the upright picture: the "raw" mapping (Vision's point, y flipped) is the right one; applying
the track transform again rotates them twice (the "upright" column of the script equals raw on unrotated video).

| Clip | Points | Trajectories/frame | Ceiling | Longest trajectory: recall | precision | false alarm | Track: recall |
|---|---|---|---|---|---|---|---|
| bt-0AE39B33 | 30 | 16.9 | 30% | 13% | 15% | 55% | 17% |
| bt-E5003B6B | 32 | 22.4 | 28% | 19% | 21% | 45% | 3% |
| basket-v-01 | 24 | 2.3 | 25% | 0% | 0% | 10% | 0% |
| yt-basket-04 | 101 | 44.4 | 41% | 11% | 11% | 98% | 2% |

Vision has the ball in under half of the samples, among 2–44 other "trajectories" (arms, rackets, legs); neither the
longest one nor the chain search picks it. Not a ball source on its own.

### Test 4 result (2026-11-03, 4 clips, 187 ball points)

MOG2 background subtraction at 30 fps, 960 px; candidates = small compact moving blobs seen in 3 consecutive frames on
a near-straight line and alone (kicked sand comes as a crowd); offline chain search. Without the 3-frame and crowd
filters: 6–63 candidates per frame (sand, net, compression noise), the chosen track 3–4% right.

| Clip | Points | Ceiling (any candidate on the ball) | Cands/frame | Track recall | Precision | False alarm |
|---|---|---|---|---|---|---|
| bt-0AE39B33 | 30 | 53% | 4.9 | 37% | 44% | 85% |
| bt-E5003B6B | 32 | 41% | 4.0 | 0% | 0% | 60% |
| basket-v-01 | 24 | 17% | 0.9 | 17% | 18% | 17% |
| yt-basket-04 | 101 | 39% | 3.5 | 24% | 28% | 86% |

The ball is among the candidates at most half the time (in hands, against bright walls, too small at the far end) and
what moves like a ball (feet, hands, rackets) wins the track. Not worth tuning further; kept as a baseline.

Earlier rounds (git history, commit `45e5317`, `docs/superpowers/spikes/focus-v2/`): COCO detectors, WASB and
TrackNetV3 were already measured; ball framing lost to players framing on basketball, won on tennis and volleyball, and
nothing found the beach tennis ball. Their labels (`*.ball.json`) were lost: they never went to git. This round keeps
the labels in `docs/focus-refs/labels/`, which is allow-listed in `docs/focus-refs/.gitignore`.

## Files

| Path (under `docs/focus-refs/`) | What | In git |
|---|---|---|
| `tools/lab/clips.txt` | the 18 clips, window and sport, in labelling order | yes |
| `tools/lab/extract.sh` | frames every 100 ms, long side 1280 px → `lab/frames/<clip>/` | yes |
| `tools/lab/setup-mac.sh` | one-time env on the Mac: PyTorch (MPS) + SAM 2.1 from Meta's repo + checkpoints | yes |
| `tools/lab/server.py`, `index.html` | labelling page with SAM 2 assist, http://127.0.0.1:8765 | yes |
| `labels/<clip>.ball.json`, `labels/<clip>.person.json` | the ground truth (format in `server.py`'s docstring) | **yes** |
| `tools/lab/loop.py`, `coreml_export.py`, `coreml-mac.sh` | test 10: EdgeTAM in parts, Core ML export and Mac check | yes |
| `tools/lab/single_pass.py` | test 12: one pass with the crop following the ball; `report` scores tracks side by side | yes |
| `tools/lab/broadcast.py`, `tools/lab/flow-probe.swift` | test 13: broadcast-camera variants (scores, renders, OpenCV flow) and the Vision optical-flow probe (Mac) | yes |
| `tools/lab/low_fps.py`, `tools/lab/mac-lowfps.sh` | test 14: Foco na Bola at 5 fps (frames, simulation, report; the Mac run) | yes |
| `tools/lab/ball_gate.py` | test 15: per-clip signals and the proposed rule for offering the ball framing | yes |
| `lab/tests/gate/` | test 15 reports | no |
| `lab/tests/lowfps/` | test 14 reports | no |
| `lab/tests/broadcast/` | test 13 scores, framings, flow files and videos | no |
| `tools/lab/compare_runs.py` | test 12: one video with two ball tracks framed side by side (default: two passes vs one) | yes |
| `lab/tests/single/`, `lab/cache/` | test 12 reports; full-resolution frames while a clip runs (deleted after) | no |
| `tools/lab/ios-bench/`, `tools/lab/ios_bench.py` | test 11: the FocusBench test app and its data/results script | yes (not `ios-bench/FocusBench/Data/`) |
| `lab/tests/ios/` | the phones' result files | no |
| `lab/coreml/`, `lab/tests/coreml/` | the exported .mlpackage models and the check results | no |
| `lab/` | frames, Python env, checkpoints, SAM 2 cache | no |

## Use

```bash
cd docs/focus-refs
bash tools/lab/setup-mac.sh                 # once (~5 min; downloads PyTorch, SAM 2, the tiny checkpoint)
lab/.venv/bin/python tools/lab/server.py    # opens the page in the browser
```

Labelling a clip (ball): find a frame where the ball shows, click it (or drag a small box around it). SAM 2 follows it
through the whole clip (status chip top right); then go through the samples (every 200 ms) with **Enter** where the
lime ring is on the ball, **click** where it is wrong (the click becomes a new SAM 2 prompt and the rest of the clip
is redone in the background), **O** when the ball is out of play, **N** when it is in play but hidden. Shift+click on
something SAM 2 confused with the ball marks it "not this". **Space** plays the clip with the proposals, to spot
where SAM 2 got lost. Labels save on every key.

Person: drag a box around the chosen player once; SAM 2 follows; Enter / fix the same way. One player per clip on a
subset is enough for test 2.

The page records whether each label is an accepted SAM 2 proposal or a human click (`src`), and every prompt in
order: test 1 replays only the first prompt to measure SAM 2 on its own, and the number of clicks per clip is itself a
result.

`--model tiny | small | base_plus` picks the SAM 2.1 size (default tiny; `setup-mac.sh small` downloads another). A click recomputes only from the clicked frame on, and a newer click stops a running pass; `--backend none` runs the page without a
model (the proposal is the last click).

## Regenerate (what was deleted on 2026-11-05)

Deleted to free space, all remade by the tools (run from `docs/focus-refs`):

| Deleted | Remake with |
|---|---|
| `lab/frames/<clip>/` (10 fps JPEGs) | `bash tools/lab/extract.sh [clip ...]` (clips.txt windows) |
| `lab/frames/<clip>@5`, `@3`, `@2` | `python3 tools/lab/low_fps.py frames --step 2/3/4 <clip ...>` |
| `lab/frames/<clip>@roi40b`, `@roi40b5`, ... (pass-2 crops) | `roi.py <clip ...> --first <pass-1 tag> [--step 2]` (needs the pass-1 track) |
| comparison videos (`lab/tests/framing/*.mp4`, `lab/tests/broadcast/*.mp4`, old `renders/*.mp4`) | `hybrid.py --model <tag> --render`, `compare_runs.py`, `broadcast.py render` |
| `tools/lab/ios-bench/FocusBench/Data/` | `lab/.venv-edgetam/bin/python tools/lab/ios_bench.py prepare` |
| `lab/_to_delete/`, `lab/cache/` | scratch, nothing to remake |

Kept (not deleted): `lab/.venv`, `lab/.venv-edgetam`, `lab/models/`, `lab/coreml/` (if removed later: `setup-mac.sh`,
`setup-edgetam.sh`, `coreml_export.py export`); `lab/tests/**/*.json` and `*.md` (tracks, framings, reports: every number in this README), `renders/**/*.people.json`
(Vision people per clip; remade by `tools/vision-probe.swift` on the Mac), the source videos.

