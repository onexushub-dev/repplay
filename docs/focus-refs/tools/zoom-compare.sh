#!/bin/bash
# Modo Foco zoom levels (2026-10-28), ON THE MAC (Vision + ffmpeg + python with cv2):
# the app's framing today (v14 "acao", people from the whole frame + tiles) next to the same framing zoomed in by
# 10, 20, 30, 40 and 50%, one after the other: renders/zoom/<name>-zoom-comparacao.mp4 (left ATUAL, right +N%).
# Also one side-by-side file per level: renders/zoom/<name>-zoom-<N>.mp4.
#
#   cd docs/focus-refs && tools/zoom-compare.sh clips/bt-zoom-2026-10-28.mp4
#   LEVELS="10 20" tools/zoom-compare.sh <video>   # only these levels this run
set -e
cd "$(dirname "$0")/.."
video=$1
[ -f "$video" ] || { echo "usage: tools/zoom-compare.sh <video.mp4>"; exit 1; }
name=$(basename "$video" .mp4)
OUT=renders/zoom
mkdir -p "$OUT"

if [ ! -f "$OUT/$name.people.json" ]; then
  swiftc -O tools/vision-probe.swift -o /tmp/vision-probe
  /tmp/vision-probe "$video" "$OUT/$name.people.json"
fi

echo "== atual (v14 acao)"
python3 tools/focus_variant.py "$OUT/$name.people.json" "$video" --preset acao --boxes tiled --out "$OUT/$name-atual.focus.json"
python3 tools/render_focus.py "$video" "$OUT/$name-atual.focus.json" --out "$OUT/$name-atual" --label "atual" >/dev/null

IFS=x read W H < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$OUT/$name-atual.focus.mp4")
if [ "$W" -lt "$H" ]; then size=540:960; stack=hstack; else size=960:540; stack=vstack; fi

parts=()
for pct in ${LEVELS:-10 20 30 40 50}; do
  share=$(python3 -c "print($pct / 100)")
  python3 tools/zoom_scale.py "$OUT/$name-atual.focus.json" "$OUT/$name-zoom$pct.focus.json" "$share"
  python3 tools/render_focus.py "$video" "$OUT/$name-zoom$pct.focus.json" --out "$OUT/$name-zoom$pct" --label "+$pct%" >/dev/null
  ffmpeg -v error -y -i "$OUT/$name-atual.focus.mp4" -i "$OUT/$name-zoom$pct.focus.mp4" -filter_complex \
    "[0:v]scale=$size,setsar=1,drawtext=text='ATUAL':x=16:y=16:fontsize=40:fontcolor=white:borderw=3:bordercolor=black[a];[1:v]scale=$size,setsar=1,drawtext=expansion=none:text='ZOOM +$pct%':x=16:y=16:fontsize=40:fontcolor=yellow:borderw=3:bordercolor=black[b];[a][b]$stack,fps=30,format=yuv420p" \
    -map 1:a? -c:v libx264 -preset veryfast -crf 21 -c:a aac -ar 44100 -ac 2 "$OUT/$name-zoom-$pct.mp4"
  parts+=("$OUT/$name-zoom-$pct.mp4")
done

# Every level rendered so far (LEVELS="10 20" renders only some: long clips can go in several runs).
list=$OUT/$name-concat.txt
: > "$list"
for pct in 10 20 30 40 50; do
  [ -f "$OUT/$name-zoom-$pct.mp4" ] && echo "file '$name-zoom-$pct.mp4'" >> "$list"
done
ffmpeg -v error -y -f concat -safe 0 -i "$list" -c copy "$OUT/$name-zoom-comparacao.mp4"
echo "-> $OUT/$name-zoom-comparacao.mp4 (+10% a +50%, um depois do outro) e $OUT/$name-zoom-<N>.mp4"
