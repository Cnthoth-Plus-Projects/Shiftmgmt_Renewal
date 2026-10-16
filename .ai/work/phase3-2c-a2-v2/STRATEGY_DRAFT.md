# GitHub 통합 이후 설계 정합화 — 2026-10-16

**문서 상태: DESIGN_DRAFT / NOT_READY_TO_CODE. 이 문서는 코드 수정 지시가 아니다.**
**적용 우선순위:** 아래의 GitHub 사실이 이후에 첨부된 Google Drive 원 초안의 오래된 경로·브랜치·미커밋 상태보다 우선한다. 원 초안은 변경 없이 후반에 보존한다.

## G0. 현재 원격 기준을 실측 확인한 사항

- 정본 GitHub: `Cnthoth-Plus-Projects/Shiftmgmt_Renewal` (Public).
- 수용된 안정 기준 `main`: `c21aa263a02e57d57949bafc5aefe06aab582acd`; 333개 제품 파일이 `ShiftMgmt_V4/` 하위에 있으며 원본 `160940f9aaeb6696538447f83b44658073e382f0`의 트리와 Git blob SHA가 333개 모두 동일하다.
- A2 v1 미수용 기준: `work/phase3-2c-a2-v1-not-accepted` @ `2f51c11710f46c75a49f5715cc68d4752b53f8ca`; 333+8 = 341개 제품 파일, 안정 기준 대비 추가8·수정4·삭제0. 이는 A2 *미수용* 상태이고, A1 ACCEPTED 과거 이력과 별개의 제품 변경이다.
- **본 설계 분기:** `work/phase3-2c-a2-v2-design` — 위 A2 미수용 브랜치의 `2f51c117...`에서 출발. 제품 코드 수정 없음.
- 저장소 상대 위치: 계약/제어 `.ai/contracts/...`는 **GitHub 루트**, 제품 코드/실행 스크립트는 **`ShiftMgmt_V4/`** 아래다. 새 clone에서 기존 원형의 `C:\Projects\Active\교대근무관리 시스템`과 `C:\Projects\Active\ShiftMgmt_V4` 절대 경로가 자동 성립하지 않는다.

## G1. 과거 v1과 충돌하지 않는 실행 위치 매핑 — 선행 검증 필요

- 기존 `access-history.mjs`는 `process.cwd()`를 제품 루트로 검사하고, `access-history-shared.mjs`/owner에는 Windows **절대 경로** 계약, execution, baseline, Python 실행기가 하드코딩되어 있다.
- 따라서 검증 실행은 반드시 제품 루트에서 하되, 원 계약·환경 경로가 실제 가리키는 파일과 **byte-for-byte 일치**하는지 확인해야 한다. 새 GitHub clone에서 부모 폴더가 바뀐 것만으로 `A1_LOCK_MISMATCH`가 발생하면 그 결과는 A2 결함 재현 성공이 아니다.
- 원래 v1 정본 계약·검증기/Log는 변경하지 않는다. v2의 상대 경로 해석 개선은 신규 별도 설계 승인과 신뢰 경계 검증을 거쳐야 하며 A1 수용 기준을 소급 바꾸면 안 된다.
- URL `http://127.0.0.1:18741/` 및 Chrome/Node/Playwright 런타임 버전을 Windows에서 직접 측정해야 한다. 현 GitHub 정적 조회만으로 v2 실행 준비됨을 선언하지 않는다.

## G2. 원 112벡터 정본의 직접 확인

- `.ai/contracts/phase3-2c-a2-v1/negative-vectors.json`을 GitHub에서 열람하여 `vectorCount=112`, `groups.length=20`, 개별 벡터 실제 합계 **112개**를 확인했다.
- 정본의 `proof=PLAN_ONLY_NOT_RUN`이며, 각각의 `requiredProof=ACTUAL_SUT_OR_SOURCE_HELPER_NOT_PARSER_ONLY` 요구를 유지한다. 원 벡터 ID·기대 조건을 재명명하거나 45개 CLI 거절을 112개 SUT 실측으로 승격하지 않는다.
- v2 작성자는 112 ID 전체에 대해 `source call site → 주입 도구 → 실제 주입 발동 → 원 PID/시간/로그 → SUT 판정`의 개별 매핑이 **완료**돼야 구현 READY를 주장할 수 있다.
- 이에 대한 출발점 문서: `.ai/work/phase3-2c-a2-v2/NEGATIVE_VECTOR_INDEX.md` (전 항목 UNPROVEN).

