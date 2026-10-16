# A2 v2 I3 — 계약 정합성 및 최소 Reader 검증 게이트

Date: 2026-10-16 KST. Branch: work/phase3-2c-a2-v2-implementation.

## 기준 점검

Sol은 GitHub의 actual normal publisher, owner, contract, Reader 네 소스를 대조했다. Reader의 raw schema/case/runId/PID/context/contract/execution SHA 및 worker-final status=FAIL_INCOMPLETE, exitCode=1, rawSha256/coverage 구조는 현재 writer와 일치한다. 필수 ID 목록은 `contract.fullUi.rules[caseName]`에서 가져오며 normal 8개 이름이 `execution.normalCases`에 정의되어 있다.

추가로 Reader의 `raw.diagnostics?.map(...)`와 `coverage.extra`가 둘 다 undefined가 될 경우 배열이 없는 malformed raw 증거를 허용할 수 있어, `execution.normalCases` 허용 목록·`contract.fullUi.rules[caseName]` 배열·`raw.diagnostics` 배열인지 먼저 검사하도록 수정했다.

negative.mjs 30KB 한도에서 새 guard를 구현할 공간이 부족해 `NormalHeldRouteController` 구간 141B 및 `NormalAssertionCollector` 구간 96B의 **선행 공백만** 줄였다. 각 변경은 원본과 변경본의 줄별 선행 공백 제거 결과가 완전히 같음을 GitHub 쓰기 전 확인했다. 두 클래스의 토큰·문자열·라인 순서 변경 없음.

## 원격 실제 크기·SHA-256

| 파일 | Bytes | SHA-256 | 잔여 |
|---|---:|---|---:|
| owner access-history.mjs | 29,520 | `6AD4B439CB6B45920C113FA637ED4D97D703019D07E3DAE34B2D36BC7A2AEE22` | 480 |
| shared access-history-shared.mjs | 29,973 | `C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4` | 27 |
| positive access-history-positive.mjs | 25,678 | `B2BC468E2029ACD7769EE4049F16DAD8103B4E9D0E5833D0EA6ED4ADE1FB253D` | 4,322 |
| negative access-history-negative.mjs | 29,898 | `BEF4014A83E03FB97C1CA4886898A1787811AC25CCB75F82D7B2DF5EDD83F8FA` | 102 |

Hash computed directly on actual GitHub file UTF-8 bytes with SHA-256 test vector abc sanity-check; Windows executable/source runtime was not yet rerun. Shared 6,575B frozen and root main/A2v1 archival unchanged.

## 검증 자산

Standalone `i3_reader_smoke_v1.mjs` (3902 bytes, SHA-256 `06F4B9DF8B767CF1C6F8E58FE3E231216540ECF0412E07A7B8C8EB92740F7003`) was created and passed **Node v22 syntax check in isolated cloud scratch**. It imports actual negative.mjs and shared.mjs on Windows (not a copied Reader), obtains real locked contract/execution in read-only mode, writes only synthetic evidence to a new scratch run directory, checks one valid FAIL_INCOMPLETE and 9 invalid inputs: status, exit code, PID, run ID, coverage, diagnostics structure, raw SHA, caller exitCode, caller caseName.

It does not simulate or launch Chrome, network/127.0.0.1, historical product, Python gate, normal8, original 112 negative vectors. It does **not** prove actual owner-child evidence authenticity or SDK callbacks. Isolated Windows runtime is still UNVERIFIED.

The script artifact was supplied to the user separately through this conversation; it is deliberately **not copied into the product repository**. Root HANDOFF has Action: VERIFY_ONLY with exact source SHA checks and one isolated run. Former HOLD was archived with original Git blob at `Log/20261016_A2V2_I3_HOLD_before_VERIFY_ONLY.md`.

## 수용 상태

I2c Node fetch helper 3 conditions: limited PASS from local agent report. I3 Reader: STATIC_SOURCE_REVIEW_PASS and local smoke runtime pending; I3 overall/A2 overall NOT ACCEPTED. Original Windows dirty12/contract/V3.4 and GitHub main/old rejected A2 v1 branch untouched.
