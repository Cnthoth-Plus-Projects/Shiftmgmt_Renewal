# A2 v2 I1 — Sol 독립 코드 검토

- 검토일: 2026-10-16 KST
- **제출**: `0131a9366cf985a7d06e53d39033ef08e30a06fd` (parent `1eda3db55f79ab9bae705fb4e975cd8411143aeb`)
- **판정:** `CORRECT_REQUIRED / I1_NOT_ACCEPTED`
- **검토 근거:** GitHub commit diff / 원 source bytes·Git blobs·실제 SHA-256 재계산 / A2 v1 findings A2V1-07·09 / 제출 `HANDOFF.md##회신`.
- 이 세션에서 Windows CLI, 브라우저, 로컬 held selftest의 실제 파일은 직접 실행하거나 재조회하지 못했다. 실행 RC/로그는 로컬 에이전트 주장과 GitHub 정적 검사 결과를 분리한다.

## 1. 독립 확인된 긍정사항

1. GitHub 원격 구현 브랜치 head가 정확히 `0131a9366cf985a7d06e53d39033ef08e30a06fd`, 부모가 지정된 구현 패킷 head `1eda3db55f79ab9bae705fb4e975cd8411143aeb`.
2. 이 커밋은 `HANDOFF.md`의 `## 회신`만 채웠고 제품 코드에서는 **positive·negative 두 파일만 변경**. 의도하지 않은 다른 repo 제품파일 변경 없음.
3. direct CLI 실행 진입을 `fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1]))`로 변경해 Windows junction 같은 alternate lexical path를 비교 가능한 canonical 파일경로로 만드는 방향은 적절.
4. `NormalHeldRouteController.waitForStart/waitForComplete`에서 `setTimeout` handle을 finally clear하는 수정은 소스상 타이머 잔류 문제를 개선.
5. 최종 파일 크기 및 SHA-256은 GitHub 원문과 로컬 보고서 **정확히 동일**:
   - positive 23,071B `2902D1B0D1D3957D398A73C83EF7A4BAACDE4099F0E57EB75800A09090963A56`
   - negative 29,282B `2F6BDDE6628BE8254C86730F1E2C6D78ABEDAAF8E8ADC7034225BE26C43B222D`
   - 둘 다 30,000B 이하. `main`·A2 v1 원 보존 분기 불변.

## 2. 결함 및 보완 필요사항

### I1-C01 [BLOCKING] 실패한 route를 완료 성공으로 기록

현재 `ShiftMgmt_V4/scripts/ui-checks/access-history-negative.mjs`의 `NormalHeldRouteController.handle()`:
- `await route.abort()` 또는 `await route.fulfill()` 호출 도중 reject가 나도 `finally`가 `this.completed = true; this._completeResolve()` 실행.
- `waitForComplete()`는 Promise resolve로 끝나고 진짜 route cleanup 실패가 정상 완료처럼 보인다. 기존 패킷 R-I1-07의 "실제 동작 완료 후 completed"에 반함.

**필수 해결:** `completed`는 Playwright의 `route.fulfill` 또는 `route.abort` **실제 await 성공 이후에만 true**. 실패는 `routeError`/outcome 기록 및 waiter로 reject/FAIL 전파. 비정상 route에서 성공 fulfilled/aborted를 위조하지 않는다. `_completePromise`를 settled result로 resolve한 뒤 await 쪽에서 error를 throw하는 설계는 unhandled rejection 방지에 유리. timer는 모든 반환 경로에서 clear.

### I1-C02 [BLOCKING] 정리 함수가 실제 종료를 확인하지 않고 오류를 은닉

positive `stale-response`, negative `errors` 분기의 `finally`:
- `held.abort()`는 단지 release 신호를 보낼 뿐, `route.abort()`가 실제 완료되었는지 `await`하지 않음.
- `await page.unroute(...).catch(() => {})`는 teardown 오류를 버리고 원 primary와 독립 기록하지 않음.
- `release()`를 이미 호출했으나 아직 실제 route `fulfill()`이 끝나지 않은 상태에서 `abort()`는 현재 `action!==null` 조건에 의해 무반응. 이후 `unroute`만 수행하고 pending route를 완전히 종료했다고 주장할 수 없음.
- 시작 전 실패는 owned route가 없으므로 completion 기다리기를 무조건 강제하면 오히려 timeout; started/settled 분기 필요.

**필수 해결:** try/catch/finally에서 primary 오류와 cleanup 오류를 분리, started&&notSettled면 action 상태에 따라 안전한 한 번의 abort 또는 이미 진행 중인 settle을 bounded await, 성공·실패 실제 결과로 판단. `unroute` 오류는 차단 또는 cleanup evidence에 기록; 기존 첫 오류를 덮지 않는다. owned Page/browser는 시나리오 이외 cleanup 계층의 소유권을 침범하지 않는다. 성공한 release 이후 route가 hang되면 PASS가 아니라 FAIL/teardown blocker.

