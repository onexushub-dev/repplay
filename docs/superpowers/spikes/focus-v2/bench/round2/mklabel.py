import sys,os,json; sys.path.insert(0,"/root/lance/docs/superpowers/spikes/focus-v2/bench")
import cv2
from focusbench.clips import frames_on_grid
clip=sys.argv[1]; secs=30
out=f"/root/lance/docs/focus-refs/refs4k/label/{clip}"; os.makedirs(out,exist_ok=True)
props={}
for f in frames_on_grid(f"/root/lance/docs/focus-refs/refs4k/{clip}-2160.mp4",0,secs*1000,500,long_side=1920):
    cv2.imwrite(os.path.join(out,f"t_{f.tick}.jpg"),f.image,[cv2.IMWRITE_JPEG_QUALITY,88]); props[str(f.tick)]=None
json.dump({"clip":clip+".mp4","startMs":0,"endMs":secs*1000,"proposals":props,"labels":{}},open(os.path.join(out,"proposal.json"),"w"))
print(clip,len(props))
