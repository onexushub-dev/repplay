#!/bin/bash
# Modo Foco x gesture tiles (2026-10-28), step 2 of 2 (ffmpeg + python, after tools/tiles-probe.sh on the Mac):
# for each renders/tiles/<name>.people.json, the framing the app makes today (people from the whole frame) and the
# same FocusPath with the people the gesture's tiles find, rendered side by side: renders/tiles/<name>-lado-a-lado.mp4
# (left/top: ATUAL, right/bottom: COM PARTES DO QUADRO). Also prints how many people each found in the clip's cut.
# Nothing in the app changes: same FocusPath and tuning (Python port), only the input people differ.
#
#   cd docs/focus-refs && tools/tiles-compare.sh            # every probed clip
#   cd docs/focus-refs && tools/tiles-compare.sh bt-E5003B6B
#   NEW="--set activity=1" LABEL="PARTES + ATIVIDADE" SUFFIX=atividade tools/tiles-compare.sh   # a tuning on the right
set -e
NEW=${NEW:-}
LABEL=${LABEL:-COM PARTES DO QUADRO}
SUFFIX=${SUFFIX:-partes}
cd "$(dirname "$0")/.."
OUT=renders/tiles

for people in $OUT/*.people.json; do
  name=$(basename "$people" .people.json)
  if [ $# -gt 0 ] && [[ ! " $* " == *" $name "* ]]; then continue; fi
  video=$(cat "$OUT/$name.video")
  base=${video%.mp4}
  app=$base.focus.json; [ -f "$app" ] || app=$base.v1.focus.json
  [ -f "$app" ] || app=$video   # a video the app never saw (YouTube references): the whole of it
  echo "== $name"
  python3 tools/focus_variant.py "$people" "$app" --out "$OUT/$name-atual.focus.json" --boxes full
  python3 tools/focus_variant.py "$people" "$app" --out "$OUT/$name-$SUFFIX.focus.json" --boxes tiled $NEW
  python3 - "$people" "$app" <<'PY'
import json, sys
import subprocess
probe = json.load(open(sys.argv[1]))
if sys.argv[2].endswith(".json"):
    app = json.load(open(sys.argv[2]))
    start = app["startMs"]; end = start + max(len(app["landscape"]), len(app["portrait"])) * app["stepMs"]
    H = app["size"][1]
else:
    start, end = 0, float("inf")
    H = int(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=height",
                            "-of", "csv=p=0", sys.argv[2]], capture_output=True, text=True).stdout.strip())
s = [x for x in probe["samples"] if start - 0.5 <= x["t"] < end]
for key, label in (("full", "atual (quadro inteiro)"), ("tiled", "com partes do quadro")):
    n = [len(x[key]) for x in s]
    hs = sorted(b[3] * H for x in s for b in x[key])
    small = sum(1 for h in hs if h < 0.1 * H)
    print(f"  {label:24}: {sum(n) / max(1, len(n)):.1f} pessoas/quadro, quadros com alguém {100 * sum(1 for k in n if k) / max(1, len(n)):.0f}%, "
          f"pessoas pequenas (<10% da altura) {small}, menor {hs[0] if hs else 0:.0f} px")
PY
  python3 tools/render_focus.py "$video" "$OUT/$name-atual.focus.json" --out "$OUT/$name-atual" --label "atual" >/dev/null
  python3 tools/render_focus.py "$video" "$OUT/$name-$SUFFIX.focus.json" --out "$OUT/$name-$SUFFIX" --label "$LABEL" >/dev/null
  # Side by side for vertical framings, one above the other for horizontal ones.
  IFS=, read W H < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$OUT/$name-atual.focus.mp4")
  if [ "$W" -lt "$H" ]; then size=540:960; stack=hstack; else size=960:540; stack=vstack; fi
  ffmpeg -v error -y -i "$OUT/$name-atual.focus.mp4" -i "$OUT/$name-$SUFFIX.focus.mp4" -filter_complex \
    "[0:v]scale=$size,drawtext=text='ATUAL':x=16:y=16:fontsize=36:fontcolor=white:borderw=3:bordercolor=black[a];[1:v]scale=$size,drawtext=text='$LABEL':x=16:y=16:fontsize=36:fontcolor=white:borderw=3:bordercolor=black[b];[a][b]$stack" \
    -map 1:a? -c:v libx264 -preset veryfast -crf 21 -c:a aac "$OUT/$name-lado-a-lado-$SUFFIX.mp4"
  echo "  -> $OUT/$name-lado-a-lado-$SUFFIX.mp4 (e $name-atual.compare.mp4 / $name-$SUFFIX.compare.mp4 com o quadro inteiro)"
done
