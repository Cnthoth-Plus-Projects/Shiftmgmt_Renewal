# -*- coding: utf-8 -*-
"""기준본↔결과본 스냅샷 JSON 대조 — 파일·상태별: 보이는 글자 추가/삭제 · 넘침 · 표 행 높이 변화 · 카드 크기 변화 · 요소 수.
출력 = 마크다운 표(_compare.md). 허용 변경(헤더 재구성·토큰·글자 승격·사유·칩·이탈 모달)은 사람이 분류한다 — 이 스크립트는 사실만 나열."""
import json, sys, io, os, difflib
from collections import Counter
D = sys.argv[1] if len(sys.argv) > 1 else '.'
def load(p):
    m = {}
    for line in io.open(p, encoding='utf-8'):
        line = line.strip()
        if not line: continue
        j = json.loads(line); m[j['f']] = j
    return m
base = load(os.path.join(D, '_snap-base.jsonl')); now = load(os.path.join(D, '_snap-now.jsonl'))
rows = []; detail = []
for f in sorted(now):
    b = base.get(f); a = now[f]
    if not b:
        rows.append('| `%s` | 기준본 없음 | | | | |' % f); continue
    bw = {w['id']: w for w in b['w']}; aw = {w['id']: w for w in a['w']}
    added_states = [i for i in aw if i not in bw]; removed_states = [i for i in bw if i not in aw]
    for sid in aw:
        if sid not in bw:
            detail.append('- `%s` `#%s` **신규 상태**(기준본 없음) h=%d main=%s overflowers=%d' % (f, sid, aw[sid]['h'], aw[sid]['main'], aw[sid]['overflowers'])); continue
        x, y = bw[sid], aw[sid]
        cb, ca = Counter(x['text']), Counter(y['text'])
        add = list((ca - cb).elements()); rem = list((cb - ca).elements())
        tb, ta = x['tables'], y['tables']
        tdiff = []
        for i, (p, q) in enumerate(zip(tb, ta)):
            if p != q: tdiff.append('%s → %s' % (p[:60], q[:60]))
        if len(tb) != len(ta): tdiff.append('표 수 %d→%d' % (len(tb), len(ta)))
        cdiff = [ '%s→%s' % (p, q) for p, q in zip(x['cards'], y['cards']) if p != q ]
        if len(x['cards']) != len(y['cards']): cdiff.append('카드 수 %d→%d' % (len(x['cards']), len(y['cards'])))
        ov = '' if (x['main'], x['body'], x['overflowers']) == (y['main'], y['body'], y['overflowers']) else 'main %s→%s · body %s→%s · overflowers %d→%d' % (x['main'], y['main'], x['body'], y['body'], x['overflowers'], y['overflowers'])
        rows.append('| `%s` | `#%s` | h %d→%d · 요소 %d→%d | +%d / −%d | %s | %s |' % (f, sid, x['h'], y['h'], x['elems'], y['elems'], len(add), len(rem), ov or '동일', ('표 ' + str(len(tdiff)) + ' · 카드 ' + str(len(cdiff))) if (tdiff or cdiff) else '동일'))
        if add or rem or tdiff or cdiff or ov:
            detail.append('- `%s` `#%s`' % (f, sid))
            if add: detail.append('  - 추가 글자(%d): %s' % (len(add), ' | '.join(sorted(set(add))[:40])))
            if rem: detail.append('  - 삭제 글자(%d): %s' % (len(rem), ' | '.join(sorted(set(rem))[:40])))
            if ov: detail.append('  - 넘침: ' + ov)
            for t in tdiff: detail.append('  - 표: ' + t)
            for c in cdiff[:12]: detail.append('  - 카드: ' + c)
    for sid in removed_states: detail.append('- `%s` `#%s` **상태 소실**' % (f, sid))
    if a['bodyStray'] or b['bodyStray']: detail.append('- `%s` body 잡텍스트 %d→%d' % (f, b['bodyStray'], a['bodyStray']))
hdr = ['# 기준본 ↔ 결과본 구조 대조 (snapdiff.js · 1440×900)', '', '| 파일 | 상태 | 높이·요소 수 | 보이는 글자 +/− | 넘침 | 표·카드 |', '|---|---|---|---|---|---|']
io.open(os.path.join(D, '_compare.md'), 'w', encoding='utf-8').write('\n'.join(hdr + rows + ['', '## 상세', ''] + detail) + '\n')
print('states', len(rows), 'detail lines', len(detail))
