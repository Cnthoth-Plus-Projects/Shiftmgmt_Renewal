// 실제 Chrome 기반 로그인 L1~L5 시나리오 검증 스크립트
//
//   node scripts/ui-checks/login.mjs <http://127.0.0.1:포트/> [--case=flow|locked|recovery|session-error|post-change-null|post-change-error|post-change-race-success|post-change-race-null|post-change-race-error|post-change-race-login|post-change-first-held]
//
import os from "node:os";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { runScreenCheck, validateTargetUrl } from "../lib/ui-check.mjs";

const targetUrl = process.argv[2];
if (!targetUrl) {
  process.stderr.write("쓰는 법: node scripts/ui-checks/login.mjs <http://127.0.0.1:포트/> [--case=flow|locked|recovery|session-error|post-change-null|post-change-error|post-change-race-success|post-change-race-null|post-change-race-error|post-change-race-login|post-change-first-held]\n");
  process.exit(1);
}

// 1. URL 형식 사전 검증 (실패 시 RC 1)
try {
  validateTargetUrl(targetUrl);
} catch (err) {
  process.stderr.write(`[URL 검증 실패] ${err.message}\n`);
  process.exit(1);
}

const caseArg = process.argv.find((a) => a.startsWith("--case="))?.split("=")[1] || "flow";
const allowedCases = [
  "flow",
  "locked",
  "recovery",
  "session-error",
  "post-change-null",
  "post-change-error",
  "post-change-race-success",
  "post-change-race-null",
  "post-change-race-error",
  "post-change-race-login",
  "post-change-first-held",
];
if (!allowedCases.includes(caseArg)) {
  process.stderr.write(`[오류] 지원하지 않는 케이스입니다: ${caseArg}\n`);
  process.exit(1);
}

const repoRoot = path.resolve(process.cwd());

const check = (cond, msg) => {
  if (!cond) {
    process.stderr.write(`[오류] ${msg}\n`);
    process.exit(2);
  }
};

// 2. os.tmpdir() 및 격리 디렉토리 경계 검증 (C31-06)
const rawTemp = os.tmpdir();
let tempRoot = path.resolve(rawTemp);
try {
  if (existsSync(tempRoot)) tempRoot = realpathSync(tempRoot);
} catch {}

const userDataDir = process.env.SHIFTMGMT_USER_DATA_DIR;
check(userDataDir && path.isAbsolute(userDataDir), "SHIFTMGMT_USER_DATA_DIR 환경변수에 절대 경로가 지정되지 않았습니다.");

const resolvedUserDataDir = path.resolve(userDataDir);
const relUserDataToTemp = path.relative(tempRoot, resolvedUserDataDir);
check(!relUserDataToTemp.startsWith("..") && !path.isAbsolute(relUserDataToTemp) && relUserDataToTemp !== "", "userDataDir이 os.tmpdir() 내부의 격리 폴더가 아닙니다.");

const tempSegments = relUserDataToTemp.split(path.sep).filter(Boolean);
check(tempSegments.length === 1, "userDataDir은 os.tmpdir() 바로 아래의 하위 폴더여야 합니다.");

const relUserDataToRepo = path.relative(repoRoot, resolvedUserDataDir);
check(relUserDataToRepo.startsWith("..") || path.isAbsolute(relUserDataToRepo), "userDataDir이 저장소 내부에 위치할 수 없습니다. 격리 폴더를 사용하세요.");

let realUserDataDir = resolvedUserDataDir;
if (existsSync(resolvedUserDataDir)) {
  try {
    realUserDataDir = realpathSync(resolvedUserDataDir);
  } catch (err) {
    check(false, `userDataDir 실제 경로 확인 실패: ${err.message}`);
  }
  const relRealUserDataToTemp = path.relative(tempRoot, realUserDataDir);
  check(!relRealUserDataToTemp.startsWith("..") && !path.isAbsolute(relRealUserDataToTemp) && relRealUserDataToTemp !== "", "userDataDir 심볼릭 링크 대상이 os.tmpdir() 내부의 격리 폴더가 아닙니다.");
  const realTempSegments = relRealUserDataToTemp.split(path.sep).filter(Boolean);
  check(realTempSegments.length === 1, "userDataDir 실제 대상이 os.tmpdir() 바로 아래의 격리 폴더가 아닙니다.");
  const relRealUserDataToRepo = path.relative(repoRoot, realUserDataDir);
  check(relRealUserDataToRepo.startsWith("..") || path.isAbsolute(relRealUserDataToRepo), "userDataDir 심볼릭 링크 대상이 저장소 내부에 위치할 수 없습니다.");
}

