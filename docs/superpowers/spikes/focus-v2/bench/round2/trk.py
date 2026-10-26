import sys,math,os; sys.path.insert(0,'/tmp/claude-0/-home-claude/3a58d651-9454-5369-bb06-3562ff803aed/scratchpad')
import tune
from run import _load_det, CLIPS
from focusbench.tracker import track_ball
from focusbench.path_v2 import v2_rects
from focusbench.v1path import v1_rects
def evaluate(model, tuning=None, mz=3.0, subset=True, ball_min=0.0, v2t=None):
    good=bad=lost=0; ins1=ins2=lab=0; z1=z2=0; nc=0
    for name,_,L in tune.DATA:
        d=_load_det(os.path.join(CLIPS,name),model)
        if d is None or (subset and _load_det(os.path.join(CLIPS,name),"dfine_s") is None): continue
        S=[dict(s,balls=[b for b in s["balls"] if b[3]>=ball_min]) for s in d["samples"]]
        W,H=d["W"],d["H"];hw=H/W;asp="portrait" if H>=W else "landscape"
        rows=track_ball(S,tuning,hw=hw)
        boxes=[(x["t"],[tuple(p[:4]) for p in x["people"]]) for x in S]
        R1=v1_rects(boxes,W,H,asp,True,mz); R2=v2_rects(S,rows,W,H,asp,True,mz,dict(tuning or {},**(v2t or {})))
        z1+=sum(1/r[2] for r in R1)/len(R1); z2+=sum(1/r[2] for r in R2)/len(R2); nc+=1
        for t,v in L.items():
            if isinstance(v,str): continue
            k=round((int(t)-d["startMs"])/100)
            if not 0<=k<len(rows): continue
            r=rows[k]; lab+=1
            if r[2] in (0,1):
                if math.hypot(r[0]-v[0],(r[1]-v[1])*hw)<0.05: good+=1
                else: bad+=1
            else: lost+=1
            for R,which in ((R1,1),(R2,2)):
                x,y,w,h=R[k]; i=x<=v[0]<=x+w and y<=v[1]<=y+h
                if which==1: ins1+=i
                else: ins2+=i
    return f"{model}: tracked-right {good/lab:.0%} tracked-wrong {bad/lab:.0%} not-tracked {lost/lab:.0%} | ball-in-crop v1 {ins1/lab:.1%} (z{z1/nc:.2f}) v2 {ins2/lab:.1%} (z{z2/nc:.2f})"
if __name__=="__main__":
    for m in ("yolox_s","dfine_s"): print(evaluate(m))
    print(evaluate("dfine_s",ball_min=0.3))
