import json
import os

import pytest

from focusbench.labels import label_path, load_labels, proposals_from, save_labels
from focusbench.tracker import HELD, LOST, PREDICTED, SEEN


def test_label_file_round_trip(tmp_path):
    path = str(tmp_path / "clip.ball.json")
    labels = {100: (0.25, 0.5), 200: "out", 300: "none"}
    save_labels(path, labels)
    with open(path) as f:
        raw = json.load(f)
    assert raw["v"] == 1 and raw["samples"]["100"] == [0.25, 0.5]
    assert load_labels(path) == labels


def test_labels_reject_out_of_range_points(tmp_path):
    with pytest.raises(ValueError):
        save_labels(str(tmp_path / "x.ball.json"), {100: (1.2, 0.5)})
    with pytest.raises(ValueError):
        save_labels(str(tmp_path / "x.ball.json"), {100: "maybe"})


def test_missing_label_file_is_empty(tmp_path):
    assert load_labels(str(tmp_path / "none.ball.json")) == {}


def test_proposals_are_the_ball_seen_or_predicted_only():
    samples = [{"t": t} for t in (0, 100, 200, 300)]
    rows = [(0.1, 0.2, SEEN, 0.5), (0.2, 0.3, PREDICTED, 0.0), (0.5, 0.4, HELD, 0.0), (0.0, 0.0, LOST, 0.0)]
    assert proposals_from(samples, rows) == {0: [0.1, 0.2], 100: [0.2, 0.3], 200: None, 300: None}


def test_label_file_lives_next_to_the_clip():
    assert label_path("/x/clips/basket-v-corner-normal-01.mp4") == "/x/clips/basket-v-corner-normal-01.ball.json"
