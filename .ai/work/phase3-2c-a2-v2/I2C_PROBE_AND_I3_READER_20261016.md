# A2 v2 — I2c helper probe 검증과 I3 Reader 보호

2026-10-16 KST. 상태: I2C_NODE_FETCH_HELPER_PROBE_PASS / I3_SOURCE_REVIEW_ONLY / I3_RUNTIME_UNVERIFIED / A2_NOT_ACCEPTED.

## 1. I2c Windows 측정 증거

사용자가 제출한 로컬 보고: 개발 clone의 GitHub 발행 HEAD 8071d5bc75a4bc8564f9213d940c121fc25b7b92 일치, Clean, core.autocrlf=false. 기존 4개 검증기 SHA/bytes는 GitHub 원본과 일치. positive/negative node --check RC0. 실제 export installNormalObserver().fetch에 대한 독립 scratch stub 3건이 RC0, stdout I2C_NODE_FETCH_PROBE_PASS / casesPassed=3 / pid=22844, stderr0B.

이 범위에서 JSON 파싱 실패는 A2_INVALID_JSON_BODY/ok=false, stub HTTP403은 원 상태 보존, stub 네트워크 throw는 status0이라는 결과를 확인. 원 local scratch 파일/실제 프로세스를 Sol 클라우드에서 독립 실행한 것은 아님: LOCAL_AGENT_REPORTED. **실제 localhost 통신과 Playwright 비동기 response 콜백/Chrome/8 normal/112 negative/A1은 미검증.** 이전 I2c 제출은 특정 helper 3조건에만 통과.

## 2. I3 원본 취약점 (A2V1-03 일부)

기존 readNormalWorkerEvidence는 normal-observations.json 및 worker-final.json 존재·JSON parse만 확인하므로 worker-final의 가짜 PASS/exit0/PID -1/비정상 case·runId/잘못된 rawSha256/빈 coverage를 그대로 반환했다.

Sol은 negative.mjs Reader에 다음을 추가:
- 실제 raw JSON Buffer SHA-256을 worker-final rawSha256과 비교
- 원 context의 JSON 해시, 부모가 전달한 실제 workerPid/exitCode, runDir basename, 원 계약·execution 해시 상수 대조
- raw schema/case/runId/PID 및 worker-final schema/A2/FAIL_INCOMPLETE/exitCode=1/빈 checks 대조
- contract.fullUi.rules[caseName]의 필수 ID 전체에 대해 worker-final.coverage의 requiredIds/missing/extra/duplicates를 검증
- mismatch에 A2_NORMAL_EVIDENCE_INVALID:<field>로 실패하고 worker evidence를 반환하지 않음

단, SHA 비교는 두 파일을 통째로 재작성 가능한 공격자에 대한 서명/출처 증명이 아니다. 실제 browser 원 callback, process receipts 및 worker context을 완전히 보장하려면 추가 독립 관측 필요. **I3 전체 수용 불가**.

## 3. Normal partial failure 보존

원 owner.mjs catch는 core-partial 파일만 읽었으나 normal-partial 및 fallback 파일도 탐색하도록 변경했다. 정상 partial의 경로와 원 바이트 SHA를 owner-failure에 기록한다. partial 원본이 민감한 raw 메시지나 credential을 포함할 수 있으므로 owner-failure JSON에 full raw를 중복 복사하지 않는다. 이 변경은 실패 후 남는 원 partial 보존 경로 개선일 뿐, 이후 close/gate 실패 중 temp 조기 제거 또는 이중 close 처리까지 해결하지 않는다.

## 4. 직접 GitHub 실제 파일 SHA-256

| File | Bytes | SHA-256 | 30,000B 여유 |
|---|---:|---|---:|
| access-history.mjs | 29,520 | 6AD4B439CB6B45920C113FA637ED4D97D703019D07E3DAE34B2D36BC7A2AEE22 | 480 |
| access-history-shared.mjs | 29,973 | C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4 | 27 |
| access-history-positive.mjs | 25,678 | B2BC468E2029ACD7769EE4049F16DAD8103B4E9D0E5833D0EA6ED4ADE1FB253D | 4,322 |
| access-history-negative.mjs | 29,987 | B1EB0997131EA4B5E7E174186FB63ABB38D456EBA963895B7C5E8EE46D7D1F16 | 13 |

모든 제품파일 30KB 이하. Frozen shared 6,575B 원 변경 0. Main, 보존된 rejected A2 v1, historical Windows dirty12, original management contract, V3.4 무변경.

## 5. 다음 실측 (VERIFY_ONLY)

새 Windows 개발 clone에서 git remote HEAD/clean, owner/positive/negative node --check, 4파일 bytes/전체 SHA, 실제 export readNormalWorkerEvidence 기반 scratch synthetic 테스트 1 valid + invalid fields 검증. Wrong PASS, exitCode0, wrong case/PID/run/rawSha256/coverage/checks 등을 독립 Reader가 거부해야 한다.

이러한 격리 모조 파일 테스트는 owner가 spawn한 실제 worker proof나 protected UI browser trace를 증명하지 않는다. Original A1/8 normal/112 negative, double-close fault, owner partial 실제 fault injection은 UNVERIFIED.

최종 판정: I2c Node-fetch 일부 검증, I3 Source patch 구현. I3 런타임·A2 전체 acceptance 미실행.
