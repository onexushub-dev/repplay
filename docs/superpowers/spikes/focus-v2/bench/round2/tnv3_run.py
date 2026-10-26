"""TrackNetV3 (8 frames + median background, 288x512) on our clips; 8 frames at ~30 fps ending at each 100 ms tick,
the ball of the tick from the last heatmap (> 0.5, every blob kept with its peak)."""
import sys,os,json,time
sys.path.insert(0,"/root/ext/TrackNetV3")
import torch,cv2,numpy as np
from model import TrackNet
torch.set_num_threads(1)
SRC="/root/lance/docs/focus-refs/refs4k"; OUT=os.path.join(SRC,"tnv3"); os.makedirs(OUT,exist_ok=True)
CK={"badminton":"/root/extw/tnv3/ckpts/TrackNet_best.pt","beachvolley":"/root/extw/tracknet_best.pt"}
def rgb(im): return cv2.cvtColor(cv2.resize(im,(512,288),interpolation=cv2.INTER_AREA),cv2.COLOR_BGR2RGB).transpose(2,0,1).astype(np.float32)
def run(clip,weights,res="1080",secs=30):
    out=os.path.join(OUT,f"{clip}-{weights}.json")
    if os.path.exists(out): return
    ck=torch.load(CK[weights],map_location="cpu",weights_only=True)
    m=TrackNet(in_dim=27,out_dim=8); m.load_state_dict(ck["model"]); m.eval()
    path=os.path.join(SRC,f"{clip}-{res}.mp4"); cap=cv2.VideoCapture(path); fps=cap.get(cv2.CAP_PROP_FPS); n=int(min(secs*fps,cap.get(7)))
    samp=[]
    for k in range(0,n,max(1,n//60)):
        cap.set(cv2.CAP_PROP_POS_FRAMES,k); ok,im=cap.read()
        if ok: samp.append(rgb(im))
    med=np.median(np.array(samp),0)
    cap.set(cv2.CAP_PROP_POS_FRAMES,0); step=max(1,round(fps/30)); L=8; buf=[]; S=[]; t0=time.time()
    ticks=set(int(round(k*fps/10)) for k in range(secs*10))
    for i in range(n):
        ok,im=cap.read()
        if not ok: break
        buf.append(im); buf=buf[-((L-1)*step+1):]
        if i in ticks and len(buf)==(L-1)*step+1:
            x=np.concatenate([med]+[rgb(buf[j*step]) for j in range(L)])[None]/255.
            with torch.no_grad(): hm=m(torch.from_numpy(x.astype(np.float32)))[0,-1].numpy()
            cands=[]
            if hm.max()>0.5:
                nl,lab=cv2.connectedComponents((hm>0.5).astype(np.uint8))
                for b in range(1,nl):
                    ys,xs=np.where(lab==b); w=hm[ys,xs]
                    cands.append([float((xs*w).sum()/w.sum()/512),float((ys*w).sum()/w.sum()/288),float(w.max())])
            S.append({"t":int(round(i*1000/fps/100))*100,"balls":cands})
    json.dump({"clip":clip,"weights":weights,"samples":S,"elapsedS":round(time.time()-t0)},open(out,"w"))
    print(clip,weights,round(time.time()-t0),"s",flush=True)
if __name__=="__main__":
    for c in sys.argv[2:]: run(c,sys.argv[1])
