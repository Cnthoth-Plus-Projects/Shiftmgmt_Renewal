# -*- coding: utf-8 -*-
"""_e3_scenario.log 판정 — N1(AX name) · N2(skip-link 71: Enter→main, Tab→본문 첫 요소·nav 밖) · N3(W7 닫기 3경로 뒤 12px 미만 0)"""
import io, re, json, sys
L = io.open(sys.argv[1], encoding='utf-8').read().split('\n')
# N1
ax_bad = []; ax_total = 0
for l in L:
    m = re.match(r'^(\S+) AX=(.*)$', l)
    if not m: continue
    for part in m.group(2).split(';'):
        part = part.strip()
        if not part: continue
        c, name = re.match(r'^(\d+) link "(.*)"$', part).groups(); c = int(c); ax_total += c
        if not re.match(r'^실적 관리, 승인 대기 실적 \d+건$', name) and name != '실적 관리': ax_bad.append((m.group(1), part))
        if name == '실적 관리' and m.group(1) not in ('03-home-2', '05-sites-wizard-4', '08-performance-4'): ax_bad.append((m.group(1), part, '배지 있는 파일에 건수 없는 이름'))
print('N1 AX link 총', ax_total, '· 규격 밖', len(ax_bad), ax_bad[:5])
# N2
ok = 0; bad = []; modal = []; n = 0
for l in L:
    m = re.match(r'^(\S+) (main-content-\S+) 전=(\{.*?\}) Enter=(\{.*?\}) Tab=(\{.*?\})$', l.strip())
    if not m: continue
    n += 1
    f, sid, pre, en, tb = m.groups(); pre = json.loads(pre); en = json.loads(en); tb = json.loads(tb)
    if pre['bodyHidden'] == 'true':
        modal.append((f, sid, en['el'], tb['inMain'], tb['inNav'], tb['text'])); continue
    if pre['focused'] and en['el'] == 'MAIN#' + sid and tb['inMain'] == sid and not tb['inNav']: ok += 1
    else: bad.append((f, sid, pre, en, tb))
print('N2 측정', n, '· 노출 상태 PASS', ok, '· FAIL', len(bad), '· 모달 배경(app-body aria-hidden) 상태', len(modal))
for b in bad[:12]: print('  FAIL', b)
for m_ in modal: print('  모달배경', m_)
# N3
for l in L:
    if re.match(r'^(열린 상태\(초기\)|Esc 뒤|\[계속 편집\] 뒤|\[변경 버리고 나가기\] 뒤): ', l):
        k, js = l.split(': ', 1); d = json.loads(js)
        print('N3', k, '| dialog', d['dialog'], '| app-body aria-hidden', d['bodyHidden'], '| 12px 미만', d['small'], d['sample'][:4], '| b 예외(10px)', d['bEx'], '| b 위반', d['bBad'], '| cell', d['cell'], '| head', d['head'], '| gridH', d['gridH'], '| panel', d['panel'], '| main', d['main'], '| overflowers', d['overflowers'], '| toast', d['toast'])
for l in L:
    if l.startswith('{"cell"'): print('W2 대조', l[:300])
