#!/bin/bash
# Modo Foco lab, test 15, ON THE MAC: redo pass 2 at 5 fps (crops with the click inside them, roi.py fix of
# 2026-11-05) on clips whose pass 1 at 5 fps exists, then the rule. About 20 s per clip.
#   cd docs/focus-refs && bash tools/lab/mac-pass2.sh 2>&1 | tee lab/tests/gate/pass2.log
set -euo pipefail
cd "$(dirname "$0")/../.."
[ "$(uname -s)" = "Darwin" ] || { echo "Run this on the Mac (macOS)."; exit 1; }
PY=lab/.venv-edgetam/bin/python
CLIPS=(${CLIPS:-yt1105-basket-a yt1105-voleipraia yt1105-futevolei yt1105-volei-a yt1105-volei-b yt1105-basket-b yt1105-bt bt-rz-1105-b basket-v-01})
$PY tools/lab/roi.py "${CLIPS[@]}" --size 0.4 --guide b --first edgetam-5fps --step 2
$PY tools/lab/oneclick.py --model edgetam --variant roi40b5 "${CLIPS[@]}"
$PY tools/lab/ball_gate.py --name pass2fix "${CLIPS[@]}"
$PY tools/lab/low_fps.py fuse "${CLIPS[@]}"
$PY tools/lab/ball_gate.py --p2 edgetam-fuse5 --name fuse5fix "${CLIPS[@]}"
echo "Done. Tell Claude."
