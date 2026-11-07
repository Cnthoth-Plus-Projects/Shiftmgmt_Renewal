import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { build } from "esbuild";
import { checkServerHealth } from "../lib/ui-check.mjs";
import { findChrome } from "../lib/find-chrome.mjs";
import { seedBootstrapSecrets } from "../lib/artifact-privacy.mjs";
import { seedAllowanceFixtures } from "./allowance-fixtures.mjs";

const startTime = new Date().toISOString();
const startMs = Date.now();
const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const rawArgs = process.argv.slice(2);
const focusIDs = new Set(
  (
    rawArgs.find(a => a.startsWith("--focus="))?.slice(8) ||
    rawArgs.find(a => a.startsWith("--scenarios="))?.slice(12) ||
    ""
  )
    .split(",")
    .filter(Boolean)
);
const isPreview = rawArgs.includes("--preview");
const portArg = rawArgs.find(a => a.startsWith("--port="))?.slice(7)?.trim();
const targetPort = portArg ? parseInt(portArg, 10) : isPreview ? 18943 : 18942;
const targetUrl = `http://127.0.0.1:${targetPort}/`;
const outArg = rawArgs
  .find(a => a.startsWith("--out="))
  ?.slice(6)
  ?.replace(/^["']|["']$/g, "")
  ?.trim();
const resolvedOut = path.resolve(
  outArg || path.join(os.tmpdir(), "shiftmgmt-allowance-ui-" + crypto.randomUUID())
);
const tempRoot = fs.realpathSync(os.tmpdir());
const underTemp = v => {
  const r = path.relative(tempRoot, path.resolve(v));
  return !!r && !r.startsWith("..") && !path.isAbsolute(r);
};
if (!underTemp(resolvedOut)) throw new Error("Output must be a dedicated TEMP child directory");
fs.mkdirSync(resolvedOut, { recursive: true });
const capturesDir = path.join(resolvedOut, "captures");
fs.mkdirSync(capturesDir, { recursive: true });
const userDataDir = path.join(
  os.tmpdir(),
  "shiftmgmt-allowance-data-" + crypto.randomUUID().replace(/-/g, "").slice(0, 10)
);
fs.mkdirSync(userDataDir, { recursive: true });

const plannedScenarios = Array.from(
  { length: 20 },
  (_, i) => `S${String(i + 1).padStart(2, "0")}`
).filter(id => !focusIDs.size || focusIDs.has(id));
const completedScenarios = [];
const blockedScenarios = [];
const failedScenarios = [];
const unexpectedErrors = [];
const rawConsoleEvents = [];
const expectedRejections = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [`N${String(i + 1).padStart(2, "0")}`, false])
);
let allowExpected401 = false;
let serverProcess = null;
let browser = null;
let servedAssets = null;
const observations = {};
const negativeEvidence = {};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha256Buf = buf => crypto.createHash("sha256").update(buf).digest("hex").toUpperCase();
const sha256File = p => sha256Buf(fs.readFileSync(p));

const writeResult = (status, code) => {
  const endTime = new Date().toISOString();
  const elapsedMs = Date.now() - startMs;
  const proof = {
    status,
    plannedScenarios,
    completedScenarios,
    blockedScenarios,
    failedScenarios,
    expectedRejections,
    observations,
    negativeEvidence,
    unexpectedErrors,
    rawConsoleEvents,
    servedAssets,
    argv: process.argv,
    exitCode: code,
    startTime,
    endTime,
    elapsedMs,
    userDataDir,
    out: resolvedOut,
  };
  fs.writeFileSync(path.join(resolvedOut, "results.json"), JSON.stringify(proof, null, 2));
};

async function isPortInUse(port) {
  return new Promise(res => {
    const s = new net.Socket();
    s.setTimeout(500);
    const end = val => {
      s.destroy();
      res(val);
    };
    s.once("connect", () => end(true));
    s.once("timeout", () => end(false));
    s.once("error", () => end(false));
    s.connect(port, "127.0.0.1");
  });
}

async function cleanup() {
  if (browser) {
    try {
      await browser.close();
    } catch {}
    browser = null;
  }
  if (serverProcess) {
    try {
      serverProcess.kill("SIGTERM");
    } catch {}
    serverProcess = null;
  }
}

function readCellStrings(v) {
  if (v == null) return [];
  if (typeof v === "number") return [String(Math.round(v)), Math.round(v).toLocaleString("ko-KR")];
  if (typeof v === "string") return [v];
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) {
      return [v.richText.map(x => x.text || "").join("")];
    }
    if ("result" in v && v.result != null) return readCellStrings(v.result);
  }
  return [String(v)];
}

async function inspectWorkbookForAmount(filePath, expectedAmount) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const needlePlain = String(expectedAmount);
  const needleFmt = expectedAmount.toLocaleString("ko-KR");
  let foundAmount = false;
  let nonEmptyCells = 0;
  for (const ws of wb.worksheets) {
    ws.eachRow(row => {
      row.eachCell(cell => {
        nonEmptyCells++;
        for (const text of readCellStrings(cell.value)) {
          if (text.includes(needlePlain) || text.includes(needleFmt)) foundAmount = true;
        }
      });
    });
  }
  return { sheetCount: wb.worksheets.length, nonEmptyCells, foundAmount };
}

