"""Where Core ML would run each operation of a compiled model on this Mac (Part 3: is D-FINE-S on the Neural Engine?).

Usage: python ane_report.py <model.mlmodelc>
Prints the operations per preferred compute device (Neural Engine, GPU, CPU) and the op types left off the Neural
Engine. The iPhone may differ in details, but an op the Mac cannot place on the ANE rarely goes there on the phone.
"""

from __future__ import annotations

import collections
import sys

import coremltools as ct
from coremltools.models.compute_plan import MLComputePlan


def main() -> None:
    plan = MLComputePlan.load_from_path(path=sys.argv[1], compute_units=ct.ComputeUnit.ALL)
    program = plan.model_structure.program
    if program is None:
        sys.exit("not an ML program")
    per_device: collections.Counter = collections.Counter()
    off_ane: collections.Counter = collections.Counter()

    def walk(block) -> None:
        for op in block.operations:
            usage = plan.get_compute_device_usage_for_mlprogram_operation(op)
            device = type(usage.preferred_compute_device).__name__ if usage is not None else "none (const)"
            per_device[device] += 1
            if usage is not None and "NeuralEngine" not in device:
                off_ane[op.operator_name] += 1
            for inner in op.blocks:
                walk(inner)

    for function in program.functions.values():
        walk(function.block)
    print("operations by preferred device:")
    for device, n in per_device.most_common():
        print(f"  {device}: {n}")
    if off_ane:
        print("off the Neural Engine, by op type:")
        for name, n in off_ane.most_common(20):
            print(f"  {name}: {n}")


if __name__ == "__main__":
    main()