## G3. 현재 제약과 바로 다음 선행 작업

- 기존 4개 검증기 SHA-256은 v1 반려 종결 기록과 동일. GitHub A2 v1 보존 브랜치의 4개 파일은 각각 29,351 / 29,973 / 22,530 / 27,848 bytes다. 상한은 파일별 30,000 bytes로 shared의 여유는 **27 bytes**뿐이다.
- `A2V1-01~11` 11개 결함은 원본 HANDOFF/`findings.json`을 1:1 추적한다. 10건으로 축소하지 않는다.
- 선행 단계: Windows read-only preflight에서 GitHub clone/worktree 상태, 런타임/Chrome 실측, v1 계약 경로, 4개 SHA, 112 주입의 실제 가능성과 30KB 한도 구현안을 확인. 보고가 미제출되거나 충돌하면 `BLOCKED`로 둔다.
- 인수 기준: 정상8의 실제 실패를 `FAIL_INCOMPLETE`로 위장하지 않기, 오류 증거/첫 실패/정리/자식 프로세스 영수증을 변조 없이 보존하기, 실제 112 하위 벡터 증거 확보, v1 A1/contract 불변.
- **현재 이 설계에는 현장 실행 검증 또는 구현 권한이 없다.** 루트 `HANDOFF.md`의 `CLOSED / FAILED_A2_NOT_ACCEPTED`는 유지하고, v2 IMPLEMENT handoff는 게이트 충족 후 별도로 작성한다.

---

## 아래: 10월 16일 Drive 설계 원 초안 (역사적 경로 표기는 G0~G3가 대체)

# ShiftMgmt V4 — Phase 3-2c-A2 v2 전략·검증 설계 재정리

- 작성 기준일: 2026-10-16 (KST)
- 분류: **DESIGN / REVIEW DRAFT** — 구현 지시서 아님, 구현 승인 아님
- 대상: A2 정상 8개 실행과 A-N01~20 음성 검증의 신뢰성 복구
- 원칙: A1 ACCEPTED 이력 유지 / A2 v1 CLOSED·FAILED·NOT_ACCEPTED / 전체 A·B87·3-2 미수용
- 기준 저장소: `C:\Projects\Active\ShiftMgmt_V4`, `main`, HEAD `160940f9aaeb6696538447f83b44658073e382f0`
- 10월 16일 상태 **문서상 확인**: 미커밋 12경로(추적 수정4·미추적8), 341개 소스 크기·SHA 동일. 이 작성 세션에서 현지 Windows Git·Chrome·Node 실행 재검증은 하지 않았음.
- 변경 범위: 이번 문서는 설계만 작성. 제품 코드·시험·운영 데이터·기존 A2 v1 정본·TODO·HANDOFF·Log 변경 없음.

## 0. 결정 및 허가 경계

1. 이전 `HANDOFF.md`는 `CLOSED / FAILED_A2_NOT_ACCEPTED`, `회신: 불필요` 종결 기록이다. 이를 Gemini 구현 지시로 재사용하지 않는다.
2. Sol이 설계·허용 파일·테스트·수용 기준을 닫고 신규 HANDOFF를 발행하며, 사용자가 이를 Gemini에 전달한다. 이번 설계 초안 자체는 `READY_TO_CODE`가 아니다.
3. 사용자 DEC-002는 A1의 owner 한 파일 직접 수정으로 소진됐다. A2에 대한 Sol 직접 제품 수정 권한 없음.
4. 원본 `ShiftMgmt_V3.4`, 승인·수당·DB·API·권한·웹 화면·캡처 공통 실행기는 읽기 전용. 가짜 UI, 테스트 약화, 원계약 수정에 의한 우회 금지.
5. **이번 v2의 완료 목표**는 정확한 A2 관측·오류·실행 증거와 음성 테스트의 독립 재현이다. `B87` 87개 UI 검사항목을 구현·수용하는 것이 아니다.

