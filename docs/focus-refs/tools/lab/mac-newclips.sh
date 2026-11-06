#!/bin/bash
# Modo Foco lab, test 14 on new clips, ON THE MAC (after one click on the ball per clip in the labelling page):
# people (Vision) -> today's framing -> v6 (two passes at 10 fps) and the 5 fps versions (2 x 5 fps, pass 1 at 3.3 fps
# + pass 2 at 5 fps, one pass at 5 fps) -> report. About 20 min for the six 2026-11-05 clips.
#   cd docs/focus-refs && bash tools/lab/mac-newclips.sh 2>&1 | tee lab/tests/lowfps/newclips.log
set -euo pipefail
cd "$(dirname "$0")/../.."
[ "$(uname -s)" = "Darwin" ] || { echo "Run this on the Mac (macOS)."; exit 1; }
PY=lab/.venv-edgetam/bin/python
CLIPS=(${CLIPS:-bt-rz-1105-a bt-rz-1105-b bt-rz-1105-v basket-rp-1105-h basket-rp-1105-v-a basket-rp-1105-v-b})
for c in "${CLIPS[@]}"; do
  [ -f "labels/$c.ball.json" ] || { echo "No ball click for $c: open the labelling page and click the ball once."; exit 1; }
done
mkdir -p lab/tests/lowfps
[ -x lab/vision-probe ] || swiftc -O tools/vision-probe.swift -o lab/vision-probe
for c in "${CLIPS[@]}"; do
  video=$($PY -c "import json; print(json.load(open('lab/frames/$c/frames.json'))['video'])")
  echo "== $c: people (Vision) and today's framing"
  [ -f "renders/$c.people.json" ] || lab/vision-probe "$video" "renders/$c.people.json"
  $PY tools/focus_variant.py "renders/$c.people.json" "$video" --preset acao --boxes tiled --out "lab/tests/framing/$c.current.focus.json"
done
echo "== v6: pass 1 (10 fps, whole frame), pass 2 (roi40b)"
$PY tools/lab/oneclick.py --model edgetam --no-fixes "${CLIPS[@]}"
$PY tools/lab/roi.py "${CLIPS[@]}" --size 0.4 --guide b --first edgetam
$PY tools/lab/oneclick.py --model edgetam --variant roi40b "${CLIPS[@]}"
echo "== 2 x 5 fps"
$PY tools/lab/low_fps.py frames --step 2 "${CLIPS[@]}"
$PY tools/lab/oneclick.py --model edgetam --fps 5 "${CLIPS[@]}"
$PY tools/lab/roi.py "${CLIPS[@]}" --size 0.4 --guide b --first edgetam-5fps --step 2
$PY tools/lab/oneclick.py --model edgetam --variant roi40b5 "${CLIPS[@]}"
echo "== pass 1 at 3.3 fps + pass 2 at 5 fps"
$PY tools/lab/low_fps.py frames --step 3 "${CLIPS[@]}"
$PY tools/lab/oneclick.py --model edgetam --fps 3 "${CLIPS[@]}"
$PY tools/lab/roi.py "${CLIPS[@]}" --size 0.4 --guide b --first edgetam-3fps --step 2 --suffix=-p3
$PY tools/lab/oneclick.py --model edgetam --variant roi40b5-p3 "${CLIPS[@]}"
echo "== one pass at 5 fps"
$PY tools/lab/single_pass.py track "${CLIPS[@]}" --vel 1 --step 2
echo "== report"
$PY tools/lab/low_fps.py report edgetam-roi40b5 edgetam-roi40b5-p3 edgetam-torch-fp16-roi40f-5fps --name newclips \
  --clips "${CLIPS[@]}"
echo "Done. Tell Claude."
