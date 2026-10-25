#!/bin/bash
# Downloads the Modo Foco style references listed in refs.txt into ../refs/, named ref-<sport>-<nn>-<id>.<ext>.
#
# refs.txt, one per line (blank lines and lines starting with # are skipped):
#   <sport> <url> [start-end]
#   basket https://www.youtube.com/shorts/abc123
#   volei  https://www.youtube.com/watch?v=xyz789 1:20-1:45
# sport: one word, no hyphens (the hyphen separates the fields of clip names): basket, futsal, society, volei,
# beach, beachvolei, futvolei, tennis, tabletennis, padel.
# start-end (optional): only that part of a long video is downloaded.
#
# Run on the Mac (needs yt-dlp and ffmpeg: brew install yt-dlp ffmpeg):
#   cd ~/Documents/Projetos/Nexus/Lance/docs/focus-refs/tools && bash fetch-refs.sh
set -u
cd "$(dirname "$0")"
list="${1:-refs.txt}"
out="../refs"
mkdir -p "$out"
command -v yt-dlp >/dev/null || { echo "yt-dlp not found: brew install yt-dlp"; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg not found: brew install ffmpeg (without it yt-dlp falls back to 360p)"; exit 1; }
[ -f "$list" ] || { echo "missing $list (see the top of this script)"; exit 1; }

ok=0; failed=0
while read -r sport url section || [ -n "${sport:-}" ]; do
  case "$sport" in ""|\#*) continue ;; esac
  case "$sport" in *-*) echo "✗ $sport: use one word, no hyphens"; failed=$((failed+1)); continue ;; esac
  id=$(yt-dlp --print id "$url" 2>/dev/null | head -1)
  if [ -z "$id" ]; then echo "✗ $sport $url (could not read the video id)"; failed=$((failed+1)); continue; fi
  if ls "$out"/ref-"$sport"-[0-9][0-9]-"$id".* >/dev/null 2>&1; then echo "= $sport $id (already there)"; continue; fi
  n=$(ls "$out"/ref-"$sport"-[0-9][0-9]-* 2>/dev/null | wc -l | tr -d ' ')
  nn=$(printf "%02d" $((n + 1)))
  args=(-f "bv*[height<=1920]+ba/b" --merge-output-format mp4 -o "$out/ref-$sport-$nn-%(id)s.%(ext)s")
  [ -n "${section:-}" ] && args+=(--download-sections "*$section" --force-keyframes-at-cuts)
  if yt-dlp "${args[@]}" "$url" >/dev/null 2>&1; then
    echo "✓ ref-$sport-$nn-$id"; ok=$((ok+1))
  else
    echo "✗ $sport $url (download failed)"; failed=$((failed+1))
  fi
done < "$list"
echo "done: $ok downloaded, $failed failed"
