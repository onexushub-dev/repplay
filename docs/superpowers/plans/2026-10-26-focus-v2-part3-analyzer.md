# Modo Foco v2 — Part 3: native analyzer v2 (3a engine, 3b screens) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Modo Foco v2 to the app. The native analysis runs the D-FINE-S detector (Core ML) on tiles, scores ball candidates by motion, calls `FocusV2.rects` (Part 2) with the recording's sport and writes a `.focus.json` v2. Clips analysed by v1 are redone. The setup screen asks the sport; the Foco panel can switch between following the players and the ball.

**Architecture:** Everything that can be pure goes to ReplayCore and is held to bench fixtures with `swift test`: D-FINE decoding, NMS and tile merge, the tile plan, the motion score, the grid with ball candidates. The native side (`FocusDetector`, `FocusAnalyzer`) only decodes frames, runs Core ML and wires the pieces. It is checked on the phone with a debug dump that the bench reads back (Task 8). 3a (Tasks 1–8) is the engine, mergeable alone: with every sport at `livre` it already gives the better players framing. 3b (Tasks 9–11) adds the screens.

**Tech Stack:** Swift 5.9 (ReplayCore SwiftPM, XCTest; ReplayCamera pod: AVFoundation, Vision, Core ML), TypeScript/React Native (Expo, Jest), Python bench (pytest, onnxruntime, coremltools on macOS).

**Spec:** `docs/superpowers/specs/2026-10-24-focus-ball-tracking-design.md` §4.1, §4.4, §4.5 and **§13** (wins where they disagree; decision 10 amended 2026-10-26: tennis uses the filtered detector). Bench: `docs/superpowers/spikes/focus-v2/TUNING.md`. Part 2 plan: `2026-10-25-focus-v2-part2-replaycore.md`.

**Not in this plan:** device timing and the grid/detector decisions (Part 1 task 2, still open: this plan ships defaults that are easy to change, Task 3); 4K capture and the economy switch (Part 4); vertical from landscape (Part 5); TrackNetV3 (only if Part 1 task 2 says it fits).

## Decisions taken here (Victor to confirm in review)

