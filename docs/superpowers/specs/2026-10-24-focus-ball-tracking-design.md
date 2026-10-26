# Repplay: Modo Foco v2 (ball tracking, resolution-aware zoom, vertical from landscape) — design

> Date: 2026-10-24. Status: design approved in conversation (Victor, 2026-10-24); written spec awaiting review.
> Builds on `2026-10-23-focus-mode-design.md` (v1, implemented). Section 11 lists what this spec replaces there.
> Evidence: today's basketball game (16 raw clips, `docs/focus-refs/clips/`), the reference short
> `docs/focus-refs/refs/ref-beach-01-cCX4RyCd1z8.webm`, and a Vision probe (`docs/focus-refs/tools/vision-probe.swift`).

## 1. Goal

Modo Foco framing that looks like a broadcast operator: the ball and the players around it stay in the picture, the
camera holds still while the play stays put, moves ahead of a pass, and zooms in when the play concentrates. No clip
with visible players is left "indisponível". Everything stays free to use (no paid SDK, no AGPL code or weights) and runs
on the phone after the save.

Success (measured by the evaluation bench, section 7, v1 vs v2 on the same clips):

| Metric | Target |
|---|---|
| Ball inside the crop, over samples where the ball is in play (labelled) | ≥ 95% |
| Clips "none" (no framing) among clips with players visible | 0 |
| Mean zoom | higher than v1 |
| Jerk (95th percentile of the crop centre's acceleration) | not worse than v1 |
| Analysis time, 30 s window | ≤ 30 s on iPhone XR; ≤ 10 s on iPhone 16 Pro Max |

Non-goals: following one chosen player, live framing while recording, Android, a server, training a custom model
(that is the conditional step C, section 10), multi-camera.

## 2. Decisions (Victor, 2026-10-24)

| # | Decision | Detail |
|---|---|---|
| 1 | Approach B, C conditional | B: an Apache-2.0 detector converted to Core ML + a ball tracker + a new path. C (fine-tuning the ball class on Repplay's own clips) only if the bench misses the targets with B. |
| 2 | Free resources only | No paid SDKs. No AGPL code or weights (Ultralytics stays out of the app, as in v1). Apple frameworks, Apache-2.0/MIT models, Create ML. |
| 3 | Capture by plan | Free: 1080p60 fixed (as today), so a recording unlocked later still gives Full HD. Pro: picks 1080p, 2K or 4K. |
| 4 | Zoom follows the recorded resolution | The crop never drops below 720 source pixels on its short side (v1's standard: 1080p at 1.5x). Max zoom = min(3, short side of the largest rect of the target aspect ÷ 720), at least 1. |
| 5 | Vertical from a landscape clip | A landscape clip with Modo Foco ready can be shown and exported 9:16, following the play. The choice lives in the Foco panel (preview = export). Story always uses the vertical framing for such clips. |
| 6 | No analysis during a recording | The focus queue waits while a session records (not only when hot). Prerequisite for v2 (heavier) and the first item of the thermal work. |
| 7 | 2K and 4K exports, paid only | Paid exports offer Full HD, 2K and 4K, up to the recorded resolution. Free stays 720p. While the app is in testing, the paid-only rule is switched off by one constant (`HIGH_RES_EXPORT_OPEN`), so everyone can try them. |

Max zoom by recording (decision 4):

| Recording | Same aspect (crop short side) | Vertical from landscape (9:16 inside 16:9) |
|---|---|---|
| 1080p | 1080 → 1.5x | 607 px wide: no extra zoom (1x), soft at 1080×1920 |
| 2K (1440p) | 1440 → 2x | 810 px → 1.125x |
| 4K (2160p) | 2160 → 3x | 1215 px → 1.69x |

## 3. Facts that shape the design (measured 2026-10-24)

| Fact | Consequence |
|---|---|
| 5 of 16 vertical basketball clips came out "indisponível" in the app; 2 of the 3 clips recorded at 720p30 (thermal fallback) are among them. | The detector, not the path rules, is the bottleneck; low resolution makes it worse. |
| Vision `VNDetectHumanRectanglesRequest` on the failing clip: someone in 24% of samples, 0.31 people per sample (≈9 on court), only people taller than ~10% of the frame. Players there are ~5.5% of the frame height (~105 px). | Replace the person detector. |
| The same detector on enlarged tiles (`regionOfInterest`) found tiny false boxes (median 1.7% height: roof trusses, wall mural); restricted to the court band, 0.46 people per sample. | Tiling only helps with a better model. |
| A COCO detector (YOLO11s at 1920 px, spike only) found players in 100% of samples, and v1's `FocusPath` with those boxes is `ready`. | The v1 path rules are sound; keep them as the fallback. |
| With good detections, v1's crop on that clip spans 69–98% of the frame width: almost no zoom. | Zoom must come from the ball and the players near it, and needs more resolution. |
| `VNDetectTrajectoriesRequest`: 204 trajectories on a 14 s clip, mostly short horizontal moves at the players' height (legs, floor reflections), not the ball's arc. | Not a ball source. Not used. |
| Reference (landscape broadcast cut to 9:16): the ball stays horizontally central (20–80% of the width in 98% of samples, median 47%); the nearest player is ~27% of the frame height; long holds, then fast moves (crop centre up to ~0.8 crop widths/s, median 0.23). | Targets for the path: ball-centred, tighter zoom, dead zone, faster but bounded pans. |
| A generic detector found the real ball in 40% of the reference's samples, with gaps up to 1.6 s, and flagged a large decorative ball in the stands in most samples. | Ball needs tracking, a "must move" rule and a fallback to the player who has it. |
| During a recording the app runs 1080p60 capture + H.264 encode, gesture detection (Vision, 4–8 fps), the preview on screen, and the focus analysis of each saved clip (paused only at `serious`). The phone (16 Pro Max, case on, not charging, indoors, no sun) reached `serious` today. | Decision 6, and a separate thermal spec (section 12). |

## 4. How it works

```
save ─► repo.addClip ─► FocusQueue (waits while recording)
                           │ analyzeFocus(clipPath, startMs, endMs)
                           ▼
FocusAnalyzer v2 (iOS): AVAssetReader 10 fps, scaled to 1920 px long side
   ─► Detector (Core ML via VNCoreMLRequest): people + ball, full frame, tiles when players are small
   ─► BallTracker (ReplayCore) ─► FocusPath v2 (ReplayCore) ─► <clip>.focus.json  (v: 2)
                           │
                           ▼
         editor preview (aspect from edit.focusAspect) ──► export / Story (same path, same aspect)
```

### 4.1 Detector (native)

- Model: an Apache-2.0 detector pretrained on COCO with the classes `person` and `sports ball`, converted to Core ML
  (`coremltools`, from PyTorch). Candidates compared in step 0 on the bench: YOLOX-S (primary), RTMDet-S, D-FINE-S.
  The winner is the best ball and small-person recall that meets the time budget (section 1). Model file in the app
  bundle, FP16.
- Frames: `AVAssetReader` decodes scaled to 1920 px on the long side (the decoder scales; 4K clips are not read at 4K).
- Full-frame pass at the model's input size (640). If the median height of the people found is under 48 px at that
  scale (players far or small), the sample is also run on overlapping tiles cut from the 1920 px frame (portrait 2×3,
  landscape 3×2, 15% overlap), and boxes are merged with NMS (IoU 0.45). Tiling is decided per clip from the first
  second of samples, so the cost is predictable.
- Kept: people with confidence ≥ 0.3; ball candidates with confidence ≥ 0.15 (the tracker sorts them out).
- Unchanged from v1: one analysis at a time, `.utility`, cancellable, `interrupted` when Vision keeps failing
  (app in the background).

### 4.2 Ball tracker (`BallTracker.swift`, ReplayCore, pure, `swift test`)

Input: per sample, ball candidates `(x, y, r, conf)` and people boxes, normalized, display orientation.
Output: per sample `(x, y, state, conf)`, `state` ∈ `seen | predicted | held | lost`.

1. **Static out:** a candidate is dropped when, in ≥ 70% of the samples within ±2 s, a candidate sits within 1% of
   the frame width of it (decorative balls, spare balls on the floor; the camera is fixed).
2. **Tracks:** constant-velocity Kalman filter in normalized image coordinates. A track starts with 3 consistent
   candidates within 0.5 s; association gate grows with consecutive misses. Track score = sum of matched confidences.
   The main track at each sample is the active track with the highest score.
3. **Offline smoothing:** forward filter + backward (RTS) smoother, since the whole clip is known.
4. **Gaps:** up to 0.7 s without a match → `predicted` (smoothed state). Longer → `held`: the position of the player
   whose box centre is nearest to the last seen ball, until a new track starts or 3 s pass → `lost`.
5. All constants live in `FocusTuning` (v2 fields) and are tuned on the bench.

### 4.3 Path rules v2 (`FocusPath.swift`, ReplayCore)

v1 steps 1–2 (far people out, still people out) are kept. Then, per sample:

1. **Subject:** `seen`/`predicted` → the ball; `held` → the holder's box centre; `lost` → v1's weighted players'
   centre (v1 steps 3–4). A clip with no ball track at all gives exactly v1's output (tested).
2. **Target:** x = 0.7 × subject + 0.3 × centre of the 2 players nearest the subject (ball states); y = players near
   the subject, with the ball pulling only 0.3 (high lobs and sets do not drag the camera to the sky).
3. **Look-ahead:** the target uses the subject at `t + Δ`, Δ = 0–0.5 s growing with the ball's speed, so the camera
   starts to turn before the pass, not after it.
4. **Lead room:** shift by the subject's horizontal velocity, capped at ±15% of the crop width.
5. **Dead zone:** the camera centre holds while the target stays inside the central 40% of the crop width (50% of
   its height); it moves only when the target leaves it (hysteresis).
6. **Size:** action spread = box around the subject + its 2 nearest players, plus a margin. Width =
   clamp(spread × 1.3 + 0.15, 1/maxZoom, 1). To widen ahead of a long pass or a shot, the size uses the largest
   spread in `[t, t + 0.8 s]`. Size changes are slower than pans (σ 1.2 s, as v1). `maxZoom` from decision 4.
7. **Speed:** base pan limit 35% of the frame width per second (v1); when the target is outside the crop's middle
   70%, the limit rises to 0.8 crop widths per second; acceleration limited (starting value 1.5 crop widths/s²).
8. **Placement and availability:** as v1 (centre 10% of the height above the players' centre, clamped inside the
   video; `none` when fewer than 20% of the samples have players after the filters).
9. Both aspects are computed for every clip: the recorded aspect with zoom, and the other one (for a landscape clip, the
   vertical framing of decision 5) with the same rules and its own `maxZoom`.

### 4.4 Storage

- `<clip>.focus.json` v2: `{ v: 2, stepMs, startMs, size, model, landscape, portrait, ball }`, `ball` rows
  `[x, y, state, conf]` (state as 0–3), 4 decimals. Readers accept v1 and v2 (preview and export only need the rects).
- A clip whose file is v1 is re-queued when opened (`ensure`), outside a recording; it keeps showing its v1 framing
  until v2 is ready.
- `edit.focusAspect?: 'landscape' | 'portrait'` in `Clip.edit`; absent = the recorded aspect. Only meaningful for
  landscape clips.

### 4.5 Queue (decision 6)

- `FocusQueue.setPaused(true)` while the session phase is `recording`, whatever the heat; resumes when the session
  ends. A clip opened in the editor during a recording is analysed alone (`ensure`) only if the thermal state is
  `nominal`; otherwise it shows "preparando" until the session ends.

### 4.6 Vertical from landscape (decision 5)

- Foco panel, landscape clips with framing ready: a segmented control `Formato: Horizontal | Vertical` under the
  switch, saved in `edit.focusAspect`. Hidden for vertical clips and when Modo Foco is off or unavailable.
- Preview: `ZoomableVideo` shows the 9:16 window of the vertical framing (the video area takes the 9:16 shape; the
  editor layout already fits a vertical video). Hold-to-see-whole still shows the whole landscape video.
- Export: `exportOptions` gives a 9:16 render size (1080×1920 paid) and the portrait rows; `ClipExporter` uses the same
  transform ramps as v1, with the vertical render size. The overlay (mark bottom-right) is the vertical layout.
- Story: a landscape clip with Modo Foco ready and on uses the vertical framing; otherwise as today (whole video with
  bands).
- Free plan: Modo Foco is not in free exports (payments spec), so vertical-from-landscape is a paid export; the
  preview works for everyone, like Modo Foco today.
- When the clip was recorded at 1080p and the vertical option is picked, the panel shows a one-line note that 2K/4K
  give a sharper vertical video (Pro).

### 4.7 Capture quality (decision 3)

- `Settings.quality` gains `'1440p'` and `'2160p'` next to `'1080p60'` (`'720p30'` stays the thermal fallback).
  Free sessions always open at `1080p60`; Pro sees a picker (1080p · 2K · 4K) in the recording settings.
- `CaptureController.applyFormat` picks the 16:9 format of that width. If a phone has no native 2560×1440 format,
  2K is captured at 4K and written at 1440p (`AVAssetWriter` output size). Frame rate: 30 fps for 2K/4K unless step 0
  shows 60 fps holds on the XR and the 16 Pro Max without reaching `serious` in 20 minutes indoors.
- Bitrate scales with pixels × fps (starting point: 4K30 ≈ 35 Mbps H.264). The 60 s ring at 4K is ~260 MB with H.264;
  the thermal spec's HEVC item halves it and must land before 4K ships.
### 4.8 Export resolution (decision 7)

- `exportOptions` takes an `exportQuality: '1080' | '1440' | '2160'` (short side). Free: always 720, as today.
  Paid: the chosen quality, capped at the recorded short side (a 1080p clip only offers Full HD); a vertical from a
  landscape clip is capped by its own crop the same way (4K landscape → up to 2K vertical is sharp; 4K vertical is
  offered but upscaled, so the picker shows 4K only when the source rect is at least 1440 px on its short side).
- The save/send sheet shows `Qualidade` · `Full HD` · `2K` · `4K` (options above the cap hidden). Default Full HD (it
  shares well); the last choice is remembered in `Prefs.exportQuality`.
- Story always exports at 1080×1920 (Instagram's size), whatever the choice.
- Compilations use the lowest quality among their clips' caps, so every clip in it looks the same.
- `HIGH_RES_EXPORT_OPEN = true` (in `src/share/exportOptions.ts`) lets free plans see 2K/4K during testing; flipped to
  `false` before the App Store release. Free keeps 720p for Full HD and below either way? No: with the flag on, free
  exports follow the same rules as paid for resolution only (sound and Modo Foco stay paid).
- Encoder: 2K/4K exports use HEVC at a bitrate scaled by pixels (the thermal spec's HEVC check covers export too);
  Full HD and 720 keep H.264 for the widest sharing compatibility.

## 5. Screens and copy

- Foco panel: `Formato` control (4.6). Copy: `Formato` · `Horizontal` · `Vertical`; note for 1080p:
  `Grave em 2K ou 4K para um vertical mais nítido.`
- Recording settings (Pro): `Qualidade` · `Full HD` · `2K` · `4K`. Free: the row shows `Full HD` with the Pro badge.
- No other screen changes. "Modo Foco · preparando" now also covers "waiting for the recording to end".
- All copy in `pt-BR` and `en` (i18n spec).

## 6. Testing

- ReplayCore (`swift test`):
  - `BallTracker`: a synthetic parabola and a straight pass are tracked; a static candidate is dropped; a 0.5 s gap is
    `predicted`, a 1.5 s gap is `held` by the nearest player, 4 s is `lost`; two balls → the moving one wins.
  - `FocusPath` v2: no ball track → rows equal v1's; `maxZoom` respected per resolution and aspect; dead zone keeps the
    centre still while the target moves inside it; lead room points the way the ball goes; speed and acceleration
    limits respected; rects inside the video.
  - Fixtures: detection files exported by the bench for 4 of today's clips (2 `normal`, 2 `unavailable`).
- JS (jest): queue paused during recording and resumed after; `ensure` during recording only when `nominal`; v1 file
  re-queued on open; `edit.focusAspect` read/default; Foco panel shows `Formato` only for landscape + ready; export
  options pick the 9:16 size and rows; Story uses vertical for landscape + Focus; quality picker locked on free.
- Native: an export of a landscape clip as 9:16 with ramps and the overlay (mark position), checked on device.

## 7. Evaluation bench (`docs/superpowers/spikes/focus-v2/`, Python, not shipped)

- Data: `docs/focus-refs/` (local, git-ignored media; `clips/manifest.csv` describes each clip). Names:
  `<sport>-<v|h>-<side-high|side-low|end|corner>-<case>[-cam4k]-<nn>.mp4`.
- Runs the step 0 candidate models (ONNX/PyTorch, same weights as the Core ML ones), the tracker and the path (Python
  ports kept in sync with ReplayCore through the shared fixtures).
- Ball labels: semi-automatic. The detector + tracker propose a ball position per sample; Victor reviews a contact sheet
  per clip and marks wrong samples; "ball not in play" samples are excluded.
- Report per clip and overall: section 1 metrics, v1 vs v2, plus a rendered 9:16/16:9 preview video for watching.
- Every tuning change goes through the bench before it reaches `FocusTuning`.

## 8. Plan (steps; each becomes a plan)

0. **Spike (throwaway):** convert the 3 candidates to Core ML; time them on the XR and the 16 Pro Max (full frame and
   tiles); check 2560×1440 formats and 4K30/60 heat over 20 min; export one 16:9 clip as 9:16 with ramps. Go/no-go and
   model choice.
1. **Bench + labels** on today's 16 clips and the reference.
2. **Queue pause during recording** (4.5). Small, ships first, independent of the rest.
3. **ReplayCore:** `BallTracker`, `FocusPath` v2, `FocusTuning` v2, fixtures.
4. **Native analyzer v2:** Core ML detector, tiling, v2 file, v1 re-queue.
5. **Capture quality (Pro):** settings, picker, formats, bitrate.
6. **Vertical from landscape:** panel, preview, export, Story.
7. **Field test:** basketball, futsal/society, volleyball, beach tennis; landscape and vertical; 1080p and 4K.

## 9. Risks

- **Analysis time on the XR with tiles:** may exceed the budget. Mitigation: tiles only when players are small (per
  clip), 5 fps for people with the ball at 10 fps, smaller model variant.
- **Ball recall with a generic model** (~40% of samples on the reference): the tracker and the holder fallback cover
  gaps; if the bench stays under 95%, step C (section 10).
- **COCO weights:** the model code is Apache-2.0; COCO annotations are CC BY 4.0 and its images are under Flickr terms.
  Shipping COCO-trained weights in commercial apps is common, but it needs a legal check before release (not legal
  advice).
- **Heat:** v2 analysis and 4K capture both add load; decision 6 and the thermal spec are prerequisites for 4K.
- **4K storage:** the ring and saved clips grow ~4x; HEVC (thermal spec) and the existing cleanup keep it bounded.

## 10. Step C (conditional): fine-tune the ball class

Only if step 7's bench numbers miss the ball target. Label a few hundred frames from Repplay clips (semi-automatic, as
the bench), fine-tune the chosen Apache-2.0 model's ball class (or train a Create ML object detector), reconvert to
Core ML, compare on the bench. Clips from players need consent in the terms before they are used for training.

## 11. What this replaces in `2026-10-23-focus-mode-design.md`

- §1 non-goals: ball detection, 4K capture and the vertical Story from a landscape clip are now in scope.
- §2 "Full HD, zoom capped at 1.5x": replaced by decisions 3 and 4.
- §4.1: the Vision person detector is replaced by the Core ML detector (4.1); analysis no longer runs during recordings.
- §4.2: path rules extended (4.3); v1 rules are the fallback.
- §4.3: file format v2 (4.4).
- §10.1 and §10.2: done by this spec.

## 12. Related: thermal work (separate short design)

Decision 6 is the first thermal item. The others (screen economy mode during recording, stepped degradation with
1080p30 before 720p30, HEVC recording, on-screen tips at `fair`) are designed separately and must land before 4K
capture ships.

## 13. Amendment, 2026-10-25 (bench results; Victor's decisions)

Evidence: `docs/superpowers/spikes/focus-v2/TUNING.md` (37 labelled app basketball clips; 6 labelled 4K YouTube clips of
tennis, table tennis, beach tennis, volleyball and basketball; a blind sharpness test; Victor's review of a tennis clip
framed by players vs by the ball: "ficou bem melhor… a câmera se mexe de forma natural e a bola está sempre no quadro").
Where this section and §1–12 disagree, this section wins.

### 13.1 Decisions

| # | Decision | Detail |
|---|---|---|
| 8 | Framing follows the sport | Each recording has a sport. Tennis and volleyball (indoor and beach) follow the ball; every other sport, and "Livre", frames the players. A clip can switch between the two in the Foco panel. |
| 9 | Sport picked when a recording starts | The setup screen asks the sport, with "Livre" (not informed) as the default. Stored in `Session.sport` (already there; today it always holds `quadra`). |
| 10 | Ball sources by sport | Tennis and volleyball: the general detector's ball candidates after the motion and feet filters (13.3); for volleyball, TrackNetV3 beach-volley weights (MIT) as a second source if the device budget allows. No ball model runs for players-framed sports. *(Amended 2026-10-26: tennis used WASB tennis weights; on tennis-02 the filtered detector scored 98.3% ball in crop at 3× vs WASB's 93.1%, and the approved video used it. TUNING.md, Part 2 task 1.)* |
| 11 | Capture: Full HD free, 4K Pro | 2K capture is dropped (iPhones have no native 2560×1440 format, and 2K gave no visible gain). Free: 1080p60. Pro: 1080p60 or 4K. 2K stays as an export size (Pro only). Replaces decision 3 and §4.7's 2K. |
| 12 | Players framing tuned for zoom | With the new person detector, players framing keeps the ball in the crop 97% of the time at a mean zoom of 2.0× when the source allows 3×: `spreadScale 1.3 → 1.1`, `spreadMargin 0.15 → 0.10`, `sigmaXMs 500 → 800`, max zoom by resolution (decision 4). |
| 13 | Camera when following the ball | The dead-zone, speed- and acceleration-limited controller of §4.3 steps 5 and 7 is replaced by an offline Gaussian smoothing (σ 600 ms) of the ball-led target's centre and size, clamped inside the video. Bench jerk fell from 1.5–3 to 0.3–1.0 crop widths/s². |
| 14 | Volleyball zoom cap | Ball-led volleyball framing is capped at 1.5× (the bench lost the ball above it); tennis uses the full resolution cap. |
| 15 | Screen economy is a choice | Before recording, a switch "Economia de bateria" (default on). Turning it on, or the first recording with it on, shows a short explanation: the screen goes dark after a while, recording goes on, a tap lights it up. |

### 13.2 What the bench showed (summary)

- Generic COCO detectors find a basketball in 17–56% of samples on our app clips and track the wrong object most of the
  time; on basketball the ball never beat players framing. Kept for people; ball only through 13.3 filters.
- Resolution helps detection only with a denser tile grid (1080p 3×2 → 1440p 4×3 → 2160p 6×4: +5 to +16 points); 4K
  with the 1080p grid equals 1080p. Most of the gain is at the 4×3 grid.
- Blind sharpness test (same framing cut from 1080p, 1440p, 2160p; exported 1920×1080; zoom up to 2.25×): no visible
  difference; 1080p was picked first in 2 of 3 clips. 4K's value is the zoom it allows (3×), not sharpness at 2×.
- Ball models: WASB tennis finds the ball in 95% of tennis samples (93% precise, 4K with 2×2 tiles; 84% on the full
  frame). TrackNetV3 beach-volley: 45% on volleyball at 100% precision. Neither works on beach tennis or basketball.
- Ball-led framing at the resolution cap: tennis 98% ball in crop with the filtered detector (WASB: 93%; players framing:
  62%); volleyball 95% at 1.5× with the filtered detector (TrackNetV3: 97%, but at a mean zoom of 1.07×).

### 13.3 Ball candidate filters (general detector)

Applied to the general detector's ball candidates before the tracker (volleyball):
1. **Motion:** keep a candidate only when the grey patch around it (radius 1.5 r, at least 4 px) changed by a mean
   absolute value ≥ 4 (0–255 scale) against both the previous and the next sample. Computed by the native analyzer.
2. **Feet:** drop candidates inside the bottom 15% of a person box (shoes).
3. **Body:** inside a person box (above the feet), keep only confidence ≥ 0.3.
4. Static filter of §4.2 rule 1 with `static_radius 0.02`, `static_share 0.5`.

### 13.4 What is still open (before Parts 3–4 are built)

- Device cost (Part 1, task 2): TrackNetV3 per frame; the person detector at 3×2 and 4×3 grids (and 6×4 at 4K); on the
  XR and the 16 Pro Max. Decides the grid per resolution and whether TrackNetV3 ships. The grid matters for tennis now
  that its ball comes from the detector: 4K with the 6×4 grid 98%, with 3×2 95%; 1440p with 4×3 98% at 2× (one clip).
- The person detector (YOLOX-S or D-FINE-S): device timing decides; D-FINE-S found more on the 4K clips.
- Beach tennis has no working ball source yet: it is players-framed until one is found (spec step C or a new model).
- Confirmation on footage recorded by the app (YouTube re-compresses): one tennis or volleyball game in 4K.
- The training data behind the TrackNetV3 weights (code is MIT): license check before release, like COCO (§9). WASB no
  longer ships (decision 10, amended 2026-10-26).

### 13.5 Changes to earlier sections

- §1 success: "ball inside the crop ≥ 95%" applies to ball-led sports; players-framed sports keep ≥ 95% at a mean zoom
  above v1's. Jerk target unchanged.
- §2 decision 1: B stays; C becomes "a ball source for beach tennis" (13.4).
- §4.1: the detector runs people (all sports) and ball candidates (tennis and volleyball); no WASB. Grid per
  resolution pending device timing; decoding no longer always at 1920 px (4×3 needs ~2560 px).
- §4.3: steps 5 and 7 replaced by decision 13; step 1 applies only to ball-led sports; players-framed sports use v1's
  path with decision 12's values.
- §4.4: `.focus.json` v2 adds `sport` and `follow: 'ball' | 'players'`.
- §4.7: decision 11. §4.8 unchanged (2K/4K export, Pro, `HIGH_RES_EXPORT_OPEN`).
- §5: new setup-screen row `Esporte` (13.6) and the economy switch (decision 15). Foco panel adds `Seguir: Jogadores | Bola`
  (shown only when the clip has a ball track).

### 13.6 Sports and copy

| Id | pt-BR | en | Follows |
|---|---|---|---|
| `livre` (default) | Livre | Free play | players |
| `tenis` | Tênis | Tennis | ball (detector) |
| `volei` | Vôlei | Volleyball | ball (≤ 1.5×) |
| `voleiPraia` | Vôlei de praia | Beach volleyball | ball (≤ 1.5×) |
| `beachTennis` | Beach tennis | Beach tennis | players |
| `basquete` | Basquete | Basketball | players |
| `tenisMesa` | Tênis de mesa | Table tennis | players |
| `futebol` | Futebol / society | Football | players |

Setup row: `Esporte` · picker with the table above. Economy switch: `Economia de bateria`; explanation:
`A tela apaga sozinha depois de alguns segundos para o celular não esquentar. A gravação continua. Toque na tela para
acender.` · `Entendi`. Foco panel: `Seguir` · `Jogadores` · `Bola`.
