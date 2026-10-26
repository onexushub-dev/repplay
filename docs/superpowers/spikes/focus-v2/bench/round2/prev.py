import sys,os; SP='/tmp/claude-0/-home-claude/3a58d651-9454-5369-bb06-3562ff803aed/scratchpad'; sys.path.insert(0,SP)
import tune
from run import CLIPS, OUT
from focusbench.v1path import v1_rects, TUNING_V1
from focusbench.report import render_preview
T=dict(TUNING_V1,spreadScale=1.1,spreadMargin=0.10,sigmaXMs=800.0)
want=["basket-v-corner-normal-09.mp4","basket-h-side-low-normal-03.mp4","basket-h-corner-backlight-05.mp4","basket-v-corner-normal-02.mp4"]
os.makedirs(os.path.join(OUT,"preview-people3x"),exist_ok=True)
for name,d,L in tune.DATA:
    if name not in want: continue
    W,H=d["W"],d["H"];asp="portrait" if H>=W else "landscape"
    boxes=[(x["t"],[tuple(p[:4]) for p in x["people"]]) for x in d["samples"]]
    render_preview(os.path.join(CLIPS,name),d["startMs"],d["endMs"],v1_rects(boxes,W,H,asp,True,1.5),v1_rects(boxes,W,H,asp,True,3.0,T),asp,os.path.join(OUT,"preview-people3x",name),L)
    print(name,flush=True)