1. **Detector: D-FINE-S only.** The ball-led numbers (tennis 98%, volleyball 95%) and the 4K people recall come from it; YOLOX-S found the basketball in 17% of samples. If Part 1 task 2 shows it is too slow on the XR, YOLOX-S for players-framed sports is a follow-up (same decode file shape, another `decode` case).
2. **The model takes an image, not a tensor.** `convert.py` gains `--image-input` (RGB, scale 1/255, 640×640), so Vision crops each tile and scales it (`regionOfInterest`, `.scaleFill` = D-FINE's stretch) on the GPU. Parity with the ONNX model is checked on macOS (Task 2) and on the phone through the dump (Task 8).
3. **The sport lives in a new field `Session.focusSport`** (absent = `livre`), last choice in `Prefs.focusSport`. Spec decision 9 says `Session.sport`, but that field holds the mode id (`quadra`, `academia`…) that settings, labels and saved games use; mixing both meanings would break those.
4. **File v2 keeps v1's keys.** `landscape` / `portrait` hold the default framing (what the sport follows), so preview and export read v2 with only the version check changed. A ball-led file adds `players` (the main aspect framed by players, for `Seguir: Jogadores`) and `ball` (the track).
5. **Motion score at the decode size.** Grey (luma) of the frame as decoded (1920 px long side for today's 1080p clips; the native pixels, like the 4K round), a 3×3 binomial blur ([1 2 1]/4, edges reflected), patch radius `max(4, round(1.5 r W))` px, mean |Δ| vs the previous and the next sample, the min of both. Task 1 re-checks the threshold 4.0 with this exact definition on the 8 app clips of test D.
6. **Model missing or failing to load → v1 people.** The analysis falls back to Vision's people and the players path, so Modo Foco never gets worse than today.

## Global Constraints

- Coordinates: normalized 0..1, origin top-left, display (upright) orientation. Vision's boxes and `regionOfInterest` are origin bottom-left: convert at the native boundary only.
- Grid: one sample per 100 ms tick. People repeat over a gap (v1 `FocusGrid`); **ball candidates never repeat** (an empty list), so a gap cannot make a static ball.
- Detector constants (spec §4.1): model input 640; people kept at conf ≥ 0.3, ball candidates at ≥ 0.15; tiles overlap 15%; NMS IoU 0.45 per class (full frame and tiles merged); a ball candidate's radius `r = (w + h · H / W) / 4` (frame widths). D-FINE: sigmoid on logits, the best 300 (query, class) pairs, no NMS inside one pass.
- Tile plan (Task 3; defaults until Part 1 task 2): short side ≤ 1080 → full frame + 3×2 (landscape) / 2×3 (portrait) from a 1920 px decode; ≤ 1440 → 4×3 / 3×4 from 2560 px; above → 4×3 / 3×4 from 2560 px (6×4 waits for the timing). Ball-led sports always tile; players-framed sports tile when the median person height in the first second is under 48 px at the 640 scale (spec §4.1).
- ReplayCore stays Foundation-only, no new dependencies. TypeScript: no optional chaining (`?.`); explicit checks. Docs and names in English; copy in `pt-BR` and `en`.
- Licenses: D-FINE code Apache-2.0 (weights COCO: CC BY 4.0 annotations, Flickr-terms images — legal check before release, spec §9). The model folder carries a `NOTICE.md` with both.
- Git: Victor commits. "Checkpoint" = stop, list changed files and the suggested commit message; never run git write commands. Suggested branch: `feat/focus-v2-analyzer`.

## Review Focus

1. **v1 files keep working** in preview, export and the neighbour stage while their v2 is pending, and after it lands. → Task 7 tests.
2. **App in the background:** Core ML fails like Vision there; the analysis must end `interrupted` (left pending, redone on open), never `failed`. → Task 6.
3. **Grid gaps:** ball candidates are not repeated; motion scores stay aligned with their candidates after NMS and the grid. → Tasks 4 and 6.
4. **Orientation and tiles:** a portrait clip stored sideways (`.right`) gets its tiles cut in the upright picture, and boxes come back top-left. → Task 8 dump on one portrait and one landscape clip.
5. **Old sessions and unknown sports** → `livre` → players. Old clips: v1 files are re-queued once, outside a recording, and keep their v1 framing until v2 is written. → Tasks 7 and 9.
6. **Analysis time:** heavier than Vision (7 passes per sample at 1080p). The log line gives ms per clip; Part 1 task 2 decides if the defaults change. → Task 8.

---

## 3a — Engine

### Task 1: Bench reference for the native pieces

**Files:**
- Create: `docs/superpowers/spikes/focus-v2/bench/focusbench/motion.py`, `bench/focusbench/native_fixtures.py`
- Modify: `bench/run.py` (`native-fixtures` command), `bench/focusbench/detect.py` (expose `tile_plan`)
- Test: `bench/tests/test_motion.py`, `bench/tests/test_detect.py` (append)
- Output: `app/modules/replay-camera/ios/Core/Tests/ReplayCoreTests/Fixtures/v2/{motion,dfine-decode,tiles}.json`

**Interfaces:**
- `motion_score(prev, cur, nxt, x, y, r) -> float | None`: decision 5 on `uint8` grey frames of the same size; None when `prev` or `nxt` is None.
- `tile_plan(short_side: int, orientation: str, ball_led: bool) -> dict(decode_long_side, cols, rows)` (Global Constraints).
- `motion.json`: three synthetic 64×48 grey frames, 6 candidates (still, moving, at an edge, tiny r) and their scores. `dfine-decode.json`: the raw D-FINE outputs (logits 300×80, boxes 300×4) of `convert/tests/data/sample.jpg` full frame and of its 3×2 tiles, plus the decoded, merged sample (`people`, `balls`). `tiles.json`: the tile rects for 3×2, 2×3, 4×3 and 3×4.

- [x] **Step 1: Write the failing tests**: `test_motion_still_moving_edge` (a still patch scores < 1, a moving one > 4, an edge patch uses the reflected blur and clipped window), `test_motion_ends_are_none`, `test_tile_plan_table` (1080/1440/2160 × portrait/landscape × ball-led/players, as Global Constraints).
- [x] **Step 2:** Run `pytest bench/tests -v`. Expected: the new tests FAIL.
- [x] **Step 3:** Implement. Then re-run test D (`round2/meval.py` subset, 8 app clips, D-FINE-S) with `motion_score` at 1920 px instead of the round's 960 px: report "true ball kept / junk kept" at thresholds 3, 4, 6. If 4.0 no longer keeps ≥ 85% of the true ball, propose the new threshold (it becomes `BallFilterTuning.motionMin` and a fixture rebuild, Victor decides). Append to `TUNING.md`. *(Done 2026-10-26: at 4.0 the native score keeps 92% of the true ball and 32% of the junk (round: 91% / 31%); threshold unchanged. `dfine-decode.json` is 0.11 MB: logits stored above −3, the queries' boxes only.)*
- [x] **Step 4:** `python run.py native-fixtures`. Run the tests. Expected: PASS.
- [x] **Step 5: Checkpoint** — "bench(focus-v2): native motion score, tile plan and D-FINE decode fixtures".

### Task 2: D-FINE-S as an image-input Core ML model in the pod

**Files:**
- Modify: `docs/superpowers/spikes/focus-v2/convert/convert.py` (`--image-input`), `convert/tests/test_decode.py` (Core ML image input vs ONNX, macOS only), `convert/README.md`
- Create: `app/modules/replay-camera/ios/Models/FocusDetector.mlmodelc/` (compiled with `xcrun coremlcompiler compile`), `app/modules/replay-camera/ios/Models/NOTICE.md`
- Modify: `app/modules/replay-camera/ios/ReplayCamera.podspec` (`s.resource_bundles = { 'ReplayCameraModels' => ['Models/*.mlmodelc'] }`; `Models/NOTICE.md` excluded from the bundle)

- [x] **Step 1:** `convert.py dfine_s --image-input`: `ct.ImageType(name="images", shape=(1, 3, 640, 640), color_layout=RGB, scale=1/255)`, FP16, iOS16, outputs `output0`/`output1` unchanged.
- [x] **Step 2: Test** (macOS): the image-input model on `sample.jpg` (resized with PIL bilinear to 640×640) vs the ONNX model: the same people and ball boxes after `decode` (IoU ≥ 0.9, conf within 0.02). Run `FOCUS_V2_MODELS=… python -m pytest convert/tests -v`. Expected: PASS.
- [x] **Step 3:** Compile to `.mlmodelc`, copy into `Models/`, write `NOTICE.md` (D-FINE Apache-2.0 with the commit and weights SHA from `convert/README.md`; COCO attribution; "legal check before release").
- [x] **Step 4:** `cd app/ios && pod install` (a pod change only, no prebuild), then build the app in Xcode once. Expected: builds; `ReplayCameraModels.bundle` inside the app holds `FocusDetector.mlmodelc` (~20 MB).
*(2026-10-26: `convert.py --image-input`, the macOS test, `Models/NOTICE.md` and the podspec bundle are written; `convert/make-app-model.sh` runs steps 2–3 on a Mac (clone at the pinned commit, weights checked by SHA-256 and loaded with `weights_only=True` — the checkpoint only holds `OrderedDict` and tensor storages, so it loads). `convert.py` now loads YOLOX weights with `weights_only=True` too (HANDOFF rule); re-check if YOLOX is ever re-converted.)*

*(2026-10-26, Victor's Mac: parity PASSED (each side's detections at ≥ 0.3 found on the other at ≥ 0.25: an FP16 score near the cut is not a difference); `FocusDetector.mlmodelc` 20 MB. Core ML logs `ANECCompile() FAILED` on the Mac: the model runs on GPU/CPU there — see NEXT.md.)*

