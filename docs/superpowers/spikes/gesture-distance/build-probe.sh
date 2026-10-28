#!/bin/sh
# Compiles the gesture probe (macOS) from the app's own sources: ReplayCore gesture logic + GesturePipeline.
set -e
cd "$(dirname "$0")"
IOS=../../../../app/modules/replay-camera/ios
CORE=$IOS/Core/Sources/ReplayCore
swiftc -O \
  $CORE/ArmsUp.swift $CORE/WaveTracker.swift $CORE/PersonCrop.swift $CORE/PersonTracks.swift $CORE/ScanTiles.swift \
  $IOS/GesturePipeline.swift probe/main.swift \
  -o /tmp/gesture-probe
echo "built /tmp/gesture-probe"
