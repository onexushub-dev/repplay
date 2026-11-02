# Modo Foco (auto-framing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every saved clip is analysed in the background and opens in the editor framed on the play (pan + up to 1.5x zoom), with a "Modo Foco" chip to turn it off; downloads and shares carry the same framing with the app mark still bottom-right.

**Architecture:** A native `FocusAnalyzer` reads the clip at 10 fps, finds people with Apple Vision and hands them to `FocusPath` (pure Swift in `ReplayCore`), which writes keyframes (crop rects every 100 ms, one track per aspect) to `<clip>.focus.json`. JS keeps a status on the clip, queues analyses one at a time, previews the framing by driving `ZoomableVideo`'s transform from the player's time, and passes the file to `exportClip`, where `ClipExporter` turns keyframes into `setTransformRamp`s under the unchanged overlay layer.

**Tech Stack:** Swift (SwiftPM `ReplayCore`, Vision, AVFoundation), Expo Module `ReplayCamera`, expo-router, expo-video, react-native-reanimated 4, Jest + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-10-23-focus-mode-design.md` (§n = spec section).

## Global Constraints

- iPhone only. On Android/web the module functions are missing: `analyzeFocus` absent ⇒ clips get no `focus`, no chip, exports unchanged.
- Capture stays 1080p. Max zoom **1.5**. Keyframe step **100 ms** (analysis at 10 fps). Analysis frames scaled to **960 px** on the long side. Vision boxes kept at confidence **≥ 0.3**.
- `FocusTuning.standard` (spec §4.2, verbatim): far filter **0.4** × median height of the **10** tallest; still filter: **80%** of samples within **±3 s** with a box within **1.2%** of frame width (bottom-centre); motion weight `1 + min(moved / 0.01·width, 4)`; spread = weighted **10th–90th** percentile of x; Gaussian σ **0.5 s** (x), **0.8 s** (y), **1.2 s** (size); max pan **35%** of width per second; width = clamp(spread × **1.3** + **0.15**, 1/maxZoom, 1); rect centre **10%** of its height above the players' centre; `none` when fewer than **20%** of samples have anyone.
- Focus file: `<clip path without extension>.focus.json`, `{ "v": 1, "stepMs": 100, "startMs": number, "landscape": number[][], "portrait": number[][] }`, rows `[x, y, width, height]` (0..1, origin top-left, display orientation), 4 decimals.
- Data: `Clip.focus?: { v: 1; status: 'pending' | 'ready' | 'none' | 'failed'; file?: string }`; `Clip.edit.focus?: boolean` (absent = on); `Prefs.focusIntroSeen?: boolean`.
- Copy (pt-BR, exact): chip `Modo Foco`; analysing `Modo Foco · preparando`; intro caption `Modo Foco: a câmera acompanha o lance`; accessibility label `Modo Foco`. Never the bare "Modo Foco" outside the app.
- Modo Foco and manual zoom never apply together. `rotation ≠ 0` ⇒ no Modo Foco (preview and export).
- The overlay (bands, gradient, mark) path in `ClipExporter` is not changed.
- Plans: Modo Foco works in the app on every plan; only paid exports carry it (spec §9). No entitlement check in this plan.
- Code style: no optional chaining (`?.`) in new TypeScript; explicit checks. Follow existing patterns (`thumbnailPath`, `readEdit`, `ZoomMath`, `FitRect`).
- Process: TDD for Core and JS. `swift test` (in `app/modules/replay-camera/ios/Core`) and `npx jest` (in `app`) run on Victor's Mac: the executor writes test and code, then asks Victor to run the command and paste the result. **Never run git write commands**: each "Commit checkpoint" only proposes a message. New Swift files under `ios/` need `cd app/ios && pod install` before building. Device steps are run by Victor.

## Review Focus

- A clip trimmed outside the analysed range (old clips analysed over the whole file, or a cut at the very ends) must hold the nearest keyframe, never jump to (0,0) or throw: Task 1 (`FocusRamp`) and Task 7 (`framingAt`) tests.
- A clip deleted while its analysis is queued or running must not come back or leave a `.focus.json` behind: Task 5 (`removeFile`) and Task 6 (queue) tests.
- A missing, truncated or old-version focus file must mean "whole video", in the editor and in the export, without a crash: Task 5 (`readFocusFile`) and Task 3 (exporter falls back) tests.
- The app killed mid-analysis leaves `status: 'pending'` with nothing running; opening the clip must queue it again: Task 6 test.
- An export at 2x or 0.5x must keep the framing in step with the picture (times mapped to composition time): Task 1 (`FocusRamp`) test.

---

### Task 1: Core — `FocusPath`, `FocusTuning`, `FocusRamp`

**Files:**
- Create: `app/modules/replay-camera/ios/Core/Sources/ReplayCore/FocusPath.swift`
- Create: `app/modules/replay-camera/ios/Core/Sources/ReplayCore/FocusRamp.swift`
- Create: `app/modules/replay-camera/ios/Core/Tests/ReplayCoreTests/FocusPathTests.swift`, `FocusRampTests.swift`
- Create: `app/modules/replay-camera/ios/Core/Tests/ReplayCoreTests/Fixtures/` (copy the 6 JSON files from `docs/superpowers/spikes/focus-mode/`)
- Modify: `app/modules/replay-camera/ios/Core/Package.swift` (test target `resources: [.copy("Fixtures")]`)

**Interfaces:**
- Produces:
  - `public struct FocusBox { x, y, width, height: Double }` (0..1, top-left origin)
  - `public struct FocusSample { tMs: Double; boxes: [FocusBox] }`
  - `public struct FocusRect: Equatable { x, y, width, height: Double }`
  - `public enum FocusAspect { case landscape, portrait }` (16:9 / 9:16 in pixels)
  - `public struct FocusTuning { …all spec constants…; public static let standard: FocusTuning }`
  - `public enum FocusPath { static func compute(samples: [FocusSample], videoWidth: Double, videoHeight: Double, aspect: FocusAspect, zoom: Bool, maxZoom: Double = 1.5, tuning: FocusTuning = .standard) -> [FocusRect]? }` — one rect per sample; `nil` = `none`; `zoom: false` = the largest rect of that aspect, moved by the same centre (the "other" track).
  - `public struct FocusSegment { fromSec, toSec: Double; from, to: FocusRect }`
  - `public enum FocusRamp { static func segments(rects: [FocusRect], startMs: Double, stepMs: Double, cutStartMs: Double, cutEndMs: Double, speed: Double) -> [FocusSegment] }` — composition times `(t − cutStartMs) / speed`; the first and last segment end exactly on the cut, interpolating; outside the analysed range the nearest rect is held.

- [ ] **Step 1: Write failing tests** (fixture loader converts the spike JSON: pixels → 0..1, frame index `i` → `tMs = i / 30 * 1000`, people only)
  - `testRectsStayInsideFrame` — every fixture, both aspects: `x ≥ 0, y ≥ 0, x+width ≤ 1, y+height ≤ 1`.
  - `testZoomNeverAboveMax` — matching aspect: `width ≥ 1/1.5 - 1e-9` (the file name prefix says which: `landscape-*` → landscape track, `portrait-*` → portrait track).
  - `testPanSpeedLimited` — consecutive centres differ by `≤ 0.35 × 0.1 + 1e-6` (fraction of width per 100 ms).
  - `testPixelAspect` — `width × videoWidth / (height × videoHeight)` = 16/9 (landscape) or 9/16 (portrait) within 1e-6.
  - `testStandSpectatorsIgnored` — `landscape-basketball-stream`, landscape track: mean centre x `< 0.6` (the stands on the right pulled it to ~0.7 in the spike before the filter).
  - `testNoPeopleIsNone` — 50 samples with no boxes → `nil`; 50 samples with people in only 9 → `nil`; in 10 → not nil.
  - `testStillScene` — one box standing still for 10 s plus one moving: output centre follows the moving one (the still one is filtered).
  - `testOtherTrackIsFullSize` — `zoom: false`, landscape video, portrait aspect: `height == 1`.
  - `FocusRampTests`: `testSpeedTwoHalvesTimes` (cut 1000–3000 ms at 2x ends at 1.0 s), `testCutInsideStepInterpolates` (cut starts at 150 ms between rects at 100/200 ms → first `from` is the midpoint), `testOutsideRangeHolds` (cut before `startMs` → first rect held), `testSingleRect` (one rect → one constant segment over the cut).
- [ ] **Step 2: Ask Victor to run `swift test` — expect compile failures.**
- [ ] **Step 3: Implement `FocusPath` and `FocusRamp`** with the rules of spec §4.2 in order (far → still → weights → per-sample target → fill gaps → Gaussian with look-ahead → pan limit → size → placement → clamp). Gaussian with `mode: nearest` edges, kernel radius 3σ. Vertical centre: weighted mean of box centres y.
- [ ] **Step 4: Ask Victor to run `swift test` — all pass.**
- [ ] **Step 5: Commit checkpoint:** `feat(focus): FocusPath and FocusRamp in ReplayCore`

### Task 2: Native analysis — `FocusAnalyzer` and `analyzeFocus`

**Files:**
- Create: `app/modules/replay-camera/ios/FocusAnalyzer.swift`
- Modify: `app/modules/replay-camera/ios/ReplayCameraModule.swift` (records + functions)
- Modify: `app/modules/replay-camera/src/ReplayCamera.types.ts`, `ReplayCameraModule.ts`, `ReplayCamera.ts`, `index.ts` exports

**Interfaces:**
- Consumes: Task 1 `FocusPath.compute`.
- Produces (TS):
  - `type AnalyzeFocusOptions = { clipPath: string; startMs: number; endMs: number; outPath: string; debug?: boolean }`
  - `type FocusAnalysis = { status: 'ready' | 'none'; frames: number; framesWithPeople: number; meanPeople: number; elapsedMs: number }`
  - `analyzeFocus(opts): Promise<FocusAnalysis>` (rejects on read errors), `cancelFocus(clipPath: string): void`, `isFocusSupported(): boolean` (false when the native function is missing).
  - With `debug: true` the file also has `"samples": [[tMs, [[x,y,w,h], …]], …]` (for the test screen).

- [ ] **Step 1:** `FocusAnalyzer.analyze(...) async throws -> FocusAnalysis`: `AVAssetReader` + `AVAssetReaderTrackOutput` (BGRA) over `startMs…endMs`, keep the first frame at or after each 100 ms tick, `VNImageRequestHandler(cvPixelBuffer:orientation:)` with the orientation from `preferredTransform` (reuse the mapping `DeviceUpright` / `ClipThumbnail` use), `VNDetectHumanRectanglesRequest` with `upperBodyOnly = false`, boxes ≥ 0.3 converted to top-left origin. Scale: let Vision handle the 1080p buffer, `regionOfInterest` full; if Task 4 shows it is slow, scale to 960 px with `vImage`.
- [ ] **Step 2:** Run both tracks: matching aspect from the display size (`zoom: true`), the other with `zoom: false`; write the JSON (Global Constraints format) atomically (temp file + move). `nil` from `FocusPath` ⇒ status `none`, file with empty tracks.
- [ ] **Step 3:** Serial `OperationQueue` (`qualityOfService = .utility`, max 1), cancellation by `clipPath` (checked between frames; a cancelled run deletes its temp file and rejects with `"cancelled"`).
- [ ] **Step 4:** Module `AsyncFunction("analyzeFocus")`, `Function("cancelFocus")`; TS wrappers following `findContentStart`'s optional pattern (no `?.` in new code).
- [ ] **Step 5:** Victor builds (`pod install`, Xcode) — no tests here; exercised by Task 4.
- [ ] **Step 6: Commit checkpoint:** `feat(focus): native FocusAnalyzer with Vision`

### Task 3: Export with the framing

**Files:**
- Modify: `app/modules/replay-camera/ios/ClipExporter.swift`, `ReplayCameraModule.swift`
- Modify: `app/modules/replay-camera/src/ReplayCamera.types.ts` (`ExportClipOptions.focus?: { path: string; aspect: 'landscape' | 'portrait' }`)

**Interfaces:**
- Consumes: Task 1 `FocusRamp.segments`; focus file format.
- Produces: `exportClip` honours `focus` (ignored when `crop` is set); unreadable file / wrong `v` / empty track ⇒ export as without `focus` (and log).

- [ ] **Step 1:** Extract today's crop placement into `placement(for crop: CGRect?) -> CGAffineTransform` (pure refactor; an export without focus must be byte-for-byte the same composition setup).
- [ ] **Step 2:** With `focus`: read the file, pick the track, `FocusRamp.segments(…, cutStartMs: startMs, cutEndMs: endMs, speed:)`, and for each segment `layer.setTransformRamp(fromStart: placement(from), toEnd: placement(to), timeRange:)`. Overlay code untouched.
- [ ] **Step 3:** Victor builds; exercised by Task 4 (mark position, smoothness, time).
- [ ] **Step 4: Commit checkpoint:** `feat(focus): export follows the focus path`

### Task 4: Test screen and device go/no-go (spec step 0)

**Files:**
- Create: `app/src/app/focus-test/[id].tsx` (temporary)
- Modify: `app/src/app/clip/[id].tsx` — a temporary text button "Testar Modo Foco" in the side column, behind `const FOCUS_TEST = true` at the top of the file.

**Interfaces:**
- Consumes: Tasks 2–3 module functions; `repo.getClip`.

- [ ] **Step 1:** Screen with: **Analisar** (calls `analyzeFocus({ …, debug: true })` on the clip's `bounds` or whole file, shows `elapsedMs`, `frames`, `framesWithPeople`, `meanPeople`, keeps the last 3 runs); **Ver** (plays the clip with the debug boxes and the track's rect drawn over it by player time, like the spike review videos); **Exportar com Modo Foco** (export at 1080 with the normal overlay, saves to Photos, shows the export time); **Enviar resultado** (share sheet with the focus JSON).
- [ ] **Step 2:** Victor runs tests A–D from the conversation's step list on the XR and the 16 Pro Max and sends the numbers, the JSON and the clips.
- [ ] **Step 3: Gate.** Go if: XR analyses a 30 s clip in ≤ ~30 s; export ≤ 2× today's and no crash; mark bottom-right in every frame; Vision finds the players the spike found (compare JSON to fixtures). Otherwise apply the spec §6 fallbacks (5 fps, 960 px, thin keyframes) inside Tasks 1–3 and repeat. Record results in the spec as §11 "Step 0 results".
- [ ] **Step 4: Commit checkpoint:** `chore(focus): temporary test screen`

### Task 5: JS data — schema, edit, file helpers, cleanup

**Files:**
- Modify: `app/src/data/schema.ts`, `app/src/data/repo.ts` (`updateClip` patch accepts `focus`), `app/src/data/mmkv.ts` (`removeFile` also removes the focus file), `app/src/share/editing.ts` (`Edit.focus`, `readEdit`)
- Create: `app/src/data/focusFile.ts`
- Test: `app/src/data/__tests__/focusFile.test.ts`, `repo.test.ts`, `app/src/share/__tests__/editing.test.ts`

**Interfaces:**
- Produces:
  - `focusPath(clipPath: string): string` (`/a/b.mp4` → `/a/b.focus.json`)
  - `type FocusTrack = { startMs: number; stepMs: number; rects: [number, number, number, number][] }`
  - `readFocusFile(path: string, aspect: 'landscape' | 'portrait'): FocusTrack | undefined` (missing, invalid JSON, `v !== 1`, empty track ⇒ `undefined`)
  - `readEdit(...).focus: boolean` (absent ⇒ `true`)

- [ ] **Step 1: Failing tests:** `focusPath` mapping; `readFocusFile` returns the track for a valid file and `undefined` for missing / `"{"` / `v: 2` / empty rows; `readEdit(undefined).focus === true`, `readEdit({ muted: false, focus: false }).focus === false`; `updateClip(id, { focus: { v: 1, status: 'ready', file } })` stores it and returns `undefined` for a deleted id; `removeFile(path)` also deletes `focusPath(path)`.
- [ ] **Step 2: Victor runs `npx jest src/data src/share` — fail.**
- [ ] **Step 3: Implement** (file reads with `expo-file-system` `File`, as `mmkv.ts` does).
- [ ] **Step 4: Victor runs the same — pass.**
- [ ] **Step 5: Commit checkpoint:** `feat(focus): clip focus status, edit flag and focus file helpers`

### Task 6: `FocusQueue` — after save and on editor open

**Files:**
- Create: `app/src/focus/focusQueue.ts`
- Modify: `app/src/session/useReplaySession.ts` (enqueue after `repo.addClip`), `app/src/app/_layout.tsx` (create the queue with real deps, provide via the existing session context or a module singleton like the repo)
- Test: `app/src/focus/__tests__/focusQueue.test.ts`, `app/src/session/__tests__/useReplaySession.test.tsx`

**Interfaces:**
- Consumes: Task 2 `analyzeFocus`/`cancelFocus`/`isFocusSupported`; Task 5 `focusPath`, `repo.updateClip`.
- Produces: `createFocusQueue(deps: { analyze, cancel, supported: () => boolean, repo, recording: () => boolean, thermal: () => ThermalLevel, onThermalChange: (cb) => () => void }) => { enqueue(clipId: string): void; cancel(clipId: string): void; ensure(clip: Clip): void }`. `ensure` enqueues when `focus` is absent, or `pending` and not in the queue/running.

- [ ] **Step 1: Failing tests:** runs one at a time in order; marks `pending` on enqueue, `ready`/`none` with `file` on success, `failed` on reject (not on `"cancelled"`); skips a clip deleted before its turn and calls `cancel` + leaves no record for one deleted while running; waits while `recording() && thermal ∈ {serious, critical}` and resumes on the thermal event dropping; `ensure` re-queues a stale `pending`; `supported() === false` ⇒ nothing happens. Hook test: a save enqueues the new clip id.
- [ ] **Step 2–4:** fail → implement → pass (`npx jest src/focus src/session`).
- [ ] **Step 5:** Deleting a clip/game (`clip/[id].tsx`, `session/[id].tsx`, `games.tsx`) calls `queue.cancel(id)` before `removeFile`.
- [ ] **Step 6: Commit checkpoint:** `feat(focus): background analysis queue`

### Task 7: Preview framing and export options

**Files:**
- Create: `app/src/focus/framing.ts`, `app/src/focus/useFocusFraming.ts`
- Modify: `app/src/share/ZoomableVideo.tsx` (optional `follow?: SharedValue<Zoom>`: when set, the inner box is an `Animated.View` whose transform reads it; pinch still works and calls `onCommit`), `app/src/share/exportOptions.ts`
- Test: `app/src/focus/__tests__/framing.test.ts`, `app/src/share/__tests__/exportOptions.test.ts`

**Interfaces:**
- Consumes: Task 5 `FocusTrack`, `readEdit`.
- Produces:
  - `framingAt(track: FocusTrack, tMs: number): Zoom` — linear between the two nearest rows, held outside; `scale = 1 / width`, `cx = x + width/2`, `cy = y + height/2`.
  - `useFocusFraming(player, track: FocusTrack | undefined, enabled: boolean): SharedValue<Zoom> | undefined` — on each `timeUpdate` (already every 0.1 s) animate to `framingAt(track, (currentTime + 0.1) * 1000)` with `withTiming(100, linear)`; on seek / pause set it at once; `undefined` when disabled or no track.
  - `exportOptions(tier, edit, trim, landscape, focus?: { path: string; ready: boolean })` adds `focus: { path, aspect }` only when `readEdit(edit).focus && ready && rotation === 0 && !(zoom && zoom.scale > 1)`.

- [ ] **Step 1: Failing tests:** `framingAt` at a row, between rows (midpoint), before `startMs`, after the last row, single row; `exportOptions` includes `focus` only in the allowed case (cases: off, not ready, rotated, manual zoom, landscape → `aspect: 'landscape'`, portrait → `'portrait'`).
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5: Commit checkpoint:** `feat(focus): framing from the path for preview and export`

### Task 8: Editor — chip, states, pinch hand-over, intro

**Files:**
- Create: `app/src/components/FocusChip.tsx`, `app/src/components/__tests__/FocusChip.test.tsx`
- Modify: `app/src/app/clip/[id].tsx`, `app/src/data/schema.ts` (`Prefs.focusIntroSeen`), `app/src/share/ZoomableVideo.tsx` + `useZoomGesture.ts` (hold, if kept), `app/src/app/__tests__/clip.test.tsx`

**Interfaces:**
- Consumes: Tasks 5–7.
- Produces: `FocusChip({ state: 'preparing' | 'on' | 'off', onToggle })`; hidden states render nothing (decided in the screen).

- [ ] **Step 1: Failing tests** (clip screen, module mocked as in existing tests):
  - `ready` + no `edit.focus` ⇒ chip "Modo Foco" with `accessibilityRole="switch"` checked; tapping stores `edit.focus = false` and the chip is unchecked.
  - `pending` ⇒ "Modo Foco · preparando"; `none`, `failed`, `rotation: 90`, Android (unsupported) ⇒ no chip.
  - Opening a clip with no `focus` calls `queue.ensure`.
  - A pinch commit while on stores the zoom and `edit.focus = false`; turning the chip on clears `edit.zoom`.
  - Share/download pass `focus` to `exportClip` when on (via `exportOptions`).
  - First framed clip: intro caption shown once, `focusIntroSeen` set; with reduce motion the caption shows without the animation (`useReduceMotion`).
  - Hold on the video while on: the whole video shows while held, the framing comes back on release (only if Step 3's check keeps the long press; otherwise drop this test).
- [ ] **Step 2: Victor runs `npx jest src/app src/components` — fail.**
- [ ] **Step 3: Implement:** chip in the left slot of `sideRow` (and the full-screen top row) next to the manual zoom badge; `ZoomableVideo` gets `follow` from `useFocusFraming` when on; pinch hand-over starts the manual zoom from the current `follow` value (no jump); when status turns `ready` while the screen is open, ease in over 400 ms; intro: start from `NO_ZOOM` and ease into the framing over 700 ms, caption for 3 s. Hold: check `useZoomGesture` first; if a long press (≥ 300 ms, no movement) does not conflict with tap, pinch or swipe, add `onHold(down: boolean)` to `ZoomableVideo` and show `NO_ZOOM` while down; if it conflicts, skip it and add a backlog line. Remount keys must not reset the follow value on every time update.
- [ ] **Step 4: Victor runs the same — pass.**
- [ ] **Step 5: Commit checkpoint:** `feat(focus): Modo Foco in the clip editor`

### Task 9: Remove the test screen, field test

**Files:**
- Delete: `app/src/app/focus-test/[id].tsx`; Modify: `app/src/app/clip/[id].tsx` (drop `FOCUS_TEST` and its button); Modify: `docs/superpowers/backlog.md` (anything deferred).

- [ ] **Step 1:** Remove the test screen and button; `npx jest` all green (Victor).
- [ ] **Step 2:** Victor runs the spec §8 field checklist on both phones; tune `FocusTuning` from the notes (Core tests stay green).
- [ ] **Step 3:** Spec status line → "implemented and field-tested (date)"; deferred items to the backlog.
- [ ] **Step 4: Commit checkpoint:** `chore(focus): drop test screen after field test`
