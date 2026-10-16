import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');
const fault = process.env.SOL_REVIEW_FAULT;
const eventFile = process.env.SOL_REVIEW_EVENTS;
const event = (type, data = {}) => fs.appendFileSync(eventFile, JSON.stringify({time: new Date().toISOString(), pid: process.pid, fault, type, ...data}) + '\n');

if (fault === 'owner-manifest-write') {
  const original = fs.writeFileSync.bind(fs);
  fs.writeFileSync = (file, ...args) => {
    if (String(file).endsWith('owner-final.json')) {
      event('owner-manifest-write-rejected', {path: String(file)});
      throw new Error('SOL_INJECTED_OWNER_MANIFEST_WRITE_FAILURE');
    }
    return original(file, ...args);
  };
}

if (fault === 'no-cookie-500') {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/api/access-logs:list') && !options?.headers?.Cookie) {
      event('no-cookie-response-replaced', {url: String(url), status: 500, errorCode: 'SOL_UNRELATED_SERVER_FAILURE'});
      return new Response(JSON.stringify({ok:false,errorCode:'SOL_UNRELATED_SERVER_FAILURE',message:'검수용 서버 오류'}), {status:500, headers:{'Content-Type':'application/json'}});
    }
    return original(url, options);
  };
}

const originalLaunch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const browser = await originalLaunch(...args);
  const originalNewContext = browser.newContext.bind(browser);
  browser.newContext = async (...contextArgs) => {
    const context = await originalNewContext(...contextArgs);
    const originalNewPage = context.newPage.bind(context);
    context.newPage = async (...pageArgs) => {
      const page = await originalNewPage(...pageArgs);
      page.on('console', message => {
        if (message.text().startsWith('SOL_OBSERVED:')) {
          event('browser-observation', {observation: JSON.parse(message.text().slice(13))});
        }
      });
      return page;
    };
    if (fault === 'negative-context-close') {
      const originalClose = context.close.bind(context);
      context.close = async (...closeArgs) => {
        await originalClose(...closeArgs);
        event('context-close-error', {message:'SOL_INJECTED_CONTEXT_CLOSE_FAILURE', resourcesActuallyClosed:true});
        throw new Error('SOL_INJECTED_CONTEXT_CLOSE_FAILURE');
      };
    }
    if (['date-90x24', 'date-tolerance', 'list-values', 'unexpected-console-401'].includes(fault)) {
      await context.addInitScript(selectedFault => {
        const reported = new Set();
        const report = (type, data) => {
          if (!reported.has(type)) {
            reported.add(type);
            console.log('SOL_OBSERVED:' + JSON.stringify({type, ...data}));
          }
        };
        if (selectedFault === 'unexpected-console-401') {
          window.addEventListener('DOMContentLoaded', () => {
            console.error('SOL_UNEXPECTED_UNRELATED_CONSOLE_ERROR_401');
            report('unexpected-console-401', {message:'SOL_UNEXPECTED_UNRELATED_CONSOLE_ERROR_401'});
          }, {once:true});
          return;
        }
        const apply = () => {
          const table = document.querySelector('#table-access-logs');
          if (!table) return;
          if (selectedFault === 'date-90x24' || selectedFault === 'date-tolerance') {
            const input = document.querySelector('#filter-date-from');
            const width = selectedFault === 'date-90x24' ? '90px' : '133.5px';
            const height = selectedFault === 'date-90x24' ? '24px' : '34px';
            for (const [key, value] of [['width',width],['height',height],['min-width',width],['min-height',height],['box-sizing','border-box']]) {
              if (input.style.getPropertyValue(key) !== value) input.style.setProperty(key,value,'important');
            }
            const rect = input.getBoundingClientRect();
            report(selectedFault, {width:rect.width,height:rect.height,tableName:table.getAttribute('aria-label')});
          } else {
            const body = document.querySelector('#table-access-logs-body');
            const first = body?.firstElementChild;
            if (first?.id === 'log-row-log-record-1' && first.nextElementSibling?.id === 'log-row-log-record-2') body.insertBefore(first.nextElementSibling,first);
            if (body?.firstElementChild?.id === 'log-row-log-record-2') report('row-order', {firstIds:Array.from(body.children).slice(0,3).map(row=>row.id)});
            const label = document.querySelector('#access-history-count-label');
            const wrongLabel = '전체 999건 중 999건 표시';
            if (label && label.textContent !== wrongLabel) label.textContent = wrongLabel;
            if (label) report('count-label', {actual:label.textContent,expectedTotal:201});
            const cell = document.querySelector('#log-row-log-record-1 td:nth-child(5)');
            if (cell && cell.getAttribute('title') !== '상세 활동 내용') cell.setAttribute('title','상세 활동 내용');
            if (cell) report('truncated-title', {actual:cell.getAttribute('title')});
            const badge = document.querySelector('#log-row-log-record-1 .access-history-badge');
            if (badge && badge.style.getPropertyValue('color') !== 'rgb(255, 0, 255)') badge.style.setProperty('color','rgb(255, 0, 255)','important');
            if (badge) report('badge-color', {actual:getComputedStyle(badge).color,className:badge.className});
          }
        };
        window.addEventListener('DOMContentLoaded', () => {
          new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true,attributes:true});
          apply();
        },{once:true});
      }, fault);
    }
    return context;
  };
  return browser;
};
