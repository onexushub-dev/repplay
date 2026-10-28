"""Proxy experiment: how small can a player get before an arms-up pose stops being readable?

Ground truth: YOLO11s-pose on full-res frames, people >= 260 px tall with confident joints.
Each GT person is then shrunk (crop around them, downscale so they are H px tall, as if farther away with the same
camera) and re-read two ways:
  - "crop": pose on the shrunk crop (what the app does after it found the person)
  - detection recall: person detector on the whole frame downscaled so this person is H px tall (full frame, imgsz 640
    — roughly what a full-frame detector sees) vs on a tile (imgsz 640 on a 1/3-width tile = 3x more pixels per person)
Rules are the app's ArmsUp (minWristRise 0.35, conf 0.2, elbows optional).
Usage: python3 distance_sim.py <video> [...]   -> prints JSON lines to stdout
"""
import json, sys
import cv2, numpy as np
from ultralytics import YOLO

POSE = YOLO('yolo11s-pose.pt')
HEIGHTS = [200, 140, 110, 90, 75, 60, 50, 40, 32]

def arms_up(k, c, conf=0.2):
    # k: 17x2 (x,y) image coords y down; c: 17 conf
    nose, ls, rs, le, re, lw, rw = 0, 5, 6, 7, 8, 9, 10
    if c[lw] < conf or c[rw] < conf or c[ls] < conf or c[rs] < conf: return None  # unreadable
    width = abs(k[ls][0] - k[rs][0])
    if width <= 0: return None
    head = k[nose][1] if c[nose] >= conf else (k[ls][1] + k[rs][1]) / 2 - 0.75 * width
    line = head - 0.35 * width
    if not (k[lw][1] < line and k[rw][1] < line): return False
    if c[le] >= conf and not (k[le][1] < k[ls][1]): return False
    if c[re] >= conf and not (k[re][1] < k[rs][1]): return False
    return True

def wrists_above_head(k, c, conf=0.2):
    """Looser 'raised' rule (WaveTracker.armsRaised)."""
    nose, ls, rs, lw, rw = 0, 5, 6, 9, 10
    if min(c[lw], c[rw], c[ls], c[rs]) < conf: return None
    width = abs(k[ls][0] - k[rs][0])
    if width <= 0: return None
    head = k[nose][1] if c[nose] >= conf else (k[ls][1] + k[rs][1]) / 2 - 0.75 * width
    return bool(k[lw][1] < head and k[rw][1] < head)

def rise(k, c, conf):
    """How far the LOWER wrist is above the head line, in shoulder widths (None if unreadable)."""
    nose, ls, rs, lw, rw = 0, 5, 6, 9, 10
    if min(c[lw], c[rw], c[ls], c[rs]) < conf: return None
    width = abs(k[ls][0] - k[rs][0])
    if width <= 0: return None
    head = k[nose][1] if c[nose] >= conf else (k[ls][1] + k[rs][1]) / 2 - 0.75 * width
    return float((head - max(k[lw][1], k[rw][1])) / width)

def run_pose(img, imgsz):
    r = POSE.predict(img, imgsz=imgsz, conf=0.25, verbose=False)[0]
    if r.keypoints is None or len(r.boxes) == 0: return []
    out = []
    for b, kp, kc in zip(r.boxes.xyxy.cpu().numpy(), r.keypoints.xy.cpu().numpy(), r.keypoints.conf.cpu().numpy()):
        out.append((b, kp, kc))
    return out

def best_match(dets, box):
    """Detection whose box overlaps `box` most (IoU)."""
    best, bi = None, 0.3
    for d in dets:
        b = d[0]
        ix = max(0, min(b[2], box[2]) - max(b[0], box[0])); iy = max(0, min(b[3], box[3]) - max(b[1], box[1]))
        u = (b[2]-b[0])*(b[3]-b[1]) + (box[2]-box[0])*(box[3]-box[1]) - ix*iy
        iou = ix*iy/u if u > 0 else 0
        if iou > bi: best, bi = d, iou
    return best

def main():
    for path in sys.argv[1:]:
        cap = cv2.VideoCapture(path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        step = int(round(fps * 0.4))
        i = -1
        while True:
            ok, frame = cap.read()
            if not ok: break
            i += 1
            if i % step: continue
            H0, W0 = frame.shape[:2]
            gts = run_pose(frame, 1280)
            for (b, k, c) in gts:
                ph = b[3] - b[1]
                if ph < 260: continue
                if min(c[[5, 6, 9, 10]]) < 0.6: continue
                gt = arms_up(k, c, 0.5)
                if gt is None: continue
                r0 = rise(k, c, 0.5)
                if r0 is not None and 0.0 < r0 < 0.8: continue  # hands at the head: ambiguous
                if not gt and (i * 7 + int(b[0])) % 4: continue  # keep 1 in 4 negatives (speed)
                rec = {'file': path.split('/')[-1], 'frame': i, 'h0': float(ph), 'gt': bool(gt),
                       'gt_raised': wrists_above_head(k, c, 0.5), 'gt_rise': rise(k, c, 0.5)}
                # crop like PersonCrop: x -0.6w, width 2.2w; height 1.8h (more room above)
                w = b[2]-b[0]
                x1, x2 = max(0, b[0]-0.6*w), min(W0, b[2]+0.6*w)
                y1, y2 = max(0, b[1]-0.6*ph), min(H0, b[3]+0.2*ph)
                crop = frame[int(y1):int(y2), int(x1):int(x2)]
                for Ht in HEIGHTS:
                    s = Ht / ph
                    small = cv2.resize(crop, (max(8, int(crop.shape[1]*s)), max(8, int(crop.shape[0]*s))),
                                       interpolation=cv2.INTER_AREA)
                    # light blur + jpeg-ish softening to mimic real far footage
                    small = cv2.GaussianBlur(small, (0, 0), 0.6)
                    ok2, enc = cv2.imencode('.jpg', small, [cv2.IMWRITE_JPEG_QUALITY, 70])
                    small = cv2.imdecode(enc, cv2.IMREAD_COLOR)
                    up = cv2.resize(small, (small.shape[1]*4, small.shape[0]*4), interpolation=cv2.INTER_LINEAR)
                    dets = run_pose(up, 320)
                    # the person is the biggest one centred in the crop
                    tb = [(b[0]-x1)*s*4, (b[1]-y1)*s*4, (b[2]-x1)*s*4, (b[3]-y1)*s*4]
                    d = best_match(dets, tb)
                    if d is None:
                        rec[f'c{Ht}'] = 'miss'; continue
                    a = arms_up(d[1], d[2], 0.2)
                    r = wrists_above_head(d[1], d[2], 0.2)
                    rec[f'c{Ht}'] = 'na' if a is None else ('up' if a else 'down')
                    rec[f'r{Ht}'] = 'na' if r is None else ('up' if r else 'down')
                    rec[f'z{Ht}'] = rise(d[1], d[2], 0.2)
                print(json.dumps(rec), flush=True)

if __name__ == '__main__':
    main()