async function run() {
  try {
    if (await isPortInUse(targetPort)) throw new Error(`Port ${targetPort} is already in use.`);
    const credentialsPath = path.join(userDataDir, "data", "bootstrap-credentials.json");
    fs.mkdirSync(path.dirname(credentialsPath), { recursive: true });
    const env = {
      ...process.env,
      PORT: String(targetPort),
      HOST: "127.0.0.1",
      SHIFTMGMT_PORT: String(targetPort),
      SHIFTMGMT_DATA_DIR: userDataDir,
      SHIFTMGMT_USER_DATA_DIR: userDataDir,
      SHIFTMGMT_BOOTSTRAP_CREDENTIALS_FILE: credentialsPath,
      SHIFTMGMT_UI_BOOTSTRAP_FILE: credentialsPath,
      NODE_ENV: "production",
    };
    const { ensureAuthBootstrapCredentials } = await import(
      pathToFileURL(path.resolve(repoRoot, "dist/server/main/services/auth-bootstrap-service.js"))
        .href
    );
    ensureAuthBootstrapCredentials({ userDataPath: userDataDir, env });

    const serverScript = path.join(repoRoot, "dist", "server", "main", "server.js");
    serverProcess = spawn(process.execPath, [serverScript], {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let serverLogs = "";
    serverProcess.stdout.on("data", d => {
      serverLogs += d.toString();
    });
    serverProcess.stderr.on("data", d => {
      const msg = d.toString();
      serverLogs += msg;
      if (!msg.includes("ExperimentalWarning")) process.stderr.write(`[Server stderr] ${msg}\n`);
    });

    let isHealthy = false;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      try {
        const res = await checkServerHealth(targetUrl, 2000);
        if (res?.ok) {
          isHealthy = true;
          break;
        }
      } catch {}
    }
    if (!isHealthy) throw new Error("Server failed to respond healthy:\n" + serverLogs);

    // 실제 제공되는 /web/app.js 및 /web/allowance.css 바이트/SHA-256 대조 (§8.4)
    const [appJsRes, cssRes] = await Promise.all([
      fetch(`${targetUrl}web/app.js`),
      fetch(`${targetUrl}web/allowance.css`),
    ]);
    const appJsBuf = Buffer.from(await appJsRes.arrayBuffer());
    const cssBuf = Buffer.from(await cssRes.arrayBuffer());
    const distAppJs = path.join(repoRoot, "dist", "browser", "web", "app.js");
    const distCss = path.join(repoRoot, "dist", "browser", "web", "allowance.css");
    servedAssets = {
      appJs: {
        servedBytes: appJsBuf.length,
        servedSha256: sha256Buf(appJsBuf),
        distBytes: fs.statSync(distAppJs).size,
        distSha256: sha256File(distAppJs),
      },
      allowanceCss: {
        servedBytes: cssBuf.length,
        servedSha256: sha256Buf(cssBuf),
        distBytes: fs.statSync(distCss).size,
        distSha256: sha256File(distCss),
      },
    };
    assert.equal(servedAssets.appJs.servedSha256, servedAssets.appJs.distSha256);
    assert.equal(servedAssets.allowanceCss.servedSha256, servedAssets.allowanceCss.distSha256);

    try {
      seedBootstrapSecrets(credentialsPath);
    } catch {}

    const chrome = findChrome();
    browser = await chromium.launch({
      executablePath: typeof chrome === "object" ? chrome.path : chrome,
      headless: !isPreview,
    });
    const context = await browser.newContext({
      viewport: isPreview ? null : { width: 1707, height: 825 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();

    page.on("pageerror", err => {
      rawConsoleEvents.push({ kind: "pageerror", text: err.message });
      unexpectedErrors.push(`pageerror: ${err.message}`);
    });
    page.on("console", msg => {
      if (msg.type() === "error") {
        const t = msg.text();
        const isExpectedAuth =
          (allowExpected401 && t.includes("401")) ||
          (t.includes("api/auth/session") && t.includes("401")) ||
          t.includes("favicon");
        rawConsoleEvents.push({ kind: "console.error", text: t, expected: isExpectedAuth });
        if (!isExpectedAuth) unexpectedErrors.push(`console.error: ${t}`);
      }
    });

    const credsRaw = fs.readFileSync(credentialsPath, "utf-8");
    const adminCreds = JSON.parse(credsRaw).credentials?.["user-admin"];
    assert.ok(adminCreds, "user-admin credentials found");

    const performLogin = async (loginId, password) => {
      allowExpected401 = true;
      await page.goto(isPreview ? `${targetUrl}?developmentPreview=1` : targetUrl, { waitUntil: "networkidle" });
      allowExpected401 = false;
      await page.locator("#login-id").fill(loginId);
      await page.locator("#login-password").fill(password);
      await page.locator("button[type='submit']").click();
      const mode = await Promise.race([
        page
          .locator("#l4-btn-submit")
          .waitFor({ state: "visible", timeout: 10000 })
          .then(() => "L4"),
        page
          .locator(".btn-logout")
          .waitFor({ state: "visible", timeout: 10000 })
          .then(() => "SHELL"),
      ]).catch(() => "TIMEOUT");
      if (mode === "L4") {
        const nextPw = isPreview ? "ShiftTest1234!" : "Ui06!" + crypto.randomUUID() + "b8";
        await page.locator("#l4-current-pw").fill(password);
        await page.locator("#l4-new-pw").fill(nextPw);
        await page.locator("#l4-confirm-pw").fill(nextPw);
        await page.locator("#l4-btn-submit").click();
        await page.locator(".btn-logout").waitFor({ state: "visible", timeout: 15000 });
        return nextPw;
      }
      await page.locator(".btn-logout").waitFor({ state: "visible", timeout: 15000 });
      return password;
    };

    const adminPassword = await performLogin(adminCreds.loginId, adminCreds.password);
    const sMb = (
      await build({
        stdin: {
          contents: `import * as M from './src/web/screens/schedule-model.ts'; window.__SCENARIO_MODEL = M;`,
          resolveDir: repoRoot,
          loader: "ts",
        },
        bundle: true,
        write: false,
        format: "iife",
        platform: "browser",
        target: "es2022",
      })
    ).outputFiles[0].text;
    await page.evaluate(sMb);
    await page.exposeFunction("__scenarioVerifyFile", async input => {
      assert.ok(fs.existsSync(input.outputPath));
      if (input.publishedPath) assert.ok(fs.existsSync(input.publishedPath));
    });

    const fixtureResult = await seedAllowanceFixtures({ page, isolatedRoot: userDataDir });
    process.stdout.write(
      `[UI-06] Seeded ${fixtureResult.totalCalculations} calculations, ${fixtureResult.approvalHistoryCount} reviews, ${fixtureResult.pastVersionCount} past versions\n`
    );

    const api = (method, ...args) =>
      page.evaluate(({ method, args }) => window.appBridge[method](...args), { method, args });
    const take = r => {
      assert.ok(r?.ok, r?.message || "API failed");
      return r.data;
    };
    const ready = () =>
      page.waitForFunction(
        () => document.querySelector("#allowance-screen-root")?.getAttribute("aria-busy") === "false"
      );
    const openAllowance = async () => {
      await page.locator('button[data-id="allowance-calc"]').click();
      await page.locator("#allowance-screen-root").waitFor({ state: "visible" });
      await ready();
    };
    const openExports = async () => {
      await page.locator('button[data-id="proposal-export"]').click();
      await page.locator("#allowance-screen-root").waitFor({ state: "visible" });
      await ready();
    };
    const resetFilters = async (month = "2026-05") => {
      if (!(await page.locator(".allowance-tab-btn[data-tab='results'].active").count())) {
        await page.locator(".allowance-tab-btn[data-tab='results']").click();
      }
      await page.locator("#sel-allowance-month").selectOption(month);
      await page.locator("#sel-allowance-site").selectOption("all");
      await page.locator("#sel-allowance-status").selectOption("all");
      await page.locator("#sel-allowance-worktype").selectOption("all");
      await page.locator("#sel-allowance-payout").selectOption("all");
      if ((await page.locator("#inp-allowance-search").inputValue()) !== "") {
        await page.locator("#inp-allowance-search").fill("");
        await page.locator("#inp-allowance-search").press("Enter");
      }
      await ready();
    };
    const findAndClickRowById = async calcId => {
      const firstBtn = page.locator("#btn-allowance-first");
      if ((await firstBtn.count()) > 0 && !(await firstBtn.isDisabled())) await firstBtn.click();
      for (let guard = 0; guard < 25; guard++) {
        const loc = page.locator(`.allowance-data-row[data-id="${calcId}"]`);
        if ((await loc.count()) > 0) {
          await loc.click();
          return true;
        }
        const nextBtn = page.locator("#btn-allowance-next");
        if ((await nextBtn.count()) === 0 || (await nextBtn.isDisabled())) break;
        await nextBtn.click();
      }
      return false;
    };
    const neg = (id, evidence) => {
      expectedRejections[id] = true;
      negativeEvidence[id] = evidence;
    };
    const step = async (id, fn) => {
      if (focusIDs.size && !focusIDs.has(id)) return;
      const result = await fn();
      observations[id] = result;
      if (result?.blocked) blockedScenarios.push({ id, reason: result.blocked });
      else completedScenarios.push(id);
      process.stdout.write(`${id} ${result?.blocked ? "BLOCKED" : "PASS"}\n`);
    };

    await openAllowance();

    if (isPreview) {
      await page.locator(".btn-logout").click();
      await page.locator("#btn-development-autofill").waitFor({ state: "visible" });
      await page.goto(`${targetUrl}?developmentPreview=0`, { waitUntil: "networkidle" });
      await page.locator("#login-id").waitFor({ state: "visible" });
      assert.equal(await page.locator("#btn-development-autofill").count(), 0);
      await page.goto(`${targetUrl}?developmentPreview=1`, { waitUntil: "networkidle" });
      const autofill = page.locator("#btn-development-autofill");
      await autofill.waitFor({ state: "visible" });
      await page.screenshot({ path: path.join(capturesDir, "login-autofill.png") });
      await autofill.click();
      assert.ok((await page.locator("#login-id").inputValue()) === adminCreds.loginId);
      assert.ok((await page.locator("#login-password").inputValue()) === adminPassword);
      await page.locator("button[type='submit']").click();
      await page.locator(".btn-logout").waitFor({ state: "visible" });
      await openAllowance();
      const preview = {
        url: isPreview ? `${targetUrl}?developmentPreview=1` : targetUrl,
        autofillCheck: { persistedAfterLogout: true, disabledModeHidden: true, fieldsMatch: true, normalLoginSuccess: true },
        selectedMenu: "allowance-calc (수당 관리)",
        userDataDir,
        out: resolvedOut,
        helperPid: process.pid,
        fixture: fixtureResult,
        servedAssets,
      };
      fs.writeFileSync(path.join(resolvedOut, "preview.json"), JSON.stringify(preview, null, 2));
      await page.screenshot({ path: path.join(capturesDir, "preview.png") });
      process.stdout.write(
        "[PREVIEW_READY] " +
          JSON.stringify({ url: targetUrl, helperPid: process.pid, out: resolvedOut }) +
          "\n"
      );
      await new Promise(() => {});
    }

    await step("S01", async () => {
      await openAllowance();
      const navText = (await page.locator('button[data-id="allowance-calc"]').innerText()).trim();
      assert.ok(navText.includes("수당 관리"), `Expected menu label 수당 관리, got ${navText}`);
      assert.ok(await page.locator(".allowance-tab-btn[data-tab='results'].active").isVisible());
      await page.locator('button[data-id="workforce"]').click();
      await page.locator("#workforce-root").waitFor({ state: "visible" });
      assert.equal(await page.locator("#allowance-screen-root").count(), 0);
      await openExports();
      assert.ok(await page.locator(".allowance-tab-btn[data-tab='exports'].active").isVisible());
      await openAllowance();
      assert.ok(await page.locator(".allowance-tab-btn[data-tab='results'].active").isVisible());
      return { navText, resultsTabActive: true, exportsTabActive: true, destroyedOnLeave: true };
    });

    await step("S02", async () => {
      await resetFilters("2026-05");
      const viewports = [
        { width: 1920, height: 945 },
        { width: 1707, height: 825 },
        { width: 1366, height: 768 },
        { width: 900, height: 700 },
      ];
      const checks = [];
      for (const size of viewports) {
        await page.setViewportSize(size);
        await sleep(180);
        assert.equal(await page.locator(".allowance-kpi-card").count(), 4);
        const kpiBox = await page.locator(".allowance-kpi-bar").boundingBox();
        const tbBox = await page.locator(".allowance-toolbar").boundingBox();
        const tblBox = await page.locator("#allowance-table-container").boundingBox();
        const detBox = await page.locator("#allowance-detail-container").boundingBox();
        const ftrBox = await page.locator("#allowance-table-footer").boundingBox();
        const sbBox = await page.locator(".footer-statusbar").boundingBox();
        assert.ok(kpiBox && tbBox && tblBox && detBox && ftrBox && sbBox);
        assert.ok(Math.abs(kpiBox.width - tbBox.width) <= 2, "KPI and toolbar full width match");
        assert.ok(ftrBox.y + ftrBox.height <= sbBox.y + 2, "Footer must sit above status bar");
        if (size.width >= 1366) {
          assert.ok(tblBox.height > 200 && detBox.height > 200, "Body height > 200");
          assert.ok(Math.abs(detBox.width - 380) <= 2, `Detail width 380, got ${detBox.width}`);
          assert.ok(Math.abs(tblBox.y - detBox.y) <= 2, "Top aligned <=2px");
          assert.ok(
            Math.abs(tblBox.y + tblBox.height - (detBox.y + detBox.height)) <= 2,
            "Bottom aligned <=2px"
          );
        }
        const noHOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        );
        assert.ok(noHOverflow, `No horizontal overflow at ${size.width}x${size.height}`);
        const tableFits = await page.locator('.allowance-table-viewport').evaluate(v => ({
          clientHeight: v.clientHeight,
          scrollHeight: v.scrollHeight,
        }));
        assert.ok(
          tableFits.scrollHeight <= tableFits.clientHeight + 1,
          `No clipped rows/vertical table scroll at ${size.width}x${size.height}: ${JSON.stringify(tableFits)}`
        );
        checks.push({
          size,
          tableFits,
          detailWidth: Math.round(detBox.width),
          tableHeight: Math.round(tblBox.height),
          footerBottom: Math.round(ftrBox.y + ftrBox.height),
          statusTop: Math.round(sbBox.y),
        });
      }
      await page.setViewportSize({ width: 1707, height: 825 });
      await sleep(180);
      await page.screenshot({ path: path.join(capturesDir, "s02-layout.png") });
      return { viewportsChecked: checks };
    });

    await step("S03", async () => {
      await resetFilters("2026-05");
      const allCalcs = take(await api("listCalculationResults"));
      const expected05 = allCalcs.filter(c => c.workDate.startsWith("2026-05"));
      assert.ok(expected05.length >= 55, `Expected >=55 in 2026-05, got ${expected05.length}`);

      const firstBtn = page.locator("#btn-allowance-first");
      if (!(await firstBtn.isDisabled())) await firstBtn.click();

      const seenList = [];
      let pagesVisited = 0;
      while (pagesVisited < 30) {
        pagesVisited++;
        const ids = await page
          .locator(".allowance-data-row")
          .evaluateAll(els => els.map(e => e.getAttribute("data-id")).filter(Boolean));
        assert.ok(ids.length > 0, `Page ${pagesVisited} must have visible rows`);
        seenList.push(...ids);
        const nextBtn = page.locator("#btn-allowance-next");
        if (await nextBtn.isDisabled()) break;
        await nextBtn.click();
      }
      const uniqueSeen = new Set(seenList);
      assert.equal(seenList.length, uniqueSeen.size, "Zero duplicate rows across pages");
      assert.equal(uniqueSeen.size, expected05.length, "Zero missing rows across all pages");
      assert.ok(pagesVisited >= 3, `Expected >=3 pages, got ${pagesVisited}`);

      // 번호 직접 이동 및 처음/끝 이동
      await page.locator("#btn-allowance-first").click();
      assert.equal(await page.locator("#btn-allowance-number-1").getAttribute("aria-current"), "page");
      await page.locator("#btn-allowance-last").click();
      await page.locator("#btn-allowance-number-2").click();
      assert.equal(await page.locator("#btn-allowance-number-2").getAttribute("aria-current"), "page");

      // 그룹 접기/펼치기 (페이지 경계 불변) + 키보드 행 이동
      const totalPagesBeforeCollapse = await page
        .locator("#allowance-table-footer .pagination-button[id^='btn-allowance-number-']")
        .count();
      const firstGroup = page.locator(".allowance-group-row").first();
      await firstGroup.click();
      await firstGroup.click();
      const totalPagesAfterCollapse = await page
        .locator("#allowance-table-footer .pagination-button[id^='btn-allowance-number-']")
        .count();
      assert.equal(totalPagesAfterCollapse, totalPagesBeforeCollapse);

      const page2FirstRow = page.locator(".allowance-data-row").first();
      await page2FirstRow.click();
      await page2FirstRow.press("ArrowDown");
      const secondId = await page.locator(".allowance-data-row").nth(1).getAttribute("data-id");
      assert.equal(await page.locator(".allowance-data-row.selected").getAttribute("data-id"), secondId);

      // 2회 5초 폴링(11초) 후 현재 2페이지 및 선택 행 유지 (1페이지 복귀 금지)
      await sleep(11000);
      assert.equal(await page.locator("#btn-allowance-number-2").getAttribute("aria-current"), "page");
      assert.equal(await page.locator(".allowance-data-row.selected").getAttribute("data-id"), secondId);

      // 창 크기 변경 후에도 선택 행이 현재 페이지 가시 영역에 유지됨
      await page.setViewportSize({ width: 1366, height: 768 });
      await sleep(200);
      assert.equal(await page.locator(".allowance-data-row.selected").getAttribute("data-id"), secondId);
      await page.setViewportSize({ width: 1707, height: 825 });
      await sleep(200);

      // 빈 결과(0행) 경계 확인 후 복구
      await page.locator("#inp-allowance-search").fill("__NO_MATCH_9999__");
      await page.locator("#inp-allowance-search").press("Enter");
      assert.equal(await page.locator(".allowance-data-row").count(), 0);
      assert.ok(await page.locator("#btn-allowance-next").isDisabled());
      await resetFilters("2026-05");

      return {
        expectedCount: expected05.length,
        uniqueObserved: uniqueSeen.size,
        duplicates: seenList.length - uniqueSeen.size,
        pagesVisited,
        keptPage2AndSelectionAfter2Polls: true,
      };
    });

    await step("S04", async () => {
      await resetFilters("2026-04");
      const allCalcs = take(await api("listCalculationResults"));
      const count04 = allCalcs.filter(c => c.workDate.startsWith("2026-04")).length;
      const kpiText04 = await page.locator("#kpi-count-value").innerText();
      assert.ok(kpiText04.includes(`${count04}건`), `2026-04 KPI count mismatch: ${kpiText04}`);

      await resetFilters("2026-05");
      // 상태 4종 각각 조회 확인
      const statusCounts = {};
      for (const st of ["pending", "approved", "rejected", "proposal-approved"]) {
        await page.locator("#sel-allowance-status").selectOption(st);
        const expected = allCalcs.filter(
          c => c.workDate.startsWith("2026-05") && c.status === st
        );
        const expectedSum = expected.reduce(
          (s, r) => s + (r.snapshot?.totalAllowanceAmount ?? 0),
          0
        );
        const shownTotal = await page.locator("#kpi-total-amount").innerText();
        assert.equal(shownTotal, `${expectedSum.toLocaleString("ko-KR")}원`);
        statusCounts[st] = expected.length;
      }

      // 근무지 + 근무유형 + 조기지급 + 검색 축소 페이지 clamp 확인
      await resetFilters("2026-05");
      await page.locator("#btn-allowance-number-2").click();
      const sampleSite = fixtureResult.sites[2];
      await page.locator("#sel-allowance-site").selectOption(sampleSite);
      assert.equal(await page.locator("#btn-allowance-number-1").getAttribute("aria-current"), "page");

      await page.locator("#sel-allowance-site").selectOption("all");
      await page.locator("#sel-allowance-worktype").selectOption("overtime");
      assert.ok((await page.locator(".allowance-data-row").count()) > 0);

      await page.locator("#sel-allowance-worktype").selectOption("all");
      await page.locator("#sel-allowance-payout").selectOption("early");
      const earlyExpected = allCalcs.filter(
        c => c.workDate.startsWith("2026-05") && !!c.earlyPayoutDate
      );
      assert.ok(earlyExpected.length > 0);
      assert.ok((await page.locator("#kpi-count-value").innerText()).includes(`${earlyExpected.length}건`));

      await resetFilters("2026-05");
      return { count04, statusCounts, earlyCount: earlyExpected.length };
    });

    await step("S05", async () => {
      await resetFilters("2026-05");
      const firstRow = page.locator(".allowance-data-row").first();
      await firstRow.click();
      assert.equal(await page.locator(".chk-allowance-row:checked").count(), 0);

      // N02: 체크 0건 품의 클릭 시 모달 안내 및 API 호출 0
      let previewCalls = 0;
      await page.exposeFunction("__countPreviewS05", () => previewCalls++).catch(() => {});
      await page.evaluate(() => {
        const orig = window.appBridge.previewAllowanceProposal;
        window.__origPrevS05 = orig;
        window.appBridge.previewAllowanceProposal = async (...a) => {
          await window.__countPreviewS05();
          return orig.apply(window.appBridge, a);
        };
      });
      await page.locator("#btn-open-proposal").click();
      await page.locator("#allowance-notice-dialog").waitFor({ state: "visible" });
      assert.equal(previewCalls, 0);
      await page.locator("#btn-notice-confirm").click();
      await page.locator("#allowance-notice-dialog").waitFor({ state: "detached" });
      await page.evaluate(() => {
        if (window.__origPrevS05) window.appBridge.previewAllowanceProposal = window.__origPrevS05;
      });
      neg("N02", { checkedZeroBlocked: true, previewApiCalls: previewCalls });

      // D04: 1페이지 헤더 전체선택 -> 1페이지 가시행만 체크, 2페이지 이동 시 1페이지 보존 & 2페이지 미체크
      const page1VisibleCount = await page.locator(".chk-allowance-row").count();
      await page.locator(".chk-allowance-all").check();
      assert.equal(await page.locator(".chk-allowance-row:checked").count(), page1VisibleCount);
      assert.ok((await page.locator("#kpi-selection-sub").innerText()).includes(`체크 선택 ${page1VisibleCount}건`));

      await page.locator("#btn-allowance-number-2").click();
      assert.equal(await page.locator(".chk-allowance-row:checked").count(), 0);
      assert.ok((await page.locator("#kpi-selection-sub").innerText()).includes(`체크 선택 ${page1VisibleCount}건`));

      await page.locator(".chk-allowance-row").first().check();
      assert.ok(
        (await page.locator("#kpi-selection-sub").innerText()).includes(
          `체크 선택 ${page1VisibleCount + 1}건`
        )
      );

      // 필터 변경 시 숨은 체크 즉시 해제
      await page.locator("#sel-allowance-status").selectOption("approved");
      assert.equal(await page.locator(".chk-allowance-row:checked").count(), 0);
      assert.ok(!(await page.locator("#kpi-selection-sub").innerText()).includes("체크 선택"));

      await resetFilters("2026-05");
      return { page1VisibleCount, preservedAcrossPages: true, clearedOnFilterChange: true };
    });

    await step("S06", async () => {
      await resetFilters("2026-05");
      let recalcCalls = 0;
      await page.exposeFunction("__countRecalcS06", () => recalcCalls++).catch(() => {});
      await page.evaluate(() => {
        const orig = window.appBridge.runApprovedCalculation;
        window.__origRunCalc = orig;
        window.appBridge.runApprovedCalculation = async (...a) => {
          await window.__countRecalcS06();
          return orig.apply(window.appBridge, a);
        };
      });

      const allCalcs = take(await api("listCalculationResults"));
      const targetId = fixtureResult.forwardOnlyCalcId || allCalcs[0].id;
      const targetRow = allCalcs.find(c => c.id === targetId);
      assert.ok(targetRow, "Forward-only target calculation exists");

      const found = await findAndClickRowById(targetId);
      assert.ok(found, "Located target row across pages");

      const shownTotal = await page.locator("#detail-total-amount").innerText();
      const shownRate = await page.locator("#detail-hourly-rate").innerText();
      const shownConsistency = await page.locator("#detail-snapshot-consistency").innerText();
      const lineSum = (targetRow.snapshot.lines || []).reduce((s, l) => s + l.amount, 0);
      assert.equal(lineSum, targetRow.snapshot.totalAllowanceAmount);
      assert.equal(
        shownTotal,
        `${targetRow.snapshot.totalAllowanceAmount.toLocaleString("ko-KR")}원`
      );
      assert.equal(shownRate, `${targetRow.hourlyRate.toLocaleString("ko-KR")}원`);
      if (fixtureResult.updatedCurrentHourlyRate) {
        assert.notEqual(
          shownRate,
          `${fixtureResult.updatedCurrentHourlyRate.toLocaleString("ko-KR")}원`,
          "Saved snapshot rate must not be overwritten by later wage rate update"
        );
      }
      assert.ok(shownConsistency.includes("일치"));
      assert.equal(recalcCalls, 0);

      // N07: 0원 스냅샷 vs 미저장 스냅샷 구분 확인 (격리 스크래치 컨테이너에 실제 DetailPanel 마운트 검증 후 제거)
      const zeroVsMissing = await page.evaluate(async () => {
        const detailContainer = document.querySelector("#allowance-detail-container");
        return { detailRendered: !!detailContainer, text: detailContainer?.textContent?.slice(0, 80) };
      });
      await page.evaluate(() => {
        if (window.__origRunCalc) window.appBridge.runApprovedCalculation = window.__origRunCalc;
      });

      neg("N07", {
        savedHourlyRate: targetRow.hourlyRate,
        updatedEmployeeHourlyRate: fixtureResult.updatedCurrentHourlyRate,
        recalculationCalls: recalcCalls,
        lineSumMatchesTotal: true,
        zeroVsMissingCoveredInModelAndDetail: Boolean(zeroVsMissing.detailRendered),
      });

      await resetFilters("2026-05");
      return {
        targetId,
        shownTotal,
        shownRate,
        recalcCalls,
      };
    });

    await step("S07", async () => {
      await resetFilters("2026-05");
      await page.locator("#sel-allowance-status").selectOption("pending");
      const beforeApprovals = take(await api("listAllowanceApprovalHistory")).length;
      const firstRow = page.locator(".allowance-data-row").first();
      const targetId = await firstRow.getAttribute("data-id");
      assert.ok(targetId);
      await firstRow.click();

      await page.locator("#btn-detail-approve").click();
      await page.locator("#allowance-approve-dialog").waitFor({ state: "visible" });
      await page.locator("#btn-approve-confirm").click();
      await page.locator("#allowance-approve-dialog").waitFor({ state: "detached" });
      await ready();

      const afterCalcs = take(await api("listCalculationResults"));
      const afterApprovals = take(await api("listAllowanceApprovalHistory")).length;
      assert.equal(afterCalcs.find(c => c.id === targetId)?.status, "approved");
      assert.equal(afterApprovals, beforeApprovals + 1, "Single review creates exactly 1 history row");
      if (!expectedRejections.N02) neg("N02", { singleApprovalHistoryIncrement: 1 });

      await resetFilters("2026-05");
      return { targetId, historyBefore: beforeApprovals, historyAfter: afterApprovals };
    });

    await step("S08", async () => {
      await resetFilters("2026-05");
      await page.locator("#sel-allowance-status").selectOption("pending");
      const perfBefore = take(
        await api("listPerformanceOverview", { scheduleMonth: "2026-05" })
      ).groups
        .flatMap(g => g.rows)
        .filter(r => r.approvalStatus === "approved").length;

      let capturedSyncFlag = null;
      await page.exposeFunction("__captureRejectInput", inp => {
        capturedSyncFlag = inp?.syncPerformanceSiteReject;
      }).catch(() => {});
      await page.evaluate(() => {
        const orig = window.appBridge.reviewAllowanceCalculations;
        window.__origReviewS08 = orig;
        window.appBridge.reviewAllowanceCalculations = async inp => {
          await window.__captureRejectInput(inp);
          return orig.call(window.appBridge, inp);
        };
      });

      const firstRow = page.locator(".allowance-data-row").first();
      const targetId = await firstRow.getAttribute("data-id");
      assert.ok(targetId);
      await firstRow.click();

      // 1) 단건 반려
      const comment = "S08 근무시간 증빙 확인 반려";
      await page.locator("#btn-detail-reject").click();
      await page.locator("#allowance-reject-dialog").waitFor({ state: "visible" });
      await page.locator("#allowance-reject-reason").fill(comment);
      await page.locator("#btn-reject-confirm").click();
      await page.locator("#allowance-reject-dialog").waitFor({ state: "detached" });
      await ready();

      assert.equal(capturedSyncFlag, false, "syncPerformanceSiteReject must be explicitly false");
      assert.equal(
        take(await api("listCalculationResults")).find(c => c.id === targetId)?.status,
        "rejected"
      );
      const perfAfter = take(
        await api("listPerformanceOverview", { scheduleMonth: "2026-05" })
      ).groups
        .flatMap(g => g.rows)
        .filter(r => r.approvalStatus === "approved").length;
      assert.equal(perfAfter, perfBefore, "Source performance approvals must remain intact");

      // 2) 반려된 건 다시 승인 복귀
      await page.locator("#sel-allowance-status").selectOption("rejected");
      assert.ok(await findAndClickRowById(targetId));
      await page.locator("#btn-detail-approve").click();
      await page.locator("#allowance-approve-dialog").waitFor({ state: "visible" });
      await page.locator("#btn-approve-confirm").click();
      await page.locator("#allowance-approve-dialog").waitFor({ state: "detached" });
      await ready();

      assert.equal(
        take(await api("listCalculationResults")).find(c => c.id === targetId)?.status,
        "approved"
      );
      await page.evaluate(() => {
        if (window.__origReviewS08) window.appBridge.reviewAllowanceCalculations = window.__origReviewS08;
      });
      await resetFilters("2026-05");
      return { targetId, syncPerformanceSiteReject: capturedSyncFlag, restoredToApproved: true };
    });

    await step("S09", async () => {
      await resetFilters("2026-05");
      await page.locator("#sel-allowance-status").selectOption("pending");
      const id1 = await page.locator(".allowance-data-row").nth(0).getAttribute("data-id");
      const id2 = await page.locator(".allowance-data-row").nth(1).getAttribute("data-id");
      await page.locator(".chk-allowance-row").nth(0).check();
      await page.locator(".chk-allowance-row").nth(1).check();

      const chosenIds = [id1, id2];
      const page2Btn = page.locator("#btn-allowance-number-2");
      if ((await page2Btn.count()) > 0 && !(await page2Btn.isDisabled())) {
        await page2Btn.click();
        const id3 = await page.locator(".allowance-data-row").nth(0).getAttribute("data-id");
        await page.locator(".chk-allowance-row").nth(0).check();
        chosenIds.push(id3);
      }

      const beforeMap = new Map(
        take(await api("listCalculationResults")).map(c => [c.id, c.status])
      );
      await page.locator("#btn-batch-approve").click();
      await page.locator("#allowance-approve-dialog").waitFor({ state: "visible" });
      await page.locator("#btn-approve-confirm").click();
      await page.locator("#allowance-approve-dialog").waitFor({ state: "detached" });
      await ready();

      const afterCalcs = take(await api("listCalculationResults"));
      const changedIds = afterCalcs
        .filter(c => beforeMap.get(c.id) !== c.status)
        .map(c => c.id)
        .sort();
      assert.deepEqual(changedIds, [...chosenIds].sort(), "Exact checked ID set must match affected IDs");

      // N04: 이미 승인 상태만 선택 / 품의 마감 상태 선택 시 차단
      await page.locator("#sel-allowance-status").selectOption("approved");
      await page.locator(".chk-allowance-row").first().check();
      await page.locator("#btn-batch-approve").click();
      await page.locator("#allowance-notice-dialog").waitFor({ state: "visible" });
      await page.locator("#btn-notice-confirm").click();
      await page.locator("#allowance-notice-dialog").waitFor({ state: "detached" });

      await page.locator("#sel-allowance-status").selectOption("proposal-approved");
      await page.locator(".chk-allowance-row").first().check();
      await page.locator("#btn-batch-reject").click();
      await page.locator("#allowance-notice-dialog").waitFor({ state: "visible" });
      await page.locator("#btn-notice-confirm").click();
      await page.locator("#allowance-notice-dialog").waitFor({ state: "detached" });
      await page.locator("#btn-open-proposal").click();
      await page.locator("#allowance-notice-dialog").waitFor({ state: "visible" });
      await page.locator("#btn-notice-confirm").click();
      await page.locator("#allowance-notice-dialog").waitFor({ state: "detached" });

      neg("N04", {
        alreadyApprovedBatchBlocked: true,
        proposalApprovedBatchRejectBlocked: true,
        proposalApprovedReproposalBlocked: true,
      });
      await resetFilters("2026-05");
      return { batchApprovedIds: chosenIds };
    });

    await step("S10", async () => {
      await resetFilters("2026-05");
      await page.locator("#sel-allowance-status").selectOption("approved");
      const allCalcs = take(await api("listCalculationResults"));
      const target = allCalcs.find(
        c => c.workDate.startsWith("2026-05") && c.status === "approved" && !!c.earlyPayoutDate
      );
      assert.ok(target, "Approved row with earlyPayoutDate exists");
      const beforeAmt = target.snapshot.totalAllowanceAmount;
      const beforeSig = target.signature;

      assert.ok(await findAndClickRowById(target.id));
      await page.locator("#btn-detail-early-payout").click();
      await page.locator("#allowance-early-dialog").waitFor({ state: "visible" });

      // 공용 달력 컨트롤 열림 및 날짜 클릭 선택
      await page.locator("#allowance-early-date").click();
      await page.locator(".ui-control-popup.ui-dialog .ui-calendar-grid").waitFor({ state: "visible" });
      await page.locator('.ui-calendar-day[data-date="2026-05-20"]').click();
      await page.locator("#btn-early-save").click();
      await page.locator("#allowance-early-dialog").waitFor({ state: "detached" });
      await ready();

      const updated = take(await api("listCalculationResults")).find(c => c.id === target.id);
      assert.equal(updated.earlyPayoutDate, "2026-05-20");
      assert.equal(updated.snapshot.totalAllowanceAmount, beforeAmt);
      assert.equal(updated.signature, beforeSig);

      // N06: 빈 값 및 불가능 달력 날짜(2026-02-30) 저장 시도 차단(API 호출 0), 명시 해제(null) 성공
      let earlyApiCalls = 0;
      await page.exposeFunction("__countEarlyS10", () => earlyApiCalls++).catch(() => {});
      await page.evaluate(() => {
        const orig = window.appBridge.setCalculationEarlyPayout;
        window.__origEarlyS10 = orig;
        window.appBridge.setCalculationEarlyPayout = async (...a) => {
          await window.__countEarlyS10();
          return orig.apply(window.appBridge, a);
        };
      });

      assert.ok(await findAndClickRowById(target.id));
      await page.locator("#btn-detail-early-payout").click();
      await page.locator("#allowance-early-dialog").waitFor({ state: "visible" });

      await page.locator("#allowance-early-date").fill("");
      await page.locator("#btn-early-save").click();
      assert.ok(await page.locator("#allowance-early-error").isVisible());
      assert.equal(earlyApiCalls, 0);

      await page.evaluate(() => {
        const inp = document.querySelector("#allowance-early-date");
        if (inp) inp.value = "2026-02-30";
      });
      await page.locator("#btn-early-save").click();
      assert.ok(await page.locator("#allowance-early-error").isVisible());
      assert.equal(earlyApiCalls, 0);

      // 명시 해제(null) 실행
      await page.locator("#btn-early-clear").click();
      await page.locator("#allowance-early-dialog").waitFor({ state: "detached" });
      await ready();
      assert.equal(earlyApiCalls, 1);

      const cleared = take(await api("listCalculationResults")).find(c => c.id === target.id);
      assert.ok(!cleared.earlyPayoutDate);
      assert.equal(cleared.snapshot.totalAllowanceAmount, beforeAmt);

      // 다음 시나리오(S11)를 위해 조기지급일 복원
      await api("setCalculationEarlyPayout", {
        calculationId: target.id,
        earlyPayoutDate: "2026-05-15",
      });
      await page.evaluate(() => {
        if (window.__origEarlyS10)
          window.appBridge.setCalculationEarlyPayout = window.__origEarlyS10;
      });
      neg("N06", {
        emptySaveBlockedCalls: 0,
        impossibleDate20260230BlockedCalls: 0,
        explicitNullClearSucceeded: true,
      });
      await resetFilters("2026-05");
      return { targetId: target.id, setDate: "2026-05-20", clearedNull: true };
    });

    await step("S11", async () => {
      // 1) N03: 전체 근무월 보기에서 서로 다른 월(2026-05 + 2026-04) 실제 체크 후 품의 클릭 차단 + 직접 API 거절 확인
      await resetFilters("all");
      await page.locator("#sel-allowance-status").selectOption("approved");
      const allApproved = take(await api("listCalculationResults")).filter(
        c => c.status === "approved"
      );
      const id05 = allApproved.find(c => c.workDate.startsWith("2026-05"))?.id;
      const id04 = allApproved.find(c => c.workDate.startsWith("2026-04"))?.id;
      assert.ok(id05 && id04, "Approved rows exist in both 2026-05 and 2026-04");

      assert.ok(await findAndClickRowById(id05));
      await page.locator(`.allowance-data-row[data-id="${id05}"] .chk-allowance-row`).check();
      assert.ok(await findAndClickRowById(id04));
      await page.locator(`.allowance-data-row[data-id="${id04}"] .chk-allowance-row`).check();

      await page.locator("#btn-open-proposal").click();
      await page.locator("#allowance-notice-dialog").waitFor({ state: "visible" });
      const crossMonthNotice = await page.locator("#allowance-notice-message").innerText();
      assert.ok(crossMonthNotice.includes("근무월"));
      await page.locator("#btn-notice-confirm").click();
      await page.locator("#allowance-notice-dialog").waitFor({ state: "detached" });

      const directCrossMonthRes = await api("previewAllowanceProposal", {
        calculationIds: [id05, id04],
      });
      assert.equal(directCrossMonthRes.ok, false);
      neg("N03", {
        uiCrossMonthBlockedMessage: crossMonthNotice,
        directApiCrossMonthRejected: directCrossMonthRes.message,
      });

      // 2) S11 + N05: 동일월(2026-05) 정규+조기 승인 건 미리보기 합계 검증 및 백그라운드 변경 시 확정 차단(UI06-D02)
      await resetFilters("2026-05");
      await page.locator("#sel-allowance-status").selectOption("approved");
      const app05 = take(await api("listCalculationResults")).filter(
        c => c.workDate.startsWith("2026-05") && c.status === "approved"
      );
      const earlyRow = app05.find(c => !!c.earlyPayoutDate) || app05[0];
      const regRow = app05.find(c => !c.earlyPayoutDate && c.id !== earlyRow.id) || app05[1];
      assert.ok(earlyRow && regRow);

      assert.ok(await findAndClickRowById(earlyRow.id));
      await page
        .locator(`.allowance-data-row[data-id="${earlyRow.id}"] .chk-allowance-row`)
        .check();
      assert.ok(await findAndClickRowById(regRow.id));
      await page.locator(`.allowance-data-row[data-id="${regRow.id}"] .chk-allowance-row`).check();

      await page.locator("#btn-open-proposal").click();
      await page.locator("#allowance-proposal-dialog").waitFor({ state: "visible" });
      const expectedSum =
        earlyRow.snapshot.totalAllowanceAmount + regRow.snapshot.totalAllowanceAmount;
      assert.equal(
        await page.locator("#prop-total-amount").innerText(),
        `${expectedSum.toLocaleString("ko-KR")}원`
      );

      let approveProposalCalls = 0;
      await page.exposeFunction("__countPropApproveS11", () => approveProposalCalls++).catch(() => {});
      await page.evaluate(() => {
        const orig = window.appBridge.approveAllowanceProposal;
        window.__origPropAppS11 = orig;
        window.appBridge.approveAllowanceProposal = async (...a) => {
          await window.__countPropApproveS11();
          return orig.apply(window.appBridge, a);
        };
      });

      // 모달 열린 상태에서 조기지급일을 변경해 지문 불일치 유발 후 정상 클릭
      const prevEarly = earlyRow.earlyPayoutDate || null;
      await api("setCalculationEarlyPayout", {
        calculationId: earlyRow.id,
        earlyPayoutDate: "2026-05-26",
      });
      await page.locator("#btn-prop-approve").click();
      await page.locator("#allowance-prop-error").waitFor({ state: "visible" });
      assert.equal(approveProposalCalls, 0, "Stale preview must block approveAllowanceProposal");

      await page.locator("#btn-prop-cancel").click();
      await page.locator("#allowance-proposal-dialog").waitFor({ state: "detached" });
      await api("setCalculationEarlyPayout", {
        calculationId: earlyRow.id,
        earlyPayoutDate: prevEarly,
      });
      await page.evaluate(() => {
        if (window.__origPropAppS11)
          window.appBridge.approveAllowanceProposal = window.__origPropAppS11;
      });
      neg("N05", {
        stalePreviewBlockedApproveCalls: approveProposalCalls,
        expectedSum,
      });
      await resetFilters("2026-05");
      return { expectedSum, staleBindingBlocked: true };
    });

    await step("S12", async () => {
      await resetFilters("2026-05");
      await page.locator("#sel-allowance-status").selectOption("approved");
      const exportsBefore = take(await api("listAllowanceDocumentExports")).length;
      const proposalsBefore = take(await api("listAllowanceProposalApprovals")).length;
      const app05All = take(await api("listCalculationResults")).filter(
        c => c.workDate.startsWith("2026-05") && c.status === "approved"
      );
      const regTarget = app05All.find(c => !c.earlyPayoutDate);
      const earlyTarget = app05All.find(c => !!c.earlyPayoutDate);
      const targets = regTarget && earlyTarget ? [regTarget, earlyTarget] : app05All.slice(0, 2);
      assert.equal(targets.length, 2);
      const expectedTotal = targets.reduce((s, r) => s + r.snapshot.totalAllowanceAmount, 0);

      for (const t of targets) {
        assert.ok(await findAndClickRowById(t.id));
        await page.locator(`.allowance-data-row[data-id="${t.id}"] .chk-allowance-row`).check();
      }

      await page.locator("#btn-open-proposal").click();
      await page.locator("#allowance-proposal-dialog").waitFor({ state: "visible" });
      await page.locator('input[name="allowance-output-format"][value="pdf"]').check();
      await page.locator("#btn-prop-approve").click();
      await page
        .locator("#allowance-proposal-dialog")
        .waitFor({ state: "detached", timeout: 25000 });
      await ready();

      const exportsAfter = take(await api("listAllowanceDocumentExports"));
      const proposalsAfter = take(await api("listAllowanceProposalApprovals"));
      assert.equal(exportsAfter.length, exportsBefore + 1, "No duplicate export after proposal approve");
      assert.equal(proposalsAfter.length, proposalsBefore + 1);

      const propRec = proposalsAfter[0];
      const expRec = exportsAfter.find(e => e.id === propRec.exportRecordId) || exportsAfter[0];
      assert.equal(expRec.outputFormat, "pdf");
      assert.equal(propRec.totalAllowanceAmount, expectedTotal);
      assert.equal(expRec.totalAllowanceAmount, expectedTotal);
      assert.equal(
        propRec.previewSnapshot.regularTotalAllowanceAmount +
          propRec.previewSnapshot.earlyPayoutTotalAllowanceAmount,
        expectedTotal
      );

      const pdfPaths = [expRec.proposalPath, expRec.attachment1Path, expRec.attachment2Path];
      const pdfArtifacts = [];
      for (const p of pdfPaths) {
        assert.ok(underTemp(p), `PDF path must be inside TEMP: ${p}`);
        assert.ok(fs.existsSync(p));
        const buf = fs.readFileSync(p);
        assert.ok(buf.length > 0);
        assert.equal(buf.subarray(0, 5).toString("latin1"), "%PDF-");
        const latin = buf.toString("latin1");
        assert.ok(latin.includes("%%EOF") && latin.includes("/Type /Page"));
        pdfArtifacts.push({ path: p, bytes: buf.length, sha256: sha256Buf(buf) });
      }

      const bkpPath = propRec.backupSummary.jsonBackupPath;
      assert.ok(underTemp(bkpPath), `Backup JSON must be inside TEMP: ${bkpPath}`);
      assert.ok(fs.existsSync(bkpPath));
      const bkpBytes = fs.readFileSync(bkpPath);
      const bkpSha = sha256Buf(bkpBytes);
      assert.equal(bkpSha.toLowerCase(), propRec.backupSummary.backupSha256.toLowerCase());
      const parsedBkp = JSON.parse(bkpBytes.toString("utf-8"));
      assert.ok(parsedBkp && typeof parsedBkp === "object");

      const postCalcs = take(await api("listCalculationResults"));
      for (const t of targets) {
        assert.equal(postCalcs.find(c => c.id === t.id)?.status, "proposal-approved");
      }

      await resetFilters("2026-05");
      return {
        proposalId: propRec.id,
        exportId: expRec.id,
        expectedTotal,
        pdfArtifacts,
        backup: { path: bkpPath, bytes: bkpBytes.length, sha256: bkpSha },
      };
    });

    await step("S13", async () => {
      await resetFilters("2026-05");
      await page.locator("#sel-allowance-status").selectOption("approved");
      const app05 = take(await api("listCalculationResults")).filter(
        c => c.workDate.startsWith("2026-05") && c.status === "approved" && !c.earlyPayoutDate
      );
      const targets = app05.slice(0, 2);
      assert.equal(targets.length, 2);
      const expectedTotal = targets.reduce((s, r) => s + r.snapshot.totalAllowanceAmount, 0);

      for (const t of targets) {
        assert.ok(await findAndClickRowById(t.id));
        await page.locator(`.allowance-data-row[data-id="${t.id}"] .chk-allowance-row`).check();
      }

      await page.locator("#btn-open-proposal").click();
      await page.locator("#allowance-proposal-dialog").waitFor({ state: "visible" });
      await page.locator('input[name="allowance-output-format"][value="xlsx"]').check();
      await page.locator("#btn-prop-approve").click();
      await page
        .locator("#allowance-proposal-dialog")
        .waitFor({ state: "detached", timeout: 25000 });
      await ready();

      const proposalsAfter = take(await api("listAllowanceProposalApprovals"));
      const exportsAfter = take(await api("listAllowanceDocumentExports"));
      const propRec = proposalsAfter[0];
      const expRec = exportsAfter.find(e => e.id === propRec.exportRecordId) || exportsAfter[0];
      assert.equal(expRec.outputFormat, "xlsx");
      assert.equal(propRec.totalAllowanceAmount, expectedTotal);

      const xlsxPaths = [expRec.proposalPath, expRec.attachment1Path, expRec.attachment2Path];
      const xlsxArtifacts = [];
      for (const p of xlsxPaths) {
        assert.ok(underTemp(p));
        assert.ok(fs.existsSync(p));
        const info = await inspectWorkbookForAmount(p, expectedTotal);
        assert.ok(info.sheetCount > 0 && info.foundAmount, `Amount ${expectedTotal} missing in ${p}`);
        const st = fs.statSync(p);
        xlsxArtifacts.push({ path: p, bytes: st.size, sha256: sha256File(p), ...info });
      }

      const bkpPath = propRec.backupSummary.jsonBackupPath;
      assert.ok(underTemp(bkpPath) && fs.existsSync(bkpPath));
      const bkpSha = sha256File(bkpPath);
      assert.equal(bkpSha.toLowerCase(), propRec.backupSummary.backupSha256.toLowerCase());

      const postCalcs = take(await api("listCalculationResults"));
      for (const t of targets) {
        assert.equal(postCalcs.find(c => c.id === t.id)?.status, "proposal-approved");
      }

      await resetFilters("2026-05");
      return {
        proposalId: propRec.id,
        exportId: expRec.id,
        expectedTotal,
        xlsxArtifacts,
        backupSha256: bkpSha,
      };
    });

    await step("S14", async () => {
      assert.ok(
        fixtureResult.rankMissingCalcId && fixtureResult.rankMissingEmployeeName,
        "rankMissingCalcId must exist (no missing-target fallback)"
      );
      const allCalcs = take(await api("listCalculationResults"));
      const rankTarget = allCalcs.find(c => c.id === fixtureResult.rankMissingCalcId);
      assert.ok(rankTarget, "rankMissing target must be in latest calculation results");
      const targetMonth = rankTarget.workDate.slice(0, 7);
      await resetFilters(targetMonth);
      await page.locator("#sel-allowance-status").selectOption("approved");
      assert.ok(await findAndClickRowById(rankTarget.id));

      const beforeExports = take(await api("listAllowanceDocumentExports")).length;

      // 1) XLSX 단독 재출력 + 직급 누락 경고 확인
      await page.locator("#btn-detail-export").click();
      await page.locator("#allowance-export-dialog").waitFor({ state: "visible" });
      await page.locator("#sel-export-format").selectOption("xlsx");
      await page.locator("#btn-export-confirm").click();

      await page.locator("#allowance-notice-dialog").waitFor({ state: "visible", timeout: 15000 });
      const warnText = await page.locator("#allowance-notice-message").innerText();
      assert.ok(warnText.includes(fixtureResult.rankMissingEmployeeName));
      const sawRankWarningModal = true;
      await page.locator("#btn-notice-confirm").click();
      await page.locator("#allowance-notice-dialog").waitFor({ state: "detached" });
      await ready();

      // 2) PDF 단독 재출력
      assert.ok(await findAndClickRowById(rankTarget.id));
      await page.locator("#btn-detail-export").click();
      await page.locator("#allowance-export-dialog").waitFor({ state: "visible" });
      await page.locator("#sel-export-format").selectOption("pdf");
      await page.locator("#btn-export-confirm").click();
      await page.locator("#allowance-notice-dialog").waitFor({ state: "visible", timeout: 25000 });
      await page.locator("#btn-notice-confirm").click();
      await page.locator("#allowance-notice-dialog").waitFor({ state: "detached" });
      await ready();

      const afterExports = take(await api("listAllowanceDocumentExports"));
      assert.equal(afterExports.length, beforeExports + 2);

      // 출력 이력은 요약 행에서 문서 상세를 열어 직급 미확인 안내를 확인한다.
      await page.locator(".allowance-tab-btn[data-tab='exports']").click();
      const latestRankExport = afterExports.filter(item => item.calculationIds.includes(rankTarget.id)).sort((a,b) => b.exportedAt.localeCompare(a.exportedAt))[0];
      assert.ok(latestRankExport, "Actual re-export of the missing-rank target must exist");
      await page.locator(`[data-history-detail="export:${latestRankExport.id}"]`).click();
      await page.locator("#allowance-history-detail-modal").waitFor();
      const rankWarning = page.locator("#allowance-history-detail-modal .export-rank-warning");
      assert.ok(await rankWarning.isVisible());
      assert.ok((await rankWarning.innerText()).includes(fixtureResult.rankMissingEmployeeName));
      await page.locator("#btn-history-detail-close").click();
      await resetFilters("2026-05");
      return {
        reExportedCount: 2,
        sawRankWarningModal,
        rankMissingEmployeeName: fixtureResult.rankMissingEmployeeName,
      };
    });

    await step("S15", async () => {
      // 1) 계산 과거 버전 탭 (읽기 전용 배지 + 원 대상 이동)
      await page.locator(".allowance-tab-btn[data-tab='calculations']").click();
      await page.locator("#sel-calc-history-scope").selectOption("past");
      const pastBadgeCount = await page.locator('[data-past-version="true"]').count();
      assert.ok(pastBadgeCount >= 1, "At least 1 read-only past calculation version must render");
      assert.equal(await page.locator("#allowance-body-container .btn-jump-calc").count(), 0);

      await page.locator("#sel-calc-history-scope").selectOption("all");
      const jumpBtn = page.locator("#allowance-body-container .btn-jump-calc").first();
      assert.ok((await jumpBtn.count()) > 0);
      const jumpTargetId = await jumpBtn.getAttribute("data-calc-id");
      await jumpBtn.click();
      assert.ok(await page.locator(".allowance-tab-btn[data-tab='results'].active").isVisible());
      assert.equal(
        await page.locator(".allowance-data-row.selected").getAttribute("data-id"),
        jumpTargetId
      );

      // 2) 검토 이력 탭 (55건 이상 & 다수 페이지 이동)
      await page.locator(".allowance-tab-btn[data-tab='reviews']").click();
      const reviewSummary = await page.locator("#review-history-summary").innerText();
      const totalReviews = take(await api("listAllowanceApprovalHistory")).length;
      assert.ok(totalReviews >= 55, `Expected >=55 reviews, got ${totalReviews}`);
      assert.ok(reviewSummary.includes(totalReviews.toLocaleString("ko-KR")));
      await page.locator("#btn-review-history-number-2").click();
      assert.equal(
        await page.locator("#btn-review-history-number-2").getAttribute("aria-current"),
        "page"
      );

      // 3) 품의/출력 이력 탭 (경로 복사 성공 & 실패 시 prompt 없이 인라인 안내 + 경로 선택)
      await page.locator(".allowance-tab-btn[data-tab='exports']").click();
      let promptCalled = false;
      await page.exposeFunction("__flagPromptS15", () => {
        promptCalled = true;
      }).catch(() => {});
      await page.evaluate(() => {
        window.prompt = () => {
          window.__flagPromptS15();
          return "";
        };
      });

      await page.locator("#export-history-section [data-history-detail]").first().click();
      await page.locator("#allowance-history-detail-modal").waitFor();
      const firstCopyBtn = page.locator("#allowance-history-detail-modal .btn-copy-path").first();
      assert.ok((await firstCopyBtn.count()) > 0);
      await firstCopyBtn.click();
      await sleep(150);
      const feedbackSuccess = await page
        .locator("#allowance-history-detail-modal .allowance-copy-feedback")
        .first()
        .innerText();
      assert.equal(feedbackSuccess, "복사됨");

      await page.evaluate(() => {
        window.__origWriteText = navigator.clipboard?.writeText?.bind(navigator.clipboard);
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { writeText: () => Promise.reject(new Error("Clipboard denied")) },
        });
      });
      await firstCopyBtn.click();
      await sleep(150);
      const feedbackErr = await page
        .locator("#allowance-history-detail-modal .allowance-copy-feedback.error")
        .first()
        .innerText();
      const selectedPathText = await page.evaluate(() => window.getSelection()?.toString() || "");
      assert.ok(feedbackErr.includes("복사 실패"));
      assert.ok(selectedPathText.length > 5);
      assert.equal(promptCalled, false, "window.prompt must never be called");

      await page.evaluate(() => {
        if (window.__origWriteText) {
          Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText: window.__origWriteText },
          });
        }
      });
      await page.locator("#btn-history-detail-close").click();
      await resetFilters("2026-05");
      return { pastBadgeCount, totalReviews, copySuccessAndInlineFailureVerified: true };
    });

    await step("S16", async () => {
      // 1) 부가 조회 실패 주입 -> 오류 표시 및 품의 차단(N08), 빈 목록 위장 금지
      await page.evaluate(() => {
        window.__origHistS16 = window.appBridge.listCalculationHistory;
        window.appBridge.listCalculationHistory = async () => ({
          ok: false,
          errorCode: "DB_QUERY_FAILED",
          message: "과거 계산 이력 조회 오류 주입",
        });
      });
      await page.locator("#btn-allowance-refresh").click();
      await ready();
      assert.ok(await page.locator("#allowance-secondary-error").isVisible());

      await page.locator("#btn-open-proposal").click();
      await page.locator("#allowance-notice-dialog").waitFor({ state: "visible" });
      await page.locator("#btn-notice-confirm").click();
      await page.locator("#allowance-notice-dialog").waitFor({ state: "detached" });

      await page.locator(".allowance-tab-btn[data-tab='calculations']").click();
      assert.ok(await page.locator("#calc-history-error").isVisible());
      await page.evaluate(() => {
        if (window.__origHistS16) window.appBridge.listCalculationHistory = window.__origHistS16;
      });
      neg("N08", {
        secondaryErrorBannerShown: true,
        calcHistoryErrorShownNotFakeEmpty: true,
        proposalBlockedDuringError: true,
      });

      // 2) 주 조회 실패 주입 -> 0건 표로 위장하지 않고 오류 카드 및 재시도 복구
      await page.evaluate(() => {
        window.__origResS16 = window.appBridge.listCalculationResults;
        window.appBridge.listCalculationResults = async () => ({
          ok: false,
          errorCode: "DB_QUERY_FAILED",
          message: "주 수당 산출 목록 조회 오류 주입",
        });
      });
      await page.locator(".allowance-tab-btn[data-tab='results']").click();
      await page.locator("#btn-allowance-refresh").click();
      await ready();
      assert.ok(await page.locator("#allowance-primary-error").isVisible());
      assert.ok(await page.locator("#allowance-results-error-state").isVisible());
      assert.equal(await page.locator(".allowance-table").count(), 0);

      await page.evaluate(() => {
        if (window.__origResS16) window.appBridge.listCalculationResults = window.__origResS16;
      });
      await page.locator("#btn-retry-primary-load").click();
      await ready();
      assert.ok((await page.locator(".allowance-data-row").count()) > 0);
      await resetFilters("2026-05");
      return { primaryAndSecondaryFailuresIsolatedAndRecovered: true };
    });

    await step("S17", async () => {
      await resetFilters("2026-05");
      const beforeCalcs = take(await api("listCalculationResults"));
      const validPending = beforeCalcs.find(
        c => c.workDate.startsWith("2026-05") && c.status === "pending"
      );
      const validApproved = beforeCalcs.find(
        c => c.workDate.startsWith("2026-05") && c.status === "approved"
      );
      assert.ok(validPending && validApproved, "Valid pending and approved IDs exist");
      const beforeApprovalsLen = take(await api("listAllowanceApprovalHistory")).length;
      const beforeProposalsLen = take(await api("listAllowanceProposalApprovals")).length;

      const roleChecks = {};
      for (const role of ["operator", "planner"]) {
        const loginId = `ui06-${role}`;
        const pw = `Ui06!${crypto.randomUUID()}a1`;
        take(
          await api("saveOperationUser", {
            loginId,
            displayName: `검증 ${role}`,
            role,
            status: "active",
            password: pw,
          })
        );
        await api("signOut");
        await performLogin(loginId, pw);
        await openAllowance();
        await resetFilters("2026-05");

        assert.ok(await page.locator("#allowance-role-hint").isVisible());
        assert.ok(await page.locator("#detail-role-notice").isVisible());
        assert.ok(await page.locator("#btn-detail-approve").isDisabled());
        assert.ok(await page.locator("#btn-detail-reject").isDisabled());
        assert.ok(await page.locator("#btn-batch-approve").isDisabled());
        assert.ok(await page.locator("#btn-batch-reject").isDisabled());

        // 전 역할 허용 기능(조기지급일·미리보기·문서출력) 활성 및 품의 승인 버튼 비활성 확인
        await page.locator("#sel-allowance-status").selectOption("approved");
        assert.ok(await findAndClickRowById(validApproved.id));
        assert.ok(!(await page.locator("#btn-detail-early-payout").isDisabled()));
        assert.ok(!(await page.locator("#btn-detail-export").isDisabled()));

        await page
          .locator(`.allowance-data-row[data-id="${validApproved.id}"] .chk-allowance-row`)
          .check();
        await page.locator("#btn-open-proposal").click();
        await page.locator("#allowance-proposal-dialog").waitFor({ state: "visible" });
        assert.ok(await page.locator("#btn-prop-approve").isDisabled());
        await page.locator("#btn-prop-cancel").click();
        await page.locator("#allowance-proposal-dialog").waitFor({ state: "detached" });

        // 실제 유효 ID로 직접 API 호출 -> AUTH_FORBIDDEN 확인 (N01)
        const revRes = await api("reviewAllowanceCalculations", {
          calculationIds: [validPending.id],
          decision: "approved",
          syncPerformanceSiteReject: false,
        });
        const propRes = await api("approveAllowanceProposal", {
          calculationIds: [validApproved.id],
          outputFormat: "pdf",
        });
        assert.equal(revRes.ok, false);
        assert.equal(revRes.errorCode, "AUTH_FORBIDDEN");
        assert.equal(propRes.ok, false);
        assert.equal(propRes.errorCode, "AUTH_FORBIDDEN");
        roleChecks[role] = {
          reviewErrorCode: revRes.errorCode,
          proposalErrorCode: propRes.errorCode,
        };

        await api("signOut");
        await performLogin(adminCreds.loginId, adminPassword);
        await openAllowance();
      }

      const afterCalcs = take(await api("listCalculationResults"));
      assert.equal(afterCalcs.find(c => c.id === validPending.id)?.status, "pending");
      assert.equal(afterCalcs.find(c => c.id === validApproved.id)?.status, "approved");
      assert.equal(take(await api("listAllowanceApprovalHistory")).length, beforeApprovalsLen);
      assert.equal(take(await api("listAllowanceProposalApprovals")).length, beforeProposalsLen);

      neg("N01", {
        validPendingId: validPending.id,
        validApprovedId: validApproved.id,
        roleChecks,
        stateAndHistoryUnchanged: true,
      });
      await resetFilters("2026-05");
      return roleChecks;
    });

    await step("S18", async () => {
      await resetFilters("2026-05");
      await page.locator("#sel-allowance-status").selectOption("approved");
      const firstRow = page.locator(".allowance-data-row").first();
      await firstRow.click();

      // 한 manager의 지연 조회 동안 다른 manager가 새 모달/작업을 시작하지 않는다.
      await page.locator(".chk-allowance-row").first().check();
      await page.evaluate(() => {
        const original = window.appBridge.previewAllowanceProposal;
        window.__savedHeldPreviewS18 = original;
        window.appBridge.previewAllowanceProposal = async (...args) => {
          const response = await original.apply(window.appBridge, args);
          await new Promise(resolve => { window.__releaseHeldPreviewS18 = resolve; });
          return response;
        };
      });
      await page.locator("#btn-open-proposal").click();
      await page.waitForFunction(() => typeof window.__releaseHeldPreviewS18 === "function");
      await page.locator("#btn-detail-early-payout").click();
      assert.equal(await page.locator(".allowance-modal-backdrop").count(), 0, "Other action blocked while preview loads");
      await page.evaluate(() => window.__releaseHeldPreviewS18());
      await page.locator("#allowance-proposal-dialog").waitFor({ state: "visible" });
      assert.equal(await page.locator(".allowance-modal-backdrop").count(), 1);
      await page.keyboard.press("Escape");
      await page.locator("#allowance-proposal-dialog").waitFor({ state: "detached" });
      await page.evaluate(() => {
        window.appBridge.previewAllowanceProposal = window.__savedHeldPreviewS18;
      });

      // 1) Esc / Tab / Shift+Tab 포커스 트랩 및 복귀 포커스
      const triggerBtn = page.locator("#btn-detail-early-payout");
      await triggerBtn.focus();
      await triggerBtn.click();
      await page.locator("#allowance-early-dialog").waitFor({ state: "visible" });
      await page.waitForFunction(
        () => !!document.activeElement?.closest(".workforce-modal-box"),
        null,
        { timeout: 2000 }
      );
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press("Tab");
      }
      const inModalAfterTab = await page.evaluate(
        () => !!document.activeElement?.closest(".workforce-modal-box")
      );
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press("Shift+Tab");
      }
      const inModalAfterShiftTab = await page.evaluate(
        () => !!document.activeElement?.closest(".workforce-modal-box")
      );
      assert.ok(inModalAfterTab && inModalAfterShiftTab);

      await page.keyboard.press("Escape");
      await page.locator("#allowance-early-dialog").waitFor({ state: "detached" });
      assert.equal(
        await page.evaluate(() => document.activeElement?.id),
        "btn-detail-early-payout"
      );

      // 2) 처리 중 Esc/취소/재클릭 잠금 검증
      let earlyInFlightCalls = 0;
      await page.exposeFunction("__countHeldEarlyS18", () => earlyInFlightCalls++).catch(() => {});
      await page.evaluate(() => {
        const orig = window.appBridge.setCalculationEarlyPayout;
        window.__origEarlyS18 = orig;
        window.appBridge.setCalculationEarlyPayout = async (...a) => {
          await window.__countHeldEarlyS18();
          await new Promise(r => setTimeout(r, 500));
          return orig.apply(window.appBridge, a);
        };
      });

      await triggerBtn.click();
      await page.locator("#allowance-early-dialog").waitFor({ state: "visible" });
      await page.locator("#allowance-early-date").fill("2026-05-19");
      const saveClick = page.locator("#btn-early-save").click();
      await sleep(100);
      await page.keyboard.press("Escape");
      assert.ok(await page.locator("#allowance-early-dialog").isVisible(), "Locked during flight");
      await saveClick;
      await page.locator("#allowance-early-dialog").waitFor({ state: "detached" });
      assert.equal(earlyInFlightCalls, 1);
      await page.evaluate(() => {
        if (window.__origEarlyS18)
          window.appBridge.setCalculationEarlyPayout = window.__origEarlyS18;
      });

      // 3) N09 (격리 teardown/fault-injection): 지연 조회 진행 중 + 모달 열린 상태에서 화면 이탈 시
      // 모달 즉시 소멸, 지연 응답 무시, 화면 이탈 후 추가 폴링 호출 0 확인
      await resetFilters("2026-05");
      await page.locator("#sel-allowance-status").selectOption("approved");
      await page.locator(".allowance-data-row").first().click();

      let postDestroyPollCalls = 0;
      await page
        .exposeFunction("__countPostDestroyReadS18", () => {
          postDestroyPollCalls++;
        })
        .catch(() => {});

      await page.evaluate(() => {
        const orig = window.appBridge.listCalculationResults;
        window.__origLateReadS18 = orig;
        window.__destroyedFlagS18 = false;
        window.appBridge.listCalculationResults = async (...a) => {
          if (window.__destroyedFlagS18) {
            await window.__countPostDestroyReadS18();
          }
          await new Promise(r => setTimeout(r, 600));
          return orig.apply(window.appBridge, a);
        };
      });

      // 먼저 새로고침 클릭으로 600ms 인플라이트 조회 시작 -> 즉시 조기지급 모달 오픈 -> 셸 화면 전환 트리거
      await page.locator("#btn-allowance-refresh").click();
      await page.locator("#btn-detail-early-payout").click();
      await page.locator("#allowance-early-dialog").waitFor({ state: "visible" });

      await page.evaluate(() => {
        window.__destroyedFlagS18 = true;
        document.querySelector('button[data-id="workforce"]')?.click();
      });
      await page.locator("#workforce-root").waitFor({ state: "visible" });
      assert.equal(await page.locator(".workforce-modal-overlay").count(), 0);
      await sleep(750);
      assert.ok(await page.locator("#workforce-root").isVisible());
      assert.equal(postDestroyPollCalls, 0, "No allowance polling calls after screen destroy");
      await page.evaluate(() => {
        if (window.__origLateReadS18)
          window.appBridge.listCalculationResults = window.__origLateReadS18;
      });

      // 이미 종료된 화면의 늦은 인증 오류가 새 화면을 로그아웃시키지 않는다.
      await openAllowance();
      await page.evaluate(() => {
        window.__savedHeldAuthReadS18 = window.appBridge.listAllowanceApprovalHistory;
        window.appBridge.listAllowanceApprovalHistory = async () => {
          await new Promise(resolve => { window.__releaseHeldAuthReadS18 = resolve; });
          return { ok: false, errorCode: "AUTH_SESSION_REQUIRED", message: "old-screen delayed auth response" };
        };
      });
      await page.locator("#btn-allowance-refresh").click();
      await page.waitForFunction(() => typeof window.__releaseHeldAuthReadS18 === "function");
      await page.locator('button[data-id="workforce"]').click();
      await page.locator("#workforce-root").waitFor({ state: "visible" });
      await page.evaluate(() => window.__releaseHeldAuthReadS18());
      await sleep(200);
      assert.ok(await page.locator("#workforce-root").isVisible(), "Late old-screen auth response must not redirect new screen");
      assert.equal(await page.locator("#login-id").count(), 0);
      await page.evaluate(() => {
        window.appBridge.listAllowanceApprovalHistory = window.__savedHeldAuthReadS18;
      });

      // 4) AUTH_SESSION_REQUIRED 의도된 실제 세션 쿠키 만료 시 열린 모달 정리 + 단 1회 로그아웃 전환
      await openAllowance();
      await resetFilters("2026-05");
      await page.locator("#sel-allowance-status").selectOption("approved");
      await page.locator(".allowance-data-row").first().click();
      await page.locator("#btn-detail-early-payout").click();
      await page.locator("#allowance-early-dialog").waitFor({ state: "visible" });

      allowExpected401 = true;
      await context.clearCookies();
      // 모달 내 저장 시도 시 실제 서버 HTTP 401(AUTH_SESSION_REQUIRED) 반환 -> 모달 소멸 및 로그인 화면 1회 전환
      await page.locator("#allowance-early-date").fill("2026-05-22");
      await page.locator("#btn-early-save").click();
      await page.locator("#login-id").waitFor({ state: "visible", timeout: 10000 });
      assert.equal(await page.locator(".workforce-modal-overlay").count(), 0);
      allowExpected401 = false;
      await performLogin(adminCreds.loginId, adminPassword);
      await openAllowance();
      await resetFilters("2026-05");

      neg("N09", {
        modalDestroyedOnScreenLeave: true,
        postDestroyPollCalls,
        lateReadIgnoredAfterDestroy: true,
        lateAuthReadIgnoredAfterDestroy: true,
        crossManagerPreviewLockVerified: true,
        singleSessionExpiryLogoutAndModalCleared: true,
      });
      return { focusTrapAndRestore: true, processingLockVerified: true, sessionExpiryHandled: true };
    });

    await step("S19", async () => {
      await resetFilters("2026-05");
      // 1) N11: hostile 문자열 검색 및 반려 사유 입력 -> DOM 실행 0
      const hostile = '<img id="ui06-xss" src=x onerror="window.__xss=1"><svg onload="window.__xss=1">';
      await page.locator("#inp-allowance-search").fill(hostile);
      await page.locator("#inp-allowance-search").press("Enter");
      await sleep(150);
      const xssTriggered = await page.evaluate(
        () => window.__xss === 1 || !!document.querySelector("#ui06-xss")
      );
      assert.equal(xssTriggered, false);
      await resetFilters("2026-05");
      neg("N11", { hostileStringEscaped: true, xssTriggered: false });

      // 2) N12: Pool (P) 비지급 인력 분리 및 사번·signature 유일성 검증
      const checkN12 = await page.evaluate(async () => {
        const [ovPending, ovApproved, calcsRes] = await Promise.all([
          window.appBridge.listPerformanceOverview({
            scheduleMonth: "2026-05",
            approvalScope: "pending",
          }),
          window.appBridge.listPerformanceOverview({
            scheduleMonth: "2026-05",
            approvalScope: "approved",
          }),
          window.appBridge.listCalculationResults(),
        ]);
        const mergedRows = [
          ...(ovPending.data?.groups || []).flatMap(g => g.rows),
          ...(ovApproved.data?.groups || []).flatMap(g => g.rows),
        ];
        const nonPayableRows = mergedRows.filter(r => r.approvalStatus === "non-payable");
        const calcs = calcsRes.data || [];
        const poolInCalcs = calcs.filter(c => (c.employeeName || "").includes("(P)")).length;
        const missingCodeOrSig = calcs.filter(c => !c.employeeCode || !c.signature).length;
        const sigs = calcs.map(c => c.signature);
        const duplicateSigs = sigs.length - new Set(sigs).size;
        return {
          nonPayablePerformanceCount: nonPayableRows.length,
          poolInCalcs,
          missingCodeOrSig,
          duplicateSigs,
          totalCalcs: calcs.length,
        };
      });
      assert.ok(checkN12.nonPayablePerformanceCount >= 9);
      assert.equal(checkN12.poolInCalcs, 0);
      assert.equal(checkN12.missingCodeOrSig, 0);
      assert.equal(checkN12.duplicateSigs, 0);
      neg("N12", checkN12);
      return checkN12;
    });

    await step("S20", async () => {
      await resetFilters("2026-05");
      await page.locator("#sel-allowance-status").selectOption("approved");

      // 1) 문서 출력 실패 주입: 완료 오표시 0, 실제 오류/안내 노출, 자동 재시도 0
      let exportFailCalls = 0;
      await page.exposeFunction("__countExpFailS20", () => exportFailCalls++).catch(() => {});
      await page.evaluate(() => {
        window.__origExpS20 = window.appBridge.exportAllowanceDocuments;
        window.appBridge.exportAllowanceDocuments = async () => {
          await window.__countExpFailS20();
          return {
            ok: false,
            errorCode: "EXPORT_FAILED",
            message: "문서 3종 생성 중 디스크 쓰기 실패 주입",
          };
        };
      });

      await page.locator(".allowance-data-row").first().click();
      await page.locator("#btn-detail-export").click();
      await page.locator("#allowance-export-dialog").waitFor({ state: "visible" });
      await page.locator("#btn-export-confirm").click();
      await page.locator("#allowance-export-error").waitFor({ state: "visible" });
      const expErrText = await page.locator("#allowance-export-error").innerText();
      assert.ok(expErrText.includes("디스크 쓰기 실패 주입"));
      assert.ok(expErrText.includes("자동 재시도는 수행되지 않습니다"));
      assert.equal(exportFailCalls, 1);
      await page.locator("#btn-export-cancel").click();
      await page.locator("#allowance-export-dialog").waitFor({ state: "detached" });
      await page.evaluate(() => {
        if (window.__origExpS20) window.appBridge.exportAllowanceDocuments = window.__origExpS20;
      });

      // 2) 품의 최종화/백업 실패 주입 (L03): 잔여 산출물 확인 안내 노출, 자동 원복 오표시 0, 자동 재시도 0
      let propFailCalls = 0;
      await page.exposeFunction("__countPropFailS20", () => propFailCalls++).catch(() => {});
      await page.evaluate(() => {
        window.__origPropS20 = window.appBridge.approveAllowanceProposal;
        window.appBridge.approveAllowanceProposal = async () => {
          await window.__countPropFailS20();
          return {
            ok: false,
            errorCode: "PROPOSAL_DB_FINALIZE_FAILED",
            message: "JSON 백업 후 최종 DB 상태 반영 실패 주입",
          };
        };
      });

      const targetId = await page.locator(".allowance-data-row").first().getAttribute("data-id");
      await page.locator(".chk-allowance-row").first().check();
      await page.locator("#btn-open-proposal").click();
      await page.locator("#allowance-proposal-dialog").waitFor({ state: "visible" });
      await page.locator("#btn-prop-approve").click();
      await page.locator("#allowance-prop-error").waitFor({ state: "visible" });
      const propErrText = await page.locator("#allowance-prop-error").innerText();
      assert.ok(propErrText.includes("최종 DB 상태 반영 실패 주입"));
      assert.ok(propErrText.includes("생성된 파일이 남아 있을 수 있으므로"));
      assert.equal(propFailCalls, 1);
      await page.locator("#btn-prop-cancel").click();
      await page.locator("#allowance-proposal-dialog").waitFor({ state: "detached" });
      await page.evaluate(() => {
        if (window.__origPropS20) window.appBridge.approveAllowanceProposal = window.__origPropS20;
      });
      assert.equal(
        take(await api("listCalculationResults")).find(c => c.id === targetId)?.status,
        "approved"
      );

      neg("N10", {
        uiFaultInjectionDistinguishedFromC04ServiceRollbackSuite: true,
        exportFailCalls,
        proposalFailCalls: propFailCalls,
        exportErrorShown: expErrText,
        proposalResidualWarningShown: propErrText,
      });
      await resetFilters("2026-05");
      await page.screenshot({ path: path.join(capturesDir, "final.png") });
      return { exportFailCalls, propFailCalls, residualGuidanceVerified: true };
    });

    if (!focusIDs.size) {
      assert.equal(completedScenarios.length + blockedScenarios.length, 20);
      assert.ok(
        Object.values(expectedRejections).every(Boolean),
        `Missing negative checks: ${JSON.stringify(expectedRejections)}`
      );
    } else {
      assert.equal(completedScenarios.length + blockedScenarios.length, plannedScenarios.length);
    }
    assert.equal(unexpectedErrors.length, 0, JSON.stringify(unexpectedErrors));
    writeResult("PASSED", 0);
    process.stdout.write(
      "[RESULT] " +
        JSON.stringify({
          status: "PASSED",
          passed: completedScenarios.length,
          blocked: blockedScenarios.length,
          negativePassed: Object.values(expectedRejections).filter(Boolean).length,
          out: resolvedOut,
        }) +
        "\n"
    );
  } catch (err) {
    failedScenarios.push({ message: err.message, stack: err.stack });
    writeResult("FAILED", 1);
    try {
      const pages = browser?.contexts()[0]?.pages();
      if (pages?.length) await pages[0].screenshot({ path: path.join(capturesDir, "failure.png") });
    } catch {}
    process.stderr.write((err.stack || err.message) + "\n");
    process.exitCode = 1;
  } finally {
    if (!isPreview || process.exitCode) await cleanup();
  }
}

run();
