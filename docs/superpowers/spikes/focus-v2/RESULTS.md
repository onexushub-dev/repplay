# Modo Foco v2 — step 0 results

> Spec `../../specs/2026-10-24-focus-ball-tracking-design.md` §8 step 0; plan `../../plans/2026-10-24-focus-v2-part1-spike-and-bench.md`.

## Candidates (task 1, 2026-10-24)

| Candidate | ONNX | Core ML | Notes |
|---|---|---|---|
| YOLOX-S | ✓ | ✓ (FP16, 18 MB) | decode matches upstream on the sample frame |
| D-FINE-S | ✓ | ✓ (FP16, 21 MB) | two conversion workarounds (convert/README.md); decode matches upstream |
| RTMDet-S | — | — | dropped: weights host (download.openmmlab.com) unreachable from the build environment, and the model needs `mmcv` compiled ops; can be added later from the Mac if the bench shows a gap |

First look, full frame only, `convert/tests/data/sample.jpg` (≈9 players, ~5.5% of the frame height): YOLOX-S 6
people ≥ 0.3, D-FINE-S 15 (likely counting wall-mural figures, which the still filter removes); no ball ≥ 0.15 in
either — tiling is needed.

Core ML vs ONNX check (`test_coreml_matches_onnx`): pending, macOS only.

## Bench first look, YOLOX-S vs D-FINE-S (8-clip subset, 2026-10-25, no labels yet)

| Clip | YOLOX people / ball cand. / seen | D-FINE people / ball cand. / seen |
|---|---|---|
| basket-v-corner-normal-01 | 2.5 / 0.17 / 11% | 4.0 / 7.02 / 60% |
| basket-v-corner-normal-02 | 6.5 / 0.39 / 25% | 9.5 / 9.40 / 89% |
| basket-v-corner-unavailable-01 | 5.4 / 0.50 / 13% | 7.1 / 7.74 / 56% |
| basket-v-corner-unavailable-03 | 4.4 / 0.22 / 9% | 8.8 / 8.56 / 60% |
| basket-h-corner-backlight-02 | 11.5 / 0.31 / 17% | 10.2 / 3.04 / 61% |
| basket-h-side-low-normal-01 | 14.6 / 0.12 / 10% | 22.3 / 9.56 / 71% |
| basket-h-side-low-normal-05 | 9.2 / 0.05 / 3% | 38.1 / 10.37 / 99% |
| basket-h-side-low-unavailable-02 | 18.1 / 0.10 / 5% | 27.0 / 7.79 / 79% |

Per sample, ball candidates ≥ 0.15; "seen" = tracker state SEEN. D-FINE finds more people and many more ball candidates,
but a frame check (normal-02) shows many of them are scenery (yellow wall marks, feet, hands, floor reflections): its
"seen" share is not a quality measure. Where the two agree it looks like the real ball. The labels decide (ball in
crop); D-FINE may need a higher ball threshold (0.3+). CPU time per clip here: YOLOX ~4 min, D-FINE 6–12 min (tiled).

## Device timing (task 2)

Pending.

## Capture formats and 4K heat (task 2)

Pending.

## 9:16 export from 16:9 (task 2)

Pending.

## Decisions

Pending (after the bench `compare` run).
