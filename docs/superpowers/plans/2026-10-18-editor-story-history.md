# Editor, Story Export, Game History (Plano 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player can name a finished game, browse past games ("Meus jogos"), edit a lance (cut, slow motion, sound) and post it as a 9:16 Story with template bands, or save/share it.

**Architecture:** Pure TypeScript decides everything that can be decided without media (trim limits, Story layout, template texts, export options) and is unit-tested. One new native function, `exportClip`, renders the final MP4 on each platform (AVFoundation composition on iOS, Media3 Transformer on Android) from a source clip, a time range, a speed, a mute flag and a full-frame PNG overlay that carries the template bands. The overlay is drawn in React Native and captured to PNG, so templates are plain components. A second native function opens Instagram's Story composer with the exported video.

**Tech Stack:** Expo SDK 58, Expo Router, `react-native-gesture-handler` + `react-native-reanimated` (trim handles), `react-native-view-shot` (overlay PNG), `expo-media-library` (save to Photos), `expo-sharing` (system share sheet), AVFoundation (`AVMutableComposition`, `AVMutableVideoComposition`, `AVVideoCompositionCoreAnimationTool`), AndroidX Media3 Transformer + Effect.

**Spec:** `docs/superpowers/specs/2026-10-17-lance-design.md` (3.7, 3.8, 3.9, 4.2 `exportClip`, 4.5). Design decision (2026-10-18, Marcus): the Story keeps the **whole horizontal video visible in the middle** with **template bands above and below** (no cropping).

## Global Constraints

