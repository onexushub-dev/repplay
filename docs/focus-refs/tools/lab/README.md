# Modo Foco lab (2026-11-03)

Test bench for the next Modo Foco round. **Nothing here goes into the app.** The goal is to compare, on the same
static-camera clips and against the same ground truth, the ways to make the framing follow the play faster:

| # | Test | Status |
|---|---|---|
| 0 | Ground truth: ball (and one chosen player) on 18 clips, labelled with SAM 2 assist | 4 clips (ball) on 2026-11-03 |
| 1 | SAM 2 "one click on the ball": how long it follows, clicks a user would need (`oneclick.py`, Mac) | **done: first method that follows the ball** (below) |
| 2 | "One click on a player" (custom Modo Foco): SAM 2 first (`oneclick.py --mode person`); Vision `VNTrackObjectRequest`, EdgeTAM, people boxes + appearance after | needs person labels |
| 3 | Vision trajectories (`VNDetectTrajectoriesRequest`), every trajectory at every frame (`vision-traj.swift`, Mac; `vision_eval.py`) | **done: not good enough** (below) |
| 4 | Classical ball detection for a fixed camera (`classical.py`) | **done: not good enough** (below) |
| 5 | Motion (optical flow) as a lead signal for the camera | next |
| 6 | Hybrid framing: the ball while SAM 2 is sure of it, today's Modo Foco when not (`hybrid.py`, videos in `lab/tests/framing/`) | **first round done** (below) |

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
