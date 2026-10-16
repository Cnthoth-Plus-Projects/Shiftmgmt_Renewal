# -*- coding: utf-8 -*-
"""⑥ 적대검증 A14b — 문서 구조를 세워 '진짜 새는 아이콘'만 남긴다.
버튼/링크에 aria-label(또는 aria-labelledby)이 있으면 그 이름이 내용을 덮으므로 안 읽힌다.
덮어 주는 조상이 없는 아이콘만 실제 누출이다."""
import os, glob, collections
from html.parser import HTMLParser

BASE = r'C:\Projects\Active\교대근무관리 시스템\시안\2026-09-02-2차HTML'
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}

class Node:
    __slots__ = ('tag','attrs','parent','children','text','line')
    def __init__(self, tag, attrs, parent, line):
        self.tag, self.attrs, self.parent, self.line = tag, dict(attrs), parent, line
        self.children, self.text = [], ''

class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('#root', [], None, 0)
        self.cur = self.root
    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.cur, self.getpos()[0])
        self.cur.children.append(n)
        if tag not in VOID:
            self.cur = n
    def handle_startendtag(self, tag, attrs):
        self.cur.children.append(Node(tag, attrs, self.cur, self.getpos()[0]))
    def handle_endtag(self, tag):
        n = self.cur
        while n is not self.root and n.tag != tag:
            n = n.parent
        if n is not self.root:
            self.cur = n.parent
    def handle_data(self, d):
        self.cur.text += d

NAMED_ROLES = {'button','link','tab','menuitem','option','checkbox','radio','switch'}

def is_named_container(n):
    """이 요소가 접근 가능한 이름을 스스로 갖는가 (= 내용이 안 읽힘)"""
    a = n.attrs
    if 'aria-label' in a and a['aria-label'].strip():
        return True, 'aria-label'
    if 'aria-labelledby' in a and a['aria-labelledby'].strip():
        return True, 'aria-labelledby'
    if 'title' in a and a['title'].strip() and (n.tag in ('button','a') or a.get('role') in NAMED_ROLES):
        return True, 'title'
    return False, None

def is_control(n):
    return n.tag in ('button','a','summary') or n.attrs.get('role') in NAMED_ROLES

real, covered = [], []
for f in sorted(glob.glob(os.path.join(BASE, '*.html'))):
    name = os.path.basename(f)
    t = Tree(); t.feed(open(f, encoding='utf-8').read())
    stack = [t.root]
    while stack:
        n = stack.pop()
        stack.extend(n.children)
        cls = n.attrs.get('class', '')
        if n.tag == 'span' and 'material-symbols' in cls and 'aria-hidden' not in n.attrs:
            word = n.text.strip()
            # 조상을 타고 올라가며 이름을 덮어 주는 컨트롤을 찾는다
            p, hit, via, ctrl = n.parent, False, None, None
            depth = 0
            while p is not None and depth < 8:
                if p.attrs.get('aria-hidden') == 'true':
                    hit, via, ctrl = True, 'aria-hidden 조상', p.tag; break
                if is_control(p):
                    ok, how = is_named_container(p)
                    ctrl = p.tag + (('[role=' + p.attrs['role'] + ']') if 'role' in p.attrs else '')
                    if ok:
                        hit, via = True, how
                    break
                p = p.parent; depth += 1
            (covered if hit else real).append((name, n.line, word, ctrl, via))

print('=' * 74)
print('A14b. 아이콘 글리프 실제 누출 (이름을 덮어 주는 조상이 없는 것만)')
print('=' * 74)
print(f'aria-hidden 없는 아이콘 145개 중 → 조상이 덮어 줌 {len(covered)}개 / **실제 누출 {len(real)}개**\n')
byfile = collections.Counter(x[0] for x in real)
byword = collections.Counter(x[2] for x in real)
print('## 파일별 실제 누출')
for k, v in sorted(byfile.items()):
    print(f'   {k}: {v}건')
print('\n## 새는 낱말')
for w, c in byword.most_common():
    print(f'   "{w}" x{c}')
print('\n## 전건 (파일:줄  낱말  담고 있는 요소)')
for name, line, word, ctrl, via in sorted(real):
    print(f'   {name}:{line}  "{word}"  담긴 곳={ctrl}')
print('\n## (참고) 덮어 준 것들의 방식')
print('   ', collections.Counter(x[4] for x in covered))
