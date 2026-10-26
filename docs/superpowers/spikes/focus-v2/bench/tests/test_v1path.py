"""The Python FocusPath v1 is the Swift one: same rects (1e-6) on the six spike fixtures, both aspects."""

from __future__ import annotations

import json
import os
import shutil
import subprocess

import pytest
from conftest import BENCH, REPO

from focusbench.v1path import grid_samples, v1_rects

CORE = os.path.join(REPO, "app/modules/replay-camera/ios/Core")
FIXTURES = os.path.join(CORE, "Tests/ReplayCoreTests/Fixtures")
NAMES = ["landscape-basketball-halfcourt", "landscape-basketball-stream", "landscape-volleyball",
         "portrait-basketball-app-motion", "portrait-basketball-app-still", "portrait-beach-tennis"]
DUMP = os.path.join(BENCH, "tools/focuspath-dump")


def load(name):
    """Read like FocusPathTests: people only, frame i at i/30 s, on the 100 ms grid."""
    with open(os.path.join(FIXTURES, f"{name}.json")) as f:
        raw = json.load(f)
    W, H = raw["W"], raw["H"]
    frames = [(fr["i"] / 30 * 1000, [((b[0]) / W, b[1] / H, (b[2] - b[0]) / W, (b[3] - b[1]) / H)
                                     for d in fr["d"] if d["k"] == "p" for b in [d["box"]]])
              for fr in raw["frames"]]
    return grid_samples(frames, 0, float("inf"), 100), W, H


def own_aspect(name):
    return "landscape" if name.startswith("landscape") else "portrait"


@pytest.fixture(scope="module")
def dump():
    if not os.path.exists(DUMP):
        if shutil.which("swiftc") is None:
            pytest.skip("swiftc not found (run on the Mac)")
        src = os.path.join(CORE, "Sources/ReplayCore")
        subprocess.run(["swiftc", "-parse-as-library", "-O", "-o", DUMP, os.path.join(BENCH, "tools/focuspath-dump.swift"),
                        os.path.join(src, "FocusPath.swift"), os.path.join(src, "FocusGrid.swift")], check=True)
    return DUMP


@pytest.mark.parametrize("name", NAMES)
def test_python_v1_matches_swift_on_all_spike_fixtures(name, dump):
    samples, W, H = load(name)
    for aspect in ("landscape", "portrait"):
        zoom = aspect == own_aspect(name)
        swift = json.loads(subprocess.run([dump, os.path.join(FIXTURES, f"{name}.json"), aspect, "1" if zoom else "0"],
                                          capture_output=True, text=True, check=True).stdout)
        ours = v1_rects(samples, W, H, aspect, zoom)
        if swift is None:
            assert ours is None
            continue
        assert ours is not None and len(ours) == len(swift)
        for a, b in zip(ours, swift):
            assert a == pytest.approx(b, abs=1e-6)


@pytest.mark.parametrize("name", NAMES)
def test_v1_rects_stay_inside_and_respect_the_zoom_cap(name):
    """Mirrors FocusPathTests, so the port is checked even without swiftc."""
    samples, W, H = load(name)
    rects = v1_rects(samples, W, H, own_aspect(name), True)
    assert rects is not None and len(rects) == len(samples)
    for x, y, w, h in rects:
        assert -1e-9 <= x and x + w <= 1 + 1e-9 and -1e-9 <= y and y + h <= 1 + 1e-9
        assert w >= 1 / 1.5 - 1e-9


def test_grid_keeps_the_people_last_seen_through_a_gap():
    frames = [(0, [(0.1, 0.1, 0.1, 0.2)]), (450, [(0.5, 0.1, 0.1, 0.2)])]
    samples = grid_samples(frames, 0, 600, 100)
    assert [t for t, _ in samples] == [0, 100, 200, 300, 400]  # stops half a step after the last frame
    assert samples[2][1] == [(0.1, 0.1, 0.1, 0.2)] and samples[4][1] == [(0.5, 0.1, 0.1, 0.2)]
