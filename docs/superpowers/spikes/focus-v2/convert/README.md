# Candidate conversion (Modo Foco v2, plan part 1, task 1)

Converts the COCO-pretrained candidates to ONNX (bench) and Core ML (app spike). Raw heads only: `decode.py` is the
shared decoder spec (pre-processing, box decoding, NMS) that the Swift side follows.

| Candidate | Repo (license) | Commit | Weights (SHA-256) |
|---|---|---|---|
| `yolox_s` | github.com/Megvii-BaseDetection/YOLOX (Apache-2.0) | `6ddff4824372906469a7fae2dc3206c7aa4bbaee` | `releases/download/0.1.1rc0/yolox_s.pth` (`f55ded7181e1b0c13285c56e7790b8f0e8f8db590fe4edb37f0b7f345c913a30`) |
| `dfine_s` | github.com/Peterande/D-FINE (Apache-2.0) | `956d1709314c2c6a4df6f34de232054578a7449f` | `github.com/Peterande/storage/releases/download/dfinev1.0/dfine_s_coco.pth` (`48a6c8cc43eb57186843f752e2e8461ddd3326e0d3c575e71e6e960844683e89`) |
| `rtmdet_s` | dropped (see `../RESULTS.md`) | | |

Model I/O (input `images`, 1×3×640×640 float32, from `decode.preprocess`):
- `yolox_s`: keep aspect, image top-left, grey 114 padding, BGR 0..255. Output `output` (1, 8400, 85): dx, dy, log w,
  log h in grid units (strides 8/16/32), objectness and 80 class scores already through a sigmoid.
- `dfine_s`: stretched to 640×640, RGB 0..1. Outputs `output0` (1, 300, 80) class logits, `output1` (1, 300, 4) boxes
  cx, cy, w, h in 0..1 of the input. No NMS (DETR); keep the best 300 (query, class) pairs, as upstream.

Two conversion workarounds (same maths, `convert.py`): D-FINE's `Integral` uses `F.linear` with a 1-D weight, run as a
matmul; coremltools 9 cannot `int()` a 1-element constant array, cast through `.item()`.

## Run

```bash
python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
git clone https://github.com/Megvii-BaseDetection/YOLOX.git <src>/YOLOX     # commits above
git clone https://github.com/Peterande/D-FINE.git <src>/D-FINE
# weights from the table into <weights>/
python convert.py yolox_s --src <src> --weights <weights> --out ../../../../focus-refs/bench-out/models
python convert.py dfine_s --src <src> --weights <weights> --out ../../../../focus-refs/bench-out/models
FOCUS_V2_MODELS=../../../../focus-refs/bench-out/models FOCUS_V2_SRC=<src> python -m pytest tests -v
```

`tests/test_decode.py`: decode on the ONNX output matches each repo's own inference on `tests/data/sample.jpg` (a
Repplay basketball frame); on macOS it also checks Core ML (FP16) against ONNX.
