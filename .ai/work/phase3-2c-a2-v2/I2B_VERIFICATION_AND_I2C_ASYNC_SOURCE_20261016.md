# A2 v2 I2b 실측 검증 / I2c 비동기 응답 계측 변경

- 기준일: 2026-10-16 KST
- **판정:** `I2B_PARSER_EXPORTED_HELPER_PASS` (로컬 에이전트 실측 + GitHub 코드 정합) / `I2C_STATIC_ONLY` (GitHub 소스 수정) / `BROWSER_RUNTIME_UNVERIFIED`.
- GitHub branch `work/phase3-2c-a2-v2-implementation`; 제품 source 기준 출발 `43fc73c0819ab4ff350ef595b2bf11487d41f7dd`.
- 제품 수정: `ShiftMgmt_V4/scripts/ui-checks/access-history-positive.mjs`, `access-history-negative.mjs` 2개만.
- `main`, rejected A2 v1 branch, historical Windows dirty12, original management/contract, shared frozen unchanged.

## 1. 사용자가 제출한 I2b VERIFY_ONLY 실측

- Windows 별도 개발 clone HEAD `43fc73c0819ab4ff350ef595b2bf11487d41f7dd`, 작업 전후 Clean, `core.autocrlf=false`.
- owner 29,351B / SHA `2490A4DC...`, shared 29,973B / `C0AB887F...`, positive 24,141B / `AFD06A0E...`, negative 28,753B / `3D13EBC7...`: GitHub 정본과 모두 일치.
- `node --check` positive/negative RC0.
- 실제 exported `parseNormalBridgeQuery`를 scratch에서 import해 9조건 검증, `I2B_PARSER_PROBE_PASS` / `casesPassed=9` / process PID `54200`, `PROBE_RUNTIME_RC=0`, stderr0B, probe SHA `D4040D820D886E56BB5B1DF921580A03000E93D20ED7C8F1097BBF9D6206B464`.
- 이 9개는 정상 RPC array/빈 인수/빈 필터/미등록 키/잘못된 타입/잘못된 배열형/초과인수/postDataJSON API 누락/SDK 파싱 오류를 **격리된 모조 Request 입력**으로 actual parser에 호출한 결과다. **실제 Playwright network/Chrome/화면/브라우저 증명이 아님**.
- 로컬 scratch 파일 원자료와 실제 Windows stdout/프로세스의 외부 독립 조회는 현 원격 세션에서 불가. `LOCAL_AGENT_REPORTED` 증거 수준을 유지하되 소스/SHA/시나리오/관측값 정합으로 I2b 제한적 PASS.

## 2. I2c Sol이 직접 확인한 과거 결함

- positive: `page.on('response', async res=>...)`로 수집했지만 EventEmitter가 async body parse promise를 기다리지 않음. `match.endedAtMs`는 실제 response body 종료 전 최초 response 이벤트 시각에 작성. `await res.json()` 실패 시 catch가 비어 있었음.
- positive: `page.on('requestfailed')`가 normal recorder에 없고, drain 종료 조건은 `status===0`만 보아 이미 status 수신한 미완료 body 처리의 증거를 기다리지 않음.
- negative: Node `fetch`의 `res.json()` 실패 역시 `catch {}`로 숨겨 `ok=true, data=null` 같은 false-success를 만들 수 있었음.
- 기존 protected helper `scripts/lib/ui-check.mjs`의 context/browser 생성/종료 실제 콜백은 original 4-file allowlist 밖. 따라서 external normal steps에서 `closedAtMs`를 호출 직후 시각으로 단정하는 문제는 **미해결**이며 기존 금지 영역의 소스 수정/계약 완화를 하지 않음.

## 3. I2c 실제 소스 변경

### Positive response handler — 실제 completion

