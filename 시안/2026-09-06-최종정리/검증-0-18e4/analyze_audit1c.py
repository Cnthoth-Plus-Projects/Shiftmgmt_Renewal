# -*- coding: utf-8 -*-
import io, json, sys
def load(p):
    m = {}
    for l in io.open(p, encoding='utf-8'):
        l = l.strip()
        if l: j = json.loads(l); m[j['f']] = j
    return m
base = load(sys.argv[1]); now = load(sys.argv[2])
print('파일', len(base), len(now))
tot = dict(small=0, smallH=0, bEx=0, tblBad=0, skipBad=0, badgeBad=0, ov=0, err=0, stray=0)
for f in sorted(now):
    a = now[f]; b = base.get(f)
    tot['stray'] += len(a['bodyStray'])
    for w in a['wrappers']:
        tot['small'] += w['small']['n']; tot['smallH'] += w['smallHidden']['n']; tot['bEx'] += w['small']['bEx'] + w['smallHidden']['bEx']
        tot['tblBad'] += sum(1 for t in w['tables'] if t['bad'] and 'team-pattern-table' not in t['cls'])
        tot['skipBad'] += sum(1 for s in w['skip'] if not (s.endswith('MAIN/tabindex=-1')))
        if w['side'] and w['side']['badgeLink']:
            bl = w['side']['badgeLink']
            if bl['ariaLabel'] != '실적 관리, 승인 대기 실적 %s건' % (bl['text'] or bl['title'].replace('승인 대기 실적 ', '').replace('건', '')): tot['badgeBad'] += 1
        if w['mainOv'] and w['mainOv'].split('/')[0] != w['mainOv'].split('/')[1]: tot['ov'] += 1
        tot['err'] += w['scriptErr']
        bw = next((x for x in (b['wrappers'] if b else []) if x['id'] == w['id']), None)
        d = []
        if bw:
            if bw['small']['n'] != w['small']['n'] or bw['smallHidden']['n'] != w['smallHidden']['n']: d.append('small %d/%d→%d/%d' % (bw['small']['n'], bw['smallHidden']['n'], w['small']['n'], w['smallHidden']['n']))
            if bw['skip'] != w['skip']: d.append('skip %s→%s' % (bw['skip'], w['skip']))
            if bw['side'] and w['side'] and bw['side']['names'] != w['side']['names']: d.append('names 변경 %s' % [n for n in w['side']['names'] if n not in bw['side']['names']])
            if [t['bad'] for t in bw['tables']] != [t['bad'] for t in w['tables']]: d.append('표 bad 변경')
            if bw.get('w2') != w.get('w2'): d.append('w2 %s→%s' % (bw.get('w2') and bw['w2']['cell'], w.get('w2') and w['w2']['cell']))
            if bw['mainTop'] != w['mainTop'] or bw['hdrH'] != w['hdrH']: d.append('hdr/mainTop 변경')
        if d or w['small']['n'] or w['smallHidden']['n']: print(' ', f, w['id'], '| small', w['small'], '| hidden', w['smallHidden'], '|', '; '.join(d))
print('합계', tot)
