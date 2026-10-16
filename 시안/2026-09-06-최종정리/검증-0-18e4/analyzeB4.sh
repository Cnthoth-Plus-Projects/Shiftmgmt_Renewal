#!/usr/bin/env bash
# phase B3 로그를 0-18e2(⑤ 2차) 로그와 대조 — 차이가 이번 변경(aria-label·skip 대상·W7 달력)뿐인지
O="시안/2026-09-06-최종정리/검증-0-18e4"; E="시안/2026-09-06-최종정리/검증-0-18e3"
strip() { sed -E 's/[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?//g; s/"t":"[^"]*"//g'; }
echo "### p6_scenario: 0-18e3 ↔ 4차 (시각 제거 diff)"; diff <(strip < "$E/_p6_scenario.log") <(strip < "$O/_p6_scenario.log") && echo "  동일(시각 외 차이 0)"
echo "### v2_interact: 0-18e3 ↔ 4차 (시각 제거 diff)"; diff <(strip < "$E/_v2_interact.log") <(strip < "$O/_v2_interact.log") | cut -c1-400 && echo "  동일(시각 외 차이 0)"
echo "### audit2 24파일: 0-18e3 ↔ 4차 — 차이 있는 파일"
PYTHONUTF8=1 python - "$E/_audit2.jsonl" "$O/_audit2.jsonl" <<'EOF'
import json, io, sys
def load(p):
    m = {}
    for l in io.open(p, encoding='utf-8'):
        l = l.strip()
        if l: j = json.loads(l); m[j['f']] = j
    return m
a, b = load(sys.argv[1]), load(sys.argv[2])
print('  파일 수', len(a), len(b))
for f in sorted(b):
    if f not in a: print('  +', f); continue
    if a[f] == b[f]: continue
    wa = {w['id']: w for w in a[f]['wrappers']}; wb = {w['id']: w for w in b[f]['wrappers']}
    for sid in wb:
        if sid not in wa: print('  ', f, sid, '신규'); continue
        for k in wb[sid]:
            if wa[sid].get(k) != wb[sid].get(k): print('  ', f, sid, k, ':', str(wa[sid].get(k))[:120], '→', str(wb[sid].get(k))[:120])
print('  (끝)')
EOF
echo "### iconleak 34 (파일: 총수/누출)"; cat "$O/_iconleak.log" | tr '\n' ' ' | cut -c1-1500; echo
echo "### 콘솔 오류 34 (1 = 없음)"; awk '{print $2}' "$O/_console.log" | sort | uniq -c; grep -v ": 1 *$" "$O/_console.log" | head
echo "### e2_scenario 재실행 요약"
PYTHONUTF8=1 python - "$O/_e2_scenario.log" <<'EOF'
import sys, re, json, io
lines = io.open(sys.argv[1], encoding='utf-8').read().split('\n')
q6 = [l for l in lines if re.match(r'^\S+ state-\S+ (전|접힘|복귀)=', l)]; bad = 0
for l in q6:
    f, sid, ph, js = re.match(r'^(\S+) (state-\S+) (전|접힘|복귀)=(.*)$', l).groups(); d = json.loads(js)
    exp = dict(전=(220, 1220, 'true', False, 0, 3, 0, 7), 접힘=(64, 1376, 'false', True, 3, 0, 3, 0), 복귀=(220, 1220, 'true', False, 0, 3, 0, 7))[ph]
    got = (d['w'], d['main'], d['exp'], d['col'], d['gh'], d['gVisText'], d['gDivider'], d['textVisible'])
    ok = got == exp and d['cur'] == 1 and len(d['names']) == 7 and (d['badge'] is None or (d['badge']['vis'] and d['badge']['title'].startswith('승인 대기 실적'))) and (d['titles'] == (7 if ph == '접힘' else 0))
    bad += (not ok)
print('  Q6 측정', len(q6), '불일치', bad)
for l in lines:
    if l.startswith(('배치:', '클릭 후:', 'Enter 후:', 'Space 후:', '{"text"', '{"stray"')): print('  ', l[:260])
n34 = [l for l in lines if re.match(r'^\S+: \{"dup"', l)]
badf = [l for l in n34 if not re.search(r'"dup":0,"broken":0,"syn":\[\],"stray":0', l)]
print('  34파일 dup/broken/syn/stray 전부 0:', len(n34) == 34 and not badf, '(줄', len(n34), ')')
EOF
