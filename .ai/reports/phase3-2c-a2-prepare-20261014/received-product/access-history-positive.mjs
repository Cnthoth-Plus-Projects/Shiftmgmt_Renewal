// 활동 이력 정상 6개 시나리오 공통 실행기 (runScreenCheck 실제 호출)
import path from "node:path";
import fs from "node:fs";
import { runScreenCheck } from "../lib/ui-check.mjs";
import {
  AssertionCollector,
  createMockAccessLogs,
  parseBridgeQuery,
  HeldRouteController,
  performLogin,
  loadContract,
  performWorkerIpcHandshake,
} from "./access-history-shared.mjs";

const repoRoot = path.resolve(process.cwd());

// CLI 인수 검문 (A01, A-N03)
const rawArgs = process.argv.slice(2);
if (rawArgs.length !== 1 || !rawArgs[0].startsWith("--case=")) {
  process.stderr.write("[오류] 정확히 단일 --case=<케이스> 인수가 필요합니다.\n");
  process.exit(1);
}

const caseArg = rawArgs[0].slice(7).trim();
const contract = loadContract();
const POSITIVE_CASES = new Set(contract.privateCases?.["access-history-positive.mjs"] || []);

if (!POSITIVE_CASES.has(caseArg)) {
  process.stderr.write(`[오류] access-history-positive.mjs에 등록되지 않은 케이스: '${caseArg}'\n`);
  process.exit(1);
}

// 소유 부모 프로세스 IPC 핸드셰이크 검문 (A03, A-N03, A-N04)
const { context } = await performWorkerIpcHandshake(caseArg, contract);
const targetUrl = context.url;
const bootstrapFile = context.bootstrapFile;

if (!bootstrapFile || !fs.existsSync(bootstrapFile)) {
  process.stderr.write("[오류] 유효한 bootstrap 파일이 존재하지 않습니다.\n");
  process.exit(1);
}

const credentials = JSON.parse(fs.readFileSync(bootstrapFile, "utf8"));
const adminCreds = { ...credentials.credentials["user-admin"] };

const collector = new AssertionCollector(caseArg, contract);