## 1. 검증한 출발점

### 1.1 기존 A2 네 파일의 Drive 보관본 SHA-256 실측

| 파일 (`scripts/ui-checks/`) | bytes | SHA-256 (대문자) |
|---|---:|---|
| `access-history.mjs` (owner) | 29351 | `2490A4DC38D65E6FDDD571C64D9903882334F243239D2F697A807BDA481DC9E7` |
| `access-history-shared.mjs` | 29973 | `C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4` |
| `access-history-positive.mjs` | 22530 | `77B3131220F578897630A9717ACFFC83437189FF2B2D80C13F51528DEE0BFE01` |
| `access-history-negative.mjs` | 27848 | `F49C87B2411664EFE6B2EF6C1DDE60010FB3AD8FCE710533A8C410A925A73BD6` |

이 네 파일의 크기와 SHA는 10월 14일 HANDOFF의 A2 v1 제출 내용과 일치한다. 현장 실행 저장소와의 동일성은 신규 착수 시 다시 확인해야 한다.

### 1.2 환경 기준과 이전 증거의 의미

- A2 v1 잠금 Chrome `155.0.8059.40`; 10월 16일 상태보고에서 확인한 설치 Chrome `155.0.8059.41`. **새 v2 기준은 현지에서 설치 실행파일 경로·버전·실제 Playwright SDK 반환값·관련 환경을 재측정한 뒤 별도로 봉인**한다. v1 정책/계약/판정기를 소급 변경하지 않는다.
- v1에서 원래 고정 22개 명령 RC0, stdout/stderr 44건의 원문·해시 일치, 정상 8개 형식검문 PASS는 **기록된 과거 사실**이다. 음성 112개가 모두 실제로 재현됐다는 증거 또는 제품 검수 통과를 뜻하지 않는다.
- `FAIL_INCOMPLETE/RC1`은 **실제 시나리오와 정리 모두 정상 완료되고 fullUI ID가 아직 누락됐을 때만** 사용할 수 있는 A2 단계 상태다. 정상 시나리오 실패, 증거 쓰기 실패, 브라우저 종료 실패 등은 `FAIL/RC1`로 분리한다. 독립 gate RC0은 단지 불완전 증거 **형식** 판정일 수 있다.
- 프로젝트 원 계약의 `CORE9`와 `fullUI87`, 기준 레이아웃 허용차 `<=1px`, canonical8/기존 회귀 조건은 임의 삭제·완화하지 않는다.

### 1.3 용량·범위의 착수 차단 요건

기존 A2 v1 제약은 **4개 기존 mjs만 변경, 각 30,000 bytes 이하, 새 추적 소스 0개, 의존성 변경 0**이다. 현재 여유는 owner 649B, shared 27B, positive 7470B, negative 2152B이다. 특히 shared의 27B 여유로는 무작정 보완하기 어렵다.

**필수 선행 결정:** 현지 원본에서 새 변경을 넣을 수 있는지 파일별 코드 이동·중복 제거·용량 예산을 **행동 동일성·frozen 구간 불변을 검증하면서** 증명할 것. 4파일/30KB 제약을 만족할 수 없으면 **BLOCKED_SCOPE / REPLAN** 처리하며, 파일을 추가하거나 상한을 묵시적으로 높이거나 공백 압축으로 증거를 감추지 않는다. 새 허용 범위는 별도 명시적 결정 후에만 적용한다.

## 2. A2 v2의 수정 전략 — 순서 고정

### M0. 잠금, 정본, 검증기 준비 (코드 수정 전)

