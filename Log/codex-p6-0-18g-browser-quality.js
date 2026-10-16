const { chromium } = require('C:/Projects/Active/ShiftMgmt_V3.4/node_modules/playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');

const root = 'C:/Projects/Active/교대근무관리 시스템';
const target = path.join(root, '시안/2026-08-31-1차HTML/08-performance-3.html');
const prefix = path.join(root, 'Log/codex-p6-0-18g');
const out = [];
const fail = [];
function check(name, actual, expected = true) {
  const ok = typeof expected === 'function' ? expected(actual) : actual === expected;
  out.push({ check: name, pass: ok, actual, expected: typeof expected === 'function' ? 'predicate' : expected });
  if (!ok) fail.push(name);
}
async function pageState(page) {
  return page.evaluate(() => {
    const text = (s) => document.querySelector(s)?.textContent.trim() || '';
    return {
      r2: text('#p6-row-2 .status-col'), r5: text('#p6-row-5 .status-col'), r7: text('#p6-row-7 .status-col'),
      chip: text('#p6-chip-pending'), badge: text('#p6-sidebar-badge'), live: text('#p6-aria-live'),
      fileDisplay: document.querySelector('#modal-approve-file')?.style.display,
      active: document.activeElement?.id || document.activeElement?.tagName
    };
  });
}
async function selectDetails(page, id) {
  const row = page.locator(id);
  await row.focus();
  await page.keyboard.press('Enter');
  const result = await page.evaluate((id) => {
    const r = document.querySelector(id);
    const c = (name) => r.querySelector(`td[data-col="${name}"]`)?.textContent.trim() || '';
    let up = r, site = c('site');
    while (!site && (up = up.previousElementSibling)) site = up.querySelector('td[data-col="site"]')?.textContent.replace(/\s*\(\d+\)\s*$/, '').trim() || '';
    const hours = c('hours').match(/^([\d.]+)\s*=\s*([\d.]+)\+([\d.]+)\+([\d.]+)/);
    const actual = Object.fromEntries(['site','emp','name','rank','date','work','base','ot','night','wage'].map(k => [k, document.querySelector('#p6-d-' + k)?.textContent.trim() || '']));
    const expected = {
      site, emp:c('emp'), name:c('name'), rank:c('rank'), date:c('date'),
      work:`${c('section')} · ${c('code')} · ${c('time')} (${hours ? hours[1] : c('hours')})`,
      base:hours ? hours[2] : '-', ot:hours ? hours[3] : '-', night:hours ? hours[4] : '-', wage:c('wage') + '원'
    };
    return { actual, expected, panel: document.querySelector('#p6-detail-panel').style.display };
  }, id);
  check(`${id} detail panel opens`, result.panel, 'flex');
  for (const key of Object.keys(result.expected)) check(`${id} detail ${key}`, result.actual[key], result.expected[key]);
  await page.keyboard.press('Escape');
  check(`${id} detail Escape closes`, await page.locator('#p6-detail-panel').evaluate(e => e.style.display), 'none');
}
async function approveSelectedByKeyboard(page, expectedTarget) {
  const button = page.locator('#btn-approve-single');
  await button.focus();
  await page.keyboard.press('Enter');
  check(`single modal target ${expectedTarget}`, await page.locator('#p6-single-target').textContent(), expectedTarget);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
}
async function oneFileCycle(page, cycle) {
  const fileButton = page.locator('#btn-approve-file');
  await fileButton.focus();
  await page.keyboard.press('Enter');
  check(`cycle ${cycle} initial confirm count`, await page.locator('#btn-file-confirm').count(), 1);
  check(`cycle ${cycle} initial rows/chip`, await pageState(page), x => x.r2==='대기' && x.r5==='대기' && x.r7==='대기' && /128/.test(x.chip) && x.badge==='128');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  const processing = await page.evaluate(() => ({
    disabled: ['#btn-file-cancel','#btn-file-confirm'].map(s => document.querySelector(s)?.disabled),
    activeInside: document.querySelector('#modal-approve-file').contains(document.activeElement),
    active: document.activeElement?.id || document.activeElement?.tagName,
    live: document.querySelector('#p6-aria-live')?.textContent.trim(),
    display: document.querySelector('#modal-approve-file')?.style.display
  }));
  check(`cycle ${cycle} native disabled buttons`, processing.disabled, x => x[0] === true && x[1] === true);
  check(`cycle ${cycle} focus in modal processing`, processing.activeInside, true);
  check(`cycle ${cycle} processing live text`, processing.live, '처리 중: 파일 승인 중…');
  await page.screenshot({ path: `${prefix}-cycle${cycle}-processing.png`, fullPage: false });
  const keys = [];
  await page.evaluate(() => {
    window.__p6KeyController?.abort();
    window.__p6KeyController = new AbortController();
    window.__p6KeyEvents = [];
    document.addEventListener('keydown', e => {
      if (['Tab','Escape'].includes(e.key)) window.__p6KeyEvents.push({key:e.key, shift:e.shiftKey, prevented:e.defaultPrevented});
    }, { signal: window.__p6KeyController.signal });
  });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Escape');
  Object.assign(keys, await page.evaluate(() => window.__p6KeyEvents));
  check(`cycle ${cycle} actual Tab/ShiftTab/Escape prevented`, keys, x => JSON.stringify(x) === JSON.stringify([{key:'Tab',shift:false,prevented:true},{key:'Tab',shift:true,prevented:true},{key:'Escape',shift:false,prevented:true}]));
  const afterKeys = await pageState(page);
  check(`cycle ${cycle} modal remains and focus stays inside during busy`, afterKeys, x => x.fileDisplay==='flex' && x.active==='modal-approve-file');
  await page.locator('#btn-file-done').waitFor({ state: 'visible', timeout: 2000 });
  check(`cycle ${cycle} completion active focus`, await page.evaluate(() => document.activeElement?.id), 'btn-file-done');
  check(`cycle ${cycle} completion text`, await page.locator('#modal-file-body').textContent(), '실적 승인 완료 — 51건의 실적을 승인하고 품의 이력에 반영했습니다.');
  await page.screenshot({ path: `${prefix}-cycle${cycle}-complete.png`, fullPage: false });
  await page.keyboard.press('Enter');
  const closed = await pageState(page);
  check(`cycle ${cycle} close returns opener focus`, closed.active, 'btn-approve-file');
  check(`cycle ${cycle} completed sample and 77`, closed, x => x.r2==='승인' && x.r5==='승인' && x.r7==='승인' && /77/.test(x.chip) && x.badge==='77' && x.live==='실적 승인 완료 — 51건의 실적을 승인하고 품의 이력에 반영했습니다.');
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const url = pathToFileURL(target).href;
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    // Basic roving-grid keyboard behavior before the A-1 scenario.
    await page.locator('#p6-row-2').focus();
    await page.keyboard.press('ArrowDown');
    check('grid ArrowDown roves selection', await page.evaluate(() => document.activeElement?.id || document.activeElement?.querySelector('td[data-col="emp"]')?.textContent.trim()), x => x !== 'p6-row-2');
    await page.keyboard.press('ArrowUp');
    check('grid ArrowUp restores row 2', await page.evaluate(() => document.activeElement?.id), 'p6-row-2');
    await page.keyboard.press('Space');
    check('grid Space deselects selected row', await page.locator('#p6-row-2').getAttribute('aria-selected'), 'false');
    await page.keyboard.press('Space');
    check('grid Space reselects row 2', await page.locator('#p6-row-2').getAttribute('aria-selected'), 'true');
    await selectDetails(page, '#p6-row-2');
    await approveSelectedByKeyboard(page, '실적 1건을 승인합니다 — 10034 이수빈 · 2025-05-28 · 연장');
    let state = await pageState(page);
    check('A1 first approval row2/count/live/focus next pending', state, x => x.r2==='승인' && /127/.test(x.chip) && x.badge==='127' && x.live==='1건이 승인되었습니다. 대기 실적 127건.' && x.active==='p6-row-5');
    await selectDetails(page, '#p6-row-5');
    await approveSelectedByKeyboard(page, '실적 1건을 승인합니다 — 10009 정민수 · 2025-05-05 · 법정휴일');
    state = await pageState(page);
    check('A1 second approval row5/count/live/focus next pending', state, x => x.r5==='승인' && /126/.test(x.chip) && x.badge==='126' && x.live==='1건이 승인되었습니다. 대기 실적 126건.' && x.active==='p6-row-7');
    await page.locator('#p6-row-2').focus(); await page.keyboard.press('Space');
    const beforeLock = await pageState(page);
    await page.locator('#btn-approve-single').click({ force: true, timeout: 3000 });
    await page.locator('#btn-approve-single').focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Space');
    const afterLock = await pageState(page);
    check('A1 duplicate lock click/Enter/Space leaves 126 and modal closed', {beforeLock, afterLock}, x => /126/.test(x.afterLock.chip) && x.afterLock.badge==='126' && x.afterLock.fileDisplay==='none' && x.afterLock.r2==='승인');
    await page.screenshot({ path: `${prefix}-a1-final.png`, fullPage: false });
    await page.close();
    const p2 = await context.newPage();
    await p2.goto(url, { waitUntil: 'domcontentloaded' });
    await oneFileCycle(p2, 1);
    await oneFileCycle(p2, 2);
    await p2.close();
  } catch (err) {
    out.push({ fatal: String(err), stack: err.stack }); fail.push('fatal');
  } finally {
    await browser.close();
  }
  const result = { target, url, timestamp: new Date().toISOString(), viewport:'1440x900', tool:'Node Playwright local package; Chromium headless', pass: fail.length===0, failures: fail, checks: out };
  fs.writeFileSync(`${prefix}-results.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = fail.length ? 1 : 0;
})();
