#!/bin/bash
# Modo Foco lab, ON THE MAC: what a new clip needs for the framing test (after extract.sh and a first ball click in
# labels/<clip>.ball.json): Vision people boxes for today's framing (tools/vision-probe.swift, the app's detector)
# and the SAM 2 one-click ball track. Then Claude runs focus_variant.py + hybrid.py.
#   cd docs/focus-refs && bash tools/lab/new-clip.sh bt-wa-1028
set -euo pipefail
cd "$(dirname "$0")/../.."
[ "$(uname -s)" = "Darwin" ] || { echo "Run this on the Mac (macOS)."; exit 1; }
name="$1"
video=$(python3 -c "import json; print(json.load(open('lab/frames/$name/frames.json'))['video'])")
[ -x lab/vision-probe ] || swiftc -O tools/vision-probe.swift -o lab/vision-probe
echo "== people (Vision) on $video"
lab/vision-probe "$video" "renders/$name.people.json"
echo "== SAM 2 one click"
lab/.venv/bin/python tools/lab/oneclick.py "$name"
echo "Done. Tell Claude."
