# -*- coding: utf-8 -*-
"""0-18e ④ 2차 재수정(Claude 대행, R-11) — Codex ⑥ 1차 회신(09-07 12:58) Q1~Q6 + 자체 발견 회귀 2건.
규칙: 치환마다 기대 횟수를 박고, 하나라도 다르면 아무 파일도 쓰지 않는다. 기준본 = 스냅샷16차(선행 SHA 검사)."""
import re, sys, hashlib, io, os
ROOT = r"C:\Projects\Active\교대근무관리 시스템"
D1 = os.path.join(ROOT, r"시안\2026-08-31-1차HTML")
D2 = os.path.join(ROOT, r"시안\2026-09-02-2차HTML")
SNAP = os.path.join(ROOT, r"시안\2026-09-02-2차검토\스냅샷16차")

def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()

def read(p):
    b = open(p, 'rb').read()
    assert b'\r' not in b, p + ' CRLF'
    return b.decode('utf-8')

# 0. 선행: 34파일 = 스냅샷16차
bad = []
for sub, d in (('1차', D1), ('2차', D2)):
    for line in io.open(os.path.join(SNAP, sub, '_sha256.txt'), encoding='utf-8'):
        h, name = line.strip().split(' *')
        if sha(os.path.join(d, name)) != h:
            bad.append(name)
assert not bad, '스냅샷16차와 다름: %s' % bad
print('선행: 34파일 = 스냅샷16차 ✓')

log = []
out = {}

def rep(text, old, new, n, tag, regex=False, flags=0):
    if regex:
        cnt = len(re.findall(old, text, flags))
    else:
        cnt = text.count(old)
    if cnt != n:
        raise SystemExit('❌ %s: 기대 %d ≠ 실제 %d' % (tag, n, cnt))
    log.append('%s ×%d' % (tag, cnt))
    return re.sub(old, new, text, flags=flags) if regex else text.replace(old, new)

# ---------- Q6 공통(1차 10파일): 64px 접힘 CSS + 토글 JS + 배지 title ----------
CSS_ANCHOR = ".sidebar.collapsed .nav-group-header{height:1px;margin:8px 12px;padding:0;background:var(--line);font-size:0;overflow:hidden}"
CSS_ADD = CSS_ANCHOR + "\n" + "\n".join([
    "/* 0-18 소급(v1.9) B-7 64px 접힘 — 2차 00-shell-1과 같은 규칙, 메뉴 글자는 시각만 숨김(접근 가능한 이름 유지), 배지는 모서리 표시 */",
    ".sidebar{transition:width .15s ease}",
    ".sidebar.collapsed{width:64px}",
    ".sidebar.collapsed .nav-item{justify-content:center;padding:0;gap:0}",
    ".sidebar.collapsed .nav-item>span:not(.material-symbols-outlined):not(.nav-badge){position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}",
    ".sidebar.collapsed .nav-badge{position:absolute;top:3px;right:3px;margin:0;padding:1px 5px}",
    ".sidebar.collapsed+.main-wrapper{width:1376px}",
])
JS_OLD = (r"(?P<ind>[ \t]*)if \(isExpanded\) \{\s*toggleBtn\.setAttribute\('aria-expanded', 'false'\);\s*"
          r"sidebar\.style\.display = 'none';\s*sidebar\.setAttribute\('aria-hidden', 'true'\);\s*\} else \{\s*"
          r"toggleBtn\.setAttribute\('aria-expanded', 'true'\);\s*sidebar\.style\.display = 'flex';\s*"
          r"sidebar\.setAttribute\('aria-hidden', 'false'\);\s*\}")
def js_new(m):
    ind = m.group('ind')
    return (ind + "toggleBtn.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');\n"
            + ind + "sidebar.classList.toggle('collapsed', isExpanded); // v1.9 B-7: display:none → 64px 접힘\n"
            + ind + "sidebar.querySelectorAll('.nav-item').forEach(function(a) {\n"
            + ind + "  var t = a.querySelector('span:not(.material-symbols-outlined):not(.nav-badge)');\n"
            + ind + "  if (isExpanded && t) a.setAttribute('title', t.textContent.trim()); else a.removeAttribute('title');\n"
            + ind + "});")
