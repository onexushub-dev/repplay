"""decode.py on the ONNX models matches each upstream repo's own inference on a real Repplay frame."""

import os
import platform
import sys

import cv2
import numpy as np
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import decode  # noqa: E402

MODELS = os.environ.get("FOCUS_V2_MODELS", os.path.join(HERE, "../../../../../focus-refs/bench-out/models"))
SRC = os.environ.get("FOCUS_V2_SRC", os.path.join(MODELS, "src"))
SAMPLE = os.path.join(HERE, "data/sample.jpg")


def onnx_dets(name: str, conf_min: float = 0.3):
    ort = pytest.importorskip("onnxruntime")
    path = os.path.join(MODELS, f"{name}.onnx")
    if not os.path.exists(path):
        pytest.skip(f"{path} missing: run convert.py first")
    bgr = cv2.imread(SAMPLE)
    x, lb = decode.preprocess(name, bgr)
    session = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
    raw = session.run(None, {"images": x})
    return x, lb, raw, decode.decode(name, raw, lb, conf_min=conf_min)


def matched(ours, theirs, conf_tol=2e-3, iou_min=0.98):
    """Every upstream detection has one of ours with the same class, ~ the same box and score, and vice versa."""
    def has(dets, d):
        return any(o[0] == d[0] and abs(o[1] - d[1]) < conf_tol and decode.iou(o, d) >= iou_min for o in dets)
    return all(has(ours, t) for t in theirs) and all(has(theirs, o) for o in ours)


def test_yolox_decode_matches_upstream():
    import torch
    x, lb, raw, ours = onnx_dets("yolox_s")
    sys.path.insert(0, os.path.join(SRC, "YOLOX"))
    import convert  # noqa: E402
    from yolox.utils import postprocess  # noqa: E402

    model = convert.build_yolox_s(SRC, MODELS)
    model.head.decode_in_inference = True
    with torch.no_grad():
        out = postprocess(model(torch.from_numpy(x)), 80, 0.3, 0.45)[0].numpy()
    theirs = []
    for x1, y1, x2, y2, obj, cls_conf, cls in out:
        bx, by, bw, bh = decode._to_source(lb, np.array([(x1 + x2) / 2]), np.array([(y1 + y2) / 2]),
                                           np.array([x2 - x1]), np.array([y2 - y1]))
        theirs.append((int(cls), float(obj * cls_conf), float(bx[0]), float(by[0]), float(bw[0]), float(bh[0])))
    assert any(d[0] == decode.PERSON for d in ours), "the sample frame has players"
    assert matched(ours, theirs)


def test_dfine_decode_matches_upstream():
    import torch
    x, lb, raw, ours = onnx_dets("dfine_s")
    import convert  # noqa: E402

    model = convert.build_dfine_s(SRC, MODELS)  # puts the D-FINE repo on the path
    from src.core import YAMLConfig  # noqa: E402

    cfg = YAMLConfig(os.path.join(SRC, "D-FINE/configs/dfine/dfine_hgnetv2_s_coco.yml"))
    post = cfg.postprocessor.deploy()
    with torch.no_grad():
        logits, boxes = model(torch.from_numpy(x))
        labels, out_boxes, scores = post({"pred_logits": logits, "pred_boxes": boxes},
                                         torch.tensor([[lb.src_w, lb.src_h]]))
    theirs = [(int(c), float(s), float(b[0]) / lb.src_w, float(b[1]) / lb.src_h,
               float(b[2] - b[0]) / lb.src_w, float(b[3] - b[1]) / lb.src_h)
              for c, s, b in zip(labels[0], scores[0], out_boxes[0]) if s >= 0.3]
    assert any(d[0] == decode.PERSON for d in ours), "the sample frame has players"
    assert matched(ours, theirs)


@pytest.mark.skipif(platform.system() != "Darwin", reason="Core ML runs only on macOS")
@pytest.mark.parametrize("name", ["yolox_s", "dfine_s"])
def test_coreml_matches_onnx(name):
    import coremltools as ct
    x, lb, raw, ours = onnx_dets(name)
    ml = ct.models.MLModel(os.path.join(MODELS, f"{name}.mlpackage"))
    out = ml.predict({"images": x})
    keys = sorted(out)  # output, or output0/output1
    coreml = decode.decode(name, [out[k] for k in keys], lb, conf_min=0.3)
    assert matched(coreml, ours, conf_tol=0.02, iou_min=0.95)  # FP16
