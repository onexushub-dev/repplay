#!/bin/bash
# Modo Foco lab: the tests that need macOS (Vision) or the Mac GPU (SAM 2). Results in docs/focus-refs/lab/tests/.
# Safe to run while the labelling page is open (they only read the labels), but slower then.
#
#   cd docs/focus-refs && bash tools/lab/mac-tests.sh            # Vision trajectories + SAM 2 one click (ball)
#   cd docs/focus-refs && bash tools/lab/mac-tests.sh person     # SAM 2 one click on the labelled players
set -euo pipefail
cd "$(dirname "$0")/../.."
[ "$(uname -s)" = "Darwin" ] || { echo "Run this on the Mac (macOS)."; exit 1; }
MODE="${1:-ball}"
mkdir -p lab/tests/vision lab/tests/oneclick

if [ "$MODE" = "ball" ]; then
  echo "== Test 3: Vision trajectories"
  swiftc -O tools/lab/vision-traj.swift -o lab/vision-traj 2>&1 | grep -v "deprecated" || true
  for f in labels/*.ball.json; do
    name=$(basename "$f" .ball.json)
    out="lab/tests/vision/$name.json"
    [ -s "$out" ] && { echo "skip $name (done)"; continue; }
    read -r video start dur < <(python3 -c "import json; m=json.load(open('lab/frames/$name/frames.json')); print(m['video'], m['startMs'], m['durMs'])")
    lab/vision-traj "$video" "$start" "$dur" "$out"
  done
fi

echo "== Test 1: SAM 2 one click ($MODE)"
lab/.venv/bin/python tools/lab/oneclick.py --mode "$MODE" --model tiny
echo
echo "Done. Tell Claude; results are in lab/tests/."
