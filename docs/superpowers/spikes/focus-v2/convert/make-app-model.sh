#!/usr/bin/env bash
# Builds the app's Modo Foco detector (Part 3 plan, task 2) on a Mac with Xcode:
# D-FINE-S → Core ML with an image input → parity test against the ONNX bench model → FocusDetector.mlmodelc in the pod.
# Run from this folder: ./make-app-model.sh   (needs Python 3.10+, git, curl, Xcode command line tools)
# PYTHON=/path/to/python3.x picks the interpreter; otherwise the newest of python3.13 … python3.10 on the PATH.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../../../.." && pwd)"
MODELS="$REPO/docs/focus-refs/bench-out/models"
APP_MODELS="$REPO/app/modules/replay-camera/ios/Models"
WORK="${FOCUS_V2_WORK:-$HOME/.cache/repplay-focus-v2}"   # outside the repo: the cloned code and weights stay isolated
DFINE_COMMIT="956d1709314c2c6a4df6f34de232054578a7449f"
WEIGHTS_URL="https://github.com/Peterande/storage/releases/download/dfinev1.0/dfine_s_coco.pth"
WEIGHTS_SHA="48a6c8cc43eb57186843f752e2e8461ddd3326e0d3c575e71e6e960844683e89"

mkdir -p "$WORK/src" "$WORK/weights"
if [ ! -d "$WORK/src/D-FINE" ]; then
  git clone https://github.com/Peterande/D-FINE.git "$WORK/src/D-FINE"
fi
git -C "$WORK/src/D-FINE" checkout --quiet "$DFINE_COMMIT"

if [ ! -f "$WORK/weights/dfine_s_coco.pth" ]; then
  curl -L --fail -o "$WORK/weights/dfine_s_coco.pth" "$WEIGHTS_URL"
fi
echo "$WEIGHTS_SHA  $WORK/weights/dfine_s_coco.pth" | shasum -a 256 -c -

PY="${PYTHON:-}"
if [ -z "$PY" ]; then
  for v in 3.13 3.12 3.11 3.10; do
    if command -v "python$v" >/dev/null 2>&1; then PY="python$v"; break; fi
  done
fi
if [ -z "$PY" ]; then
  echo "Python 3.10 or newer is needed (macOS's python3 is 3.9). Install one, e.g. 'brew install python@3.13'," >&2
  echo "then run again (or PYTHON=/path/to/python3.x ./make-app-model.sh)." >&2
  exit 1
fi
if [ ! -d "$WORK/venv" ]; then
  echo "Python: $("$PY" --version)"
  "$PY" -m venv "$WORK/venv"
  "$WORK/venv/bin/pip" install -q -r "$HERE/requirements.txt"
fi

"$WORK/venv/bin/python" "$HERE/convert.py" dfine_s --image-input --src "$WORK/src" --weights "$WORK/weights" --out "$MODELS"
FOCUS_V2_MODELS="$MODELS" FOCUS_V2_SRC="$WORK/src" \
  "$WORK/venv/bin/python" -m pytest "$HERE/tests/test_decode.py" -k "image_input" -v

rm -rf "$WORK/compiled" && mkdir -p "$WORK/compiled"
xcrun coremlcompiler compile "$MODELS/dfine_s_image.mlpackage" "$WORK/compiled"
rm -rf "$APP_MODELS/FocusDetector.mlmodelc"
cp -R "$WORK/compiled/dfine_s_image.mlmodelc" "$APP_MODELS/FocusDetector.mlmodelc"
du -sh "$APP_MODELS/FocusDetector.mlmodelc"
echo "Done: $APP_MODELS/FocusDetector.mlmodelc"
