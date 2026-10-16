(() => {
  const vis = el => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (el.offsetParent === null && cs.position !== 'fixed') return false;
    return true;
  };
  const H = el => el ? Math.round(el.getBoundingClientRect().height) : null;
  const W = el => el ? Math.round(el.getBoundingClientRect().width) : null;
  const wrappers = [...document.querySelectorAll('.state-wrapper')].map(w => {
    const label = w.querySelector('.status-label-bar');
    const hdr = w.querySelector('.header-bar');
    const side = w.querySelector('.sidebar');
    const foot = w.querySelector('.footer-statusbar');
    const title = w.querySelector('.header-title');
    const toggle = w.querySelector('.btn-sidebar-toggle');
    const rows = [...w.querySelectorAll('table tbody tr')].filter(vis).slice(0, 3).map(H);
    const ths = [...w.querySelectorAll('table thead th')].filter(vis).slice(0, 1).map(th => ({bg: getComputedStyle(th).backgroundColor, fw: getComputedStyle(th).fontWeight, fs: getComputedStyle(th).fontSize}));
    const leafTexts = [...w.querySelectorAll('body *')].filter(e => e.children.length === 0 && e.textContent.trim() && vis(e) && !e.classList.contains('material-symbols-outlined'));
    const small = [];
    for (const e of leafTexts) {
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs < 12) small.push({fs, t: e.textContent.trim().slice(0, 18), c: (typeof e.className === 'string' ? e.className.split(' ')[0] : e.tagName.toLowerCase())});
    }
    const tdSmall = [...w.querySelectorAll('table tbody td')].filter(vis).map(td => parseFloat(getComputedStyle(td).fontSize)).filter(x => x < 14).length;
    const btns = [...w.querySelectorAll('button, a[href], [role="button"]')].filter(vis).map(b => {
      const t = (b.getAttribute('aria-label') || b.textContent).trim().replace(/\s+/g, ' ').slice(0, 22);
      const d = b.getAttribute('aria-describedby');
      return t + (b.disabled ? '[dis]' : '') + (b.getAttribute('aria-disabled') === 'true' ? '[a-dis]' : '') + (d ? (document.getElementById(d) ? '[desc]' : '[desc✗]') : '');
    });
    const modals = [...w.querySelectorAll('[class*="modal"],[role="dialog"]')].filter(e => /modal-overlay|modal-box|dialog/.test(e.className) || e.getAttribute('role') === 'dialog').map(m => ({c: m.className.split(' ').slice(0, 2).join('.'), vis: vis(m), role: m.getAttribute('role'), w: W(m)}));
    const adis = [...w.querySelectorAll('[aria-disabled="true"]')].length;
    return {id: w.id, labelH: H(label), hdrH: H(hdr), titleFs: title ? getComputedStyle(title).fontSize + '/' + getComputedStyle(title).fontWeight : null, toggle: toggle ? W(toggle) + 'x' + H(toggle) : null, sideW: W(side), footH: H(foot), rows, th: ths[0] || null, smallN: small.length, small: small.slice(0, 5), tdSmall, adis, modals, btns};
  });
  const root = getComputedStyle(document.documentElement);
  const tokens = ['--accent', '--bg', '--line', '--text', '--text-sub', '--row-selected'].map(k => k + '=' + root.getPropertyValue(k).trim()).join(' ');
  const scripts = document.querySelectorAll('script').length;
  return JSON.stringify({title: document.title, tokens, scripts, bodyW: document.body.scrollWidth, wrappers});
})()
