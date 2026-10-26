# Modo Foco detector — third-party notice

`FocusDetector.mlmodelc` is D-FINE-S converted to Core ML (FP16, image input) by
`docs/superpowers/spikes/focus-v2/convert/convert.py dfine_s --image-input`, then compiled with
`xcrun coremlcompiler compile`.

- **Code and architecture:** D-FINE, github.com/Peterande/D-FINE, commit `956d1709314c2c6a4df6f34de232054578a7449f`,
  Apache License 2.0. Copyright the D-FINE authors.
- **Weights:** `dfine_s_coco.pth` from github.com/Peterande/storage/releases/download/dfinev1.0/ (SHA-256
  `48a6c8cc43eb57186843f752e2e8461ddd3326e0d3c575e71e6e960844683e89`), trained on COCO 2017.
- **COCO:** annotations © the COCO Consortium, CC BY 4.0 (cocodataset.org/#termsofuse); images under the Flickr
  terms of use.

Before an App Store release: the legal check of shipping COCO-trained weights in a commercial app (spec 2026-10-24
§9) and the Apache-2.0 notice in the app's acknowledgements.
