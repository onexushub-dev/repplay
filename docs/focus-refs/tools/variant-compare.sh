#!/bin/bash
# Modo Foco: the app's framing today (v14 "acao") next to a variant of it, on one clip (2026-10-28).
# Needs renders/zoom/<name>.people.json (tools/zoom-compare.sh makes it on the Mac) and python with cv2.
#   tools/variant-compare.sh <video> <label> [--set name=value ...]
#   tools/variant-compare.sh clips/x.mp4 lance --set lance=1 --set maxZoom=2 --set lanceMinWeight=1.5 --set widthHoldMs=0
# -> renders/zoom/<name>-<label>-lado-a-lado.mp4 (left/top ATUAL, right/bottom the label)
set -e
cd "$(dirname "$0")/.."
video=$1; label=$2; shift 2
name=$(basename "$video" .mp4)
OUT=renders/zoom
[ -f "$OUT/$name.people.json" ] || { echo "no $OUT/$name.people.json: run tools/zoom-compare.sh $video on the Mac first"; exit 1; }
if [ ! -f "$OUT/$name-atual.focus.mp4" ]; then
  python3 tools/focus_variant.py "$OUT/$name.people.json" "$video" --preset acao --boxes tiled --out "$OUT/$name-atual.focus.json"
  python3 tools/render_focus.py "$video" "$OUT/$name-atual.focus.json" --out "$OUT/$name-atual" --label "atual" >/dev/null
fi
python3 tools/focus_variant.py "$OUT/$name.people.json" "$video" --preset acao --boxes tiled "$@" --out "$OUT/$name-$label.focus.json"
python3 tools/render_focus.py "$video" "$OUT/$name-$label.focus.json" --out "$OUT/$name-$label" --label "$label" >/dev/null
IFS=x read W H < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$OUT/$name-atual.focus.mp4")
if [ "$W" -lt "$H" ]; then size=540:960; stack=hstack; else size=960:540; stack=vstack; fi
tag=$(echo "$label" | tr '[:lower:]' '[:upper:]')
ffmpeg -v error -y -i "$OUT/$name-atual.focus.mp4" -i "$OUT/$name-$label.focus.mp4" -filter_complex \
  "[0:v]scale=$size,setsar=1,drawtext=text='ATUAL':x=16:y=16:fontsize=40:fontcolor=white:borderw=3:bordercolor=black[a];[1:v]scale=$size,setsar=1,drawtext=expansion=none:text='$tag':x=16:y=16:fontsize=40:fontcolor=yellow:borderw=3:bordercolor=black[b];[a][b]$stack,fps=30,format=yuv420p" \
  -map 1:a? -c:v libx264 -preset veryfast -crf 21 -c:a aac -ar 44100 -ac 2 "$OUT/$name-$label-lado-a-lado.mp4"
echo "-> $OUT/$name-$label-lado-a-lado.mp4"
