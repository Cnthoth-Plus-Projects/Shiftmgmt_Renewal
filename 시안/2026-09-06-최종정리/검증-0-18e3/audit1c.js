(() => {
  // 0-18i ④ 3차 ⑤ 감사 — audit1b.js 보완판(Codex ⑥ 2차 N3 반영):
  //  small 예외를 파일·선택자·값으로 한정 — .pattern-day-box 하위(예외 ②, 파일별 현행값) · `.c-cell b` 는 wizard-1/2/3 + 10px 일 때만(예외 ③, #state-w7 한정 확대) · aria-hidden 조상
  //  (audit1b는 `.c-cell b` 를 파일·값 무관하게 제외했다 → W7 9px 를 놓침)
  const vis = e => e.getClientRects().length > 0;
  const file = decodeURIComponent(location.pathname.split('/').pop());
  const bAllowed = /05-sites-wizard-[123]\.html$/.test(file);
  const out = { f: file, bodyStray: [...document.body.childNodes].filter(n => n.nodeType === 3 && n.nodeValue.trim()).map(n => n.nodeValue.trim().slice(0, 40)), wrappers: [] };
  document.querySelectorAll('.state-wrapper').forEach(w => {
    const hdr = w.querySelector('header.header-bar');
    const kids = hdr ? [...hdr.querySelectorAll(':scope > div > *')].map(e => e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ')[0]) : [];
    const aw = w.querySelector('.app-window');
    const side = w.querySelector('.sidebar');
    const smallScan = (hiddenOnly) => {
      const res = []; let bEx = 0; const walker = document.createTreeWalker(w, NodeFilter.SHOW_TEXT); let n;
      while ((n = walker.nextNode())) {
        if (!n.nodeValue.trim()) continue; const el = n.parentElement; if (!el || el.closest('script,style') || !vis(el)) continue;
        const hid = !!el.closest('[aria-hidden="true"]'); if (hiddenOnly !== hid) continue;
        if (el.closest('.pattern-day-box')) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (el.matches('.c-cell b') && bAllowed && fs === 10) { bEx++; continue; }
        if (fs < 12) res.push((el.className || el.tagName) + ':' + n.nodeValue.trim().slice(0, 8) + ':' + fs);
      }
      return { n: res.length, bEx, sample: res.slice(0, 8) };
    };
    const o = {
      id: w.id,
      hdrKids: kids.join(','),
      logout: w.querySelectorAll('header .btn-logout').length,
      nav: w.querySelectorAll('nav[aria-label="주 메뉴"]').length,
      cur: w.querySelectorAll('[aria-current="page"]').length,
      skip: [...w.querySelectorAll('.app-window > a.skip-link')].map(a => a.getAttribute('href') + '→' + (document.getElementById(a.getAttribute('href').slice(1)) ? document.getElementById(a.getAttribute('href').slice(1)).tagName + (document.getElementById(a.getAttribute('href').slice(1)).closest('nav,.sidebar') ? '(nav 안)' : '') + '/tabindex=' + document.getElementById(a.getAttribute('href').slice(1)).getAttribute('tabindex') : '없음')),
      skipFirst: aw && aw.firstElementChild ? aw.firstElementChild.className : '',
      live: [...w.querySelectorAll('.app-window > [role=status], .app-window > [aria-live]')].map(r => r.id + ':' + r.textContent),
      liveInsideHidden: [...w.querySelectorAll('[aria-live]')].filter(r => r.closest('[aria-hidden="true"]')).length,
      hdrH: hdr ? Math.round(hdr.getBoundingClientRect().height) : 0,
      mainTop: (() => { const m = w.querySelector('main'); return m && aw ? Math.round(m.getBoundingClientRect().top - aw.getBoundingClientRect().top) : 0; })(),
      side: side ? {
        w: Math.round(side.getBoundingClientRect().width), collapsed: side.classList.contains('collapsed'), ariaHidden: side.getAttribute('aria-hidden'),
        mainW: (() => { const m = w.querySelector('.main-wrapper'); return m ? Math.round(m.getBoundingClientRect().width) : 0; })(),
        expanded: w.querySelector('.btn-sidebar-toggle') ? w.querySelector('.btn-sidebar-toggle').getAttribute('aria-expanded') : null,
        names: [...side.querySelectorAll('.nav-item')].map(a => (a.getAttribute('aria-label') || [...a.querySelectorAll('span:not(.material-symbols-outlined)')].map(s => s.textContent.trim()).join(' ')) + (a.title ? '(title:' + a.title + ')' : '')),
        badgeLink: (() => { const b = side.querySelector('.nav-badge, .nav-badge-dot'); if (!b) return null; const a = b.closest('a'); const r = b.getBoundingClientRect(); return { text: b.textContent.trim(), title: b.title, ariaLabel: a.getAttribute('aria-label'), vis: vis(b) && r.width > 0, w: Math.round(r.width), h: Math.round(r.height) }; })(),
        groupsHidden: [...side.querySelectorAll('.nav-group-header')].filter(h => h.getAttribute('aria-hidden') === 'true').length
      } : null,
      unlabeled: [...w.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(vis).filter(i => !(i.id && w.querySelector('label[for="' + i.id + '"]')) && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby') && !i.closest('label')).length,
      tables: [...w.querySelectorAll('table')].filter(vis).map(t => {
        const td = t.querySelector('tbody td'), th = t.querySelector('thead th');
        const rows = [...t.querySelectorAll('tbody tr')]; const hs = rows.map(r => Math.round(r.getBoundingClientRect().height * 10) / 10);
        const exp = t.classList.contains('dense') ? 32 : 40; const bad = hs.map((h, i) => [i + 1, h]).filter(x => Math.abs(x[1] - exp) > 0.5);
        const wrap = t.parentElement; const cs = getComputedStyle(wrap);
        return { cls: t.className, hidden: !!t.closest('[aria-hidden="true"]'), td: td ? getComputedStyle(td).fontSize : '', th: th ? getComputedStyle(th).fontSize : '', rows: rows.length, exp, bad: bad.slice(0, 8), thN: t.querySelectorAll('thead th').length, tdN: rows[0] ? rows[0].querySelectorAll('td').length : 0, scrollX: (/auto|scroll/.test(cs.overflowX) && wrap.scrollWidth > wrap.clientWidth) ? wrap.scrollWidth + '>' + wrap.clientWidth : '' };
      }),
      small: smallScan(false),
      smallHidden: smallScan(true),
      icons: w.querySelectorAll('.material-symbols-outlined').length,
      mainOv: (() => { const m = w.querySelector('main'); return m ? [m.scrollWidth, m.clientWidth].join('/') : ''; })(),
      scriptErr: [...w.ownerDocument.scripts].map(s => { try { new Function(s.textContent); return 0; } catch (e) { return e.message; } }).filter(x => x).length
    };
    const w2 = w.querySelector('.w2-layout');
    if (w2) {
      const cell = w2.querySelector('.c-cell'); const grid = w2.querySelector('.c-grid'); const panel = w2.querySelector('.sim-scroll-panel'); const head = w2.querySelector('.c-head');
      o.w2 = { cols: getComputedStyle(w2).gridTemplateColumns, sw: w2.scrollWidth, cw: w2.clientWidth,
        cell: cell ? { fs: getComputedStyle(cell).fontSize, bfs: cell.querySelector('b') ? getComputedStyle(cell.querySelector('b')).fontSize : '', h: Math.round(cell.getBoundingClientRect().height), minH: getComputedStyle(cell).minHeight, pad: getComputedStyle(cell).padding } : null,
        head: head ? { fs: getComputedStyle(head).fontSize, h: Math.round(head.getBoundingClientRect().height) } : null,
        gridH: grid ? Math.round(grid.getBoundingClientRect().height) : 0, panel: panel ? { h: Math.round(panel.getBoundingClientRect().height), sh: panel.scrollHeight, maxH: getComputedStyle(panel).maxHeight } : null,
        colOverflow: [...w2.children].map(c => c.scrollHeight > c.clientHeight + 1 ? Math.round(c.scrollHeight) + '>' + Math.round(c.clientHeight) : '').join('|') };
    }
    out.wrappers.push(o);
  });
  return JSON.stringify(out);
})()
