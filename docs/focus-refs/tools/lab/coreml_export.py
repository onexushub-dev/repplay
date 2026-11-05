#!/usr/bin/env python3
"""Modo Foco lab, iPhone step 1b: EdgeTAM as four fixed-shape Core ML models, and a check that they track like EdgeTAM.

loop.py cut EdgeTAM's video tracking into parts with a fixed-size memory bank (7 memory frames, 16 object pointers).
Filling the empty early slots with copies of the clicked frame (loop.py's `fixed`) looked fine on 50 frames but lost
the ball more over a whole clip (bt-wa-1028: ball mode 60% vs 74%), so here empty slots are switched off instead.
This script turns the parts into Core ML:

  encoder    image 1024x1024 RGB (ImageType, 0..255; normalised inside)
             -> feat_s0 (1,32,256,256), feat_s1 (1,64,128,128), vision (1,256,64,64)
  attention  vision + memory bank (7,512,64) + object pointers (16,256) + which slots are filled, mem_on (1,7) and
             ptr_on (1,16) -> pix (1,256,64,64); an empty slot (the first frames after the click, the clip's edges)
             is switched off in the attention, which is exactly EdgeTAM leaving it out
             (positions, time encodings and RoPE are baked in; RoPE rewritten with real numbers, Core ML has no
              complex type)
  decoder    pix, feat_s0, feat_s1, 2 prompt points (1,2,2) in 1024 px + labels (1,2)
             -> mask (1,1,256,256) logits, obj_ptr (1,256), score (1,1), ious (1,3)
             tracking frames: both points label -1; clicked frame: the click (label 1) + a pad point (label -1);
             best of the 3 masks, "no object" handling and the pointer projection are inside
  memory     vision + mask + hard (1,1) -> mem (1,512,64)   (mask upsampled to 1024, scaled sigmoid, or binarised
             when hard = 1 as on the clicked frame; memory encoder, perceiver)

The clicked frame skips `attention`: pix = vision + no_mem_embed (a 256-vector, saved in edgetam_constants.json).
The loop that keeps the bank is ~40 lines (`track` below) and is what Swift will do.

    # in the container or on the Mac (PyTorch only): wrappers == EdgeTAM, then convert
    PYTHONPATH=<EdgeTAM repo> python tools/lab/coreml_export.py export
    # on the Mac: the whole clip through the Core ML models vs EdgeTAM's own predictor, and time per part
    lab/.venv-edgetam/bin/python tools/lab/coreml_export.py check bt-wa-1028 --variant roi40b
"""

from __future__ import annotations

import argparse
import json
import math
import os
import platform
import shutil
import sys
import tempfile
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import evaluate as ev  # noqa: E402
import server as S  # noqa: E402

N_MEM, N_PTR = 7, 16
MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)
OUT = os.path.join(ev.ROOT, "lab", "coreml")
NAMES = ("encoder", "attention", "decoder", "memory")


# ---------------------------------------------------------------- real-valued RoPE

# Query block of the memory attention (4096 queries; 1024 = 4 blocks). Tried for the iPhone XR's Neural Engine
# (2026-11-04): it did not help (its compiler ran the app out of memory), so the default is one block.
QCHUNK = int(os.environ.get("EDGETAM_QCHUNK", "4096"))
# "pairs": rope() on (n, d/2, 2); "halves": PermutedProj + rope_halves. 2026-11-04, iPhone XR probe: "halves" fails to
# load on the A12 GPU in fp16 (error -5) and the A12 Neural Engine cannot compile the attention either way, so the
# default is "pairs" with the spelled-out softmax (attention_pairs_soft: 220 ms on the XR's GPU)
ROPE = "pairs"
SOFTMAX = "soft"    # "soft": spelled out; "torch": torch.softmax
# attention variants exported side by side (`export --only attention --variants`), to find what each phone's GPU /
# Neural Engine accepts (2026-11-04, iPhone XR): tag -> (rope, softmax, query block, precision)
ATTENTION_VARIANTS = {
    "v1": ("pairs", "torch", 4096, "fp16"),       # the first export: ran on the XR's GPU (292 ms)
    "pairs_soft": ("pairs", "soft", 4096, "fp16"),
    "halves_soft": ("halves", "soft", 4096, "fp16"),
    "halves_soft_q1024": ("halves", "soft", 1024, "fp16"),
    "halves_soft_q1024_fp32": ("halves", "soft", 1024, "fp32"),
    "v1_fp32": ("pairs", "torch", 4096, "fp32"),
}


def soft(x):
    """softmax spelled out (exp(x - max) / sum). With torch.softmax, Core ML's GPU path fused q.k, softmax and .v into
    one MPS attention kernel (sdpa_fwdNew) that aborts the app on the iPhone XR's A12 GPU."""
    e = torch.exp(x - x.max(dim=-1, keepdim=True)[0])
    return e / e.sum(dim=-1, keepdim=True)


def rope_tables(dim, side):
    """cos/sin of EdgeTAM's axial RoPE (compute_axial_cis) for a side x side grid: two (side*side, dim/2) tensors."""
    from sam2.modeling.position_encoding import compute_axial_cis

    cis = compute_axial_cis(dim=dim, end_x=side, end_y=side)
    return cis.real.float().contiguous(), cis.imag.float().contiguous()


