#!/bin/bash
# Modo Foco lab, one-time setup ON THE MAC (macOS, Apple silicon): Python env with PyTorch (MPS) and SAM 2.1 from
# Meta's official repo (github.com/facebookresearch/sam2, Apache-2.0), plus the SAM 2.1 checkpoints.
# Everything lands in docs/focus-refs/lab/ (git-ignored). Nothing in the app is touched.
#
#   cd docs/focus-refs && bash tools/lab/setup-mac.sh            # tiny model (default of the server)
#   cd docs/focus-refs && bash tools/lab/setup-mac.sh small base_plus  # extra models for the comparison tests
set -euo pipefail
cd "$(dirname "$0")/../.."
LAB=lab
mkdir -p "$LAB/models"

[ "$(uname -s)" = "Darwin" ] || { echo "Run this on the Mac (macOS), not inside Linux."; exit 1; }

# Python 3.10+ (SAM 2 needs it; macOS's own python3 may be 3.9).
PY=""
for c in python3.12 python3.11 python3.13 python3.10 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
    PY="$(command -v "$c")"; break
  fi
done
if [ -z "$PY" ]; then
  echo "Python 3.10+ not found. Install it with:  brew install python@3.12   and run this again."
  exit 1
fi
echo "Python: $PY ($("$PY" --version))"

if [ ! -x "$LAB/.venv/bin/python" ]; then
  "$PY" -m venv "$LAB/.venv"
fi
VPY="$LAB/.venv/bin/python"
if ! "$VPY" -c "import torch, sam2" 2>/dev/null; then
  "$VPY" -m pip install -q --upgrade pip
  "$VPY" -m pip install -q "torch>=2.5.1" "torchvision>=0.20.1" numpy pillow opencv-python
  # SAM 2 from the official repo, pinned to the commit this lab was written against (no CUDA build on the Mac).
  SAM2_COMMIT=2b90b9f5ceec907a1c18123530e92e794ad901a4
  SAM2_BUILD_CUDA=0 "$VPY" -m pip install -q "git+https://github.com/facebookresearch/sam2.git@${SAM2_COMMIT}"
else
  echo "Python env already set up (lab/.venv); only checking the models."
fi

MODELS="${*:-tiny}"
for m in $MODELS; do
  case "$m" in
    tiny) f=sam2.1_hiera_tiny.pt ;;
    small) f=sam2.1_hiera_small.pt ;;
    base_plus) f=sam2.1_hiera_base_plus.pt ;;
    *) echo "unknown model $m (tiny | small | base_plus)"; exit 1 ;;
  esac
  if [ ! -s "$LAB/models/$f" ]; then
    echo "downloading $f ..."
    curl -fL --retry 3 -o "$LAB/models/$f.part" "https://dl.fbaipublicfiles.com/segment_anything_2/092824/$f"
    mv "$LAB/models/$f.part" "$LAB/models/$f"
  fi
done

"$VPY" - <<'PY'
import torch, sam2
print("torch", torch.__version__, "| MPS available:", torch.backends.mps.is_available(), "| sam2 at", sam2.__file__)
PY
echo
echo "Ready. Start the labelling page with:"
echo "  cd docs/focus-refs && lab/.venv/bin/python tools/lab/server.py"
