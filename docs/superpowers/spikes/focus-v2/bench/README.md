# Modo Foco v2 bench

Measures Modo Foco framings (v1 and v2) on Victor's clips against the spec §1 targets
(`docs/superpowers/specs/2026-10-24-focus-ball-tracking-design.md`). Plan: `docs/superpowers/plans/2026-10-24-focus-v2-part1-spike-and-bench.md`.

Data stays local and out of git: clips in `docs/focus-refs/clips/` (described by `manifest.csv`), outputs in
`docs/focus-refs/bench-out/`. Models: `docs/focus-refs/bench-out/models/<name>.onnx` (see `../convert/`).

## Setup

```bash
cd docs/superpowers/spikes/focus-v2/bench
python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt   # Python 3.9+
python -m pytest tests -v        # tests that need local media skip when it is missing
```

`FOCUS_REFS_CLIPS=<dir>` points the tests at another clips folder.

## Modules

| Module | What |
|---|---|
| `focusbench/clips.py` | clip names, manifest, frames on the 100 ms grid (upright, first frame at or after each tick) |
| `focusbench/v1path.py` | FocusPath v1 + FocusGrid ported from ReplayCore; `tests/test_v1path.py` compares it with the Swift build (`tools/focuspath-dump.swift`, compiled by the test; needs `swiftc`, so the Mac) |
| `focusbench/tracker.py` | ball tracker prototype (spec §4.2): static filter, Kalman + RTS, predicted/held/lost gaps |
| `focusbench/path_v2.py` | FocusPath v2 prototype (spec §4.3): ball + nearest players, look-ahead, lead, dead zone, speed/accel limits; `TUNING_V2` |
| `focusbench/labels.py` | ball label files (`clips/<clip>.ball.json`, kept in git) and the proposals for the labelling page |
| `focusbench/metrics.py` | spec §1 metrics per clip (ball in crop over labelled in-play samples, mean zoom, jerk) and overall |
| `label/index.html` | labelling page: open from Finder, pick `bench-out/label/<clip>/`, label, download `<clip>.ball.json` into `clips/` |
| `focusbench/report.py` | report: targets ✓/✗, per-clip table v1 → v2, tuning; side-by-side preview videos (v1 | v2) |
| `focusbench/detect.py` | candidate model (ONNX) per sample, tiles when players are small, NMS, cache in `bench-out/det/` |

## Commands

```bash
python run.py detect  --model yolox_s [--clips 'basket-v-*'] [--threads 2] [--refresh]
python run.py propose --model yolox_s [--clips 'basket-v-*']    # then open label/index.html
python run.py all     --model yolox_s [--clips 'basket-v-*'] [--previews]   # bench-out/report-*.md (+ preview/*.mp4)
python run.py compare --models yolox_s,dfine_s [--clips 'basket-v-*']       # bench-out/compare-*.md
```

Detection is the slow step (CPU: ~4 min per 30 s clip with tiles); results are cached per clip and model, so an
interrupted run resumes where it stopped.
