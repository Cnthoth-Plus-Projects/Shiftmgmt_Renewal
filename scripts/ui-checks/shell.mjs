// 실제 Chrome 기반 역할별 셸 및 상태줄 시나리오 검증 스크립트
//
//   node scripts/ui-checks/shell.mjs <http://127.0.0.1:포트/>
//
import os from "node:os";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { runScreenCheck, validateTargetUrl } from "../lib/ui-check.mjs";

const targetUrl = process.argv[2];
if (!targetUrl) {
  process.stderr.write("쓰는 법: node scripts/ui-checks/shell.mjs <http://127.0.0.1:포트/>\n");
  process.exit(1);
}

// 1. URL 형식 사전 검증 (실패 시 RC 1)
try {
  validateTargetUrl(targetUrl);
} catch (err) {
  process.stderr.write(`[URL 검증 실패] ${err.message}\n`);
  process.exit(1);
}

const repoRoot = path.resolve(process.cwd());

// 2. os.tmpdir() 및 격리 디렉토리 경계 검증 (C31-06)
const rawTemp = os.tmpdir();
let tempRoot = path.resolve(rawTemp);
try {
  if (existsSync(tempRoot)) {
    tempRoot = realpathSync(tempRoot);
  }
} catch {
  // 기본 해석값 유지
}

// SHIFTMGMT_USER_DATA_DIR 검증 (os.tmpdir() 바로 아래의 하위 격리 폴더)
const userDataDir = process.env.SHIFTMGMT_USER_DATA_DIR;
if (!userDataDir || !path.isAbsolute(userDataDir)) {
  process.stderr.write("[오류] SHIFTMGMT_USER_DATA_DIR 환경변수에 절대 경로가 지정되지 않았습니다.\n");
  process.exit(2);
}

const resolvedUserDataDir = path.resolve(userDataDir);
const relUserDataToTemp = path.relative(tempRoot, resolvedUserDataDir);
if (relUserDataToTemp.startsWith("..") || path.isAbsolute(relUserDataToTemp) || relUserDataToTemp === "") {
  process.stderr.write("[오류] userDataDir이 os.tmpdir() 내부의 격리 폴더가 아닙니다.\n");
  process.exit(2);
}

const tempSegments = relUserDataToTemp.split(path.sep).filter(Boolean);
if (tempSegments.length !== 1) {
  process.stderr.write("[오류] userDataDir은 os.tmpdir() 바로 아래의 하위 폴더여야 합니다.\n");
  process.exit(2);
}

const relUserDataToRepo = path.relative(repoRoot, resolvedUserDataDir);
if (!relUserDataToRepo.startsWith("..") && !path.isAbsolute(relUserDataToRepo)) {
  process.stderr.write("[오류] userDataDir이 저장소 내부에 위치할 수 없습니다. 격리 폴더를 사용하세요.\n");
  process.exit(2);
}

let realUserDataDir = resolvedUserDataDir;
if (existsSync(resolvedUserDataDir)) {
  try {
    realUserDataDir = realpathSync(resolvedUserDataDir);
  } catch (err) {
    process.stderr.write(`[오류] userDataDir 실제 경로 확인 실패: ${err.message}\n`);
    process.exit(2);
  }
  const relRealUserDataToTemp = path.relative(tempRoot, realUserDataDir);
  if (relRealUserDataToTemp.startsWith("..") || path.isAbsolute(relRealUserDataToTemp) || relRealUserDataToTemp === "") {
    process.stderr.write("[오류] userDataDir 심볼릭 링크 대상이 os.tmpdir() 내부의 격리 폴더가 아닙니다.\n");
    process.exit(2);
  }
  const realTempSegments = relRealUserDataToTemp.split(path.sep).filter(Boolean);
  if (realTempSegments.length !== 1) {
    process.stderr.write("[오류] userDataDir 실제 대상이 os.tmpdir() 바로 아래의 격리 폴더가 아닙니다.\n");
    process.exit(2);
  }
  const relRealUserDataToRepo = path.relative(repoRoot, realUserDataDir);
  if (!relRealUserDataToRepo.startsWith("..") && !path.isAbsolute(relRealUserDataToRepo)) {
    process.stderr.write("[오류] userDataDir 심볼릭 링크 대상이 저장소 내부에 위치할 수 없습니다.\n");
    process.exit(2);
  }
}

