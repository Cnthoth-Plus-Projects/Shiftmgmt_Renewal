(() => {
  // 0-18e ④ 2차 ⑤ 감사 — audit1.js 보완판(Codex ⑥ 1차 Q4·Q5 지적 반영):
  //  small  = 직접 텍스트 노드 단위(자식 요소 있어도 검사) · 제외는 명시 예외 선택자(.pattern-day-box 하위, .c-cell b)와 aria-hidden 조상뿐
  //  tables = 표마다 첫 행이 아니라 tbody 전 행 높이(기대 40 / .dense 32) · aria-hidden 배경 표도 hidden 플래그로 포함
  //  body   = body 직계 잡텍스트(Q1) · side = 사이드바 폭/접힘/메뉴 이름/배지
  const vis = e => e.getClientRects().length > 0;
  const out = { f: decodeURIComponent(location.pathname.split('/').pop()), bodyStray: [...document.body.childNodes].filter(n => n.nodeType === 3 && n.nodeValue.trim()).map(n => n.nodeValue.trim().slice(0, 40)), wrappers: [] };
  document.querySelectorAll('.state-wrapper').forEach(w => {
    const hdr = w.querySelector('header.header-bar');
    const kids = hdr ? [...hdr.querySelectorAll(':scope > div > *')].map(e => e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ')[0]) : [];
    const aw = w.querySelector('.app-window');
    const g = e => e ? [getComputedStyle(e).borderRadius, getComputedStyle(e).padding, getComputedStyle(e).fontSize].join('/') : '-';
    const side = w.querySelector('.sidebar');
    const smallScan = (hiddenOnly) => {
      const res = []; const walker = document.createTreeWalker(w, NodeFilter.SHOW_TEXT); let n;
      while ((n = walker.nextNode())) {
        if (!n.nodeValue.trim()) continue; const el = n.parentElement; if (!el || el.closest('script,style') || !vis(el)) continue;
        const hid = !!el.closest('[aria-hidden="true"]'); if (hiddenOnly !== hid) continue;
        if (el.closest('.pattern-day-box') || el.matches('.c-cell b')) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 12) res.push((el.className || el.tagName) + ':' + n.nodeValue.trim().slice(0, 8) + ':' + fs);
      }
      return { n: res.length, sample: res.slice(0, 6) };
    };
    const o = {
      id: w.id,
      hdrKids: kids.join(','),
      logout: w.querySelectorAll('header .btn-logout').length,
      help: [...w.querySelectorAll('header button')].filter(b => /도움말/.test(b.textContent)).length,
      logo: w.querySelectorAll('header .app-logo').length,
      personBtn: [...w.querySelectorAll('header button')].filter(b => /person/.test(b.textContent)).length,
      nav: w.querySelectorAll('nav[aria-label="주 메뉴"]').length,
      cur: w.querySelectorAll('[aria-current="page"]').length,
      skip: w.querySelectorAll('.app-window > a.skip-link').length,
      skipFirst: aw && aw.firstElementChild ? aw.firstElementChild.className : '',
      live: [...w.querySelectorAll('.app-window > [role=status], .app-window > [aria-live]')].map(r => r.id + ':' + r.textContent),
      liveInsideHidden: [...w.querySelectorAll('[aria-live]')].filter(r => r.closest('[aria-hidden="true"]')).length,
      hdrH: hdr ? Math.round(hdr.getBoundingClientRect().height) : 0,
      mainTop: (() => { const m = w.querySelector('main'); return m && aw ? Math.round(m.getBoundingClientRect().top - aw.getBoundingClientRect().top) : 0; })(),
      side: side ? {
        w: Math.round(side.getBoundingClientRect().width), collapsed: side.classList.contains('collapsed'), ariaHidden: side.getAttribute('aria-hidden'),
        mainW: (() => { const m = w.querySelector('.main-wrapper'); return m ? Math.round(m.getBoundingClientRect().width) : 0; })(),
        expanded: (w.querySelector('.btn-sidebar-toggle') || {}).getAttribute ? w.querySelector('.btn-sidebar-toggle').getAttribute('aria-expanded') : null,
        names: [...side.querySelectorAll('.nav-item')].map(a => (a.getAttribute('aria-label') || [...a.querySelectorAll('span:not(.material-symbols-outlined)')].map(s => s.textContent.trim()).join(' ')) + (a.title ? '(title:' + a.title + ')' : '')),
        groupsHidden: [...side.querySelectorAll('.nav-group-header')].filter(h => h.getAttribute('aria-hidden') === 'true').length,
        groupsVisibleText: [...side.querySelectorAll('.nav-group-header')].filter(h => vis(h) && parseFloat(getComputedStyle(h).fontSize) > 0 && h.getBoundingClientRect().height > 2).length,
        badge: (() => { const b = side.querySelector('.nav-badge'); if (!b) return null; const r = b.getBoundingClientRect(); return { text: b.textContent.trim(), title: b.title, vis: vis(b) && r.width > 0, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left - side.getBoundingClientRect().left) }; })()
      } : null,
      unlabeled: [...w.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(vis).filter(i => !(i.id && w.querySelector('label[for="' + i.id + '"]')) && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby') && !i.closest('label')).length,
      rowcount: w.querySelectorAll('[aria-rowcount],[aria-rowindex]').length,
      grids: [...w.querySelectorAll('table[role=grid]')].map(t => ({ rows: t.querySelectorAll('tbody tr').length, sel: t.querySelectorAll('tbody tr[aria-selected]').length, tab0: t.querySelectorAll('tbody tr[tabindex="0"]').length })),
      tables: [...w.querySelectorAll('table')].filter(vis).map(t => {
        const td = t.querySelector('tbody td'), th = t.querySelector('thead th');
        const rows = [...t.querySelectorAll('tbody tr')]; const hs = rows.map(r => Math.round(r.getBoundingClientRect().height * 10) / 10);
        const exp = t.classList.contains('dense') ? 32 : 40; const bad = hs.map((h, i) => [i + 1, h]).filter(x => Math.abs(x[1] - exp) > 0.5);
        const wrap = t.parentElement; const cs = getComputedStyle(wrap);
        return { cls: t.className, hidden: !!t.closest('[aria-hidden="true"]'), td: td ? getComputedStyle(td).fontSize : '', th: th ? getComputedStyle(th).fontSize : '', rows: rows.length, exp, bad: bad.slice(0, 8), thN: t.querySelectorAll('thead th').length, tdN: rows[0] ? rows[0].querySelectorAll('td').length : 0, scrollX: (/auto|scroll/.test(cs.overflowX) && wrap.scrollWidth > wrap.clientWidth) ? wrap.scrollWidth + '>' + wrap.clientWidth : '' };
      }),
      small: smallScan(false),
      smallHidden: smallScan(true),
      btn: { p: g(w.querySelector('.btn-primary')), s: g(w.querySelector('.btn-secondary')), sm: g(w.querySelector('.btn-sm')) },
      modals: [...w.querySelectorAll('.modal-box')].map(m => { const cs = getComputedStyle(m); return (m.parentElement.id || '?') + ':' + cs.width + '/' + cs.borderRadius + '/' + cs.boxShadow.replace(/rgba?\([^)]*\)/, '').trim(); }),
      icons: w.querySelectorAll('.material-symbols-outlined').length,
      badge: (() => { const b = w.querySelector('.badge'); return b ? getComputedStyle(b).fontSize : '-'; })(),
      leaveModal: w.querySelectorAll('.app-window > .modal-leave').length,
      chips: [...w.querySelectorAll('.chip-label')].map(c => [...c.childNodes].filter(n => !(n.getAttribute && n.getAttribute('aria-hidden') === 'true')).map(n => n.textContent).join('').trim()).slice(0, 3),
      scriptErr: [...w.ownerDocument.scripts].map(s => { try { new Function(s.textContent); return 0; } catch (e) { return e.message; } }).filter(x => x).length
    };
    const w2 = w.querySelector('.w2-layout');
    if (w2) {
      const cols = getComputedStyle(w2).gridTemplateColumns;
      const tops = txt => [...w2.querySelectorAll('td,th')].filter(e => e.textContent.trim() === txt).map(e => Math.round(e.getBoundingClientRect().top));
      const cell = w2.querySelector('.c-cell'); const grid = w2.querySelector('.c-grid'); const panel = w2.querySelector('.sim-scroll-panel');
      o.w2 = { cols, sw: w2.scrollWidth, cw: w2.clientWidth, sum: [...w2.children].reduce((a, c) => a + c.getBoundingClientRect().width, 0) + 24, tops: { 주간: [...new Set(tops('주간'))].length, 야간: [...new Set(tops('야간'))].length, 도트: [...new Set(tops('도트'))].length, 유형: [...new Set(tops('유형'))].length, 휴게: [...new Set(tops('휴게'))].length }, palRow: (() => { const r = w2.querySelector('.palette-table tbody tr'); return r ? Math.round(r.getBoundingClientRect().height) : 0; })(),
        cell: cell ? { fs: getComputedStyle(cell).fontSize, bfs: cell.querySelector('b') ? getComputedStyle(cell.querySelector('b')).fontSize : '', h: Math.round(cell.getBoundingClientRect().height) } : null, gridH: grid ? Math.round(grid.getBoundingClientRect().height) : 0, panel: panel ? { h: Math.round(panel.getBoundingClientRect().height), sh: panel.scrollHeight, maxH: getComputedStyle(panel).maxHeight } : null,
        colOverflow: [...w2.children].map(c => c.scrollHeight > c.clientHeight + 1 ? Math.round(c.scrollHeight) + '>' + Math.round(c.clientHeight) : '').join('|') };
    }
    const gt = w.querySelector('.grid-table');
    if (gt && vis(gt)) {
      const cont = gt.closest('[style*="overflow"], .table-scroll, .table-wrap') || gt.parentElement;
      const cr = cont.getBoundingClientRect();
      const ths = [...gt.querySelectorAll('thead th')];
      const st = ths.find(t => t.textContent.trim() === '상태'), wn = ths.find(t => t.textContent.trim() === '경고');
      const rows = [...gt.querySelectorAll('tbody tr')];
      const visRows = rows.filter(r => { const b = r.getBoundingClientRect(); return b.top >= cr.top - 1 && b.bottom <= cr.bottom + 1; }).length;
      o.grid = { contRight: Math.round(cr.right), statusRight: st ? Math.round(st.getBoundingClientRect().right) : -1, warnRight: wn ? Math.round(wn.getBoundingClientRect().right) : -1, warnW: wn ? Math.round(wn.getBoundingClientRect().width) : -1, visRows, thOrder: ths.map(t => t.textContent.trim()).join('|'), minW: getComputedStyle(gt).minWidth, contW: Math.round(cr.width) };
    }
    out.wrappers.push(o);
  });
  return JSON.stringify(out);
})()
