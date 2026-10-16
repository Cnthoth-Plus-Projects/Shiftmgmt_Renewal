// favicon 404 재현 — 설치된 크롬(channel "chrome")으로 /a(아이콘 선언 없음) · /b(<link rel="icon" href="data:,">)를 열고
// 서버 요청 경로 · 콘솔 오류 · 400 이상 응답을 기록한다. Playwright는 원본 저장소 node_modules(읽기만)에서 빌린다.
const http = require("http");
const { createRequire } = require("module");
const req = createRequire("C:/Projects/Active/ShiftMgmt_V3.4/package.json");
const { chromium } = req("playwright");

const html = (icon) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>t</title>${icon}</head><body><p id="health">서버 연결 확인 중…</p></body></html>`;
let log = [];
const server = http.createServer((rq, rs) => {
  log.push(rq.url);
  if (rq.url === "/a") { rs.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return rs.end(html("")); }
  if (rq.url === "/b") { rs.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return rs.end(html('<link rel="icon" href="data:,">')); }
  rs.writeHead(404, { "content-type": "application/json" }); rs.end('{"ok":false,"errorCode":"NOT_FOUND","message":"없음"}');
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const out = {};
  for (const headless of [true, false]) {
    const browser = await chromium.launch({ channel: "chrome", headless });
    const version = browser.version();
    for (const path of ["/a", "/b"]) {
      log = [];
      const page = await browser.newPage();
      const consoleErrors = [], bad = [];
      page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
      page.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${new URL(r.url()).pathname}`); });
      await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: "load" });
      await page.waitForTimeout(1500);
      await page.close();
      out[`${headless ? "headless" : "headed"}${path}`] = { chrome: version, serverRequests: [...log], consoleErrors, responses400: bad };
    }
    await browser.close();
  }
  server.close();
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