// 3. SHIFTMGMT_UI_BOOTSTRAP_FILE 검증 (<격리폴더>/data/bootstrap-credentials.json 정확한 파일)
const bootstrapPath = process.env.SHIFTMGMT_UI_BOOTSTRAP_FILE;
if (!bootstrapPath || !path.isAbsolute(bootstrapPath)) {
  process.stderr.write("[오류] SHIFTMGMT_UI_BOOTSTRAP_FILE 환경변수에 절대 경로가 지정되지 않았습니다.\n");
  process.exit(2);
}

const resolvedBootstrapPath = path.resolve(bootstrapPath);
const expectedBoot = path.normalize(path.resolve(resolvedUserDataDir, "data", "bootstrap-credentials.json"));
if (path.normalize(resolvedBootstrapPath) !== expectedBoot) {
  process.stderr.write("[오류] bootstrap 파일 경로는 <격리폴더>/data/bootstrap-credentials.json 정확한 경로여야 합니다.\n");
  process.exit(2);
}

if (!existsSync(resolvedBootstrapPath)) {
  process.stderr.write("[오류] bootstrap 파일이 존재하지 않습니다.\n");
  process.exit(2);
}

let realBootPath = resolvedBootstrapPath;
try {
  realBootPath = realpathSync(resolvedBootstrapPath);
} catch (err) {
  process.stderr.write(`[오류] bootstrap 파일 실제 경로 확인 실패: ${err.message}\n`);
  process.exit(2);
}

const relRealBootToUserData = path.relative(realUserDataDir, realBootPath);
if (relRealBootToUserData.startsWith("..") || path.isAbsolute(relRealBootToUserData)) {
  process.stderr.write("[오류] bootstrap 파일 심볼릭 링크 대상이 지정된 격리 데이터 폴더 내부에 위치하지 않습니다.\n");
  process.exit(2);
}

const relRealBootToRepo = path.relative(repoRoot, realBootPath);
if (!relRealBootToRepo.startsWith("..") && !path.isAbsolute(relRealBootToRepo)) {
  process.stderr.write("[오류] bootstrap 파일 심볼릭 링크 대상이 저장소 내부에 위치할 수 없습니다.\n");
  process.exit(2);
}

