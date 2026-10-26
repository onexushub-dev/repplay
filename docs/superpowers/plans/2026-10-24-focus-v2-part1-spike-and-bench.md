# Modo Foco v2 — Part 1: On-device Spike and Evaluation Bench — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pick the detector (go/no-go on the device numbers) and build the offline bench that measures every later Modo Foco v2 change against v1 on Victor's clips.

**Architecture:** Two throwaway-or-tooling pieces, nothing shipped. (A) An on-device spike, behind the existing dev screen `src/app/spike.tsx`, that times the candidate Core ML models, lists capture formats and exports one 16:9 clip as 9:16. (B) A Python bench in `docs/superpowers/spikes/focus-v2/bench/` that runs the same models (ONNX, same weights), a Python prototype of the spec's ball tracker and path v2, and reports the spec §1 metrics, v1 vs v2. The bench prototypes are the reference the Swift port (Part 2) must match through shared fixtures.

**Tech Stack:** Python 3.11 (venv on the Mac), PyTorch + coremltools (conversion), onnxruntime, OpenCV, NumPy, pytest; Swift (ReplayCore, a dump CLI); the existing Expo dev screen.

**Spec:** `docs/superpowers/specs/2026-10-24-focus-ball-tracking-design.md` (steps 0 and 1 of its §8). Read it first.

