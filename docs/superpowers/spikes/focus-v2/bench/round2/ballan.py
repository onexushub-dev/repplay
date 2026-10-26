import sys,os,json,math,glob
sys.path.insert(0,"/root/lance/docs/superpowers/spikes/focus-v2/bench")
from focusbench.labels import load_labels
SRC="/root/lance/docs/focus-refs/refs4k"; HW=9/16
def score(path,clip,tol=0.025):
    d=json.load(open(path)); L={int(k):v for k,v in load_labels(os.path.join(SRC,clip+".ball.json")).items() if not isinstance(v,str)}
    by={s["t"]:s for s in d["samples"]}; n=hit=top=tc=fc=empty=0
    for t,v in L.items():
        s=by.get(t)
        if s is None: continue
        n+=1; c=s["balls"]
        if not c: empty+=1
        ok=[math.hypot(b[0]-v[0],(b[1]-v[1])*HW)<tol for b in c]
        hit+=any(ok); tc+=sum(ok); fc+=len(ok)-sum(ok)
        if c and ok[max(range(len(c)),key=lambda i:c[i][2])]: top+=1
    cands=sum(len(s["balls"]) for s in d["samples"])/max(1,len(d["samples"]))
    return dict(n=n,recall=hit/max(1,n),top1=top/max(1,n),prec=tc/max(1,tc+fc),cands=cands,empty=empty/max(1,n))
if __name__=="__main__":
    for f in sorted(glob.glob(SRC+"/wasb/*.json")+glob.glob("/root/ballrun/refs4k/seg/balls/*.json")+glob.glob(SRC+"/balls/*.json")):
        b=os.path.basename(f)[:-5]; clip=next(c for c in ("tabletennis-02","tabletennis-01","beachtennis-01","tennis-02","basket-05","volley-01") if b.startswith(c))
        r=score(f,clip); print(f"{b:38s} n={r['n']:3d} found {r['recall']:.0%}  best-guess right {r['top1']:.0%}  prec {r['prec']:.0%}  {r['cands']:.1f}/frame  nothing {r['empty']:.0%}")
