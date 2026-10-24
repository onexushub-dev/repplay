# Apple Watch (Plano 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A small Apple Watch app that shows the recording (time and clip count) and has one big "Salvar clipe" button; tapping it saves a clip on the iPhone and the watch vibrates when the clip is confirmed. The watch can also show a live low-resolution view of the phone's camera, so the player can check the framing from the court without walking back to the phone.

**Architecture:** The watch is a remote control, not a second camera. A watchOS app (SwiftUI) talks to the iPhone over WatchConnectivity. The phone side lives in the existing `replay-camera` Expo module (`WatchBridge.swift`) and turns a watch tap into the existing `onTrigger({ source: 'watch' })` event, so the trigger bus (3 s debounce), saving, sound/flash and the clip list work unchanged. JS pushes the recording state to the watch and tells it when a save succeeded or failed. Pure message encoding lives in `ios/Core` (SwiftPM, `swift test`). Wear OS is **not** in this plan (it ships with the Android device stage).

**Tech Stack:** watchOS 27 SDK (Xcode 27.1), SwiftUI, WatchConnectivity, `@bacons/apple-targets` 5.0.0 (generates the watch target from `app/targets/watch/` on prebuild), Expo Module (Swift), existing Jest + SwiftPM tests.

**Spec:** `docs/superpowers/specs/2026-10-17-lance-design.md` — 3.6 Relógio, 4.2 (`onTrigger` from the watch), 4.4 (trigger bus), "Ordem de entrega" item 5.

## Global Constraints

