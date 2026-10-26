from __future__ import annotations

import os

import pytest
from conftest import CLIPS

from focusbench.clips import ClipInfo, frames_on_grid, load_manifest, parse_name


def clip(name):
    path = os.path.join(CLIPS, name)
    if not os.path.exists(path):
        pytest.skip(f"{path} missing (local media)")
    return path


def test_parse_name_reads_every_field():
    assert parse_name("basket-h-side-high-shot-cam4k-01.mp4") == ClipInfo("basket", "h", "side-high", "shot", True, 1)
    info = parse_name("basket-v-corner-unavailable-05.mp4")
    assert (info.cam4k, info.n, info.case) == (False, 5, "unavailable")
    with pytest.raises(ValueError):
        parse_name("foo.mp4")
    with pytest.raises(ValueError):
        parse_name("beach-volei-h-corner-normal-01.mp4")  # sport names have no hyphen


def test_manifest_has_one_row_per_clip_with_its_fields():
    rows = load_manifest(os.path.join(CLIPS, "manifest.csv"))
    names = [r["file"] for r in rows]
    assert "basket-v-corner-normal-01.mp4" in names and len(names) == len(set(names))
    assert all(parse_name(n) for n in names)


def test_raw_app_clip_is_read_upright():
    first = next(frames_on_grid(clip("basket-v-corner-normal-01.mp4"), 29984, 31000))
    assert first.image.shape == (1920, 1080, 3)


def test_grid_picks_first_frame_at_or_after_each_tick_at_29_97_fps():
    frames = list(frames_on_grid(clip("basket-v-corner-normal-08.mp4"), 30014, 33014))
    assert [f.tick for f in frames] == [30014 + 100 * k for k in range(30)]
    assert all(f.tick - 0.5 <= f.t < f.tick + 100 - 0.5 for f in frames)
    assert frames[0].image.shape == (1280, 720, 3)  # 720p kept: never scaled up


def test_long_side_is_scaled_down_to_the_limit():
    first = next(frames_on_grid(clip("basket-v-corner-normal-01.mp4"), 29984, 30100, long_side=960))
    assert first.image.shape == (960, 540, 3)
