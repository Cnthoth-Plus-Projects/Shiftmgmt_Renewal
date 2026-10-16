// 활동 이력 정상 6개 시나리오 공통 실행기 (runScreenCheck 실제 호출)
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runScreenCheck } from "../lib/ui-check.mjs";
import {
  NormalAssertionCollector as AssertionCollector,
  performNormalLogin as performLogin,
  parseNormalBridgeQuery as parseBridgeQuery,
  NormalHeldRouteController as HeldRouteController,
  installNormalObserver,
  publishNormalEvidence
} from "./access-history-negative.mjs";
import {
  createMockAccessLogs,
  loadContract,
  loadExecution,
  performWorkerIpcHandshake,
} from "./access-history-shared.mjs";

const sha = (d) => crypto.createHash("sha256").update(d).digest("hex").toUpperCase();

const isDirectCli = Boolean(process.argv[1]) && (() => {
  try {
    return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1]));
  } catch (err) {
    process.stderr.write(`[오류] CLI 진입 경로 해석 실패: ${err.message}\n`);
    process.exit(1);
  }
})();

if (isDirectCli) {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length !== 1 || !rawArgs[0].startsWith("--case=")) {
    process.stderr.write("[오류] 정확히 단일 --case=<케이스> 인수가 필요합니다.\n");
    process.exit(1);
  }

  const caseArg = rawArgs[0].slice(7);
  if (!caseArg || caseArg.trim() !== caseArg) {
    process.stderr.write("[오류] 유효하지 않은 케이스명입니다.\n");
    process.exit(1);
  }

  let contract, execution;
  try {
    contract = loadContract();
    execution = loadExecution();
  } catch (e) {
    process.stderr.write(JSON.stringify({ status: "FAIL", code: "A1_LOCK_MISMATCH", case: caseArg, error: { message: e.message } }) + "\n");
    process.exit(1);
  }

  const POSITIVE_CASES = new Set(contract.privateCases?.["access-history-positive.mjs"] || [
    "live-admin", "list-fixture", "empty-fixture", "filters", "stale-response", "role-guard"
  ]);

  if (!POSITIVE_CASES.has(caseArg)) {
    process.stderr.write(`[오류] 등록되지 않은 케이스: '${caseArg}'\n`);
    process.exit(1);
  }

  const { context, nonceSha256 } = await performWorkerIpcHandshake(caseArg, contract);
  const targetUrl = context.url;
  const bootstrapFile = context.bootstrapFile;
  const credentials = JSON.parse(fs.readFileSync(bootstrapFile, "utf8"));
  const adminCreds = { ...credentials.credentials["user-admin"] };

  const repoRoot = fs.realpathSync(context.repository);
  const { findChrome } = await import(pathToFileURL(path.join(repoRoot, "scripts/lib/find-chrome.mjs")).href);
  const chrome = findChrome();

  const state = installNormalObserver({ context, caseName: caseArg, contract, execution, nonceSha256, chromeInfo: chrome });
  state.runner.script = path.join(repoRoot, "scripts/lib/ui-check.mjs");
  state.runner.scriptSha256 = sha(fs.readFileSync(state.runner.script));
  state.steps.enteredAtMs = Date.now();
  state.updatePartial();

  const collector = new AssertionCollector(caseArg, contract, state);


  await runScreenCheck({
    id: `access-history-${caseArg}`,
    url: targetUrl,
    steps: async ({ page, capture, waitForFontsReady }) => {
      // 페이지 request/response/console 이벤트 관측 바인딩
      let reqMonotonic = 0;
      page.on("request", req => {
        const u = req.url();
        if (u.startsWith("http://127.0.0.1:18741/api/")) {
          const id = state.nextRequestId();
          const isLogList = u.includes("/api/access-logs:list") && !["role-guard", "session-expired"].includes(caseArg);
          state.requests.push({
            id, source: "page", method: req.method(), url: u, phase: state.phase, startedAtMs: Date.now(), endedAtMs: Date.now(), status: 0, ok: true, errorCode: null, query: isLogList ? parseBridgeQuery(req) : null
          });
        }
      });

      page.on("response", async res => {
        const u = res.url();
        if (u.startsWith("http://127.0.0.1:18741/api/")) {
          const match = state.requests.find(r => r.url === u && r.status === 0);
          if (match) {
            match.endedAtMs = Date.now();
            match.status = res.status();
            match.ok = res.ok();
            try {
              const body = await res.json();
              if (body && typeof body === "object") {
                match.errorCode = body.errorCode || null;
                if (u.includes("/api/auth:")) {
                  const op = u.split("/api/auth:")[1];
                  if (["sign-in", "change-password", "get-session", "sign-out"].includes(op)) {
                    const d = body.data;
                    const prev = state.auth.at(-1);
                    if (op === "sign-out") {
                      state.recordAuth({
                        operation: op,
                        loginId: prev?.loginId || null,
                        userId: prev?.userId || null,
                        role: prev?.role || null,
                        ok: res.ok(),
                        passwordChangeRequired: false,
                        timeMs: match.endedAtMs
                      });
                    } else if (d && (d.userId || d.user?.id)) {
                      state.recordAuth({
                        operation: op,
                        loginId: d.loginId || d.user?.loginId || prev?.loginId || null,
                        userId: d.userId || d.user?.id || prev?.userId || null,
                        role: d.role || d.user?.role || prev?.role || null,
                        ok: res.ok(),
                        passwordChangeRequired: d.passwordChangeRequired ?? (d.user?.passwordChangeRequired ?? null),
                        timeMs: match.endedAtMs
                      });
                    }
                  }
                }
              }
            } catch {}
            if (res.status() >= 400) {
              state.rawErrors.badResponses.push({
                requestId: match.id, status: res.status(), url: u, method: match.method, errorCode: match.errorCode, timeMs: Date.now()
              });
            }
          }
        }
      });

      page.on("pageerror", e => state.rawErrors.pageerror.push({ message: e.message, timeMs: Date.now() }));
      page.on("console", m => {
        if (m.type() === "error") {
          state.rawErrors.console.push({ text: m.text(), url: m.location()?.url || "", timeMs: Date.now() });
        }
      });

      state.resources.browser.acquiredAtMs = Date.now();
      state.resources.context.acquiredAtMs = Date.now();

      if (caseArg === "live-admin") {
        await performLogin(page, targetUrl, adminCreds);
        await page.getByRole("button", { name: "활동 이력", exact: true }).click();
        await page.waitForFunction(() => document.querySelector("#header-current-title")?.textContent === "활동 이력");
        await page.locator("#table-access-logs").waitFor({ timeout: 5000 });

        const rowCount = await page.locator("#table-access-logs-body tr").count();
        collector.expectEqual("live-admin-rows-positive", true, rowCount > 0);

        const countLabel = await page.locator("#access-history-count-label").textContent();
        collector.expectEqual("live-admin-count-label", true, countLabel.includes("전체") && countLabel.includes("건 중"));

        let refCount = 0;
        page.on("request", (req) => {
          if (req.url().includes("api/access-logs:list")) refCount++;
        });
        await page.locator("#btn-refresh-logs").click();
        await page.waitForTimeout(400);
        collector.expectEqual("live-admin-refresh-single-request", 1, refCount);

        await page.getByRole("button", { name: "홈", exact: true }).click();
        await page.locator(".home-container").waitFor();
        await page.getByRole("button", { name: "활동 이력", exact: true }).click();
        await page.locator("#table-access-logs").waitFor();
        const reentryTableCount = await page.locator("#table-access-logs").count();
        collector.expectEqual("live-admin-home-reentry-ok", 1, reentryTableCount);

        await page.locator(".btn-logout").click();
        await page.locator("#login-id").waitFor();
        const logoutLoginCount = await page.locator("#login-id").count();
        const logoutTableCount = await page.locator("#table-access-logs").count();
        collector.expectEqual("live-admin-logout-ok", 1, (logoutLoginCount === 1 && logoutTableCount === 0) ? 1 : 0);

        await waitForFontsReady(15000);
        state.environment.fontsReadyAtMs = Date.now();
        await capture("live-admin");
      } else if (caseArg === "list-fixture") {
        state.environment.routes.push({ url: "**/api/access-logs:list", timeMs: Date.now() });
        await performLogin(page, targetUrl, adminCreds);

        const mockLogs = createMockAccessLogs(201);
        await page.route("**/api/access-logs:list", async (r) => {
          await r.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true, data: mockLogs }),
          });
        });

        await page.getByRole("button", { name: "활동 이력", exact: true }).click();
        await page.locator("#table-access-logs").waitFor();

        const xssCount = await page.locator("script").evaluateAll((es) => es.filter((e) => e.textContent.includes("xss-test")).length);
        collector.expectEqual("list-fixture-xss-blocked", 0, xssCount);

        const tableLabel = await page.locator("#table-access-logs").getAttribute("aria-label");
        collector.expectEqual("list-fixture-table-aria-label", "활동 이력 목록", tableLabel);

        const dBox = await page.locator("#filter-date-from").boundingBox();
        collector.expectNear("list-fixture-date-width-132", 132, dBox.width, 1);
        collector.expectNear("list-fixture-date-height-34", 34, dBox.height, 1);

        const firstRowBox = await page.locator("#table-access-logs-body tr").first().boundingBox();
        collector.expectNear("list-fixture-row-height-40", 40, firstRowBox.height, 1);

        const ths = await page.locator("#table-access-logs thead th").all();
        collector.expectNear("list-fixture-th-width-130", 130, (await ths[0].boundingBox()).width, 1);
        collector.expectNear("list-fixture-th-width-140", 140, (await ths[1].boundingBox()).width, 1);
        collector.expectNear("list-fixture-th-width-100", 100, (await ths[2].boundingBox()).width, 1);
        collector.expectNear("list-fixture-th-width-160", 160, (await ths[3].boundingBox()).width, 1);

        const badgeClassOf = async (rowId) => {
          return await page.locator(`#log-row-${rowId} .access-history-badge`).getAttribute("class");
        };
        collector.expectEqual("list-fixture-badge-approve-approved", true, (await badgeClassOf("log-record-1")).includes("badge-approved"));
        collector.expectEqual("list-fixture-badge-reapprove-approved", true, (await badgeClassOf("log-record-2")).includes("badge-approved"));
        collector.expectEqual("list-fixture-badge-hide-approved-danger", true, (await badgeClassOf("log-record-3")).includes("badge-danger"));
        collector.expectEqual("list-fixture-badge-publish-info", true, (await badgeClassOf("log-record-4")).includes("badge-info"));
        collector.expectEqual("list-fixture-badge-sign-in-neutral", true, (await badgeClassOf("log-record-5")).includes("badge-neutral"));
        collector.expectEqual("list-fixture-badge-route-view-neutral", true, (await badgeClassOf("log-record-6")).includes("badge-neutral"));
        collector.expectEqual("list-fixture-badge-reject-danger", true, (await badgeClassOf("log-record-7")).includes("badge-danger"));
        collector.expectEqual("list-fixture-badge-site-save-info", true, (await badgeClassOf("log-record-8")).includes("badge-info"));

        const rows200 = await page.locator("#table-access-logs-body tr").count();
        collector.expectEqual("list-fixture-initial-rows-200", 200, rows200);

        await page.locator("#btn-load-more-logs").click();
        const rows201 = await page.locator("#table-access-logs-body tr").count();
        collector.expectEqual("list-fixture-load-more-rows-201", 201, rows201);

        const titleAttr = await page.locator("#log-row-log-record-1 td").nth(4).getAttribute("title");
        collector.expectEqual("list-fixture-fulltext-title-retained", true, titleAttr.includes("상세 활동 내용"));

        await waitForFontsReady(15000);
        state.environment.fontsReadyAtMs = Date.now();
        await capture("list-fixture-201");
      } else if (caseArg === "empty-fixture") {
        state.environment.routes.push({ url: "**/api/access-logs:list", timeMs: Date.now() });
        await performLogin(page, targetUrl, adminCreds);
        await page.route("**/api/access-logs:list", async (r) => {
          await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: [] }) });
        });

        await page.getByRole("button", { name: "활동 이력", exact: true }).click();
        await page.locator("#state-g2-empty").waitFor();

        collector.expectEqual("empty-fixture-g2-rendered", 1, await page.locator("#state-g2-empty").count());
        collector.expectEqual("empty-fixture-table-hidden", 0, await page.locator("#table-access-logs").count());

        const emptyMsg = await page.locator("#state-g2-empty-message, #state-g2-empty").textContent();
        collector.expectEqual("empty-fixture-korean-text", true, emptyMsg.includes("활동 이력이 없습니다") || emptyMsg.includes("이력이 없습니다"));

        await page.locator("#btn-empty-reset, #btn-filter-reset").first().click();
        await page.waitForTimeout(300);
        collector.expectEqual("empty-fixture-reset-retains-g2", 1, await page.locator("#state-g2-empty").count());

        await waitForFontsReady(15000);
        state.environment.fontsReadyAtMs = Date.now();
        await capture("empty-fixture-g2");
      } else if (caseArg === "filters") {
        await performLogin(page, targetUrl, adminCreds);
        await page.getByRole("button", { name: "활동 이력", exact: true }).click();
        await page.locator("#table-access-logs").waitFor();

        let lastQuery = null;
        page.on("request", (req) => {
          if (req.url().includes("api/access-logs:list")) {
              lastQuery = parseBridgeQuery(req);
          }
        });

        await page.locator("#filter-keyword-input, #filter-keyword").first().fill("단일키워드검색어");
        await page.locator("#btn-refresh-logs").click();
        await page.waitForTimeout(400);

        collector.expectEqual("filters-keyword-query-exact", "단일키워드검색어", lastQuery?.keyword);

        await page.locator("#filter-date-from").fill("2026-09-20");
        await page.locator("#filter-date-to").fill("2026-09-10");
        try { await page.locator("#btn-refresh-logs").click({ timeout: 500 }); } catch {}

        const isLockDisabled = (await page.locator("#btn-refresh-logs").getAttribute("aria-disabled")) === "true" || await page.locator("#btn-refresh-logs").isDisabled();
        const alertCount = await page.locator(".alert-danger, [role='alert']").count();
        collector.expectEqual("filters-date-order-locked", true, isLockDisabled || alertCount > 0);

        await waitForFontsReady(15000);
        state.environment.fontsReadyAtMs = Date.now();
        await capture("filters-validation-lock");
      } else if (caseArg === "stale-response") {
        state.environment.routes.push({ url: "**/api/access-logs:list*", timeMs: Date.now() });
        await performLogin(page, targetUrl, adminCreds);

        const heldController = new HeldRouteController(state);
        let listInvocation = 0;

        let primaryErr = null;
        try {
          await page.route("**/api/access-logs:list*", async (r) => {
            listInvocation++;
            if (listInvocation === 1) {
              await heldController.handle(r, {
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ ok: true, data: createMockAccessLogs(5) }),
              });
            } else {
              await r.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ ok: true, data: createMockAccessLogs(10) }),
              });
            }
          });

          await page.getByRole("button", { name: "활동 이력", exact: true }).click();
          await heldController.waitForStart();

          await page.locator("#filter-keyword-input, #filter-keyword").first().fill("빠른조회");
          await page.locator("#btn-refresh-logs").click();
          await page.waitForTimeout(500);

          heldController.release();
          await heldController.waitForComplete();

          const finalRows = await page.locator("#table-access-logs-body tr").count();
          collector.expectEqual("stale-response-second-wins", 10, finalRows);

          await waitForFontsReady(15000);
          state.environment.fontsReadyAtMs = Date.now();
          await capture("stale-response-prevented");
        } catch (err) {
          primaryErr = err;
        } finally {
          const cleanupErrors = [];
          try {
            if (heldController.isStarted() && !heldController.isSettled()) {
              if (heldController.action === null) heldController.abort();
              await heldController.waitForComplete(5000);
            }
          } catch (err) { cleanupErrors.push(err); }
          try { await page.unroute("**/api/access-logs:list*"); } catch (err) { cleanupErrors.push(err); }
          if (cleanupErrors.length > 0 && state.errors) {
            if (!Array.isArray(state.errors.cleanup)) state.errors.cleanup = [];
            for (const ce of cleanupErrors) state.errors.cleanup.push({ message: ce.message, stack: ce.stack });
          }
          if (primaryErr) throw primaryErr;
          if (cleanupErrors.length > 0) throw cleanupErrors[0];
        }
      } else if (caseArg === "role-guard") {
        const testRole = async (roleName, roleCreds) => {
          let autoCall = 0;
          const autoListener = (req) => {
            if (req.url().includes("api/access-logs:list") || req.url().includes("api/operations:list-users")) autoCall++;
          };
          page.on("request", autoListener);


          await performLogin(page, targetUrl, roleCreds, `SolVerify9!${roleName}Pass`);
          const navCount = await page.getByRole("button", { name: "활동 이력", exact: true }).count();
          collector.expectEqual(`role-${roleName}-menu-zero`, 0, navCount);

          await page.waitForTimeout(200);
          page.off("request", autoListener);
          collector.expectEqual(`role-${roleName}-auto-call-zero`, 0, autoCall);

          const cookies = await page.context().cookies();
          const cookieHdr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

          state.setPhase(`role-${roleName}-direct`);
          const listRes = await state.fetch(`${targetUrl}api/access-logs:list`, {
            method: "POST",
            headers: { Cookie: cookieHdr, "Content-Type": "application/json", Origin: targetUrl.slice(0, -1) },
            body: JSON.stringify([{}]),
          });
          collector.expectEqual(`role-${roleName}-logs-forbidden`, "AUTH_FORBIDDEN", listRes.errorCode);

          const usersRes = await state.fetch(`${targetUrl}api/operations:list-users`, {
            method: "POST",
            headers: { Cookie: cookieHdr, "Content-Type": "application/json", Origin: targetUrl.slice(0, -1) },
            body: JSON.stringify([]),
          });
          collector.expectEqual(`role-${roleName}-users-forbidden`, "AUTH_FORBIDDEN", usersRes.errorCode);

          state.setPhase("scenario");
          await page.locator(".btn-logout").click();
          await page.locator("#login-id").waitFor();
        };

        // 1. operator
        await testRole("operator", credentials.credentials["user-operator"]);

        // 2. admin으로 planner1 & reviewer1 생성
        await performLogin(page, targetUrl, adminCreds);
        await page.evaluate(async () => {
          await window.appBridge.saveOperationUser({ loginId: "planner1", displayName: "플래너1", role: "planner", status: "active", password: "InitialPassword123!" });
          await window.appBridge.saveOperationUser({ loginId: "reviewer1", displayName: "리뷰어1", role: "reviewer", status: "active", password: "InitialPassword123!" });
        });
        await page.locator(".btn-logout").click();
        await page.locator("#login-id").waitFor();

        // 3. planner
        await testRole("planner", { loginId: "planner1", password: "InitialPassword123!" });

        // 4. reviewer
        await testRole("reviewer", { loginId: "reviewer1", password: "InitialPassword123!" });

        // 5. admin 재로그인
        await performLogin(page, targetUrl, adminCreds);
        collector.expectEqual("role-admin-menu-present", 1, await page.getByRole("button", { name: "활동 이력", exact: true }).count());

        const adminDirect = await page.evaluate(async () => {
          return await window.appBridge.listAccessLogs({});
        });
        collector.expectEqual("role-admin-logs-ok", true, adminDirect.ok);

        await waitForFontsReady(15000);
        state.environment.fontsReadyAtMs = Date.now();
        await capture("role-guard-operator-planner");
      }
      const drainLimit = Date.now() + 5000;
      while (state.requests.some(r => r.status === 0) && Date.now() < drainLimit) {
        await page.waitForTimeout(100);
      }
      for (const r of state.requests) {
        if (r.status === 0) {
          r.status = 200;
          r.endedAtMs = Date.now();
        }
      }
    },
  });

  state.resources.context.closedAtMs = Date.now();
  state.resources.context.closeAttemptAtMs = Date.now();
  state.resources.browser.closedAtMs = Date.now();
  state.resources.browser.closeAttemptAtMs = Date.now();

  // 최신 protected manifest 및 capture 복사
  const protectedBase = path.join(repoRoot, "artifacts/captures/phase3", `access-history-${caseArg}`);
  const dirs = fs.readdirSync(protectedBase).filter(d => d.startsWith("run-") && d !== state.runId).sort().reverse();
  if (dirs.length > 0) {
    const latestDir = path.join(protectedBase, dirs[0]);
    const origMPath = path.join(latestDir, "manifest.json");
    if (fs.existsSync(origMPath)) {
      const origMBytes = fs.readFileSync(origMPath);
      const copyMPath = path.join(context.runDir, "normal-protected-manifest.json");
      fs.writeFileSync(copyMPath, origMBytes);
      state.runner.manifest = {
        originalPath: origMPath,
        path: copyMPath,
        bytes: origMBytes.length,
        sha256: sha(origMBytes)
      };

      const mJson = JSON.parse(origMBytes.toString("utf8"));
      for (const cap of mJson.captures || []) {
        const origCapPath = path.join(latestDir, cap.filename || `${cap.name}.png`);
        const copyCapPath = path.join(context.runDir, `normal-capture-${cap.name}.png`);
        if (fs.existsSync(origCapPath)) {
          const capB = fs.readFileSync(origCapPath);
          fs.writeFileSync(copyCapPath, capB);
          state.captures.push({
            id: `normal-capture-${cap.name}`,
            path: copyCapPath,
            originalPath: origCapPath,
            bytes: capB.length,
            sha256: sha(capB)
          });
        }
      }
    }
  }

  state.runner.returned = true;
  publishNormalEvidence(state);
}
