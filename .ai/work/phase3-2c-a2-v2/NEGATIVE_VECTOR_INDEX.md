# A2 v2 — 원 음성 벡터 112개 추적 기준표

- **상태:** DESIGN/INDEX — 주입·검증 **미실행**. 모든 항목 `UNPROVEN`.
- **원본 정본:** `.ai/contracts/phase3-2c-a2-v1/negative-vectors.json` (원본 불변)
- **검사 기준:** A2 미수용 브랜치 `2f51c11710f46c75a49f5715cc68d4752b53f8ca`, GitHub 단일 저장소 `Cnthoth-Plus-Projects/Shiftmgmt_Renewal`.
- **전수 검산:** 그룹 20개, manifest 벡터 112개, 실제 열거 112개.
- **의미:** 아래 `expected` 값은 **원래 계약에 쓰인 기대치**이며 SUT 시험 결과가 아님. 원문 `A-N07` 경계 132/133 성공 요구 등 세부 관측은 각 그룹의 `requiredObservation`과 `special`을 함께 적용한다.
- **필수 구현 전 매핑:** 각 ID마다 (1) 특정 호출점 (2) 독립 실제 fault 주입 방법 (3) 주입 발동 원자료 (4) SUT/SDK/helper 실제 행위 (5) 원 PID/RC/시간/원 stdout·stderr SHA (6) 초기·실행·정리 부작용이 확인돼야 함.
- **금지:** CLI 인수 거절을 다른 결함벡터의 실제 재현으로 계산, driver 자체 RC0를 SUT RC0로 해석, 기대값 복사 receipt 생성.

## 그룹 원문 요구 요약

| 그룹 | 벡터 수 | 원래 필요한 관측 |
|---|---:|---|
| A-N01 | 3 | 각RC1; temp/server/worker/network0 |
| A-N02 | 6 | 각RC1; 외부 요청0; 자동trim/default0 |
| A-N03 | 18 | 각RC1; bootstrapread/network/browser/mkdir0 |
| A-N04 | 3 | IPC 없으면 RC1, stub request0, 원worker unknown-case우회0 |
| A-N05 | 7 | 각nonzero; dispatch전 sideeffects0; 자기child kill뒤close확인 |
| A-N06 | 13 | 각nonzero; outside read/write/network0; source변경0 |
| A-N07 | 9 | 모두거부;132와133은경계정상;상수actual/provenance불일치거부 |
| A-N08 | 5 | 각nonzero; 누락/중복/추가 실제목록기록; 빈required집합0 |
| A-N09 | 3 | 각nonzero;canonical fullmap/bytes 실측; 실제정본변경0 |
| A-N10 | 2 | 각nonzero;raw원문보존;문자열401예외0 |
| A-N11 | 2 | 각nonzero;다른자원close시도·첫실패/cleanup보존;누수0 |
| A-N12 | 4 | 각nonzero;timer=close0;PIDs/close/잔여temp실측;타PIDkill0 |
| A-N13 | 3 | 각nonzero;bootstrap/health순서우회0;partial/log/정리기록 |
| A-N14 | 4 | 각nonzero;parent PASS출력0;실패경로/첫stack stderr;자원종료확인 |
| A-N15 | 6 | 각nonzero;stdoutPASS0;가능한partial보존;close/cleanup완료 |
| A-N16 | 5 | 각nonzero;파일존재/bytes/hash/path정확확인 |
| A-N17 | 2 | parentnonzero;원stdout/stderr/childRC·미실행/partial미생성표시;finally가정0 |
| A-N18 | 5 | 포트점유시foreignHTTP0/server0/temp0;정상owned실행은오염0·execArgv자동전달0 |
| A-N19 | 8 | RC1/FAIL_INCOMPLETE,missing/extra/duplicate및모든실제오류보존;case/전체PASS0 |
| A-N20 | 4 | 각nonzero;record의자기PASS를믿지않음 |

## 원 벡터 ID 전수 목록