await runScreenCheck({
  id: `access-history-${caseArg}`,
  url: targetUrl,
  steps: async ({ page, capture, waitForFontsReady }) => {
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
      collector.expectEqual("live-admin-home-reentry-ok", true, true);

      await page.locator(".btn-logout").click();
      await page.locator("#login-id").waitFor();
      collector.expectEqual("live-admin-logout-ok", true, true);

      await waitForFontsReady(15000);
      await capture("live-admin");
    } else if (caseArg === "list-fixture") {
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
      collector.expectNear("list-fixture-date-width-132", 132, dBox.width, 2);
      collector.expectNear("list-fixture-date-height-34", 34, dBox.height, 2);

      const firstRowBox = await page.locator("#table-access-logs-body tr").first().boundingBox();
      collector.expectNear("list-fixture-row-height-40", 40, firstRowBox.height, 2);

      const ths = await page.locator("#table-access-logs thead th").all();
      collector.expectNear("list-fixture-th-width-130", 130, (await ths[0].boundingBox()).width, 4);
      collector.expectNear("list-fixture-th-width-140", 140, (await ths[1].boundingBox()).width, 4);
      collector.expectNear("list-fixture-th-width-100", 100, (await ths[2].boundingBox()).width, 4);
      collector.expectNear("list-fixture-th-width-160", 160, (await ths[3].boundingBox()).width, 4);

      // 8개 대표 배지 클래스 실측
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
      await capture("list-fixture-201");
    } else if (caseArg === "empty-fixture") {
      await performLogin(page, targetUrl, adminCreds);
      await page.route("**/api/access-logs:list", async (r) => {
        await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: [] }) });
      });

      await page.getByRole("button", { name: "활동 이력", exact: true }).click();
      await page.locator("#state-g2-empty").waitFor();
      collector.expectEqual("empty-fixture-card-exists", 1, await page.locator("#state-g2-empty").count());

      const cBox = await page.locator("#state-g2-empty").boundingBox();
      collector.expectNear("empty-fixture-card-width-600", 600, cBox.width, 4);

      const filterCount =
        (await page.locator("#filter-date-from").count()) +
        (await page.locator("#filter-date-to").count()) +
        (await page.locator("#filter-user-select").count()) +
        (await page.locator("#filter-action-select").count()) +
        (await page.locator("#filter-keyword-input").count());
      collector.expectEqual("empty-fixture-filters-count-5", 5, filterCount);

      await page.locator("#filter-date-from").fill("2025-01-01");
      let resetReq = 0;
      page.on("request", (req) => {
        if (req.url().includes("api/access-logs:list")) resetReq++;
      });
      await page.locator("#btn-empty-reset").click();
      await page.waitForTimeout(300);
      collector.expectEqual("empty-fixture-reset-single-request", 1, resetReq);

      await waitForFontsReady(15000);
      await capture("empty-fixture-g2");
    } else if (caseArg === "filters") {
      await performLogin(page, targetUrl, adminCreds);
      await page.getByRole("button", { name: "활동 이력", exact: true }).click();
      await page.locator("#table-access-logs").waitFor();

      // R32C-01: keyword 입력 순간 pending status 및 old rows 0
      await page.locator("#filter-keyword-input").fill("신규검색");
      const rowsImmediate = await page.locator("#table-access-logs-body tr").count();
      const statusBanner = await page.locator(".access-history-loading-banner[role='status']").count();
      const countTyping = await page.locator("#access-history-count-label").textContent();
      const kwFocused = await page.locator("#filter-keyword-input").evaluate((el) => document.activeElement === el);

      collector.expectEqual("filters-r32c01-rows-cleared", 0, rowsImmediate);
      collector.expectEqual("filters-r32c01-loading-role-status", 1, statusBanner);
      collector.expectEqual("filters-r32c01-count-typing-label", "검색 입력 중…", countTyping);
      collector.expectEqual("filters-r32c01-input-focus-retained", true, kwFocused);

      let kwReq = 0;
      page.on("request", (req) => {
        if (req.url().includes("api/access-logs:list")) kwReq++;
      });
      await page.waitForTimeout(400);
      collector.expectEqual("filters-keyword-debounce-single-request", 1, kwReq);

      // 날짜 역전 validation & aria-disabled 조건 잠금
      await page.locator("#filter-date-from").fill("2026-09-30");
      await page.locator("#filter-date-to").fill("2026-09-01");
      await page.waitForTimeout(200);

      let blockedReq = 0;
      page.on("request", (req) => {
        if (req.url().includes("api/access-logs:list")) blockedReq++;
      });

      collector.expectEqual("filters-date-invalid-desc-visible", 1, await page.locator("#filter-date-error-desc").count());
      collector.expectEqual("filters-date-invalid-requests-zero", 0, blockedReq);

      const refDis = await page.locator("#btn-refresh-logs").evaluate((el) => el.disabled);
      const refAria = await page.locator("#btn-refresh-logs").getAttribute("aria-disabled");
      collector.expectEqual("filters-refresh-native-disabled-false", false, refDis);
      collector.expectEqual("filters-refresh-aria-disabled-true", "true", refAria);

      await page.locator("#btn-refresh-logs").focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("Space");
      await page.locator("#btn-refresh-logs").click({ force: true });
      await page.waitForTimeout(300);
      collector.expectEqual("filters-refresh-actions-blocked-zero", 0, blockedReq);

      await waitForFontsReady(15000);
      await capture("filters-validation-lock");
    } else if (caseArg === "stale-response") {
      await performLogin(page, targetUrl, adminCreds);

      const held = new HeldRouteController(15000);

      await page.route("**/api/access-logs:list*", async (route) => {
        const query = parseBridgeQuery(route.request());
        if (query.keyword === "slow") {
          await held.handle(route);
        } else {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ok: true,
              data: [
                {
                  id: "fast-1",
                  userId: "u1",
                  loginId: "admin",
                  displayName: "관리자",
                  role: "admin",
                  actionType: "sign-in",
                  actionLabel: "로그인",
                  occurredAt: "2026-09-30T10:00:00Z",
                  details: "fast",
                },
              ],
            }),
          });
        }
      });

      await page.getByRole("button", { name: "활동 이력", exact: true }).click();
      await page.locator("#table-access-logs").waitFor();

      // slow 검색어 입력 -> held 진입 대기
      await page.locator("#filter-keyword-input").fill("slow");
      await held.waitForStart();
      collector.expectEqual("stale-slow-started", true, held.isStarted);

      // fast 검색어 입력 -> fast 완료
      await page.locator("#filter-keyword-input").fill("fast");
      await page.waitForTimeout(400);

      // slow 응답 해제 및 핸들러 완료 대기
      await held.release({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: [
            {
              id: "slow-999",
              userId: "u9",
              loginId: "admin",
              displayName: "관리자",
              role: "admin",
              actionType: "sign-in",
              actionLabel: "로그인",
              occurredAt: "2026-09-30T09:00:00Z",
              details: "slow",
            },
          ],
        }),
      });
      await held.waitForComplete();
      collector.expectEqual("stale-slow-completed", true, held.isCompleted);

      await page.waitForTimeout(300);
      collector.expectEqual("stale-fast-row-retained", 1, await page.locator("#log-row-fast-1").count());
      collector.expectEqual("stale-slow-row-ignored", 0, await page.locator("#log-row-slow-999").count());

      await waitForFontsReady(15000);
      await capture("stale-response-prevented");
    } else if (caseArg === "role-guard") {
      // 비관리자 direct API 검증 헬퍼 (별도 APIRequestContext로 쿠키 전송하여 page 브라우저 무오류 유지)
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

        // APIRequestContext로 direct 호출 (브라우저 콘솔 오염 방지)
        const cookies = await page.context().cookies();
        const cookieHdr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

        const listRes = await fetch(`${targetUrl}api/access-logs:list`, {
          method: "POST",
          headers: { Cookie: cookieHdr, "Content-Type": "application/json", Origin: targetUrl.slice(0, -1) },
          body: JSON.stringify([{}]),
        });
        const listData = await listRes.json();
        collector.expectEqual(`role-${roleName}-logs-forbidden`, "AUTH_FORBIDDEN", listData.errorCode);

        const usersRes = await fetch(`${targetUrl}api/operations:list-users`, {
          method: "POST",
          headers: { Cookie: cookieHdr, "Content-Type": "application/json", Origin: targetUrl.slice(0, -1) },
          body: JSON.stringify([]),
        });
        const usersData = await usersRes.json();
        collector.expectEqual(`role-${roleName}-users-forbidden`, "AUTH_FORBIDDEN", usersData.errorCode);

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

      // 5. admin
      await performLogin(page, targetUrl, adminCreds);
      collector.expectEqual("role-admin-menu-present", 1, await page.getByRole("button", { name: "활동 이력", exact: true }).count());

      const adminDirect = await page.evaluate(async () => {
        return await window.appBridge.listAccessLogs({});
      });
      collector.expectEqual("role-admin-logs-ok", true, adminDirect.ok);

      await waitForFontsReady(15000);
      await capture("role-guard-operator-planner");
    }

    // 필수 Assertion Coverage 전수 검증
    collector.validateRequiredCoverage();

    // action-assertions.json 산출물 저장
    const runDir = process.env.SHIFT_RUN_DIR;
    if (runDir) {
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, "action-assertions.json"), JSON.stringify(collector.toJSON(), null, 2));
    }
  },
});
