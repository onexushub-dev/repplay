# Batch save/share and simple compilation — design

Date: 2026-10-24 · Status: approved in conversation, pending written review

## Goal

On a recording's screen (`session/[id]`), the player selects clips (the existing "Selecionar clipes" mode, with "Todos"
and tap-to-unselect) and then, in one go:

1. **Salvar (N)** — every selected clip saved to Photos;
2. **Enviar (N)** — every selected clip in one system share sheet;
3. **Compilar** — one video made of the selected clips, then Salvar or Enviar.

Each clip comes out exactly as it does alone from the clip screen (cut, speed, sound, hand zoom, Modo Foco, rotation,
template bands, app mark per plan).

Later (not now): a "best moments" compilation built from the raw recording. Nothing here should block it.

## Decisions (from the conversation)

| # | Decision |
|---|----------|
| D1 | The compilation is not kept in the app: made on demand, then saved or shared, then the temporary file goes. |
| D2 | Batch Salvar/Enviar is free for every plan. Compilar is paid: on the free plan the button shows a lock and opens the paywall. A free batch Salvar/Enviar shows the free-export notice like a single export: the full panel on the recording's first export, a compact non-blocking notice after that (HD, no sound, no Modo Foco, watermark); see `docs/modelo-de-negocio-e-pagamentos.md`. |
| D3 | Mixed orientations: the compilation takes the orientation most selected clips have (tie: the first clip's). Clips of the other orientation go in whole, centred, with the template bands. Nothing is cropped. |
| D4 | Hard cuts between clips (no transitions) for now. |
| D5 | Order: chronological (the recording's clip order). No manual reordering. |
| D6 | Compilar needs at least 2 selected clips. |
| D7 | Speed: reuse finished exports (shared cache), prepare the next clip while the current one encodes, and run up to 2 exports at a time behind a constant that can go back to 1 (measured on device). |

## User interface

Selection mode bar (bottom of `session/[id]`), replacing the single "Apagar":

- **Salvar (N)**, **Enviar (N)** (primary), **Compilar** (lock icon on the free plan), and **Apagar** moved into a
  "Mais" menu (an action sheet) so the bar keeps three buttons.
- While working, the existing `ExportProgress` card shows "Preparando 2 de 5…" (compilation: "Preparando 2 de 5…",
  then "Juntando os clipes…"), with **Cancelar**.
- At the end: "5 clipes salvos na galeria." / the share sheet / "Compilação pronta" with Salvar · Enviar.
- Partial failure: "4 de 5 prontos. Não saíram: Clipe #3." For Compilar, the failed clips are left out and
  named; with fewer than 2 left, no compilation and the reason is shown.
- All text in the i18n catalogs (`pt-BR`, `en`); the no-hardcoded-Portuguese test covers it.

## Architecture

### 1. `src/share/clipExport.ts` — one clip's export job (pure)

`clipExportJob(clip, plan, videoSize, orientation?) → { options: ExportOptions-without-overlay, frame, layout, key }`

- Built on `clip/stage.ts` (`clipStage`) and `exportOptions`, i.e. the code the clip screen uses today; the clip screen
  is changed to call it, so the single, batch and compilation exports cannot drift apart.
- `orientation` ('portrait' | 'landscape') forces the frame (D3); without it the clip's own shape decides.
- Modo Foco: the clip's framing file is passed when its status is `ready` and the file reads (same rule as the screen).
- `key` = the look (options + layout + plan): two exports with the same key give the same file.
- Video size: `knownShape(path)`, else thumbnail + `Image.getSize` (then `rememberShape`).

`compilationOrientation(shapes) → 'portrait' | 'landscape'` — majority, tie goes to the first clip (pure).

### 2. Export cache — `src/share/exportCache.ts`

- Module map `key → path`, shared by the clip screen and the batch runner; an entry is used only if its file still exists.
- The exports folder is cleared once per app start (moved out of the clip screen's mount/unmount, which today deletes
  every export each time it opens or closes). Files made by a batch are removed when the batch ends unless a later step
  (compile) still needs them; a compilation's own output is removed after Salvar/Enviar.

### 3. Overlay capture for clips not on screen — `src/share/OverlayCapturer.tsx`

- The app mark/bands PNG is drawn by `ShareOverlay` and captured (`captureOverlay`). The recording screen mounts one
  hidden capturer that receives `{ frame, layout, watermark }`, renders it, and resolves the PNG path after layout
  (promise-based API: `capture(job) → Promise<string>`).
- One capture per distinct (frame, layout, watermark): consecutive clips with the same look reuse the PNG.

### 4. Batch runner — `src/share/batchExport.ts`

`runBatch({ clips, plan, orientation?, concurrency, capture, exportClip, onProgress, signal }) → { done: {clip, path}[], failed: {clip, reason}[] }`

- Keeps chronological order in the result whatever finishes first.
- Concurrency `EXPORT_CONCURRENCY = 2` (D7); while native encodes, the next job's size lookup and overlay capture run.
- Cache hits skip the export. Cancel (`signal`) stops starting new jobs; jobs already running finish and their files
  are removed if not wanted.
- A failed clip does not stop the others.
- Test seam: `exportClip` and `capture` are injected.
- A timing readout (total ms, per clip ms, concurrency) is logged and shown on the debug/test screen to decide D7.

### 5. Native — `modules/replay-camera` (iOS and Android)

- `shareFiles(paths: string[]): Promise<void>` — iOS `UIActivityViewController` with the file URLs; Android
  `ACTION_SEND_MULTIPLE` with content URIs from the module FileProvider already used by `InstagramStory.kt`.
- `concatVideos(paths: string[], outPath: string): Promise<{ path, durationMs }>` — joins exports of identical size and
  codec without re-encoding.
  - iOS: `AVMutableComposition` (one video track, one audio track; a part without audio leaves a silent gap on the audio
    track), `AVAssetExportSession` with `AVAssetExportPresetPassthrough`.
  - Android: `MediaExtractor` → `MediaMuxer`, offsetting each part's timestamps by the running duration.
  - Fails with a clear error if sizes/codecs differ (cannot happen when all parts come from `clipExportJob` with the
    same orientation and plan).
- Pure timeline math (offsets, total duration, silent gaps) lives in the testable Core (Swift `ReplayCore`, Kotlin
  `core`), run by Victor with `swift test` / Gradle unit tests.
- Note: crop, Modo Foco and rotation exports are iOS only today; Android batch output matches Android single export.

### 6. Flows (`session/[id]`)

- **Salvar:** media permission (as the clip screen) → `runBatch` → `Asset.create` each → summary.
- **Enviar:** `runBatch` → `shareFiles(done paths)`.
- **Compilar:** paid check (free → `openPaywall`) → shapes → `compilationOrientation` → `runBatch` with that
  orientation → `concatVideos` → Salvar / Enviar choice → remove temporary files.

## Errors and edge cases

- Photos permission denied: same message as the clip screen.
- App backgrounded / call during export: the running clip fails ("tente de novo"); finished parts stay in the cache, so
  repeating the action continues from there.
- Out of storage: existing storage message.
- Clip file missing: counted as failed, named in the summary.

## Testing

- Unit: `clipExportJob` equals what the clip screen exported before (regression), forced orientation; 
  `compilationOrientation` (majority, tie); `runBatch` (order, progress, cancel, partial failure, cache hits,
  concurrency 2); `exportCache` (missing file is a miss).
- Screen: three actions + Mais/Apagar, lock on free, Compilar disabled below 2, progress and summary texts, i18n keys.
- Native Core: concat offsets/total duration/silent gap (Swift and Kotlin unit tests).
- Device script: 5 clips mixing Modo Foco, hand zoom, 2x and one landscape; time readout at concurrency 1 and 2;
  phone temperature.

## Out of scope

Best-moments compilation from the raw recording; transitions, music, intro/outro; keeping compilations in the app;
manual reordering; passthrough export of unedited clips.
