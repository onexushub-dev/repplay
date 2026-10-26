"""WASB (HRNet, 3 frames in → 3 heatmaps) on our clips. Frames: t-2Δ, t-Δ, t with Δ = 1/30 s (the training
datasets' rate); the ball of tick t is read from the last heatmap. Optional tiles (same tile on the 3 frames)."""
import sys,os,json,time,math
sys.path.insert(0,"/root/ext/WASB-SBDT/src")
import yaml,torch,cv2,numpy as np
from models.hrnet import HRNet
torch.set_num_threads(1)
SRC="/root/lance/docs/focus-refs/refs4k"; OUT=os.path.join(SRC,"wasb"); os.makedirs(OUT,exist_ok=True)
SPORT={"tabletennis-02":"badminton","tabletennis-01":"badminton","beachtennis-01":"tennis","tennis-02":"tennis",
       "basket-05":"basketball","volley-01":"volleyball"}
MEAN=np.array([0.485,0.456,0.406],np.float32); STD=np.array([0.229,0.224,0.225],np.float32)
class A(dict):
    def __getattr__(self,k): return self[k]
def wrap(o): return A({k:wrap(v) for k,v in o.items()}) if isinstance(o,dict) else ([wrap(v) for v in o] if isinstance(o,list) else o)
def build(sport):
    cfg=wrap(yaml.safe_load(open("/root/ext/WASB-SBDT/src/configs/model/wasb.yaml")))
    m=HRNet(cfg); sd=torch.load(f"/root/extw/wasb_{sport}_best.pth.tar",map_location="cpu",weights_only=True)["model_state_dict"]
    sd={k.replace("module.",""):v for k,v in sd.items()}; m.load_state_dict(sd); m.eval(); return m
def prep(img):  # BGR crop → 512x288 RGB normalised (aspect kept: scale by the long side, centred, like get_transform)
    h,w=img.shape[:2]; s=512/max(w,h*512/288)
    # get_transform uses scale = max(h, w) and output 512x288: for 16:9 inputs this is a plain resize
    r=cv2.resize(img,(512,288),interpolation=cv2.INTER_AREA)
    x=(cv2.cvtColor(r,cv2.COLOR_BGR2RGB).astype(np.float32)/255-MEAN)/STD
    return x.transpose(2,0,1)
def blobs(hm,th=0.5):
    out=[]
    if hm.max()<=th: return out
    n,lab=cv2.connectedComponents((hm>th).astype(np.uint8))
    for i in range(1,n):
        ys,xs=np.where(lab==i); wts=hm[ys,xs]
        out.append(((xs*wts).sum()/wts.sum(),(ys*wts).sum()/wts.sum(),float(wts.max())))
    return out
def tiles(n):
    if n==1: return [(0,0,1,1)]
    size=1/(n-(n-1)*0.15); st=[i*size*0.85 for i in range(n-1)]+[1-size]
    return [(x,y,size,size) for y in st for x in st]
def run(clip,grid,res="2160",secs=30):
    out=os.path.join(OUT,f"{clip}-{res}-g{grid}.json")
    if os.path.exists(out): return
    m=build(SPORT[clip]); cap=cv2.VideoCapture(os.path.join(SRC,f"{clip}-{res}.mp4")); fps=cap.get(cv2.CAP_PROP_FPS)
    step=max(1,round(fps/30)); buf=[]; i=0; S=[]; t0=time.time()
    ticks=set(int(round(k*fps/10)) for k in range(secs*10))  # frame index of each 100 ms tick
    while True:
        ok,im=cap.read()
        if not ok or i>=secs*fps: break
        buf.append(im); buf=buf[-(2*step+1):]
        if i in ticks and len(buf)==2*step+1:
            fr=[buf[0],buf[step],buf[2*step]]; H,W=im.shape[:2]; cands=[]
            for (tx,ty,tw,th) in tiles(grid):
                x0,y0,x1,y1=int(tx*W),int(ty*H),int((tx+tw)*W),int((ty+th)*H)
                x=np.concatenate([prep(f[y0:y1,x0:x1]) for f in fr])[None]
                with torch.no_grad(): hm=torch.sigmoid(m(torch.from_numpy(x))[0])[0,2].numpy()
                for bx,by,sc in blobs(hm):
                    cands.append([(x0+bx/512*(x1-x0))/W,(y0+by/288*(y1-y0))/H,sc])
            S.append({"t":int(round(i*1000/fps/100))*100,"balls":cands})
        i+=1
    json.dump({"clip":clip,"grid":grid,"res":res,"samples":S,"elapsedS":round(time.time()-t0)},open(out,"w"))
    print(clip,res,"g",grid,round(time.time()-t0),"s",flush=True)
if __name__=="__main__":
    for c in sys.argv[2:]: run(c,int(sys.argv[1]))