// 4. 복구 비밀 파일 검증 (환경변수 지정 시 어떤 비밀 파일도 읽기 전에 완료)
const recSecretFile = process.env.SHIFTMGMT_UI_RECOVERY_SECRET_FILE;
if (recSecretFile) {
  if (!path.isAbsolute(recSecretFile)) {
    process.stderr.write("[오류] SHIFTMGMT_UI_RECOVERY_SECRET_FILE 환경변수에 절대 경로가 지정되지 않았습니다.\n");
    process.exit(2);
  }
  const resolvedRecSecretPath = path.resolve(recSecretFile);
  const relRecToUserData = path.relative(resolvedUserDataDir, resolvedRecSecretPath);
  if (relRecToUserData.startsWith("..") || path.isAbsolute(relRecToUserData) || relRecToUserData === "") {
    process.stderr.write("[오류] 복구 비밀 파일이 지정된 격리 데이터 폴더 내부에 위치하지 않습니다.\n");
    process.exit(2);
  }
  const relRecToRepo = path.relative(repoRoot, resolvedRecSecretPath);
  if (!relRecToRepo.startsWith("..") && !path.isAbsolute(relRecToRepo)) {
    process.stderr.write("[오류] 복구 비밀 파일이 저장소 내부에 위치할 수 없습니다.\n");
    process.exit(2);
  }
  if (existsSync(resolvedRecSecretPath)) {
    let realRecPath = resolvedRecSecretPath;
    try {
      realRecPath = realpathSync(resolvedRecSecretPath);
    } catch (err) {
      process.stderr.write(`[오류] 복구 비밀 파일 실제 경로 확인 실패: ${err.message}\n`);
      process.exit(2);
    }
    const relRealRecToUserData = path.relative(realUserDataDir, realRecPath);
    if (relRealRecToUserData.startsWith("..") || path.isAbsolute(relRealRecToUserData)) {
      process.stderr.write("[오류] 복구 비밀 파일 심볼릭 링크 대상이 격리 데이터 폴더 내부에 위치하지 않습니다.\n");
      process.exit(2);
    }
    const relRealRecToRepo = path.relative(repoRoot, realRecPath);
    if (!relRealRecToRepo.startsWith("..") && !path.isAbsolute(relRealRecToRepo)) {
      process.stderr.write("[오류] 복구 비밀 파일 심볼릭 링크 대상이 저장소 내부에 위치할 수 없습니다.\n");
      process.exit(2);
    }
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
const operatorCreds = bootstrapData.credentials?.["user-operator"];

if (!adminCreds || !operatorCreds) {
  process.stderr.write("[오류] bootstrap 파일에 user-admin 또는 user-operator 자격증명이 누락되었습니다.\n");
  process.exit(2);
}

await runScreenCheck({
  id: "shell",
  url: targetUrl,
  steps: async ({ page, capture, waitForFontsReady }) => {
    // 1. 관리자(admin) 로그인 수행 (L1 -> L4 비밀번호 변경 필요 시 변경 -> 셸)
    const idInput = page.locator("#login-id");
    const pwInput = page.locator("#login-password");
    const submitBtn = page.locator("button[type='submit']");

    await idInput.waitFor({ state: "visible", timeout: 10_000 });
    await idInput.fill(adminCreds.loginId);
    await pwInput.fill(adminCreds.password);
    await submitBtn.click();

    // L4 비밀번호 변경 화면 또는 바로 셸 진입 대기
    const l4OrShell = await Promise.race([
      page.locator("#l4-btn-submit").waitFor({ state: "visible", timeout: 10_000 }).then(() => "L4"),
      page.locator(".btn-logout").waitFor({ state: "visible", timeout: 10_000 }).then(() => "SHELL"),
    ]).catch(() => "TIMEOUT");

    if (l4OrShell === "L4") {
      const nextStrongPw = "AdminStrongP@ss2026!#" + Math.random().toString(36).slice(2, 6);
      await page.locator("#l4-current-pw").fill(adminCreds.password);
      await page.locator("#l4-new-pw").fill(nextStrongPw);
      await page.locator("#l4-confirm-pw").fill(nextStrongPw);
      await page.locator("#l4-btn-submit").click();
    }

    // 2. 관리자 셸 진입 대기
    const logoutBtn = page.locator(".btn-logout");
    await logoutBtn.waitFor({ state: "visible", timeout: 15_000 });
    await waitForFontsReady(15_000);

    // 접근성 본문 바로가기 링크(skip-link) 확인
    const skipLink = page.locator(".skip-link");
    await skipLink.waitFor({ state: "attached" });
    const skipHref = await skipLink.getAttribute("href");
    if (skipHref !== "#main-content") {
      throw new Error(`본문 바로가기 링크의 href가 #main-content가 아닙니다: ${skipHref}`);
    }

    // 헤더(56px) 및 상태줄(32px) 높이 실측 검증 (C31-07)
    const headerEl = page.locator(".header-bar");
    const headerHeight = await headerEl.evaluate((el) => Math.round(el.getBoundingClientRect().height));
    if (headerHeight !== 56) {
      throw new Error(`헤더 높이가 56px이 아닙니다 (실측: ${headerHeight}px)`);
    }

    const statusbarEl = page.locator(".footer-statusbar");
    const statusbarHeight = await statusbarEl.evaluate((el) => Math.round(el.getBoundingClientRect().height));
    if (statusbarHeight !== 32) {
      throw new Error(`상태줄 높이가 32px이 아닙니다 (실측: ${statusbarHeight}px)`);
    }

    // 관리 그룹 노출 확인 (admin 전용)
    const orgMgmtBtn = page.getByRole("button", { name: "조직 관리" });
    await orgMgmtBtn.waitFor({ state: "visible", timeout: 10_000 });

    // 역할 배지 확인
    const roleBadge = page.locator(".role-badge");
    const roleText = (await roleBadge.textContent())?.trim();
    if (roleText !== "관리자") {
      throw new Error(`관리자 역할 배지 텍스트 불일치: ${roleText}`);
    }

    // 3. 사이드바 너비 정밀 측정 및 접기/펼치기 토글 (220px ↔ 64px)
    const sidebar = page.locator(".sidebar");
    const widthExpanded = await sidebar.evaluate((el) => Math.round(el.getBoundingClientRect().width));
    if (widthExpanded !== 220) {
      throw new Error(`사이드바 펼침 너비가 220px이 아닙니다 (실측: ${widthExpanded}px)`);
    }

    // 관리자 셸 펼침 캡처 (admin-expanded)
    await capture("admin-expanded");

    // 사이드바 접기 토글
    const toggleBtn = page.locator(".btn-sidebar-toggle");
    await toggleBtn.click();

    const isCollapsed = await sidebar.evaluate((el) => el.classList.contains("collapsed"));
    if (!isCollapsed) {
      throw new Error("사이드바 접힘 토글 실패 (collapsed 클래스 미부착)");
    }

    // CSS transition(0.15s) 완료 대기
    await page.waitForFunction(
      () => {
        const el = document.querySelector(".sidebar");
        return el && Math.round(el.getBoundingClientRect().width) === 64;
      },
      undefined,
      { timeout: 5000 },
    );

    const widthCollapsed = await sidebar.evaluate((el) => Math.round(el.getBoundingClientRect().width));
    if (widthCollapsed !== 64) {
      throw new Error(`사이드바 접힘 너비가 64px이 아닙니다 (실측: ${widthCollapsed}px)`);
    }

    // 사이드바 접힌 상태 캡처 (admin-collapsed)
    await capture("admin-collapsed");

    // 다시 사이드바 펼치기 (64px -> 220px 복원 확인)
    await toggleBtn.click();
    await page.waitForFunction(
      () => {
        const el = document.querySelector(".sidebar");
        return el && Math.round(el.getBoundingClientRect().width) === 220;
      },
      undefined,
      { timeout: 5000 },
    );
    const widthRestored = await sidebar.evaluate((el) => Math.round(el.getBoundingClientRect().width));
    if (widthRestored !== 220) {
      throw new Error(`사이드바 펼침 복원 너비가 220px이 아닙니다 (실측: ${widthRestored}px)`);
    }

    // 4. 상태줄 실제 API 5개 필수 성공 및 값 대조 검증 (C31-07)
    const healthStatus = await page.evaluate(async () => await window.appBridge.getAppHealth());
    if (!healthStatus.ok || !healthStatus.data) {
      throw new Error(`getAppHealth API 호출 실패: ${JSON.stringify(healthStatus)}`);
    }
    const dbCellText = (await page.locator("#sb-db").textContent()) || "";
    const expectedDbText = healthStatus.data.databaseConfigured ? "경로 설정됨" : "확인 필요";
    if (!dbCellText.includes(expectedDbText)) {
      throw new Error(`상태줄 DB 설정 표시 불일치: UI='${dbCellText}', 기대='${expectedDbText}'`);
    }

    const syncStatus = await page.evaluate(async () => await window.appBridge.getPerformanceSyncState());
    if (!syncStatus.ok || !syncStatus.data) {
      throw new Error(`getPerformanceSyncState API 호출 실패: ${JSON.stringify(syncStatus)}`);
    }
    const syncCellText = (await page.locator("#sb-sync").textContent()) || "";
    const expectedSyncText = syncStatus.data.status === "idle" ? "처리 이력 없음" : syncStatus.data.status;
    if (!syncCellText.includes(expectedSyncText)) {
      throw new Error(`상태줄 동기화 상태 표시 불일치: UI='${syncCellText}', 기대='${expectedSyncText}'`);
    }

    try {
      await page.waitForFunction(() => {
        const el = document.getElementById("sb-pending");
        return el && /대기 파일:\s*\d+개/.test(el.textContent || "");
      }, undefined, { timeout: 15_000 });
    } catch (_timeoutErr) {
      const currentUi = (await page.locator("#sb-pending").textContent()) || "";
      throw new Error(`상태줄 대기 파일 수 표시 한정 대기(15초) 초과: UI='${currentUi}'`);
    }

    const pendingStatus = await page.evaluate(async () => await window.appBridge.listPendingFiles());
    if (!pendingStatus.ok || !Array.isArray(pendingStatus.data)) {
      throw new Error(`listPendingFiles API 호출 실패: ${JSON.stringify(pendingStatus)}`);
    }
    const pendingCellText = (await page.locator("#sb-pending").textContent()) || "";
    const expectedPendingText = `대기 파일: ${pendingStatus.data.length}개`;
    if (!pendingCellText.includes(expectedPendingText)) {
      throw new Error(`상태줄 대기 파일 수 표시 불일치: UI='${pendingCellText}', 기대='${expectedPendingText}'`);
    }

    const watchStatus = await page.evaluate(async () => await window.appBridge.getFileWatchStatus());
    if (!watchStatus.ok || !watchStatus.data) {
      throw new Error(`getFileWatchStatus API 호출 실패: ${JSON.stringify(watchStatus)}`);
    }
    const watchCellText = (await page.locator("#sb-watch").textContent()) || "";
    const expectedWatchText = watchStatus.data.isRunning ? "폴더 감시 중" : "감시 중단";
    if (!watchCellText.includes(expectedWatchText)) {
      throw new Error(`상태줄 파일 감시 상태 표시 불일치: UI='${watchCellText}', 기대='${expectedWatchText}'`);
    }

    const updateStatus = await page.evaluate(async () => await window.appBridge.getUpdateState());
    if (!updateStatus.ok || !updateStatus.data) {
      throw new Error(`getUpdateState API 호출 실패: ${JSON.stringify(updateStatus)}`);
    }
    const updateCellText = (await page.locator("#sb-update").textContent()) || "";
    if (!updateCellText.includes("수동 적용")) {
      throw new Error(`상태줄 업데이트 상태 표시 불일치: UI='${updateCellText}', 기대='수동 적용'`);
    }

    // 5. 미구현 메뉴 차단 알림 확인
    const scheduleCreateBtn = page.getByRole("button", { name: "근무표 생성" });
    await scheduleCreateBtn.click();
    const noticeBanner = page.locator(".notice-banner");
    await noticeBanner.waitFor({ state: "visible", timeout: 10_000 });

    // 6. 감시 중단 및 회복 확인
    await page.evaluate(async () => {
      await window.appBridge.stopFileWatch();
      if (window.statusBar && typeof window.statusBar.refresh === "function") {
        await window.statusBar.refresh();
      }
    });

    const restartWatchBtn = page.locator("#btn-restart-watch");
    await restartWatchBtn.waitFor({ state: "visible", timeout: 10_000 });

    // 감시 중단 캡처 (watch-stopped)
    await capture("watch-stopped");

    // 다시 시작 버튼 클릭
    await restartWatchBtn.click();
    await page.waitForFunction(
      () => !document.getElementById("btn-restart-watch"),
      undefined,
      { timeout: 10_000 },
    );

    // 7. 새로고침 세션 복원 검증 (C31-07)
    await page.reload({ waitUntil: "load" });
    await waitForFontsReady(15_000);
    await logoutBtn.waitFor({ state: "visible", timeout: 10_000 });
    const reloadedRole = (await page.locator(".role-badge").textContent())?.trim();
    if (reloadedRole !== "관리자") {
      throw new Error(`새로고침 후 관리자 세션 복원 실패: ${reloadedRole}`);
    }

    // 8. 일반 상태 API 오류 시 해당 칸 '확인 실패' 표시 검증 (C31-04)
    await page.route("**/api/performance:get-sync-state", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          errorCode: "SYNC_STATUS_FAILED",
          message: "동기화 상태 확인 실패",
        }),
      });
    });

    await page.evaluate(async () => {
      if (window.statusBar && typeof window.statusBar.refresh === "function") {
        await window.statusBar.refresh();
      }
    });

    const syncErrText = (await page.locator("#sb-sync").textContent()) || "";
    if (!syncErrText.includes("확인 실패")) {
      throw new Error(`일반 상태 API 실패 시 '확인 실패'가 표시되지 않았습니다: ${syncErrText}`);
    }
    await page.unroute("**/api/performance:get-sync-state");

    // 상태 복원
    await page.evaluate(async () => {
      if (window.statusBar && typeof window.statusBar.refresh === "function") {
        await window.statusBar.refresh();
      }
    });

    // 9. 상태 API에서 AUTH_SESSION_REQUIRED 발생 시 L1으로 자동 전환 검증 (C31-04)
    await page.route("**/api/performance:get-sync-state", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          errorCode: "AUTH_SESSION_REQUIRED",
          message: "인증 세션이 만료되었습니다.",
        }),
      });
    });

    await page.evaluate(async () => {
      if (window.statusBar && typeof window.statusBar.refresh === "function") {
        await window.statusBar.refresh();
      }
    });

    // 세션 만료 시 즉시 L1 로그인 화면으로 복귀해야 함
    await page.locator("#login-id").waitFor({ state: "visible", timeout: 10_000 });
    await page.unroute("**/api/performance:get-sync-state");

    // 10. 일반 운영자(operator) 로그인 검증
    await idInput.fill(operatorCreds.loginId);
    await pwInput.fill(operatorCreds.password);
    await submitBtn.click();

    // L4 비밀번호 변경 화면 또는 바로 셸 진입 대기
    const opL4OrShell = await Promise.race([
      page.locator("#l4-btn-submit").waitFor({ state: "visible", timeout: 10_000 }).then(() => "L4"),
      page.locator(".btn-logout").waitFor({ state: "visible", timeout: 10_000 }).then(() => "SHELL"),
    ]).catch(() => "TIMEOUT");

    if (opL4OrShell === "L4") {
      const nextStrongPw = "OpStrongP@ss2026!#" + Math.random().toString(36).slice(2, 6);
      await page.locator("#l4-current-pw").fill(operatorCreds.password);
      await page.locator("#l4-new-pw").fill(nextStrongPw);
      await page.locator("#l4-confirm-pw").fill(nextStrongPw);
      await page.locator("#l4-btn-submit").click();
    }

    // 운영자 셸 진입 대기
    await logoutBtn.waitFor({ state: "visible", timeout: 15_000 });
    await waitForFontsReady(15_000);

    // 일반 운영자는 관리 그룹이 없어야 함
    const hasOrgMgmt = await orgMgmtBtn.isVisible().catch(() => false);
    if (hasOrgMgmt) {
      throw new Error("일반 운영자 셸에 관리자 전용 '조직 관리' 메뉴가 표시되었습니다.");
    }

    // 운영자 셸 상태줄에 sb-watch가 없어야 함
    const hasWatchCell = await page.locator("#sb-watch").isVisible().catch(() => false);
    if (hasWatchCell) {
      throw new Error("일반 운영자 상태줄에 관리자 전용 파일 감시 셀이 표시되었습니다.");
    }

    // 운영자 셸 캡처 (operator)
    await capture("operator");

    // 11. 운영자 로그아웃 및 실제 서버 세션 무효화 후 새로고침 검증 (C31-07)
    await logoutBtn.click();
    await idInput.waitFor({ state: "visible", timeout: 10_000 });

    // 실제 서버 세션 무효화 뒤 새로고침 -> getSession: null 및 L1 확인
    await page.reload({ waitUntil: "load" });
    await waitForFontsReady(15_000);

    const sessionAfterLogout = await page.evaluate(async () => await window.appBridge.getSession());
    if (!sessionAfterLogout.ok || sessionAfterLogout.data !== null) {
      throw new Error(`로그아웃 후 getSession이 null이어야 합니다: ${JSON.stringify(sessionAfterLogout)}`);
    }

    await idInput.waitFor({ state: "visible", timeout: 10_000 });
    const shellVisible = await page.locator(".app-shell").isVisible().catch(() => false);
    if (shellVisible) {
      throw new Error("로그아웃 후 새로고침 시 셸 화면이 남아있습니다.");
    }
  },
});
