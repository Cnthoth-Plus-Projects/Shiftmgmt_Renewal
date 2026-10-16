# -*- coding: utf-8 -*-
"""검수-안내-34파일.md → 검수-안내-34파일.html (자체 CSS · 시안 파일·캡처 링크). 외부 자원 없음, 크롬에서 파일로 바로 열림."""
import io, os, re, html
D = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(D, '검수-안내-34파일.md'); OUT = os.path.join(D, '검수-안내-34파일.html')
FIRST = ('03-home', '05-sites-wizard', '08-performance')
def folder(name): return '../../2026-08-31-1차HTML/' if name.startswith(FIRST) else '../../2026-09-02-2차HTML/'

def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t)
    # 파일 이름 → 링크 (03-home-1 · 06-employees-2/3 · 00-shell-1.html 형태)
    def link(m):
        base, n1, extra, ext = m.group(1), m.group(2), m.group(3) or '', m.group(4) or ''
        nums = [n1] + [x for x in extra.split('/') if x]
        parts = []
        for k in nums:
            name = '%s-%s' % (base, k)
            parts.append('<a class="f" href="%s%s.html" title="시안 파일 열기">%s</a><a class="cap" href="캡처-34/%s.png" title="전체 캡처">📷</a>' % (folder(name), name, name + (ext if k == n1 else ''), name))
        return ' / '.join(parts) if len(nums) > 1 else parts[0]
    t = re.sub(r'(?<![\w/.-])(\d{2}-[a-z]+(?:-[a-z]+)*)-(\d+)((?:/\d+)+)?(\.html)?(?![\w-])', link, t)
    t = t.replace('<code>캡처-34/</code>', '<a class="f" href="캡처-34/"><code>캡처-34/</code></a>')
    return t

lines = io.open(SRC, encoding='utf-8').read().split('\n')
out = []; i = 0; title = ''
while i < len(lines):
    l = lines[i]
    if l.startswith('# '):
        title = l[2:].strip(); out.append('<h1>%s</h1>' % inline(title)); i += 1; continue
    if l.startswith('## '): out.append('<h2>%s</h2>' % inline(l[3:])); i += 1; continue
    if l.startswith('### '): out.append('<h3>%s</h3>' % inline(l[4:])); i += 1; continue
    if l.strip() == '---': out.append('<hr>'); i += 1; continue
    if l.startswith('|'):
        rows = []
        while i < len(lines) and lines[i].startswith('|'):
            rows.append([c.strip() for c in lines[i].strip().strip('|').split(' | ')]); i += 1
        hdr = rows[0]; body = [r for r in rows[1:] if not re.match(r'^[-:| ]+$', '|'.join(r))]
        out.append('<table><thead><tr>' + ''.join('<th>%s</th>' % inline(c) for c in hdr) + '</tr></thead><tbody>')
        for r in body: out.append('<tr>' + ''.join('<td>%s</td>' % inline(c) for c in r) + '</tr>')
        out.append('</tbody></table>'); continue
    if l.startswith('- '):
        out.append('<ul>')
        while i < len(lines) and lines[i].startswith('- '):
            out.append('<li>%s</li>' % inline(lines[i][2:])); i += 1
        out.append('</ul>'); continue
    if re.match(r'^\d+\. ', l):
        out.append('<ol>')
        while i < len(lines) and re.match(r'^\d+\. ', lines[i]):
            out.append('<li>%s</li>' % inline(re.sub(r'^\d+\. ', '', lines[i]))); i += 1
        out.append('</ol>'); continue
    if l.strip(): out.append('<p>%s</p>' % inline(l))
    i += 1

CSS = """
:root{--ink:#1F2430;--sub:#5B6270;--line:#D9DDE3;--head:#F4F5F7;--accent:#2F5BD3;--red:#C0392B}
*{box-sizing:border-box}body{margin:0;background:#FFF;color:var(--ink);font:14px/1.6 "Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif}
.wrap{max-width:1240px;margin:0 auto;padding:24px 28px 60px}
h1{font-size:22px;margin:0 0 12px;line-height:1.35}h2{font-size:18px;margin:32px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--line)}h3{font-size:15px;margin:22px 0 8px}
p{margin:8px 0}hr{border:0;border-top:1px solid var(--line);margin:24px 0}
table{border-collapse:collapse;width:100%;margin:10px 0 14px;font-size:13.5px}th,td{border:1px solid var(--line);padding:7px 9px;vertical-align:top;text-align:left}th{background:var(--head);font-weight:600;white-space:nowrap}
td:first-child{white-space:nowrap}tbody tr:nth-child(even){background:#FAFBFC}
code{font-family:Consolas,"D2Coding",monospace;font-size:12.5px;background:#F1F2F4;padding:1px 4px;border-radius:3px}
a.f{color:var(--accent);font-weight:600;text-decoration:none;white-space:nowrap}a.f:hover{text-decoration:underline}a.cap{text-decoration:none;font-size:12px;margin:0 6px 0 3px;opacity:.75}a.cap:hover{opacity:1}
ul,ol{margin:6px 0 10px;padding-left:22px}li{margin:3px 0}strong{color:#111}
.tip{background:#EEF1FB;border:1px solid #C9D4F4;border-radius:6px;padding:10px 14px;margin:14px 0;font-size:13.5px}
.nav{position:sticky;top:0;background:#FFF;border-bottom:1px solid var(--line);padding:8px 0;margin-bottom:8px;font-size:13px;z-index:2}.nav a{margin-right:14px;color:var(--accent);text-decoration:none}.nav a:hover{text-decoration:underline}
@media print{.nav{display:none}}
"""
NAV = '<div class="nav"><a href="#s1">1. 공통 변경 9가지</a><a href="#s2">2. 1차 10파일</a><a href="#s3">3. 실적 승인 흐름</a><a href="#s4">4. 2차 24파일 바뀐 곳</a><a href="#s5">5. 그리지 않은 것</a><a href="#s6">6. 결과 전달</a><a href="캡처-34/">캡처 폴더</a></div>'
body = '\n'.join(out)
for n in range(1, 7): body = body.replace('<h2>%d. ' % n, '<h2 id="s%d">%d. ' % (n, n), 1)
body = body.replace('<h3>3. ', '<h3 id="s3">3. ', 1)
tip = '<div class="tip">파일 이름(파랑)을 누르면 그 시안이 새 탭으로 열립니다 · 📷는 그 파일의 전체 캡처 · 시안 파일은 화면 폭 1440 이상에서 봐 주세요. 이 안내는 <code>검수-안내-34파일.md</code>와 같은 내용입니다.</div>'
doc = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>%s</title><style>%s</style></head><body><div class="wrap">%s%s%s</div></body></html>' % (
    html.escape('시안 34파일 검수 안내 (2026-09-07)'), CSS, NAV, tip, body)
doc = doc.replace('<a class="f" href=', '<a class="f" target="_blank" href=').replace('<a class="cap" href=', '<a class="cap" target="_blank" href=')
io.open(OUT, 'w', encoding='utf-8', newline='\n').write(doc)
print(OUT, len(doc.encode('utf-8')), 'B · 링크', doc.count('class="f"'), '· 캡처 링크', doc.count('class="cap"'))
