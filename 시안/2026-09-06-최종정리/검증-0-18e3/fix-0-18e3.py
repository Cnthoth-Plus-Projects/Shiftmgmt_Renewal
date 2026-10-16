# -*- coding: utf-8 -*-
"""0-18i ④ 3차 재수정(Claude 대행, R-12 허용 16:12) — Codex ⑥ 2차 회신(2026-09-07 15:18 + 15:55) N1·N2·N3 처리(N4 = v2.10 문구만, HTML 불변).
규칙: 치환마다 기대 횟수를 박고, 하나라도 다르면 아무 파일도 쓰지 않는다. 기준본 = 스냅샷17차(선행 SHA 검사)."""
import re, sys, hashlib, io, os
ROOT = r"C:\Projects\Active\교대근무관리 시스템"
D1 = os.path.join(ROOT, r"시안\2026-08-31-1차HTML")
D2 = os.path.join(ROOT, r"시안\2026-09-02-2차HTML")
SNAP = os.path.join(ROOT, r"시안\2026-09-02-2차검토\스냅샷17차")

def sha(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()
def read(p):
    b = open(p, 'rb').read(); assert b'\r' not in b, p + ' CRLF'; return b.decode('utf-8')

bad = []
for sub, d in (('1차', D1), ('2차', D2)):
    for line in io.open(os.path.join(SNAP, sub, '_sha256.txt'), encoding='utf-8'):
        h, name = line.strip().split(' *')
        if sha(os.path.join(d, name)) != h: bad.append(name)
assert not bad, '스냅샷17차와 다름: %s' % bad
print('선행: 34파일 = 스냅샷17차 ✓')

log = []; out = {}
def rep(text, old, new, n, tag):
    cnt = text.count(old)
    if cnt != n: raise SystemExit('❌ %s: 기대 %d ≠ 실제 %d' % (tag, n, cnt))
    log.append('%s ×%d' % (tag, cnt)); return text.replace(old, new)

# ---------- N1 배지 링크 aria-label (28파일 65곳: 배지 64 + 접힘 점 배지 1) ----------
EXP_BADGE = {'03-home-1': 3, '05-sites-wizard-1': 2, '05-sites-wizard-2': 2, '05-sites-wizard-3': 2, '05-sites-wizard-4': 2,
             '08-performance-1': 3, '08-performance-2': 2, '08-performance-3': 2, '08-performance-4': 1,
             '00-shell-1': 3, '00-shell-2': 3, '04-sites-1': 1, '04-sites-2': 2, '06-employees-1': 3, '06-employees-2': 3, '06-employees-3': 3,
             '07-schedule-1': 1, '07-schedule-2': 2, '07-schedule-3': 4, '09-allowance-1': 2, '09-allowance-2': 2, '09-allowance-3': 3,
             '10-dashboard-1': 3, '11-operations-1': 2, '11-operations-2': 3, '11-operations-3': 3, '11-operations-4': 1, '12-access-logs-1': 2}
assert sum(EXP_BADGE.values()) == 65
BADGE_RE = re.compile(r'(<a [^>]*class="nav-item[^"]*"[^>]*?)(><span class="material-symbols-outlined" aria-hidden="true">fact_check</span><span>실적 관리</span><span class="nav-badge(?:-dot)?"[^>]*?title="승인 대기 실적 (\d+)건">)')
def badge_sub(m):
    assert 'aria-label' not in m.group(1), m.group(1)
    return m.group(1) + ' aria-label="실적 관리, 승인 대기 실적 ' + m.group(3) + '건"' + m.group(2)

# ---------- N2 skip-link 대상 = 각 상태 <main> (29파일 71상태) ----------
EXP_SKIP = {'03-home-1': 3, '03-home-2': 2, '05-sites-wizard-1': 2, '05-sites-wizard-2': 2, '05-sites-wizard-3': 3, '05-sites-wizard-4': 3,
            '08-performance-1': 3, '08-performance-2': 2, '08-performance-3': 2, '08-performance-4': 3,
            '00-shell-1': 3, '00-shell-2': 3, '04-sites-1': 1, '04-sites-2': 2, '06-employees-1': 3, '06-employees-2': 3, '06-employees-3': 3,
            '07-schedule-1': 1, '07-schedule-2': 2, '07-schedule-3': 4, '09-allowance-1': 2, '09-allowance-2': 2, '09-allowance-3': 3,
            '10-dashboard-1': 3, '11-operations-1': 2, '11-operations-2': 3, '11-operations-3': 3, '11-operations-4': 1, '12-access-logs-1': 2}
assert sum(EXP_SKIP.values()) == 71
SKIP_RE = re.compile(r'<a class="skip-link" href="#(main-state-[^"]+)">본문으로 바로가기</a>')
MAIN_RE = re.compile(r'<main class="page-content"')
FIRST = {'03-home-1', '03-home-2', '05-sites-wizard-1', '05-sites-wizard-2', '05-sites-wizard-3', '05-sites-wizard-4',
         '08-performance-1', '08-performance-2', '08-performance-3', '08-performance-4'}

def fix_skip(text, name):
    assert 'main-content-' not in text, name
    skips = list(SKIP_RE.finditer(text))
    assert len(skips) == EXP_SKIP[name], (name, len(skips))
    edits = []
    for i, s in enumerate(skips):
        sid = s.group(1); suffix = sid[len('main-state-'):]; nid = 'main-content-' + suffix
        limit = skips[i + 1].start() if i + 1 < len(skips) else len(text)
        body = text.find('<div class="app-body" id="%s"' % sid, s.end(), limit)
        assert body > 0, (name, sid, 'app-body 없음')
        m = MAIN_RE.search(text, body, limit)
        assert m, (name, sid, 'main 없음')
        assert not MAIN_RE.search(text, m.end(), limit), (name, sid, 'main 2개')
        edits.append((s.start(), s.end(), '<a class="skip-link" href="#%s">본문으로 바로가기</a>' % nid))
        edits.append((m.start(), m.end(), '<main class="page-content" id="%s" tabindex="-1"' % nid))
    for a, b, new in sorted(edits, reverse=True): text = text[:a] + new + text[b:]
    log.append('%s N2 skip-link→main id+tabindex ×%d' % (name, len(skips)))
    return text

for name in EXP_SKIP:
    p = os.path.join(D1 if name in FIRST else D2, name + '.html'); t = read(p)
    t, cnt = BADGE_RE.subn(badge_sub, t)
    if cnt != EXP_BADGE.get(name, 0): raise SystemExit('❌ %s N1 배지: 기대 %d ≠ 실제 %d' % (name, EXP_BADGE.get(name, 0), cnt))
    log.append('%s N1 aria-label ×%d' % (name, cnt))
    t = fix_skip(t, name)
    out[p] = t

# ---------- N1 P6 동적 배지: aria-label 동기 2줄 ----------
p = os.path.join(D1, '08-performance-3.html'); t = out[p]
t = rep(t, "if (sidebarBadge) { sidebarBadge.textContent = String(n); sidebarBadge.title = '승인 대기 실적 ' + n + '건'; }",
        "if (sidebarBadge) { sidebarBadge.textContent = String(n); sidebarBadge.title = '승인 대기 실적 ' + n + '건'; sidebarBadge.parentElement.setAttribute('aria-label', '실적 관리, 승인 대기 실적 ' + n + '건'); }",
        1, '08-performance-3 N1 setPending aria-label 동기')
t = rep(t, "if (sidebarBadge) { sidebarBadge.textContent = sampleBadge; sidebarBadge.title = '승인 대기 실적 ' + sampleBadge + '건'; }",
        "if (sidebarBadge) { sidebarBadge.textContent = sampleBadge; sidebarBadge.title = '승인 대기 실적 ' + sampleBadge + '건'; sidebarBadge.parentElement.setAttribute('aria-label', '실적 관리, 승인 대기 실적 ' + sampleBadge + '건'); }",
        1, '08-performance-3 N1 restoreFileModal aria-label 동기')
out[p] = t

# ---------- N3 wizard-3 W7 달력 = W2 값 ----------
p = os.path.join(D1, '05-sites-wizard-3.html'); t = out[p]
t = rep(t, '.c-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;font-size:9px}',
           '.c-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;font-size:12px}', 1, 'wizard-3 N3 .c-grid 9→12')
t = rep(t, '.c-head{font-weight:600;color:var(--text-sub);padding:1px 0;background:#F4F5F7}',
           '.c-head{font-weight:600;color:var(--text-sub);padding:2px 0;background:#F4F5F7}', 1, 'wizard-3 N3 .c-head padding 1→2')
t = rep(t, '.c-cell{padding:1px 0;border-radius:2px;display:flex;flex-direction:column;align-items:center;min-height:22px;background:#FFF;border:1px solid #ECEEF1;font-size:8px;color:#848A93}',
           '.c-cell{padding:2px 0;border-radius:2px;display:flex;flex-direction:column;align-items:center;min-height:26px;background:#FFF;border:1px solid #ECEEF1;font-size:12px;color:#848A93}', 1, 'wizard-3 N3 .c-cell 8→12(padding 2·min-height 26 = W2)')
t = rep(t, '.c-cell b{font-size:9px}', '.c-cell b{font-size:10px}', 1, 'wizard-3 N3 .c-cell b 9→10(#state-w7 한정 예외)')
out[p] = t

for p, t in out.items(): open(p, 'wb').write(t.encode('utf-8'))
print('\n'.join(log)); print('쓴 파일 %d' % len(out))
