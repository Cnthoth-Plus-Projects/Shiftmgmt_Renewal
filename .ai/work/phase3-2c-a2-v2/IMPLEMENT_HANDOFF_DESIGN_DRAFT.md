# A2 v2 — 구현 패킷 발행 전 기술 설계 정본(초안)

- **Action: DESIGN_REVIEW_ONLY** — 루트 `HANDOFF.md`의 Action을 변경하지 않으며, Gemini에게 제품 수정 권한을 부여하지 않음
- **상태:** STATIC_DESIGN_PREPARED / EOL_LOCK_RESOLVED_ON_WINDOWS / RUNTIME_UNPROVEN
- **기준 repo:** `Cnthoth-Plus-Projects/Shiftmgmt_Renewal`
- **제품 기준:** `work/phase3-2c-a2-v1-not-accepted` @ `2f51c11710f46c75a49f5715cc68d4752b53f8ca`
- **main:** `c21aa263a02e57d57949bafc5aefe06aab582acd` 변경 없음
- **범위:** `ShiftMgmt_V4/scripts/ui-checks/`의 `access-history.mjs`, `access-history-shared.mjs`, `access-history-positive.mjs`, `access-history-negative.mjs`만 차기 Gemini IMPLEMENT 파일 허용 후보
- **제외:** `src/` 기능/UI, API/DB, canonical contract, A1 historical controls, `TODO`, 과거 `Log`, B87 구현, 승인/수용 선언

## 1. 결함 11건의 순서 있는 수정 전략