- **Out of scope:** paywall and free-tier limits (Plan 4). Until then `useEntitlement()` returns `{ tier: 'pro' }`: exports are 1080×1920, no watermark, slow motion available. The watermark code path exists and is tested, but is only switched on by Plan 4.
- **Story frame:** 1080×1920 (Pro) or 720×1280 (free, Plan 4). Video scaled to fit the frame width, vertically centred; bands = the space above and below it.
- **Trim limits:** window inside `[0, durationMs]`, length between **3 s** and **60 s**. Default stays the last 30 s (Plan 2).
- **Slow motion:** 0.5× speed of the trimmed range (60 fps source → smooth 30 fps); audio is dropped when slow motion is on.
- **Exports** go to `<caches>/exports/<clipId>-<timestamp>.mp4` and are deleted when the Story screen unmounts, unless the user saved them to Photos (Photos keeps its own copy).
- **Game names:** optional, max 40 characters, trimmed; empty = no name. Default label everywhere: `<Esporte> · DD/MM, HH:MM`.
- **"Meus jogos"** lists only games with at least one existing clip, newest first.
- **Instagram:** needs a Meta App ID in `app.json` → `expo.extra.metaAppId`. While it is empty (or Instagram isn't installed), "Postar no Story" opens the system share sheet instead. Copy for that case: `Instagram não encontrado. Escolha onde compartilhar.`
- All copy in pt-BR exactly as written in each task. Tokens, fonts and components from Plan 2. Touch targets ≥ 44 pt.
- New native source files → `pod install` in `app/ios` before building. Device builds: Release, team `2J67Z98LDX`, `xcrun devicectl` install.
- Before using any Expo/third-party API, read its current docs (app `AGENTS.md` rule) and ledger the exact API used.

## Review Focus

1. **Trim handles dragged past each other or past the ends** → window clamps to `[0, duration]`, never shorter than 3 s or longer than 60 s. → Task 3 `clampTrim` tests.
2. **Export started twice** (double tap on "Postar no Story") → one export; the second tap is ignored while one runs. → Task 9 `ignores a second post while exporting`.
3. **Export fails** (disk full, codec error) → message `Não foi possível preparar o vídeo. Tente de novo.`, buttons usable again, no partial file left. → Task 9 test + native cleanup.
4. **Clip deleted from another screen while its editor is open** → editor shows `Este lance não está mais no celular.` instead of crashing. → Task 7 test.
5. **Game renamed to blank / very long text** → blank clears the name, text is cut at 40 characters. → Task 1 `renameSession` tests.

---

### Task 1: Data — game names, game list, clip edits

**Files:**
- Modify: `app/src/data/schema.ts`, `app/src/data/repo.ts`, `app/src/data/__tests__/repo.test.ts`

**Interfaces (produced):**
- `Session.name?: string`; `Clip.edit?: { slowmo: boolean; muted: boolean }` (absent = both false)
- `repo.renameSession(id: string, name: string): Session` — trims, cuts to 40 chars, blank removes the name; notifies subscribers.
- `repo.listSessions(): { session: Session; clips: number; firstClip?: Clip }[]` — only sessions with ≥ 1 existing clip, newest `startedAt` first.
- `repo.updateClip(id: string, patch: { trim?: Clip['trim']; edit?: Clip['edit'] }): Clip` — notifies subscribers.
- `sessionLabel(session: Session, now?: number): string` in `app/src/components/format.ts` — `name` or `<Esporte> · DD/MM, HH:MM` (uses `SPORT_LABEL`).

- [ ] **Step 1: Write the failing tests:** `renameSession trims and stores the name`; `a blank name removes it`; `names are cut at 40 characters`; `listSessions skips games without clips and lists newest first`; `updateClip stores the new trim and edit`; `sessionLabel uses the name, else sport and date`.
- [ ] **Step 2:** `npx jest src/data src/components` → FAIL.
- [ ] **Step 3:** Implement. `listSessions` needs an index: keep `lance:v1:sessions` (array of ids) updated in `startSession`.
- [ ] **Step 4:** `npx jest` → PASS.
- [ ] **Step 5: Commit** `feat(app): game names, game list and clip edits in the repository`

---

### Task 2: Name the game on "Fim de jogo"; "Meus jogos"

**Files:**
- Modify: `app/src/app/session/[id].tsx`, `app/src/app/__tests__/session.test.tsx`, `app/src/app/setup.tsx`, `app/src/app/__tests__/setup.test.tsx`
- Create: `app/src/app/games.tsx`, `app/src/app/__tests__/games.test.tsx`, `app/src/components/GameCard.tsx`

**Copy:** summary title = `sessionLabel` when named, else `FIM DE JOGO`; name field placeholder = default label, accessibility label `Nome do jogo`, caption under it `Opcional. Ajuda a achar o jogo depois.`; setup top-left button `Meus jogos` (only while idle); games screen title `MEUS JOGOS`, card line 2 `<N> lance(s) · <recordedLabel>`, empty state `Nenhum jogo com lances ainda.`; back button `Voltar`.

- [ ] **Step 1: Write the failing tests:**
  - summary: `typing a name and submitting renames the game` (`renameSession('s1', 'Final do torneio')`); `a named game shows its name as the title`.
  - games: `lists games with their label and lance count`; `tapping a game opens its summary` (`router.push('/session/s1')`); `empty state`.
  - setup: `Meus jogos opens the game list` (`router.push('/games')`), hidden while `phase === 'recording'`.
- [ ] **Step 2:** `npx jest src/app` → FAIL.
- [ ] **Step 3:** Implement. The name field is a single-line `TextInput` (`returnKeyType="done"`, `maxLength={40}`), saved on submit and on blur. `GameCard` reuses `useClipThumbnail(firstClip.path, firstClip.trim.startMs)`. The games list re-reads with `useSyncExternalStore(repo.subscribe, repo.version)` like the summary.
- [ ] **Step 4:** `npx jest` → PASS; `npx tsc --noEmit`, `npx expo lint` clean.
- [ ] **Step 5: Commit** `feat(app): name a game after it ends and browse past games`

---

### Task 3: Pure editing and Story logic

**Files:**
- Create: `app/src/story/trim.ts`, `app/src/story/layout.ts`, `app/src/story/templates.ts`, `app/src/story/entitlement.ts`, `app/src/story/exportOptions.ts`, `app/src/story/__tests__/*.test.ts`

**Interfaces (produced):**
```ts
clampTrim(next: { startMs: number; endMs: number }, durationMs: number, moved: 'start' | 'end'): { startMs: number; endMs: number }
  // keeps [0, duration], length 3_000..60_000; the handle that moved is the one adjusted
storyLayout(video: { width: number; height: number }, frame: { width: number; height: number }):
  { video: Rect; top: Rect; bottom: Rect }            // Rect = { x, y, width, height }; video fits the width, centred
type TemplateId = 'placar' | 'minimal' | 'arena';
storyTexts(t: TemplateId, input: { sport: Sport; startedAt: number; arena?: string; gameName?: string }):
  { top: string[]; bottom: string[] }
useEntitlement(): { tier: 'free' | 'pro' }             // Plan 3 stub: 'pro'
exportOptions(tier, edit: Clip['edit'], trim): { width: number; height: number; startMs: number; endMs: number;
  speed: 1 | 0.5; muted: boolean; watermark: boolean }
```
Template texts: **placar** top `[SPORT IN CAPS, '17 OUT · 19:40']`, bottom `['QUE LANCE', arena ?? gameName ?? '']`; **minimal** top `[]`, bottom `[SPORT IN CAPS · 17/10]`; **arena** top `[arena ?? 'SUA ARENA']`, bottom `[SPORT IN CAPS, '17 OUT']`. Month abbreviations pt-BR uppercase (`JAN`…`DEZ`).

- [ ] **Step 1: Write the failing tests:** `clampTrim keeps the window inside the clip`; `clampTrim enforces 3s minimum moving the dragged handle`; `clampTrim enforces 60s maximum`; `storyLayout fits a 16:9 video in the middle of 9:16` (1920×1080 in 1080×1920 → video `{0, 656.25, 1080, 607.5}`, top height 656.25); `storyLayout handles a portrait video` (fills width, bands may be 0); `storyTexts placar/minimal/arena` (exact arrays); `exportOptions pro → 1080x1920, no watermark, slowmo halves speed and mutes`; `exportOptions free → 720x1280 with watermark`.
- [ ] **Step 2:** `npx jest src/story` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx jest` → PASS.
- [ ] **Step 5: Commit** `feat(app): trim limits, Story layout, templates and export options`

---

### Task 4: Native `exportClip` — iOS

**Files:**
- Create: `app/modules/replay-camera/ios/Core/Sources/ReplayCore/FitRect.swift` (+ `Tests/ReplayCoreTests/FitRectTests.swift`), `app/modules/replay-camera/ios/ClipExporter.swift`
- Modify: `app/modules/replay-camera/ios/ReplayCameraModule.swift`, `src/ReplayCameraModule.ts`, `src/ReplayCamera.ts`, `src/ReplayCamera.types.ts`

**Interfaces (produced):**
```ts
type ExportOptions = { clipPath: string; startMs: number; endMs: number; speed: 1 | 0.5; muted: boolean;
  width: number; height: number; overlayPngPath?: string; background: string /* '#RRGGBB' */ };
exportClip(opts: ExportOptions): Promise<{ path: string; durationMs: number }>
```
- `FitRect.fit(size: CGSize, into frame: CGSize) -> CGRect` (aspect fit, centred) — Swift tests: 1920×1080 into 1080×1920 → `(0, 656.25, 1080, 607.5)`; 1080×1920 into 1080×1920 → full frame.

- [ ] **Step 1:** Write `FitRectTests` → `swift test` FAIL → implement → PASS.
- [ ] **Step 2:** `ClipExporter.export(opts)`:
  - `AVMutableComposition` with the source video (and audio unless `muted` or `speed == 0.5`) for `[startMs, endMs]`.
  - `speed 0.5` → `scaleTimeRange` to double the duration.
  - `AVMutableVideoComposition`: `renderSize = width×height`, frame duration 1/30, one instruction with background colour and a layer instruction whose transform = source `preferredTransform` then scale/translate into `FitRect.fit(rotated natural size, renderSize)` (remember CoreAnimation's flipped y when placing the overlay layer).
  - Overlay: `CALayer` with the PNG as `contents` over the video layer through `AVVideoCompositionCoreAnimationTool`.
  - `AVAssetExportSession(preset: AVAssetExportPresetHighestQuality)`, `.mp4`, output in `<caches>/exports/`; delete the partial file on failure.
- [ ] **Step 3:** Expose `AsyncFunction("exportClip")` and the JS wrapper/types. Type-check with `xcrun swiftc -typecheck` (see Plan 1), then build for the device.
- [ ] **Step 4:** Device check (from the Story screen once Task 8 exists, or the spike screen): export a 30 s cut of a landscape clip → `ffprobe` shows 1080×1920, ~30 s, video centred with dark bands; with slow motion → ~60 s, no audio track.
- [ ] **Step 5: Commit** `feat(replay-camera): exportClip on iOS (cut, slow motion, mute, 9:16 with overlay)`

---

### Task 5: Native `exportClip` — Android

**Files:**
- Create: `app/modules/replay-camera/android/src/main/java/expo/modules/replaycamera/ClipExporter.kt`
- Modify: `app/modules/replay-camera/android/build.gradle` (add `androidx.media3:media3-transformer`, `media3-effect`, `media3-common` — same version, read the current release from the Media3 release notes), `ReplayCameraModule.kt`

- [ ] **Step 1:** `ClipExporter.export(context, opts)` with Media3 Transformer: `MediaItem.ClippingConfiguration` for the range; `EditedMediaItem` with `setRemoveAudio(muted || speed == 0.5f)`; effects: `SpeedChangeEffect(0.5f)` when slowed, `Presentation.createForWidthAndHeight(width, height, LAYOUT_SCALE_TO_FIT)`, `OverlayEffect` with a `BitmapOverlay` from the PNG (full frame). Output in `cacheDir/exports/`. Resolve on `onCompleted`, reject (and delete) on `onError`. Transformer must be created and started on a Looper thread (main).
- [ ] **Step 2:** `./gradlew :replay-camera:compileDebugKotlin` → compiles. (Device check pending an Android phone.)
- [ ] **Step 3: Commit** `feat(replay-camera): exportClip on Android via Media3 Transformer`

---

### Task 6: Story overlay component and PNG capture

**Files:**
- Create: `app/src/story/StoryOverlay.tsx`, `app/src/story/captureOverlay.ts`, `app/src/story/__tests__/StoryOverlay.test.tsx`

**Interfaces (produced):**
- `<StoryOverlay template texts layout watermark scale />` — draws the two bands (ground `#0B0B09`, accent details) and leaves the video rect transparent; `scale` lets the same component draw the preview (screen size) and the capture (1080×1920 logical).
- `captureOverlay(ref, size): Promise<string>` — `react-native-view-shot` `captureRef(ref, { format: 'png', result: 'tmpfile', width, height })`, returns a path without `file://`.

- [ ] **Step 1:** `npx expo install react-native-view-shot`; read its README for `captureRef` options with transparent backgrounds. Ledger the API.
- [ ] **Step 2: Write the failing tests:** placar shows the sport and `QUE LANCE`; watermark shows `feito com LANCE` only when `watermark`; the video area has no background colour.
- [ ] **Step 3:** `npx jest src/story` → FAIL → implement → PASS.
- [ ] **Step 4: Commit** `feat(app): Story overlay template and PNG capture`

---

### Task 7: Editor screen

**Files:**
- Modify: `app/src/app/clip/[id].tsx` (becomes the editor), `app/src/app/__tests__/` (new `clip.test.tsx`)
- Create: `app/src/components/TrimBar.tsx`

**Copy (mockup 8):** header `Lance #N · HH:MM`; under the bar `-60s` … `Corte: 0:30` … `gatilho`, hint `Arraste as bordas para ajustar o corte dentro dos 60s.`; tools `Corte`, `Câmera lenta`, `Som` (`Som` toggles `Sem som`); button `Próximo: Story`; secondary `Apagar lance`; missing clip `Este lance não está mais no celular.`

- [ ] **Step 1: Write the failing tests:** `toggling slow motion stores it on the clip`; `toggling sound stores muted`; `Próximo: Story opens the story screen` (`router.push('/story/c1')`); `a missing clip shows the message instead of the editor` (Review Focus 4).
- [ ] **Step 2:** `npx jest src/app` → FAIL.
- [ ] **Step 3:** Implement. `TrimBar`: a track for the whole clip with two handles (`Gesture.Pan`, 44 pt touch targets) and the selected window in accent; on release `repo.updateClip(id, { trim: clampTrim(...) })`. The player loops the window (Plan 2 logic), plays at `rate = 0.5` when slow motion is on and `muted` when sound is off.
- [ ] **Step 4:** `npx jest` → PASS; tsc, lint clean.
- [ ] **Step 5: Commit** `feat(app): lance editor — cut, slow motion and sound`

---

### Task 8: Instagram Story share (native)

**Files:**
- Create: `app/modules/replay-camera/ios/InstagramStory.swift`, `app/modules/replay-camera/android/src/main/java/expo/modules/replaycamera/InstagramStory.kt`, `app/modules/replay-camera/android/src/main/res/xml/replay_file_paths.xml`
- Modify: module files (iOS/Android/TS), `app/modules/replay-camera/android/src/main/AndroidManifest.xml` (FileProvider), `app/app.json` (`ios.infoPlist.LSApplicationQueriesSchemes: ["instagram-stories"]`, `expo.extra.metaAppId: ""`)

**Interfaces (produced):** `shareToInstagramStory(videoPath: string, metaAppId: string): Promise<'opened' | 'unavailable'>`

- [ ] **Step 1:** Read Meta's current "Sharing to Stories" docs (iOS pasteboard keys + URL scheme; Android `com.instagram.share.ADD_TO_STORY` intent). Ledger the exact keys.
- [ ] **Step 2:** iOS: if `metaAppId` is empty or `instagram-stories://` can't open → `'unavailable'`; else put the video data on the pasteboard under the background-video key (expires in 5 min) and open `instagram-stories://share?source_application=<id>`.
- [ ] **Step 3:** Android: FileProvider URI, intent with the video as data/type `video/mp4`, `source_application` extra, read permission granted to `com.instagram.android`; `'unavailable'` when no activity resolves or the id is empty.
- [ ] **Step 4:** Type-check iOS, compile Android.
- [ ] **Step 5: Commit** `feat(replay-camera): open Instagram's Story composer with the exported video`

---

### Task 9: Story screen

**Files:**
- Create: `app/src/app/story/[clipId].tsx`, `app/src/app/__tests__/story.test.tsx`
- Modify: `app/src/data/schema.ts` (`Prefs.arenaName?: string`, `Prefs.storyTemplate: TemplateId` default `'placar'`)

**Copy (mockup 9):** header `Prévia do Story`; template chips `Placar` `Minimal` `Arena`; field `Nome da arena (opcional)`; primary `Postar no Story`; secondary `Salvar na galeria`, `Compartilhar`; progress `Preparando vídeo…`; success `Salvo na galeria.`; errors `Não foi possível preparar o vídeo. Tente de novo.`, `Sem acesso às fotos. Libere em Ajustes.`; Instagram fallback `Instagram não encontrado. Escolha onde compartilhar.`

- [ ] **Step 1:** `npx expo install expo-media-library expo-sharing`; read both SDK 58 pages (permission + save API, `shareAsync`). Ledger the API.
- [ ] **Step 2: Write the failing tests** (native module, media library and sharing mocked):
  - `Postar no Story exports with the clip's cut and edits, then opens Instagram` (`exportClip` called with `exportOptions(...)` + overlay path; then `shareToInstagramStory`).
  - `when Instagram is unavailable it falls back to the share sheet and says so`.
  - `ignores a second post while exporting` (Review Focus 2).
  - `a failed export shows the error and re-enables the buttons` (Review Focus 3).
  - `Salvar na galeria asks for photo access and saves the export`.
  - `choosing a template and typing the arena stores them in prefs`.
- [ ] **Step 3:** `npx jest src/app` → FAIL.
- [ ] **Step 4:** Implement. Preview = `VideoView` placed in `storyLayout(...).video` scaled to the screen, with `StoryOverlay` on top. The overlay for export is a hidden 1080×1920-logical `StoryOverlay` captured with `captureOverlay` right before `exportClip`. One export is reused by all three buttons until the cut/edit/template/arena changes. Exports are deleted on unmount.
- [ ] **Step 5:** `npx jest` → PASS; tsc, lint clean.
- [ ] **Step 6: Commit** `feat(app): Story screen — post, save to Photos, share`

---

### Task 10: Wiring and on-device check

**Files:**
- Modify: `app/src/app/session/[id].tsx` (`Postar um lance` enabled: opens the editor of the newest clip; caption removed), `app/src/components/ClipCard.tsx` (tap → editor, unchanged route), `docs/superpowers/field-test-etapa0.md` (status line)

- [ ] **Step 1: Write the failing test:** `Postar um lance opens the newest lance's editor`. Implement. `npx jest` → PASS.
- [ ] **Step 2:** `pod install`, Release build, install on the iPhone.
- [ ] **Step 3:** Walk on the iPhone: end a game → name it → Meus jogos shows it with its name and thumbnail → open a lance → change the cut, turn on slow motion → Próximo: Story → switch templates, type an arena → Salvar na galeria (check Photos: 9:16, bands, slow) → Compartilhar (share sheet) → Postar no Story (share-sheet fallback while `metaAppId` is empty).
- [ ] **Step 4:** `ffprobe` an exported file copied from the device: 1080×1920, duration = cut (×2 with slow motion), no audio when slowed or muted.
- [ ] **Step 5:** Record the result and commit `docs: Plan 3 verified on iPhone`.