- [x] **Step 5: Checkpoint** — "feat(focus-v2): D-FINE-S Core ML model (image input) in the ReplayCamera pod".

### Task 3: `FocusDetection` (ReplayCore): decode, tiles, merge, tile plan

**Files:**
- Create: `app/modules/replay-camera/ios/Core/Sources/ReplayCore/FocusDetection.swift`
- Test: `.../Tests/ReplayCoreTests/FocusDetectionTests.swift`

**Interfaces:**
- `public struct Detection: Equatable { cls: Int; conf, x, y, w, h: Double }` (source-normalized, top-left).
- `public enum FocusDetection`:
  - `static let person = 0, ball = 32, peopleMin = 0.3, ballMin = 0.15, nmsIoU = 0.45, tileOverlap = 0.15`
  - `static func decodeDFine(logits: [Float], boxes: [Float], queries: Int = 300, classes: Int = 80) -> [Detection]` — port of `decode.decode('dfine_s')` for a stretched input (boxes already 0..1 of the input = 0..1 of the source or tile).
  - `static func tiles(cols: Int, rows: Int) -> [FocusRect]` — port of `_axis`.
  - `static func merge(full: [Detection], tiled: [(tile: FocusRect, dets: [Detection])]) -> [Detection]` — tile coords → frame coords, per-class NMS, highest confidence first (stable on ties, as Python).
  - `static func sample(_ dets: [Detection], width: Double, height: Double) -> (people: [FocusBox], balls: [BallCandidate])`.
  - `public struct TilePlan: Equatable { decodeLongSide: Int; cols: Int; rows: Int }`, `static func tilePlan(shortSide: Double, portrait: Bool, ballLed: Bool) -> TilePlan` and `static func needsTiles(firstSecondPeopleHeights: [Double], frameHeightAt640: Double) -> Bool` (players-framed rule).

