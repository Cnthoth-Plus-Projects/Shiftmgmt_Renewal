# HANDOFF — Phase 3-1c 직접 수정 수용 · AI-Harness 5.1 적용 완료

- Action: ACCEPTED / CLOSED
- From: Sol(xhigh, Codex)
- To: 사용자 · 프로젝트 다음 세션
- 회신: 불필요
- Time: 2026-09-30 15:05:13 대한민국 표준시
- Routing: frontier — 제품 수정의 최종 통합·완료 판정과 하네스 적용
- Product repository: `C:\Projects\Active\ShiftMgmt_V4`, main
- Product HEAD: `2d97d9bb3dc649f8c40c0d1d0cfc9fdeae0df283` (커밋하지 않음)

## 1. 사용자 지시와 판정

사용자의 “너가 직접해 너무 오래걸린다”를 이번 Phase 3-1c의 두 파일 직접 수정 예외로 적용했다. 대기 중인 Gemini CORRECT2를 대체하여 Sol이 구현·검증을 마쳤다. 정상 제품 수정 주체는 이후에도 Gemini이며, Sol/Gemini/Luna/Terra의 운영 역할은 유지한다.

**Phase 3-1c ACCEPTED. 승인된 순서에 따라 제품 수용 → 설치본 전체 백업 → v5.1.0 고정 커밋 적용 → 프로젝트 연결 갱신까지 완료했다.** 전체 Phase 3-1은 3-1d/e가 남아 있다.

이전 HANDOFF는 교체 전에 원문 바이트로 보존했다:
- `Log/20260930_141701_3-1c-CORRECT2_Sol직접수정전_보존본.md`
- 42,080 bytes / SHA-256 `F0D5EC508B6E7C8234601F9C87AE36BC8FBF7D55AA9EA59052E3D51691BFA503`

## 2. 닫힌 수정 범위와 요구사항

| 요구사항 | 결과와 근거 |
|---|---|
| R31C-01 직원 조회 실패 | 준비 비율로 변환하지 않고 오류 표시. employees-error 최종 Chrome PASS |
| R31C-02 지사 조회 실패 | 정상 완료 비율로 변환하지 않고 오류 표시. sites-error 최종 Chrome PASS |
| R31C-03 홈 오류/로딩 | sync/recovery/watch 실패에서 H4 금지. refresh 호출 즉시 H5/skeleton 및 aria-busy, 기존 H4 제거. 성공 완료 뒤에만 H4 복원 |
| R31C-04 액션 수명 | owner/generation/ticket으로 늦은 응답 차단. 같은 요청의 finally에서 busy 해제하고 현재 DOM만 동기화. 실패 뒤 즉시 재시도, destroy 시 이전 DOM/세션 변화 없음. 28세부 조건 PASS |
| R31C-05 증거 누락/실측 오류 | 이전 누락24건과 이번30건 전량 목록, 1건의 시험 전제 오류와 복구 이력 공개. 백업 byte count 실측으로 정정 |

직접 제품 수정은 `src/web/screens/home.ts`, `scripts/ui-checks/home.mjs` 두 파일이다. 앞선 Gemini의 직원/지사 조회 오류 수정과 sync/recovery/watch H4 게이트는 유지한다. `home.ts`의 중복 액션 처리를 `handleHomeAction(kind)`로 묶고 2초 오류 잠금 타이머를 제거했다. 관리자 감시 재시작 권한을 유지한다.

UI 시험은 실제 로그인·세션·역할을 사용하고 HTTP 응답 경계에서 성공/일반 실패/AUTH/통신 실패를 주입한다. 같은 HomeScreen의 refresh는 다른 홈 액션의 성공으로 발생시킨다. 셸의 “홈” 메뉴는 기존 인스턴스를 destroy하고 새 화면을 만드는 경로임을 실제 소스로 확인하여 시험을 정정했다. 공통 실행기의 오류 수집기는 유지하며, 의도적으로 중단한 액션 URL의 net::ERR_FAILED만 별도로 센다.

| 파일 | 직접 수정 전 bytes / SHA-256 | 최종 bytes / SHA-256 |
|---|---|---|
| `scripts/ui-checks/home.mjs` | 36,168 / `FE79578666E2765A6DF897329E20C4E44BB80DF26C1C9D50F5E601721EA57145` | 46,324 / `2791E3FF6A67069213B48940728018C1329065B9487EFDE9E3064589950A74ED` |
| `src/web/screens/home.ts` | 37,972 / `10A0A32F19BD8544EFA557502F531B09E01EE0002875FA84386BA71FE090E577` | 34,757 / `4F7E3D0CE51D23E55451C3A2E136F87B678D45BDAF001E828A5B42917C485865` |