1. 실제 `git rev-parse HEAD`, `git status --porcelain=v1 -z`, 341파일 inventory/SHA, 위 네 파일 해시, A1 수용 근거의 파일·기준 상태를 독립 측정한다.
2. v1의 source/control/contract/checker/Log를 읽기 전용으로 보존하고 v2 독립 baseline·검증기·환경 지문을 **새 판본**으로 정리한다. 현재 환경이 판정기 기대와 다르면 `BLOCKED_ENV`로 종료하고 그 결과를 대상 오류 재현 성공으로 세지 않는다.
3. 20종(A-N01~20) 하위 112벡터 원 정본을 요구 ID·주입 방식·대상 호출점·실제 기대 거절 상태·증거 항목으로 전개한 추적표를 만든다. 이 112는 기존 정의를 따라야 하며 새 분류로 개수를 바꾸지 않는다.
4. 실제 소스와 외부 계약이 서로 요구 불가능한 부분을 발견하면 거짓 PASS가 아니라 명시적인 설계 충돌 목록을 제출한다.

### M1. 실행 진입점 및 IPC 정합성

- **A2V1-09**: `fileURLToPath(import.meta.url) === path.resolve(argv[1])`의 문자열 비교 대신 양쪽 실제 파일 realpath를 비교한다. junction/symlink 별칭으로 직접 실행해도 known/unknown/noargs/badargs의 `RC1`과 **부작용 0**을 관측한다. module import만으로 계약/자격증명 읽기, 폴더 생성, 브라우저 시작, 타이머 설치가 발생하지 않아야 한다.
- **A2V1-10**: owner의 child 환경변수 화이트리스트, bootstrap 자격증명 경로 정규화, IPC 등록 및 ACK wire packet의 **정확한 키·nonce 해시·실제 PID/ppid·context digest**를 함께 검증한다. core ACK 원계약과 normal ACK를 혼합하지 않는다. 알 수 없는 키/누락/변조가 있으면 RUN 이전 거절한다.
- 성공 전제 없이 ACK·spawn·exit·close 및 stdout/stderr finish/close는 실제 이벤트 콜백 시각을 기록한다.

### M2. 실제 요청·브라우저·관측 생성

- **A2V1-02**: 관측 필드는 **실제 이벤트 이후에만** 값이 들어간다. 시작부터 끝나지 않은 요청의 `status=0`을 200으로 변경하지 않으며, steps entered/completed와 context/browser acquired/close는 실제 호출·반환 시점에만 갱신한다. `viewport=[1440,900]` 고정 문자열로 실제 1440×901을 위조할 수 없게 SDK 실측 viewport와 raw를 바인딩한다.
- **A2V1-06**: Playwright request 객체 identity를 WeakMap/동등한 단일 대응표로 부여해 request→response→requestfailed를 동일 ID로 묶는다. 같은 URL의 동시 요청을 첫 미완료 행으로 임의 연결하지 않는다. 실제 `Request.postDataJSON()` 반환 형태를 엄격히 검증하고, 모르는 query 필드·타입·인수 누락을 조용히 버리지 않는다. HTTP 본문 실패는 실제 errorCode/status와 별개로 표기한다.
- expectedErrors는 화이트리스트와 해당 case/phase/requestId/origin/status/errorCode를 **모두** 만족하는 경우에만 분류한다. `DATABASE_ERROR` fixture의 `HTTP200`은 실패 응답이지만 `401/403` 면제 근거가 아니다. 관계없는 콘솔 오류·401은 금지한다.
- 로그인/권한은 실제 격리 계정·서버 응답/세션으로 확인한다. `userId`/역할/비밀번호 변경 여부를 추측값으로 채우지 않는다. 토큰·쿠키·비밀번호 값은 기록하지 않는다.

### M3. 실패·부분 로그·보호 실행기·증거 경로

