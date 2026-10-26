# Modo Foco v2 — handoff for a new session (2026-10-25)

Read in this order: this file → `NEXT.md` (open items) → spec `docs/superpowers/specs/2026-10-24-focus-ball-tracking-design.md`
(§13 first: the 2026-10-25 amendment wins over §1–12) → `TUNING.md` (all bench numbers) → plan
`docs/superpowers/plans/2026-10-25-focus-v2-part2-replaycore.md` (next to execute, awaiting Victor's review) → Part 1 plan
(task 2 still to run on the phones).

## Working rules (Victor)

- Victor runs every git write command (commit, push, branch). Suggest the commands and messages; never run them.
- TypeScript: no optional chaining (`?.`); explicit checks.
- Specs, plans and technical docs in English (file names too). Talk to Victor in Brazilian Portuguese.
- Free resources only; no AGPL/GPL code or weights (no Ultralytics, no YOLOv5/v8/v9/v10). Check the repo's `LICENSE`.
- Model weights from outside: load with `torch.load(..., weights_only=True)` in an isolated place; ship only ONNX/Core ML.

## Where things are (all under `docs/focus-refs/`, git-ignored media and results)

| What | Path |
|---|---|
| 37 app basketball clips + labels (`<clip>.ball.json`) + manifest | `clips/` |
| YOLOX-S / D-FINE-S detections of those clips | `bench-out/det/` |
| Label frames (app clips / 4K clips) | `bench-out/label/`, `bench-out/label4k/` |
| Models: YOLOX-S, D-FINE-S (ONNX + mlpackage); WASB ×4, TrackNetV3 ×2 (ONNX); original weights | `bench-out/models/`, `bench-out/models/ext/onnx/`, `bench-out/models/ext/` |
| 4K YouTube downloads + labels (t = 0 at the cut start) | `refs4k/<clip>.mp4`, `refs4k/<clip>.ball.json` |
| Resolution cuts (2160/1440/1080, 30 s) — rebuild with `bench/tools/make-res-versions.sh` | `refs4k/seg/` |
| D-FINE-S detections per resolution (with motion scores per ball candidate) | `refs4k/seg/det/` |
| WASB full-frame results; WASB 2×2 and TrackNetV3 results | `refs4k/seg/wasb/`, `refs4k/seg/balls/` |
| Blind sharpness videos and their keys | `refs4k/blind/`, `refs4k/blind/keys/` |
| Motion scores for the 8-clip D-FINE subset (test D) | `bench-out/motion/` |
| Fetch script for the 4K videos | `docs/superpowers/spikes/focus-v2/bench/tools/fetch-4k.sh` |

## Code

- Bench (kept tooling, pytest): `docs/superpowers/spikes/focus-v2/bench/` (`focusbench/`, `run.py`, `label/index.html`).
  Python venv: `bench/.venv` (`pip install -r requirements.txt`).
- Round-2 scripts (resolution round, ball models, final comparison), not yet folded into `focusbench`:
  `bench/round2/`. They were written for a Linux container with absolute paths (`/root/lance/...`, `/root/extw/...`,
  `/root/ext/WASB-SBDT`, `/root/ext/TrackNetV3`); edit the path constants at the top before running. `resdet_mac.py`
  and `balls_mac.py` (in `refs4k/`) are the Mac versions that ran there. Part 2 task 1 moves the final logic into
  `focusbench` (filters, policy, ball-led path, fixtures).
- Upstream repos used read-only (MIT): `github.com/nttcom/WASB-SBDT` (HRNet model, `src/configs/model/wasb.yaml`),
  `github.com/qaz812345/TrackNetV3` (`model.py`, `TrackNet(27, 8)`).

## Key numbers to remember

- Basketball app clips: ball framing never beat players framing; players framing at 3× cap: 97% ball in crop, zoom 2.0.
- Resolution only helps detection with a denser grid; blind test: no visible sharpness difference at ≤ 2.25× zoom.
- Tennis: ball-led 98% in crop at zoom 2.1 vs players 62%, ball from the filtered detector (WASB: 95% recall but 93%
  in crop); Victor approved the ball-led video and, on 2026-10-26, the detector as tennis's ball source.
- Volleyball: ball-led 95–97% at ≤ 1.5×. Beach tennis: no ball source works (≤ 13%).
