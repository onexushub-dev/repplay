import sys,os,subprocess
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import cv2
import final
from final import load, filt, ST, FREE, smooth, SRC
from focusbench.tracker import track_ball
from focusbench.path_v2 import v2_rects
from focusbench.v1path import v1_rects
from focusbench.report import interpolate
from final import PT
clip=sys.argv[1]; mz=3.0
d=load(clip,"2160"); W,H=d["W"],d["H"]
S=[filt(s) for s in d["samples"]]
rows=track_ball(S,ST,hw=H/W)
B=smooth(v2_rects(S,rows,W,H,"landscape",True,mz,FREE))
boxes=[(x["t"],[tuple(p[:4]) for p in x["people"]]) for x in S]
P=v1_rects(boxes,W,H,"landscape",True,mz,PT)
cap=cv2.VideoCapture(os.path.join(SRC,f"{clip}-2160.mp4")); fps=cap.get(cv2.CAP_PROP_FPS)
out=os.path.join(SRC,"blind",f"{clip}-players-vs-ball.mp4")
# top: players (today), bottom: ball-led; each 1280x720 (from a 1920x1080 export of the crop)
enc=subprocess.Popen(["ffmpeg","-v","error","-y","-f","rawvideo","-pix_fmt","bgr24","-s","1280x1440","-r",f"{fps:.3f}","-i","-",
    "-c:v","libx264","-preset","veryfast","-crf","21","-pix_fmt","yuv420p",out],stdin=subprocess.PIPE)
import numpy as np
n=0
while True:
    ok,im=cap.read()
    if not ok: break
    t=n*1000/fps; n+=1
    if t>=d["endMs"]: break
    canvas=np.zeros((1440,1280,3),np.uint8)
    for k,(name,R) in enumerate((("Pessoas (hoje)",P),("Seguindo a bola",B))):
        x,y,w,h=interpolate(R,0,100,t); fh,fw=im.shape[:2]
        crop=im[int(y*fh):int((y+h)*fh),int(x*fw):int((x+w)*fw)]
        canvas[k*720:(k+1)*720]=cv2.resize(crop,(1280,720),interpolation=cv2.INTER_AREA)
        cv2.putText(canvas,name,(16,k*720+44),0,1.2,(0,0,0),6); cv2.putText(canvas,name,(16,k*720+44),0,1.2,(255,255,255),2)
    enc.stdin.write(canvas.tobytes())
enc.stdin.close(); enc.wait(); print(out, os.path.getsize(out)//1e6,"MB")
