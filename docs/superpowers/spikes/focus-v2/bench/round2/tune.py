import sys, os, json
B="/root/lance/docs/superpowers/spikes/focus-v2/bench"; sys.path.insert(0,B)
from run import clip_windows, _load_det
from focusbench.labels import label_path, load_labels
from focusbench.metrics import clip_metrics, overall
from focusbench.tracker import track_ball
from focusbench.path_v2 import v2_rects
from focusbench.v1path import v1_rects
DATA=[]
for path,s,e in clip_windows():
    d=_load_det(path,"yolox_s"); L=load_labels(label_path(path))
    if d is None: continue
    DATA.append((os.path.basename(path),d,L))
def run(tuning=None, mz=1.5, tracker=None, per=False):
    r1,r2=[],[]
    for name,d,L in DATA:
        W,H=d["W"],d["H"]; asp="portrait" if H>=W else "landscape"
        rows=track_ball(d["samples"], dict(tuning or {}, **(tracker or {})), hw=H/W)
        boxes=[(x["t"],[tuple(p[:4]) for p in x["people"]]) for x in d["samples"]]
        a=clip_metrics(v1_rects(boxes,W,H,asp,True,mz),L,d["startMs"])
        b=clip_metrics(v2_rects(d["samples"],rows,W,H,asp,True,mz,tuning),L,d["startMs"])
        r1.append(a); r2.append(b)
        if per: print(f"{name:40s} {a.inside}/{a.labelled} -> {b.inside}/{b.labelled}  z {a.mean_zoom:.2f}->{b.mean_zoom:.2f} j {a.jerk_p95:.2f}->{b.jerk_p95:.2f}")
    o1,o2=overall(r1),overall(r2)
    f=lambda o:f"ball {o['ball_in_crop']:.1%} zoom {o['mean_zoom']:.2f} jerk {o['jerk_p95']:.2f}"
    return f(o1), f(o2)
if __name__=="__main__":
    print("v1 | v2:", *run(per=True))
