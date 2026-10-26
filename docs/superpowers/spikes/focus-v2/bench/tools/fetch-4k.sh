#!/usr/bin/env bash
# Downloads the 4K reference candidates (first 5 min of each) into docs/focus-refs/refs4k/.
# A video without a 2160p stream is skipped and reported, never downloaded at a lower resolution.
# Usage (repo root, on the Mac): bash docs/superpowers/spikes/focus-v2/bench/tools/fetch-4k.sh
set -u
OUT="docs/focus-refs/refs4k"
mkdir -p "$OUT"
LIST=(
  "basket-03 qQ4o_aZGvyo"
  "beachtennis-01 7TYy8G1NxzI"
  "beachtennis-02 0jRXR88c97s"
  "tabletennis-01 _nkHgZZ4lGk"
  "tabletennis-02 oTAXq3OtwhQ"
  "basket-05 FVUuK2ZGQtw"
  "volley-01 hC5cEoF7lIU"
  "tennis-01 a_90z_4CkA4"
  "tennis-02 tnxkujogch4"
  "tennis-03 4apx6gd5Uxs"
)
for row in "${LIST[@]}"; do
  name=${row%% *}; id=${row#* }
  if [ -f "$OUT/$name.mp4" ]; then echo "ok (already) $name"; continue; fi
  if ! yt-dlp -F "https://www.youtube.com/watch?v=$id" 2>/dev/null | grep -q "2160"; then
    echo "SKIP $name ($id): no 2160p stream"; continue
  fi
  yt-dlp -q --no-playlist -f "bv*[height=2160]+ba/b[height=2160]" --merge-output-format mp4 \
    --download-sections "*0:00-5:00" -o "$OUT/$name.%(ext)s" "https://www.youtube.com/watch?v=$id" \
    && echo "ok $name" || echo "FAIL $name ($id)"
done
ls -la "$OUT"
