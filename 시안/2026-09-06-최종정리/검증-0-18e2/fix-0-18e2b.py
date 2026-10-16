# -*- coding: utf-8 -*-
"""0-18e ④ 2차 재수정 (b) — ⑤ 2차 구조 대조(snapdiff)에서 드러난 추가 결함 4건(Codex ⑥ 1차 미검출):
 S1 skip-link가 평소에도 상태 라벨 바 위에 노출(.app-window overflow:visible + top:-48px) → 29파일: 평소 clip 숨김, 포커스 시 표시
 S2 P5 비교 표 담는 상자 overflow:hidden → 오른쪽 22px 잘림 → overflow-x:auto(정본 B-1 「가로 스크롤」)
 S3 P6/P8/P10 도구 막대 T-4/T-6 토큰 통일로 버튼 +63px → 검색 입력 고유 폭(164)을 120으로 → 넘침 0
 S4 P3 nowrap 표가 2열 카드 폭을 588/578로 벌림 → 카드 min-width:0 + 셀 패딩 0 8px
규칙: 치환 기대 횟수 불일치면 아무 파일도 쓰지 않는다."""
import re, os, hashlib
ROOT = r"C:\Projects\Active\교대근무관리 시스템"
D1 = os.path.join(ROOT, r"시안\2026-08-31-1차HTML"); D2 = os.path.join(ROOT, r"시안\2026-09-02-2차HTML")
log = []; out = {}
def read(p):
    b = open(p, 'rb').read(); assert b'\r' not in b; return b.decode('utf-8')
def rep(text, old, new, n, tag):
    cnt = text.count(old)
    if cnt != n: raise SystemExit('❌ %s: 기대 %d ≠ 실제 %d' % (tag, n, cnt))
    log.append('%s ×%d' % (tag, cnt)); return text.replace(old, new)

SK_OLD = ".skip-link{position:absolute;left:8px;top:-48px;z-index:1300;background:var(--accent);color:#FFF;padding:8px 12px;border-radius:6px;font-size:13px;text-decoration:none}"
SK_NEW = ".skip-link{position:absolute;left:8px;top:8px;z-index:1300;background:var(--accent);color:#FFF;padding:8px 12px;border-radius:6px;font-size:13px;text-decoration:none;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}"
SKF_OLD = ".skip-link:focus{top:8px;outline:2px solid #FFF}"
SKF_NEW = ".skip-link:focus{width:auto;height:auto;overflow:visible;clip:auto;outline:2px solid #FFF}"

files = [os.path.join(D1, f) for f in sorted(os.listdir(D1)) if f.endswith('.html')] + [os.path.join(D2, f) for f in sorted(os.listdir(D2)) if f.endswith('.html')]
assert len(files) == 34
for p in files:
    name = os.path.basename(p)[:-5]; t = read(p); links = t.count('class="skip-link"')
    if links == 0:
        assert SK_OLD not in t; log.append(name + ' skip-link 없음(헤더 없는 파일) — 불변'); continue
    t = rep(t, SK_OLD, SK_NEW, 1, name + ' S1 skip-link 평소 숨김')
    t = rep(t, SKF_OLD, SKF_NEW, 1, name + ' S1 skip-link:focus 표시')
    if name == '08-performance-2':
        t = rep(t, '            <div style="border: 1px solid var(--line); border-radius: 6px; overflow: hidden; background: #FFFFFF;">\n              <table class="compare-table">',
                   '            <div style="border: 1px solid var(--line); border-radius: 6px; overflow-x: auto; overflow-y: hidden; background: #FFFFFF;">\n              <table class="compare-table">', 1, name + ' S2 P5 가로 스크롤')
    if name in ('08-performance-3', '08-performance-4'):
        n = 1 if name == '08-performance-3' else 2
        t = rep(t, '<input type="text" class="filter-input" aria-label="검색" placeholder="사번, 이름, 근무일, 경고 내용" style="flex: 1; min-width: 120px;">',
                   '<input type="text" class="filter-input" aria-label="검색" placeholder="사번, 이름, 근무일, 경고 내용" style="flex: 1; min-width: 120px; width: 120px;">', n, name + ' S3 검색 입력 고유 폭 120')
    if name == '08-performance-1':
        t = rep(t, "    .card-grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }\n",
                   "    .card-grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }\n    .card-grid-2col > .card { min-width: 0; } /* v1.9 B-1: nowrap 표가 열 폭을 벌리지 않도록 */\n", 1, name + ' S4 카드 min-width 0')
        t = rep(t, "    .nowrap-table th, .nowrap-table td { white-space: nowrap; } /* v1.9 B-1: P3 오류 표 줄바꿈 대신 가로 스크롤 */\n",
                   "    .nowrap-table th, .nowrap-table td { white-space: nowrap; padding: 0 8px; } /* v1.9 B-1: P3 오류 표 줄바꿈 대신 가로 스크롤 · 패딩 8 */\n", 1, name + ' S4 nowrap 셀 패딩 8')
    out[p] = t
for p, t in out.items(): open(p, 'wb').write(t.encode('utf-8'))
print('\n'.join(log)); print('쓴 파일 %d' % len(out))
