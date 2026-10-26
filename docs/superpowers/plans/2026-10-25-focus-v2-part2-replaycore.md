# Modo Foco v2 — Part 2: ReplayCore (ball filters, tracker, ball-led path, sport policy) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the bench's validated Modo Foco v2 logic to ReplayCore (pure Swift, `swift test`): ball candidate filters, the ball tracker, the ball-led path with the smoothed camera, the zoom-tuned players path, and the sport → framing policy.

**Architecture:** The bench (`docs/superpowers/spikes/focus-v2/bench/`) stays the reference. Task 1 freezes its final logic (the ball-led path with Gaussian camera, the filters, the policy) and exports 4 fixtures with inputs and expected outputs. Tasks 2–6 add one ReplayCore file each, each proven against those fixtures within 1e-4. Nothing here touches the app's UI or the native analyzer (Part 3).

**Tech Stack:** Swift 5.9 (ReplayCore SwiftPM package, XCTest), Python 3.9+ bench (pytest).

**Spec:** `docs/superpowers/specs/2026-10-24-focus-ball-tracking-design.md`, §4.2–4.3 and **§13** (amendment 2026-10-25, wins where they disagree). Bench evidence: `docs/superpowers/spikes/focus-v2/TUNING.md`.

**Plans after this one:** Part 3 — native analyzer v2 (detector + WASB/TrackNetV3 on device, motion score, tiling per resolution, file v2, sport picker and `Seguir` control); Part 4 — capture 4K (Pro), 2K/4K export, economy switch; Part 5 — vertical from landscape. Part 3 waits for Part 1 task 2 (device timing).

## Global Constraints

- Coordinates: normalized 0..1, origin top-left, display orientation. Distances in "frame widths": y differences multiplied by `H / W`.
- Grid: one sample per 100 ms tick (`FocusGrid`).
- Players path (spec decision 12): v1 rules with `spreadScale 1.1`, `spreadMargin 0.10`, `sigmaXMs 800`; every other v1 value unchanged. Max zoom = `max(1, min(3, shortSidePx / 720))` (decision 4).
- Ball candidate filters (§13.3): motion ≥ 4.0 vs previous and next sample (min of both); feet zone = bottom 15% of a person box → drop; body (inside a box, above the feet) → keep only conf ≥ 0.3; static filter `static_radius 0.02`, `static_share 0.5`, window ±2000 ms.
- Tracker values (bench `TRACKER_TUNING`): `start_hits 3`, `start_window_ms 500`, `predict_max_ms 700`, `held_max_ms 3000`, `accel_std 3.0`, `meas_std 0.006`, `gate_base 0.08`, `gate_growth 0.05`, `gate_new 0.35`, `static_track_radius 0.015`, still person `0.012` / `0.8` / `3000 ms`.
- Ball-led target (bench `TUNING_V2`): `ball_weight_x 0.7`, `ball_weight_y 0.3`, `near_players 2`, `lookahead_max_s 0.5`, `lookahead_full_speed 1.0`, `lead_s 0.5`, `lead_max 0.15`, `sigma_lead_ms 300`, `size_lookahead_s 0.8`, `spread_scale 1.3`, `spread_margin 0.15`, `sigma_size_ms 1200`, `sigma_x_ms 200`, `sigma_y_ms 800`; camera (decision 13): no dead zone, no speed/acceleration limits; Gaussian σ 600 ms on the placed rect's centre x, centre y, width and height, then clamped inside the video.
- Volleyball zoom cap 1.5 (decision 14); tennis uses the resolution cap.
- Sports and what they follow: spec §13.6 table, verbatim ids.
- Swift: no new dependencies; ReplayCore stays Foundation-only. Docs and names in English.
- Git: Victor commits. "Checkpoint" = stop, list changed files and the suggested commit message; never run git write commands.

## Review Focus

