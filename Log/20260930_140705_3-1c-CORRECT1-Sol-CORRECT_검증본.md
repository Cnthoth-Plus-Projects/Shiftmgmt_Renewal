# Phase 3-1c CORRECT1 — Sol 독립 검증 / CORRECT2

- Time: 2026-09-30 14:07:05 KST
- 판정: **CORRECT — 첫 수정 제출 미수용. 두 번째 통합 수정 필요.**
- 대상: V4 main / HEAD `2d97d9bb3dc649f8c40c0d1d0cfc9fdeae0df283`, 92경로 SHA `8D4954EE16CAAFDFD5B908D58E42CAF962316D539AAA3DB742DD3B366982D08B`.
- 정확한 수신 원문: `Log/20260930_134855_3-1c-CORRECT1-Gemini-IMPLEMENTED_수신원본.md`, 50,150 bytes / SHA-256 `4E5A52AB716C7AC5D086B493F1188D9A9DD6E0CFC4F9F39925C37B21C39F11F3`. 바이트·크기·해시 일치 보존.
- 검증 당시 요청 본문/제어 validation target 불변. 보호90경로·정본6개·제어9개 SHA 일치.

## 1. 결함별 판정과 잔여 범위

| ID | CORRECT1 판정 | 근거 / CORRECT2 대상 |
|---|---|---|
| R31C-01 | 독립 재현 PASS | 직원 일반 조회 실패에서 준비 비율 없이 오류 표시. 성공 복원 회귀는 계속 유지 |
| R31C-02 | 독립 재현 PASS | sites 실패에서 운영 비율 없이 오류 표시. 알려진 KPI/이름 경고 구분 회귀 유지 |
| R31C-03 | 일부 수정 / 잔여 FAIL | sync/recovery/admin-watch 일반 실패의 H4 차단은 PASS. H4 화면에서 refresh 조회 보류 중 기존 “할 일 없음”이 계속 표시됨 (`home.ts:105–108,670–685`) |
| R31C-04 | 일부 수정 / 잔여 FAIL | destroy 뒤 늦은 AUTH는 retry/restart 모두 callback 0, PASS. pending 중 refresh 뒤 응답 종료 및 일반 실패 후 2초 timer 중 refresh에서 새 버튼 영구 disabled (`home.ts:849–896,925–971,788–801`) |
| R31C-05 | 일부 보완 / 잔여 FAIL | 최종26 manifest/36캡처 실재/PASS. 기존 누락FAIL6건+retry 단독FAIL1건은 기재. 그러나 금회13xx 실행52건 중24건(FAIL2/PASS22) 누락; stale 시험은 destroy+AUTH만, 요구된 refresh/타이머 등 누락; 사본 크기2개 오기 |

## 2. Sol 실제 Chrome 12조건 관찰

실제 Chrome 154.0.8037.58 / 1440×900. 현재 제품 HomeScreen 및 실제 browser bridge, HTTP response fixture. 생성한 admin session이므로 서버 인증/실제 로그인 회귀를 수용 검증한 것은 아니다.

| 조건 | 실측 |
|---|---|
| 기존 직원/sites/sync/recovery/watch 실패5개 | 가짜 비율/H4 차단, 오류 표시: 5/5 PASS |
| 기존 destroy 뒤 late AUTH 2개 | expiredCalls=0, 새 화면 텍스트 불변: 2/2 PASS |
| pending action → refresh → 옛 AUTH 종료 (retry/watch 각각) | 요청 종료 후 busy=false지만 현재 버튼 disabled=true, “처리 중…” 지속: 2/2 FAIL |
| 일반 액션 실패 → 2초 timer 대기 중 refresh (retry/watch 각각) | timer 이후에도 busy=true/disabled=true, “처리 중…” 지속: 2/2 FAIL |
| H4 → refresh 요청 보류 | emptyTodosWhilePending=1, aria-busy=true 요소0: FAIL |

console/pageerror 0. 재현 도구 종료0은 7수정 확인 및 잔여5실패 재현에 성공했다는 뜻이다. 최종 수용 PASS가 아니다. 캡처 pending-refresh-retry.png를 Sol이 육안 대조했다.

## 3. 게이트별 증거와 한계

- 범위 PASS: 기존92상태행 일치, 수정은 home.ts/home.mjs만, 보호90개 SHA/부재 불변, 정본6개·제어9개 일치.
- 실제 diff PASS: home.ts +214/-31, home.mjs +426/-0. 사본 SHA는 착수 기준과 일치.
- 독립 `node --check scripts/ui-checks/home.mjs` 문법 오류 없음. 독립 `npx vitest run src/web/screens/home-model.test.ts --maxWorkers=1 --minWorkers=1` 종료0, 1파일/12시험 PASS(13:51 KST).
- `git diff --check` 및 사본→현재 no-index whitespace 비교에서 공백 오류 없음. Git CRLF 정규화 warning은 관찰되며 no-index 종료1은 파일 차이 존재를 나타낸다.
- typecheck/lint/map/build 및 전체132파일/912시험은 이번 독립 검증 재실행하지 않음: **UNVERIFIED**. Gemini PASS 보고만 있음. 필수 음성 게이트 실패로 추가 전체 실행은 중단.
- 실제 서버 인증/기존13 Chrome 회귀: 이번 독립 probe에서 미검증 **UNVERIFIED**. 최종26 manifest는 전건 존재/PASS, 36캡처 전건 존재 실측.
- H4 대기·busy 수명 음성/UI: FAIL. 검증기 두 stale case(`home.mjs:780–933`)는 실제 이탈 뒤 AUTH만 확인하며 refresh/다른 반환/타이머/살아 있는 AUTH·재시도 표를 검증하지 않음.
- 실행 이력 전수 FAIL: 이번13xx52건 중24건 미기재(FAIL2/PASS22). 아래 전수 목록. 기존6FAIL은 이번 회신에 기재됐으므로 다시 “6건 누락”으로 세지 않는다.

