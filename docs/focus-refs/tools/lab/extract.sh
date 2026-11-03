#!/bin/bash
# Lab step 1: frames for the labelling page and SAM 2, one JPEG every 100 ms (10 fps), long side 1280 px, upright.
# FPS=20 or FPS=30 writes a denser copy to lab/frames/<name>@<fps>/ (tracker tests; the page and the scores keep 10 fps).
# Writes ../../lab/frames/<name>/00000.jpg ... (SAM 2 wants integer names) and frames.json (time of each frame).
# Needs ffmpeg + python3. Skips clips already extracted (delete the folder to redo).
#   cd docs/focus-refs && tools/lab/extract.sh [name ...]
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=lab/frames
FPS="${FPS:-10}"
mkdir -p "$OUT"
grep -v '^#' tools/lab/clips.txt | grep -v '^$' | while IFS='|' read -r name video start dur sport; do
  if [ $# -gt 0 ] && ! printf '%s\n' "$@" | grep -qx "$name"; then continue; fi
  dir="$OUT/$name"
  [ "$FPS" = "10" ] || dir="$OUT/$name@$FPS"
  if [ -f "$dir/frames.json" ]; then echo "skip $name"; continue; fi
  [ -f "$video" ] || { echo "MISSING $name: $video"; continue; }
  mkdir -p "$dir"
  ss=$(python3 -c "print($start/1000)"); t=$(python3 -c "print($dur/1000)")
  # -ss before -i seeks to the keyframe and decodes exactly from start; fps=10 picks the frame at each 100 ms tick.
  ffmpeg -nostdin -v error -ss "$ss" -i "$video" -t "$t" \
    -vf "fps=$FPS:start_time=0,scale='if(gt(iw,ih),1280,-2)':'if(gt(iw,ih),-2,1280)'" \
    -q:v 3 -start_number 0 "$dir/%05d.jpg" < /dev/null
  python3 - "$dir" "$name" "$video" "$start" "$dur" "$sport" "$FPS" <<'PY'
import json, os, sys
from PIL import Image
d, name, video, start, dur, sport, fps = sys.argv[1:]
files = sorted(f for f in os.listdir(d) if f.endswith(".jpg"))
w, h = Image.open(os.path.join(d, files[0])).size
json.dump({"name": name, "video": video, "startMs": int(start), "durMs": int(dur), "sport": sport,
           "stepMs": 1000 / int(fps), "fps": int(fps), "count": len(files), "size": [w, h]}, open(os.path.join(d, "frames.json"), "w"))
print(f"{name}: {len(files)} frames {w}x{h}")
PY
done
