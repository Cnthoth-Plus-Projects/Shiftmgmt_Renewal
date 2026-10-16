# 캡처 픽셀 대조 — A 폴더 vs B 폴더 같은 이름 PNG: 크기·다른 픽셀 비율·차이 영역 bbox
import sys, os
from PIL import Image, ImageChops
a, b = sys.argv[1], sys.argv[2]
names = sorted(f for f in os.listdir(b) if f.endswith('.png') and os.path.exists(os.path.join(a, f)))
for n in names:
    ia = Image.open(os.path.join(a, n)).convert('RGB'); ib = Image.open(os.path.join(b, n)).convert('RGB')
    if ia.size != ib.size:
        print(f"{n}: size {ia.size} -> {ib.size}"); continue
    d = ImageChops.difference(ia, ib).convert('L').point(lambda v: 255 if v > 24 else 0)
    bbox = d.getbbox(); cnt = sum(1 for v in d.getdata() if v)
    tot = ia.size[0]*ia.size[1]
    print(f"{n}: {ia.size} diff {cnt/tot*100:.2f}% bbox={bbox}")