1. `const responseJobs = new Set()`을 positive `steps` 안에 두고, `page.on('response')`가 생성한 Promise를 추적한다. EventEmitter가 Promise를 기다린다고 가정하지 않음.
2. Playwright `res.finished()` 뒤 `res.json()`을 await. body 읽기 성공 또는 실제 실패 이후의 `Date.now()`만 `endedAtMs`로 기록, 기존 시작 시각과 응답 시각을 구분. status는 실제 `res.status()`, owner-request identity는 이전 `WeakMap<req,raw>`.
3. body/response failure는 `A2_RESPONSE_BODY_FAILURE`와 무해한 Error `name`·requestId만 `state.errors.unexpected`에 기록; 메시지/원 URL/비밀 파라미터를 새로 로그에 누출하지 않음. HTTP 실패(status≥400)는 실제 상태로 badResponses에 기록.
4. `page.on('requestfailed')`에서 실제 실패한 Request object를 WeakMap에 연결하고 `A2_REQUEST_FAILED`를 별도 rawErrors.requestfailed에 기록. 미완료 status0 요청을 200으로 만들지 않음.
5. 종료 시 outstanding responseJobs와 실제 미완료 Request에 대해 최대 기존 5초 범위에서 drain. 넘어서면 `A2_RESPONSE_DRAIN_TIMEOUT`과 Error로 실패시켜 거짓 정상 완료를 금지. 이 5초는 기존 timeout 시간이지 새 완화가 아님.
6. Promise reject handler는 state.errors.unexpected에 별도 `A2_RESPONSE_HANDLER_FAILURE`를 기록하되 완료 성공처럼 무시하지 않음.

### Negative Node fetch JSON

- 기존 catch 빈 블록 대신 `A2_INVALID_JSON_BODY`, requestId, Error name, 발생 시각을 `state.errors.unexpected`에 기록하고 `ok=false`로 처리. status 값은 실제 `res.status` 보존.
- Node fetch 네트워크 실패/우회 등 원 계약/실제 UI runner 경로는 추가 수정 없음.

## 4. 현재 원격 소스 직접 계측

| 제품 파일 | UTF-8 bytes | 전체 SHA-256 | 30,000B 잔여 |
|---|---:|---|---:|
| `access-history.mjs` | 29,351 | `2490A4DC38D65E6FDDD571C64D9903882334F243239D2F697A807BDA481DC9E7` | 649 |
| `access-history-shared.mjs` | 29,973 | `C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4` | 27 |
| `access-history-positive.mjs` | 25,678 | `B2BC468E2029ACD7769EE4049F16DAD8103B4E9D0E5833D0EA6ED4ADE1FB253D` | 4,322 |
| `access-history-negative.mjs` | 28,986 | `D1334B357B927DA4A4671E2A32D5B5005E8FFC53CFF54396D9B8F503F555BB0E` | 1,014 |

GitHub file readback 및 자체 SHA-256 `abc` 시험 벡터 일치 확인. 이번 세션의 Windows `node --check` 및 새 source runtime **미실행**.

## 5. 정직한 남은 위험/후속 시험

- Positive handler는 실제 Playwright `page.on` 이벤트를 소유한 `runScreenCheck` 콜백 안에 있으며, owner/IPC/Chrome 없이 exported helper만으로 끝까지 독립 호출할 수 없음. **Node syntax PASS는 기능 PASS가 아님.**
- `res.finished()`와 `res.json()`의 동시 실패·late callback, `requestfailed` 이후 finish callback 경쟁, 원 `state.errors.unexpected` 스키마/first-error/partial 보전, stdout/secret redaction, 8 normal/112 vector는 미검증. **A2V1-02·06 전체 해결 아님**.
- Negative의 `errors` 전용 Playwright response handler에는 여전히 별도의 무음 `catch{}`와 early `endedAtMs`이 남아 있다. 이번 수정으로 해결됐다고 주장 금지, 추후 범위와 byte budget 확보 후 수정.
- `state.resources.context/browser.acquiredAtMs`는 steps 진입 시간, `closedAtMs`는 protected runner 반환 시간으로 기록하여 정확한 SDK 생성/종료 이벤트와 같다고 보장할 수 없음.
- 기존 `A1 ACCEPTED`는 historical 기준이며 현재 A2 v2 실제 locked A1 재실행 결과 없음. A2 v1 FAILED, B87 및 전체 A2 v2 미수용 상태 지속.
- 현 단계 다음 로컬 역할: **4 파일 bytes/SHA 및 positive/negative `node --check`**, 실제 `installNormalObserver.fetch` export 기반 정상/JSON parse 실패/네트워크 실패 세 가지 *HTTP 호출 없는 stub* 실제 수행. 원 Windows 제품·계약·브라우저·포트 사용 금지.