BADGE_RE = r'<span class="nav-badge"( id="p6-sidebar-badge")?>(\d+)</span>'
def badge_new(m):
    return '<span class="nav-badge"%s title="승인 대기 실적 %s건">%s</span>' % (m.group(1) or '', m.group(2), m.group(2))
BADGE_N = {'03-home-1': 3, '03-home-2': 0, '05-sites-wizard-1': 2, '05-sites-wizard-2': 2, '05-sites-wizard-3': 2,
           '05-sites-wizard-4': 2, '08-performance-1': 3, '08-performance-2': 2, '08-performance-3': 2, '08-performance-4': 1}

for name in BADGE_N:
    p = os.path.join(D1, name + '.html')
    t = read(p)
    tag = name

    if name == '03-home-1':
        # Q1: </style> 밖 중복 CSS 블록(262~270) 제거
        lines = t.split('\n')
        assert lines[260] == '</style>' and lines[261] == '  ' and lines[262].startswith('/* 0-18 소급(v1.8)') \
            and lines[269] == '</style>' and lines[270] == '</head>', 'home-1 Q1 앵커 불일치: %r' % lines[260:271]
        del lines[261:270]
        t = '\n'.join(lines)
        assert t.count('</style>') == 1
        log.append('03-home-1 Q1 262~270 삭제(9줄) ✓ </style> 1')

    if name in ('05-sites-wizard-1', '05-sites-wizard-2'):
        # Q4: .c-cell 9px → 12px (예외 ③ .c-cell b 10px 유지)
        t = rep(t, ".c-cell{padding:2px 0;border-radius:2px;display:flex;flex-direction:column;align-items:center;min-height:26px;background:#FFF;border:1px solid #ECEEF1;font-size:9px;color:#848A93}",
                   ".c-cell{padding:2px 0;border-radius:2px;display:flex;flex-direction:column;align-items:center;min-height:26px;background:#FFF;border:1px solid #ECEEF1;font-size:12px;color:#848A93}", 1, tag + ' Q4 .c-cell 9→12')

    if name == '05-sites-wizard-2':
        # 자체 발견 회귀: 예외 ② .pattern-day-box는 「현행 유지」인데 12→11로 낮췄음 → 기준본 값 복원
        t = rep(t, ".pattern-day-box{font-size:11px;min-width:54px;height:42px;border:1px solid var(--line-strong);border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#FFF;font-size:11px}",
                   ".pattern-day-box{min-width:54px;height:42px;border:1px solid var(--line-strong);border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#FFF;font-size:12px}", 1, tag + ' 회귀복원 .pattern-day-box CSS 11→12')
        t = rep(t, r'(<div class="pattern-day-box (?:day|mid|night|off)"><span style=")font-size:11px;', r'\1font-size:12px;', 15, tag + ' 회귀복원 인라인 11→12', regex=True)
        t = rep(t, '<div class="pattern-day-box invalid" style="min-width:85px; padding:2px 4px;"><span style="font-size:11px;">3일차 ⚠</span><span style="font-size:11px;">',
                   '<div class="pattern-day-box invalid" style="min-width:85px; padding:2px 4px;"><span style="font-size:10px;">3일차 ⚠</span><span style="font-size:12px;">', 1, tag + ' 회귀복원 invalid 10/12')
        assert 'font-size:11px' not in t, 'wizard-2 11px 잔존'

    if name == '05-sites-wizard-3':
        t = rep(t, ".pattern-day-box{min-width:54px;height:40px;border:1px solid var(--line-strong);border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#FFF;font-size:11px}",
                   ".pattern-day-box{min-width:54px;height:40px;border:1px solid var(--line-strong);border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#FFF;font-size:10px}", 1, tag + ' 회귀복원 .pattern-day-box 11→10(기준본)')
        # Q5 W7 배경 팔레트 행 40 (wizard-1 .palette-table 규칙과 동일)
        t = rep(t, ".palette-table th,.palette-table td{border-bottom:1px solid var(--line);padding:4px 6px}",
                   ".palette-table th,.palette-table td{border-bottom:1px solid var(--line);padding:0 8px;height:40px;white-space:nowrap}", 1, tag + ' Q5 W7 팔레트 행 40')
        # Q6 압축 토글
        t = rep(t, "side.style.display=exp?'none':'flex';side.setAttribute('aria-hidden',exp?'true':'false');",
                   "side.classList.toggle('collapsed',exp);side.querySelectorAll('.nav-item').forEach(function(a){var t=a.querySelector('span:not(.material-symbols-outlined):not(.nav-badge)');if(exp&&t)a.setAttribute('title',t.textContent.trim());else a.removeAttribute('title');});", 1, tag + ' Q6 토글 JS(압축)')
    else:
        t = rep(t, JS_OLD, js_new, 1, tag + ' Q6 토글 JS', regex=True)

    if name == '08-performance-1':
        # Q5 P3 오류 표: 줄바꿈 대신 가로 스크롤(nowrap + overflow-x)
        t = rep(t, "    .simple-table td { border-bottom: 1px solid var(--line); padding: 0 10px; height: 40px; }\n",
                   "    .simple-table td { border-bottom: 1px solid var(--line); padding: 0 10px; height: 40px; }\n    .nowrap-table th, .nowrap-table td { white-space: nowrap; } /* v1.9 B-1: P3 오류 표 줄바꿈 대신 가로 스크롤 */\n", 1, tag + ' Q5 nowrap CSS')
        old = '<table class="simple-table"><thead><tr><th>순번</th><th>파일명</th><th>시간</th><th>사유</th></tr></thead><tbody><tr><td>1</td><td style="font-weight:600;">실적_보라매사업장_2025-05.xlsx</td><td>05-28 14:20</td><td style="color:#C0392B;">필수 시트 누락 (실적데이터)</td></tr></tbody></table>'
        new = '<div style="overflow-x:auto;">' + old.replace('<table class="simple-table">', '<table class="simple-table nowrap-table">') + '</div>'
        t = rep(t, old, new, 1, tag + ' Q5 P3 표 nowrap+scroll')

    if name == '08-performance-2':
        t = rep(t, '<td class="cell-diff">시간 변경<br><span style="font-size:12px; color:#A05200;">⚠ 야간 시간 초과</span></td>',
                   '<td class="cell-diff" style="line-height:1.3;">시간 변경<br><span style="font-size:12px; color:#A05200;">⚠ 야간 시간 초과</span></td>', 1, tag + ' Q5 P5 05-27 줄 높이')

    if name == '08-performance-3':
        t = rep(t, "if (sidebarBadge) sidebarBadge.textContent = String(n);",
                   "if (sidebarBadge) { sidebarBadge.textContent = String(n); sidebarBadge.title = '승인 대기 실적 ' + n + '건'; }", 1, tag + ' B-7 배지 title 동기(승인)')
        t = rep(t, "if (sidebarBadge) sidebarBadge.textContent = sampleBadge;",
                   "if (sidebarBadge) { sidebarBadge.textContent = sampleBadge; sidebarBadge.title = '승인 대기 실적 ' + sampleBadge + '건'; }", 1, tag + ' B-7 배지 title 동기(복원)')

    # 공통: CSS 추가 · 배지 title
    t = rep(t, CSS_ANCHOR, CSS_ADD, 1, tag + ' Q6 CSS 추가')
    if BADGE_N[name]:
        t = rep(t, BADGE_RE, badge_new, BADGE_N[name], tag + ' B-7 배지 title', regex=True)
    else:
        assert not re.search(BADGE_RE, t)
    out[p] = t

