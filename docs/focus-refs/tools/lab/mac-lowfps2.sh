#!/bin/bash
# Modo Foco lab, test 14b, ON THE MAC: two passes with a sparser pass 1 (it only places pass 2's crops): pass 1 at
# 2.5 fps or 3.3 fps, pass 2 at 5 fps. After mac-lowfps.sh (needs its edgetam-roi40b5 for the report). About 12 min.
#   cd docs/focus-refs && bash tools/lab/mac-lowfps2.sh 2>&1 | tee lab/tests/lowfps/mac2.log
set -euo pipefail
cd "$(dirname "$0")/../.."
[ "$(uname -s)" = "Darwin" ] || { echo "Run this on the Mac (macOS)."; exit 1; }
PY=lab/.venv-edgetam/bin/python
CLIPS=(bt-wa-1028 yt-basket-04 yt-bt-06 volei-app-1102 basket-v-01 bt-E5003B6B bt-0AE39B33 basket-app-1031-a basket-app-1031-b)
for step in 4 3; do
  fps=$((10 / step))   # 4 -> @2 (2.5 fps), 3 -> @3 (3.3 fps)
  echo "== frames every ${step}th 100 ms frame -> lab/frames/<clip>@${fps}"
  $PY tools/lab/low_fps.py frames --step $step "${CLIPS[@]}"
  echo "== pass 1 on the whole frame -> edgetam-${fps}fps"
  $PY tools/lab/oneclick.py --model edgetam --fps $fps "${CLIPS[@]}"
  echo "== pass 2 crops at 5 fps, guided by that pass 1 -> lab/frames/<clip>@roi40b5-p${fps}"
  $PY tools/lab/roi.py "${CLIPS[@]}" --size 0.4 --guide b --first edgetam-${fps}fps --step 2 --suffix=-p${fps}
  echo "== pass 2 at 5 fps -> edgetam-roi40b5-p${fps}"
  $PY tools/lab/oneclick.py --model edgetam --variant roi40b5-p${fps} "${CLIPS[@]}"
done
echo "== report"
$PY tools/lab/low_fps.py report edgetam-roi40b5 edgetam-roi40b5-p3 edgetam-roi40b5-p2 edgetam-torch-fp16-roi40f-5fps --name mac2
echo "Done. Tell Claude."
