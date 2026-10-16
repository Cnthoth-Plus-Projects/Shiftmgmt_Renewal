# -*- coding: utf-8 -*-
"""⑥ 적대검증 A14 — 아이콘 글리프가 화면 낭독기에 영어로 새는가."""
import re, os, glob, collections
BASE = r'C:\Projects\Active\교대근무관리 시스템\시안\2026-09-02-2차HTML'
tot = leak = 0
rows = []
byword = collections.Counter()
for f in sorted(glob.glob(os.path.join(BASE, '*.html'))):
    name = os.path.basename(f)
    s = open(f, encoding='utf-8').read()
    spans = [(m.start(), m.group(0)) for m in
             re.finditer(r'<span[^>]*material-symbols[^>]*>([^<]*)</span>', s)]
    bad = []
    for pos, tag in spans:
        tot += 1
        if 'aria-hidden' not in tag:
            leak += 1
            line = s[:pos].count('\n') + 1
            word = re.search(r'>([^<]*)</span>', tag).group(1).strip()
            byword[word] += 1
            # 부모 요소가 이름을 갖고 있는지
            head = s[max(0, pos-260):pos]
            parent = re.findall(r'<(button|a|div|span|td|th)\b[^>]*>', head)
            ctx = head[-160:].replace('\n', ' ')
            bad.append((line, word, ctx))
    rows.append((name, len(spans), len(bad), bad))
print('=' * 72)
print('A14. 아이콘 글리프 낭독 누출 — material-symbols span 중 aria-hidden 없는 것')
print('=' * 72)
print(f'전체 {tot}개 중 누출 {leak}개 ({leak*100.0/tot:.1f}%)\n')
print('## 파일별')
for name, n, b, bad in rows:
    mark = '  ← 누출' if b else ''
    print(f'   {name}: {n}개 중 {b}개 누출{mark}')
print('\n## 새는 낱말')
for w, c in byword.most_common():
    print(f'   "{w}" x{c}')
print('\n## 위치와 문맥 (전건)')
for name, n, b, bad in rows:
    for line, word, ctx in bad:
        print(f'   {name}:{line}  "{word}"')
        print(f'        …{ctx}')
