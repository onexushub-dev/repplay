import sys,os,json,math; SP=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,SP)
import tune
from run import _load_det, CLIPS
def load(model):
    out=[]
    for name,_,L in tune.DATA:
        f=os.path.join(SP,"motion",name+f".{model}.json")
        d=_load_det(os.path.join(CLIPS,name),model)
        if d is None or not os.path.exists(f): continue
        m={int(k):v for k,v in json.load(open(f)).items()}
        out.append((name,d,L,m))
    return out
def with_motion(d,m,th,static_extra=None):
    S=[]
    for s in d["samples"]:
        ms=m.get(s["t"],[])
        S.append(dict(s,balls=[b for b,v in zip(s["balls"],ms) if v is not None and v>=th]))
    return S

from focusbench.tracker import track_ball
from focusbench.path_v2 import v2_rects
from focusbench.v1path import v1_rects, TUNING_V1
def evaluate(model, th, tuning=None, mz=3.0, v2t=None, only=None):
    good=bad=lost=lab=ins1=ins2=0; z1=z2=nc=0; j1=j2=0
    from focusbench.metrics import clip_metrics
    PT=dict(TUNING_V1,spreadScale=1.1,spreadMargin=0.10,sigmaXMs=800.0)
    for name,d,L,m in load(model):
        if only and name not in only: continue
        S=with_motion(d,m,th); W,H=d["W"],d["H"]; hw=H/W; asp="portrait" if H>=W else "landscape"
        rows=track_ball(S,tuning,hw=hw)
        boxes=[(x["t"],[tuple(p[:4]) for p in x["people"]]) for x in S]
        R1=v1_rects(boxes,W,H,asp,True,mz,PT); R2=v2_rects(S,rows,W,H,asp,True,mz,dict(tuning or {},**(v2t or {})))
        a=clip_metrics(R1,L,d["startMs"]); b=clip_metrics(R2,L,d["startMs"])
        z1+=a.mean_zoom; z2+=b.mean_zoom; j1+=a.jerk_p95; j2+=b.jerk_p95; nc+=1; ins1+=a.inside; ins2+=b.inside
        for t,v in L.items():
            if isinstance(v,str): continue
            k=round((int(t)-d["startMs"])/100)
            if not 0<=k<len(rows): continue
            r=rows[k]; lab+=1
            if r[2] in (0,1):
                if math.hypot(r[0]-v[0],(r[1]-v[1])*hw)<0.05: good+=1
                else: bad+=1
            else: lost+=1
    return f"{model} th={th}: right {good/lab:.0%} wrong {bad/lab:.0%} none {lost/lab:.0%} | players-only {ins1/lab:.1%} z{z1/nc:.2f} j{j1/nc:.2f} | ball-led {ins2/lab:.1%} z{z2/nc:.2f} j{j2/nc:.2f}"

def no_feet(S, feet=0.85, body_conf=None):
    out=[]
    for s in S:
        keep=[]
        for b in s["balls"]:
            zone="out"
            for p in s["people"]:
                x,y,w,h=p[:4]
                if x<=b[0]<=x+w and y<=b[1]<=y+h:
                    zone="feet" if (b[1]-y)/h>=feet else "body"; break
            if zone=="feet": continue
            if zone=="body" and body_conf is not None and b[3]<body_conf: continue
            keep.append(b)
        out.append(dict(s,balls=keep))
    return out
_wm=with_motion
def with_motion(d,m,th,static_extra=None):
    S=_wm(d,m,th)
    return no_feet(S, **(FILTER or {})) if FILTER is not None else S
FILTER=None