# ---------- 2차 06-employees-1 (Q2·Q3) ----------
p = os.path.join(D2, '06-employees-1.html'); t = read(p); tag = '06-employees-1'
t = rep(t, "#e2-wage-history th, #e2-wage-history td { padding: 8px 8px; white-space: nowrap; }",
           "#e2-wage-history th, #e2-wage-history td, #e2-wage-history-e9 th, #e2-wage-history-e9 td { padding: 8px 8px; white-space: nowrap; } /* v2.9 §C: clone id에도 적용 */", 1, tag + ' Q3 CSS clone id')
lines = t.split('\n')
BTN = '                <button type="button" class="btn-ghost btn-sm" aria-label="패널 닫기"><span class="material-symbols-outlined icon-18">close</span></button>'
assert lines[674] == BTN and lines[828] == BTN, 'employees-1 패널 닫기 줄 위치 불일치'
lines[828] = BTN.replace('<button type="button" class="btn-ghost btn-sm" aria-label="패널 닫기">', '<button type="button" id="btn-e9-panel-close" class="btn-ghost btn-sm" aria-label="패널 닫기">')
assert lines[674] == BTN
log.append(tag + ' Q2 :829 id=btn-e9-panel-close ×1(E2 원본 :675 불변)')
t = '\n'.join(lines)
old = ('                  <button type="button" id="btn-e9-wage" class="btn-secondary btn-sm" aria-disabled="true" aria-describedby="e9-lock-desc-2">시급 등록</button><span id="e9-lock-desc-2" style="font-size:12px;color:#C0392B;">시급 등록 권한이 필요합니다 (현재 권한: 승인 담당)</span>\n'
       '                </div>\n')
