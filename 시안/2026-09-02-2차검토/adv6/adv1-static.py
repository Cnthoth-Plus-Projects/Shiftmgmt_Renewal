# -*- coding: utf-8 -*-
"""⑥ 적대검증(Claude 대행) — 정적 전수 검사.
CLAUDE.md 화면 규칙을 렌즈로 쓴다. ⑤의 기존 스크립트와 겹치지 않는 각도만."""
import re, os, glob, json, sys, collections

BASE = r'C:\Projects\Active\교대근무관리 시스템\시안\2026-09-02-2차HTML'
files = sorted(glob.glob(os.path.join(BASE, '*.html')))
out = collections.OrderedDict()

def strip_non_visible(s):
    s = re.sub(r'<script.*?</script>', '', s, flags=re.S)
    s = re.sub(r'<style.*?</style>', '', s, flags=re.S)
    return s

findings = collections.defaultdict(list)

for f in files:
    name = os.path.basename(f)
    src = open(f, encoding='utf-8').read()
    vis = strip_non_visible(src)

    # A1. window.confirm / alert / prompt 금지 (CLAUDE.md: 공용 질문 모달 사용)
    for m in re.finditer(r'\b(?:window\.)?(confirm|alert|prompt)\s*\(', src):
        line = src[:m.start()].count('\n') + 1
        findings['A1_confirm_alert'].append(f'{name}:{line} {m.group(0)}')

    # A2. 중복 id
    ids = re.findall(r'\sid="([^"]+)"', src)
    for i, c in collections.Counter(ids).items():
        if c > 1:
            findings['A2_dup_id'].append(f'{name} id="{i}" x{c}')

    # A3. aria-labelledby / aria-describedby / for 가 없는 id를 가리킴
    idset = set(ids)
    for attr in ('aria-labelledby', 'aria-describedby', 'for', 'aria-controls'):
        for m in re.finditer(r'\s%s="([^"]+)"' % attr, src):
            for tok in m.group(1).split():
                if tok not in idset:
                    line = src[:m.start()].count('\n') + 1
                    findings['A3_dangling_ref'].append(f'{name}:{line} {attr}="{tok}" (대상 없음)')

    # A4. 인라인 <svg> (아이콘은 Material Symbols 한 세트여야 함)
    n = len(re.findall(r'<svg\b', src))
    if n:
        findings['A4_inline_svg'].append(f'{name} <svg> {n}개')

    # A5. role=tab 인데 tablist 조상/aria-selected 없음
    tabs = re.findall(r'role="tab"', src)
    tablist = re.findall(r'role="tablist"', src)
    tabpanel = re.findall(r'role="tabpanel"', src)
    sel = re.findall(r'aria-selected="', src)
    if tabs:
        out.setdefault('tabs', {})[name] = dict(tab=len(tabs), tablist=len(tablist),
                                                tabpanel=len(tabpanel), aria_selected=len(sel))
        if len(tablist) == 0:
            findings['A5_tab_no_tablist'].append(f'{name} role=tab {len(tabs)}개인데 role=tablist 0')
        if len(tabpanel) == 0:
            findings['A5_tab_no_panel'].append(f'{name} role=tab {len(tabs)}개인데 role=tabpanel 0')
        if len(sel) == 0:
            findings['A5_tab_no_selected'].append(f'{name} role=tab {len(tabs)}개인데 aria-selected 0')

    # A6. disabled 요소에 사유가 붙어 있는가 (title / aria-describedby / 인접 사유)
    for m in re.finditer(r'<(button|input|select|textarea)\b([^>]*\bdisabled\b[^>]*)>', src):
        seg = m.group(2)
        has_reason = ('title=' in seg) or ('aria-describedby=' in seg) or ('aria-label=' in seg)
        if not has_reason:
            line = src[:m.start()].count('\n') + 1
            findings['A6_disabled_no_reason'].append(f'{name}:{line} <{m.group(1)} disabled> 사유 속성 없음')

    # A7. 남색 배경 금지 — CSS 색상 중 남색대(파랑 우세 + 어두움)
    for m in re.finditer(r'background(?:-color)?\s*:\s*#([0-9a-fA-F]{6})', src):
        h = m.group(1)
        r_, g_, b_ = int(h[0:2],16), int(h[2:4],16), int(h[4:6],16)
        if b_ > 90 and b_ - max(r_, g_) > 35 and (r_+g_+b_)/3 < 110:
            line = src[:m.start()].count('\n') + 1
            findings['A7_navy_bg'].append(f'{name}:{line} #{h} rgb({r_},{g_},{b_})')

    # A8. 보이는 글 안의 영문 낱말 (기술 용어·역할명 노출 금지)
    txt = re.sub(r'<[^>]+>', ' ', vis)
    txt = re.sub(r'&[a-z]+;', ' ', txt)
    for m in re.finditer(r'\b[A-Za-z][A-Za-z\-_]{2,}\b', txt):
        w = m.group(0)
        findings['A8_english_text'].append(f'{name} {w}')

    # A9. 파일 크기
    out.setdefault('size', {})[name] = os.path.getsize(f)

    # A10. tabindex 양수 (포커스 순서를 깨뜨림)
    for m in re.finditer(r'tabindex="([0-9]+)"', src):
        if int(m.group(1)) > 0:
            line = src[:m.start()].count('\n') + 1
            findings['A10_positive_tabindex'].append(f'{name}:{line} tabindex={m.group(1)}')

    # A11. HTML 주석 (지시서: 주석 금지)
    for m in re.finditer(r'<!--(?!\[if).*?-->', src, flags=re.S):
        line = src[:m.start()].count('\n') + 1
        findings['A11_html_comment'].append(f'{name}:{line} {m.group(0)[:60]!r}')

    # A12. 이미지 alt 누락
    for m in re.finditer(r'<img\b([^>]*)>', src):
        if 'alt=' not in m.group(1):
            line = src[:m.start()].count('\n') + 1
            findings['A12_img_no_alt'].append(f'{name}:{line}')

    # A13. lang 속성
    if not re.search(r'<html[^>]*\slang="ko"', src):
        findings['A13_no_lang_ko'].append(name)

print('=' * 70)
print('⑥ 적대검증(Claude 대행) — 정적 전수 A1~A13')
print('=' * 70)
for k in sorted(findings):
    v = findings[k]
    if k == 'A8_english_text':
        c = collections.Counter(x.split(' ', 1)[1] for x in v)
        print(f'\n## {k}: 낱말 {len(c)}종 / 출현 {len(v)}회')
        for w, n in c.most_common():
            print(f'   {w} x{n}')
    else:
        print(f'\n## {k}: {len(v)}건')
        for x in v[:40]:
            print('   ' + x)
        if len(v) > 40:
            print(f'   ... 외 {len(v)-40}건')
print('\n## 파일 크기 (바이트)')
for n, s in out.get('size', {}).items():
    print(f'   {n} {s:,}')
print('\n## role=tab 구조')
for n, d in out.get('tabs', {}).items():
    print(f'   {n} {d}')
