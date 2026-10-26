# Modo Foco v2 bench

Measures Modo Foco framings (v1 and v2) on Victor's clips against the spec §1 targets
(`docs/superpowers/specs/2026-10-24-focus-ball-tracking-design.md`). Plan: `docs/superpowers/plans/2026-10-24-focus-v2-part1-spike-and-bench.md`.

Data stays local and out of git: clips in `docs/focus-refs/clips/` (described by `manifest.csv`), outputs in
`docs/focus-refs/bench-out/`. Models: `docs/focus-refs/bench-out/models/<name>.onnx` (see `../convert/`).

## Setup

```bash
cd docs/superpowers/spikes/focus-v2/bench
python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
python -m pytest tests -v        # tests that need local media skip when it is missing
```

`FOCUS_REFS_CLIPS=<dir>` points the tests at another clips folder.

## Modules

| Module | What |
|---|---|
| `focusbench/clips.py` | clip names, manifest, frames on the 100 ms grid (upright, first frame at or after each tick) |
