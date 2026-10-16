# Phase3-2b — Sol 독립 검증 종결 / CORRECT 1

- From: Sol · frontier — 권한/비동기 수명/통합 수용 결정
- Date: 2026-09-30 21:42:22 KST
- Verdict: **CORRECT — 수용 보류, 첫 통합 수정 요청**
- Repository: `C:\Projects\Active\ShiftMgmt_V4` · main · `160940f9aaeb6696538447f83b44658073e382f0` · commit/push/제품 변경 by Sol = 0
- 수신원본: `C:\Projects\Active\교대근무관리 시스템\Log\20260930_205815_3-2b-Gemini_수신원본.md` · 39483bytes · SHA-256 `FAEC6383D877C4599CABC4C97A9D182BD3922E4929B6F9AA301245429C6AA72F`
- 전환 보존: `C:\Projects\Active\교대근무관리 시스템\Log\20260930_214222_3-2b-Gemini_CORRECT전환보존.md` — 수신원본과 byte-for-byte 일치
- 검증 증거: `C:\Projects\Active\교대근무관리 시스템\.ai\reports\phase3-2-review-20260930_205815`

## 1. 통과한 범위 / 실제 실행

수신본문은 발송본과 일치하고 변경은 정확히 신규5/기존4의9경로다. 기존 수신 manifest의329파일과 그 manifest에 포함되지 않았던9개 양식샘플을 추가 확인했다. 샘플9개는 HEAD blob과 byte-for-byte 같고 현재 전체338파일을 새 기준에 넣었다. 보호320파일/정본13파일은 기존 baseline과 일치한다. 제출9파일의 크기/해시도 회신과 일치하며 각 신규파일30,000bytes 이하, HEAD/status 불변이다.

Sol이 typecheck, runner syntax, lint(기존5경고), map87, 관련3파일11시험, diff check, build를 실행해 전부 RC0를 확인했다. `static-results.json`과 각각의 raw log가 근거다. **전체133파일919시험은 Gemini 자기보고이며 Sol은 이번 반려 검토에서 전체 시험을 재실행하지 않았다.** 기존 시험 결과를 독립 full 검증으로 표현하지 않는다.

설치 Chrome154.0.8037.58 / 1440×900 / fonts.ready로8개 독립 그룹을 실행했다.6 FAIL/2 PASS, 예상외 console/pageerror/requestfailed/HTTP 오류0. API fixture는 UI 수명/렌더링 재현에만 사용했다. operator/planner/reviewer는 격리 서버의 실제 계정/cookie로 검증했고 menu0/자동list·users0/직접API AUTH_FORBIDDEN/data없음 전부 PASS다. 날짜 조건 잠금도 actual focus/DOM disabled=false/aria-disabled=true/2px outline/Space·Enter·click requests0 PASS다.

## 2. stable 결함 — 한 번에 묶은 수정 범위

| ID | 심각도 / 독립 근거 | 실패한 요구사항 |
|---|---|---|
| R32C-01 | High. `access-history.ts:232–239,274–279,374` 검색 입력 즉시 세대 무효화가 없어250ms 사이에 old success가4ms 후 표시되고 old AUTH_SESSION_REQUIRED가 유효한 현재 화면을 로그인으로 이동시킨다. keyword→즉시refresh는 같은query를192ms 간격으로2회 호출했다. | R32-02/03/06 |
| R32C-02 | Medium. `access-history.ts:358–369` 날짜 오류 분기가 renderBody를 호출하지 않는다. held 조회 중 start09-30/end09-01로 바꾸면 오류와 로딩이 함께 남고 old release 후에도 loading1이다. | R32-03/05/06 |
| R32C-03 | Medium. `access-history.ts:577–582` users 재시도에 pending guard/native disabled가 없다. held 재시도 두 번에 users2/logs2, retry.disabled=false다. | R32-03/05 |
| R32C-04 | Medium. `model.ts:157–162` approve 정규식이 danger보다 먼저 실행돼 performance-hide-approved(승인완료 목록삭제)가 green으로 표시된다. schedule-publish도 green이지만 승인 G1 HTML:573은 info blue다. 새 model test:207도 잘못된 publish 기대값이다. | R32-07 / 원 발송 §6.1 |
| R32C-05 | Medium. 실제 정상행59px/긴행541.5px, 날짜input130×34, 사용자열161.5625px, 표 자체 accessible name 없음. 기준40/132×34/140/이름과 다르다. 상세 원문1216자/title1216자는 보존돼 있으므로 보존 동작은 유지한다. | R32-04/07 |
| R32C-06 | High(검증 신뢰성). `node scripts/ui-checks/access-history.mjs --case=sol-unknown-case` 실제 RC0/PASS. CASE/URL 검문 없음, arbitrary http URL 사용, start/launch가 finally 밖, cleanup 전에 PASS, console에401/403이 있으면 포괄 제외, requestfailed/HTTP/font 계측 누락. role는operator만, stale는success만, filters는click만, session은같은page signOut. 요구한 완전한 행동검사/action-assertions가 없어10case RC0만으로 수용할 수 없다. | R32-08/09 |

원본 그룹 결과·요청시각·실제값: `probe-results.json`. 디자인, invalid-date loading, stale-auth redirect, retry duplicate 각각 PNG가 있다. runner false PASS는 `supplied-unknown-case.log/.json`에 보존했다. 검사기가 실행하지 않은 동작을 회신에서 PASS로 서술한 부분은 수정해야 한다. session capture 회신의 `session-expired-login.png`와 실제코드의 `session-expired-redirect.png`도 다르다.

## 3. 검수 도구 자체의 첫 실행 오류 / 수정

첫 Sol probe는 기본 start09-01에서 end09-01만 설정해 equal valid 조건을 잘못 invalid로 간주했다. invalid-date/keyboard 두 결과는 제품 판정 근거에서 제외한다. 실제 start09-30/end09-01을 설정하고 새 격리서버에서 재실행해 위 최종 결과를 얻었다. 첫 role setup은 planner/reviewer bootstrap이 없어 PROBE_ERROR였으며, 재실행은 기존 admin saveOperationUser API로 두 실제계정을 만들어 확인했다. 제품/API/DB 소스 변경과 직접SQL은0이다. 첫 probe source/results/server info/cleanup은 `.first-pass`로 보존했다.

## 4. 종결 / 다음 경계

3-2b 원 IMPLEMENT 검증 대상은 이 CORRECT 판정으로 닫는다. 이후 Sol이 승인된 TODO의 사실 상태와 current-state만 갱신한 뒤, 받은338파일 바이트를 새 기준으로 **5파일만** 고치는 CORRECT 지시서를 발송한다. 기존9경로 dirty/main/HEAD를 유지하고 나머지333파일을 보호한다. 3-2 완료/커밋/사용자 확인은 보류다. 3-1e 사용자 직접 화면 확인도 증거가 없어 여전히 대기다. 같은 결함군 재제출 최대2회 뒤 재설계한다.

독립 probe Chrome/context는 finally 종료, MCP browser 닫음, 이번 소유 서버2회 exit 및 temp 정리 확인. 과거 보존 temp는 건드리지 않았다. 자기보고 runner의 각 역사 temp 전체 정리를 독립 검증했다고 주장하지 않는다.
