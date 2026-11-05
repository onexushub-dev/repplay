#!/bin/bash
# Modo Foco lab, iPhone step 1, ON THE MAC: EdgeTAM -> 4 Core ML models, then track clips through them and compare
# with EdgeTAM's own predictor and with the labels, timing each model on the Mac. Every Core ML run is its own
# process, so a crash (seen on the Neural Engine) loses only that run.
# Needs lab/.venv-edgetam (setup-edgetam.sh) and the @roi40b frames of earlier tests.
#   cd docs/focus-refs && bash tools/lab/coreml-mac.sh                 # default clips
#   bash tools/lab/coreml-mac.sh bt-wa-1028 yt-bt-06                   # only these (roi40b frames)
#   EXPORT=1 bash tools/lab/coreml-mac.sh                              # convert the models again
# Each run is also saved as a oneclick track, so the framing video can be made from it, e.g.:
#   lab/.venv/bin/python tools/lab/hybrid.py --model edgetam-coreml-ne-fp16-roi40b --clips bt-wa-1028 --render
set -uo pipefail
cd "$(dirname "$0")/../.."
[ "$(uname -s)" = "Darwin" ] || { echo "Run this on the Mac (macOS)."; exit 1; }
VPY=lab/.venv-edgetam/bin/python
[ -x "$VPY" ] || { echo "Run tools/lab/setup-edgetam.sh first."; exit 1; }
export PYTHONWARNINGS=ignore
if ! "$VPY" -c "import coremltools" 2>/dev/null; then
  # lab/wheels: coremltools 9.0 and its small deps for macOS arm64 / Python 3.12, copied in when PyPI was unreachable
  if ls lab/wheels/coremltools-9.0-*.whl >/dev/null 2>&1; then
    "$VPY" -m pip install -q --no-index --find-links lab/wheels "coremltools==9.0" || exit 1
  else
    "$VPY" -m pip install -q --retries 10 --timeout 60 "coremltools==9.0" || exit 1
  fi
fi
# models from before the empty-slot switch (2026-11-03 night) have no "attention.partial" self-test: convert again
if [ "${EXPORT:-0}" = "1" ] || ! grep -q "attention.partial" lab/coreml/edgetam_constants.json 2>/dev/null; then
  "$VPY" tools/lab/coreml_export.py export || exit 1
fi
UNITS=(cpu gpu ne all)
echo "== probe: each model on each compute unit (a crash here names the model)"
for u in "${UNITS[@]}"; do
  for m in encoder attention decoder memory; do
    out=$("$VPY" tools/lab/coreml_export.py probe --units "$u" --only "$m" 2>&1); rc=$?
    if [ $rc -eq 0 ]; then echo "$out" | grep -E "OK"
    else echo "$u $m: CRASHED (exit $rc) at: $(echo "$out" | grep -E "^$u $m" | tail -1)"; echo "$out" | grep -iE "error" | tail -3; fi
  done
done
CLIPS=("$@")
[ ${#CLIPS[@]} -gt 0 ] || CLIPS=(yt-basket-04 bt-E5003B6B bt-wa-1028 yt-bt-06)
for c in "${CLIPS[@]}"; do
  if [ ! -f "lab/frames/$c@roi40b/roi.json" ]; then echo "skip $c: no lab/frames/$c@roi40b"; continue; fi
  echo "== $c"
  out=$("$VPY" tools/lab/coreml_export.py check "$c" --variant roi40b --runs official,torch 2>&1); rc=$?
  echo "$out" | grep -E "^(official|torch)"; [ $rc -eq 0 ] || { echo "$c official/torch: FAILED (exit $rc)"; echo "$out" | tail -5; }
  for u in "${UNITS[@]}"; do
    out=$("$VPY" tools/lab/coreml_export.py check "$c" --variant roi40b --runs "coreml:$u" 2>&1); rc=$?
    echo "$out" | grep -E "^coreml"; [ $rc -eq 0 ] || { echo "$c coreml:$u: CRASHED (exit $rc)"; echo "$out" | grep -iE "error" | tail -3; }
  done
  "$VPY" tools/lab/coreml_export.py report "$c" --variant roi40b
done
echo "Done. Paste everything from '== probe' on (results also in lab/tests/coreml/<clip>@roi40b/report.json)"
