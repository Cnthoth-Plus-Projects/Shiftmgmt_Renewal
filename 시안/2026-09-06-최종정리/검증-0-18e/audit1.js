(() => {
  const vis = e => e.getClientRects().length > 0;
  const out = { f: decodeURIComponent(location.pathname.split('/').pop()), wrappers: [] };
  document.querySelectorAll('.state-wrapper').forEach(w => {
    const hdr = w.querySelector('header.header-bar');
    const kids = hdr ? [...hdr.querySelectorAll(':scope > div > *')].map(e => e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ')[0]) : [];
    const aw = w.querySelector('.app-window');
    const g = e => e ? [getComputedStyle(e).borderRadius, getComputedStyle(e).padding, getComputedStyle(e).fontSize].join('/') : '-';
    const o = {
      id: w.id,
      hdrKids: kids.join(','),
      logout: w.querySelectorAll('header .btn-logout').length,
      help: [...w.querySelectorAll('header button')].filter(b => /도움말/.test(b.textContent)).length,
      logo: w.querySelectorAll('header .app-logo').length,
      title: w.querySelectorAll('header .app-title').length,
      personBtn: [...w.querySelectorAll('header button')].filter(b => /person/.test(b.textContent)).length,
      nav: w.querySelectorAll('nav[aria-label="주 메뉴"]').length,
      cur: w.querySelectorAll('[aria-current="page"]').length,
      skip: w.querySelectorAll('.app-window > a.skip-link').length,
      skipFirst: aw && aw.firstElementChild ? aw.firstElementChild.className : '',
      live: [...w.querySelectorAll('.app-window > [role=status], .app-window > [aria-live]')].map(r => r.id + ':' + r.textContent),
      liveInsideHidden: [...w.querySelectorAll('[aria-live]')].filter(r => r.closest('[aria-hidden="true"]')).length,
      hdrH: hdr ? Math.round(hdr.getBoundingClientRect().height) : 0,
      sideW: (() => { const s = w.querySelector('.sidebar'); return s ? Math.round(s.getBoundingClientRect().width) : 0; })(),
      mainTop: (() => { const m = w.querySelector('main'); return m && aw ? Math.round(m.getBoundingClientRect().top - aw.getBoundingClientRect().top) : 0; })(),
      unlabeled: [...w.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(vis).filter(i => !(i.id && w.querySelector('label[for="' + i.id + '"]')) && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby') && !i.closest('label')).length,
      rowcount: w.querySelectorAll('[aria-rowcount],[aria-rowindex]').length,
      grids: [...w.querySelectorAll('table[role=grid]')].map(t => ({ rows: t.querySelectorAll('tbody tr').length, sel: t.querySelectorAll('tbody tr[aria-selected]').length, tab0: t.querySelectorAll('tbody tr[tabindex="0"]').length })),
      tables: [...w.querySelectorAll('table')].filter(vis).map(t => { const td = t.querySelector('tbody td'), th = t.querySelector('thead th'), tr = t.querySelector('tbody tr'); return { cls: t.className, td: td ? getComputedStyle(td).fontSize : '', th: th ? getComputedStyle(th).fontSize : '', rowH: tr ? Math.round(tr.getBoundingClientRect().height) : 0, rows: t.querySelectorAll('tbody tr').length }; }),
      small: [...w.querySelectorAll('td,th,li,p,span,label,div,b,strong,a,button,small')].filter(e => vis(e) && e.children.length === 0 && e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 12 && !e.closest('.pattern-day-box') && !e.closest('.c-cell') && !e.closest('[aria-hidden="true"]')).map(e => (e.className || e.tagName) + ':' + e.textContent.trim().slice(0, 10) + ':' + getComputedStyle(e).fontSize).slice(0, 6),
      btn: { p: g(w.querySelector('.btn-primary')), s: g(w.querySelector('.btn-secondary')), sm: g(w.querySelector('.btn-sm')) },
      modals: [...w.querySelectorAll('.modal-box')].map(m => { const cs = getComputedStyle(m); return (m.parentElement.id || '?') + ':' + cs.width + '/' + cs.borderRadius + '/' + cs.boxShadow.replace(/rgba?\([^)]*\)/, '').trim(); }),
      groupHidden: [...w.querySelectorAll('.nav-group-header')].filter(h => h.getAttribute('aria-hidden') === 'true').length,
      icons: w.querySelectorAll('.material-symbols-outlined').length,
      badge: (() => { const b = w.querySelector('.badge'); return b ? getComputedStyle(b).fontSize : '-'; })(),
      leaveModal: w.querySelectorAll('.app-window > .modal-leave').length,
      chips: [...w.querySelectorAll('.chip-label')].map(c => [...c.childNodes].filter(n => !(n.getAttribute && n.getAttribute('aria-hidden') === 'true')).map(n => n.textContent).join('').trim()).slice(0, 3)
    };
    const w2 = w.querySelector('.w2-layout');
    if (w2) {
      const cols = getComputedStyle(w2).gridTemplateColumns;
      const tops = txt => [...w2.querySelectorAll('td,th')].filter(e => e.textContent.trim() === txt).map(e => Math.round(e.getBoundingClientRect().top));
      o.w2 = { cols, sw: w2.scrollWidth, cw: w2.clientWidth, sum: [...w2.children].reduce((a, c) => a + c.getBoundingClientRect().width, 0) + 24, tops: { 주간: [...new Set(tops('주간'))].length, 야간: [...new Set(tops('야간'))].length, 도트: [...new Set(tops('도트'))].length, 유형: [...new Set(tops('유형'))].length, 휴게: [...new Set(tops('휴게'))].length }, palRow: (() => { const r = w2.querySelector('.palette-table tbody tr'); return r ? Math.round(r.getBoundingClientRect().height) : 0; })() };
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
