#!/bin/bash
# Modo Foco lab, test 15 validation, ON THE MAC: the chosen Foco na Bola (two passes at 5 fps) on clips NOT used to
# choose the rule (one click on the ball each in the labelling page first), then ball_gate.py's verdict per clip.
# About 1 min per clip.
#   cd docs/focus-refs && bash tools/lab/mac-validate.sh 2>&1 | tee lab/tests/gate/validate.log
set -euo pipefail
cd "$(dirname "$0")/../.."
[ "$(uname -s)" = "Darwin" ] || { echo "Run this on the Mac (macOS)."; exit 1; }
PY=lab/.venv-edgetam/bin/python
CLIPS=(${CLIPS:-yt1105-basket-a yt1105-voleipraia yt1105-futevolei yt1105-volei-a yt1105-volei-b yt1105-basket-b yt1105-bt})
for c in "${CLIPS[@]}"; do
  [ -f "labels/$c.ball.json" ] || { echo "No ball click for $c: open the labelling page and click the ball once."; exit 1; }
done
mkdir -p lab/tests/gate
[ -x lab/vision-probe ] || swiftc -O tools/vision-probe.swift -o lab/vision-probe
for c in "${CLIPS[@]}"; do
  video=$($PY -c "import json; print(json.load(open('lab/frames/$c/frames.json'))['video'])")
  echo "== $c: people (Vision, whole frame + tiles as the app) and today's framing"
  [ -f "renders/$c.people.json" ] || lab/vision-probe "$video" "renders/$c.people.json"
  $PY tools/focus_variant.py "renders/$c.people.json" "$video" --preset acao --boxes tiled --out "lab/tests/framing/$c.current.focus.json"
done
echo "== two passes at 5 fps"
$PY tools/lab/low_fps.py frames --step 2 "${CLIPS[@]}"
$PY tools/lab/oneclick.py --model edgetam --fps 5 "${CLIPS[@]}"
$PY tools/lab/roi.py "${CLIPS[@]}" --size 0.4 --guide b --first edgetam-5fps --step 2
$PY tools/lab/oneclick.py --model edgetam --variant roi40b5 "${CLIPS[@]}"
echo "== the rule"
$PY tools/lab/ball_gate.py --name validate "${CLIPS[@]}"
echo "Done. Tell Claude."
