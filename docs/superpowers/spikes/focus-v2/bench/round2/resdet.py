"""Resolution round: D-FINE-S on the 100 ms grid at the clip's own resolution, tiles sized for native pixels,
plus a motion score per ball candidate (min |Δ| vs previous and next sample, native pixels)."""
import sys, os, json, time
B="/root/lance/docs/superpowers/spikes/focus-v2/bench"; sys.path.insert(0,B)
import cv2, numpy as np
from focusbench.detect import Detector, _axis, merge, sample_from
from focusbench.clips import frames_on_grid
SRC="/root/lance/docs/focus-refs/refs4k"; OUT=os.path.join(SRC,"det"); os.makedirs(OUT,exist_ok=True)
GRID={"1080":(3,2),"1440":(4,3),"2160":(6,4),"2160g3x2":(3,2)}
def tiles(cols,rows): return [(x,y,w,h) for (y,h) in _axis(rows) for (x,w) in _axis(cols)]
def frame(det,bgr,grid):
    full=det.run(bgr); h,w=bgr.shape[:2]; parts=[]
    for t in tiles(*grid):
        x0,y0=round(t[0]*w),round(t[1]*h); x1,y1=min(w,round((t[0]+t[2])*w)),min(h,round((t[1]+t[3])*h))
        parts.append(((x0/w,y0/h,(x1-x0)/w,(y1-y0)/h),det.run(bgr[y0:y1,x0:x1])))
    return merge(full,parts)
def motion(g,a,b,x,y,r):
    if a is None or b is None: return None
    h,w=g.shape; R=max(4,int(round(1.5*r*w))); cx,cy=int(x*w),int(y*h)
    sl=(slice(max(0,cy-R),cy+R+1),slice(max(0,cx-R),cx+R+1))
    p,pa,pb=g[sl].astype(np.int16),a[sl].astype(np.int16),b[sl].astype(np.int16)
    return float(min(np.abs(p-pa).mean(),np.abs(p-pb).mean()))
def run(clip,variant,secs,model="dfine_s"):
    res="2160" if variant.startswith("2160") else variant
    out=os.path.join(OUT,f"{clip}-{variant}.{model}.json")
    if os.path.exists(out): return
    det=Detector(model,threads=1); t0=time.time()
    path=os.path.join(SRC,f"{clip}-{res}.mp4"); S=[]
    win=[]  # (frame, grey) of previous, current, next
    def emit(prev,cur,nxt):
        f,g=cur; H,W=f.image.shape[:2]; s=sample_from(f.tick,frame(det,f.image,GRID[variant]),W,H)
        s["motion"]=[motion(g,prev[1] if prev else None,nxt[1] if nxt else None,x,y,r) for (x,y,r,c) in s["balls"]]
        S.append(s); return W,H
    for f in frames_on_grid(path,0,int(secs*1000),100,long_side=4000):
        win.append((f,cv2.GaussianBlur(cv2.cvtColor(f.image,cv2.COLOR_BGR2GRAY),(3,3),0)))
        if len(win)==2 and not S: W,H=emit(None,win[0],win[1])
        if len(win)==3: W,H=emit(win[0],win[1],win[2]); win.pop(0)
    W,H=emit(win[0] if len(win)>1 else None,win[-1],None)
    json.dump({"clip":clip,"variant":variant,"model":model,"W":W,"H":H,"stepMs":100,"startMs":0,"endMs":int(secs*1000),
               "tiled":True,"elapsedS":round(time.time()-t0,1),"samples":S},open(out,"w"))
    print(clip,variant,round(time.time()-t0),"s",flush=True)
if __name__=="__main__":
    part,parts=int(sys.argv[1]),int(sys.argv[2])
    jobs=[(c,v) for c in ("tabletennis-02","beachtennis-01","tabletennis-01","tennis-02","basket-05","volley-01") for v in ("1080","1440","2160","2160g3x2")]
    for i,(c,v) in enumerate(jobs):
        if i%parts==part: run(c,v,30)
