#!/bin/bash
# False triggers in real games (Mac, Vision): replays the Modo Foco reference games (many players, nobody making the
# gesture on purpose) through the app's GesturePipeline and counts the fires. Every fire is a clip the player did not
# ask for (or a celebration). Clips are linked as clips/play-<name>.mp4 (ignored by git), so report.py counts them as
# play: expected 0.
#
#   cd docs/superpowers/spikes/gesture-distance && ./play-probe.sh
set -e
cd "$(dirname "$0")"
REFS=../../../focus-refs
mkdir -p clips
link() { [ -e "clips/play-$1.mp4" ] || ln -s "$(cd "$(dirname "$2")" && pwd)/$(basename "$2")" "clips/play-$1.mp4"; }
for f in $REFS/raw-dump/2026-10-26-gravacao3/clips/*.mp4; do n=$(basename "$f"); link "bt-${n:0:8}" "$f"; done
link basket-v "$REFS/clips/basket-v-corner-normal-01.mp4"
link basket-h-side "$REFS/clips/basket-h-side-low-normal-01.mp4"
link basket-h-backlight "$REFS/clips/basket-h-corner-backlight-02.mp4"
link yt-basket-04 "$REFS/refs/h264/yt-FVUuK2ZGQtw-1m.mp4"
link yt-bt-06 "$REFS/refs/h264/yt-g4WYPBh4UNM.mp4"
./build-probe.sh
for c in clips/play-*.mp4; do
  /tmp/gesture-probe "$c"
done
python3 report.py clips/