직접 수정 전 두 파일은 `.ai/reports/sol-direct-3-1c-20260930/*.before`에 보존했다. 해당 폴더의 `home.ts.diff`, `home.mjs.diff`는 이 기준과 최종 파일의 줄 단위 diff다.

제품 status는 92경로로 동일하고 상태행 LF 연결(마지막 LF 없음) SHA-256은 `8D4954EE16CAAFDFD5B908D58E42CAF962316D539AAA3DB742DD3B366982D08B`다. 허용 두 파일을 제외한 90경로 해시/부재가 CORRECT2 §12와 일치한다. API·DB·계산·권한·공통 오류 수집기·V3 원본에 직접 수정이 없다. 정본과 AGENTS/PROTOCOL/GEMINI/CLAUDE/07 지침도 원래 해시를 유지한다. 제어 문서의 변경은 수용 후 승인된 상태 갱신과 하네스 연결 갱신이다.

## 3. 실행 게이트

| 명령/검증 | 최종 결과 |
|---|---|
| `npm run typecheck` | exit 0 |
| `node --check scripts/ui-checks/home.mjs` | exit 0 |
| `npm run lint` | exit 0, 오류0 / 기존 경고5 |
| `npm run validate:map` | exit 0, CODEBASE_MAP_OK, 82경로 |
| `npm run build` | exit 0, WEB_ASSETS_OK |
| `npm test` | exit 0, 132파일/912시험, 277.24초 |
| `git diff --check` | exit 0, 정상 저장소 줄바꿈 설정 기준 |
| 실제 Chrome 154.0.8037.58 / 1440×900 | 최종26시나리오 PASS, 40캡처 실재, 예기치 않은 브라우저 오류0 |
| 복구/감시 액션 세부 수명 시험 | 각각14 / 합계28 PASS |

Sol이 명령 종료와 출력을 직접 확인했다. 전체912시험 이후 제품 home.ts 변경은 없고, UI 시험 전제 정정 이후 최종26시나리오를 전부 실행했다. 격리 실행기는 `.ai/reports/sol-direct-3-1c-20260930/run-ui.mjs`다. 각 명령·시작/종료·exit·manifest·임시 자료 정리 여부는 `ui-results-all-2026-09-30T05-42-08-742Z.json`에 있다. 수용 원장 `product-acceptance.json` 및 재검증 원장 `final-scope-evidence.json`을 함께 보존한다.

실제 운영 DB를 사용하지 않았다. 127.0.0.1:18739의 독립 Node 서버와 시스템 임시 폴더의 신규 데이터로 로그인했다. 부트스트랩 자격증명은 출력하지 않았고 임시 자료와 자격증명 파일은 실행 후 제거됐다. 최종26실행의 정리 여부가 모두 true다.

### 3.1 최종26시나리오와 manifest

