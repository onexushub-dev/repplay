# Modo Foco v2 — open items (written 2026-10-25, end of day)

State: spec §13 (amendment 2026-10-25) approved in conversation; Part 1 plan task 2 updated; Part 2 plan
(`plans/2026-10-25-focus-v2-part2-replaycore.md`) written, awaiting Victor's review. Bench numbers: `TUNING.md`.

## Waiting for Victor

1. Part 2 task 1 done 2026-10-26 (awaiting Victor's commit); next: Part 2 task 2 (`BallFilter`, Swift).
2. Part 1 task 2 on the XR and the 16 Pro Max (needs the spike branch and both phones): timing of the person
   detector (YOLOX-S / D-FINE-S, 3×2, 4×3 and 6×4 grids; tennis's ball now depends on the grid), TrackNetV3
   beach-volley; 4K30/60 heat
   over 20 min; the 9:16 export check.
3. One tennis or volleyball game recorded by the app in 4K (YouTube re-compresses; confirms the bench on real footage).

## Open decisions (spec §13.4)

- Person detector: YOLOX-S or D-FINE-S (device timing).
- Detector grid per resolution (3×2 vs 4×3) and decode size (1920 vs 2560 px).
- Whether TrackNetV3 ships as volleyball's second ball source.
- ~~WASB on 4K tennis~~: settled 2026-10-26 — tennis uses the filtered detector (98.3% vs WASB 93.1% ball in crop;
  TUNING.md, "Part 2 task 1"). WASB does not ship.
- Beach tennis: no ball source works yet (≤ 13%); players-framed until one does.
- License check of the data behind the TrackNetV3 weights (code is MIT), like COCO.

## Not tested yet (ideas with room to improve)

- The rest of the WASB model zoo per sport (TrackNetV2, ResTrackNetV2, MonoTrack, DeepBall weights for tennis,
  badminton, volleyball, basketball): cheap, same scripts.
- WASB volleyball / TrackNetV3 at 60 fps input (we fed ~30 fps frames, as their datasets).
- Fine-tuning WASB or TrackNetV3 on our own labels (spec step C) — most likely the biggest gain, above all for beach
  tennis and our own basketball camera angle. Needs more labels (dense, a few thousand frames), a free GPU (Colab or
  Kaggle) and the players' consent in the terms.
- A ball-only detector (YOLOX-S or D-FINE-S, Apache-2.0) trained on public ball datasets with commercial-friendly
  licenses (each dataset checked).
- ByteTrack-style two-stage association (high-confidence first, then low) in the tracker, and fusing WASB with the
  detector's filtered candidates.
- Why `basket-05` (YouTube) gives 92% ball recall and our app clips 17–56%: camera height/distance vs resolution.

## Done today (for the record)

Ball labels on 37 app clips + 6 YouTube 4K clips; tuning round; motion/feet filters (test D); resolution round;
WASB and TrackNetV3 converted (safe load) to ONNX; blind sharpness test (no visible difference at ≤ 2.25×); tennis
players-vs-ball video approved by Victor; spec §13; plans updated.

## Done 2026-10-26

Part 2 task 1: bench frozen (`filters.py`, `policy.py`, `ball_rects`/`smooth_rects`/`TUNING_PLAYERS`, tracker static
0.02 / 0.5), 4 ReplayCore v2 fixtures (`Fixtures/v2/`). Found that the tennis 98% came from the filtered detector, not
WASB; Victor chose the detector for tennis (spec §13.1 decision 10 amended). volley-01 scores 94.7% (one point under
the plan's bar). The tennis result hangs on one candidate at conf 0.29997 (TUNING.md).