| # | 그룹 | 정확한 원 ID | 원 expected | 실제 주입/관측 상태 |
|---:|---|---|---|---|
| 1 | A-N01 | `A-N01/owner-noargs` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 2 | A-N01 | `A-N01/owner-empty` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 3 | A-N01 | `A-N01/owner-unknown` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 4 | A-N02 | `A-N02/owner-duplicate-case` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 5 | A-N02 | `A-N02/owner-separate-value` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 6 | A-N02 | `A-N02/owner-url-option` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 7 | A-N02 | `A-N02/owner-positional-url` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 8 | A-N02 | `A-N02/owner-case-leading-space` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 9 | A-N02 | `A-N02/owner-case-trailing-space` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 10 | A-N03 | `A-N03/direct-positive-known` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 11 | A-N03 | `A-N03/direct-positive-unknown` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 12 | A-N03 | `A-N03/direct-positive-noargs` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 13 | A-N03 | `A-N03/direct-positive-twoargs` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 14 | A-N03 | `A-N03/direct-positive-leading-space` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 15 | A-N03 | `A-N03/direct-positive-trailing-space` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 16 | A-N03 | `A-N03/direct-negative-known` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 17 | A-N03 | `A-N03/direct-negative-unknown` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 18 | A-N03 | `A-N03/direct-negative-noargs` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 19 | A-N03 | `A-N03/direct-negative-twoargs` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 20 | A-N03 | `A-N03/direct-negative-leading-space` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 21 | A-N03 | `A-N03/direct-negative-trailing-space` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 22 | A-N03 | `A-N03/direct-shared-known` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 23 | A-N03 | `A-N03/direct-shared-unknown` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 24 | A-N03 | `A-N03/direct-shared-noargs` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 25 | A-N03 | `A-N03/direct-shared-twoargs` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 26 | A-N03 | `A-N03/direct-shared-leading-space` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 27 | A-N03 | `A-N03/direct-shared-trailing-space` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 28 | A-N04 | `A-N04/forged-env-no-ipc-positive` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 29 | A-N04 | `A-N04/forged-env-no-ipc-negative` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 30 | A-N04 | `A-N04/forged-env-no-ipc-shared` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 31 | A-N05 | `A-N05/ipc-no-packet` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 32 | A-N05 | `A-N05/ipc-context-timeout` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 33 | A-N05 | `A-N05/ipc-nonce-mismatch` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 34 | A-N05 | `A-N05/ipc-owner-pid-mismatch` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 35 | A-N05 | `A-N05/ipc-worker-pid-mismatch` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 36 | A-N05 | `A-N05/ipc-ppid-mismatch` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 37 | A-N05 | `A-N05/ipc-case-mismatch` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 38 | A-N06 | `A-N06/ipc-contract-path-missing` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 39 | A-N06 | `A-N06/ipc-contract-path-mismatch` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 40 | A-N06 | `A-N06/ipc-contract-digest-missing` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 41 | A-N06 | `A-N06/ipc-contract-digest-mismatch` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 42 | A-N06 | `A-N06/ipc-run-external` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 43 | A-N06 | `A-N06/ipc-run-sibling` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 44 | A-N06 | `A-N06/ipc-run-symlink` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 45 | A-N06 | `A-N06/ipc-temp-external` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 46 | A-N06 | `A-N06/ipc-temp-sibling` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 47 | A-N06 | `A-N06/ipc-temp-symlink` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 48 | A-N06 | `A-N06/ipc-bootstrap-external` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 49 | A-N06 | `A-N06/ipc-bootstrap-sibling` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 50 | A-N06 | `A-N06/ipc-bootstrap-symlink` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 51 | A-N07 | `A-N07/near-tolerance2` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 52 | A-N07 | `A-N07/near-tolerance4` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 53 | A-N07 | `A-N07/near-toleranceNaN` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 54 | A-N07 | `A-N07/near-actualNaN` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 55 | A-N07 | `A-N07/near-actualInfinity` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 56 | A-N07 | `A-N07/near133.5-vs132-tol1` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 57 | A-N07 | `A-N07/near132-boundary` | ACCEPT_BOUNDARY | **UNPROVEN** — 별도 실측 증거 필요 |
| 58 | A-N07 | `A-N07/near133-boundary` | ACCEPT_BOUNDARY | **UNPROVEN** — 별도 실측 증거 필요 |
| 59 | A-N07 | `A-N07/constant-provenance-mismatch` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 60 | A-N08 | `A-N08/core-id-missing` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 61 | A-N08 | `A-N08/core-id-duplicate` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 62 | A-N08 | `A-N08/core-id-unknown` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 63 | A-N08 | `A-N08/core-id-extra` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 64 | A-N08 | `A-N08/unknown-case-required-nonempty` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 65 | A-N09 | `A-N09/fixture-publish-wrong-label` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 66 | A-N09 | `A-N09/canonical-compiled-label-drift` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 67 | A-N09 | `A-N09/canonical-compiled-hash-drift` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 68 | A-N10 | `A-N10/unrelated-console-401` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 69 | A-N10 | `A-N10/raw-pageerror` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 70 | A-N11 | `A-N11/actual-context-close-then-throw` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 71 | A-N11 | `A-N11/actual-browser-close-then-throw` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 72 | A-N12 | `A-N12/worker-timeout` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 73 | A-N12 | `A-N12/worker-kill-request` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 74 | A-N12 | `A-N12/kill-without-close-observed` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 75 | A-N12 | `A-N12/server-stop-timeout` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 76 | A-N13 | `A-N13/worker-spawn-error` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 77 | A-N13 | `A-N13/server-spawn-error` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 78 | A-N13 | `A-N13/server-exit-before-listen` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 79 | A-N14 | `A-N14/owner-final-denied-sync` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 80 | A-N14 | `A-N14/owner-final-denied-async` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 81 | A-N14 | `A-N14/owner-final-denied-atomic-rename` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 82 | A-N14 | `A-N14/worker-final-denied` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 83 | A-N15 | `A-N15/worker-stdout-denied` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 84 | A-N15 | `A-N15/worker-stderr-denied` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 85 | A-N15 | `A-N15/server-stdout-denied` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 86 | A-N15 | `A-N15/server-stderr-denied` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 87 | A-N15 | `A-N15/capture-denied` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 88 | A-N15 | `A-N15/core-observations-denied` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 89 | A-N16 | `A-N16/capture-missing` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 90 | A-N16 | `A-N16/capture-hash-mismatch` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 91 | A-N16 | `A-N16/capture-outside-path` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 92 | A-N16 | `A-N16/capture-broken-png` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 93 | A-N16 | `A-N16/worker-final-absent` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 94 | A-N17 | `A-N17/protected-preflight-health-exit-before-steps` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 95 | A-N17 | `A-N17/protected-preflight-chrome-exit-before-steps` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 96 | A-N18 | `A-N18/owned-stub-port-busy` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 97 | A-N18 | `A-N18/inherited-SHIFT-poison` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 98 | A-N18 | `A-N18/inherited-SHIFTMGMT-poison` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 99 | A-N18 | `A-N18/inherited-NODE_OPTIONS-poison` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 100 | A-N18 | `A-N18/execArgv-no-auto-forward` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 101 | A-N19 | `A-N19/normal-incomplete-live-admin` | INCOMPLETE | **UNPROVEN** — 별도 실측 증거 필요 |
| 102 | A-N19 | `A-N19/normal-incomplete-list-fixture` | INCOMPLETE | **UNPROVEN** — 별도 실측 증거 필요 |
| 103 | A-N19 | `A-N19/normal-incomplete-empty-fixture` | INCOMPLETE | **UNPROVEN** — 별도 실측 증거 필요 |
| 104 | A-N19 | `A-N19/normal-incomplete-filters` | INCOMPLETE | **UNPROVEN** — 별도 실측 증거 필요 |
| 105 | A-N19 | `A-N19/normal-incomplete-errors` | INCOMPLETE | **UNPROVEN** — 별도 실측 증거 필요 |
| 106 | A-N19 | `A-N19/normal-incomplete-stale-response` | INCOMPLETE | **UNPROVEN** — 별도 실측 증거 필요 |
| 107 | A-N19 | `A-N19/normal-incomplete-role-guard` | INCOMPLETE | **UNPROVEN** — 별도 실측 증거 필요 |
| 108 | A-N19 | `A-N19/normal-incomplete-session-expired` | INCOMPLETE | **UNPROVEN** — 별도 실측 증거 필요 |
| 109 | A-N20 | `A-N20/actual-raw-pointer-mismatch` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 110 | A-N20 | `A-N20/caller-expected-field` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 111 | A-N20 | `A-N20/caller-pass-field` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |
| 112 | A-N20 | `A-N20/caller-tolerance-field` | REJECT | **UNPROVEN** — 별도 실측 증거 필요 |

## 원래 정본의 특수 규칙

- **A-N03:** known means EVERY registered private case for that file, separate own subreceipts. Other variants separate invocations.
- **A-N04:** Every valid known private case, each with forged env and an owned healthy stub. No IPC. Stub request0.
- **A-N06:** Metadata realpath is allowed; outside payload read/write/network0. Use owned junctions if file symlink privilege unavailable; every listed run/temp/bootstrap escape still tested.
- **A-N07:** Boundary132/133 expected success; others reject; actual helper and original canonical parser both tested.
- **A-N14:** NOT_USED only sync/async/rename API demonstrably not used by actual final publication; provide AST path/hash/line. At least one real final denial and worker denial mandatory.
- **retention:** Only own isolated temp/testdir writes. Retain failed evidence. No source/control/foreign cleanup.

**최종 개수: 112/112.** 이 표의 생성은 검증 실행이 아니라 원 정본의 열거/추적성 확보임.
