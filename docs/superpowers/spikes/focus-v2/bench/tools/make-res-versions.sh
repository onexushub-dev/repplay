#!/usr/bin/env bash
# Rebuilds the resolution-round cuts (30 s, H.264 crf 17, 2160/1440/1080) from the downloaded 4K videos.
# The offsets are the ones the labels (refs4k/<clip>.ball.json, t = 0 at the cut start) were made on.
# Usage (repo root): bash docs/superpowers/spikes/focus-v2/bench/tools/make-res-versions.sh
set -eu
cd docs/focus-refs/refs4k; mkdir -p seg
for row in "tabletennis-02 30" "tabletennis-01 110" "beachtennis-01 0" "tennis-02 0" "basket-05 60" "volley-01 200"; do
  c=${row% *}; s=${row#* }
  [ -f "seg/$c-2160.mp4" ] && { echo "ok (already) $c"; continue; }
  ffmpeg -v error -y -ss "$s" -t 30 -i "$c.mp4" -an -filter_complex \
    "[0:v]split=3[a][b][c];[b]scale=2560:1440:flags=lanczos[b2];[c]scale=1920:1080:flags=lanczos[c2]" \
    -map "[a]" -c:v libx264 -preset veryfast -crf 17 -pix_fmt yuv420p "seg/$c-2160.mp4" \
    -map "[b2]" -c:v libx264 -preset veryfast -crf 17 -pix_fmt yuv420p "seg/$c-1440.mp4" \
    -map "[c2]" -c:v libx264 -preset veryfast -crf 17 -pix_fmt yuv420p "seg/$c-1080.mp4"
  echo "ok $c"
done