def rope(x, cos, sin, n, d):
    """apply_rotary_enc with real numbers: x (n, d), channel pairs (2i, 2i+1) rotated by the angle in cos/sin (n, d/2).
    Shapes are plain ints (not x.shape) so the traced graph has no shape arithmetic."""
    x2 = x.reshape(n, d // 2, 2)
    a, b = x2[:, :, 0], x2[:, :, 1]
    return torch.stack((a * cos - b * sin, a * sin + b * cos), dim=-1).reshape(n, d)


def rope_halves(x, cos, sin, d):
    """rope() for channels already reordered evens-then-odds (see PermutedProj): the pairs are the two halves, so no
    (n, d/2, 2) tensor (2-element rows the iPhone XR's Neural Engine refuses: "must be aligned on 64 bytes")."""
    a, b = x[:, : d // 2], x[:, d // 2:]
    return torch.cat((a * cos - b * sin, a * sin + b * cos), dim=-1)


class PermutedProj(nn.Module):
    """A q or k projection with its output channels reordered (0, 2, 4, ..., 1, 3, 5, ...). q.k is unchanged when q and
    k get the same order, and RoPE's channel pairs become the two halves."""

    def __init__(self, linear):
        super().__init__()
        d = linear.out_features
        perm = torch.cat([torch.arange(0, d, 2), torch.arange(1, d, 2)])
        self.proj = nn.Linear(linear.in_features, d)
        with torch.no_grad():
            self.proj.weight.copy_(linear.weight[perm])
            self.proj.bias.copy_(linear.bias[perm])

    def forward(self, x):
        return self.proj(x)


def attend(attn, q, k, v, qc, qs, kc, ks, nq, nk, d, bias=None, qp=None, kp=None):
    """EdgeTAM's RoPEAttention / RoPEAttentionv2 (1 head, batch 1) on (N, C) tokens, RoPE from tables. `bias` (1, nk)
    is added to the attention logits: -1e4 drops a key (an empty memory slot), as if it were not in the bank.
    qp / kp: PermutedProj copies of q_proj / k_proj (RoPE on halves)."""
    if qp is not None and kp is not None:
        q = rope_halves(qp(q), qc, qs, d)
        k = rope_halves(kp(k), kc, ks, d)
    else:
        q = rope(attn.q_proj(q), qc, qs, nq, d)
        k = rope(attn.k_proj(k), kc, ks, nk, d)
    v = attn.v_proj(v)
    kt = k.transpose(0, 1) * (1.0 / math.sqrt(d))
    out = []
    for i in range(0, nq, QCHUNK):  # blocks of queries: smaller attention matrices for the older Neural Engines
        logits = q[i:i + QCHUNK] @ kt
        if bias is not None:
            logits = logits + bias
        out.append((soft(logits) if SOFTMAX == "soft" else torch.softmax(logits, dim=-1)) @ v)
    return attn.out_proj(out[0] if len(out) == 1 else torch.cat(out, 0))


# ---------------------------------------------------------------- the four parts

class Encoder(nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model
        self.register_buffer("mean", torch.tensor(MEAN).view(1, 3, 1, 1))
        self.register_buffer("std", torch.tensor(STD).view(1, 3, 1, 1))

    def forward(self, image):  # (1, 3, 1024, 1024) in 0..1
        fpn = self.model.forward_image((image - self.mean) / self.std)["backbone_fpn"]
        return fpn[0], fpn[1], fpn[2]


class Attention(nn.Module):
    """MemoryAttention for one fixed bank: slot 0 = the clicked frame, slots 1..6 = frames f-6..f-1 (f+6..f+1 going
    backwards), pointer 0 = the clicked frame, then f-1, f-2... (pointer order does not matter: no time encoding)."""

    def __init__(self, model, curr_pos, mem_pos):
        super().__init__()
        ma = model.memory_attention
        assert ma.pos_enc_at_input and ma.batch_first and len(ma.layers) == 2
        for layer in ma.layers:
            assert not layer.pos_enc_at_attn and layer.pos_enc_at_cross_attn_keys
            assert not layer.pos_enc_at_cross_attn_queries
            assert layer.self_attn.num_heads == 1 and layer.cross_attn_image.num_heads == 1
        self.ma = ma
        self.register_buffer("curr_pos", curr_pos)                      # (4096, 256)
        tpos = model.maskmem_tpos_enc.detach().reshape(N_MEM, -1)       # (7, 64)
        pos = [mem_pos + tpos[N_MEM - t - 1] for t in range(N_MEM)]     # slot t gets tpos index 6 - t
        pos.append(torch.zeros(N_PTR * 4, mem_pos.shape[1]))           # object pointers: no position
        self.register_buffer("mem_pos", torch.cat(pos, 0))             # (3648, 64)
        dim = ma.layers[0].self_attn.internal_dim
        qc, qs = rope_tables(dim, 64)
        self.register_buffer("qc", qc)
        self.register_buffer("qs", qs)
        kc1, ks1 = rope_tables(dim, 16)                                 # the perceiver's 16x16 2-D latents
        n1 = mem_pos.shape[0] - kc1.shape[0]                            # its 256 1-D latents: no RoPE
        one, zero = torch.ones(n1, dim // 2), torch.zeros(n1, dim // 2)
        kc = torch.cat([torch.cat([one, kc1], 0)] * N_MEM + [torch.ones(N_PTR * 4, dim // 2)], 0)
        ks = torch.cat([torch.cat([zero, ks1], 0)] * N_MEM + [torch.zeros(N_PTR * 4, dim // 2)], 0)
        self.register_buffer("kc", kc)                                  # (3648, 128)
        self.register_buffer("ks", ks)
        self.c, self.md, self.d = model.hidden_dim, model.mem_dim, dim
        self.nq, self.nk = 64 * 64, kc.shape[0]
        self.sq = nn.ModuleList([PermutedProj(layer.self_attn.q_proj) for layer in ma.layers])
        self.sk = nn.ModuleList([PermutedProj(layer.self_attn.k_proj) for layer in ma.layers])
        self.cq = nn.ModuleList([PermutedProj(layer.cross_attn_image.q_proj) for layer in ma.layers])
        self.ck = nn.ModuleList([PermutedProj(layer.cross_attn_image.k_proj) for layer in ma.layers])

    def forward(self, vision, mem, ptr, mem_on, ptr_on):  # (1,256,64,64), (7,512,64), (16,256), (1,7), (1,16)
        """mem_on / ptr_on: 1 for a filled slot, 0 for an empty one (early frames, clip edges). EdgeTAM leaves empty
        slots out of the bank; here they stay (fixed shape) but get no attention, which is the same thing."""
        c, md, d, nq, nk = self.c, self.md, self.d, self.nq, self.nk
        x = vision.reshape(c, nq).transpose(0, 1) + 0.1 * self.curr_pos         # (4096, 256)
        memory = torch.cat([mem.reshape(N_MEM * 512, md), ptr.reshape(N_PTR * c // md, md)], 0)  # (3648, 64)
        keys = memory + self.mem_pos
        # one value per key by broadcasting (a 0/1 matrix product here broke Core ML's GPU plan on the iPhone XR:
        # "inner_product_kernel: Input blob type 0 and output blob type 1 don't match")
        on = torch.cat([mem_on.reshape(N_MEM, 1).expand(N_MEM, 512).reshape(1, N_MEM * 512),
                        ptr_on.reshape(N_PTR, 1).expand(N_PTR, c // md).reshape(1, N_PTR * c // md)], 1)
        bias = (on - 1.0) * 1e4                                                  # (1, 3648)
        for i, layer in enumerate(self.ma.layers):
            t = layer.norm1(x)
            x = x + attend(layer.self_attn, t, t, t, self.qc, self.qs, self.qc, self.qs, nq, nq, d,
                           qp=self.sq[i] if ROPE == "halves" else None, kp=self.sk[i] if ROPE == "halves" else None)
            t = layer.norm2(x)
            x = x + attend(layer.cross_attn_image, t, keys, memory, self.qc, self.qs, self.kc, self.ks, nq, nk, d,
                           bias, qp=self.cq[i] if ROPE == "halves" else None,
                           kp=self.ck[i] if ROPE == "halves" else None)
            t = layer.norm3(x)
            x = x + layer.linear2(layer.activation(layer.linear1(t)))
        x = self.ma.norm(x)
        return x.transpose(0, 1).reshape(1, c, 64, 64)


class Decoder(nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model
        pe = model.sam_prompt_encoder
        assert model.pred_obj_scores and model.fixed_no_obj_ptr and not model.soft_no_obj_ptr
        assert model.sam_mask_decoder.use_multimask_token_for_obj_ptr
        self.register_buffer("dense_pe", pe.get_dense_pe().detach())
        self.register_buffer("dense", pe.no_mask_embed.weight.detach().reshape(1, -1, 1, 1).expand(
            1, -1, *pe.image_embedding_size).contiguous())
        table = [pe.not_a_point_embed.weight] + [e.weight for e in pe.point_embeddings]
        self.register_buffer("table", torch.cat(table, 0).detach())                  # labels -1, 0, 1, 2, 3
        self.register_buffer("values", torch.tensor([-1.0, 0.0, 1.0, 2.0, 3.0]))
        self.size = float(model.image_size)

    def forward(self, pix, feat_s0, feat_s1, points, labels):  # points (1,2,2) px in 1024, labels (1,2) float
        pe = self.model.sam_prompt_encoder
        emb = pe.pe_layer._pe_encoding((points + 0.5) / self.size)                   # (1, 2, 256)
        onehot = (labels.unsqueeze(-1) == self.values).float()                         # (1, 2, 5)
        sparse = emb * (1.0 - onehot[..., :1]) + onehot @ self.table
        masks, ious, tokens, score = self.model.sam_mask_decoder(
            image_embeddings=pix, image_pe=self.dense_pe, sparse_prompt_embeddings=sparse,
            dense_prompt_embeddings=self.dense, multimask_output=True, repeat_image=False,
            high_res_features=[feat_s0, feat_s1])
        appear = (score > 0).float()                                                   # (1, 1)
        masks = masks * appear.view(1, 1, 1, 1) + (1.0 - appear.view(1, 1, 1, 1)) * -1024.0
        pick = (ious >= ious.max(dim=-1, keepdim=True)[0]).float()                    # argmax as a one-hot
        pick = pick / pick.sum(dim=-1, keepdim=True)
        mask = (masks * pick.view(1, -1, 1, 1)).sum(dim=1, keepdim=True)              # (1, 1, 256, 256)
        token = (tokens * pick.unsqueeze(-1)).sum(dim=1)                               # (1, 256)
        ptr = self.model.obj_ptr_proj(token)
        ptr = appear * ptr + (1.0 - appear) * self.model.no_obj_ptr
        return mask, ptr, score, ious


class Memory(nn.Module):
    def __init__(self, model):
        super().__init__()
        assert model.no_obj_embed_spatial is None
        self.model = model

    def forward(self, vision, mask, hard):  # (1,256,64,64), (1,1,256,256) logits, (1,1): 1 on the clicked frame
        m = self.model
        high = F.interpolate(mask, size=(m.image_size, m.image_size), mode="bilinear", align_corners=False)
        # the video predictor binarises the clicked frame's mask (binarize_mask_from_pts_for_mem_enc), so the memory
        # holds exactly the mask the user saw; tracked frames keep the soft sigmoid
        h = hard.view(1, 1, 1, 1)
        high = h * (high > 0).float() + (1.0 - h) * torch.sigmoid(high)
        high = high * m.sigmoid_scale_for_mem_enc + m.sigmoid_bias_for_mem_enc
        out = m.memory_encoder(vision, high, skip_mask_sigmoid=True)
        feats, _ = m.spatial_perceiver(out["vision_features"], out["vision_pos_enc"][0])
        return feats  # (1, 512, 64)


def build_model():
    os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
    return S.Sam2Tracker("edgetam", "cpu").predictor.eval()


def constants(model):
    """Inputs that never change for a 1024x1024 image: the image-level position encoding and the memory positions."""
    with torch.inference_mode():
        a = model.forward_image(torch.randn(1, 3, 1024, 1024))
        b = model.forward_image(torch.randn(1, 3, 1024, 1024))
        _, fa, pa, sizes = model._prepare_backbone_features(a)
        _, fb, pb, _ = model._prepare_backbone_features(b)
        assert torch.equal(pa[-1], pb[-1])
        curr_pos = pa[-1][:, 0].clone()                                        # (4096, 256)
        hi = [x.permute(1, 2, 0).view(1, x.size(2), *s) for x, s in zip(fa[:-1], sizes[:-1])]
        _, pos_a = model._encode_new_memory(fa, sizes, torch.randn(1, 1, 1024, 1024), torch.ones(1, 1), False)
        _, pos_b = model._encode_new_memory(fb, sizes, torch.randn(1, 1, 1024, 1024), -torch.ones(1, 1), False)
        assert torch.equal(pos_a[-1], pos_b[-1]) and hi[0].shape[1] == 32
        mem_pos = pos_a[-1][0].clone()                                         # (512, 64)
    return curr_pos, mem_pos


def make_parts(model):
    curr_pos, mem_pos = constants(model)
    return {"encoder": Encoder(model).eval(), "attention": Attention(model, curr_pos, mem_pos).eval(),
            "decoder": Decoder(model).eval(), "memory": Memory(model).eval()}


def examples():
    g = torch.Generator().manual_seed(0)
    r = lambda *s: torch.randn(*s, generator=g)  # noqa: E731
    pts = torch.tensor([[[400.0, 300.0], [0.0, 0.0]]])
    return {"encoder": (torch.rand(1, 3, 1024, 1024, generator=g),),
            "attention": (r(1, 256, 64, 64), r(N_MEM, 512, 64), r(N_PTR, 256), torch.ones(1, N_MEM),
                          torch.ones(1, N_PTR)),
            "decoder": (r(1, 256, 64, 64), r(1, 32, 256, 256), r(1, 64, 128, 128), pts, torch.tensor([[1.0, -1.0]])),
            "memory": (r(1, 256, 64, 64), r(1, 1, 256, 256) * 8, torch.zeros(1, 1))}


IO = {"encoder": (("image",), ("feat_s0", "feat_s1", "vision")),
      "attention": (("vision", "mem", "ptr", "mem_on", "ptr_on"), ("pix",)),
      "decoder": (("pix", "feat_s0", "feat_s1", "points", "labels"), ("mask", "obj_ptr", "score", "ious")),
      "memory": (("vision", "mask", "hard"), ("mem",))}


# ---------------------------------------------------------------- wrappers == EdgeTAM

@torch.inference_mode()
def self_test(model, parts):
    """Each wrapper against the EdgeTAM code it replaces, on the example inputs (fp32, CPU)."""
    ex = examples()
    rep = {}
    img = ex["encoder"][0]
    s0, s1, vis = parts["encoder"](img)
    bo = model.forward_image((img - parts["encoder"].mean) / parts["encoder"].std)
    _, feats, pos, sizes = model._prepare_backbone_features(bo)
    rep["encoder"] = float((vis - feats[-1].permute(1, 2, 0).view(1, 256, 64, 64)).abs().max())

    vis_, mem, ptr, mon, pon = ex["attention"]
    x = vis_.flatten(2).permute(2, 0, 1)
    mem_pos = parts["attention"].mem_pos[:N_MEM * 512].reshape(N_MEM, 512, 64)
    # full bank, then a bank with empty slots (EdgeTAM: left out; here: switched off)
    for label, ms, ps in (("attention", list(range(N_MEM)), list(range(N_PTR))),
                          ("attention.partial", [0, 4, 5, 6], [0, 1, 2, 3, 4])):
        memory = torch.cat([mem[ms].reshape(-1, 1, 64), ptr[ps].reshape(-1, 1, 64)], 0)
        mpos = torch.cat([mem_pos[ms].reshape(-1, 1, 64), torch.zeros(len(ps) * 4, 1, 64)], 0)
        ref = model.memory_attention(curr=x, curr_pos=pos[-1], memory=memory, memory_pos=mpos,
                                     num_obj_ptr_tokens=len(ps) * 4, num_spatial_mem=len(ms))
        mo = torch.zeros(1, N_MEM)
        mo[0, ms] = 1
        po = torch.zeros(1, N_PTR)
        po[0, ps] = 1
        got = parts["attention"](vis_, mem, ptr, mo, po)
        rep[label] = float((got - ref.permute(1, 2, 0).view(1, 256, 64, 64)).abs().max())

    pix, f0, f1, pts, lbl = ex["decoder"]
    got = parts["decoder"](pix, f0, f1, pts, lbl)
    so = model._forward_sam_heads(backbone_features=pix, point_inputs={"point_coords": pts[:, :1],
                                  "point_labels": lbl[:, :1].int()}, mask_inputs=None, high_res_features=[f0, f1],
                                  multimask_output=True)
    rep["decoder.mask"] = float((got[0] - so[3]).abs().max())
    rep["decoder.obj_ptr"] = float((got[1] - so[5]).abs().max())
    trk = parts["decoder"](pix, f0, f1, torch.zeros(1, 2, 2), torch.tensor([[-1.0, -1.0]]))
    so = model._forward_sam_heads(backbone_features=pix, point_inputs=None, mask_inputs=None,
                                  high_res_features=[f0, f1], multimask_output=True)
    rep["decoder.tracking_mask"] = float((trk[0] - so[3]).abs().max())

    v, m, _ = ex["memory"]
    flat = [v.flatten(2).permute(2, 0, 1)]
    high = F.interpolate(m, size=(1024, 1024), mode="bilinear", align_corners=False)
    for hard in (0.0, 1.0):
        got = parts["memory"](v, m, torch.full((1, 1), hard))
        ref, _ = model._encode_new_memory([None, None] + flat, [None, None, (64, 64)], high, torch.ones(1, 1),
                                          bool(hard))
        rep[f"memory.{'clicked' if hard else 'tracked'}"] = float((got - ref).abs().max())
    return rep


# ---------------------------------------------------------------- the loop (what Swift will do)

class TorchRunner:
    def __init__(self, parts):
        self.parts = parts
        self.secs = {k: 0.0 for k in NAMES}
        self.calls = {k: 0 for k in NAMES}

    @torch.inference_mode()
    def __call__(self, name, *args):
        t = time.perf_counter()
        out = self.parts[name](*[torch.from_numpy(np.ascontiguousarray(a)) for a in args])
        out = out if isinstance(out, tuple) else (out,)
        self.secs[name] += time.perf_counter() - t
        self.calls[name] += 1
        return [o.numpy() for o in out]


class CoreMLRunner:
    def __init__(self, folder, units):
        import coremltools as ct

        cu = {"all": ct.ComputeUnit.ALL, "ne": ct.ComputeUnit.CPU_AND_NE, "gpu": ct.ComputeUnit.CPU_AND_GPU,
              "cpu": ct.ComputeUnit.CPU_ONLY}[units]
        self.models = {}
        self.load = {}
        for k in NAMES:
            t = time.perf_counter()
            self.models[k] = ct.models.MLModel(os.path.join(folder, f"edgetam_{k}.mlpackage"), compute_units=cu)
            self.load[k] = round(time.perf_counter() - t, 1)
        self.secs = {k: 0.0 for k in NAMES}
        self.calls = {k: 0 for k in NAMES}

    def __call__(self, name, *args):
        from PIL import Image

        ins, outs = IO[name]
        feed = {}
        for n, a in zip(ins, args):
            if n == "image":
                feed[n] = Image.fromarray((np.clip(a[0].transpose(1, 2, 0), 0, 1) * 255).round().astype(np.uint8))
            else:
                feed[n] = np.ascontiguousarray(a, dtype=np.float32)
        t = time.perf_counter()
        res = self.models[name].predict(feed)
        self.secs[name] += time.perf_counter() - t
        self.calls[name] += 1
        return [np.asarray(res[n], dtype=np.float32) for n in outs]


def track(run, images, seed_frame, seed_xy, no_mem_embed, store=lambda x: x.astype(np.float16), mask_empty=True):
    """EdgeTAM tracking with the fixed bank (as loop.py's `fixed`), forward from the click, then backwards.
    images: callable i -> (1,3,1024,1024) float in 0..1. seed_xy: click in 1024 px. Returns {frame: (mask, score)}."""
    n = images.count
    out = {}
    bank = {}                                                  # frame -> (mem, ptr): ONE bank for both directions
    s0, s1, vis = run("encoder", images(seed_frame))
    pix = vis + no_mem_embed.reshape(1, -1, 1, 1)
    pts = np.array([[seed_xy, [0.0, 0.0]]], np.float32)
    mask, ptr, score, _ = run("decoder", pix, s0, s1, pts, np.array([[1.0, -1.0]], np.float32))
    (mem,) = run("memory", vis, mask, np.ones((1, 1), np.float32))
    cond = (store(mem[0]), ptr[0])
    out[seed_frame] = (mask, float(score.reshape(-1)[0]))
    pad = np.zeros((1, 2, 2), np.float32)
    none = np.array([[-1.0, -1.0]], np.float32)
    for sign, order in ((1, range(seed_frame + 1, n)), (-1, range(seed_frame - 1, -1, -1))):
        for f in order:
            s0, s1, vis = run("encoder", images(f))
            # slot 0 = clicked frame, slots 1..6 = f-6..f-1 (going backwards f+6..f+1); a frame not tracked yet is an
            # empty slot (switched off), as EdgeTAM leaves it out; pointers: clicked frame, then f-1..f-15
            prev = [bank.get(f - sign * (N_MEM - t)) for t in range(1, N_MEM)]
            pprev = [bank.get(f - sign * t) for t in range(1, N_PTR)]
            mems = [cond[0]] + [cond[0] if p is None else p[0] for p in prev]
            ptrs = [cond[1]] + [cond[1] if p is None else p[1] for p in pprev]
            mon = np.array([[1.0] + [0.0 if p is None else 1.0 for p in prev]], np.float32)
            pon = np.array([[1.0] + [0.0 if p is None else 1.0 for p in pprev]], np.float32)
            if not mask_empty:
                mon[:] = 1.0
                pon[:] = 1.0
            (pix,) = run("attention", vis, np.stack(mems).astype(np.float32), np.stack(ptrs).astype(np.float32),
                         mon, pon)
            mask, ptr, score, _ = run("decoder", pix, s0, s1, pad, none)
            (mem,) = run("memory", vis, mask, np.zeros((1, 1), np.float32))
            bank[f] = (store(mem[0]), ptr[0])
            out[f] = (mask, float(score.reshape(-1)[0]))
    return out


class Frames:
    """Frames exactly as EdgeTAM's video loader reads them (PIL resize to 1024x1024, /255), without normalising."""

    def __init__(self, folder, names, size):
        from PIL import Image

        self.Image, self.folder, self.names, self.size = Image, folder, names, size
        self.count = len(names)
        with Image.open(os.path.join(folder, names[0])) as im:
            self.W, self.H = im.size

    def __call__(self, i):
        with self.Image.open(os.path.join(self.folder, self.names[i])) as im:
            a = np.array(im.convert("RGB").resize((self.size, self.size))) / 255.0
        return a.transpose(2, 0, 1)[None].astype(np.float32)


# ---------------------------------------------------------------- commands

def patch_coremltools():
    """coremltools 9 casts 1-element shape constants with int(array), which NumPy 2 refuses ("only 0-dimensional
    arrays can be converted to Python scalars"); cast the element instead."""
    from coremltools.converters.mil import Builder as mb
    from coremltools.converters.mil.frontend.torch import ops

    original = ops._cast

    def _cast(context, node, dtype, dtype_name):
        x = ops._get_inputs(context, node, expected=1)[0]
        if x.can_be_folded_to_const() and isinstance(x.val, np.ndarray) and x.val.size == 1:
            context.add(mb.const(val=dtype(x.val.reshape(-1)[0]), name=node.name), node.name)
            return
        original(context, node, dtype, dtype_name)

    ops._cast = _cast


def plain_sdpa(q, k, v, attn_mask=None, dropout_p=0.0, is_causal=False, scale=None, **kw):
    """F.scaled_dot_product_attention as matmul + spelled-out softmax, so Core ML's GPU path cannot turn it into the
    MPS attention kernel (sdpa_fwdNew) that aborts the app on the iPhone XR's A12 GPU (2026-11-04)."""
    assert attn_mask is None and not is_causal
    s = scale if scale is not None else 1.0 / math.sqrt(q.shape[-1])
    return soft((q @ k.transpose(-2, -1)) * s) @ v


def cmd_export(a):
    import coremltools as ct

    patch_coremltools()
    F.scaled_dot_product_attention = plain_sdpa  # every EdgeTAM module calls it as F.scaled_dot_product_attention

    model = build_model()
    parts = make_parts(model)
    rep = self_test(model, parts)
    print("wrappers vs EdgeTAM (max abs diff, fp32):", json.dumps({k: f"{v:.2e}" for k, v in rep.items()}))
    bad = [k for k, v in rep.items() if v > 1e-3]
    if bad:
        sys.exit(f"wrappers differ from EdgeTAM in {bad}: not exporting")
    os.makedirs(a.out, exist_ok=True)
    target = getattr(ct.target, a.target)
    prec = ct.precision.FLOAT16 if a.precision == "fp16" else ct.precision.FLOAT32
    ex = examples()
    jobs = [(k, k, None) for k in (a.only.split(",") if a.only else NAMES)]
    if a.variants:
        jobs += [("attention", f"attention_{tag}", v) for tag, v in ATTENTION_VARIANTS.items()]
    global ROPE, SOFTMAX, QCHUNK
    base = (ROPE, SOFTMAX, QCHUNK)
    for k, fname, variant in jobs:
        t = time.time()
        ROPE, SOFTMAX, QCHUNK = base if variant is None else variant[:3]
        prec = ct.precision.FLOAT16 if (variant[3] if variant else a.precision) == "fp16" else ct.precision.FLOAT32
        if variant is not None:
            with torch.inference_mode():
                got = parts[k](*ex[k])
                ROPE, SOFTMAX, QCHUNK = base
                ref = parts[k](*ex[k])
                ROPE, SOFTMAX, QCHUNK = variant[:3]
            print(f"{fname}: same as the default attention to {float((got - ref).abs().max()):.1e}", flush=True)
        with torch.inference_mode():
            traced = torch.jit.trace(parts[k], ex[k], check_trace=False)
        ins, outs = IO[k]
        if k == "encoder":
            inputs = [ct.ImageType(name="image", shape=(1, 3, 1024, 1024), scale=1 / 255.0,
                                   color_layout=ct.colorlayout.RGB)]
        else:
            inputs = [ct.TensorType(name=n, shape=tuple(x.shape), dtype=np.float32) for n, x in zip(ins, ex[k])]
        ml = ct.convert(traced, inputs=inputs, outputs=[ct.TensorType(name=n, dtype=np.float32) for n in outs],
                        convert_to="mlprogram", minimum_deployment_target=target, compute_precision=prec)
        ml.short_description = f"EdgeTAM {k} (Modo Foco lab, fixed shapes; see tools/lab/coreml_export.py)"
        ml.license = "Apache-2.0 (EdgeTAM, facebookresearch)"
        path = os.path.join(a.out, f"edgetam_{fname}.mlpackage")
        if os.path.exists(path):
            shutil.rmtree(path)
        ml.save(path)
        mb = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(path) for f in fs) / 1e6
        print(f"{fname}: {path} ({mb:.1f} MB, {time.time() - t:.0f} s)", flush=True)
    ROPE, SOFTMAX, QCHUNK = base
    with open(os.path.join(a.out, "edgetam_constants.json"), "w") as f:
        json.dump({"no_mem_embed": model.no_mem_embed.detach().reshape(-1).tolist(), "image_size": 1024, "qchunk": QCHUNK,
                   "mean": MEAN, "std": STD, "num_maskmem": N_MEM, "max_obj_ptrs": N_PTR,
                   "target": a.target, "precision": a.precision, "self_test": rep}, f)


def to_bf16(x):
    return torch.from_numpy(np.ascontiguousarray(x, np.float32)).to(torch.bfloat16).float().numpy()


STORES = {"fp16": lambda x: x.astype(np.float16), "bf16": to_bf16, "fp32": lambda x: x.astype(np.float32)}


def clip_setup(a):
    """The clip's frames (copied to a temp dir, as loop.py), the click in the frames' 0..1 and its frame index."""
    truth = ev.load_truth(a.clip)
    seed = [p for p in truth["prompts"] if not p.get("neg")][0]
    src = os.path.join(S.FRAMES, a.clip if not a.variant else f"{a.clip}@{a.variant}")
    roi = None
    if a.variant:
        from oneclick import roi_point

        with open(os.path.join(src, "roi.json")) as f:
            roi = json.load(f)
        seed = roi_point(seed, roi, int(round(seed["ms"] / 100)))
    if seed["kind"] != "point":
        sys.exit("box seeds are not exported yet (the decoder takes 2 prompt points)")
    names = sorted(x for x in os.listdir(src) if x.endswith(".jpg"))
    if a.frames:
        names = names[:a.frames]
    tmp = tempfile.mkdtemp(prefix="cml-")
    for x in names:
        shutil.copy(os.path.join(src, x), os.path.join(tmp, x))
    return truth, seed, int(round(seed["ms"] / 100)), tmp, names, roi


def run_dir(a):
    d = os.path.join(ev.ROOT, "lab", "tests", "coreml", a.clip + ("@" + a.variant if a.variant else ""))
    os.makedirs(d, exist_ok=True)
    return d


def save_masks(path, masks, extra):
    fr = sorted(masks)
    np.savez_compressed(path, frames=np.array(fr), bits=np.packbits(np.stack([masks[f] for f in fr]), axis=-1),
                        shape=np.array(masks[fr[0]].shape), extra=json.dumps(extra))


def load_masks(path):
    z = np.load(path)
    h, w = z["shape"]
    bits = np.unpackbits(z["bits"], axis=-1)[..., :w].astype(bool)
    return {int(f): bits[i] for i, f in enumerate(z["frames"])}, json.loads(str(z["extra"]))


def one_click_track(masks, roi):
    """Per frame, the mask summary in whole-frame 0..1 (oneclick.py's pred_one: what hybrid.py reads)."""
    from oneclick import roi_back

    out = {}
    for f in sorted(masks):
        m = masks[f]
        v = S.summarize(m, m.shape[1], m.shape[0])
        if v is not None and roi is not None:
            v = roi_back(v, roi, f)
        out[str(f)] = v
    return out


def judge(clip, truth, pred_one):
    """What matters for Modo Foco: the share of the clip in ball mode (round-6 filters, as hybrid.py) and, on clips
    with real labels, how often the track is on the ball."""
    import hybrid as hb

    meta = ev.clip_meta(clip)
    n = meta["count"]
    tr = hb.trusted(pred_one, n, truth["size"], meta["sport"])
    segs = hb.ball_mode(tr, truth["size"])
    res = {"ball_mode": round(sum(b - a + 1 for a, b in segs) / n, 3)}
    pred = {int(f) * 100: (None if v is None else (v[0], v[1])) for f, v in pred_one.items()}
    sc = ev.score_track(truth, pred)
    if sc["points"] >= 10:
        res.update({k: (round(v, 3) if isinstance(v, float) else v) for k, v in sc.items()})
    return res


def cmd_check(a):
    """One run per process (a Core ML crash only loses that run): official | torch | coreml:<units>; masks cached in
    lab/tests/coreml/<clip>@<variant>/<run>.npz; `report` compares every cached run."""
    truth, seed, s, tmp, names, roi = clip_setup(a)
    frames = Frames(tmp, names, 1024)
    xy = [seed["xy"][0] * 1024, seed["xy"][1] * 1024]
    d = run_dir(a)
    for run_name in a.runs.split(","):
        t = time.time()
        tag = run_name.replace(":", "_") + ("" if run_name == "official" else f"_{a.store}")
        extra = {"run": run_name, "store": a.store, "frames": len(names), "seed_frame": s, "host": platform.platform()}
        if run_name == "official":
            import loop as L

            masks, _ = L.run_official(build_model(), tmp, seed, s)
            tag = "official"
        else:
            if run_name == "torch":
                run = TorchRunner(make_parts(build_model()))
            elif run_name.startswith("coreml:"):
                if platform.system() != "Darwin":
                    sys.exit("Core ML models only run on macOS")
                run = CoreMLRunner(a.out, run_name.split(":")[1])
                extra["load_seconds"] = run.load
            else:
                sys.exit(f"unknown run {run_name}")
            with open(os.path.join(a.out, "edgetam_constants.json")) as f:
                nme = np.array(json.load(f)["no_mem_embed"], np.float32)
            tr = track(run, frames, s, xy, nme, store=STORES[a.store], mask_empty=not a.fill)
            if a.fill:
                tag += "_fill"
            masks = {}
            for fr, (mask, _score) in tr.items():
                m = F.interpolate(torch.from_numpy(mask), size=(frames.H, frames.W), mode="bilinear",
                                  align_corners=False)
                masks[fr] = (m[0, 0] > 0).numpy()
            per = {p: round(1000 * run.secs[p] / max(1, run.calls[p]), 1) for p in NAMES}
            extra.update(ms_per_call=per, ms_per_frame=round(sum(per.values()), 1))
        extra["seconds"] = round(time.time() - t, 1)
        pred_one = one_click_track(masks, roi)
        extra["judge"] = judge(a.clip, truth, pred_one)
        # as an oneclick.py track, so hybrid.py can frame and render it: --model edgetam-<run>-<variant>
        oc_tag = "edgetam-" + {"official": "pt"}.get(tag, tag.replace("_", "-")) + (f"-{a.variant}" if a.variant else "")
        extra["oneclick_tag"] = oc_tag
        save_masks(os.path.join(d, f"{tag}.npz"), masks, extra)
        with open(os.path.join(ev.ROOT, "lab", "tests", "oneclick", f"{a.clip}.ball.{oc_tag}.json"), "w") as f:
            json.dump({"clip": a.clip, "mode": "ball", "seedMs": int(s * 100), "frames": len(names), "fps": 10,
                       "source": "coreml_export.py " + run_name, "pred_one": pred_one}, f, separators=(",", ":"))
        print(tag, json.dumps(extra), flush=True)
    shutil.rmtree(tmp, ignore_errors=True)


def cmd_report(a):
    import loop as L

    d = run_dir(a)
    runs = {f[:-4]: load_masks(os.path.join(d, f)) for f in sorted(os.listdir(d)) if f.endswith(".npz")}
    if not runs:
        sys.exit(f"nothing in {d}: run `check` first")
    res = {"clip": a.clip, "variant": a.variant, "runs": {}}
    base = [k for k in ("official", "torch_fp16") if k in runs]
    lines = [f"{a.clip}@{a.variant}: share of the clip in ball mode (round 6), ball hits on labelled clips"]
    for k, (m, ex) in runs.items():
        row = {"judge": ex["judge"], "ms_per_frame": ex.get("ms_per_frame"), "ms_per_call": ex.get("ms_per_call"),
               "load_seconds": ex.get("load_seconds")}
        any_mask = next(iter(m.values()))
        for b in base:
            if b != k:
                row[f"vs_{b}"] = L.compare(runs[b][0], m, any_mask.shape[1], any_mask.shape[0])
        res["runs"][k] = row
        j = ex["judge"]
        lab = f", on the ball {100 * j['recall']:.0f}% (labels)" if j.get("recall") is not None else ""
        ms = f", {ex['ms_per_frame']} ms/frame" if ex.get("ms_per_frame") else ""
        same = row.get("vs_official")
        same = f", mask = EdgeTAM's {100 * same['iou_mean']:.0f}%" if same else ""
        lines.append(f"  {k:<18} ball mode {100 * j['ball_mode']:.0f}%{lab}{same}{ms}  [{ex.get('oneclick_tag')}]")
    with open(os.path.join(d, "report.json"), "w") as f:
        json.dump(res, f, indent=1)
    print("\n".join(lines))


def cmd_probe(a):
    """Each model: load, then one prediction on the example inputs, printing before each step (a crash shows where)."""
    run = None
    ex = examples()
    for k in (a.only.split(",") if a.only else NAMES):
        print(f"{a.units} {k}: loading", flush=True)
        import coremltools as ct

        cu = {"all": ct.ComputeUnit.ALL, "ne": ct.ComputeUnit.CPU_AND_NE, "gpu": ct.ComputeUnit.CPU_AND_GPU,
              "cpu": ct.ComputeUnit.CPU_ONLY}[a.units]
        t = time.perf_counter()
        m = ct.models.MLModel(os.path.join(a.out, f"edgetam_{k}.mlpackage"), compute_units=cu)
        print(f"{a.units} {k}: loaded in {time.perf_counter() - t:.1f} s, predicting", flush=True)
        run = CoreMLRunner.__new__(CoreMLRunner)
        run.models, run.secs, run.calls = {k: m}, {k: 0.0}, {k: 0}
        args = [x.numpy() for x in ex[k]]
        for i in range(3):
            run(k, *args)
        print(f"{a.units} {k}: OK, {1000 * run.secs[k] / 3:.1f} ms per call (first 3 calls)", flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("export", help="self-test the wrappers, then convert them to Core ML")
    e.add_argument("--out", default=OUT)
    e.add_argument("--target", default="iOS16", help="coremltools target (iOS16, iOS17, iOS18)")
    e.add_argument("--precision", choices=("fp16", "fp32"), default="fp16")
    e.add_argument("--only", default="", help="comma list of parts to convert")
    e.add_argument("--variants", action="store_true", help="also the attention variants (ATTENTION_VARIANTS)")
    c = sub.add_parser("check", help="track a clip (one or more runs) and score it against the labels")
    c.add_argument("clip")
    c.add_argument("--variant", default=None)
    c.add_argument("--frames", type=int, default=0)
    c.add_argument("--out", default=OUT)
    c.add_argument("--runs", default="official,torch",
                   help="comma list: official, torch, coreml:all, coreml:ne, coreml:gpu, coreml:cpu")
    c.add_argument("--store", choices=tuple(STORES), default="fp16", help="memory bank precision (the app: fp16)")
    c.add_argument("--fill", action="store_true", help="loop.py's first try: empty slots filled, not switched off")
    r = sub.add_parser("report", help="compare the cached runs of a clip")
    r.add_argument("clip")
    r.add_argument("--variant", default=None)
    p = sub.add_parser("probe", help="load and run each Core ML model once (find which one crashes)")
    p.add_argument("--out", default=OUT)
    p.add_argument("--units", default="cpu")
    p.add_argument("--only", default="")
    a = ap.parse_args()
    {"export": cmd_export, "check": cmd_check, "report": cmd_report, "probe": cmd_probe}[a.cmd](a)


if __name__ == "__main__":
    main()
