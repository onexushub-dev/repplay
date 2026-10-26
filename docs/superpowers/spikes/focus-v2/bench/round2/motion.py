"""Motion score per ball candidate: how much its patch changed vs the previous and next grid frames (min of both)."""
import sys, os, json
B="/root/lance/docs/superpowers/spikes/focus-v2/bench"; sys.path.insert(0,B)
import cv2, numpy as np
from run import clip_windows, _load_det
from focusbench.clips import frames_on_grid
SP=os.path.dirname(os.path.abspath(__file__))
def patch(g, x, y, R):
    h, w = g.shape
    cx, cy = int(x*w), int(y*h)
    return g[max(0,cy-R):cy+R+1, max(0,cx-R):cx+R+1].astype(np.int16)
def one(path, start, end, model):
    out=os.path.join(SP,"motion",os.path.basename(path)+f".{model}.json")
    if os.path.exists(out): return
    d=_load_det(path,model)
    if d is None: return
    by={s["t"]:s for s in d["samples"]}
    grays={}
    for f in frames_on_grid(path,start,end,long_side=960):
        g=cv2.GaussianBlur(cv2.cvtColor(f.image,cv2.COLOR_BGR2GRAY),(3,3),0); grays[f.tick]=g
    res={}
    for t,s in by.items():
        g=grays.get(t); a=grays.get(t-100); b=grays.get(t+100)
        row=[]
        for (x,y,r,c) in s["balls"]:
            if g is None or a is None or b is None: row.append(None); continue
            R=max(4,int(round(1.5*r*g.shape[1])))
            p=patch(g,x,y,R); pa=patch(a,x,y,R); pb=patch(b,x,y,R)
            if p.shape!=pa.shape or p.shape!=pb.shape: row.append(None); continue
            row.append(float(min(np.abs(p-pa).mean(),np.abs(p-pb).mean())))
        res[t]=row
    json.dump(res,open(out,"w"))
    print(os.path.basename(path),model,flush=True)
if __name__=="__main__":
    model=sys.argv[1]; part=int(sys.argv[2]); parts=int(sys.argv[3])
    for i,(p,s,e) in enumerate(clip_windows()):
        if i%parts==part: one(p,s,e,model)
