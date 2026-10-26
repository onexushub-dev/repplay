import sys,os,json,math,glob
B="/root/lance/docs/superpowers/spikes/focus-v2/bench"; sys.path.insert(0,B)
from focusbench.labels import load_labels
from focusbench.tracker import track_ball
from focusbench.path_v2 import v2_rects, max_zoom_for
from focusbench.v1path import v1_rects, TUNING_V1
from focusbench.metrics import clip_metrics
SRC="/root/lance/docs/focus-refs/refs4k"
DIRS=[os.path.join(SRC,"det"),os.path.join(SRC,"det4k")]
PT=dict(TUNING_V1,spreadScale=1.1,spreadMargin=0.10,sigmaXMs=800.0)
ST=dict(static_radius=0.02,static_share=0.5)
def filt(s,mth=4.0,feet=0.85,body_conf=0.3):
    keep=[]
    for b,mv in zip(s["balls"],s.get("motion",[None]*len(s["balls"]))):
        if mv is None or mv<mth: continue
        zone="out"
        for p in s["people"]:
            x,y,w,h=p[:4]
            if x<=b[0]<=x+w and y<=b[1]<=y+h: zone="feet" if (b[1]-y)/h>=feet else "body"; break
        if zone=="feet" or (zone=="body" and b[3]<body_conf): continue
        keep.append(b)
    return dict(s,balls=keep)
def load(clip,variant):
    for d in DIRS:
        f=os.path.join(d,f"{clip}-{variant}.dfine_s.json")
        if os.path.exists(f): return json.load(open(f))
def analyse(clip,variant):
    d=load(clip,variant)
    if d is None: return None
    L={int(k):v for k,v in load_labels(os.path.join(SRC,clip+".ball.json")).items() if not isinstance(v,str)}
    W,H=d["W"],d["H"]; hw=H/W; asp="portrait" if H>=W else "landscape"
    by={s["t"]:s for s in d["samples"]}
    r={"clip":clip,"variant":variant,"labels":len(L)}
    for tag,S in (("raw",d["samples"]),("filt",[filt(s) for s in d["samples"]])):
        byS={s["t"]:s for s in S}; hit=tc=fc=0
        for t,v in L.items():
            s=byS.get(t)
            if s is None: continue
            h=False
            for b in s["balls"]:
                ok=math.hypot(b[0]-v[0],(b[1]-v[1])*hw)<0.025; tc+=ok; fc+=not ok; h|=ok
            hit+=h
        r[tag+"_recall"]=hit/len(L); r[tag+"_prec"]=tc/max(1,tc+fc); r[tag+"_cands"]=sum(len(s["balls"]) for s in S)/len(S)
    S=[filt(s) for s in d["samples"]]
    rows=track_ball(S,ST,hw=hw)
    good=bad=0
    for t,v in L.items():
        k=round((t-d["startMs"])/100)
        if 0<=k<len(rows) and rows[k][2] in (0,1):
            if math.hypot(rows[k][0]-v[0],(rows[k][1]-v[1])*hw)<0.05: good+=1
            else: bad+=1
    r["trk_right"]=good/len(L); r["trk_wrong"]=bad/len(L)
    mz=max_zoom_for(min(W,H)); r["max_zoom"]=mz
    boxes=[(x["t"],[tuple(p[:4]) for p in x["people"]]) for x in S]
    Lm={str(k):v for k,v in L.items()}
    a=clip_metrics(v1_rects(boxes,W,H,asp,True,mz,PT),Lm,d["startMs"])
    b=clip_metrics(v2_rects(S,rows,W,H,asp,True,mz,ST),Lm,d["startMs"])
    r["players"]=(a.ball_in_crop,a.mean_zoom,a.jerk_p95) if a.available else None
    r["ball_led"]=(b.ball_in_crop,b.mean_zoom,b.jerk_p95) if b.available else None
    return r
def fmt(r):
    f=lambda m:"unavail" if m is None else f"{m[0]:.0%} z{m[1]:.2f} j{m[2]:.2f}"
    return (f"{r['clip']:15s} {r['variant']:9s} ball found {r['raw_recall']:.0%} (prec {r['raw_prec']:.0%}, {r['raw_cands']:.1f}/frame) "
            f"-> filtered {r['filt_recall']:.0%} (prec {r['filt_prec']:.0%}) | tracker right {r['trk_right']:.0%} wrong {r['trk_wrong']:.0%} "
            f"| max {r['max_zoom']:.1f}x players {f(r['players'])} ball-led {f(r['ball_led'])}")
if __name__=="__main__":
    for c in ("tabletennis-02","beachtennis-01","tabletennis-01","tennis-02","basket-05","volley-01"):
        for v in ("1080","1440","2160","2160g3x2"):
            r=analyse(c,v)
            if r: print(fmt(r),flush=True)