new = ('                  <button type="button" id="btn-e9-wage" class="btn-secondary btn-sm" aria-disabled="true" aria-describedby="e9-lock-desc-2">시급 등록</button>\n'
       '                </div>\n'
       '                <div id="e9-lock-desc-2" style="font-size:12px;color:#C0392B;">시급 등록 권한이 필요합니다 (현재 권한: 승인 담당)</div>\n')
t = rep(t, old, new, 1, tag + ' Q3 시급 등록 사유 별도 줄')
old = ('              <div style="margin-top:auto;display:flex;gap:8px;border-top:1px solid var(--line);padding-top:12px;">\n'
       '                <button type="button" id="btn-e9-unassign" class="btn-secondary btn-sm" style="flex:1;" aria-disabled="true" aria-describedby="e9-lock-desc-3">현재 배정 해지</button><span id="e9-lock-desc-3" style="font-size:12px;color:#C0392B;">배정 변경 권한이 필요합니다 (현재 권한: 승인 담당)</span>\n'
       '                <button type="button" id="btn-e9-delete" class="btn-danger-ghost btn-sm" style="flex:1;" aria-disabled="true" aria-describedby="e9-lock-desc-4">인력 삭제</button><span id="e9-lock-desc-4" style="font-size:12px;color:#C0392B;">인력 삭제 권한이 필요합니다 (현재 권한: 승인 담당)</span>\n'
       '              </div>\n')
new = ('              <div style="margin-top:auto;display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--line);padding-top:12px;">\n'
       '                <div style="display:flex;gap:8px;">\n'
       '                  <button type="button" id="btn-e9-unassign" class="btn-secondary btn-sm" style="flex:1;" aria-disabled="true" aria-describedby="e9-lock-desc-3">현재 배정 해지</button>\n'
       '                  <button type="button" id="btn-e9-delete" class="btn-danger-ghost btn-sm" style="flex:1;" aria-disabled="true" aria-describedby="e9-lock-desc-4">인력 삭제</button>\n'
       '                </div>\n'
       '                <div id="e9-lock-desc-3" style="font-size:12px;color:#C0392B;">배정 변경 권한이 필요합니다 (현재 권한: 승인 담당)</div>\n'
       '                <div id="e9-lock-desc-4" style="font-size:12px;color:#C0392B;">인력 삭제 권한이 필요합니다 (현재 권한: 승인 담당)</div>\n'
       '              </div>\n')
t = rep(t, old, new, 1, tag + ' Q3 하단 버튼 줄/사유 줄 분리')
old = "  var UNSAVED = {};\n"
new = ("  /* v2.9 §F M — E9 [패널 닫기]: clone 전용 id, E9 wrapper 안에서만 패널 숨김 + 선택 행 포커스(E1/E2 전이 없음) */\n"
       "  var e9Close = document.getElementById('btn-e9-panel-close');\n"
       "  if (e9Close) e9Close.addEventListener('click', function(){\n"
       "    var w = e9Close.closest('.state-wrapper'), panel = e9Close.closest('aside');\n"
       "    if (!w || !panel) return;\n"
       "    var row = w.querySelector('tbody tr.selected') || w.querySelector('tbody tr[tabindex]');\n"
       "    if (row) row.focus();\n"
       "    panel.style.display = 'none';\n"
       "  });\n"
       "  var UNSAVED = {};\n")
t = rep(t, old, new, 1, tag + ' Q2 닫기 핸들러')
out[p] = t

# ---------- 쓰기 ----------
for p, t in out.items():
    open(p, 'wb').write(t.encode('utf-8'))
print('\n'.join(log))
print('쓴 파일 %d' % len(out))