## 4. 새로 누락된 실행24건

| 제품 상대경로 | 실측 상태 |
|---|---|
| `artifacts/captures/phase3/home-admin-action/run-20260930-133241-f0Exq5/manifest.json` | PASS |
| `artifacts/captures/phase3/home-employees-error/run-20260930-132239-O42z1y/manifest.json` | FAIL |
| `artifacts/captures/phase3/home-employees-error/run-20260930-132432-Lmdlxo/manifest.json` | PASS |
| `artifacts/captures/phase3/home-employees-error/run-20260930-133245-QtANOD/manifest.json` | PASS |
| `artifacts/captures/phase3/home-empty-fixture/run-20260930-133227-V5C0HD/manifest.json` | PASS |
| `artifacts/captures/phase3/home-live-admin/run-20260930-133005-NJJheQ/manifest.json` | PASS |
| `artifacts/captures/phase3/home-live-admin/run-20260930-133220-4uGIvv/manifest.json` | PASS |
| `artifacts/captures/phase3/home-loading-error/run-20260930-133232-08F0te/manifest.json` | PASS |
| `artifacts/captures/phase3/home-operator-fixture/run-20260930-133224-85X8XQ/manifest.json` | PASS |
| `artifacts/captures/phase3/home-recovery-error/run-20260930-132658-7fdgWR/manifest.json` | PASS |
| `artifacts/captures/phase3/home-recovery-error/run-20260930-133258-q5Hl49/manifest.json` | PASS |
| `artifacts/captures/phase3/home-sites-error/run-20260930-132447-De79Fz/manifest.json` | FAIL |
| `artifacts/captures/phase3/home-sites-error/run-20260930-132527-W6PSC0/manifest.json` | PASS |
| `artifacts/captures/phase3/home-sites-error/run-20260930-133249-wyqmj4/manifest.json` | PASS |
| `artifacts/captures/phase3/home-stale-response/run-20260930-133236-BsgCNO/manifest.json` | PASS |
| `artifacts/captures/phase3/home-stale-retry-action/run-20260930-133307-sPMiIr/manifest.json` | PASS |
| `artifacts/captures/phase3/home-stale-watch-action/run-20260930-132938-99Tswu/manifest.json` | PASS |
| `artifacts/captures/phase3/home-stale-watch-action/run-20260930-133311-ZOqJDB/manifest.json` | PASS |
| `artifacts/captures/phase3/home-sync-error/run-20260930-132647-Y11aOt/manifest.json` | PASS |
| `artifacts/captures/phase3/home-sync-error/run-20260930-133253-420c9M/manifest.json` | PASS |
| `artifacts/captures/phase3/home-watch-error/run-20260930-132710-km4JWP/manifest.json` | PASS |
| `artifacts/captures/phase3/home-watch-error/run-20260930-133302-CwgZ1r/manifest.json` | PASS |
| `artifacts/captures/phase3/login/run-20260930-133316-Ufpve6/manifest.json` | PASS |
| `artifacts/captures/phase3/login/run-20260930-133320-FEVXJi/manifest.json` | PASS |

두 누락 FAIL의 실제 안전한 오류 요약: employees-error는 직원 실패 조건인데 정상 `1/2`가 관찰됨; sites-error는 실제 오류 안내가 보였으나 검증기의 기대 문구가 달라 실패. 원인→당시 수정→후속PASS는 Gemini가 실제 증거로 연결해야 한다.

## 5. 사본 byte count 정정

| 사본 | Gemini 보고 | Sol 파일 실측 | SHA 일치 |
|---|---|---|---|
| pre-edit-backup-31c-correct1/home.ts | 33,688 bytes | 30,562 bytes | 착수 SHA와 일치 |
| pre-edit-backup-31c-correct1/home.mjs | 21,348 bytes | 18,709 bytes | 착수 SHA와 일치 |

현재 제품 실측: home.ts37,972 bytes / `10A0A32F19BD8544EFA557502F531B09E01EE0002875FA84386BA71FE090E577`; home.mjs36,168 bytes / `FE79578666E2765A6DF897329E20C4E44BB80DF26C1C9D50F5E601721EA57145`. 제품 현재값은 보고와 일치한다. 숫자 오기를 그대로 재사용하지 않는다.

## 6. 자료와 다음 순서

`.ai/reports/verification-3-1c-correct1-20260930/`: received-archive.json, scope-evidence.json, browser-reproduction.json, check-evidence.py, run-home-review.mjs, probe-entry.ts, 캡처12개. 검증 산출물은 제어 프로젝트에만 생성, 제품 소스 수정0.

첫 수정 제출을 CORRECT로 반환하고 마지막 허용 수정인 **CORRECT2**를 한 패킷으로 발송한다. 같은 결함 유형의 두 번째 수정 제출도 실패하면 추가 CORRECT 왕복을 보내지 않고 Sol이 원인/전략을 재계획한다. 사용자 수동 전달·Gemini 제품 코드 전담 유지. 3-1c 및 3-1 전체 미완료. 하네스5.1 로컬 적용은 이 수정 회신 수용 뒤 진행하며 현재 설치3.0/프로젝트 운영4.0은 유지된다.
