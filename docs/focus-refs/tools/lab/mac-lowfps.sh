#!/bin/bash
# Modo Foco lab, test 14, ON THE MAC: Foco na Bola at 5 fps (EdgeTAM on every 2nd 100 ms frame), two passes and one
# pass, on the 9 clips of tests 8-12, then the report against v6 (two passes at 10 fps). About 15 min.
#   cd docs/focus-refs && bash tools/lab/mac-lowfps.sh 2>&1 | tee lab/tests/lowfps/mac.log
set -euo pipefail
cd "$(dirname "$0")/../.."
[ "$(uname -s)" = "Darwin" ] || { echo "Run this on the Mac (macOS)."; exit 1; }
PY=lab/.venv-edgetam/bin/python
CLIPS=(bt-wa-1028 yt-basket-04 yt-bt-06 volei-app-1102 basket-v-01 bt-E5003B6B bt-0AE39B33 basket-app-1031-a basket-app-1031-b)
mkdir -p lab/tests/lowfps
echo "== frames at 5 fps (hard links)"
$PY tools/lab/low_fps.py frames "${CLIPS[@]}"
echo "== pass 1 at 5 fps, whole frame -> edgetam-5fps"
$PY tools/lab/oneclick.py --model edgetam --fps 5 "${CLIPS[@]}"
echo "== pass 2 crops, guided by pass 1, every 2nd frame -> lab/frames/<clip>@roi40b5"
$PY tools/lab/roi.py "${CLIPS[@]}" --size 0.4 --guide b --first edgetam-5fps --step 2
echo "== pass 2 at 5 fps -> edgetam-roi40b5"
$PY tools/lab/oneclick.py --model edgetam --variant roi40b5 "${CLIPS[@]}"
echo "== one pass at 5 fps, the crop following the ball -> edgetam-torch-fp16-roi40f-5fps"
$PY tools/lab/single_pass.py track "${CLIPS[@]}" --vel 1 --step 2
echo "== report"
$PY tools/lab/low_fps.py report edgetam-roi40b5 edgetam-torch-fp16-roi40f-5fps edgetam-torch-fp16-roi40f --name mac
echo "Done. Tell Claude."