| 시나리오 | manifest (V4 상대경로) | 결과 / 캡처 |
|---|---|---|
| home-empty-fixture | `artifacts/captures/phase3/home-empty-fixture/run-20260930-144210-UAcGqm/manifest.json` | PASS / 3 |
| home-stale-retry-action | `artifacts/captures/phase3/home-stale-retry-action/run-20260930-144214-CHLDXo/manifest.json` | PASS / 2 |
| home-stale-watch-action | `artifacts/captures/phase3/home-stale-watch-action/run-20260930-144230-67nwvh/manifest.json` | PASS / 2 |
| home-live-admin | `artifacts/captures/phase3/home-live-admin/run-20260930-144247-uGjXZi/manifest.json` | PASS / 1 |
| home-operator-fixture | `artifacts/captures/phase3/home-operator-fixture/run-20260930-144250-q8ZBmb/manifest.json` | PASS / 1 |
| home-loading-error | `artifacts/captures/phase3/home-loading-error/run-20260930-144254-0Oa23L/manifest.json` | PASS / 1 |
| home-stale-response | `artifacts/captures/phase3/home-stale-response/run-20260930-144257-Wuotvn/manifest.json` | PASS / 1 |
| home-admin-action | `artifacts/captures/phase3/home-admin-action/run-20260930-144301-ba7ErU/manifest.json` | PASS / 1 |
| home-employees-error | `artifacts/captures/phase3/home-employees-error/run-20260930-144305-8qEgcl/manifest.json` | PASS / 1 |
| home-sites-error | `artifacts/captures/phase3/home-sites-error/run-20260930-144308-GFLTpX/manifest.json` | PASS / 1 |
| home-sync-error | `artifacts/captures/phase3/home-sync-error/run-20260930-144312-4x5A1Z/manifest.json` | PASS / 1 |
| home-recovery-error | `artifacts/captures/phase3/home-recovery-error/run-20260930-144315-6ULmDT/manifest.json` | PASS / 1 |
| home-watch-error | `artifacts/captures/phase3/home-watch-error/run-20260930-144319-cfww5s/manifest.json` | PASS / 1 |
| login-flow | `artifacts/captures/phase3/login/run-20260930-144323-wyaSxE/manifest.json` | PASS / 4 |
| login-locked | `artifacts/captures/phase3/login/run-20260930-144327-ZSuu8M/manifest.json` | PASS / 1 |
| login-recovery | `artifacts/captures/phase3/login/run-20260930-144332-44Iczz/manifest.json` | PASS / 2 |
| login-session-error | `artifacts/captures/phase3/login/run-20260930-144336-SSHo7h/manifest.json` | PASS / 2 |
| login-post-change-null | `artifacts/captures/phase3/login/run-20260930-144340-3EVVo3/manifest.json` | PASS / 1 |
| login-post-change-error | `artifacts/captures/phase3/login/run-20260930-144343-bygLuG/manifest.json` | PASS / 1 |
| login-post-change-race-success | `artifacts/captures/phase3/login/run-20260930-144347-XM0eM8/manifest.json` | PASS / 1 |
| login-post-change-race-null | `artifacts/captures/phase3/login/run-20260930-144351-4v08Cb/manifest.json` | PASS / 1 |
| login-post-change-race-error | `artifacts/captures/phase3/login/run-20260930-144355-ASg4Vz/manifest.json` | PASS / 1 |
| login-post-change-race-login | `artifacts/captures/phase3/login/run-20260930-144359-4mqKoL/manifest.json` | PASS / 1 |
| login-post-change-first-held | `artifacts/captures/phase3/login/run-20260930-144403-NefXze/manifest.json` | PASS / 2 |
| shell-default | `artifacts/captures/phase3/shell/run-20260930-144407-LdPFhP/manifest.json` | PASS / 4 |
| ready-default | `artifacts/captures/phase3/ready/run-20260930-144412-OAkrS4/manifest.json` | PASS / 2 |

### 3.2 액션 세부 조건

| 조건 | 복구 | 감시 재시작 |
|---|---|---|
| live / success | PASS, 요청2 | PASS, 요청2 |
| live / failure | PASS, 요청2 | PASS, 요청2 |
| live / auth | PASS, 요청1 | PASS, 요청1 |
| live / network | PASS, 요청2 | PASS, 요청2 |
| refresh / success | PASS, 요청2 | PASS, 요청2 |
| refresh / failure | PASS, 요청2 | PASS, 요청2 |
| refresh / auth | PASS, 요청2 | PASS, 요청2 |
| refresh / network | PASS, 요청2 | PASS, 요청2 |
| leave / success | PASS, 요청1 | PASS, 요청1 |
| leave / failure | PASS, 요청1 | PASS, 요청1 |
| leave / auth | PASS, 요청1 | PASS, 요청1 |
| leave / network | PASS, 요청1 | PASS, 요청1 |
| failure-refresh / failure | PASS, 요청2 | PASS, 요청2 |
| failure-refresh / network | PASS, 요청2 | PASS, 요청2 |

세부 결과 파일:
- `artifacts/captures/phase3/home-stale-retry-action/run-20260930-144214-CHLDXo/action-assertions.json`
- `artifacts/captures/phase3/home-stale-watch-action/run-20260930-144230-67nwvh/action-assertions.json`

활성 화면의 중복 클릭은 추가 요청을 만들지 않고, 성공/실패/통신 중단 뒤 재시도 요청은 정확히 한 번 추가된다. 현재 AUTH는 세션 전환 한 번, refresh/destroy 뒤 오래된 AUTH는 새 화면 전환 없이 무시된다. 파괴된 DOM의 내용과 버튼 상태는 늦은 응답 뒤 바뀌지 않는다. 실패 후 refresh에서도 새 버튼이 영구 비활성화되지 않는다. 실패를 지연 타이머로 막던 원인이 제거됐으므로 2초 후 대기 없이 재시도할 수 있다.

## 4. 전체 시도와 정정 이력

직접 수정 후 manifest가 생성된 실행은 **30건: PASS29 / FAIL1**이다. 첫 empty-fixture PASS 이후 stale-retry-action 시험은 홈 메뉴를 같은 인스턴스의 refresh라고 가정해 실패했다. 실제 셸이 destroy/remount하는 경로임을 확인하고, 같은 인스턴스의 refresh를 반대 액션 성공으로 일으키도록 시험을 고쳤다. 이후 집중2건 PASS 및 최종26건 PASS를 확인했다. FAIL을 삭제하거나 최종26건에 섞어 성공으로 세지 않았다.