// 3. SHIFTMGMT_UI_BOOTSTRAP_FILE 검증 (<격리폴더>/data/bootstrap-credentials.json 정확한 파일)
const bootstrapPath = process.env.SHIFTMGMT_UI_BOOTSTRAP_FILE;
check(bootstrapPath && path.isAbsolute(bootstrapPath), "SHIFTMGMT_UI_BOOTSTRAP_FILE 환경변수에 절대 경로가 지정되지 않았습니다.");

const resolvedBootstrapPath = path.resolve(bootstrapPath);
const expectedBoot = path.normalize(path.resolve(resolvedUserDataDir, "data", "bootstrap-credentials.json"));
check(path.normalize(resolvedBootstrapPath) === expectedBoot, "bootstrap 파일 경로는 <격리폴더>/data/bootstrap-credentials.json 정확한 경로여야 합니다.");
check(existsSync(resolvedBootstrapPath), "bootstrap 파일이 존재하지 않습니다.");

let realBootPath = resolvedBootstrapPath;
try {
  realBootPath = realpathSync(resolvedBootstrapPath);
} catch (err) {
  check(false, `bootstrap 파일 실제 경로 확인 실패: ${err.message}`);
}

const relRealBootToUserData = path.relative(realUserDataDir, realBootPath);
check(!relRealBootToUserData.startsWith("..") && !path.isAbsolute(relRealBootToUserData), "bootstrap 파일 심볼릭 링크 대상이 지정된 격리 데이터 폴더 내부에 위치하지 않습니다.");
const relRealBootToRepo = path.relative(repoRoot, realBootPath);
check(relRealBootToRepo.startsWith("..") || path.isAbsolute(relRealBootToRepo), "bootstrap 파일 심볼릭 링크 대상이 저장소 내부에 위치할 수 없습니다.");

// 4. 복구 비밀 파일 검증 (어떤 비밀 파일도 읽기 전에 완료)
let resolvedRecSecretPath = null;
const recSecretFile = process.env.SHIFTMGMT_UI_RECOVERY_SECRET_FILE;
if (caseArg === "recovery" || recSecretFile) {
  check(recSecretFile && path.isAbsolute(recSecretFile), "SHIFTMGMT_UI_RECOVERY_SECRET_FILE 환경변수에 절대 경로가 지정되지 않았습니다.");
  resolvedRecSecretPath = path.resolve(recSecretFile);
  const relRecToUserData = path.relative(resolvedUserDataDir, resolvedRecSecretPath);
  check(!relRecToUserData.startsWith("..") && !path.isAbsolute(relRecToUserData) && relRecToUserData !== "", "복구 비밀 파일이 지정된 격리 데이터 폴더 내부에 위치하지 않습니다.");
  const relRecToRepo = path.relative(repoRoot, resolvedRecSecretPath);
  check(relRecToRepo.startsWith("..") || path.isAbsolute(relRecToRepo), "복구 비밀 파일이 저장소 내부에 위치할 수 없습니다.");
  if (caseArg === "recovery") check(existsSync(resolvedRecSecretPath), "복구 비밀 파일이 존재하지 않습니다.");
  if (existsSync(resolvedRecSecretPath)) {
    let realRecPath = resolvedRecSecretPath;
    try {
      realRecPath = realpathSync(resolvedRecSecretPath);
    } catch (err) {
      check(false, `복구 비밀 파일 실제 경로 확인 실패: ${err.message}`);
    }
    const relRealRecToUserData = path.relative(realUserDataDir, realRecPath);
    check(!relRealRecToUserData.startsWith("..") && !path.isAbsolute(relRealRecToUserData), "복구 비밀 파일 심볼릭 링크 대상이 격리 데이터 폴더 내부에 위치하지 않습니다.");
    const relRealRecToRepo = path.relative(repoRoot, realRecPath);
    check(relRealRecToRepo.startsWith("..") || path.isAbsolute(relRealRecToRepo), "복구 비밀 파일 심볼릭 링크 대상이 저장소 내부에 위치할 수 없습니다.");
  }
}