| ID | 결함 | 소유 파일 | 구현 전략 | 실제 증거·인수 조건 |
|---|---|---|---|---|
| A2V1-01 | 실행 112 실제 주입·영수증 위조 | negative/owner | 원 벡터 112개별 own harness에서 실제 target SUT/SDK/helper 함수 수행. 원본 모듈 경로·바이트 SHA 고정. 각 child spawn→PID/UTC/RC/log stream→fault trigger hook→cleanup proof를 서로 연계. 원 builder의 expected값을 actual에 복사 금지 | 112 ID별 1개의 primary receipt + known-case 확장별 child receipt; 주입 호출되지 않으면 UNPROVEN; harmless CLI 거절 대체 금지 |
| A2V1-02 | raw 측정값 가공 | negative/positive | installNormalObserver의 pending request는 status=0, endedAtMs=null 상태로 유지; 실제 request/response/close callback에서만 갱신. page.viewportSize(), page.url() 실측. e.g. 901px 실제 viewport를 900으로 바꾸지 않음. close 스탬프는 finally의 실제 event timestamp만 | fault로 pending 상태 유지·실제 901px 관측·both-close throw를 유도해 raw와 SDK 값 일치 및 FAIL 판정 |
| A2V1-03 | reader 신뢰 경계·임시 자료 조기 삭제 | negative/owner | readNormalWorkerEvidence가 case, workerPid, parentPid, runId, exitCode=1, status=FAIL_INCOMPLETE, rawSha256, schema, requiredIds, missing/extra/duplicates, result provenance를 원 raw와 독립 대조. source read 실패 시 candidate 발행 및 temp 제거 금지. owner는 gate 이전 실패에서 original partial을 잃지 않음 | forged worker-final status PASS, rawSha BAD, pid -1, unknown case, RC mismatch, empty coverage 등을 실제 reader에 주입하면 FAIL |
| A2V1-04 | 최초 오류 및 partial·cleanup 전파 | owner/negative/positive | partial은 after acquisition, request finish, step start/complete, cleanup attempt/resolve 등 의미 있는 장벽에서 writeAtomic. 주·fallback 이중실패는 evidence error로 수집하고 숨기지 않음. 오류 발생 시 primary 첫 스택과 cleanup의 독립 에러, 최대한 얻은 raw/child logs를 owner-failure로 연결 | writer 오류+context close throw시 workerRC와 원 first stack/cleanup error, partial attempt reason 등 parent 증거 연계 |
| A2V1-05 | protected 캡처의 타 run 혼입 | positive/owner | 보호 runScreenCheck의 stdout `- manifest: <상대경로>`를 해당 실행 PID와 스트림 bytes 기준으로 파싱해 정확한 runId/path를 확보. 최신 sibling sort().reverse() 삭제. path.realpath와 captures의 run binding/SHA를 검증 | 동시 sibling 오래된 manifest 추가해도 현재 child manifest만 취함; 외부경로·hash mismatch 거부 |
| A2V1-06 | request identity·JSON 파서 엄격성 | positive/negative | Playwright Request 객체 identity를 WeakMap으로 관리하고 response.request()로 대응. req.postDataJSON() 호출·배열의 첫 query 객체 키/타입/필드 전수 검증. res.json() promise await/오류 기록, inflight drain; status0을 200으로 만드는 fallback 제거 | 동일 URL 동시 요청, unknown query key, malformed JSON, unfulfilled request의 raw/source requestId가 변조 없이 유지; 실제 오류는 FAIL |
| A2V1-07 | Held Route 시간제한·자원 종료 | negative/positive | NormalHeldRouteController에 own timer handle 및 clearTimeout finally, release/abort/shutdown method, once-only state transition 추가. 실패·timeout·step throw 전 경로에서 try/finally로 route fulfill/abort와 unroute를 소유. 페이지 종료 후 dangling timer 0 | waitForStart/Complete success 두 timer 잔류0, fault after held start에서 route 리소스 정리·원 오류 보존 |
| A2V1-08 | 로그/오류 민감값 가림 | negative/positive/owner | login creds/임시 password/nonce/token 같은 runtime secret은 RAM-only registry, scrub before serialization, console/pageerror/requestFailed/stack/network/url(쿼리)의 whitelist/generic redaction. 보호 helper가 기록하는 내용도 원본 raw 유출 전에 제어 가능한지 확인. impossible이면 BLOCKED, 분기 외 마스킹으로 완료선언 금지 | 무해 SOL_FAKE_SECRET_FOR_REDACTION_TEST sentinel을 actual login-error message에 넣어 모든 출력·logs·trace·partial에 노출 0, redaction happened 기록 |
| A2V1-09 | Junction 직접 CLI 진입 우회 | positive/negative/shared | fileURLToPath(import.meta.url)과 process.argv[1]을 모두 fs.realpathSync로 비교, false인 script executed via junction에서도 미인증 direct CLI는 RC1. import side-effect0이 유지돼야 함 | own directory junction을 설치하고 known/private case direct 실행, 실제 RC1/stdoutPASS0, bootstrap read/browser/http0 |
| A2V1-10 | 부모 환경·IPC ACK wire | owner/shared/negative | buildChildEnv에서 SHIFT*/SHIFTMGMT*/AUTH_BOOTSTRAP_* 및 NODE_OPTIONS/NODE_DEBUG/프로브 환경 격리, 필요한 owned keys만 재주입. 부모 bootstrap 호출에도 sanitized env/credential flow를 설계하고 raw error에 secret 노출0. wire ACK는 nonce echo original protocol2를 지킨 뒤 storage-only nonceSha256 투영; A1 contract-core 절차 변경 불가 | parent/child poisoned env, wrong nonce/PID/ppid, forged stub, original A1 ACK contract 모두 독립 실행 |
| A2V1-11 | 실제 명령 PID와 기록 불일치 | owner/negative | 명령 receipt는 child_process.spawn이 반환한 child.pid, real event timeMs, 실제 wait exit/close RC, stdout/stderr byte hash에서만 생성. driver PID/expectedRC/zeroelapsed를 실제값으로 복사하지 않음. 구현 회신의 command indices는 저장 receipt에서 기계 생성하고 참조 경로/sha 추가 | 고정 22명령 및 expansion receipts의 명시 claim과 source-record PID/RC/time 1:1 대조, 불일치면 FAILED 제출 |

## 2. 순서와 검증 장벽

1. **P0 원본 잠금 — 2026-10-16 원인 해결:** GitHub LF blob `execution.json`(9,753B), `baseline.json`(196,296B)이 Windows CRLF 체크아웃에서 각각 10,115B/199,973B가 되고 원 고정 SHA-256과 **100% 일치**함을 로컬 MEASURE_ONLY 및 Sol GitHub 독립 변환 SHA로 검증. `EOL_LOCK_RESOLUTION.md` 참조. **새 계약 복제·원 SHA 재봉인 불필요.** 실행 preflight는 실제 참조하는 Windows 전체 물리경로와 4계약 SHA 재검사, 다른 clone은 EOL/경로가 같다고 가정하지 말 것. `environment-policy.json`의 .40은 RECON metadata이고 활성 gate는 installed findChrome()과 raw 버전 일치 비교; .41 자체만으로 실패라고 판단하지 않음 (실행 검증은 별도).
2. **P1 4개 SHA 고정:** 변경 시작 전 현재 제품 4개 전체 SHA 및 shared frozen fragment 6,575B SHA를 다시 계산. GitHub 단일 저장소에서 products under `ShiftMgmt_V4/`, contracts under `.ai/`; 기존 절대 로컬 물리경로를 혼동하지 않음.
3. **P2 실제 false PASS 제거:** negative reader/partial/expectedError, positive observation/requests/capture, owner fail-first barrier 및 ACK를 별도 단계로 수정. 각 단계마다 A1 locked gate 회귀 확인.
4. **P3 112개 원본 벡터:** `VECTOR_INJECTION_DESIGN_112.json`에서 `status=UNPROVEN`을 시작으로 실제 owned test tool이 각 원 ID/확장 target에 주입 → original receipt -> issuer raw source SHA -> verifier outcome을 기록. 실제 fault가 일어나지 않으면 해당 항목 `UNPROVEN`, 필수 사례는 FAIL.
5. **P4 8 normal:** `live-admin`, `list-fixture`, `empty-fixture`, `filters`, `errors`, `stale-response`, `role-guard`, `session-expired`; 실제 Chromium 로그인/HTTP/DOM/capture run-bound 증거. B87 fullUi 미실시 상태는 `FAIL_INCOMPLETE/RC1`가 **정상 설계상 출력**이며, 실제 assertion/cleanup failures는 `FAIL/RC1`.
6. **P5 독립 검수:** A1 acceptance 기록 보존. 전 112 실제 주입 완료·원 명령증거·4개 상한/frozen SHA·8 정상·A1 회귀·raw provenance를 독립 검수해도, A2/전체A 수용 판정은 **별도**.

