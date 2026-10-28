#!/bin/bash
# Modo Foco x gesture tiles (2026-10-28), step 1 of 2, ON THE MAC (Vision):
# runs the fixed vision-probe.swift on the comparison clips -> renders/tiles/<name>.people.json (whole frame + tiles).
# The app is not touched. Step 2 (any machine with ffmpeg + python): tools/tiles-compare.sh.
#
#   cd docs/focus-refs && tools/tiles-probe.sh            # every clip below
#   cd docs/focus-refs && tools/tiles-probe.sh bt-E5003B6B basket-v   # only the names given
#   cd docs/focus-refs && tools/tiles-probe.sh yt-basket-01 yt-basket-02 yt-basket-03 yt-basket-04 yt-bt-01 yt-bt-02 yt-bt-03 yt-bt-04 yt-bt-05 yt-bt-06
set -e
cd "$(dirname "$0")/.."
mkdir -p renders/tiles
swiftc -O tools/vision-probe.swift -o /tmp/vision-probe

# name|video (the app's focus file for the cut and size sits next to it: <video>.focus.json or <video>.v1.focus.json;
# the YouTube references have none: the whole video is used). refs/h264: the references re-encoded to H.264, since
# AVFoundation does not read their VP9/AV1 (ffmpeg -c:v libx264 -crf 18).
CLIPS="
bt-0AE39B33|raw-dump/2026-10-26-gravacao3/clips/0AE39B33-6E44-4ECB-9B42-22DC3F26E1A2.mp4
bt-3B5E767B|raw-dump/2026-10-26-gravacao3/clips/3B5E767B-B19F-4755-B4DD-FA56018DE3A6.mp4
bt-4FAE71F7|raw-dump/2026-10-26-gravacao3/clips/4FAE71F7-45B5-4FEA-B631-B751EA548338.mp4
bt-8CB51DB7|raw-dump/2026-10-26-gravacao3/clips/8CB51DB7-B783-4123-AD6C-A25A699FBC38.mp4
bt-90E61BC6|raw-dump/2026-10-26-gravacao3/clips/90E61BC6-41A1-4F9F-A52C-3B79C8705154.mp4
bt-E5003B6B|raw-dump/2026-10-26-gravacao3/clips/E5003B6B-23F9-441B-883B-0BB6694302B4.mp4
bt-FE553F05|raw-dump/2026-10-26-gravacao3/clips/FE553F05-*.mp4
basket-v|clips/basket-v-corner-normal-01.mp4
basket-h-side|clips/basket-h-side-low-normal-01.mp4
basket-h-backlight|clips/basket-h-corner-backlight-02.mp4
yt-basket-01|refs/h264/ref-basket-01-luv6nofiPKQ.mp4
yt-basket-02|refs/h264/ref-basket-02-b3z3tpjeh2U.mp4
yt-basket-03|refs/h264/ref-basket-03-kMVG_ioWRA8.mp4
yt-basket-04|refs/h264/yt-FVUuK2ZGQtw-1m.mp4
yt-bt-01|refs/h264/ref-beach-01-cCX4RyCd1z8.mp4
yt-bt-02|refs/h264/ref-beach-02-XUcS5jDB8b8.mp4
yt-bt-03|refs/h264/ref-beach-03-JF2r7Ksn1kg.mp4
yt-bt-04|refs/h264/ref-beach-04-t4oHOM2tNeg.mp4
yt-bt-05|refs/h264/ref-beach-05-6gHK1cX7fLM.mp4
yt-bt-06|refs/h264/yt-g4WYPBh4UNM.mp4
"

for line in $CLIPS; do
  name=${line%%|*}
  video=$(ls ${line#*|} 2>/dev/null | head -1)
  if [ $# -gt 0 ] && [[ ! " $* " == *" $name "* ]]; then continue; fi
  if [ -z "$video" ]; then echo "skip $name: video not found"; continue; fi
  echo "== $name ($video)"
  /tmp/vision-probe "$video" "renders/tiles/$name.people.json"
  echo "$video" > "renders/tiles/$name.video"
done
echo "done: now tools/tiles-compare.sh"
