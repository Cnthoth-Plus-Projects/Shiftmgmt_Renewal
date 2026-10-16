# A2 v2 — I2 pending probe 수용 기록 및 I2b 원 소스 개선

- 날짜: 2026-10-16 KST
- 상태: **I2_PENDING_PROBE_PASS / I2B_STATIC_ONLY / ORIGINAL_A1_8NORMAL_112NEGATIVE_UNVERIFIED**
- 출처: 사용자가 전달한 Windows `VERIFY_ONLY` 실행 결과, Sol이 직접 조회한 GitHub source/branch, Browser App Bridge 실제 소스와 API query 계약.
- 제품 구현 브랜치: `work/phase3-2c-a2-v2-implementation`. 기존 GitHub `main`, 보존된 A2 v1 FAIL, Windows 원본 dirty12/계약 불변.

## 1. 제출된 I2 실행 증거 (원자료 직접 접근과 구별)

- 실행 당시 원격 HEAD 및 로컬 HEAD `158ef6136c7fca13b1c054d1d8e77a9beb475bc3`, git status clean, `core.autocrlf=false`.
- 사용자 보고: owner 29,351B/2490A4DC..., shared 29,973B/C0AB887F..., positive 23,830B/E9D668F4..., negative 28,618B/8735993C..., Sol 원격 기준과 일치. 실제 GitHub 파일 blob 또한 변경 없음.
- Node `--check`: positive RC0, negative RC0.
- 외부 scratch `i2_probe.mjs`의 실제 `publishNormalEvidence` 호출: exit RC0, stderr 0B, stdout `I2_PENDING_PRESERVED`. raw observation request#1 `status=0,endedAtMs=null`, request#2 `status=403`, worker-final `FAIL_INCOMPLETE`. raw SHA-256 `323F318D1428269E62C39C4FE899E08D82D412FE18FE7C60344CADA35DD53890`.
- 이 테스트는 **실제 HTTP 통신을 일으키지 않는 export-helper 검증**: 403은 수동 입력한 테스트 fixture. 실제 Chrome/Playwright 요청/응답 타이밍이나 positive callback PASS를 뜻하지 않음. 외부 로컬 스크립트/원 증적 bytes는 본 원격 세션에서 직접 열어 검증하지 못했으며 `LOCAL_AGENT_REPORTED` 수준.
- `I2 pending-preserve helper`는 이 제한된 검증 범위에서 PASS; 이전 I1 T10/A1/8 normal/112 negative는 UNVERIFIED.

## 2. I2b Sol 직접 변경

### Playwright 실제 viewport / 페이지 URL 관측

`access-history-positive.mjs`의 `runScreenCheck({steps})` callback 시작 시 `page.viewportSize()`를 실측해 `environment.viewport`를 갱신. 실제 페이지 URL의 `new URL(page.url()).origin`으로 environment.origin 갱신. viewport null/비유한 숫자는 fabricated 값으로 채우지 않고 Error로 실패. 이것은 **protected helper가 page.goto 이후 steps를 호출한다는 실제 `scripts/lib/ui-check.mjs` 소스 확인**에 근거함.

**한계:** protected `runScreenCheck`의 browser/context 생성·종료 시각을 이 외부 steps에서 정확히 관측할 수 없음. 기존 source가 callback 진입을 acquire timestamp, helper 반환을 close timestamp로 대용하는 문제는 여전히 남아 있으며 **정확한 closedAtMs PASS로 주장 금지**. 해당 protected helper 자체는 A1 보호 범위로 수정하지 않음.

### strict RPC query parser

`access-history-negative.mjs`의 `parseNormalBridgeQuery`는 기존 `JSON.parse(request.postData())` 대신 **실제 Playwright `request.postDataJSON()` 호출**을 사용. 근거:
- 보호 `src/web/bridge/app-bridge.ts`가 request body를 `JSON.stringify(trimTrailingUndefined(args))`로 HTTP POST.
- `src/shared/bridge/contracts.ts`의 `AccessLogListQuery` 허용 필드는 dateFrom/dateTo/loginId/actionType/keyword (각 string).
- []은 정상 zero-argument RPC이므로 null 반환, [{}]은 빈 query 객체로 반환, [query]는 허용 필드/string만 수용.
- 잘못된 배열 구조, 알 수 없는 키, string 아닌 값, postDataJSON 미구현/throw를 무음으로 null로 만들지 않고 Error로 전파.
- Code byte/contract 및 UI 본 기능 코드 수정하지 않음. 실제 Node/브라우저 동작 확인은 별도.

## 3. 현재 GitHub source SHA-256 및 크기

| 파일 | bytes | SHA-256 |
|---|---:|---|
| `access-history.mjs` | 29,351 | `2490A4DC38D65E6FDDD571C64D9903882334F243239D2F697A807BDA481DC9E7` |
| `access-history-shared.mjs` | 29,973 | `C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4` |
| `access-history-positive.mjs` | 24,141 | `AFD06A0E1CD11F0160E63290C72CDBF1C1235349E146CBE9603F28DF7F2DB469` |
| `access-history-negative.mjs` | 28,753 | `3D13EBC741439ADA3F24D43797C51E525DC821A05516DEC9CD902C0AC23D47D3` |

모두 30,000B 이내, 원 owner/shared/frozen 내용 불변. I2b는 **정적 소스 검토 완료, Windows syntax/strict parser probe 및 실제 browser viewport 미검증**.

## 4. 이후 우선순위

1. Windows 별도 clone에서 `node --check` 및 real exported parser 위조·유효 RPC 입력에 대한 단일 작은 자가시험. 이전 pending probe는 이미 PASS, 재실행하지 않음.
2. 실제 브라우저 환경에서 `viewport=[1440,901]` → raw가 [1440,901]로 기록되는지 검증; A1 원본 환경 overlay 승인 전 수행 금지.
3. async `page.on('response')`의 `res.json()` 완료·실패·요청 drain 증거, `requestfailed` 증거를 I2c 별도 수정·검수 대상으로 관리. 보호 helper의 browser/context acquire/close 실제 이벤트는 가능한 계측 경계가 확인되지 않으면 UNPROVEN.
4. A2V1-03 independent reader는 별도 I3; 11 defects 전체/112 원 실측 수용 선언 금지.