1. **Ball-led sport with no ball track at all** (WASB silent, e.g. a far camera): must fall back to the players path, exactly, not a frozen crop. → test in Task 5.
2. **A clip that starts or ends in `held`/`lost`**: the Gaussian camera must not drag the first/last crops off the play (edge samples are held, as v1's `gaussian` does). → test in Task 5.
3. **Candidates without a motion score** (WASB/TrackNetV3 sources, or the first/last sample): the motion rule must not drop them. → test in Task 2.
4. **Landscape vs portrait clips**: `hw = H / W` differs (0.5625 vs 1.778); a port that measures in raw y units passes portrait fixtures and fails landscape ones. Fixtures include both. → Task 1 fixture set.
5. **An unknown or old sport id** (`quadra`, `academia`, anything saved before 2026-10-25): policy gives players, never a crash. → test in Task 6.

---

### Task 1: Freeze the bench reference and export fixtures

**Files:**
- Create: `docs/superpowers/spikes/focus-v2/bench/focusbench/filters.py`, `bench/focusbench/policy.py`, `bench/focusbench/fixtures.py`
- Modify: `bench/focusbench/path_v2.py` (add `ball_rects`, `smooth_rects`, `TUNING_PLAYERS`), `bench/run.py` (`fixtures` command)
- Test: `bench/tests/test_filters.py`, `bench/tests/test_policy.py`, `bench/tests/test_path_v2.py` (append)
- Output: `app/modules/replay-camera/ios/Core/Tests/ReplayCoreTests/Fixtures/v2/{basket-v-corner-normal-01,basket-v-corner-unavailable-01,tennis-02,volley-01}.json`

**Interfaces:**
- Produces (Python):
  - `filter_balls(sample: dict, motion: list[float | None] | None, t: dict = FILTER_TUNING) -> list[Ball]` — §13.3 rules 1–3 (rule 4 stays in the tracker's static filter with the values above).
  - `ball_rects(samples, track, W, H, aspect, max_zoom, tuning=None) -> list[Rect] | None` — `v2_rects` steps 1–4 and size, camera = target (no controller), `place`, then `smooth_rects(rects, 600, step)`; all rows `lost` → `v1_rects(..., TUNING_PLAYERS)`.
  - `smooth_rects(rects, sigma_ms, step_ms) -> list[Rect]` — Gaussian (v1's edge-held kernel) on centre x, centre y, w, h; then `x = clamp(cx - w/2, 0, 1 - w)`, same for y.
  - `TUNING_PLAYERS = dict(TUNING_V1, spreadScale=1.1, spreadMargin=0.10, sigmaXMs=800.0)`.
  - `policy(sport: str, short_side_px: int) -> dict(follow='ball'|'players', ball_source='wasb_tennis'|'detector'|None, max_zoom=float)`.
  - Fixture file: `{ "clip", "sport", "W", "H", "stepMs": 100, "startMs", "maxZoom", "samples": [{"t", "people": [[x,y,w,h,c]], "balls": [[x,y,r,c]], "motion": [m|null] | null}], "filtered": [[[x,y,r,c]]], "track": [[x,y,state,conf]], "rects": [[x,y,w,h]], "follow": "ball"|"players" }`. Sources: the two basketball clips from `bench-out/det/<clip>.yolox_s.json` (players; `track`/`filtered` empty lists), `tennis-02` from `refs4k/balls/tennis-02-wasb-2160-g2.json` + people from `refs4k/det4k/tennis-02-2160.dfine_s.json` (ball candidates with `r = 0.004`, `motion: null`), `volley-01` from `refs4k/det4k/volley-01-2160.dfine_s.json` with its motion scores (ball, cap 1.5).
- `python run.py fixtures` writes the 4 files; `focusbench/fixtures.py` holds the builder.

- [ ] **Step 1: Write the failing tests**
  - `test_feet_zone_is_dropped`: person box (0.4, 0.2, 0.1, 0.4); ball at y = 0.2 + 0.4 × 0.9 → dropped; at 0.2 + 0.4 × 0.5 with conf 0.35 → kept, conf 0.25 → dropped; outside any box, conf 0.16 → kept.
  - `test_motion_rule_and_missing_scores`: motion `[3.9, 4.0, None]` → only the 2nd and 3rd stay; `motion=None` (whole list) → none dropped by motion. *(Review Focus 3.)*
  - `test_policy_table`: `("tenis", 2160)` → `ball, wasb_tennis, 3.0`; `("volei", 2160)` → `ball, detector, 1.5`; `("voleiPraia", 1080)` → `ball, detector, 1.5`; `("basquete", 1080)` → `players, None, 1.5`; `("quadra", 2160)` and `("xyz", 2160)` → `players, None, 3.0`. *(Review Focus 5.)*
  - `test_ball_rects_without_track_equal_players_path`: all rows `lost` → `ball_rects == v1_rects(..., TUNING_PLAYERS)` on a spike fixture. *(Review Focus 1.)*
  - `test_smooth_rects_holds_edges_and_stays_inside`: 40 rects of width 0.4, x 0 for samples 0–19 and 0.6 for 20–39 (step 100 ms, σ 600 ms) → first rect x within 1e-9 of 0, last within 1e-9 of 0.6, all rects inside [0,1].
- [ ] **Step 2:** Run `pytest bench/tests -v`. Expected: the new tests FAIL, the rest PASS.
- [ ] **Step 3:** Implement `filters.py`, `policy.py`, `ball_rects`/`smooth_rects`/`TUNING_PLAYERS` (lift the motion/feet logic from the round's scratch script into `filter_balls`). Set `TRACKER_TUNING` `static_radius 0.02`, `static_share 0.5` (the round's values), so the fixtures' `track` and the Swift defaults agree; re-run `test_tracker.py`.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then re-run the round's numbers with the frozen code: `tennis-02` ball-led at 3× ball in crop ≥ 95%, `volley-01` at 1.5× ≥ 95%; append the two lines to `TUNING.md`.
- [ ] **Step 5:** `python run.py fixtures` writes the 4 files (each < 2 MB; round to 6 decimals).
- [ ] **Step 6: Checkpoint** — "bench(focus-v2): frozen ball-led path, filters, policy; ReplayCore v2 fixtures".

### Task 2: `BallFilter`

**Files:**
- Create: `app/modules/replay-camera/ios/Core/Sources/ReplayCore/BallFilter.swift`
- Test: `app/modules/replay-camera/ios/Core/Tests/ReplayCoreTests/BallFilterTests.swift`, `.../FocusV2Fixture.swift` (fixture loader shared by Tasks 2–6)

**Interfaces:**
- Consumes: `FocusBox` (FocusPath.swift).
- Produces:
  - `public struct BallCandidate: Equatable { x, y, r, conf: Double }`
  - `public struct BallFilterTuning { motionMin = 4.0, feetShare = 0.15, bodyConfMin = 0.3; static let standard }`
  - `public enum BallFilter { static func apply(_ c: [BallCandidate], people: [FocusBox], motion: [Double?]?, tuning: BallFilterTuning = .standard) -> [BallCandidate] }`
  - Test helper `FocusV2Fixture.load(_ name: String) -> FocusV2Fixture` (decodes the Task 1 JSON with `Decodable`; `Bundle.module`).

- [ ] **Step 1: Write the failing tests** — the Task 1 `test_feet_zone_is_dropped` and `test_motion_rule_and_missing_scores` cases in XCTest, plus `testMatchesBenchOnVolleyFixture`: for every sample of `volley-01.json`, `apply(balls, people, motion)` equals `filtered[i]` (same count, components within 1e-9).
- [ ] **Step 2:** `cd app/modules/replay-camera/ios/Core && swift test --filter BallFilterTests`. Expected: FAIL (no `BallFilter`).
- [ ] **Step 3:** Implement `BallFilter.apply`; a person box test is inclusive on all edges (as the bench).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Checkpoint** — "feat(replay-core): ball candidate filters".

### Task 3: `BallTracker`

**Files:**
- Create: `.../Sources/ReplayCore/BallTracker.swift`
- Test: `.../Tests/ReplayCoreTests/BallTrackerTests.swift`

**Interfaces:**
- Consumes: `BallCandidate` (Task 2), `FocusBox`.
- Produces:
  - `public enum BallState: Int { case seen = 0, predicted, held, lost }`
  - `public struct BallRow: Equatable { x, y: Double; state: BallState; conf: Double }`
  - `public struct BallTrackerTuning` with the Global Constraints tracker values plus `staticRadius 0.02`, `staticShare 0.5`, `staticWindowMs 2000`; `static let standard`.
  - `public enum BallTracker { static func track(times: [Double], balls: [[BallCandidate]], people: [[FocusBox]], heightOverWidth hw: Double, tuning: BallTrackerTuning = .standard) -> [BallRow] }` — port of `tracker.track_ball` (static filter → greedy most-confident-first association with growing gate → forward Kalman → RTS smoothing per confirmed, moving track → main track per sample → predicted/held/lost).

- [ ] **Step 1: Write the failing tests**
  - The 7 synthetic cases of Part 1 Task 6 (`parabola`, `straight pass`, `static dropped`, `0.5 s gap predicted`, `1.5 s gap held by the nearest moving player`, `4 s lost`, `moving beats static`), same inputs and assertions.
  - `testMatchesBenchOnTennisAndVolley`: for `tennis-02.json` and `volley-01.json`, `track(...)` equals `track` rows: same states everywhere, x and y within 1e-4.
- [ ] **Step 2:** Run `swift test --filter BallTrackerTests`. Expected: FAIL.
- [ ] **Step 3:** Implement. The 4×4 Kalman matrices as fixed-size arrays with small helpers (multiply, transpose, 2×2 inverse); same operation order as the numpy code so the fixtures match.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Checkpoint** — "feat(replay-core): ball tracker".

### Task 4: Players path tuning preset

**Files:**
- Modify: `.../Sources/ReplayCore/FocusPath.swift` (add `FocusTuning.players`; `compute` unchanged)
- Test: `.../Tests/ReplayCoreTests/FocusPathTests.swift` (append)

**Interfaces:**
- Produces: `public static let players: FocusTuning` = `.standard` with `spreadScale 1.1`, `spreadMargin 0.10`, `sigmaXMs 800`; `public static func maxZoom(shortSidePx: Double) -> Double` on `FocusPath` (= `max(1, min(3, shortSidePx / 720))`).

- [ ] **Step 1: Write the failing tests** `testPlayersPresetMatchesBench` (both basketball fixtures: `compute(..., aspect: clip's, zoom: true, maxZoom: fixture.maxZoom, tuning: .players)` equals `rects` within 1e-6) and `testMaxZoomByResolution` (`1080 → 1.5`, `1440 → 2`, `2160 → 3`, `607 → 1`, `1215 → 1215/720`).
- [ ] **Step 2:** Run `swift test --filter FocusPathTests`. Expected: the new tests FAIL; existing v1 tests PASS.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS (old and new).
- [ ] **Step 5: Checkpoint** — "feat(replay-core): players framing preset and resolution zoom cap".

### Task 5: Ball-led path

**Files:**
- Create: `.../Sources/ReplayCore/FocusBallPath.swift`
- Test: `.../Tests/ReplayCoreTests/FocusBallPathTests.swift`

**Interfaces:**
- Consumes: `FocusSample`, `FocusRect`, `FocusAspect`, `FocusTuning.players`, `FocusPath.compute` (fallback), `BallRow` (Task 3).
- Produces:
  - `public struct FocusBallTuning` with the Global Constraints ball-led target values and `cameraSigmaMs 600`; `static let standard`.
  - `public enum FocusBallPath { static func compute(samples: [FocusSample], track: [BallRow], videoWidth: Double, videoHeight: Double, aspect: FocusAspect, maxZoom: Double, tuning: FocusBallTuning = .standard) -> [FocusRect]? }` — v1 people filters (far, still), subject per row (ball for seen/predicted, the row's position for held, v1's weighted players' centre for lost), target x/y with the 2 nearest players, look-ahead, smoothed lead, size with the 0.8 s look-ahead window and v1's clamp/smoothing, v1 placement (lift 0.1), then Gaussian σ 600 ms on the rects and clamping. All rows `lost` → `FocusPath.compute(..., zoom: true, maxZoom:, tuning: .players)`.

- [ ] **Step 1: Write the failing tests**
  - `testMatchesBenchOnTennisAndVolley`: with each fixture's own `track` (not the Swift tracker, so a tracker drift does not hide here), `compute` equals `rects` within 1e-4.
  - `testNoTrackFallsBackToPlayers`: `tennis-02` samples with every row `.lost` → equals `FocusPath.compute(..., tuning: .players)` exactly. *(Review Focus 1.)*
  - `testEdgesHeldAndInside`: synthetic 10 s clip, two moving players near x 0.3 for the first 3 s and near x 0.7 for the last 3 s; track `held` at (0.3, 0.5) for the first 3 s, `lost` for the last 3 s → the first rect's centre x within 1e-6 of the rect computed for sample 0 without smoothing, the last within 1e-6 of the last unsmoothed one (edge-held kernel), every rect inside [0,1]. *(Review Focus 2.)*
  - `testZoomCapRespected`: every width ≥ `1 / maxZoom` for `maxZoom` 1.5 and 3 on `volley-01`.
- [ ] **Step 2:** Run `swift test --filter FocusBallPathTests`. Expected: FAIL.
- [ ] **Step 3:** Implement; reuse `FocusPath.gaussian`, `fill`, `median` (make them `internal` helpers shared in the module if they are `private` today).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Checkpoint** — "feat(replay-core): ball-led framing path".

### Task 6: Sport policy and the end-to-end check

**Files:**
- Create: `.../Sources/ReplayCore/FocusPolicy.swift`
- Test: `.../Tests/ReplayCoreTests/FocusPolicyTests.swift`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces:
  - `public enum FocusFollow: String { case ball, players }`, `public enum BallSource: String { case wasbTennis, detector }`
  - `public struct FocusPlan: Equatable { follow: FocusFollow; ballSource: BallSource?; maxZoom: Double }`
  - `public enum FocusPolicy { static func plan(sport: String, shortSidePx: Double) -> FocusPlan }` — spec §13.6: `tenis` → ball, `wasbTennis`, resolution cap; `volei`, `voleiPraia` → ball, `detector`, `min(1.5, cap)`; everything else (including `livre`, `quadra`, unknown) → players, nil, resolution cap.
  - `public enum FocusV2 { static func rects(plan: FocusPlan, samples: [FocusSample], balls: [[BallCandidate]], motion: [[Double?]]?, videoWidth: Double, videoHeight: Double, aspect: FocusAspect) -> (rects: [FocusRect]?, track: [BallRow]) }` — the one entry point Part 3 calls: players → `FocusPath.compute(..., .players)` and an empty track; ball → `BallFilter` (only for `.detector`) → `BallTracker` → `FocusBallPath`.

- [ ] **Step 1: Write the failing tests**
  - `testPolicyTable`: the Task 1 `test_policy_table` cases. *(Review Focus 5.)*
  - `testEndToEndOnAllFixtures`: for each of the 4 fixtures, `FocusV2.rects(plan: FocusPolicy.plan(sport:, shortSidePx: min(W, H)), ...)` gives `rects` within 1e-4 and, for ball sports, `track` states equal.
- [ ] **Step 2:** Run `swift test --filter FocusPolicyTests`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the whole package: `swift test`. Expected: all PASS (the existing suites included).
- [ ] **Step 5: Checkpoint** — "feat(replay-core): sport framing policy and FocusV2 entry point".
