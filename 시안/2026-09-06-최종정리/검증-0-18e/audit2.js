(() => {
  const vis = e => e.getClientRects().length > 0;
  const out = { f: decodeURIComponent(location.pathname.split('/').pop()), wrappers: [] };
  const g = e => e ? [getComputedStyle(e).borderRadius, getComputedStyle(e).padding, getComputedStyle(e).fontSize].join('/') : '-';
  document.querySelectorAll('.state-wrapper').forEach(w => {
    const hdr = w.querySelector('header.header-bar');
    const kids = hdr ? [...hdr.querySelectorAll(':scope > div > *')].map(e => e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ')[0]) : [];
    const aw = w.querySelector('.app-window');
    const side = w.querySelector('.sidebar');
    const o = {
      id: w.id, hdrKids: kids.join(','),
      logout: w.querySelectorAll('header .btn-logout').length, personBtn: [...w.querySelectorAll('header button')].filter(b => /person/.test(b.textContent)).length,
      nav: w.querySelectorAll('nav[aria-label="주 메뉴"]').length, cur: w.querySelectorAll('[aria-current="page"]').length,
      skip: w.querySelectorAll('.app-window > a.skip-link').length, skipFirst: aw && aw.firstElementChild ? aw.firstElementChild.className : '',
      hdrH: hdr ? Math.round(hdr.getBoundingClientRect().height) : 0, sideW: side ? Math.round(side.getBoundingClientRect().width) : 0,
      collapsed: side ? side.classList.contains('collapsed') : false,
      groupsVisibleText: side ? [...side.querySelectorAll('.nav-group-header')].filter(h => vis(h) && h.getAttribute('aria-hidden') !== 'true' && parseFloat(getComputedStyle(h).fontSize) > 0).length : 0,
      groupsHidden: side ? [...side.querySelectorAll('.nav-group-header')].filter(h => h.getAttribute('aria-hidden') === 'true').length : 0,
      menuNames: side ? [...side.querySelectorAll('.nav-item')].length : 0,
      role: (w.querySelector('header .role-badge') || {}).textContent || '', account: (w.querySelector('header .user-info-text span:last-child') || {}).textContent || '',
      mainTop: (() => { const m = w.querySelector('main'); return m && aw ? Math.round(m.getBoundingClientRect().top - aw.getBoundingClientRect().top) : 0; })(),
      btn: { p: g(w.querySelector('.btn-primary:not(.btn-sm)')), s: g(w.querySelector('.btn-secondary:not(.btn-sm)')), d: g(w.querySelector('.btn-danger')), ghost: g(w.querySelector('.btn-danger-ghost')) },
      ghostN: w.querySelectorAll('.btn-danger-ghost').length, dangerN: w.querySelectorAll('.btn-danger').length,
      ghostColor: (() => { const b = w.querySelector('.btn-danger-ghost'); if (!b) return ''; const cs = getComputedStyle(b); return cs.color + '|' + cs.backgroundColor + '|' + cs.borderColor; })(),
      modals: [...w.querySelectorAll('.modal-box')].map(m => { const cs = getComputedStyle(m); const p = m.parentElement; return (p.id || '?') + ':' + cs.width + '/' + cs.borderRadius + '/' + cs.boxShadow.replace(/rgba?\([^)]*\)/, '').trim(); }),
      leaveModal: w.querySelectorAll('.app-window > .modal-leave').length,
      icons: w.querySelectorAll('.material-symbols-outlined').length,
      unlabeled: [...w.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(vis).filter(i => !(i.id && w.querySelector('label[for="' + i.id + '"]')) && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby') && !i.closest('label')).length,
      unnamed: [...w.querySelectorAll('button,a[href],[role=button]')].filter(vis).filter(b => { const t = [...b.childNodes].map(n => n.nodeType === 3 ? n.textContent : (n.getAttribute && n.getAttribute('aria-hidden') === 'true' ? '' : n.textContent)).join('').trim(); return !t && !b.getAttribute('aria-label') && !b.getAttribute('title') && !b.getAttribute('aria-labelledby'); }).length,
      adis: [...w.querySelectorAll('[aria-disabled="true"]')].map(b => (b.id || b.textContent.trim().slice(0, 8)) + '→' + (b.getAttribute('aria-describedby') || '') + ':' + (document.getElementById(b.getAttribute('aria-describedby')) ? (vis(document.getElementById(b.getAttribute('aria-describedby'))) ? 'v' : 'hidden') : 'MISSING')).slice(0, 8),
      tables: [...w.querySelectorAll('table')].filter(vis).map(t => { const tr = t.querySelector('tbody tr'); const rows = [...t.querySelectorAll('tbody tr')]; return { cls: t.className, rows: rows.length, rowH: [...new Set(rows.map(r => Math.round(r.getBoundingClientRect().height)))].join('/'), td: (() => { const td = t.querySelector('tbody td'); return td ? getComputedStyle(td).fontSize : ''; })() }; }),
      clip: [...w.querySelectorAll('td')].filter(vis).filter(td => td.scrollWidth > td.clientWidth + 1).length
    };
    if (w.id === 'state-a1') { o.a1 = { charts: [...w.querySelectorAll('div')].filter(d => /수당 구분별 비중|월별 지급 추이/.test(d.textContent) && d.children.length === 0).length, cards: [...w.querySelectorAll('div')].filter(d => d.children.length === 0 && /정규 지급분|조기 지급분/.test(d.textContent)).length, tableTop: (() => { const t = w.querySelector('table'); return t ? Math.round(t.getBoundingClientRect().top) : -1; })() }; }
    if (w.id === 'state-e2' || w.id === 'state-e9') { const inp = w.querySelector('input[placeholder="이름 또는 사번"]'); o.e = { search: inp ? inp.value : null, rows: w.querySelectorAll('tbody tr').length }; }
    if (w.id === 'state-o1') { const b = [...w.querySelectorAll('button')].find(x => x.textContent.trim() === '경로 저장'); const st = [...w.querySelectorAll('span')].find(x => x.textContent.trim() === '● 저장되지 않음'); o.o1 = { btnInHeader: !!(b && st && b.closest('div') === st.closest('div').parentElement || (b && st && b.parentElement === st.parentElement)), sameRow: b && st ? Math.abs((b.getBoundingClientRect().top + b.getBoundingClientRect().height / 2) - (st.getBoundingClientRect().top + st.getBoundingClientRect().height / 2)) < 4 : false, btnRight: b ? Math.round(b.getBoundingClientRect().right) : -1, stRight: st ? Math.round(st.getBoundingClientRect().right) : -1 }; }
    if (w.id === 'state-g1' || /access/.test(out.f)) { const rows = [...w.querySelectorAll('tbody tr')]; o.g1 = { rows: rows.length, heights: [...new Set(rows.map(r => Math.round(r.getBoundingClientRect().height)))].join('/'), subs: w.querySelectorAll('.sub').length, clipTd: rows.flatMap(r => [...r.querySelectorAll('td')]).filter(td => td.scrollWidth > td.clientWidth + 1).length }; }
    out.wrappers.push(o);
  });
  return JSON.stringify(out);
})()
