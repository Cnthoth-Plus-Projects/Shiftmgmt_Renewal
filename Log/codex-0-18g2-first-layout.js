const { chromium } = require('C:/Projects/Active/ShiftMgmt_V3.4/node_modules/playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');

const root = 'C:/Projects/Active/교대근무관리 시스템/시안/2026-08-31-1차HTML';
const round = value => Math.round(value * 100) / 100;
const files = ['08-performance-1.html', '08-performance-2.html', '08-performance-3.html', '08-performance-4.html'];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const results = [];
  for (const file of files) {
    const page = await context.newPage();
    await page.goto(pathToFileURL(path.join(root, file)).href, { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(file => {
      const round = value => Math.round(value * 100) / 100;
      const metric = element => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { width: round(rect.width), height: round(rect.height), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
      };
      const all = selector => Array.from(document.querySelectorAll(selector));
      const data = {
        file,
        main: metric(document.querySelector('main')),
        toolbars: all('.toolbar-bar').map(metric),
        searches: all('.filter-input').map(element => ({ width: round(element.getBoundingClientRect().width), cssWidth: getComputedStyle(element).width })),
        rowHeights: all('tbody tr').map(element => round(element.getBoundingClientRect().height)),
        cards: all('.card-grid-2col > .card').map(metric)
      };
      if (file === '08-performance-2.html') {
        const table = document.querySelector('.compare-table');
        const wrapper = table && table.parentElement;
        if (wrapper) {
          wrapper.scrollLeft = wrapper.scrollWidth;
          const last = table.querySelector('tr th:last-child, tr td:last-child');
          data.p5 = { wrapper: metric(wrapper), scrollLeft: wrapper.scrollLeft, lastRight: round(last.getBoundingClientRect().right), wrapperRight: round(wrapper.getBoundingClientRect().right) };
        }
      }
      return data;
    }, file);
    results.push(result);
    await page.close();
  }
  await browser.close();
  const output = { timestamp: new Date().toISOString(), viewport: '1440x900', tool: 'local Node Playwright Chromium', results };
  fs.writeFileSync('C:/Projects/Active/교대근무관리 시스템/Log/codex-0-18g2-first-layout-results.json', JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
})();
