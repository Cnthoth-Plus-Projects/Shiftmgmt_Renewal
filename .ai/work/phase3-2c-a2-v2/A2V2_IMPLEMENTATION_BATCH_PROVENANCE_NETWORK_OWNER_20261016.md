# A2 v2 — 개발 우선 구현 배치: protected run 귀속 / async HTTP / Owner failure evidence

Date: 2026-10-16 KST
Branch: work/phase3-2c-a2-v2-implementation
Baseline: e703c3c1557c1ee8ca69741a5109ca6c9cd2c43f
Status: **IMPLEMENTED_IN_BRANCH / STATIC_SOURCE_REVIEW_PASS / WINDOWS_RUNTIME_UNVERIFIED / A2_NOT_ACCEPTED**.

이 문서는 사용자에게 작은 isolated 시험을 반복 요청하기보다 실제 source 패치를 묶어서 진행한 결과이다. Local CLI에는 이번 배치에 별도 HANDOFF VERIFY_ONLY 또는 npm 설치를 요청하지 않는다.

## 1. 변경한 실제 제품 파일 3개

### access-history-positive.mjs — protected test 산출물의 올바른 귀속

과거 구현은 \`artifacts/captures/phase3/access-history-<case>/\` 아래 sibling \`run-*\` 디렉터리를 sort().reverse()로 추정해서 최신 것의 manifest와 capture를 복사했다. 같은 시나리오의 과거 성공/실패 또는 동시 실행 결과를 **현재 Worker의 실제 증거로 오인**할 수 있었다.

- protected \`runScreenCheck\` 호출 전 기존 sibling 이름을 Set으로 기록, 호출 후 신규 \`run-*\` 디렉터리가 정확히 하나인지 검문. 0 또는 2+이면 이전 실행 결과를 fallback으로 사용하지 않고 fail-closed.
- manifest가 존재하고 \`status=PASS\`, \`id=access-history-<case>\`, \`url=targetUrl\`, \`captures\` 배열이 실제 \`execution.normalCaptures[case]\`의 expected 이름/수와 일치할 때만 소유자로 연결. 각각의 capture filename이 \`<name>.png\`와 정확히 일치하며 파일이 모두 존재해야 복사. 누락을 임의로 skip하지 않음.
- protected helper \`scripts/lib/ui-check.mjs\`는 변경하지 않음; 그 helper가 context/browser를 소유하므로 positive steps callback에서 \`BrowserContext.once("close")\` 및 \`Browser.once("disconnected")\` 실제 이벤트를 연결. 기존 \`runScreenCheck\` 반환 직후 \`Date.now()\`를 \`closedAtMs\`에 무조건 쓰는 가짜 시각 제거. close 이벤트 미관측이면 fail-closed.
- closeAttemptAtMs는 protected helper가 호출 시각을 callback으로 제공하지 않으므로 \`null\` 유지. \`acquiredAtMs\`는 *실제 launch 시각이 아닌* steps 진입 시점(이미 살아 있음 확인)에 가까운 상한 관측값이므로 정확한 획득시각 증명은 **미해결**.
- \`Response.finished()\`가 Error 객체로 resolve하는 경우도 실패 처리. 요청 \`WeakMap<Request, record>\`와 \`responseJobs\`로 바디 완료까지 drain하며, malformed \`postDataJSON()\`을 source event handler에서 \`A2_BRIDGE_QUERY_INVALID\`로 수집해 뜻하지 않은 성공으로 묵살하지 않음.
- HTTP 200이어도 body \`ok:false\`면 실제 app error로 기록하고 auth 단계에서도 HTTP \`res.ok()\` 대신 관측된 body \`match.ok\`를 사용. unexpected response/query 오류가 남으면 시나리오를 종료할 때 throw.

### access-history-negative.mjs — Request identity / body 완료 / 응답 이상

이전 negative observer는 Request에 임의 \`_customId\` 필드 추가, URL이 같은 요청을 \`state.requests.find(r=>r.url===u&&r.status===0)\`로 부정확하게 매칭, request 이벤트에 \`endedAtMs=Date.now(), ok=true\` 선기록, \`async page.on("response")\`의 Promise 미추적, \`catch{}\`로 JSON 오류 은닉함.

- browser-originated API Request를 \`WeakMap<Request,record>\`에 저장; 정확한 \`res.request()\`로 연결. 최초 status0/endedAt null/ok false, 실제 HTTP 응답 상태 보존.
- \`res.finished()\`가 끝나고 \`res.json()\` 성공 또는 실제 실패한 뒤 endedAt을 기록. JSON 실패 시 \`A2_RESPONSE_BODY_FAILURE\`, requestfailed 시 \`A2_REQUEST_FAILED\`를 원 requestId에 연결하여 기록. 응답/본문 이벤트 Promise 집합 \`responseJobs\`를 drain하고 남으면 \`A2_RESPONSE_DRAIN_TIMEOUT\`을 throw.
- negative RPC query parse 오류는 \`A2_BRIDGE_QUERY_INVALID\`로 수집, 예외를 조용히 넘기지 않고 종료 전 \`state.errors.unexpected\`에 의해 fail-closed.
- \`resources.browser/context.acquiredAtMs\`는 launch/newContext 호출 **이전**이 아니라 해당 await가 성공적으로 반환한 시점에 기록.
- HTTP 응답 JSON의 \`ok\`과 HTTP \`res.ok()\` 구분, auth 기록도 \`item.ok\` 사용.
- 30,000-byte 제한을 충족하기 위해 전체 source의 **줄 선행 공백만** 축소한 두 차례 변경에 대해, 파일별 들여쓰기를 삭제한 문자열의 동일성을 source 쓰기 전 확인. 텍스트 토큰/문자열을 indentation 축소로 변경하지 않음. 가독성 비용은 있지만 코드 로직 보전.
- 절대 수용 주장 금지: negative 실제 Playwright runtime/network, req failure racing cleanup, expected error classification, actual Chrome 미실행.

### access-history.mjs Owner — 오류 partial path/원 바이트 SHA 유지

기존 catch 루프는 \`normal-partial.json\`의 JSON parse 실패를 \`catch{}\`로 넘기면서 원 파일 경로를 잃어 \`workerPartialPath=null\`이 될 수 있었다. 원본 partial path를 먼저 기록하고, 읽을 수 있는 bytes의 실제 SHA를 확보한 다음 JSON parse. 읽기/파싱 실패는 \`A2_PARTIAL_UNREADABLE\` evidence 오류로 남긴다. \`owner-failure.json\`에는 *원 full partial 자체를 복제하지 않고* 경로와 SHA만 참조한다. Owner 첫 번째 primary 실패를 위조된 정상 결과로 변환하지 않는다.

## 2. 직접 GitHub 정적 검산

| File | UTF-8 bytes | SHA-256 | 30KB 여유 |
|---|---:|---|---:|
| access-history.mjs | 29,687 | FD2F24C3821AA693494120EC49FE3B47BC35B3B21CE272A7664B9BE35077228F | 313 |
| access-history-shared.mjs | 29,973 | C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4 | 27 |
| access-history-positive.mjs | 27,829 | B1A15100C86F128099C4DBF4609C69A13E66539BFE28C222D9DEF64AA5D017C5 | 2,171 |
| access-history-negative.mjs | 29,485 | DBF0EB843949B5E38AE28164913E97D1FA1BBD283D4E6596863224AA3AF2B94D | 515 |

GitHub 실물 content SHA256 독립 계산(known SHA256 abc 벡터 확인), 4파일 모든 용량 제한 충족, shared 원 6,575B frozen fragment 변경 없음. V8 compile-only 정적 파서는 module import/export를 제외한 본문을 파싱하여 4개 Parse OK; 이는 **Windows Node --check/Playwright 실행을 대신하지 않는다**.

## 3. 미해결 및 다음 대규모 개발 묶음

- A2V1-02 protected Helper의 진짜 acquire/closeAttempt 시각 소유권을 외부 callback에서 정확히 측정하기 어렵다. closed event만 실제.
- A2V1-04 원 A1 lifecycle/cleanup의 두 번째 실패, 부모/worker 프로세스 분리 증거 전체 검증 미완료. Temp 조기 제거/실제 시나리오 fault 아직 미실행.
- A2V1-01 original 112 fault vectors 실행 및 원 A1 회귀는 수행하지 않았음.
- A2V1-08 pageerror/console 원문·stack/URL 및 artifact redaction은 아직 일반적인 비밀 필드에 대해 완결되지 않았음.
- A2V1-10 IPC/parent env ACK 경계와 확정 전체 A2 gate/B87은 미완료.
- \`runScreenCheck\`는 내부에서 \`process.exit()\`를 직접 호출할 수 있음. 그 failure path는 \`finally\`를 종료하기 전에 빠져나갈 수 있으므로 positive worker의 latest partial checkpoint를 보장할 수 없음.
- Any \`I3B_PARTIAL_CHECKPOINT_HELPER_PASS\` Windows report is still pending and was not needed to proceed with this code batch. Existing earlier I3 Reader synthetic PASS remains valid only at its own version/source SHA.

**No local CLI request issued in this development batch. Future verification should group changed source files and real available runtime checks once, not re-run earlier isolated tests after every patch.** Contract/main/A2v1 failed/V3.4/historical external Windows original 12 dirty unchanged.