- **A2V1-04**: 관측 객체 생성 직후부터 phase 변경·resource 획득·network·step 진입·오류·종료 이벤트마다 `normal-partial`을 원자 저장한다. 첫 예외를 `primary`에 보존하고 후속 cleanup/evidence error를 별도로 보존한다. 첫 오류를 generic `worker-exit mismatch`로 대체하지 않는다.
- **A2V1-03**: `updatePartial()`에서 주·fallback 양쪽 쓰기가 실패해도 조용히 return하는 경로를 금지한다. 최소 `stderr`의 첫 오류/시점/대상과 재검증 가능한 own failure artifact를 남기며, 불가능할 때에는 `FAIL`을 선언한다. owner는 `normal-partial` 및 fallback을 확인·검문하고, 일부 또는 잘못된 worker-final을 수용하지 않는다. **실패 증거가 살아 있는 동안 own temp를 선삭제하지 않는다.**
- **A2V1-05**: protected 실행기가 **이번 실행에 실제로 발행한 manifest 위치**를 원 stdout/manifest/run-id/유효 경로 바인딩으로 획득한다. `run-*` 디렉터리 이름을 정렬해 가장 최신 sibling을 가져오는 방식 금지. 자기 실행이 아닌 PNG·manifest, 오래된 파일, 외부 심볼릭 링크 경로는 거절하고 원경로·copy경로·크기·SHA·PNG CRC·가로세로를 확인한다.
- **A2V1-03 추가 reader**: `raw.case/runId/workerPid/sha/contract/execution/context/required·missing·extra/actual child RC/artifact paths`를 독립 cross-check한다. 알 수 없는 case/workerPID=-1/raw SHA BAD/worker-final `PASS`를 원 A2 정상 증거로 허용하지 않는다.

### M4. 종료·Held·비밀정보 보호

- **A2V1-07**: `waitForStart/Complete` timeout 타이머는 성공과 실패 모두 `clearTimeout`한다. `held`가 시작되면 성공·오류·timeout·중단 어느 경로에서도 사용자 자신이 등록한 route를 `release` 또는 `abort`하고 완료/거부를 실제 기록한다. pending route가 browser.close를 영원히 지연시키면 `FAIL`이며, 중단/cleanup 실패를 정상종결로 승격시키지 않는다.
- **A2V1-08**: RAM에만 존재하는 민감정보 registry를 만들고, serializing 전에 password/token/cookie/auth header/nonce 및 예상 테스트 secret marker가 모든 `primary/cleanup/evidence/error/console/stack` 출력에 없는지 검사한다. 원문 secret을 로그에 적지 않는다. 회귀 검증은 **합성된 무해한 sentinel**로만 수행한다.
- 자원 정리: context와 browser 각각 실제 close 호출/성공 또는 던진 오류를 기록한다. 첫 close가 실패해도 다른 close는 독립 시도한다. 보유한 child/route/타이머만 정리하고 외부 PID·다른 temp는 건드리지 않는다.

### M5. 증거 출처·실행 영수증의 실측성

- **A2V1-01·11**: 112벡터 각각의 **정본 ID→실제 주입→주입 발동 관측→SUT 결과→로그/증거 경로·SHA**를 한 줄로 연결한다. 테스트 드라이버의 자체 RC0와 SUT가 거절했다는 사실을 별도 필드로 기록한다.
- `command receipt`의 PID는 해당 spawned child PID로부터, 시작/끝 시각은 실제 호출 전후 관측으로부터, RC·signal은 실제 프로세스 이벤트로부터, actual outcome은 로그/산출물에서 생성한다. `os.getpid()`를 자식 PID로 가장하거나 기대값 복사·출력 생성 스크립트의 추정값으로 대체하지 않는다.
- parser/self-validation/ledger/checker PASS는 **증거 형식 검문**으로만 남긴다. owner/SDK/file-system/IPC의 실제 오류 조건을 만들지 않은 CLI 인수 거절은 그 벡터의 재현으로 세지 않는다.
- 재사용 증거는 exact source hash·vector ID·run ID·PID/RC/시간/원로그 해시로 엄격히 묶이며, 조건이 다르면 재실행한다. 부적합 재사용은 `UNPROVEN`으로 기록하고 112 통과 수에 넣지 않는다.

## 3. 결함별 독립 수용 게이트

