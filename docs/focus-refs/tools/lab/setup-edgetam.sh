#!/bin/bash
# Modo Foco lab, ON THE MAC: EdgeTAM (facebookresearch/EdgeTAM, Apache-2.0), SAM 2 distilled for phones, in its own
# Python env (its package is also called `sam2`, so it cannot share lab/.venv with SAM 2). Checkpoint from the repo.
#   cd docs/focus-refs && bash tools/lab/setup-edgetam.sh
#   lab/.venv-edgetam/bin/python tools/lab/oneclick.py --model edgetam        # every clip with a ball click
set -euo pipefail
cd "$(dirname "$0")/../.."
[ "$(uname -s)" = "Darwin" ] || { echo "Run this on the Mac (macOS)."; exit 1; }
EDGETAM_COMMIT=7711e012a30a2402c4eaab637bdb00a521302c91
mkdir -p lab/models
PY=""
for c in python3.12 python3.11 python3.13 python3.10 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
    PY="$(command -v "$c")"; break
  fi
done
[ -n "$PY" ] || { echo "Python 3.10+ not found (brew install python@3.12)"; exit 1; }
[ -x lab/.venv-edgetam/bin/python ] || "$PY" -m venv lab/.venv-edgetam
VPY=lab/.venv-edgetam/bin/python
if ! "$VPY" -c "import torch, sam2, timm" 2>/dev/null; then
  "$VPY" -m pip install -q --upgrade pip
  "$VPY" -m pip install -q "torch>=2.5.1" "torchvision>=0.20.1" numpy pillow opencv-python
  SAM2_BUILD_CUDA=0 "$VPY" -m pip install -q "git+https://github.com/facebookresearch/EdgeTAM.git@${EDGETAM_COMMIT}"
  # the RepViT backbone needs timm, which EdgeTAM lists only under its optional extras
  "$VPY" -m pip install -q "timm==1.0.15"
fi
# EdgeTAM's package leaves its Hydra configs out (no MANIFEST.in): put edgetam.yaml where build_sam looks for it.
SAM2_DIR=$("$VPY" -c "import os, sam2; print(os.path.dirname(sam2.__file__))")
if [ ! -s "$SAM2_DIR/configs/edgetam.yaml" ]; then
  mkdir -p "$SAM2_DIR/configs"
  curl -fsSL --retry 3 -o "$SAM2_DIR/configs/edgetam.yaml" \
    "https://raw.githubusercontent.com/facebookresearch/EdgeTAM/${EDGETAM_COMMIT}/sam2/configs/edgetam.yaml"
fi
if [ ! -s lab/models/edgetam.pt ]; then
  curl -fL --retry 3 -o lab/models/edgetam.pt.part \
    "https://github.com/facebookresearch/EdgeTAM/raw/${EDGETAM_COMMIT}/checkpoints/edgetam.pt"
  mv lab/models/edgetam.pt.part lab/models/edgetam.pt
fi
"$VPY" - <<'PY'
import torch, sam2, os
print("torch", torch.__version__, "| MPS:", torch.backends.mps.is_available(), "| sam2 (EdgeTAM) at", os.path.dirname(sam2.__file__))
PY
echo "Ready: lab/.venv-edgetam/bin/python tools/lab/oneclick.py --model edgetam"