- [x] **Step 1: Write the failing tests**: decode and merge reproduce `dfine-decode.json` (same detections, components within 1e-4); `tiles.json` within 1e-12; the tile plan table; NMS keeps the higher of two overlapping boxes and both of two classes.
- [x] **Step 2:** `swift test --filter FocusDetectionTests`. Expected: FAIL.
- [x] **Step 3:** Implement (sort with explicit index tie-breaks, as in `BallTracker`).
- [x] **Step 4:** Run. Expected: PASS.
- [x] **Step 5: Checkpoint** — "feat(replay-core): D-FINE decoding, tiles and merge".

### Task 4: `MotionScore` and the grid with ball candidates (ReplayCore)

**Files:**
- Create: `.../Sources/ReplayCore/MotionScore.swift`
- Modify: `.../Sources/ReplayCore/FocusGrid.swift` (add `ticks`)
- Test: `.../Tests/ReplayCoreTests/MotionScoreTests.swift`, `FocusGridTests.swift` (append)

**Interfaces:**
- `public struct LumaFrame { width, height: Int; bytes: [UInt8] }` (row-major, one byte per pixel).
- `public enum MotionScore { static func score(previous: LumaFrame?, current: LumaFrame, next: LumaFrame?, x: Double, y: Double, r: Double) -> Double? }` — decision 5; blur only over the patch plus one pixel, reflected at the frame edges (same values as a whole-frame blur).
- `FocusGrid.ticks(frameTimes: [Double], startMs:, endMs:, stepMs:) -> [(tMs: Double, frame: Int?)]` — the frame each tick uses: `frame` nil when the tick only repeats earlier people (a gap). `samples(from:…)` is rewritten on top of it, with the same output (existing tests guard it).

