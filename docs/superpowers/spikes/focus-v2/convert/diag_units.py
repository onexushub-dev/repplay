"""The image-input D-FINE-S on each Core ML compute unit vs the ONNX model, on the sample frame (Part 3, ANE work).

Usage: python diag_units.py <dfine_s_image.mlpackage | FocusDetector.mlmodelc> <dfine_s.onnx>
Per compute unit: NaN/inf in the heads, the largest logit and box differences to ONNX, and the people found at ≥ 0.3
(ONNX finds the reference count). A unit that gives NaN or wild differences is where the numerics break.
"""

from __future__ import annotations

import os
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import decode  # noqa: E402

SAMPLE = os.path.join(HERE, "tests/data/sample.jpg")


def main() -> None:
    import coremltools as ct
    import onnxruntime as ort
    from PIL import Image

    bgr = cv2.imread(SAMPLE)
    x, lb = decode.preprocess("dfine_s", bgr)
    ref = ort.InferenceSession(sys.argv[2], providers=["CPUExecutionProvider"]).run(None, {"images": x})
    people = lambda heads: sum(1 for d in decode.decode("dfine_s", heads, lb, conf_min=0.3) if d[0] == decode.PERSON)
    print(f"onnx: people {people(ref)}")
    rgb = cv2.cvtColor(cv2.resize(bgr, (640, 640), interpolation=cv2.INTER_LINEAR), cv2.COLOR_BGR2RGB)
    for name in ("CPU_ONLY", "CPU_AND_GPU", "CPU_AND_NE", "ALL"):
        try:
            units = getattr(ct.ComputeUnit, name)
            if sys.argv[1].rstrip("/").endswith(".mlmodelc"):
                ml = ct.models.CompiledMLModel(sys.argv[1], compute_units=units)
            else:
                ml = ct.models.MLModel(sys.argv[1], compute_units=units)
            out = ml.predict({"images": Image.fromarray(rgb)})
        except Exception as e:  # noqa: BLE001
            print(f"{name}: failed {e}")
            continue
        logits, boxes = out["output0"].astype(np.float64), out["output1"].astype(np.float64)
        bad = int((~np.isfinite(logits)).sum() + (~np.isfinite(boxes)).sum())
        dl = float(np.nanmax(np.abs(logits - ref[0]))) if bad < logits.size else float("nan")
        db = float(np.nanmax(np.abs(boxes - ref[1]))) if bad < logits.size else float("nan")
        print(f"{name}: non-finite {bad}, max |Δlogit| {dl:.3f}, max |Δbox| {db:.4f}, people {people([logits, boxes])}")


if __name__ == "__main__":
    main()
