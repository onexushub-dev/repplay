import sys; sys.path.insert(0,'/tmp/claude-0/-home-claude/3a58d651-9454-5369-bb06-3562ff803aed/scratchpad')
import tune
from collections import Counter
from focusbench.tracker import track_ball
from focusbench.path_v2 import v2_rects
mz=float(sys.argv[1]) if len(sys.argv)>1 else 3.0
c=Counter(); tot=Counter(); err=[]
for name,d,L in tune.DATA:
    W,H=d["W"],d["H"]; asp="portrait" if H>=W else "landscape"
    rows=track_ball(d["samples"],hw=H/W)
    R=v2_rects(d["samples"],rows,W,H,asp,True,mz)
    for t,v in L.items():
        if isinstance(v,str): continue
        k=round((int(t)-d["startMs"])/100)
        if not 0<=k<len(R): continue
        x,y,w,h=R[k]; st=rows[k][2]; tot[st]+=1
        if st in ("seen","predicted") or st in (0,1):
            import math; err.append(math.hypot(rows[k][0]-v[0],(rows[k][1]-v[1])*H/W))
        if not (x<=v[0]<=x+w and y<=v[1]<=y+h): c[st]+=1
print("misses by state",dict(c)); print("labelled by state",dict(tot))
err.sort(); n=len(err)
if n: print("tracker err (frame widths) on seen/pred: median %.3f p90 %.3f n=%d, >0.1: %d"%(err[n//2],err[int(n*.9)],n,sum(e>0.1 for e in err)))