- [x] **Step 1: Write the failing tests**: `motion.json` within 1e-9 (scores) and nil where expected; the ticks of a clip with a gap (`frame` nil inside it), and `samples(from:)` unchanged on the v1 fixtures.
- [x] **Step 2:** Run `swift test --filter "MotionScoreTests|FocusGridTests"`. Expected: the new tests FAIL.
- [x] **Step 3:** Implement.
- [x] **Step 4:** Run the whole package. Expected: PASS. *(2026-10-26, Victor's Mac: whole package 233/233.)*
*(Added 2026-10-26 for Task 6: `LumaFrame.upright` turns the stored luma plane upright (EXIF 1/3/6/8), so motion is measured where the detections are.)*

- [x] **Step 5: Checkpoint** — "feat(replay-core): motion score and grid ticks for ball candidates".

### Task 5: `FocusDetector` (native)

**Files:**
- Create: `app/modules/replay-camera/ios/FocusDetector.swift`

**Interfaces:**
- `final class FocusDetector { static func shared() -> FocusDetector?` (loads `FocusDetector.mlmodelc` from `ReplayCameraModels.bundle` once, `MLModelConfiguration.computeUnits = .all`; nil when missing or failing, logged once) `; func detect(_ pixels: CVPixelBuffer, orientation: CGImagePropertyOrientation, tiles: [FocusRect]) throws -> [Detection]` }` — one `VNCoreMLRequest` (`imageCropAndScaleOption = .scaleFill`) per pass: the full frame, then each tile through `regionOfInterest` (the tile flipped to Vision's bottom-left origin, in the upright picture); reads `output0`/`output1` as `MLMultiArray` (Float16 or Float32), decodes with `FocusDetection.decodeDFine` and merges with `FocusDetection.merge`.

- [x] **Step 1:** Implement. No unit test (Core ML on device); Task 8 checks it against the bench.
*(2026-10-26: written; with no tiles the full frame goes straight to the sample rules, as the bench (a DETR needs no NMS). The resource bundle is looked up next to the code and in the app, since the pod is a static framework.)*

- [ ] **Step 2:** Build the app. Expected: builds with no warnings in the new file.
- [ ] **Step 3: Checkpoint** — "feat(focus-v2): Core ML detector with tiles".

### Task 6: `FocusAnalyzer` v2 and the module bridge

**Files:**
- Modify: `app/modules/replay-camera/ios/FocusAnalyzer.swift`, `ReplayCameraModule.swift` (`AnalyzeFocusOptions.sport`, result fields), `modules/replay-camera/src/ReplayCamera.types.ts` (`AnalyzeFocusOptions.sport?: string`, `FocusAnalysis.follow`, `ballShare`)

**Interfaces:**
- `analyze(clipPath:, startMs:, endMs:, sport: String, outPath:, debug:)`:
  1. `plan = FocusPolicy.plan(sport:, shortSidePx: min(W, H))`; tile plan from `FocusDetection.tilePlan` (players-framed: the first second decides tiling, as the bench).
  2. Decode with `AVAssetReaderTrackOutput` at the plan's long side (`kCVPixelBufferWidthKey`/`HeightKey` when the clip is larger), 420f. One frame per tick (as today).
  3. Per frame: `FocusDetector.detect` → `FocusDetection.sample`; the luma plane copied into a 3-frame ring; each frame's motion scores are computed once the next frame is in (`MotionScore.score`), the last one with `next: nil`.
  4. `FocusGrid.ticks` → samples (people repeat over gaps; balls and motion empty there).
  5. `FocusV2.rects(plan:…)` for the main aspect; when `follow == .ball`, also `FocusPath.compute(…, tuning: .players)` for `players`; the other aspect as v1 (`zoom: false`).
  6. File v2 (decision 4): `{ v: 2, stepMs, startMs, size, model: "dfine_s" | "vision", sport, follow, landscape, portrait, players?, ball? }`, rows rounded to 4 decimals; `debug` adds `samples` in the bench detections shape (`t`, `people` [x,y,w,h,c], `balls` [x,y,r,c], `motion`).
  7. `FocusDetector.shared()` nil → Vision people as today, `FocusV2` with `follow` forced to players, `model: "vision"` (decision 6).
  8. Failures: more than 10% of frames failing in Vision or Core ML → `interrupted` (as today).
- Result: `{ status, frames, framesWithPeople, meanPeople, elapsedMs, follow, ballShare }` (`ballShare`: share of samples `seen` or `predicted`).

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Build the app; analyse one saved clip with `debug: true` from the test screen (`src/app/spike.tsx`, which already passes `debug`). Expected: a v2 file with `samples`; the log line `[Repplay] focus v2 <clip> <ms> ms follow=<…>`.
- [ ] **Step 3: Checkpoint** — "feat(focus-v2): analyzer v2 (Core ML, motion, FocusV2, file v2)".

### Task 7: Readers, queue and re-analysis (TypeScript + native export)

**Files:**
- Modify: `app/src/data/focusFile.ts`, `app/src/data/schema.ts` (`ClipFocus.v: 1 | 2`), `app/src/focus/focusQueue.ts`, `app/src/focus/appFocusQueue.ts`, `app/modules/replay-camera/ios/ClipExporter.swift` (`FocusFile`: v 1 or 2)
- Test: `app/src/data/__tests__/focusFile.test.ts`, `app/src/focus/__tests__/focusQueue.test.ts`

**Interfaces:**
- `parseFocusFile(text, aspect, follow?: 'ball' | 'players')`: accepts v1 and v2; `follow === 'players'` on a v2 ball file reads `players` for the main aspect; anything else as today. `readFocusInfo(path) -> { v, follow, hasBall } | undefined` for the panel.
- Queue: `start` passes `sport` (`repo.getSession(clip.sessionId)` → `focusSport`, else `'livre'`; Task 9 adds the field; until then always `'livre'`) and stores `focus.v: 2`. `ensure(clip)` also re-queues a clip whose `focus.v === 1` (any status but `pending`), at the back of the queue, keeping `status`/`file` so v1 framing shows until v2 lands; never during a `openedOnly`/`all` hold beyond what holds allow today.
- `FocusFile.segments(path:, aspect:, follow:)` reads v1 or v2 with the same choice (`follow` default `"default"`).

- [ ] **Step 1: Write the failing tests**: v2 parse (default rows, `players` rows, a v2 players-only file asked for `players` gives the default rows); v1 still parses; `ensure` re-queues a v1 `ready` clip once, keeps its file until the new result, and a v2 clip is not re-queued; `start` passes `sport: 'livre'` for a session without `focusSport`.
- [ ] **Step 2:** `npx jest src/data src/focus`. Expected: FAIL.
- [ ] **Step 3:** Implement (no `?.`).
- [ ] **Step 4:** Run `npx jest` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Checkpoint** — "feat(focus-v2): file v2 readers and v1 re-analysis".

### Task 8: Device check against the bench (Victor's phone, then the bench)

**Files:**
- Create: `docs/superpowers/spikes/focus-v2/bench/focusbench/device.py` (reads a v2 debug file as a detections file), `bench/run.py` (`device-compare` command)
- Modify: `docs/superpowers/spikes/focus-v2/TUNING.md` (results)

- [ ] **Step 1 (phone):** with `debug: true`, analyse `basket-v-corner-unavailable-01` (portrait), one landscape app clip and one of the 2026-10-26 field clips (beach tennis or society); copy the three `.focus.json` files out (AirDrop/Files).
- [ ] **Step 2 (bench):** `python run.py device-compare <file> <clip>`: people per sample and ball candidates vs the ONNX bench on the same clip (match = IoU ≥ 0.5 / centre within 0.01), and the rects the bench computes from the device samples vs the device rects (must match within 1e-4: same ReplayCore logic). Expected: ≥ 90% of bench people and ≥ 80% of bench ball candidates found on the device; the rects match.
- [ ] **Step 3:** Record time per clip (`elapsedMs`) for each phone used, next to Part 1 task 2's open items in `NEXT.md`.
- [ ] **Step 4: Checkpoint** — "bench(focus-v2): device analyzer vs bench".

## 3b — Screens

### Task 9: The sport of a recording

**Files:**
- Create: `app/src/focus/sports.ts` (`FocusSportId`, the §13.6 list, labels by key)
- Modify: `app/src/data/schema.ts` (`Session.focusSport?: FocusSportId`, `Prefs.focusSport?: FocusSportId`), session creation (`app/src/data/repo.ts`, where `Session` is built at start), `app/src/app/setup.tsx` (row `Esporte` + picker sheet), `app/locales/pt-BR.json`, `app/locales/en.json`, `app/src/focus/focusQueue.ts` (read it)
- Test: `app/src/focus/__tests__/sports.test.ts`, setup screen test (append to its suite in `src/app/__tests__`)

- [ ] **Step 1: Write the failing tests**: the list matches §13.6 (ids, order, `livre` first and default); an unknown stored id reads as `livre`; starting a session copies `Prefs.focusSport` (or `livre`) into `Session.focusSport`; the setup row shows the label and saves the choice.
- [ ] **Step 2:** `npx jest`. Expected: FAIL.
- [ ] **Step 3:** Implement. Copy (§13.6): row `Esporte` / `Sport`; options `Livre`, `Tênis`, `Vôlei`, `Vôlei de praia`, `Beach tennis`, `Basquete`, `Tênis de mesa`, `Futebol / society` (en: `Free play`, `Tennis`, `Volleyball`, `Beach volleyball`, `Beach tennis`, `Basketball`, `Table tennis`, `Football`).
- [ ] **Step 4:** Run `npx jest`, `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Checkpoint** — "feat(focus-v2): sport picker on the setup screen".