### I1-C03 [IMPORTANT] 초기 해시·파일 크기 기재가 원격 정본과 불일치

로컬 보고서 `HANDOFF.md##회신`은 초기 source를 owner `29351B E80C...`, shared `29975B 7848...`, positive `22965B 9A87...`, negative `29173B 5D0B...`로 기록. 그러나 GitHub 발행 부모와 최종 원격을 독립 계산하면 다음:
- owner: 양쪽 모두 **29,351B / `2490A4DC38D65E6FDDD571C64D9903882334F243239D2F697A807BDA481DC9E7`**
- shared: 양쪽 모두 **29,973B / `C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4`**
- positive 시작: **22,530B / `77B3131220F578897630A9717ACFFC83437189FF2B2D80C13F51528DEE0BFE01`**
- negative 시작: **27,848B / `F49C87B2411664EFE6B2EF6C1DDE60010FB3AD8FCE710533A8C410A925A73BD6`**

GitHub 실제 commit diff에서 owner/shared blob은 완전히 불변. 제출한 로컬 "초기" 숫자는 출처/시점/파일이 불명확해 유효한 "원본 동일" 증거로 인정할 수 없음. **원격 baseline 값을 소급 로컬 실행값이라고 써서 수정하지 말 것**. 다음 회신에는 source ref별 `git show <SHA>:path`의 원본 bytes/SHA와 fresh checkout actual bytes/SHA를 출처·측정 시간·realpath로 구분.

### I1-C04 [IMPORTANT] 정상 실패 근거 및 held selftest raw 외부 검증 불가

로컬 보고서는 direct/junction에서 각 RC1, stdout0 및 stderr SHA를 제출했다. 그러나 stderr의 실제 `[IPC] not connected` 등 구체 오류가 빠져 있어 "올바른 direct CLI guard를 지나 owner IPC 부재로 거부"되었는지 (MODULE_NOT_FOUND, A1_LOCK_MISMATCH 등의 환경 실패였는지) 판별 불가. `test_held_controller.mjs` 자체와 raw stdout/stderr는 로컬 scratch에만 있어 full 원 source를 독립 조회하지 못함.

**필수 해결:** allowlist 코드 변경 없이 fresh direct/junction 각각 stderr의 비밀값 제거된 오류 타입/메시지/첫 호출 스택과 원 SHA, 동일 오류 비교를 제출. `--case=known`이 실제 import/guard 경로와 IPC 실패까지 도달한 것인지 입증. standalone held test 코드는 외부 scratch에 남겨두되 원 source 전문 또는 SHAs와 관측 원문을 공유, **새로 다음 5조건 추가**:
1. `route.fulfill()` throw ⇒ `completed=false`, waiter FAIL, 실제 오류 보존.
2. `route.abort()` throw ⇒ `completed=false`, waiter FAIL.
3. step primary throw와 동시에 `abort` 정리 실패 ⇒ 첫 오류 보존 + cleanup 오류 별도.
4. release 선택 뒤 실제 fulfill pending ⇒ bounded wait; TIMEOUT/FAIL이고 `completed` 가짜 성공 없음.
5. 정상 실험에서 timer 0, abort/fulfill 정확히 1회, `unroute` 완료 확인. 실패 주입도 실제 exported helper 경유, 자체 모조 state object test로 대체 금지.

## 3. 판정·수정 범위

- **수용 판정:** I1의 Junction 진입 방어 및 타이머 finally 개선은 긍정적인 부분 구현. 하지만 **I1 전체 ACCEPTED는 보류**. 실제 route teardown 성공/실패가 구분되지 않아 R-I1-07 차단.
- 이전 정본 A1 ACCEPTED는 역사적 상태로 유지. A2 v1 CLOSED/FAILED, A2 v2 full A, B87 미수용.
- Gemini용 후속은 **단일 CORRECT 1회차**, 허용 제품 파일은 위 positive/negative 두 개만. owner/shared/원 계약/Log/기존 Windows 12파일 원본/브랜치 main은 변경 금지.
- `node --check`는 syntax-only. 원 A1 locked gate·8 normal·112 원 fault는 실제 별도 Window runtime으로 검증되지 않았으므로 UNVERIFIED.
- 기존 수정 결과를 폐기하지 않고 `0131a936...`에서 최소 diff CORRECT. 먼저 코드 설계/바이트 예산이 30,000B 이내인지 확인, 불가능하면 **BLOCKED_SCOPE**.
