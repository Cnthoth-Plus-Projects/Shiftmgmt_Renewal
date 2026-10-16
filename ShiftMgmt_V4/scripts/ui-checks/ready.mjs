// 실제 준비/초기 진입 화면 접속·로그인 폼 확인→캡처→재로드→재확인·캡처 시나리오 스크립트
//
//   node scripts/ui-checks/ready.mjs http://127.0.0.1:18739/
//
import { runScreenCheck } from "../lib/ui-check.mjs";

const targetUrl = process.argv[2];
if (!targetUrl) {
  process.stderr.write("쓰는 법: node scripts/ui-checks/ready.mjs <http://127.0.0.1:포트/>\n");
  process.stderr.write("예: node scripts/ui-checks/ready.mjs http://127.0.0.1:18739/\n");
  process.exit(1);
}

await runScreenCheck({
  id: "ready",
  url: targetUrl,
  steps: async ({ page, capture, waitForFontsReady }) => {
    // 1. h1 제목 요소 및 로그인 폼 확인
    const heading = page.getByRole("heading", { name: "교대근무관리 시스템", level: 1 });
    await heading.waitFor({ state: "visible", timeout: 10_000 });

    const idInput = page.locator("#login-id");
    await idInput.waitFor({ state: "visible", timeout: 10_000 });

    const pwInput = page.locator("#login-password");
    await pwInput.waitFor({ state: "visible", timeout: 10_000 });

    const submitBtn = page.getByRole("button", { name: "로그인" });
    await submitBtn.waitFor({ state: "visible", timeout: 10_000 });

    // 2. 첫 번째 캡처: ready.png
    await capture("ready");

    // 3. 화면 재로드 및 글꼴 준비 대기
    await page.reload({ waitUntil: "load", timeout: 15_000 });
    await waitForFontsReady(15_000);

    // 4. 재로드 후 로그인 폼과 제목 재확인
    await heading.waitFor({ state: "visible", timeout: 10_000 });
    await idInput.waitFor({ state: "visible", timeout: 10_000 });
    await pwInput.waitFor({ state: "visible", timeout: 10_000 });
    await submitBtn.waitFor({ state: "visible", timeout: 10_000 });

    // 5. 두 번째 캡처: after-reload.png
    await capture("after-reload");
  }
});
