# -*- coding: utf-8 -*-
"""캡처 픽셀 대조 v2 — cap-base ↔ cap-now 같은 이름 PNG: 다른 픽셀 비율 + 40px 격자 단위 차이 블록을 결과본 위에 빨간 반투명으로 표시(cap-diff/).
높이가 다르면(상태 추가·행 높이 변화) 공통 높이까지만 비교하고 크기를 기록한다."""
import os, sys, io
import numpy as np
from PIL import Image, ImageDraw
D = sys.argv[1]
A, B, O = os.path.join(D, 'cap-base'), os.path.join(D, 'cap-now'), os.path.join(D, 'cap-diff')
os.makedirs(O, exist_ok=True)
G = 40
lines = ['| 파일 | 크기 기준→결과 | 공통 영역 차이율 % | 차이 블록(40px) | 차이 영역 bbox |', '|---|---|---|---|---|']
for n in sorted(f for f in os.listdir(B) if f.endswith('.png') and os.path.exists(os.path.join(A, f))):
    ia = np.asarray(Image.open(os.path.join(A, n)).convert('RGB')).astype(np.int16)
    ib_img = Image.open(os.path.join(B, n)).convert('RGB'); ib = np.asarray(ib_img).astype(np.int16)
    h = min(ia.shape[0], ib.shape[0]); w = min(ia.shape[1], ib.shape[1])
    d = np.abs(ia[:h, :w] - ib[:h, :w]).max(axis=2) > 24
    pct = d.mean() * 100
    ys, xs = np.nonzero(d)
    bbox = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())) if len(xs) else None
    ov = ib_img.copy().convert('RGBA'); dr = ImageDraw.Draw(ov, 'RGBA'); blocks = 0
    for y in range(0, h, G):
        for x in range(0, w, G):
            if d[y:y + G, x:x + G].any():
                blocks += 1; dr.rectangle([x, y, min(x + G, w) - 1, min(y + G, h) - 1], fill=(255, 0, 0, 70), outline=(255, 0, 0, 160))
    if ib.shape[0] != ia.shape[0]:
        dr.rectangle([0, h, w - 1, ib.shape[0] - 1], outline=(0, 0, 255, 200), width=3)
    ov.convert('RGB').save(os.path.join(O, n))
    lines.append('| `%s` | %dx%d→%dx%d | %.2f%% | %d | %s |' % (n, ia.shape[1], ia.shape[0], ib.shape[1], ib.shape[0], pct, blocks, bbox))
io.open(os.path.join(D, '_imgdiff.md'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