## 3. 위임 시 엄격한 실행·오염 금지 계약

- Gemini의 작업물에는 최소 `baseline HEAD(full SHA)`, clean expected branch, root/product exact paths, 파일별 permitted changes, STOP conditions, 가상 실행의 raw logs와 자체 script 출처를 명시한다.
- 오류 발생 시 실제 최초 오류/partial 보존, own temp/child teardown; 타 PID/타 temp 제거 금지. 기존 계약/운영 데이터/개인정보 수정 금지.
- `negative-vectors.json`의 원 112 IDs 요구 중 `A-N03 known` 모든 private case 확장, `A-N04` healthy stub/IPC, `A-N07` 132/133 ACCEPT_BOUNDARY, `A-N14` 실제 unused API만 AST로 NOT_USED, `A-N19` FAIL_INCOMPLETE vs FAIL 분리. 다수 ID를 한 CLI invalid 요청으로 충당하는 것 금지.
- 한 파일이 `30,000B` 초과 시 즉시 BLOCKED_SCOPE. shared frozen의 원 SHA `502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1`와 6,575B 상수 유지. byte budget은 `BYTE_BUDGET_PROOF.md` 참조. 단순 선행 공백 제거 시뮬레이션은 **실행 검증되지 않은 가능량**일 뿐.
- 수정 파일 외 소스·테스트·빌드 설정 변경, 의존성 추가, 테스트 weakening/skipping, 원 A1 근거 재작성, B87 수용선언 금지.

## 4. 배포 가능한 구현 HANDOFF 발행 게이트

- [x] A2 v1 11건 원본 결함 목록과 복구 로직별 담당 파일 범위 명확화
- [x] 모든 112 원 ID별 정확한 소스 anchor/절차/원 receipt 필드를 `VECTOR_INJECTION_DESIGN_112.json`에 구체화 — **정적 설계이지 실제 주입 PASS 아님**
- [x] shared frozen 구간 밖만 대상으로 정확한 4개 기준 UTF-8 byte 규모/절감 후보를 계산 — **구현 코드의 최종 byte 수치 미검증**
- [x] GitHub 현재 계약 4개의 전체 SHA 직접 재계산
- [x] **GitHub LF ↔ Windows CRLF EOL 차이를 메모리 SHA-256 변환 및 로컬 두 위치 실측으로 해결** (`EOL_LOCK_RESOLUTION.md`) — 원 계약/검증기 무수정
- [ ] 신규 clone에서 기존 Windows 절대 경로 의존 실행·개발 브랜치 경로의 충돌 방지 전략을 구현 HANDOFF에 명시 (기존 로컬 물리경로에서의 현재 계약 SHA 확인은 완료). A1 불변 유지
- [ ] 구현 파일별 순차 변경 예정 코드의 크기와 A1 회귀·syntax-only 통과를 격리 샘플에서 검증
- [ ] 그 뒤에만 루트 `HANDOFF.md`를 append-only Log 보존 후 명시적 `Action: IMPLEMENT`로 발행

**현재 결론:** GitHub raw LF와 Windows worktree CRLF 간 외관상 SHA mismatch 원인은 완전히 해소됨. 남은 것은 구현 실행 위치 분리/바이트 용량, 실제 Windows SDK/테스트 계측 및 A2 독립 수용 게이트다. 이 문서만으로 Gemini가 코드 수정에 착수해서는 안 된다.