### Task 10: `Seguir: Jogadores | Bola` in the Foco panel

**Files:**
- Modify: `app/src/data/schema.ts` (`Clip.edit.focusFollow?: 'ball' | 'players'`), `app/src/clip/panels/FocusPanel.tsx`, `app/src/clip/tools.tsx` (`ToolContext.follow`, `setFollow`, `hasBall`), `app/src/app/clip/[id].tsx` (read the chosen rows), `app/src/clip/NeighbourStage.tsx`, `app/src/share/exportOptions.ts` and `clipExport.ts` (`focus.follow`), `modules/replay-camera/src/ReplayCamera.types.ts` (`focus.follow`), `ReplayCameraModule.swift` / `ClipExporter.swift` (pass it to `FocusFile.segments`), locales
- Test: `FocusPanel` test, `exportOptions` test (append)

- [ ] **Step 1: Write the failing tests**: the control shows only when the file has a ball track; picking `Jogadores` stores `edit.focusFollow = 'players'` and the preview/export read `players`; a clip without a ball track never shows it; the export of a free plan still leaves without Modo Foco (unchanged).
- [ ] **Step 2:** `npx jest`. Expected: FAIL.
- [ ] **Step 3:** Implement. Copy: `Seguir` · `Jogadores` · `Bola` (en: `Follow` · `Players` · `Ball`).
- [ ] **Step 4:** Run `npx jest`, `npx tsc --noEmit`; build the app. Expected: PASS, builds.
- [ ] **Step 5: Checkpoint** — "feat(focus-v2): follow the players or the ball in the Foco panel".

### Task 11: End-to-end check on the phone

- [ ] **Step 1:** Record a short session with `Tênis` (any ball game will do) and one with `Livre`; open a clip of each: `livre` frames the players (no `Seguir`), `tenis` follows the ball and shows `Seguir`; switch to `Jogadores` and back; export both (Pro or `HIGH_RES_EXPORT_OPEN`).
- [ ] **Step 2:** Open a clip analysed by v1 before this build: it shows its old framing, is re-analysed once (outside a recording), and then shows the v2 framing.
- [ ] **Step 3:** Start an analysis and send the app to the background: the clip stays `preparando` and finishes when reopened.
- [ ] **Step 4: Checkpoint** — notes in `NEXT.md`; "docs(focus-v2): Part 3 device check".
