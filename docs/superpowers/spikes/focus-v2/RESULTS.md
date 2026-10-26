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

## Device timing (task 2)

Pending.

## Capture formats and 4K heat (task 2)

Pending.

## 9:16 export from 16:9 (task 2)

Pending.

## Decisions

Pending (after the bench `compare` run).
