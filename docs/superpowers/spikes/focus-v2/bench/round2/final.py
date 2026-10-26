import sys,os,json,math
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from resan import load, filt, PT, ST, SRC
from focusbench.labels import load_labels
from focusbench.tracker import track_ball
from focusbench.path_v2 import v2_rects
from focusbench.v1path import v1_rects, gaussian
from focusbench.metrics import clip_metrics
BALLS={"tennis-02":"wasb-2160-g2","tabletennis-02":"tnv3_badminton-1080-g1","tabletennis-01":"tnv3_badminton-1080-g1",
       "volley-01":"tnv3_beachvolley-1080-g1","beachtennis-01":None,"basket-05":None}
def spec(clip):
    k=BALLS[clip]
    if k is None: return None
    for d in (os.path.join(SRC,"balls"),"/root/ballrun/refs4k/seg/balls"):
        f=os.path.join(d,f"{clip}-{k}.json")
        if os.path.exists(f): return {s["t"]:s["balls"] for s in json.load(open(f))["samples"]}
def smooth(R,sigma_ms=600,step=100):
    xs=gaussian([r[0]+r[2]/2 for r in R],sigma_ms/step); ys=gaussian([r[1]+r[3]/2 for r in R],sigma_ms/step)
    ws=gaussian([r[2] for r in R],sigma_ms/step); hs=gaussian([r[3] for r in R],sigma_ms/step); out=[]
    for x,y,w,h in zip(xs,ys,ws,hs):
        x0=min(max(0,x-w/2),1-w); y0=min(max(0,y-h/2),1-h); out.append((x0,y0,w,h))
    return out
FREE=dict(ST,accel_max=1e6,pan_base=10.0,pan_fast=10.0,dead_zone_w=0.0,settle=0.0)
def evaluate(clip,variant="2160",mz=3.0,source="dfine"):
    d=load(clip,variant); W,H=d["W"],d["H"]; hw=H/W
    L={str(k):v for k,v in load_labels(os.path.join(SRC,clip+".ball.json")).items() if not isinstance(v,str)}
    S=[filt(s) for s in d["samples"]]
    sp=spec(clip)
    if source!="dfine":
        if sp is None: return None
        S=[dict(s,balls=[(b[0],b[1],0.004,b[2]) for b in sp.get(s["t"],[])]+(s["balls"] if source=="union" else [])) for s in S]
    rows=track_ball(S,ST,hw=hw)
    boxes=[(x["t"],[tuple(p[:4]) for p in x["people"]]) for x in S]
    P=v1_rects(boxes,W,H,"landscape",True,mz,PT)
    B=v2_rects(S,rows,W,H,"landscape",True,mz,FREE)
    out={}
    for name,R in (("players",P),("ball",smooth(B) if B else None)):
        m=clip_metrics(R,L,d["startMs"]); out[name]=(m.ball_in_crop,m.mean_zoom,m.jerk_p95)
    return out
if __name__=="__main__":
    f=lambda m:f"{m[0]:.0%} z{m[1]:.2f} j{m[2]:.2f}"
    for clip in ("tennis-02","tabletennis-02","tabletennis-01","volley-01","beachtennis-01","basket-05"):
        for mz in (1.5,3.0):
            line=[f"{clip:15s} max{mz}"]
            for src in ("dfine","spec","union"):
                r=evaluate(clip,"2160" if load(clip,"2160") else "1440",mz,src)
                if r is None: continue
                if src=="dfine": line.append("players "+f(r["players"]))
                line.append(f"ball[{src}] "+f(r["ball"]))
            print(" | ".join(line),flush=True)
