# -*- coding: utf-8 -*-
"""0-18i ④ 4차 재수정(Claude 대행) — Codex ⑥ 3차 회신(2026-09-07 17:12) 잔여 1: 2차 셸 데모 S1~S6 `<main>`의 `aria-hidden="true"` 제거(포커스 대상이 된 요소의 숨김 충돌).
규칙: 치환마다 기대 횟수, 불일치면 아무 파일도 안 씀. 기준본 = 스냅샷18차(선행 SHA 검사). 잔여 2(검사기 상태 조건)는 audit1d.js — HTML 변경 없음."""
import hashlib, io, os
ROOT = r"C:\Projects\Active\교대근무관리 시스템"
D1 = os.path.join(ROOT, r"시안\2026-08-31-1차HTML")
D2 = os.path.join(ROOT, r"시안\2026-09-02-2차HTML")
SNAP = os.path.join(ROOT, r"시안\2026-09-02-2차검토\스냅샷18차")
def sha(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()
def read(p):
    b = open(p, 'rb').read(); assert b'\r' not in b, p + ' CRLF'; return b.decode('utf-8')
bad = []
for sub, d in (('1차', D1), ('2차', D2)):
    for line in io.open(os.path.join(SNAP, sub, '_sha256.txt'), encoding='utf-8'):
        h, name = line.strip().split(' *')
        if sha(os.path.join(d, name)) != h: bad.append(name)
assert not bad, '스냅샷18차와 다름: %s' % bad
print('선행: 34파일 = 스냅샷18차 ✓')
log = []; out = {}
def rep(text, old, new, n, tag):
    cnt = text.count(old)
    if cnt != n: raise SystemExit('❌ %s: 기대 %d ≠ 실제 %d' % (tag, n, cnt))
    log.append('%s ×%d' % (tag, cnt)); return text.replace(old, new)
for name, ids in (('00-shell-1', ('s1', 's2', 's3')), ('00-shell-2', ('s4', 's5', 's6'))):
    p = os.path.join(D2, name + '.html'); t = read(p)
    for sid in ids:
        t = rep(t, '<main class="page-content" id="main-content-%s" tabindex="-1" aria-hidden="true">' % sid,
                   '<main class="page-content" id="main-content-%s" tabindex="-1">' % sid, 1, '%s %s main aria-hidden 제거' % (name, sid))
    assert 'aria-hidden="true">' not in t.replace('aria-hidden="true"></span>', '') or True
    out[p] = t
# 다른 32파일 불변 · 34파일에 <main … aria-hidden> 잔여 0 확인
for d in (D1, D2):
    for f in sorted(os.listdir(d)):
        if not f.endswith('.html'): continue
        t = out.get(os.path.join(d, f)) or read(os.path.join(d, f))
        import re
        assert not re.search(r'<main[^>]*aria-hidden="true"', t), f
for p, t in out.items(): open(p, 'wb').write(t.encode('utf-8'))
print('\n'.join(log)); print('쓴 파일 %d · 34파일 <main aria-hidden> 잔여 0 ✓' % len(out))
