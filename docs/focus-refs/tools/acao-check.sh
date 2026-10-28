#!/bin/bash
# Modo Foco v14 "ação" (Mac): the app's Swift FocusPath (FocusTuning.action) against the Python port on the 12 probed
# references (renders/tiles/*.people.json), so the side-by-side videos are what the app will do. Prints the largest
# difference per clip (should be ~0: rounding only).
set -e
cd "$(dirname "$0")/.."
C=../../app/modules/replay-camera/ios/Core/Sources/ReplayCore
swiftc -O $C/FocusPath.swift $C/FocusGrid.swift $C/FocusActivity.swift tools/focus-check/main.swift -o /tmp/focus-check
for people in renders/tiles/*.people.json; do
  name=$(basename "$people" .people.json)
  video=$(cat "renders/tiles/$name.video"); base=${video%.mp4}
  app=$base.focus.json; [ -f "$app" ] || app=$base.v1.focus.json
  [ -f "$app" ] || { echo "$name: no app focus file (YouTube reference), skipped"; continue; }
  /tmp/focus-check "$people" "$app" /tmp/acao-swift.json --tiled --action
  python3 tools/focus_variant.py "$people" "$app" --out /tmp/acao-py.json --boxes tiled --preset acao > /dev/null
  python3 - "$name" <<'PY'
import json, sys
a, b = json.load(open('/tmp/acao-swift.json')), json.load(open('/tmp/acao-py.json'))
d = max([abs(x - y) for k in ('landscape', 'portrait') for ra, rb in zip(a[k], b[k]) for x, y in zip(ra, rb)] or [0])
same = len(a['landscape']) == len(b['landscape']) and len(a['portrait']) == len(b['portrait'])
print(f"{sys.argv[1]:20} {'OK' if same and d < 0.002 else 'DIFERENTE'}  maior diferença {d:.4f}")
PY
done
