# -*- coding: utf-8 -*-
"""⑥ 적대검증 — D4 대비를 ⑤ 수치와 무관하게 직접 계산."""
import re, glob, os
BASE = r'C:\Projects\Active\교대근무관리 시스템\시안\2026-09-02-2차HTML'

def lum(h):
    h = h.lstrip('#')
    if len(h) == 3: h = ''.join(c*2 for c in h)
    c = [int(h[i:i+2], 16)/255 for i in (0, 2, 4)]
    c = [x/12.92 if x <= 0.03928 else ((x+0.055)/1.055)**2.4 for x in c]
    return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]

def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi+0.05)/(lo+0.05)

s = open(os.path.join(BASE, '00-shell-1.html'), encoding='utf-8').read()
tok = dict(re.findall(r'(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})\s*;', s))
print('== 셸 토큰 ==')
for k, v in tok.items(): print(f'   {k}: {v}')
bg = tok.get('--bg', '#F5F6F8'); card = tok.get('--card', '#FFFFFF')
print('\n== §K 대비 판정 (기준: 글자 4.5 / 비글자·포커스링 3.0) ==')
checks = [
    ('입력칸·버튼 테두리 --line-strong vs 카드', tok.get('--line-strong'), card, 3.0),
    ('입력칸·버튼 테두리 --line-strong vs 배경', tok.get('--line-strong'), bg, 3.0),
    ('장식선 --line vs 카드 (3:1 대상 아님)', tok.get('--line'), card, None),
    ('포커스 링 --accent vs 카드', tok.get('--accent'), card, 3.0),
    ('포커스 링 --accent vs 배경', tok.get('--accent'), bg, 3.0),
    ('본문 글자 --text vs 카드', tok.get('--text'), card, 4.5),
    ('보조 글자 --text-sub vs 카드', tok.get('--text-sub'), card, 4.5),
    ('보조 글자 --text-sub vs 배경', tok.get('--text-sub'), bg, 4.5),
]
for name, fg, b, need in checks:
    if not fg: print(f'   {name}: 토큰 없음'); continue
    r = ratio(fg, b)
    if need is None: print(f'   {name}: {r:.2f}:1  (판정 대상 아님)')
    else: print(f'   {name}: {r:.2f}:1  기준 {need}  → {"PASS" if r >= need else "**FAIL**"}')

print('\n== 로그인 파일 토큰 (셸과 다르다는 ⑤ 기록 확인) ==')
for fn in ['01-login-1.html', '01-login-2.html']:
    s2 = open(os.path.join(BASE, fn), encoding='utf-8').read()
    t2 = dict(re.findall(r'(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})\s*;', s2))
    diff = {k: (v, tok.get(k)) for k, v in t2.items() if tok.get(k) and tok[k].upper() != v.upper()}
    print(f'   {fn}: 토큰 {len(t2)}개 / 셸과 값이 다른 것 {len(diff)}개')
    for k, (a, b) in diff.items(): print(f'      {k}: 로그인 {a} vs 셸 {b}')
    bg2 = t2.get('--bg', bg); card2 = t2.get('--card', card)
    for nm, key, need in [('테두리', '--line-strong', 3.0), ('포커스 링', '--accent', 3.0)]:
        if t2.get(key):
            print(f'      {nm} {t2[key]} vs 카드 {card2}: {ratio(t2[key], card2):.2f}:1 → '
                  f'{"PASS" if ratio(t2[key], card2) >= need else "**FAIL**"}')

print('\n== 12px 배지 글자 4.5:1 (§K: 12px 배지는 3:1 아니라 4.5:1) ==')
pairs = set()
for f in sorted(glob.glob(os.path.join(BASE, '*.html'))):
    src = open(f, encoding='utf-8').read()
    for m in re.finditer(r'background:(#[0-9A-Fa-f]{6})[^"\']*?color:(#[0-9A-Fa-f]{6})', src):
        pairs.add((m.group(2), m.group(1)))
    for m in re.finditer(r'color:(#[0-9A-Fa-f]{6})[^"\']*?background:(#[0-9A-Fa-f]{6})', src):
        pairs.add((m.group(1), m.group(2)))
bad = [(f, b, ratio(f, b)) for f, b in sorted(pairs) if ratio(f, b) < 4.5]
print(f'   인라인 글자/배경 짝 {len(pairs)}개 중 4.5:1 미만 {len(bad)}개')
for f, b, r in sorted(bad, key=lambda x: x[2]):
    print(f'      글자 {f} / 배경 {b} = {r:.2f}:1')