브라우저 manifest 생성 전 서버 준비 시도4회도 있었다: health만으로 자격증명 생성을 기대한 시도, Origin 없는 세션 요청의 HTTP403 두 시도, Origin을 넣은 세션 요청200이나 사용자 초기화가 안 된 시도. 격리 서버의 실제 sign-in으로 초기 사용자를 생성하는 준비 절차를 고친 뒤 실제 Chrome 로그인을 실행했다. `ui-setup-failure.json`은 마지막 준비 실패를 보존하며, 4개의 개별 manifest가 있었다고 주장하지 않는다.

| 이번 실행 manifest | 결과 |
|---|---|
| `artifacts/captures/phase3/home-empty-fixture/run-20260930-143702-crvhyo/manifest.json` | PASS |
| `artifacts/captures/phase3/home-stale-retry-action/run-20260930-143705-KUlhE9/manifest.json` | FAIL |
| `artifacts/captures/phase3/home-stale-retry-action/run-20260930-144020-VEjBrw/manifest.json` | PASS |
| `artifacts/captures/phase3/home-stale-watch-action/run-20260930-144037-cwB5Zj/manifest.json` | PASS |
| `artifacts/captures/phase3/home-empty-fixture/run-20260930-144210-UAcGqm/manifest.json` | PASS |
| `artifacts/captures/phase3/home-stale-retry-action/run-20260930-144214-CHLDXo/manifest.json` | PASS |
| `artifacts/captures/phase3/home-stale-watch-action/run-20260930-144230-67nwvh/manifest.json` | PASS |
| `artifacts/captures/phase3/home-live-admin/run-20260930-144247-uGjXZi/manifest.json` | PASS |
| `artifacts/captures/phase3/home-operator-fixture/run-20260930-144250-q8ZBmb/manifest.json` | PASS |
| `artifacts/captures/phase3/home-loading-error/run-20260930-144254-0Oa23L/manifest.json` | PASS |
| `artifacts/captures/phase3/home-stale-response/run-20260930-144257-Wuotvn/manifest.json` | PASS |
| `artifacts/captures/phase3/home-admin-action/run-20260930-144301-ba7ErU/manifest.json` | PASS |
| `artifacts/captures/phase3/home-employees-error/run-20260930-144305-8qEgcl/manifest.json` | PASS |
| `artifacts/captures/phase3/home-sites-error/run-20260930-144308-GFLTpX/manifest.json` | PASS |
| `artifacts/captures/phase3/home-sync-error/run-20260930-144312-4x5A1Z/manifest.json` | PASS |
| `artifacts/captures/phase3/home-recovery-error/run-20260930-144315-6ULmDT/manifest.json` | PASS |
| `artifacts/captures/phase3/home-watch-error/run-20260930-144319-cfww5s/manifest.json` | PASS |
| `artifacts/captures/phase3/login/run-20260930-144323-wyaSxE/manifest.json` | PASS |
| `artifacts/captures/phase3/login/run-20260930-144327-ZSuu8M/manifest.json` | PASS |
| `artifacts/captures/phase3/login/run-20260930-144332-44Iczz/manifest.json` | PASS |
| `artifacts/captures/phase3/login/run-20260930-144336-SSHo7h/manifest.json` | PASS |
| `artifacts/captures/phase3/login/run-20260930-144340-3EVVo3/manifest.json` | PASS |
| `artifacts/captures/phase3/login/run-20260930-144343-bygLuG/manifest.json` | PASS |
| `artifacts/captures/phase3/login/run-20260930-144347-XM0eM8/manifest.json` | PASS |
| `artifacts/captures/phase3/login/run-20260930-144351-4v08Cb/manifest.json` | PASS |
| `artifacts/captures/phase3/login/run-20260930-144355-ASg4Vz/manifest.json` | PASS |
| `artifacts/captures/phase3/login/run-20260930-144359-4mqKoL/manifest.json` | PASS |
| `artifacts/captures/phase3/login/run-20260930-144403-NefXze/manifest.json` | PASS |
| `artifacts/captures/phase3/shell/run-20260930-144407-LdPFhP/manifest.json` | PASS |
| `artifacts/captures/phase3/ready/run-20260930-144412-OAkrS4/manifest.json` | PASS |

### 4.1 CORRECT1 회신에서 빠졌던24건