| 결함 ID | 반드시 확인할 실제 음성 검문 (성공 기준) |
|---|---|
| A2V1-01 | 112개 모든 ID에 서로 대응하는 실제 주입·관측·원영수증 존재; parser-only/CLI-only를 실제 주입으로 오인하면 거절 |
| A2V1-02 | 실제 viewport 1440×901, pending HTTP, close throw 주입 시 raw가 꾸며진 1440×900/HTTP200/close성공을 내지 않고 `FAIL` |
| A2V1-03 | 정상 raw/final 변조 6종 이상 및 normal partial/fallback 쓰기 이중 실패 시 owner `FAIL`, 첫 오류와 남은 증거 보존; temp 선삭제 없음 |
| A2V1-04 | steps 중·후 예외/보호 helper 종료 RC2/cleanup throw에서 최초 오류·현재 partial/실제 child RC가 owner 최종 실패로 연결 |
| A2V1-05 | 다른 run의 sibling manifest만 존재하거나 raw manifest 경로 바뀐 경우 현재 run 보존/정확 거절; 최신 시간순 복사 없음 |
| A2V1-06 | 같은 endpoint 동시2요청 역순응답·postDataJSON 미호출·알 수 없는 필드·다른401 콘솔에서 각각 정확 ID/거절/면제 없음 |
| A2V1-07 | Held 성공·timeout·abort·fulfill throw에서 타이머 잔존0·own route 미정리0·실제 close 오류 보존 |
| A2V1-08 | harmless sentinel을 오류·콘솔·stack에 주입해 영구 출력에 원문0; 자격증명 실제값 시험 금지 |
| A2V1-09 | 자체 생성 junction 경로로 positive/negative known/unknown CLI 직접 실행 시 둘 다 RC1·side effects0 |
| A2V1-10 | 잘못된 ACK 키/nonce/PPID/context·bootstrap 외부경로·오염 env에 대해 RUN 이전 차단, 정상 core/normal handshake 유지 |
| A2V1-11 | 제출 명령 N개를 원영수증과 PID·시각·RC·stream bytes·SHA 전수 대조하여 불일치0; 재작성 영수증은 거절 |

**중요:** 위 표는 신규 v2를 위한 필수 음성 설계 항목이다. 테스트가 실행됐다거나 수용됐다는 주장이 아니다. 원 계약 112개 하위 vector의 ID·개수·기대값과 실제 명령 맵은 별도 v2 검증 패킷에 고정한다.

## 4. 정상 8개 경로와 판정 의미

| case | 실제로 실행할 핵심 | 종료 조건 |
|---|---|---|
| `live-admin` | 실제 admin 로그인, 목록 조회, 홈 재진입, 로그아웃 | 원 이벤트·capture·종료 전부 일치 + fullUI 누락만 있으면 `FAIL_INCOMPLETE/RC1` |
| `list-fixture` | 격리 201건 목록, 표 스크롤·치수·XSS 관련 legacy 진단 | 동일 |
| `empty-fixture` | 0건, G2/필터 초기화 | 동일 |
| `filters` | keyword/query 본문 일치, 날짜 오류, refresh 잠금 | 동일 |
| `errors` | HTTP200+`DATABASE_ERROR`, retry held, 실제 native disabled 및 중복 요청 부재 | 동일 |
| `stale-response` | slow/fast 역순 응답, 오래된 응답의 화면 덮어쓰기 금지 | 동일 |
| `role-guard` | 운영/계획/승인 계정의 실제 403, admin 정상 조회 | 동일 |
| `session-expired` | 세션 종료 후 실제401, 로그인 화면, 무쿠키 차단 | 동일 |

- `FAIL_INCOMPLETE/RC1`은 검증 실패를 숨기는 기본 fallback이 **아니며**, 각 시나리오가 실제 종료하고 오류·정리·증거 결함이 없을 때에만 허용한다.
- `FAIL/RC1`은 assertion/response/시각/캡처/프로세스/정리/증거/판정기 오류 중 하나라도 발생한 상태다. 최초 오류·관련 부분 증거를 보존한다.
- `PASS/RC0` A1 contract-core/기존회귀 기록은 그 해당 범위만의 수용 의미. A2 정상8 `FAIL_INCOMPLETE`와 혼동하지 않는다.
- B87의 fullUi87 체크 등록, UI 최종 수용, 제품 릴리스는 별도의 후속 단계이다.

