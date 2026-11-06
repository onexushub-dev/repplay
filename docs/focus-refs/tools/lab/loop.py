#!/usr/bin/env python3
"""Modo Foco lab, iPhone step 1a: EdgeTAM's video tracking rebuilt from separate parts, as an app would run it.

On a phone the tracker cannot be one PyTorch call: it is four Core ML models (image encoder, memory attention, mask
decoder, memory encoder) and a loop in Swift that keeps the memory bank. This script is that loop, in PyTorch, so it
can be checked against EdgeTAM's own video predictor before anything is converted:

  official  the predictor itself (init_state / add_new_points_or_box / propagate_in_video)
  parts     the same model, driven frame by frame through track_step (EdgeTAM's own memory assembly)
  fixed     memory attention always fed a FULL bank (7 memory frames, 16 object pointers), the missing early slots
            filled with copies of the clicked frame: the fixed shapes a single Core ML model needs

Per frame it keeps the mask summary (as oneclick.py) and reports, against `official`: mask IoU, centroid distance and
whether the round-6 hybrid filters keep the same ball.

    PYTHONPATH=<EdgeTAM repo> python tools/lab/loop.py bt-wa-1028 --variant roi40b --frames 60
"""

from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import sys
import tempfile
import time

import numpy as np
import torch
import torch.nn.functional as F

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import evaluate as ev  # noqa: E402
import server as S  # noqa: E402

N_MEM, N_PTR = 7, 16  # EdgeTAM: num_maskmem, max_obj_ptrs_in_encoder


def build(device):
    os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
    tracker = S.Sam2Tracker("edgetam", device)
    return tracker.predictor


def seed_inputs(seed, W, H, size):
    """The click as EdgeTAM's point inputs (coords in the model's 1024 px space), as add_new_points_or_box does."""
    if seed["kind"] == "box":
        x, y, w, h = seed["xy"]
        pts = [[x * W, y * H], [(x + w) * W, (y + h) * H]]
        lbl = [2, 3]
    else:
        pts = [[seed["xy"][0] * W, seed["xy"][1] * H]]
        lbl = [1]
    pts = torch.tensor(pts, dtype=torch.float32)[None] / torch.tensor([W, H]) * size
    return {"point_coords": pts, "point_labels": torch.tensor(lbl, dtype=torch.int32)[None]}


def to_video_res(low_res, H, W):
    return F.interpolate(low_res, size=(H, W), mode="bilinear", align_corners=False)


def summary(mask_logits_video):
    m = (mask_logits_video[0, 0] > 0).cpu().numpy()
    return S.summarize(m, m.shape[1], m.shape[0]), m


def run_official(pred, frames_dir, seed, s):
    state = pred.init_state(video_path=frames_dir, offload_video_to_cpu=True)
    H, W = state["video_height"], state["video_width"]
    from oneclick import add_prompt

    add_prompt(pred, state, s, seed)
    out = {}
    for f, _i, lg in pred.propagate_in_video(state, start_frame_idx=s):
        out[int(f)] = (lg[:1] > 0).cpu().numpy()[0, 0]
    if s > 0:
        for f, _i, lg in pred.propagate_in_video(state, start_frame_idx=s, reverse=True):
            out[int(f)] = (lg[:1] > 0).cpu().numpy()[0, 0]
    return out, state


def frame_feats(model, state, i):
    img = state["images"][i].to(model.device).float().unsqueeze(0)
    bo = model.forward_image(img)
    _, feats, pos, sizes = model._prepare_backbone_features(bo)
    return feats, pos, sizes