이전 총52건 중 회신 누락24건(PASS22/FAIL2)은 아래와 같다. 직원 실패에서 1/2로 보인 FAIL은 앞선 Gemini 수정으로, 지사 오류 시험의 잘못된 기대 문구 FAIL은 시험 문구 수정으로 닫혔다. 최종 직접 검증에서도 두 오류 시나리오가 PASS다. 앞선 최초 제출의 누락 FAIL6건은 이미 `Log/20260930_131505_3-1c-Sol-CORRECT_검증본.md` 및 CORRECT1 수신본에 기록되어 있으며 그대로 보존한다.

| 이전 누락 manifest | 당시 결과 |
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

CORRECT1의 pre-edit-backup-31c-correct1 사본 byte count는 home.ts **30,562**(기존 보고33,688), home.mjs **18,709**(기존 보고21,348)로 정정한다. 당시 SHA는 기준과 일치했다. 이번 직접 수정 직전 사본은 위 §2처럼 별도 측정값37,972/36,168이며 같은 사본을 뜻하지 않는다.

검증 중 `core.autocrlf=false`를 강제한 whitespace 검사에서 기존 CRLF가 대량의 허위 trailing-whitespace로 표시됐다. 정상 저장소 설정으로 `git diff --check` exit0을 확인했다. 이 검사 과정에서 제품 파일을 바꾸지 않았다.

## 5. AI-Harness 5.1 적용

- 공개 원격: `https://github.com/hacker943410-debug/ai-harness.git`
- Release: `https://github.com/hacker943410-debug/ai-harness/releases/tag/v5.1.0`
- 설치 이전 HEAD: `a5638b3d4c87849fc87a7eedadec2f817ad6561e` (v3.0.0)
- 설치 최종 HEAD: `8ebab0087b228c0203a202bead8fb56853d9cb27` (peeled v5.1.0 일치, detached pin)
- 전체 설치본 백업: `.ai/reports/harness-v5.1-20260930/installed-v3-backup-20260930_145306`
- 숨김 .git 포함121파일을 경로/bytes/SHA-256으로 전건 비교해 일치 확인 후 fetch/checkout했다.
- plan.json: 22,047 bytes / SHA-256 `7875B50DD9785138FD389A1E44CD4B60146119CCD24457A5DF3A1E524706E51C`, 원본 유지
- 설치본 git status: `?? plan.json` 한 경로만 유지. core.hooksPath `.githooks` 유지.
- 정책26개 원문은 백업과 바이트 동일하다.
- `Test-HarnessRepo.ps1 -HarnessRoot <installed-root>`: exit0, PASS_WITH_WARNING. 기존 markitdown 0.0.1a4 prerelease 고정 경고1개가 남는다.
- 프로젝트 `.ai/harness.yaml`: runtime version5.1, skills_dir 및 JIT skill loading만 연결. schema_version2.0 / initialized_with3.0 / 모든 역할·핸드오프 설정 유지.
- `.ai/HARNESS.md`: 설치된 Global5.1과 프로젝트 운영 오버레이4.0을 구분하고 번들 Skill JIT 경로 및 Jev 미설정·비활성 경로를 기록했다.
- PROJECT_INIT 재실행이나 역할 지침 교체는 없었다. AGENTS/PROTOCOL/GEMINI/제품 불변 규칙의 해시는 그대로다.

설치 기본 스크립트는 untracked plan.json 때문에 그대로 실행할 수 없어, 전체 백업·tag/SHA 검증 후 해당 SHA를 checkout하는 방식으로 적용했다. plan.json 이동/삭제나 reset/clean은 하지 않았다. `apply-installed-harness.ps1`, `installed-v3-backup-manifest.json`, `installed-update-evidence.json`, `installed-v5.1-check.log`에 실행 절차와 결과가 남아 있다.

## 6. 종결 및 다음 작업

R31C-01~05를 닫고 3-1c를 ACCEPTED로 판정한다. R-16 하네스 공개/로컬 적용과 R-17 직접 수정 요구를 완료 처리한다. 이 종결본을 보존한 뒤 TODO/current-state에 승인된 완료 상태를 반영한다.

다음 계획은 TODO의 3-1d(전체 로그인/셸/홈 디자인 및 조작 최종 통합 검수), 이어 3-1e(전체3-1 수용 뒤 커밋·사용자 확인)다. 현재 두 항목은 대기이며 이번 작업에서 전체3-1 완료나 V4 커밋을 선언하지 않는다.

이 문서의 동일 바이트 종결 보존본: `Log/20260930_150513_3-1c-Sol직접수정-ACCEPT_종결본.md`. 보존본 SHA/bytes는 별도 `closeout-receipt.json`에 기록한다.
