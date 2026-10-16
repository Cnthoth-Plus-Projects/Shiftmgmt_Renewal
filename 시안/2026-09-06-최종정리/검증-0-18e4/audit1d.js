(() => {
  // 0-18i ④ 4차 ⑤ 감사 — audit1c.js 보완판(Codex ⑥ 3차 잔여 2 반영):
  //  예외 ③ `.c-cell b` 10px 제외를 **파일 + wrapper 상태 + 선택자 + computed 10px**로 한정 — wizard-1 `#state-w2` · wizard-2 `#state-w3`/`#state-w4` · wizard-3 `#state-w7`
  //  (audit1c는 파일명만 보고 wrapper 상태를 보지 않았다). 상태 조건은 wrapper 루프 안에서 계산한다. 그 밖은 audit1c와 동일.
  const vis = e => e.getClientRects().length > 0;
  const file = decodeURIComponent(location.pathname.split('/').pop());
  const B_STATES = { '05-sites-wizard-1.html': ['state-w2'], '05-sites-wizard-2.html': ['state-w3', 'state-w4'], '05-sites-wizard-3.html': ['state-w7'] };
  const out = { f: file, bodyStray: [...document.body.childNodes].filter(n => n.nodeType === 3 && n.nodeValue.trim()).map(n => n.nodeValue.trim().slice(0, 40)), wrappers: [] };
  document.querySelectorAll('.state-wrapper').forEach(w => {
    const bAllowed = (B_STATES[file] || []).includes(w.id);
    const hdr = w.querySelector('header.header-bar');
    const kids = hdr ? [...hdr.querySelectorAll(':scope > div > *')].map(e => e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ')[0]) : [];
    const aw = w.querySelector('.app-window');
    const side = w.querySelector('.sidebar');
    const smallScan = (hiddenOnly) => {
      const res = []; let bEx = 0, bOut = 0; const walker = document.createTreeWalker(w, NodeFilter.SHOW_TEXT); let n;
      while ((n = walker.nextNode())) {
        if (!n.nodeValue.trim()) continue; const el = n.parentElement; if (!el || el.closest('script,style') || !vis(el)) continue;
        const hid = !!el.closest('[aria-hidden="true"]'); if (hiddenOnly !== hid) continue;
        if (el.closest('.pattern-day-box')) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (el.matches('.c-cell b')) { if (bAllowed && fs === 10) { bEx++; continue; } bOut++; }
        if (fs < 12) res.push((el.className || el.tagName) + ':' + n.nodeValue.trim().slice(0, 8) + ':' + fs);
      }
      return { n: res.length, bEx, bOut, sample: res.slice(0, 8) };
    };
    const m = w.querySelector('main');
    const o = {
      id: w.id, bAllowed,
      hdrKids: kids.join(','),
      logout: w.querySelectorAll('header .btn-logout').length,
      nav: w.querySelectorAll('nav[aria-label="주 메뉴"]').length,
      cur: w.querySelectorAll('[aria-current="page"]').length,
      skip: [...w.querySelectorAll('.app-window > a.skip-link')].map(a => { const t = document.getElementById(a.getAttribute('href').slice(1)); return a.getAttribute('href') + '→' + (t ? t.tagName + (t.closest('nav,.sidebar') ? '(nav 안)' : '') + '/tabindex=' + t.getAttribute('tabindex') + '/aria-hidden=' + t.getAttribute('aria-hidden') : '없음'); }),
      skipFirst: aw && aw.firstElementChild ? aw.firstElementChild.className : '',
      live: [...w.querySelectorAll('.app-window > [role=status], .app-window > [aria-live]')].map(r => r.id + ':' + r.textContent),
      liveInsideHidden: [...w.querySelectorAll('[aria-live]')].filter(r => r.closest('[aria-hidden="true"]')).length,
      hdrH: hdr ? Math.round(hdr.getBoundingClientRect().height) : 0,
      mainTop: m && aw ? Math.round(m.getBoundingClientRect().top - aw.getBoundingClientRect().top) : 0,
      mainRect: m ? [m.getBoundingClientRect().left, m.getBoundingClientRect().top, m.getBoundingClientRect().width, m.getBoundingClientRect().height].map(v => Math.round(v * 10) / 10) : null,
      mainHidden: m ? m.getAttribute('aria-hidden') : null,
      side: side ? {
        w: Math.round(side.getBoundingClientRect().width), collapsed: side.classList.contains('collapsed'), ariaHidden: side.getAttribute('aria-hidden'),
        mainW: (() => { const mw = w.querySelector('.main-wrapper'); return mw ? Math.round(mw.getBoundingClientRect().width) : 0; })(),
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
      mainOv: m ? [m.scrollWidth, m.clientWidth].join('/') : '',
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
