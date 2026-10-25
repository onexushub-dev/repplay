"""Converts a Modo Foco v2 candidate detector to ONNX and Core ML (spec 2026-10-24, step 0; plan part 1, task 1).

Usage: python convert.py <yolox_s|dfine_s> --src <dir with the cloned repos> --weights <dir with the .pth> --out <dir>

The models return their raw heads; decoding and NMS live in decode.py (and later in Swift), so both sides share one
decoder. Input: 1×3×640×640 float, prepared by decode.preprocess for that model.
"""

import argparse
import os
import sys

import torch
import torch.nn as nn


def build_yolox_s(src: str, weights: str) -> nn.Module:
    sys.path.insert(0, os.path.join(src, "YOLOX"))
    from yolox.exp import get_exp  # noqa: E402

    exp = get_exp(None, "yolox-s")
    model = exp.get_model()
    state = torch.load(os.path.join(weights, "yolox_s.pth"), map_location="cpu", weights_only=False)
    model.load_state_dict(state["model"])
    model.head.decode_in_inference = False  # raw (1, 8400, 85): x, y, w, h (grid units), obj logit… after sigmoid
    model.eval()
    return model


def build_dfine_s(src: str, weights: str) -> nn.Module:
    root = os.path.join(src, "D-FINE")
    sys.path.insert(0, root)
    from src.core import YAMLConfig  # noqa: E402
    from src.zoo.dfine import dfine_decoder  # noqa: E402

    def integral(self, x, project):
        # Same as upstream `F.linear(x, project)` with a 1-D `project`, as a matmul Core ML accepts.
        shape = x.shape
        x = torch.softmax(x.reshape(-1, self.reg_max + 1), dim=1)
        x = torch.matmul(x, project.to(x.device).reshape(-1, 1)).reshape(-1, 4)
        return x.reshape(list(shape[:-1]) + [-1])

    dfine_decoder.Integral.forward = integral

    cfg = YAMLConfig(os.path.join(root, "configs/dfine/dfine_hgnetv2_s_coco.yml"))
    if "HGNetv2" in cfg.yaml_cfg:
        cfg.yaml_cfg["HGNetv2"]["pretrained"] = False
    state = torch.load(os.path.join(weights, "dfine_s_coco.pth"), map_location="cpu", weights_only=False)
    cfg.model.load_state_dict(state["ema"]["module"] if "ema" in state else state["model"])

    class Raw(nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.model = cfg.model.deploy()

        def forward(self, images):
            out = self.model(images)
            return out["pred_logits"], out["pred_boxes"]  # (1, 300, 80) logits, (1, 300, 4) cx, cy, w, h in 0..1

    model = Raw()
    model.eval()
    return model


def _patch_coremltools_cast() -> None:
    """coremltools 9 casts constants with `int(x.val)`, which fails on 1-element arrays (D-FINE has a few). Same value."""
    import numpy as np
    from coremltools.converters.mil.frontend.torch import ops

    original = ops._cast

    def cast(context, node, dtype, dtype_name):
        x = ops._get_inputs(context, node, expected=1)[0]
        if x.val is not None and isinstance(x.val, np.ndarray) and x.val.size == 1:
            context.add(ops.mb.const(val=dtype(x.val.reshape(()).item()), name=node.name))
            return
        original(context, node, dtype, dtype_name)

    ops._cast = cast


BUILDERS = {"yolox_s": build_yolox_s, "dfine_s": build_dfine_s}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("name", choices=sorted(BUILDERS))
    p.add_argument("--src", required=True)
    p.add_argument("--weights", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--no-coreml", action="store_true")
    a = p.parse_args()
    os.makedirs(a.out, exist_ok=True)

    model = BUILDERS[a.name](a.src, a.weights)
    example = torch.rand(1, 3, 640, 640)
    with torch.no_grad():
        outputs = model(example)
    names = ["output"] if isinstance(outputs, torch.Tensor) else [f"output{i}" for i in range(len(outputs))]

    onnx_path = os.path.join(a.out, f"{a.name}.onnx")
    torch.onnx.export(model, (example,), onnx_path, input_names=["images"], output_names=names, opset_version=17,
                      do_constant_folding=True, dynamo=False)
    print("onnx:", onnx_path)

    if a.no_coreml:
        return
    import coremltools as ct

    _patch_coremltools_cast()
    traced = torch.jit.trace(model, example)
    ml = ct.convert(
        traced,
        inputs=[ct.TensorType(name="images", shape=example.shape)],
        outputs=[ct.TensorType(name=n) for n in names],
        convert_to="mlprogram",
        compute_precision=ct.precision.FLOAT16,
        compute_units=ct.ComputeUnit.ALL,
        minimum_deployment_target=ct.target.iOS16,
    )
    ml_path = os.path.join(a.out, f"{a.name}.mlpackage")
    ml.save(ml_path)
    print("coreml:", ml_path)


if __name__ == "__main__":
    main()