**Plans after this one** (written once Part 1's results are in, because the model choice and the tuned values feed them):
- Part 2 — ReplayCore: `BallTracker`, `FocusPath` v2, `FocusTuning` v2 (spec §4.2–4.3), ported from the bench with its fixtures.
- Part 3 — Native analyzer v2: Core ML detector, tiling, file v2, v1 re-queue (spec §4.1, §4.4).
- Part 4 — Capture quality (Pro) and 2K/4K exports (spec §4.7–4.8). Independent of Parts 2–3; can be written now on request.
- Part 5 — Vertical from landscape: panel, preview, export, Story (spec §4.6). Needs the portrait rows from Part 3.
- Spec step 2 (queue pause during recording) is already done (2026-10-24).

## Global Constraints

- Free resources only; no AGPL code or weights anywhere, the bench included (no Ultralytics). Candidates: YOLOX-S (Megvii, Apache-2.0), RTMDet-S (OpenMMLab, Apache-2.0), D-FINE-S (Apache-2.0), COCO-pretrained, classes `person` (0) and `sports ball` (32).
- Detector settings from the spec, verbatim: frames at 10 fps (one per 100 ms tick), decoded at 1920 px on the long side; model input 640; tiles when the median person height is under 48 px at the 640 scale; tiles portrait 2×3, landscape 3×2, 15% overlap; NMS IoU 0.45; people kept at confidence ≥ 0.3, ball candidates at ≥ 0.15; tiling decided per clip from the first second of samples.
- Coordinates everywhere: normalized 0..1, origin top-left, display orientation (rotation metadata applied).
- Time budget targets (spec §1): 30 s window analysed in ≤ 30 s on iPhone XR, ≤ 10 s on iPhone 16 Pro Max.
- Media stays local: `docs/focus-refs/` is git-ignored for video/images; the bench writes caches and reports under `docs/focus-refs/bench-out/` (git-ignored), never next to the clips.
- Docs and file names in English. TypeScript: no optional chaining (`?.`); explicit checks.
- Git: Victor commits. Each "Checkpoint" step means: stop, tell Victor what changed and the suggested commit message; do not run git write commands.

## Review Focus

1. **Clip with no ball candidates at all** (a far camera, a bad model): v2 must give exactly v1's rects and the report must say "no ball track", not crash or show 0%. → test in Task 7.
2. **Raw app clips are stored landscape with a rotation tag** (1920×1080, displayed 1080×1920): decoding must apply it, or every box is rotated 90°. → test in Task 3.
3. **720p30 clips (29.97 fps)**: frame times drift against the 100 ms grid; sample `k` must still be the first frame at or after `startMs + k·100`. → test in Task 3.
4. **The same ball seen in two overlapping tiles**: must merge into one candidate, or the tracker sees two balls. → test in Task 4.
5. **Samples labelled "ball not in play" or a clip with no labels**: excluded from the denominator; a clip with no in-play labels reports "n/a", not 0% or 100%. → test in Task 9.

---

## A. On-device spike (spec step 0, throwaway)

All spike code lives on a branch Victor names (e.g. `spike/focus-v2`) and is not merged. Results go to `docs/superpowers/spikes/focus-v2/RESULTS.md`, which is kept.

### Task 1: Convert the three candidates to Core ML and ONNX

**Files:**
- Create: `docs/superpowers/spikes/focus-v2/convert/README.md`, `convert/requirements.txt` (pinned), `convert/convert.py`
- Output (git-ignored): `docs/focus-refs/bench-out/models/<name>.mlpackage`, `<name>.onnx`

**Interfaces:**
- Produces: for each candidate `yolox_s`, `rtmdet_s`, `dfine_s`: an `.onnx` and an `.mlpackage` taking a 640×640 RGB image (letterboxed, values as the model expects) and returning the raw head outputs; plus `convert/decode.py` with `decode(name: str, raw: list[np.ndarray], letterbox: Letterbox) -> list[Det]`, `Det = (cls: int, conf: float, x: float, y: float, w: float, h: float)` in 640-space. Decoding and NMS stay outside the model so the Swift and Python sides share one decoder spec.

- [ ] **Step 1:** Write `convert.py <name>`: downloads the official COCO weights (record URL and SHA-256 in the README), traces the PyTorch model at 640×640, writes `.onnx` (opset 17) and `.mlpackage` (`coremltools`, FP16, `ComputeUnit.ALL`).
- [ ] **Step 2:** Write `decode.py` and `tests/test_decode.py::test_decode_matches_reference_on_sample_image`: on a frame extracted with `ffmpeg -ss 45 -i docs/focus-refs/clips/basket-v-corner-normal-01.mp4 -frames:v 1 docs/focus-refs/bench-out/sample.jpg`, the ONNX output decoded with `decode` matches the upstream repo's own inference (same boxes ±1 px, same classes) for each candidate.
- [ ] **Step 3:** Run `pytest docs/superpowers/spikes/focus-v2/convert/tests -v`. Expected: PASS for every candidate that converted. A candidate that does not convert within this task is dropped and noted in `RESULTS.md` with the error.
- [ ] **Step 4: Checkpoint** — "spike(focus-v2): candidate model conversion".

### Task 2: Device timing, capture formats and a 9:16 export

**Files (spike branch only):**
- Create: `app/modules/replay-camera/ios/FocusSpike.swift`
- Modify: `app/modules/replay-camera/ios/ReplayCameraModule.swift` (three spike functions), `app/src/app/spike.tsx` (buttons + result text)
- Create (kept): `docs/superpowers/spikes/focus-v2/RESULTS.md`

**Interfaces:**
- Produces (native, spike only): `AsyncFunction("spikeTimeModel") (model: String, clipPath: String, grid: String, decodeLongSide: Int, frames: Int) -> { msPerFrame: Double, msPerFrameP95: Double }` (`grid`: `"full" | "2x2" | "3x2" | "4x3"`; multi-frame models — `wasb_*` 3 frames, `tnv3_*` 8 frames + a median background of 60 frames — keep a rolling buffer, so one call per sample); `Function("spikeCaptureFormats") -> [{ width: Int, height: Int, maxFps: Double, lens: String }]`; `AsyncFunction("spikeExportPortrait") (clipPath: String, focusPath: String, outPath: String) -> String`.

- [ ] **Step 1:** `spikeTimeModel`: loads the bundled `.mlpackage` (copied into the spike build), reads `frames` frames at 10 fps from the clip with `AVAssetReader` scaled to 1920 px long side, runs `VNCoreMLRequest` on the full frame or each tile of `grid` (15% overlap), and times model + decode (NMS for detectors, heatmap blobs > 0.5 for `wasb_*`/`tnv3_*`) per sample. No assertions: it is a measurement.
- [ ] **Step 2:** `spikeCaptureFormats`: every 16:9 format of the back wide and ultra-wide cameras with its max frame rate.
- [ ] **Step 3:** `spikeExportPortrait`: `ClipExporter` with a 1080×1920 render size, the clip's `portrait` rows from its `.focus.json` and the vertical overlay; returns the output path.
- [ ] **Step 4: Measure** on the XR and the 16 Pro Max, 300 frames each, with `clips/basket-v-corner-unavailable-01.mp4`
  and the 4K cut `refs4k/seg/tennis-02-2160.mp4` (copy both into the spike build's documents). Updated 2026-10-25 (spec §13.4):
  - person detector, `yolox_s` and `dfine_s`: full frame, 3×2 tiles from a 1920 px decode, 4×3 tiles from a 2560 px decode;
  - `wasb_tennis` (3 frames → 288×512 heatmaps; Core ML from `bench-out/models/ext/onnx/wasb_tennis.onnx` via `coremltools`): full frame and 2×2 tiles of the 4K frame;
  - `tnv3_beachvolley` (8 frames + background → 288×512): full frame;
  - the motion score of spec §13.3 over 10 candidates (should be negligible; confirms it).
  Record in `RESULTS.md` a table `model | grid | phone | ms/frame | p95 | 30 s window estimate (×300)`.
- [ ] **Step 5: Measure** capture: the formats list for both phones; 20 minutes recording indoors at 4K30, then 4K60 if listed (2K capture is dropped, spec decision 11), reading the `[replay] thermal` log lines; record time to `fair` and `serious`.
- [ ] **Step 6: Check** the 9:16 export by eye: framing follows the play, the mark is bottom-right in every frame, duration matches the cut.
- [ ] **Step 7: Decide** in `RESULTS.md`: the person detector (YOLOX-S or D-FINE-S) and its grid per resolution (3×2 or 4×3) within the time budget; whether TrackNetV3 ships for volleyball; WASB full frame or 2×2 for 4K tennis; 4K frame rate (30, or 60 if it reached no `serious` in 20 min on both phones).
- [ ] **Step 8: Checkpoint** — "spike(focus-v2): device measurements and decisions" (only `RESULTS.md` is meant for main).

---

## B. Evaluation bench (spec step 1, kept tooling)

All under `docs/superpowers/spikes/focus-v2/bench/`. Layout:

```
bench/
  README.md            how to set up the venv and run each command
  requirements.txt     pinned versions
  focusbench/
    clips.py           manifest + name parsing, frame reader on the 100 ms grid
    detect.py          model runner (ONNX), tiling, NMS, detections cache
    v1path.py          port of FocusPath v1 + FocusGrid
    tracker.py         BallTracker prototype (spec §4.2)
    path_v2.py         FocusPath v2 prototype (spec §4.3) + TUNING_V2
    labels.py          ball proposals, label file read/write
    metrics.py         spec §1 metrics
    report.py          markdown report + preview videos
  label/index.html     labelling page (no server, no network)
  tools/focuspath-dump.swift   prints Swift v1 rects for a detections file (parity)
  run.py               detect → v1 → v2 → metrics → report
  tests/               pytest
```

Shared data shapes (all tasks):

```python
Box = tuple[float, float, float, float]            # x, y, w, h  (0..1, top-left)
Ball = tuple[float, float, float, float]           # x, y, r, conf
Sample = {"t": int, "people": list[tuple[*Box, float]], "balls": list[Ball]}
Detections = {"clip": str, "model": str, "W": int, "H": int, "stepMs": 100, "startMs": int, "tiled": bool,
              "samples": list[Sample]}
Rect = tuple[float, float, float, float]           # crop x, y, w, h
TrackRow = tuple[float, float, int, float]         # x, y, state (0 seen, 1 predicted, 2 held, 3 lost), conf
```

### Task 3: Clips, manifest and the frame reader

**Files:**
- Create: `bench/focusbench/clips.py`, `bench/tests/test_clips.py`, `bench/README.md`, `bench/requirements.txt`

**Interfaces:**
- Produces: `parse_name(file: str) -> ClipInfo` (`sport, orientation 'v'|'h', camera, case, cam4k: bool, n: int`; raises `ValueError` on names outside `<sport>-<v|h>-<side-high|side-low|end|corner>-<case>[-cam4k]-<nn>.mp4`); `load_manifest(path: str) -> list[ManifestRow]` (the columns of `clips/manifest.csv`); `frames_on_grid(path: str, start_ms: int, end_ms: int, step_ms: int = 100, long_side: int = 1920) -> Iterator[GridFrame]`, `GridFrame(tick: int, t: float, image: np.ndarray)` (tick, the frame's own time, upright BGR, scaled down never up).

- [ ] **Step 1: Write the failing tests**
  - `test_parse_name_reads_every_field`: `basket-h-side-high-shot-cam4k-01.mp4` → `("basket","h","side-high","shot",True,1)`; `basket-v-corner-unavailable-05.mp4` → `cam4k False, n 5`; `foo.mp4` raises `ValueError`.
  - `test_raw_app_clip_is_read_upright`: `frames_on_grid("docs/focus-refs/clips/basket-v-corner-normal-01.mp4", 29984, 31000)` first frame shape is `(1920, 1080, 3)` (rotation applied).
  - `test_grid_picks_first_frame_at_or_after_each_tick_at_29_97_fps`: on `basket-v-corner-normal-08.mp4` (720p30), ticks are exactly `startMs + 100·k` and each yielded frame's own time is in `[tick, tick + 100)`.
- [ ] **Step 2:** Run `pytest bench/tests/test_clips.py -v`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement with OpenCV (`CAP_PROP_ORIENTATION_AUTO` on; verify against `ffprobe` rotation) and `CAP_PROP_POS_MSEC` per frame.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Checkpoint** — "bench(focus-v2): clips, manifest and grid reader".

### Task 4: Detector runner with tiling and cache

**Files:**
- Create: `bench/focusbench/detect.py`, `bench/tests/test_detect.py`

**Interfaces:**
- Consumes: Task 1 `decode`, Task 3 `frames_on_grid`.
- Produces: `detect_clip(path: str, model: str, start_ms: int, end_ms: int) -> Detections`, cached at `docs/focus-refs/bench-out/det/<clip>.<model>.json`; `choose_tiling(first_second: list[Sample], scale_640: float) -> bool`; `tiles(orientation: str) -> list[Box]`; `nms(dets: list, iou: float = 0.45) -> list` (per class).

- [ ] **Step 1: Write the failing tests**
  - `test_tiles_cover_the_frame_with_15_percent_overlap`: portrait → 6 boxes (2 cols × 3 rows), landscape → 6 boxes (3 × 2); union covers [0,1]²; neighbours overlap by 0.15 of a tile side (±1e-6).
  - `test_tiling_turns_on_below_48px_median_person_height`: synthetic first second with median person height 47 px at 640 scale → `True`; 49 px → `False`; no people → `True`.
  - `test_one_ball_seen_in_two_tiles_becomes_one_candidate`: two ball dets 1 px apart in full-frame coords, conf 0.4 and 0.6 → one candidate with conf 0.6.
  - `test_thresholds`: people below 0.3 and balls below 0.15 are dropped.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement; ball radius `r = (w + h) / 4` in width-normalized units.
- [ ] **Step 4:** Run. Expected: PASS. Then `python run.py detect --model yolox_s` on all 16 clips writes 16 cache files.
- [ ] **Step 5: Checkpoint** — "bench(focus-v2): detector runner, tiling, cache".

### Task 5: FocusPath v1 port with Swift parity

**Files:**
- Create: `bench/focusbench/v1path.py`, `bench/tools/focuspath-dump.swift`, `bench/tests/test_v1path.py`

**Interfaces:**
- Produces: `v1_rects(samples: list[tuple[int, list[Box]]], W: int, H: int, aspect: 'landscape'|'portrait', zoom: bool, max_zoom: float = 1.5) -> list[Rect] | None` (same constants as `FocusTuning.standard`); `grid_samples(frames, start_ms, end_ms, step_ms) -> list` (port of `FocusGrid.samples`).
- The dump tool: `swiftc -O -o focuspath-dump tools/focuspath-dump.swift ../../../../app/modules/replay-camera/ios/Core/Sources/ReplayCore/FocusPath.swift ../../../../app/modules/replay-camera/ios/Core/Sources/ReplayCore/FocusGrid.swift` then `./focuspath-dump <fixture.json> <aspect> <zoom>` prints rects as JSON.

- [ ] **Step 1: Write the failing test** `test_python_v1_matches_swift_on_all_spike_fixtures`: for each of the 6 files in `app/modules/replay-camera/ios/Core/Tests/ReplayCoreTests/Fixtures/`, both aspects, `zoom` true for the clip's own aspect: every rect component equal within 1e-6, and `None` exactly when Swift prints `null`. (Skipped with a message when `swiftc` is absent.)
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Port `FocusPath.compute` and `FocusGrid.samples` line by line (same order of operations, so floating point matches).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Checkpoint** — "bench(focus-v2): FocusPath v1 port with Swift parity".

### Task 6: Ball tracker prototype

**Files:**
- Create: `bench/focusbench/tracker.py`, `bench/tests/test_tracker.py`

**Interfaces:**
- Produces: `track_ball(samples: list[Sample], tuning: dict | None = None, hw: float = 1.0) -> list[TrackRow]` (one row per sample; `hw` = frame height / width, distances in frame widths); defaults in `TRACKER_TUNING` (tracker.py), which `TUNING_V2` (path_v2.py) includes.
- Tuning keys and starting values (spec §4.2): `static_share 0.70`, `static_window_ms 2000`, `static_radius 0.01`, `start_hits 3`, `start_window_ms 500`, `predict_max_ms 700`, `held_max_ms 3000`; free starting values: `accel_std 3.0`, `meas_std 0.006`, `gate_base 0.08`, `gate_growth 0.05`, `gate_new 0.35` (one-match tracks).
- Added on the real clips (2026-10-24): `static_track_radius 0.015` (a track that never moves is scenery: an intermittent blob escaped rule 1), and HELD follows moving people only (v1's still rule; a painted wall figure was being followed).

- [ ] **Step 1: Write the failing tests** (spec §6 list, as pytest):
  - `test_parabola_is_tracked`: candidates on `y = 0.8 - 2.4t + 3t²`, x linear, every sample → all rows `seen`, positions within 0.01.
  - `test_straight_pass_is_tracked`: x from 0.2 to 0.8 in 1 s → `seen` throughout.
  - `test_static_candidate_is_dropped`: a candidate fixed at (0.7, 0.24) in every sample plus nothing else → all rows `lost`.
  - `test_short_gap_is_predicted`: 0.5 s without candidates mid-pass → those rows `predicted`, positions on the line within 0.03.
  - `test_long_gap_is_held_by_nearest_player`: 1.5 s gap, a player box whose centre is nearest the last seen ball → rows after 0.7 s are `held` at that box centre.
  - `test_very_long_gap_is_lost`: 4 s gap → rows after 3 s are `lost`.
  - `test_moving_ball_beats_static_ball`: a static candidate and a moving one in every sample → rows follow the moving one.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement: static filter → constant-velocity Kalman forward pass with growing gate → RTS backward smoothing → gap states. Main track = active track with the highest sum of matched confidences.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Checkpoint** — "bench(focus-v2): ball tracker prototype".

### Task 7: FocusPath v2 prototype

**Files:**
- Create: `bench/focusbench/path_v2.py`, `bench/tests/test_path_v2.py`

**Interfaces:**
- Consumes: Task 5 `v1_rects` (fallback and steps 1–2 filters), Task 6 `track_ball`.
- Produces: `v2_rects(samples: list[Sample], track: list[TrackRow], W: int, H: int, aspect: str, zoom: bool, max_zoom: float, tuning: dict | None = None) -> list[Rect] | None`; `max_zoom_for(fit_short_px: float) -> float` = `max(1, min(3, fit_short_px / 720))` (short side, in source pixels, of the largest rect of the target aspect that fits).
- v1's steps 1–4 are factored out of `v1path.py` as `filter_people`, `enough_people`, `v1_targets`, `place`; `v1_rects` output is bit-identical before and after (checked on the 6 fixtures × 2 aspects × zoom on/off).
- Deviations kept for the tuning round (2026-10-25): no vertical dead zone yet (y is smoothed 0.8 s as v1); added `settle_speed 0.1` (the camera stops following only when the target is nearly still) and `sigma_lead_ms 300` (the lead uses a smoothed speed, so jitter does not move the camera).
- Tuning keys and starting values (spec §4.3): `ball_weight_x 0.7`, `ball_weight_y 0.3`, `near_players 2`, `lookahead_max_s 0.5`, `lead_max 0.15`, `dead_zone_w 0.40`, `dead_zone_h 0.50`, `size_lookahead_s 0.8`, `spread_scale 1.3`, `spread_margin 0.15`, `sigma_size_ms 1200`, `pan_base 0.35` (frame widths/s), `pan_fast 0.8` (crop widths/s), `fast_when_outside 0.70`, `accel_max 1.5` (crop widths/s²), `lift 0.1`, `min_people_share 0.2`.

- [ ] **Step 1: Write the failing tests**
  - `test_no_ball_track_equals_v1`: every track row `lost` → `v2_rects == v1_rects` exactly, on two spike fixtures. *(Review Focus 1.)*
  - `test_max_zoom_by_resolution`: `max_zoom_for(1080, 1080) == 1.5`, `(1440,1440) == 2`, `(2160,2160) == 3`, `(1080, 607) == 1`, `(2160, 1215) == 1215/720`.
  - `test_crop_never_tighter_than_max_zoom`: every rect width ≥ `1/max_zoom` (same aspect).
  - `test_dead_zone_holds_still`: ball moving ±0.05 around the centre for 3 s → crop centre range < 0.005.
  - `test_lead_room_points_where_the_ball_goes`: ball moving right at 0.3 frame widths/s → crop centre x > ball x, by ≤ 0.15 crop widths.
  - `test_speed_and_acceleration_limits`: a step of the ball from x 0.2 to 0.8 → per-step centre change ≤ the pan limits; second difference ≤ `accel_max` (crop widths/s², at 100 ms steps).
  - `test_rects_inside_the_video`: all rects within [0,1] for random tracks (seeded).
  - `test_none_when_too_few_people`: people in 15% of samples → `None`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the spec §4.3 steps 1–9 in order; look-ahead `Δ = lookahead_max_s × min(1, ball speed / 1.0 frame widths/s)`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Checkpoint** — "bench(focus-v2): FocusPath v2 prototype".

### Task 8: Ball labels (proposals + labelling page)

**Files:**
- Create: `bench/focusbench/labels.py`, `bench/label/index.html`, `bench/tests/test_labels.py`

**Interfaces:**
- Consumes: Task 4 detections, Task 6 tracker.
- Produces: `python run.py propose --model <m> [--clips <glob>]` (uses `write_label_folder`, `proposals_from`) writes `docs/focus-refs/bench-out/label/<clip>/` with one JPEG per sample (`t_<ms>.jpg`, 1280 px long side: at 540 px a basketball was ~3 px) and `proposal.json` `{ clip, startMs, endMs, proposals: { "<t>": [x, y] | null }, labels }`; label file `docs/focus-refs/clips/<clip>.ball.json` `{ "v": 1, "samples": { "<t>": [x, y] | "out" | "none" } }` (`out` = ball not in play, `none` = not visible but in play); `load_labels(clip) -> dict[int, tuple[float,float] | str]`.
- The page: open `label/index.html` from Finder, pick the clip's `bench-out/label/<clip>/` folder (file input, `webkitdirectory`), it shows each frame with the proposal dot; keys: click = set ball, `Enter` = accept proposal, `O` = out of play, `N` = not visible, `⌫` = clear, arrows = previous/next, `S` = download `<clip>.ball.json`. A 4× loupe follows the cursor; "label 1 in N samples" (default 5: two per second, ~60 per 30 s clip) keeps the work to minutes per clip. Work in progress is kept in the browser's localStorage per clip; the download is the real save. No network.

- [ ] **Step 1: Write the failing tests** `test_label_file_round_trip` (write → `load_labels` gives the same dict) and `test_labels_reject_out_of_range_points` (`[1.2, 0.5]` raises `ValueError`).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `labels.py` and the page.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then label `basket-v-corner-normal-01` end to end with the page and check the file loads.
- [ ] **Step 5: Checkpoint** — "bench(focus-v2): ball labels".

### Task 9: Metrics

**Files:**
- Create: `bench/focusbench/metrics.py`, `bench/tests/test_metrics.py`

**Interfaces:**
- Produces: `clip_metrics(rects: list[Rect] | None, labels: dict, start_ms: int, step_ms: int = 100) -> ClipMetrics` with `available: bool`, `ball_in_crop: float | None` (share of labelled in-play samples whose ball point lies inside the rect; `None` when there are none), `mean_zoom: float | None` (mean of `1 / rect.w`), `jerk_p95: float | None` (95th percentile of |second difference| of the crop centre, in crop widths/s²); `overall(rows: list[ClipMetrics]) -> dict` (sample-weighted ball share, count of unavailable clips, mean zoom, mean jerk).

- [ ] **Step 1: Write the failing tests**
  - `test_ball_share_counts_only_in_play_points`: 10 labels, 2 `out`, 1 `none`, 7 points of which 6 inside → `6/7`.
  - `test_clip_without_in_play_labels_is_not_scored`: only `out`/`none` labels → `ball_in_crop is None`. *(Review Focus 5.)*
  - `test_unavailable_clip`: `rects None` → `available False`, every number `None`.
  - `test_still_crop_has_zero_jerk` and `test_mean_zoom_of_half_width_crop_is_2`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Checkpoint** — "bench(focus-v2): metrics".

### Task 10: Runner and report

**Files:**
- Create: `bench/run.py`, `bench/focusbench/report.py`, `bench/tests/test_report.py`

**Interfaces:**
- Consumes: Tasks 3–9.
- Produces: `python run.py all --model yolox_s [--clips <glob>]` → `docs/focus-refs/bench-out/report-<model>-<yyyymmdd-hhmm>.md` with a per-clip table (`clip | v1 available | v2 available | ball in crop v1 → v2 | mean zoom v1 → v2 | jerk p95 v1 → v2 | no ball track?`), the overall row against the spec §1 targets (✓/✗), the `TUNING_V2` values used, and per clip `preview/<clip>.mp4`: v1 and v2 crops side by side at the export size (ffmpeg, crop path applied per 100 ms with linear interpolation, labelled ball drawn as a dot). `python run.py compare --models yolox_s,rtmdet_s,dfine_s` adds a model table (people found per sample, small-person recall vs. the largest model, ball candidates per sample, ball-in-crop with v2) for Task 2 step 7.
- The source size for `max_zoom_for` comes from the clip's real resolution (720p clips get max zoom 1).
- First run (2026-10-25, 1 clip): v2 jerk p95 1.50 vs v1 0.22 crop widths/s²: the camera accelerates and brakes at the
  limit (bang-bang). First item for Task 11: a smoother controller (e.g. a critically damped spring) or a lower
  `accel_max`. With the generic YOLOX-S the ball is SEEN in 6–25% of the samples of the vertical clips.

- [ ] **Step 1: Write the failing test** `test_report_marks_targets`: overall ball share 0.96, 0 unavailable, zoom 1.6 vs v1 1.2, jerk not worse → every target row ✓; ball share 0.90 → that row ✗.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test (PASS), then `python run.py all --model yolox_s` on the 16 clips and `python run.py compare` once the three detection caches exist. Expected: a report file and 16 preview videos.
- [ ] **Step 5: Checkpoint** — "bench(focus-v2): runner and report".

### Task 11: First tuning round and fixtures for Part 2

**Files:**
- Modify: `bench/focusbench/path_v2.py` (`TUNING_V2` values only)
- Create: `docs/superpowers/spikes/focus-v2/TUNING.md` (each change: value before → after, metric before → after, clip that motivated it)
- Create: `app/modules/replay-camera/ios/Core/Tests/ReplayCoreTests/Fixtures/v2/<clip>.json` for 4 clips (`basket-v-corner-normal-01`, `-normal-02`, `-unavailable-01`, `-unavailable-02`): `{ "detections": Detections, "track": [TrackRow], "portrait": [Rect], "landscape": [Rect], "tuning": TUNING_V2 }` produced by the bench (Part 2's Swift must reproduce `track` and rects within 1e-4).

- [ ] **Step 1:** Label the 16 clips with the page (Victor reviews; about 300 samples per clip).
- [ ] **Step 2:** Run `run.py all`, read the report and the previews; change one `TUNING_V2` value at a time, re-run, record in `TUNING.md`. Stop when the targets are met or after 10 rounds (then the gap decides spec step C).
- [ ] **Step 3:** `python run.py fixtures --clips basket-v-corner-normal-01,...` writes the 4 fixture files.
- [ ] **Step 4:** `pytest bench/tests -v` all PASS with the final tuning.
- [ ] **Step 5: Checkpoint** — "bench(focus-v2): first tuning round, v2 fixtures for ReplayCore".