- **Watch screen (spec 3.6):** one screen only: elapsed time + clip count + one big button. Vibration when a clip is confirmed. The camera view (Task 6) is a toggle on that same screen, off by default.
- **Camera view on the watch:** JPEG frames about 240 px on the long side at 3 fps, sent only while the watch asks for them (view on and watch screen awake). It never touches the recording buffer: it reads the frames the capture already produces and drops any frame that arrives while the previous one is still encoding.
- **Copy (pt-BR, exact):** button `Salvar clipe`; idle `Comece a gravar no iPhone`; unreachable `Sem conexão com o iPhone`; count `1 clipe` / `N clipes`; setup tile title `Relógio`, statuses `Sem relógio pareado` · `Instale o app no relógio` · `Pronto`.
- **Terminology:** "gravação" and "clipe" (never "jogo"/"lance") in all new text.
- **Trigger source:** `'watch'` (already in `TriggerSource`, labelled `Relógio` in `SOURCE_LABEL`).
- **Haptics:** `.success` only when the clip count goes **up**; `.failure` on a failed save; nothing on undo.
- **Identifiers:** watch bundle id `app.lance.mobile.watch`, team `2J67Z98LDX` (Personal Team; the watch app installs from the iPhone's Watch app, not from `devicectl`).
- **Touch target:** the save button fills the width and is at least 80 pt tall.
- **Process:** TDD where there is logic (Core, JS); the SwiftUI view is verified by a simulator build and the device check. Ledger at `.superpowers/sdd/2026-10-19-apple-watch/progress.md`. Commits end with the attribution line given in the session reminder. No dev server: Release builds as before.

## Review Focus

1. **Watch tap while the phone is not recording** → no clip, no crash; the watch already shows the idle screen. → Task 3 test `a watch tap outside a recording is ignored`.
2. **Phone app killed or out of range** → the watch shows `Sem conexão com o iPhone`, the button is disabled, and it recovers by itself when the phone is reachable. → Task 5 (view model state) + device check.
3. **Two taps within 3 s** → one clip (bus debounce), one vibration. → Task 4 test `a second watch tap inside the debounce gives one save and one haptic`.
4. **Undo on the phone** → the count goes down on the watch without a vibration. → Task 4 test.
5. **Recording stops (or the phone shows a thermal stop)** → the watch goes back to idle, never keeps counting a finished recording. → Task 4 test `stopping sends an idle state`.
6. **Camera view left on** → the watch stops asking when its screen sleeps or the view is closed, and the phone stops encoding frames within 2 s; the recording buffer and saves are unaffected (no dropped segments). → Task 6 test `frames stop when the watch stops asking` + device check.
7. **No watch paired / watch app not installed** → the Relógio tile says so; nothing else on the setup screen changes. → Task 7 tests.

---

### Task 1: Watch target builds and ships inside the iPhone app

**Files:**
- Modify: `app/package.json` (add `@bacons/apple-targets@5.0.0`), `app/app.json` (plugin entry)
- Create: `app/targets/watch/expo-target.config.js` (type `watch`, name `LANCE Watch`, bundle id `app.lance.mobile.watch`, deployment target watchOS 11), `app/targets/watch/App.swift` (SwiftUI `@main` that shows `Text("LANCE")`), `app/targets/watch/Info.plist` only if the plugin needs it

**Interfaces:**
- Produces: a watch target inside `app/ios/LANCE.xcodeproj` that survives `npx expo prebuild --platform ios --clean`, embedded in the Release iPhone build.

- [ ] **Step 1:** `npm install @bacons/apple-targets@5.0.0 --save-exact`; add the plugin; write the target files above.
- [ ] **Step 2:** `npx expo prebuild --platform ios --clean`, then `cd ios && pod install`.
- [ ] **Step 3: Verify** the watch app builds for the simulator: `xcodebuild -workspace LANCE.xcworkspace -scheme "LANCE Watch" -destination 'generic/platform=watchOS Simulator' build` → `BUILD SUCCEEDED`.
- [ ] **Step 4: Verify** it ships with the phone app: the Release device build (command in the memory notes) → `BUILD SUCCEEDED` and `build-device/Build/Products/Release-iphoneos/LANCE.app/Watch/` contains `LANCE Watch.app`. If the plugin does not support Xcode 27 / SDK 58, stop and record a ledger Ruling with the smallest alternative (a hand-edited target scripted in `app/plugins/withWatchTarget.js`).
- [ ] **Step 5: Commit** `chore(ios): add the Apple Watch target`

---

### Task 2: Watch message protocol (pure, tested)

**Files:**
- Create: `app/modules/replay-camera/ios/Core/Sources/ReplayCore/WatchMessage.swift`, `.../Tests/ReplayCoreTests/WatchMessageTests.swift`

**Interfaces:**
```swift
public enum WatchMessage: Equatable {
  case save                                              // watch → phone
  case state(recording: Bool, clipCount: Int, startedAt: Double?) // phone → watch (startedAt: ms since 1970)
  case result(saved: Bool)                               // phone → watch
  public var payload: [String: Any] { get }              // WCSession-friendly dictionary
  public static func decode(_ payload: [String: Any]) -> WatchMessage?  // nil for anything unknown or malformed
}
```
Keys are the single source of truth: `cmd = "save"`; `recording`, `clipCount`, `startedAt`; `result = "saved" | "failed"`. The watch target repeats the same five string keys in `WatchLink.swift` (Task 5); a unit test in this task pins the keys so both sides are changed together.

- [ ] **Step 1: Write the failing tests:** round trip for each case; `decode` returns nil for `[:]`, an unknown `cmd`, a `clipCount` that is not an Int, and a negative `clipCount`; `state` with `startedAt` nil omits the key; the key names are exactly the ones above.
- [ ] **Step 2:** `cd app/modules/replay-camera/ios/Core && swift test` → FAIL → implement → PASS (all previous 38 tests still pass).
- [ ] **Step 3: Commit** `feat(ios): watch message protocol`

---

### Task 3: iPhone side bridge → `onTrigger('watch')` and watch status

**Files:**
- Create: `app/modules/replay-camera/ios/WatchBridge.swift` (`WCSession` delegate: activate, `status`, send `state`/`result`, receive `save`)
- Modify: `app/modules/replay-camera/ios/ReplayCameraModule.swift` (events `onWatchStatus`; functions `getWatchStatus() -> "unsupported" | "notInstalled" | "ready"`, `watchSync(recording:clipCount:startedAt:)`, `watchSignal(saved:)`), `app/modules/replay-camera/src/ReplayCamera.ts` + `ReplayCamera.types.ts` (`WatchStatus` type, the three functions, `onWatchStatus` event), `app/modules/replay-camera/src/__mocks__` if the repo has one

**Interfaces:**
- Consumes: `WatchMessage` (Task 2).
- Produces (JS): `getWatchStatus(): WatchStatus`, `watchSync(s: { recording: boolean; clipCount: number; startedAt?: number }): void`, `watchSignal(saved: boolean): void`, event `onWatchStatus: (e: { status: WatchStatus }) => void`. A watch `save` message emits `onTrigger({ source: 'watch', at: now })`.

- [ ] **Step 1:** implement the bridge: use `sendMessage` when `isReachable`, else `updateApplicationContext` for `state` (so a late-opening watch still reads the latest state); `result` only via `sendMessage` (a vibration for an old save is noise). `status`: `unsupported` when `WCSession.isSupported()` is false or `isPaired` is false; `notInstalled` when `isWatchAppInstalled` is false; else `ready`. Emit `onWatchStatus` on activation and on `sessionWatchStateDidChange`.
- [ ] **Step 2:** JS wrappers; no JS test beyond types here (covered through Tasks 4 and 6).
- [ ] **Step 3: Verify** the iOS side compiles: `xcodebuild … build` (simulator or device) → `BUILD SUCCEEDED`; `swift test` still green.
- [ ] **Step 4: Commit** `feat(ios): WatchConnectivity bridge in the camera module`

---

### Task 4: Session pushes state to the watch and ignores stray taps

**Files:**
- Modify: `app/src/session/useReplaySession.ts` (`SessionDeps.camera` gains `watchSync`, `watchSignal`), `app/src/session/SessionContext.tsx` (already passes the whole module), `app/src/session/__tests__/useReplaySession.test.tsx` (fake camera gets the two functions)

**Behavior:** `watchSync` is called with `{ recording: true, clipCount, startedAt }` at start and after every saved clip and undo; with `{ recording: false, clipCount: 0 }` on stop, on a thermal/native stop and on `release`. `watchSignal(true)` after a saved clip, `watchSignal(false)` on a failed save; none on undo. A `watch` trigger that arrives when no recording is running is dropped by the existing phase guard.

- [ ] **Step 1: Write the failing tests:** `starting a recording tells the watch`; `a saved clip syncs the new count and signals success`; `a failed save signals failure and leaves the count`; `a second watch tap inside the debounce gives one save and one haptic` (Review 3); `undo syncs the lower count without a signal` (Review 4); `stopping sends an idle state` (Review 5); `a watch tap outside a recording is ignored` (Review 1: no `saveClip` call).
- [ ] **Step 2:** `npx jest src/session` → FAIL → implement → PASS (`npx jest`, `npx tsc --noEmit`, `npx expo lint`).
- [ ] **Step 3: Commit** `feat(app): the recording state reaches the Apple Watch`

---

### Task 5: The watch app

**Files:**
- Create/replace in `app/targets/watch/`: `WatchLink.swift` (`WCSessionDelegate`, `ObservableObject` with `state`, `reachable`, `sendSave()`), `WatchModel.swift` (pure view model: `enum Screen { idle, recording(count, startedAt), offline }` from `(recording, reachable)`; `shouldBuzz(oldCount:newCount:) -> Bool`), `ContentView.swift`, `App.swift`
- Create: `app/targets/watch/Tests/` only if the target supports a test bundle; otherwise `WatchModel.swift` is mirrored into a SwiftPM test in `ios/Core` (ruling in the ledger)

**Screen:** top: elapsed time (`TimelineView(.periodic)`, `mm:ss`/`h:mm:ss`) and `N clipes`; the rest: a full-width accent button `Salvar clipe` (≥ 80 pt) that calls `sendSave()` and gives immediate light haptic `.click`; the confirmation `.success` / `.failure` comes from the phone (`result`) or from the count rising. Idle shows `Comece a gravar no iPhone` (no button); offline shows `Sem conexão com o iPhone` with the button disabled. Colors from the app tokens (ground `#0B0B09`, accent lime).

- [ ] **Step 1: Write the failing tests** (`WatchModel`): `idle when not recording`; `offline when recording but the phone is not reachable`; `recording with count and start`; `buzz only when the count goes up` (`0→1` true, `2→1` false, `2→2` false).
- [ ] **Step 2:** FAIL → implement → PASS; build `LANCE Watch` for the watch simulator → `BUILD SUCCEEDED`.
- [ ] **Step 3:** run it on the watch simulator once and look at the three screens (state injected by a `#Preview` per screen). Record in the ledger what was seen.
- [ ] **Step 4: Commit** `feat(watch): the Apple Watch app`

---

### Task 6: Live camera view on the watch

**Files:**
- Modify: `ios/Core/.../WatchMessage.swift` (+ tests): add `case preview(on: Bool)` (watch → phone, key `preview`) and `case frame` carried as `Data` through `sendMessageData` (not a dictionary message)
- Create: `app/modules/replay-camera/ios/WatchPreview.swift` (throttle to 3 fps, downscale to ≤240 px long side, JPEG quality 0.5, busy flag so frames never queue); modify `CaptureController.swift` (forward each sample buffer to `WatchPreview.offer(_:)` only while enabled), `WatchBridge.swift` (`preview` message toggles it; send frames with `sendMessageData`, drop when not reachable)
- Modify: `app/targets/watch/ContentView.swift`, `WatchLink.swift`, `WatchModel.swift` (a camera button toggles the view; the view fits the watch screen with the phone's orientation, button and count stay visible beneath; auto-off when the watch screen sleeps or the app leaves the foreground)

**Interfaces:** `WatchModel.previewWanted(viewOn: Bool, reachable: Bool, recording: Bool) -> Bool` (pure); `WatchPreview.shouldEncode(now:last:busy:) -> Bool` in Core (pure: false while busy or under 1/3 s since the last frame).

- [ ] **Step 1: Write the failing tests:** Core `preview message round trip`; `shouldEncode` false while busy / under 333 ms, true otherwise; `WatchModel.previewWanted` true only when the view is on, reachable and recording.
- [ ] **Step 2:** FAIL → implement → PASS; Release build for device and `LANCE Watch` simulator build → `BUILD SUCCEEDED`.
- [ ] **Step 3: Check on the device** (part of Task 8): frames arrive in under ~1 s of latency, the clip saved while the view is on is identical in length to one saved with it off, and the phone does not get noticeably hotter in a 5 min recording with the view on. If the heat or the drop of segments is visible, lower to 2 fps / 200 px and record a Ruling.
- [ ] **Step 4: Commit** `feat(watch): live camera view to check the framing`

---

### Task 7: Setup tile "Relógio" shows the real status

**Files:**
- Modify: `app/src/app/setup.tsx` (the `Relógio` tile reads `getWatchStatus()` and subscribes to `onWatchStatus`), `app/src/app/__tests__/setup.test.tsx` (mock gets `getWatchStatus`, `addReplayListener`)

**Behavior:** `unsupported` → status `Sem relógio pareado`, tile dim; `notInstalled` → `Instale o app no relógio`; `ready` → `Pronto`, active. The summary row's icons gain a watch icon, lit only when `ready`. The tile is informational (no press).

- [ ] **Step 1: Write the failing tests:** one per status (the tile's accessibility label `Relógio, <status>`); `a status change event updates the tile`; `without a watch the other triggers behave as before` (Review 6).
- [ ] **Step 2:** FAIL → implement → PASS; `npx tsc --noEmit`, lint.
- [ ] **Step 3: Commit** `feat(app): Relógio tile shows the watch status`

---

### Task 8: Device check with the real watch

**Files:** Modify `docs/superpowers/field-test-etapa0.md` (status line)

- [ ] **Step 1:** `pod install`, Release build, `devicectl` install on the iPhone (commands in the memory notes). The watch app appears in the iPhone's Watch app under "Disponíveis"; install it from there (watch charged and on the wrist, Developer Mode on, both on Wi-Fi/Bluetooth).
- [ ] **Step 2: Check, in order:** setup tile says `Instale o app no relógio` before installing and `Pronto` after → start a recording → the watch shows time and `0 clipes` → open the camera view on the watch and move the phone: the framing follows within a second; close it → tap `Salvar clipe` → the iPhone shows the saved overlay (sound/flash as set), the watch vibrates and shows `1 clipe`, the clip's source reads `Relógio` → tap twice fast → one clip, one vibration → undo on the phone → `0 clipes`, no vibration → close the app on the phone → the watch shows `Sem conexão com o iPhone` → end the recording → the watch returns to `Comece a gravar no iPhone`.
- [ ] **Step 3:** Record the result in the status line and **Commit** `docs: Plan 5 verified on iPhone and Apple Watch`.
