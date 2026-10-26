"""Blind sharpness test: one framing path (players-only, from the 4K detections, zoom up to `mz`) cut from the
1080p, 1440p and 2160p versions of the same clip and scaled to a 1920x1080 export; stacked A/B/C in random order."""
import sys,os,json,random,subprocess
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import cv2,numpy as np
from resan import load, filt, PT, SRC
from focusbench.v1path import v1_rects
from focusbench.report import interpolate
clip=sys.argv[1]; mz=float(sys.argv[2]) if len(sys.argv)>2 else 3.0
d=load(clip,"2160"); W,H=d["W"],d["H"]
boxes=[(x["t"],[tuple(p[:4]) for p in x["people"]]) for x in d["samples"]]
R=v1_rects(boxes,W,H,"landscape",True,mz,PT)
res=["1080","1440","2160"]; order=res[:]; random.Random(clip).shuffle(order)
key=dict(zip("ABC",order))
out=os.path.join(SRC,"blind"); os.makedirs(out,exist_ok=True)
json.dump(key,open(os.path.join(out,f"{clip}.key.json"),"w"))
caps={r:cv2.VideoCapture(os.path.join(SRC,f"{clip}-{r}.mp4")) for r in res}
fps=caps["2160"].get(cv2.CAP_PROP_FPS)
encs={L:subprocess.Popen(["ffmpeg","-v","error","-y","-f","rawvideo","-pix_fmt","bgr24","-s","1920x1080","-r",f"{fps:.3f}","-i","-",
    "-c:v","libx264","-preset","veryfast","-crf","19","-pix_fmt","yuv420p",os.path.join(out,f"{clip}-{L}.mp4")],stdin=subprocess.PIPE) for L in "ABC"}
n=0
while True:
    frames={}
    for r,c in caps.items():
        ok,im=c.read()
        if not ok: break
        frames[r]=im
    if len(frames)<3: break
    t=n*1000/fps; n+=1
    if t>=d["endMs"]: break
    x,y,w,h=interpolate(R,0,100,t)
    for L in "ABC":
        im=frames[key[L]]; fh,fw=im.shape[:2]
        x0,y0=int(round(x*fw)),int(round(y*fh)); x1,y1=int(round((x+w)*fw)),int(round((y+h)*fh))
        crop=cv2.resize(im[y0:y1,x0:x1],(1920,1080),interpolation=cv2.INTER_LINEAR)
        encs[L].stdin.write(crop.tobytes())
for e in encs.values(): e.stdin.close(); e.wait()
print(clip,"zoom mean",round(sum(1/r[2] for r in R)/len(R),2),"frames",n,flush=True)
