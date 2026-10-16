const { chromium } = require('C:/Projects/Active/ShiftMgmt_V3.4/node_modules/playwright');
const { pathToFileURL } = require('url');
const path = require('path');

const file = path.resolve('시안/2026-09-02-2차HTML/06-employees-1.html');
const url = pathToFileURL(file).href;
const outcomes = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function fresh(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page;
}
async function e9Snapshot(page) {
  return page.evaluate(() => {
    const e9 = document.querySelector('#state-e9');
    const e2 = document.querySelector('#state-e2');
    const panel = e9.querySelector('#btn-e9-panel-close').closest('aside');
    return {
      e9Panel: getComputedStyle(panel).display,
      e2Panel: getComputedStyle(e2.querySelector('aside')).display,
      focusId: document.activeElement?.id || '',
      focusRow: document.activeElement?.matches('tr.selected') && document.activeElement?.dataset.id,
      role: e9.querySelector('.role-badge')?.textContent.trim(),
      e9Visible: getComputedStyle(e9).display,
      e2Visible: getComputedStyle(e2).display,
      selectedCount: e9.querySelectorAll('tr.selected').length
    };
  });
}
async function checkClose(browser, method) {
  const page = await fresh(browser);
  const button = page.locator('#btn-e9-panel-close');
  await button.focus();
  if (method === 'click') await button.click();
  else await button.press(method);
  const x = await e9Snapshot(page);
  assert(x.e9Panel === 'none', `${method}: E9 panel=${x.e9Panel}`);
  assert(x.e2Panel === 'flex', `${method}: original E2 panel=${x.e2Panel}`);
  assert(x.focusRow === '50001', `${method}: focus row=${x.focusRow}, id=${x.focusId}`);
  assert(x.role === '승인 담당', `${method}: role=${x.role}`);
  assert(x.e9Visible !== 'none' && x.e2Visible !== 'none', `${method}: wrapper transition`);
  assert(x.selectedCount === 1, `${method}: selected count=${x.selectedCount}`);
  outcomes.push({ test: `close-${method}`, pass: true, ...x });
  await page.close();
}
async function checkLocked(browser, phase, id, method) {
  const page = await fresh(browser);
  if (phase === 'after-close') await page.locator('#btn-e9-panel-close').click();
  const b = page.locator(`#${id}`);
  assert(await b.getAttribute('aria-disabled') === 'true', `${phase}/${id}: aria-disabled absent`);
  await b.focus();
  if (method === 'click') await b.click({ force: true });
  else await b.press(method);
  const x = await page.evaluate(() => {
    const e9 = document.querySelector('#state-e9');
    return {
      role: e9.querySelector('.role-badge')?.textContent.trim(),
      e9Visible: getComputedStyle(e9).display,
      e2Visible: getComputedStyle(document.querySelector('#state-e2')).display,
      dialogs: [...e9.querySelectorAll('[role="dialog"]')].filter(el => getComputedStyle(el).display !== 'none').length,
      modals: [...e9.querySelectorAll('.modal-overlay')].filter(el => getComputedStyle(el).display !== 'none').length,
      panel: getComputedStyle(e9.querySelector('#btn-e9-panel-close').closest('aside')).display
    };
  });
  assert(x.role === '승인 담당' && x.e9Visible !== 'none' && x.e2Visible !== 'none', `${phase}/${id}/${method}: role or wrapper transition`);
  assert(x.dialogs === 0 && x.modals === 0, `${phase}/${id}/${method}: dialog=${x.dialogs}, modal=${x.modals}`);
  assert(phase !== 'after-close' || x.panel === 'none', `${phase}/${id}/${method}: panel reopened=${x.panel}`);
  outcomes.push({ test: `locked-${phase}-${id}-${method}`, pass: true, ...x });
  await page.close();
}
async function checkLockedAfterClose(browser) {
  const page = await fresh(browser);
  await page.locator('#btn-e9-panel-close').click();
  const x = await page.evaluate(() => ['btn-e2-new-e9','btn-e9-wage','btn-e9-assign','btn-e9-unassign','btn-e9-delete'].map(id => {
    const b=document.getElementById(id), r=b.getBoundingClientRect();
    return {id, aria:b.getAttribute('aria-disabled'), width:r.width, height:r.height, panel:getComputedStyle(document.querySelector('#btn-e9-panel-close').closest('aside')).display};
  }));
  assert(x[0].aria === 'true' && x[0].width > 0 && x.slice(1).every(a => a.aria === 'true' && a.panel === 'none' && a.width === 0 && a.height === 0), `after-close hidden locks ${JSON.stringify(x)}`);
  outcomes.push({test:'locked-after-close-hidden', pass:true, controls:x}); await page.close();
}
async function staticAndLayout(browser) {
  const page = await fresh(browser);
  const x = await page.evaluate(() => {
    const e9 = document.querySelector('#state-e9'); const e2 = document.querySelector('#state-e2');
    const dims = id => [...document.querySelector(`#${id}`).querySelectorAll('tbody tr')].map(r => Math.round(r.getBoundingClientRect().height));
    const box = el => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
    const namedButton = (scope, name) => [...scope.querySelectorAll('button')].find(b => b.textContent.trim() === name);
    const ids = ['btn-e2-new-e9','btn-e9-wage','btn-e9-assign','btn-e9-unassign','btn-e9-delete'];
    const aria = ids.map(id => { const b=document.getElementById(id), ref=b.getAttribute('aria-describedby'), d=ref && document.getElementById(ref); return {id, ref, exists: !!d, visible: !!d && getComputedStyle(d).display !== 'none'}; });
    const sameLine = ids.map(id => { const b=document.getElementById(id), d=document.getElementById(b.getAttribute('aria-describedby')); return {id, buttonTop:Math.round(b.getBoundingClientRect().top), descTop:Math.round(d.getBoundingClientRect().top)}; });
    return { e2Rows:dims('e2-wage-history'), e9Rows:dims('e2-wage-history-e9'),
      wageE2:box(namedButton(e2, '시급 등록')), wageE9:box(document.querySelector('#btn-e9-wage')), newE2:box(document.querySelector('#btn-e2-new')), newE9:box(document.querySelector('#btn-e2-new-e9')),
      aria, sameLine, role:e9.querySelector('.role-badge').textContent.trim(), e2Panel:getComputedStyle(e2.querySelector('aside')).display };
  });
  assert(JSON.stringify(x.e2Rows) === JSON.stringify(x.e9Rows), `row mismatch ${JSON.stringify(x)}`);
  assert(x.e2Rows.every(v => v === 40), `rows not 40 ${x.e2Rows}`);
  assert(x.wageE2[1] === x.wageE9[1] && x.newE2[1] === x.newE9[1], `button height mismatch ${JSON.stringify(x)}`);
  assert(x.aria.length === 5 && x.aria.every(a => a.exists && a.visible), `aria failure ${JSON.stringify(x.aria)}`);
  assert(x.sameLine.every(a => a.buttonTop !== a.descTop), `reason same line ${JSON.stringify(x.sameLine)}`);
  outcomes.push({ test:'static-layout', pass:true, ...x }); await page.close();
}
async function skip(browser, filename) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(pathToFileURL(path.resolve('시안/2026-09-02-2차HTML', filename)).href, {waitUntil:'load'});
  const normal = await page.evaluate(() => { const a=document.querySelector('.skip-link'), r=a.getBoundingClientRect(); return {w:r.width,h:r.height, point:document.elementFromPoint(8,8) === a}; });
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => ({active:document.activeElement?.className, w:document.querySelector('.skip-link').getBoundingClientRect().width, h:document.querySelector('.skip-link').getBoundingClientRect().height}));
  assert(String(focused.active).includes('skip-link') && focused.w > 1 && focused.h > 1, `${filename}: no focused skip`);
  await page.keyboard.press('Enter');
  const target = await page.evaluate(() => ({hash:location.hash, active:document.activeElement?.id, target:document.querySelector(location.hash)?.id}));
  assert(target.hash && target.target === target.hash.slice(1), `${filename}: target invalid ${JSON.stringify(target)}`);
  outcomes.push({test:`skip-${filename}`, pass:true, normal, focused, target}); await page.close();
}
(async() => {
  const browser = await chromium.launch({headless:true});
  try {
    await staticAndLayout(browser);
    for (const m of ['click','Enter','Space']) await checkClose(browser,m);
    await Promise.all(['btn-e2-new-e9','btn-e9-wage','btn-e9-assign','btn-e9-unassign','btn-e9-delete'].flatMap(id => ['click','Enter','Space'].map(m => checkLocked(browser,'before-close',id,m))));
    for (const m of ['click','Enter','Space']) await checkLocked(browser,'after-close','btn-e2-new-e9',m);
    await checkLockedAfterClose(browser);
    for (const f of ['04-sites-1.html','06-employees-1.html']) await skip(browser,f);
    console.log(JSON.stringify({pass:true, total:outcomes.length, outcomes},null,2));
  } finally { await browser.close(); }
})().catch(e => { console.error(JSON.stringify({pass:false,error:e.stack,outcomes},null,2)); process.exitCode=1; });