def fixed_memory(model, frame_idx, output_dict, reverse):
    """EdgeTAM's memory bank for frame_idx with every slot filled: (memory, memory_pos, num_obj_ptr_tokens)."""
    cond = output_dict["cond_frame_outputs"]
    (t_c, c_out), = cond.items()  # one clicked frame
    sign = -1 if reverse else 1
    mems, poss = [], []
    for t_pos in range(N_MEM):
        if t_pos == 0:
            prev = c_out
        else:
            t_rel = N_MEM - t_pos
            prev = output_dict["non_cond_frame_outputs"].get(frame_idx - sign * t_rel)
            if prev is None:
                prev = c_out  # fill
        feats = prev["maskmem_features"].to(model.device).float()          # (1, 512, 64)
        mems.append(feats.permute(1, 0, 2))
        enc = prev["maskmem_pos_enc"][-1].to(model.device).float().permute(1, 0, 2)
        poss.append(enc + model.maskmem_tpos_enc[N_MEM - t_pos - 1])
    ptrs = [c_out["obj_ptr"]]
    for t_diff in range(1, N_PTR):
        o = output_dict["non_cond_frame_outputs"].get(frame_idx - sign * t_diff)
        ptrs.append(o["obj_ptr"] if o is not None else c_out["obj_ptr"])
    obj_ptrs = torch.stack(ptrs, dim=0)                                      # (16, 1, 256)
    C, md = model.hidden_dim, model.mem_dim
    obj_pos = obj_ptrs.new_zeros(len(ptrs), 1, md)                           # add_tpos_enc_to_obj_ptrs: false
    obj_ptrs = obj_ptrs.reshape(-1, 1, C // md, md).permute(0, 2, 1, 3).flatten(0, 1)
    obj_pos = obj_pos.repeat_interleave(C // md, dim=0)
    mems.append(obj_ptrs)
    poss.append(obj_pos)
    return torch.cat(mems, 0), torch.cat(poss, 0), obj_ptrs.shape[0]


@torch.inference_mode()
def run_parts(model, state, seed, s, n, fixed):
    H, W = state["video_height"], state["video_width"]
    out_dict = {"cond_frame_outputs": {}, "non_cond_frame_outputs": {}}
    masks = {}

    def store(f, cur, cond):
        # as the predictor: memory features kept in bfloat16
        cur = dict(cur)
        cur["maskmem_features"] = cur["maskmem_features"].to(torch.bfloat16)
        (out_dict["cond_frame_outputs"] if cond else out_dict["non_cond_frame_outputs"])[f] = cur
        masks[f] = (to_video_res(cur["pred_masks"], H, W) > 0).cpu().numpy()[0, 0]

    feats, pos, sizes = frame_feats(model, state, s)
    cur = model.track_step(frame_idx=s, is_init_cond_frame=True, current_vision_feats=feats,
                           current_vision_pos_embeds=pos, feat_sizes=sizes,
                           point_inputs=seed_inputs(seed, W, H, model.image_size), mask_inputs=None,
                           output_dict=out_dict, num_frames=n, track_in_reverse=False, run_mem_encoder=True)
    store(s, cur, True)
    for reverse, order in ((False, range(s + 1, n)), (True, range(s - 1, -1, -1))):
        for f in order:
            feats, pos, sizes = frame_feats(model, state, f)
            if not fixed:
                cur = model.track_step(frame_idx=f, is_init_cond_frame=False, current_vision_feats=feats,
                                       current_vision_pos_embeds=pos, feat_sizes=sizes, point_inputs=None,
                                       mask_inputs=None, output_dict=out_dict, num_frames=n,
                                       track_in_reverse=reverse, run_mem_encoder=True)
            else:
                B, C = 1, model.hidden_dim
                h, w = sizes[-1]
                memory, memory_pos, n_ptr_tok = fixed_memory(model, f, out_dict, reverse)
                pix = model.memory_attention(curr=feats[-1:], curr_pos=pos[-1:], memory=memory,
                                             memory_pos=memory_pos, num_obj_ptr_tokens=n_ptr_tok,
                                             num_spatial_mem=N_MEM)
                pix = pix.permute(1, 2, 0).view(B, C, h, w)
                high = [x.permute(1, 2, 0).view(x.size(1), x.size(2), *sz) for x, sz in zip(feats[:-1], sizes[:-1])]
                so = model._forward_sam_heads(backbone_features=pix, point_inputs=None, mask_inputs=None,
                                              high_res_features=high,
                                              multimask_output=model._use_multimask(False, None))
                _, _, _, low, high_m, obj_ptr, obj_score = so
                mf, mp = model._encode_new_memory(current_vision_feats=feats, feat_sizes=sizes,
                                                  pred_masks_high_res=high_m, object_score_logits=obj_score,
                                                  is_mask_from_pts=False)
                cur = {"pred_masks": low, "obj_ptr": obj_ptr, "object_score_logits": obj_score,
                       "maskmem_features": mf, "maskmem_pos_enc": mp}
            store(f, cur, False)
    return masks


def compare(ref, got, W, H):
    ious, dists = [], []
    for f in sorted(ref):
        a, b = ref[f], got.get(f)
        if b is None:
            continue
        inter, union = np.logical_and(a, b).sum(), np.logical_or(a, b).sum()
        ious.append(1.0 if union == 0 else inter / union)
        sa, sb = S.summarize(a, W, H), S.summarize(b, W, H)
        if sa is not None and sb is not None:
            dists.append(math.hypot((sa[0] - sb[0]) * W, (sa[1] - sb[1]) * H))
        elif (sa is None) != (sb is None):
            dists.append(float("inf"))
    d = np.array(dists)
    return {"frames": len(ious), "iou_mean": float(np.mean(ious)), "iou_min": float(np.min(ious)),
            "centroid_px_median": float(np.median(d[np.isfinite(d)])) if np.isfinite(d).any() else None,
            "centroid_px_max": float(np.max(d[np.isfinite(d)])) if np.isfinite(d).any() else None,
            "presence_mismatch": int(np.sum(~np.isfinite(d)))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("clip")
    ap.add_argument("--variant", default=None, help="roi.py frames, e.g. roi40b")
    ap.add_argument("--frames", type=int, default=0, help="only the first N frames (0 = all)")
    ap.add_argument("--device", default="cpu")
    a = ap.parse_args()
    truth = ev.load_truth(a.clip)
    seed = [p for p in truth["prompts"] if not p.get("neg")][0]
    src = os.path.join(S.FRAMES, a.clip if not a.variant else f"{a.clip}@{a.variant}")
    if a.variant:
        from oneclick import roi_point

        with open(os.path.join(src, "roi.json")) as f:
            roi = json.load(f)
        s = int(round(seed["ms"] / 100))
        seed = roi_point(seed, roi, s)
    s = int(round(seed["ms"] / 100))
    tmp = tempfile.mkdtemp(prefix="loop-")
    names = sorted(x for x in os.listdir(src) if x.endswith(".jpg"))
    if a.frames:
        names = names[:a.frames]
    for x in names:
        shutil.copy(os.path.join(src, x), os.path.join(tmp, x))
    n = len(names)
    pred = build(a.device)
    t0 = time.time()
    ref, state = run_official(pred, tmp, seed, s)
    t1 = time.time()
    H, W = state["video_height"], state["video_width"]
    parts = run_parts(pred, state, seed, s, n, fixed=False)
    t2 = time.time()
    fixed = run_parts(pred, state, seed, s, n, fixed=True)
    t3 = time.time()
    res = {"clip": a.clip, "variant": a.variant, "frames": n, "seed_frame": s,
           "parts_vs_official": compare(ref, parts, W, H), "fixed_vs_official": compare(ref, fixed, W, H),
           "seconds": {"official": round(t1 - t0, 1), "parts": round(t2 - t1, 1), "fixed": round(t3 - t2, 1)}}
    print(json.dumps(res, indent=1))
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