## 5. 향후 Gemini 구현 HANDOFF 발행 조건

아래 항목을 **모두 확인해야** `READY_TO_CODE`로 변경한다.

1. 신규 현장 브랜치/HEAD/status/341 source/hash/보호337+정본 control 재측정과 고정 환경(Chrome 실제 version/path, Node, Playwright, OS, 해상도) 및 기준 파일 SHA.
2. 4개 파일/각 30,000bytes 변경 가능성 실측 증명; 불가능 시 범위 변경 결정을 별도로 받아 문서화.
3. A2V1-01~11 **11개 전부** 소스 수정 위치·검증 방법·사전 기대 실패·완료 조건·허용 hunk로 연결.
4. 원 계약 A-N01~20의 **112 하위 벡터**를 각각 개별 실제 fault 주입으로 매핑하고, 실행 환경/격리 temp/외부 process 보호/증거 수집 방법을 명시.
5. normal8, A1 회귀51·IPC·guard·partial·late·typed 등 기존 필수 검증을 빠짐없이 나열. PASS 보고와 실제 실행 영수증을 구분.
6. 외부 판정기(gate)와 내부 helper를 모두 **거짓 PASS/거짓 FAIL_INCOMPLETE의 고의 변조 샘플**로 공격하는 mutation proof. 원본 정본을 바꾸지 않는 새 v2 control만 사용.
7. 오프라인 사전 점검은 `DESIGN_PROOF`로 표기하고 실제 SUT/SDK 검증과 별도 칸으로 표기. 재현하지 못한 경우 `BLOCKED/UNPROVEN`, 결과를 추정해 쓰지 않음.
8. HANDOFF에 파일별 변경 제한·금지 경로·실행 명령·기대 RC/수량·원본 sha/byte·콘솔·캡처·stdout/stderr full SHA·실제 PID/종료시각·변조 방어·회신 양식을 포함.

## 6. 다음 작업 순서와 현재 결론

1. **지금 완료한 것:** v1 종결본과 최신 Drive 보관 4개 파일의 동일성 확인, 11결함별 v2 수정 전략 및 음성 게이트 설계 초안 작성.
2. **현장 검증 필요:** 실제 로컬 개발 PC에서 환경·source/control 최신 지문, original negative vector manifest, protected helper의 구체적 동작을 읽기 전용 재확인. 이 단계는 아직 미실행.
3. **설계 봉인:** 파일별 byte budget/allowed hunk 실현성, v2 checker·control의 mutation coverage, 모든 112 벡터의 수용 명세를 닫고 v2 패킷 서명.
4. **그 다음:** `HANDOFF.md` 신규 IMPLEMENT로 발행 → 사용자 직접 Gemini 전달 → 구현 회신 → Sol 독립 실제 실행 검증 → A2 수용 여부 판정. 이어서 **전체 A** 독립 수용 후에만 **B87** 시작.

**현재 판정: `A2_V2_DESIGN_DRAFT — NOT_READY_TO_CODE`.** 이것은 구현 착수 승인이나 A2 완료 판정이 아니다. 기존 `A1 ACCEPTED / A2 v1 CLOSED FAILED / 전체 A·B87·3-2 PENDING`이 그대로 유지된다.

## 근거 자료 (모두 읽기 전용)

- `PROJECT_STATUS.md`, `project-status-20261016-evidence.json` (2026-10-16 상태보고)
- `TODO.md` (2026-10-15 상위 작업 상태)
- `HANDOFF.md` (2026-10-14 A2 v1 독립검수 종결)
- `architecture/STRATEGY_PHASE3_2C_A2.md` (기존 v1 설계; historical)
- `AGENTS.md`, `PROTOCOL.md`, `GEMINI.md`, `07-invariants-and-pitfalls.md`
- Drive `ShiftMgmt_V4/scripts/ui-checks/` 네 파일 SHA-256 실측(이 문서 1.1)