// 5. 모든 경계 검증 완료 후 비밀 파일 파싱
let bootstrapData;
try {
  bootstrapData = JSON.parse(readFileSync(resolvedBootstrapPath, "utf8"));
} catch (err) {
  process.stderr.write(`[오류] bootstrap 파일 파싱 실패: ${err.message}\n`);
  process.exit(2);
}

const adminCreds = bootstrapData.credentials?.["user-admin"];
check(adminCreds, "bootstrap 파일에 user-admin 자격증명이 없습니다.");

await runScreenCheck({
  id: "login",
  url: targetUrl,
  steps: async ({ page, capture, waitForFontsReady }) => {
    const loginAdminToL4 = async () => {
      const idInput = page.locator("#login-id");
      const pwInput = page.locator("#login-password");
      const submitBtn = page.locator("button[type='submit']");
      await idInput.waitFor({ state: "visible", timeout: 10_000 });
      await idInput.fill(adminCreds.loginId);
      await pwInput.fill(adminCreds.password);
      await submitBtn.click();
      const l4SubmitBtn = page.locator("#l4-btn-submit");
      await l4SubmitBtn.waitFor({ state: "visible", timeout: 10_000 });
      return { idInput, pwInput, submitBtn, l4SubmitBtn };
    };

    const logoutAndBackToL1 = async (idInput) => {
      const logoutBtn = page.locator(".btn-logout");
      await logoutBtn.waitFor({ state: "visible", timeout: 15_000 });
      await waitForFontsReady(15_000);
      await logoutBtn.click();
      await idInput.waitFor({ state: "visible", timeout: 10_000 });
    };

    const wrapSessionCounter = async () => {
      await page.evaluate(() => {
        window.__sessionPromiseSettledCount = 0;
        const orig = window.appBridge.getSession.bind(window.appBridge);
        window.appBridge.getSession = async (...args) => {
          try {
            const res = await orig(...args);
            window.__sessionPromiseSettledCount++;
            return res;
          } catch (err) {
            window.__sessionPromiseSettledCount++;
            throw err;
          }
        };
      });
    };

    if (caseArg === "flow") {
      const heading = page.getByRole("heading", { name: "교대근무관리 시스템", level: 1 });
      await heading.waitFor({ state: "visible", timeout: 10_000 });

      const idInput = page.locator("#login-id");
      const pwInput = page.locator("#login-password");
      const submitBtn = page.locator("button[type='submit']");

      await idInput.waitFor({ state: "visible", timeout: 10_000 });
      await capture("login-initial");

      await idInput.fill("non-existent-user-xyz");
      await pwInput.fill("wrong-password-9999");
      await submitBtn.click();

      const errorBanner = page.locator(".error-banner");
      await errorBanner.waitFor({ state: "visible", timeout: 10_000 });

      await idInput.fill("");
      await pwInput.fill("");
      await capture("login-failure");

      await idInput.fill(adminCreds.loginId);
      await pwInput.fill(adminCreds.password);
      await submitBtn.click();

      const l4SubmitBtn = page.locator("#l4-btn-submit");
      await l4SubmitBtn.waitFor({ state: "visible", timeout: 10_000 });

      const l4Errors = await page.locator(".error-banner").all();
      for (const err of l4Errors) {
        if (await err.isVisible()) throw new Error("L2 로그인 실패 오류 배너가 L4 화면에 남아있습니다.");
      }

      await capture("password-change");

      const newPwInput = page.locator("#l4-new-pw");
      const confPwInput = page.locator("#l4-confirm-pw");
      const curPwInput = page.locator("#l4-current-pw");
      const ruleDescEl = page.locator("#l4-rule-desc");

      let changePasswordCalls = 0;
      page.on("request", (req) => {
        if (req.url().includes("auth:change-password")) {
          changePasswordCalls++;
        }
      });

      // 1) 약한 새 비밀번호 검증 (N1)
      await curPwInput.fill(adminCreds.password);
      await newPwInput.fill("weak");
      await confPwInput.fill("weak");

      if (await l4SubmitBtn.evaluate((el) => el.disabled)) {
        throw new Error("약한 비밀번호에서 변경 버튼이 native disabled 상태여서 키보드 포커스가 차단됩니다.");
      }
      await l4SubmitBtn.focus();
      const isFocusedWeak = await l4SubmitBtn.evaluate((el) => document.activeElement === el);
      if (!isFocusedWeak) {
        throw new Error("약한 비밀번호 상태에서 변경 버튼에 포커스할 수 없습니다.");
      }

      const weakAriaDisabled = await l4SubmitBtn.getAttribute("aria-disabled");
      const weakDescribedBy = await l4SubmitBtn.getAttribute("aria-describedby");
      const weakDescText = (await ruleDescEl.textContent()) || "";
      if (weakAriaDisabled !== "true") {
        throw new Error(`약한 비밀번호에서 aria-disabled='true'가 누락되었습니다: ${weakAriaDisabled}`);
      }
      if (weakDescribedBy !== "l4-rule-desc" || !weakDescText.includes("규칙을 충족")) {
        throw new Error(`약한 비밀번호에서 사유 안내 연결이 올바르지 않습니다: describedBy=${weakDescribedBy}, text=${weakDescText}`);
      }

      const startCallsWeak = changePasswordCalls;
      await l4SubmitBtn.click({ force: true });
      await l4SubmitBtn.focus();
      await page.keyboard.press("Space");
      await page.keyboard.press("Enter");
      await confPwInput.press("Enter");
      await page.waitForTimeout(200);
      if (changePasswordCalls - startCallsWeak !== 0) {
        throw new Error(`약한 비밀번호에서 changePassword API가 호출되었습니다: ${changePasswordCalls - startCallsWeak}회`);
      }

      // 2) 강한PW 확인불일치 검증 (N2)
      await newPwInput.fill("StrongP@ss2026!");
      await confPwInput.fill("MismatchP@ss2026!");

      if (await l4SubmitBtn.evaluate((el) => el.disabled)) {
        throw new Error("비밀번호 확인 불일치에서 변경 버튼이 native disabled 상태입니다.");
      }
      await l4SubmitBtn.focus();
      const isFocusedMis = await l4SubmitBtn.evaluate((el) => document.activeElement === el);
      if (!isFocusedMis) {
        throw new Error("불일치 상태에서 변경 버튼에 포커스할 수 없습니다.");
      }

      const misAriaDisabled = await l4SubmitBtn.getAttribute("aria-disabled");
      const misDescribedBy = await l4SubmitBtn.getAttribute("aria-describedby");
      const misDescText = (await ruleDescEl.textContent()) || "";
      if (misAriaDisabled !== "true") {
        throw new Error(`불일치 상태에서 aria-disabled='true'가 누락되었습니다: ${misAriaDisabled}`);
      }
      if (misDescribedBy !== "l4-rule-desc" || !misDescText.includes("일치하지 않습니다")) {
        throw new Error(`불일치 사유 안내가 올바르지 않습니다: text=${misDescText}`);
      }

      const startCallsMis = changePasswordCalls;
      await l4SubmitBtn.click({ force: true });
      await l4SubmitBtn.focus();
      await page.keyboard.press("Space");
      await page.keyboard.press("Enter");
      await confPwInput.press("Enter");
      await page.waitForTimeout(200);
      if (changePasswordCalls - startCallsMis !== 0) {
        throw new Error(`불일치 상태에서 changePassword API가 호출되었습니다: ${changePasswordCalls - startCallsMis}회`);
      }

      // 3) 잘못된 현재 비밀번호 제출 검증
      await curPwInput.fill("WrongCurrentPw2026!");
      await newPwInput.fill("ValidNewStrongP@ss2026!#1");
      await confPwInput.fill("ValidNewStrongP@ss2026!#1");
      await l4SubmitBtn.click();

      const l4CurrentPwError = page.locator(".error-banner");
      await l4CurrentPwError.waitFor({ state: "visible", timeout: 10_000 });
      if (!(await l4SubmitBtn.isVisible())) throw new Error("잘못된 현재 비밀번호 제출 후 L4 화면 이탈");
      if (await page.locator(".btn-logout").isVisible().catch(() => false)) throw new Error("잘못된 현재 비밀번호로 셸 우회 진입");

      // 4) 올바른 현재 비밀번호 + 유효 새 비밀번호로 키보드 Enter 제출 검증 (N3)
      const nextStrongPw = "NewStrongP@ss2026!#" + Math.random().toString(36).slice(2, 6);
      await curPwInput.fill(adminCreds.password);
      await newPwInput.fill(nextStrongPw);
      await confPwInput.fill(nextStrongPw);
      await confPwInput.press("Enter");

      await logoutAndBackToL1(idInput);
      await capture("logout");
    } else if (caseArg === "locked") {
      const idInput = page.locator("#login-id");
      const pwInput = page.locator("#login-password");
      const submitBtn = page.locator("button[type='submit']");
      await idInput.waitFor({ state: "visible", timeout: 10_000 });

      for (let i = 0; i < 6; i++) {
        await idInput.fill(adminCreds.loginId);
        await pwInput.fill("wrong-guess-" + i);
        await submitBtn.click();
        await page.waitForTimeout(300);
        if (await page.locator(".lock-title").isVisible()) break;
      }

      const lockTitle = page.locator(".lock-title");
      await lockTitle.waitFor({ state: "visible", timeout: 10_000 });
      await capture("account-locked");

      const backBtn = page.getByRole("button", { name: "로그인 화면으로 돌아가기" });
      await backBtn.click();
      await idInput.waitFor({ state: "visible", timeout: 10_000 });
    } else if (caseArg === "recovery") {
      const recoveryKey = readFileSync(resolvedRecSecretPath, "utf8").trim();
      const recLink = page.getByRole("button", { name: "[관리자 복구]" });
      await recLink.waitFor({ state: "visible", timeout: 10_000 });
      await recLink.click();

      const keyInput = page.locator("#l5-key");
      await keyInput.waitFor({ state: "visible", timeout: 10_000 });
      await capture("recovery-form");

      await keyInput.fill(recoveryKey);
      await page.locator("button[type='submit']").click();

      const tempNotice = page.locator(".temp-password-box");
      await tempNotice.waitFor({ state: "visible", timeout: 10_000 });

      const tempPwValEl = page.locator(".temp-password-value");
      await tempPwValEl.waitFor({ state: "visible", timeout: 10_000 });
      const tempPassword = (await tempPwValEl.textContent())?.trim();
      if (!tempPassword) throw new Error("임시 비밀번호 값을 가져오지 못했습니다.");

      const redactedNotice = "임시 비밀번호는 시험 캡처에서 가렸습니다";
      await page.evaluate((msg) => {
        const el = document.querySelector(".temp-password-value");
        if (el) el.textContent = msg;
      }, redactedNotice);

      const maskedText = (await tempPwValEl.textContent())?.trim();
      if (maskedText !== redactedNotice) {
        throw new Error("임시 비밀번호 가림 처리 실패");
      }

      await capture("recovery-temp-password-redacted");

      const idInput = page.locator("#login-id");
      const pwInput = page.locator("#login-password");
      const submitBtn = page.locator("button[type='submit']");
      await idInput.fill(adminCreds.loginId);
      await pwInput.fill(tempPassword);
      await submitBtn.click();

      const l4SubmitBtn = page.locator("#l4-btn-submit");
      await l4SubmitBtn.waitFor({ state: "visible", timeout: 10_000 });

      const recNextPw = "RecStrongP@ss2026!#" + Math.random().toString(36).slice(2, 6);
      await page.locator("#l4-current-pw").fill(tempPassword);
      await page.locator("#l4-new-pw").fill(recNextPw);
      await page.locator("#l4-confirm-pw").fill(recNextPw);
      await l4SubmitBtn.click();

      await logoutAndBackToL1(idInput);
    } else if (caseArg === "session-error") {
      let failSession = true;
      await page.route("**/api/auth:get-session", async (route) => {
        if (failSession) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: false, errorCode: "SESSION_FETCH_ERROR", message: "서버 세션 정보를 조회하지 못했습니다." }),
          });
        } else {
          await route.continue();
        }
      });

      await page.reload({ waitUntil: "load" });

      const retryBtn = page.getByRole("button", { name: "다시 시도" });
      await retryBtn.waitFor({ state: "visible", timeout: 10_000 });
      const errTitle = page.locator(".server-error-title");
      await errTitle.waitFor({ state: "visible", timeout: 10_000 });
      await capture("session-error-retry");

      failSession = false;
      await retryBtn.click();

      const idInput = page.locator("#login-id");
      await idInput.waitFor({ state: "visible", timeout: 10_000 });
      await capture("session-error-recovered");

      await page.unroute("**/api/auth:get-session");
    } else if (caseArg === "post-change-null" || caseArg === "post-change-error") {
      let changePasswordCallCount = 0;
      let interceptedGetSessionOnce = false;

      await page.route("**/api/auth:change-password", async (route) => {
        changePasswordCallCount++;
        await route.continue();
      });

      await page.route("**/api/auth:get-session", async (route) => {
        if (changePasswordCallCount > 0 && !interceptedGetSessionOnce) {
          interceptedGetSessionOnce = true;
          if (caseArg === "post-change-null") {
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: null }) });
          } else {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ ok: false, errorCode: "SESSION_RECHECK_FAILED", message: "세션 정보를 일시적으로 확인하지 못했습니다." }),
            });
          }
        } else {
          await route.continue();
        }
      });

      const { idInput, pwInput, submitBtn, l4SubmitBtn } = await loginAdminToL4();
      const nextStrongPw = "PostChgStrongP@ss2026!#" + Math.random().toString(36).slice(2, 6);
      await page.locator("#l4-current-pw").fill(adminCreds.password);
      await page.locator("#l4-new-pw").fill(nextStrongPw);
      await page.locator("#l4-confirm-pw").fill(nextStrongPw);
      await l4SubmitBtn.click();

      if (caseArg === "post-change-null") {
        const changedBanner = page.locator(".password-changed-banner");
        await changedBanner.waitFor({ state: "visible", timeout: 10_000 });
        const bannerText = (await changedBanner.textContent()) || "";
        if (!bannerText.includes("비밀번호가 정상적으로 변경되었습니다")) throw new Error(`L1 안내 문구 불일치: ${bannerText}`);
        if ((await pwInput.inputValue()) !== "") throw new Error("비밀번호 입력란이 비워지지 않았습니다.");
        await capture("post-change-null-l1");

        await idInput.fill(adminCreds.loginId);
        await pwInput.fill(nextStrongPw);
        await submitBtn.click();
        if (changePasswordCallCount !== 1) throw new Error(`changePassword 호출 횟수 불일치: ${changePasswordCallCount}`);
        await logoutAndBackToL1(idInput);
      } else {
        const verifyContainer = page.locator(".session-verify-container");
        await verifyContainer.waitFor({ state: "visible", timeout: 10_000 });
        const retryBtn = page.locator("#btn-retry-session");
        const goToLoginBtn = page.locator("#btn-go-to-login");
        await retryBtn.waitFor({ state: "visible", timeout: 10_000 });
        await goToLoginBtn.waitFor({ state: "visible", timeout: 10_000 });
        await capture("post-change-error-view");

        await retryBtn.click();
        if (changePasswordCallCount !== 1) throw new Error(`세션 재확인 시 changePassword 호출됨: ${changePasswordCallCount}`);
        await logoutAndBackToL1(idInput);
      }

      await page.unroute("**/api/auth:change-password");
      await page.unroute("**/api/auth:get-session");
    } else if (caseArg === "post-change-first-held") {
      let changePasswordCallCount = 0;
      let getSessionCount = 0;
      let firstSessionHeldResolve;
      const firstSessionHeldPromise = new Promise((r) => { firstSessionHeldResolve = r; });
      let firstSessionStartedResolve;
      const firstSessionStartedPromise = new Promise((r) => { firstSessionStartedResolve = r; });

      await page.route("**/api/auth:change-password", async (route) => {
        changePasswordCallCount++;
        if (changePasswordCallCount === 1) {
          await route.continue();
        } else {
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ ok: false, errorCode: "DUPLICATE_CHANGE_PASSWORD", message: "중복 변경 요청 차단" }),
          });
        }
      });

      await page.route("**/api/auth:get-session", async (route) => {
        if (changePasswordCallCount > 0) {
          getSessionCount++;
          if (getSessionCount === 1) {
            firstSessionStartedResolve();
            await firstSessionHeldPromise;
            await route.continue();
          } else {
            await route.continue();
          }
        } else {
          await route.continue();
        }
      });

      const { idInput, l4SubmitBtn } = await loginAdminToL4();
      const nextStrongPw = "PostFirstHeldP@ss2026!#" + Math.random().toString(36).slice(2, 6);
      await page.locator("#l4-current-pw").fill(adminCreds.password);
      await page.locator("#l4-new-pw").fill(nextStrongPw);
      await page.locator("#l4-confirm-pw").fill(nextStrongPw);
      await l4SubmitBtn.click();

      await firstSessionStartedPromise;

      const currentPwInput = page.locator("#l4-current-pw");
      const newPwInput = page.locator("#l4-new-pw");
      const confirmPwInput = page.locator("#l4-confirm-pw");

      const isCurrentPwVisible = (await currentPwInput.count()) > 0 && (await currentPwInput.isVisible());
      const isSubmitBtnVisible = (await l4SubmitBtn.count()) > 0 && (await l4SubmitBtn.isVisible());

      if (isCurrentPwVisible || isSubmitBtnVisible) {
        const secondAttemptPw = "SecondAttemptP@ss2026!#" + Math.random().toString(36).slice(2, 6);
        try {
          if (isCurrentPwVisible) {
            await currentPwInput.fill(adminCreds.password);
            await newPwInput.fill(secondAttemptPw);
            await confirmPwInput.fill(secondAttemptPw);
          }
          if (isSubmitBtnVisible && (await l4SubmitBtn.isEnabled())) await l4SubmitBtn.click();
        } catch {}
        firstSessionHeldResolve();
        throw new Error(
          `[R31-RACE-06 결함 검출] 세션 확인 보류 중 L4 변경 폼/버튼이 노출되었으며 두 번째 변경 요청이 전송되었습니다 (changePasswordCallCount=${changePasswordCallCount}).`
        );
      }

      const visibleFields = [];
      for (const [name, loc] of [["현재PW", currentPwInput], ["새PW", newPwInput], ["확인PW", confirmPwInput], ["제출버튼", l4SubmitBtn]]) {
        if ((await loc.count()) > 0 && (await loc.isVisible())) visibleFields.push(name);
      }
      if (visibleFields.length > 0) {
        firstSessionHeldResolve();
        throw new Error(`세션 확인 중 화면에 잔존 필드 노출: ${visibleFields.join(", ")}`);
      }

      const checkingText = page.locator(".session-verify-checking");
      await checkingText.waitFor({ state: "visible", timeout: 5000 });
      const goToLoginBtn = page.locator("#btn-go-to-login");
      await goToLoginBtn.waitFor({ state: "visible", timeout: 5000 });

      await page.mouse.click(10, 10);
      await page.keyboard.press("Enter");
      await page.keyboard.press("Tab");

      if (changePasswordCallCount !== 1) {
        firstSessionHeldResolve();
        throw new Error(`보류 중 마우스/키보드 조작 후 changePassword 호출 횟수 불일치: ${changePasswordCallCount}`);
      }

      await capture("post-change-first-held-checking");

      firstSessionHeldResolve();

      const logoutBtn = page.locator(".btn-logout");
      await logoutBtn.waitFor({ state: "visible", timeout: 15_000 });

      if (changePasswordCallCount !== 1) {
        throw new Error(`셸 진입 후 changePassword 호출 횟수 불일치: ${changePasswordCallCount}`);
      }

      await capture("post-change-first-held-shell");
      await logoutAndBackToL1(idInput);

      await page.unroute("**/api/auth:change-password");
      await page.unroute("**/api/auth:get-session");
    } else if (caseArg.startsWith("post-change-race-")) {
      let changePasswordCallCount = 0;
      let getSessionCount = 0;
      let signInCalls = 0;
      let initialSignInBaseline = 0;

      let holdResolve;
      const holdPromise = new Promise((r) => { holdResolve = r; });
      let secondGetSessionStartedResolve;
      const secondGetSessionStartedPromise = new Promise((r) => { secondGetSessionStartedResolve = r; });

      await page.route("**/api/auth:change-password", async (route) => {
        changePasswordCallCount++;
        await route.continue();
      });

      await page.route("**/api/auth:sign-in", async (route) => {
        signInCalls++;
        await route.continue();
      });

      await page.route("**/api/auth:get-session", async (route) => {
        if (changePasswordCallCount > 0) {
          getSessionCount++;
          if (getSessionCount === 1) {
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ ok: false, errorCode: "SESSION_RECHECK_FAILED", message: "세션 정보를 일시적으로 확인하지 못했습니다." }),
            });
          } else if (getSessionCount === 2) {
            secondGetSessionStartedResolve();
            await holdPromise;
            if (caseArg === "post-change-race-success" || caseArg === "post-change-race-login") {
              await route.continue();
            } else if (caseArg === "post-change-race-null") {
              await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: null }) });
            } else if (caseArg === "post-change-race-error") {
              await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ ok: false, errorCode: "SESSION_DELAYED_ERROR", message: "지연된 세션 재확인 오류" }),
              });
            }
          } else {
            await route.continue();
          }
        } else {
          await route.continue();
        }
      });

      const { idInput, pwInput, submitBtn, l4SubmitBtn } = await loginAdminToL4();
      initialSignInBaseline = signInCalls;

      await wrapSessionCounter();

      const nextStrongPw = "PostChgStrongP@ss2026!#" + Math.random().toString(36).slice(2, 6);
      await page.locator("#l4-current-pw").fill(adminCreds.password);
      await page.locator("#l4-new-pw").fill(nextStrongPw);
      await page.locator("#l4-confirm-pw").fill(nextStrongPw);
      await l4SubmitBtn.click();

      const verifyContainer = page.locator(".session-verify-container");
      await verifyContainer.waitFor({ state: "visible", timeout: 10_000 });

      const retryBtn = page.locator("#btn-retry-session");
      const goToLoginBtn = page.locator("#btn-go-to-login");
      await retryBtn.waitFor({ state: "visible", timeout: 10_000 });
      await goToLoginBtn.waitFor({ state: "visible", timeout: 10_000 });

      await retryBtn.click();
      await secondGetSessionStartedPromise;

      await goToLoginBtn.click();
      await idInput.waitFor({ state: "visible", timeout: 10_000 });

      const changedBanner = page.locator(".password-changed-banner");
      await changedBanner.waitFor({ state: "visible", timeout: 10_000 });

      if (caseArg === "post-change-race-login") {
        await capture("post-change-race-login-l1");
        await idInput.fill(adminCreds.loginId);
        await pwInput.fill(nextStrongPw);
        await submitBtn.click();

        const logoutBtn = page.locator(".btn-logout");
        await logoutBtn.waitFor({ state: "visible", timeout: 15_000 });
        if (signInCalls !== initialSignInBaseline + 1) {
          throw new Error(`보류 요청 중 새 로그인 제출 시 signIn API 요청 계수 미증가 (초기=${initialSignInBaseline}, 현재=${signInCalls})`);
        }

        holdResolve();
        await page.waitForFunction(() => window.__sessionPromiseSettledCount >= 2, undefined, { timeout: 10_000 });
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

        if (!(await logoutBtn.isVisible())) throw new Error("지연 재확인 응답 도착 후 셸 화면 미유지");
        if (changePasswordCallCount !== 1) throw new Error(`changePassword 호출 횟수 불일치: ${changePasswordCallCount}`);
        await logoutAndBackToL1(idInput);
      } else {
        await idInput.fill(adminCreds.loginId);
        holdResolve();

        await page.waitForFunction(() => window.__sessionPromiseSettledCount >= 2, undefined, { timeout: 10_000 });
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

        const errs = [];
        if (!(await idInput.isVisible())) errs.push("L1 로그인 폼 소실 (화면 전이 경합 결함)");
        if ((await page.locator(".btn-logout").count()) > 0) errs.push("L1에서 셸 화면으로 부당 전환 (화면 전이 경합 결함)");
        if (!(await changedBanner.isVisible())) errs.push("L1 완료 안내 배너 소실");
        if ((await idInput.inputValue()) !== adminCreds.loginId) errs.push("입력했던 로그인 ID 미보존");
        if ((await page.locator(".session-verify-container").count()) > 0) errs.push("L4 제한 화면 재등장");
        if (errs.length > 0) throw new Error(errs.join(" / "));

        await capture(caseArg);

        await pwInput.fill(nextStrongPw);
        await submitBtn.click();

        if (changePasswordCallCount !== 1) throw new Error(`changePassword 호출 횟수 불일치: ${changePasswordCallCount}`);
        await logoutAndBackToL1(idInput);
      }

      await page.unroute("**/api/auth:change-password");
      await page.unroute("**/api/auth:sign-in");
      await page.unroute("**/api/auth:get-session");
    } else {
      throw new Error(`알 수 없는 테스트 케이스입니다: ${caseArg}`);
    }
  },
});
