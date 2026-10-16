(() => {
  // 기준본↔결과본 구조 대조용 스냅샷(Codex ⑥ 1차 충돌 7 판정 반영 — computed 값만으로는 배치 회귀를 못 잡는다):
  //  state-wrapper별 ① 보이는 글자 전수(텍스트 노드 단위, aria-hidden 조상 포함해 전부 — 배경도 본다) ② main/app-body 넘침 ③ 표 행 높이 ④ .card 높이 ⑤ 보이는 요소 수
  const vis = e => e.getClientRects().length > 0;
  const out = { f: decodeURIComponent(location.pathname.split('/').pop()), bodyStray: [...document.body.childNodes].filter(n => n.nodeType === 3 && n.nodeValue.trim()).length, w: [] };
  document.querySelectorAll('.state-wrapper').forEach(w => {
    const words = []; const walker = document.createTreeWalker(w, NodeFilter.SHOW_TEXT); let n;
    while ((n = walker.nextNode())) { const el = n.parentElement; if (!el || el.closest('script,style') || !vis(el)) continue; const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t) words.push(t); }
    const main = w.querySelector('main'); const body = w.querySelector('.app-body'); const aw = w.querySelector('.app-window');
    const ov = e => e ? [e.scrollWidth, e.clientWidth, e.scrollHeight, e.clientHeight].join('/') : '';
    out.w.push({
      id: w.id, h: Math.round(w.getBoundingClientRect().height), text: words,
      main: ov(main), body: ov(body), win: aw ? Math.round(aw.getBoundingClientRect().height) : 0,
      tables: [...w.querySelectorAll('table')].filter(vis).map(t => (t.className || 'table') + ':' + [...t.querySelectorAll('tbody tr')].map(r => Math.round(r.getBoundingClientRect().height)).join(',')),
      cards: [...w.querySelectorAll('.card, .modal-box, .w2-col, aside')].filter(vis).map(c => (c.className || c.tagName).toString().split(' ')[0] + ':' + Math.round(c.getBoundingClientRect().width) + 'x' + Math.round(c.getBoundingClientRect().height)),
      elems: [...w.querySelectorAll('*')].filter(vis).length,
      overflowers: [...w.querySelectorAll('*')].filter(e => vis(e) && !/auto|scroll/.test(getComputedStyle(e).overflowX + getComputedStyle(e).overflowY) && (e.scrollWidth > e.clientWidth + 2 || e.scrollHeight > e.clientHeight + 2) && !e.matches('html,body,table,tbody,thead,tr,td,th') && !e.matches('.sr-only,.skip-link') /* 의도된 clip 숨김 요소 제외 */).length
    });
  });
  return JSON.stringify(out);
})()
