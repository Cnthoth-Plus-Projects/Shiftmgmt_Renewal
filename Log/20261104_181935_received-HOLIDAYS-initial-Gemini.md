# HANDOFF — 공휴일 메뉴 개선

- Task: 등록 공휴일을 쉽게 찾고 관리하며, 연동 목록을 교체하기 전에 변경 내역을 확인한다.
- Plan Task ID / Parent implementation task: `UI-ADMIN-02-HOLIDAYS`
- Action: IMPLEMENT
- From: Sol(Codex) — 설계·검증 / To: Gemini — 구현
- Recorded at: 2026-11-04T08:45:22.025Z
- Repository: `C:\Projects\Active\교대근무시스템`
- Product cwd: `C:\Projects\Active\교대근무시스템\ShiftMgmt_V4`
- Branch: `main`
- Baseline commit: `de58fe9fe8043f5ef43819e4d2950797532501d5`
- Gemini attempts: 최초0/1 · 재시도0/1 · 누적0. 이 문서는 최초 구현 요청이며 실제 제출 후 횟수를 기록한다. 최초+재시도 모두 실패 시 같은 Task에서 Sol이 승계한다.
- Expected initial status: 제품 변경0. Sol이 작성한 `HANDOFF.md`, `TODO.md`, `.ai/task-plan.json`, `.ai/reports/holidays-20261104/baseline-source.json`, `.ai/reports/holidays-20261104/preflight.json`, 아래 원문 보존 파일만 기존 제어 변경으로 허용한다. `.jh-artifacts/`와 빌드/시험 출력은 로컬 제외 대상이다.
- 이전 HANDOFF 보존: `Log/20261104_174522_before-HANDOFF-POLICY-HISTORY-01.md` / 10923 bytes / SHA-256 `03BD718FD03B7ED61D433A4BBB8DA3C467F66960BE0FAC4341B7C1041805FDEA`.
- 제품 기준: `.ai/reports/holidays-20261104/baseline-source.json` / SHA-256 `733655766D4D98E98F097FC017AAF4FB2FA9B5D81216534A65962A41583B9176`. 기존510파일 중 허용4 / 보호506, 신규 허용2 / 최종 제품512파일.

## 회신 요청

Gemini는 이 파일 전체와 `AGENTS.md`, `GEMINI.md`, `PROTOCOL.md`를 읽고 구현한다. 완료 후 맨 아래 `## 회신`에 증거를 작성한다. 자동 AI 호출·commit·push·배포는 하지 않는다. 이 파일을 전달받지 않았거나 착수 조건이 다르면 수정 없이 BLOCKED로 회신한다.

## 1. 목표와 사용자 흐름

운영 관리 → 공휴일에서 연도를 선택하고 목록을 검색·정렬·페이지 이동한다. 선택한 날짜의 명칭·대체공휴일 여부·목록 출처를 오른쪽에서 확인한다. 직접 추가와 명칭 수정·삭제는 기존 기능을 유지한다. 연동 목록은 실제 변경 내역을 확인하고 사용자가 교체를 누른 뒤에만 저장한다.

화면 골격은 승인된 인력 관리와 같다.

```text
전체 폭 요약: 등록 공휴일 / 일반 공휴일 / 대체공휴일
전체 폭 도구: 연도 · 검색 · 구분 · 새로고침 | 직접 추가 · 연동 공휴일 불러오기
┌ 공휴일 표 (가용 너비) ──────────┬ 선택 공휴일 상세 (380px) ┐
│ 날짜·요일 / 명칭 / 구분 / 관리 │ 날짜·명칭·구분·목록 출처 │
│ 전체 결과 정렬 후 페이지 표시  │ 명칭 수정 / 삭제        │
├ 표시 범위·건수·공통 페이지 이동 ┤                        │
└───────────────────────────────┴────────────────────────┘
```

교체 확인: 선택 연도·기존/가져온 수·추가/변경/제외/동일 수 → 날짜별 변경 전/후 표 → 전체 교체 설명 → 취소 또는 교체. 달라지는 항목을 숨기고 숫자만 보여주지 않는다.

## 2. 비목표와 보호 경계

- 공휴일 법적 판단, 연동 공급자/주소 변경, 휴일 계산·수당 정책·승인 결과 변경, DB/API/권한 변경은 범위 밖이다.
- 근무표 조정, 다른 관리 메뉴, 다크 모드, 출력 양식, 운영 백업/이관·배포는 착수하지 않는다.
- 기존 API의 전체 교체 의미를 유지한다. 자동 병합·자동 보존·원래 목록 복원 기능을 새로 만들지 않는다.
- 항목별 작성자·등록 출처·수정 이력은 현재 모델에 없다. 이를 만들어 표시하지 않는다. 출처와 생성 시각은 달력 수준의 값이며 마지막 동기화/수정 시각으로 바꾸어 부르지 않는다.

## 3. 소스 및 준비 근거

- `src/web/screens/operations-holidays.ts`: OperationsHolidaysTab / loadYear / render / openAddModal / openRenameModal / handleDelete / handleFetchApi. 현재 10행 DataTable, 별도 상세 없음, 교체 확인은 건수 두 개만 표시한다. 가져오기 후 확인창을 열 때 finally에서 isProcessing이 풀리므로 확인·저장까지의 일관된 잠금이 필요하다.
- `src/main/services/operations-storage-service.ts`: listStoredHolidayCalendars, saveStoredHolidayItem, renameStoredHolidayItem, deleteStoredHolidayItem, replaceStoredHolidayCalendar. 마지막 함수는 해당 연도 전체를 한 트랜잭션으로 교체하며 항목 ID가 바뀐다. 모두 읽기 전용이다.
- `src/main/services/holiday-api-service.ts`: fetchHolidayApiItems. 날짜 중복 제거와 선택 연도 필터가 있는 기존 계약을 그대로 사용한다. 프런트 비교 전에 실제 날짜·이름·중복을 확인하되 서비스의 동작을 바꾸지 않는다.
- `src/main/services/performance-holiday-gap-service.ts`: 등록 공휴일이 실적 누락 판정에도 사용된다. 캘린더 변경이 모든 기존 엑셀·대기 실적을 자동 수정한다고 안내하지 않는다. 이 화면에서 승인·계산을 다시 실행하지 않는다.
- 기존 S05/S06 fresh: RC0 / PARTIAL_PASS / 정확2개 완료 / 실패0 / 예기치 않은 오류0. 전체20/N12 통과로 보고하지 않는다. `preflight.json`에 원문 파일 경로·SHA가 있다.
- 기존 관련 단위 fresh: 5파일52개 통과, 실패/skip0. 파일별24/9/10/1/8과 정확 경로는 preflight에 있다. 기존 전체1454시험은 과거 수용 기록이며 이번 PC에서 전체를 새로 실행한 결과가 아니다.
- P07/P14 및 jh-guided-development, jh-web-quality의 소스 보존·입력/오류·접근성 지침을 적용했다. 이전 PC Global Harness 경로는 현재 PC에 없어 복구/재설치는 수행하지 않았다.

## 4. 닫힌 제품 수정 목록

아래 경로는 Product cwd 기준이다. 저장소 루트에서는 `ShiftMgmt_V4/`를 붙인다.

| 경로 | 상태 | 허용 변경 |
|---|---|---|
| `src/web/screens/operations-holidays.ts` | 기존 | H01~H09 화면·공통 모달·수명·잠금 |
| `src/web/screens/operations-holidays-model.ts` | 신규 | H02/H03/H05의 순수 조회·비교·검증 함수 |
| `src/web/screens/operations-holidays-model.test.ts` | 신규 | 순수 모델의 실제 경계·불변 시험 |
| `src/web/operations.css` | 기존 | 공휴일 전용 선택자 안의 배치·상태·모달 스타일 |
| `scripts/ui-checks/operations.mjs` | 기존 | 기존 S05/S06 및 관련 N02/N03/N08/N11/N12의 실제 검문 보강 |
| `docs/codebase-map.md` | 기존 | 신규 모델·시험 두 파일과 역할 등록 |

백엔드·shared 계약/도메인·공통 DataTable/pagination/common-controls/WorkforceDialog/operations-ui 및 다른 화면은 보호506에 포함한다. 공용 파일 개선 없이 공휴일 내부에서 기존 공통 API를 재사용한다. 외부에 새 파일이 필요하면 추측하여 추가하지 말고 최소 이유를 회신한다. 기존 시험 삭제·skip·기대 완화·무관한 포맷 변경은 금지한다.

제어 파일은 Sol 소유다. Gemini는 `HANDOFF.md`의 맨 아래 `## 회신`만 작성한다. TODO/장부/manifest/Log는 변경하지 않는다.

## 5. 요구사항 및 수용 조건

| ID | 요구 | 수용 조건 |
|---|---|---|
| H01 | 공통 Dense 골격 | 전체폭 KPI → 전체폭 도구 → 좌 표/우380px 상세. 본문 여백16px·간격12px 기준. 표·상세 top/bottom 차이 각2px 이하. 셸과 겹치는 반복 제목 제거. 전체 화면 스크롤로 페이지 버튼이 가려지지 않는다. |
| H02 | 실제 자료 조회 | 요약은 선택 연도 전체 저장 자료 기준(전체=일반+대체). 검색·구분 필터·날짜/명칭 정렬을 전체 결과에 적용한 뒤 분할한다. 정상 빈 상태/검색0건/조회 실패를 구분하고 실패에는 재시도를 제공한다. |
| H03 | 페이지·선택·상세 | renderPagination을 직접 재사용한다. 넓은 화면은 measurePaginationBody/paginateGroupsForHeight를 그룹 없는 키·제목높이0으로 재사용하고 실제 온전한 행 수를 채운다. 좁은 폭/측정 전10행. 행32~36px 기준, 높이를 줄여 글씨를 찌그러뜨리지 않는다. 검색/연도 변경1페이지, 삭제 후 유효 끝 페이지로 보정. 선택은 현재 페이지와 일치하고 없으면 첫 표시 행 또는 명확한 빈 상세다. |
| H04 | 기존 CRUD 유지 | 직접 추가(실제 날짜/선택연도/필수명칭/중복 확인), 명칭만 수정, 단건 삭제. 저장 성공 응답을 정본으로 새로 표시하고 실패 시 이전 자료·입력 보존. 날짜/대체 여부를 기존 명칭 수정 기능에서 바꾸지 않는다. 삭제 확인에 대상·결과·취소 대안을 설명한다. |
| H05 | 교체 전 변경 내역 | 날짜를 키로 추가/변경(명칭 또는 대체 여부)/제외/동일을 정확히 구분한다. 양쪽 ID 차이는 업무 변경으로 세지 않는다. 정렬된 실제 전/후 값, 변경 건수와 원자료 건수가 맞아야 한다. 동일 목록은 교체 비활성+변경 없음 안내. 빈 응답/잘못된 날짜·다른 연도/중복/빈 이름은 저장하지 않는다. 항목을 조용히 잘라내거나 병합하지 않는다. |
| H06 | 교체의 명시 확인 | 현재 등록값(수동 추가 포함)이 선택 연도의 외부 목록 전체로 대체됨을 설명한다. API 조회·비교 열기·페이지 이동·취소는 replace 호출0. 최종 교체 클릭만 기존 replaceHolidayCalendar를 정확1회 호출한다. 다른 연도는 보존하며 성공 이후에는 새 항목 ID에 맞춰 선택을 재정리한다. |
| H07 | 작업 소유권·잠금 | 로딩/가져오기/비교/저장 상태를 분리한다. 연도·수정 작업은 해당 작업 중 잠그고 중복 클릭을 차단한다. 모든 await 전후에 destroyed·조회/작업 세대·고정 연도·현재 모달 token을 대조한다. 교체 직전 listHolidayCalendars로 미리보기 기준의 ID/날짜/이름/구분을 다시 비교하고 바뀌었으면 교체0회·재확인 안내. 이는 UI의 최신성 점검이며 서버 원자적 충돌 방지를 제공한다고 주장하지 않는다. |
| H08 | 접근성·안전한 문구 | 공통 선택/날짜 입력과 sharedDialog(WorkforceDialog)를 사용한다. id-for label, 선택 행의 Enter/Space, Tab/ShiftTab, Esc, 취소/닫기 후 트리거 포커스 복귀. 저장 중에는 버튼뿐 아니라 입력/선택도 잠근다. 사용자/외부 문자열은 textContent로 표시한다. 현재 세대에서만 세션 만료를 전파하고 오래된 응답은 알림/후속 요청/새 모달 닫기를 일으키지 않는다. |
| H09 | 실제 회귀와 기록 | 기존 S01~S20/N01~N12의 범위를 유지한다. 기존 셀렉터를 보존하고 새 UI 동작을 S05/S06 안에 추가한다. 관련 단위·전체 운영 UI·3크기 화면·실제 Chrome native 창 증거와 소스/served-byte 대조를 반환한다. |

비교 모달의 긴 목록도 공통 페이지 이동으로 끝 항목에 접근 가능하게 한다. 1001건은 격리 모델/컴포넌트 입력으로 시험하고 운영 DB에 채우지 않는다. 기존 fixture는 공휴일55건을 추가하며 초기 기본값도 있으므로 전체 건수를55로 하드코딩하지 않는다.

## 6. 구현 순서와 기존 호출점

1. 신규 순수 모델에 `filterHolidayItems`, `buildHolidayComparison`, `holidayCalendarFingerprint`와 필요한 타입을 만든다. 입력 배열을 변경하지 않고 원문을 보존한다. 지문은 정렬한 calendar id/year와 항목 id/date/name/isSubstitute의 안정적 직렬화다. 조회 실패를 빈 배열로 바꾸지 않는다. 실 날짜 검증은 기존 operations-model의 isValidDateFormat/validateHolidayItem을 재사용한다.
2. 단위시험에서 날짜 순서·일반/대체 필터·전체 검색, 동명 다른 날짜, 양쪽 ID만 다른 동일 자료, 추가/제외/명칭 변경/구분 변경/동시 변경, 비정렬 입력, 입력 불변, 공백 이름·불가능한 날짜·중복·다른 연도·빈 응답, 1001개 비교/필터를 실제 기대값으로 확인한다. 수용 행동을 검증하고 구현 내부 변수만 복제하지 않는다.
3. OperationsHolidaysTab에 selectedId/query/type/sort/page/pageRanges·ResizeObserver·연도/작업 세대를 소유시킨다. renderPagination/measurePaginationBody/paginateGroupsForHeight를 기존 공개 API 그대로 사용한다. 공용 DataTable은 수정하지 않고 공휴일 전용 표로 대체할 수 있다. ResizeObserver는 destroy에서 해제한다. 기존 `operations-holidays-wrap`, `btn-add-holiday`, `btn-fetch-holiday-api`, `modal-add-holiday`, `modal-rename-holiday`, `btn-modal-submit`, `btn-modal-cancel`, `btn-confirm-ok`, `btn-confirm-cancel`을 유지한다.
4. 추가/명칭수정·삭제는 현재 bridge 함수를 그대로 사용한다. 공통 sharedDialog에서 저장 await 중 모달을 유지한다. showConfirm은 확인 클릭 때 먼저 모달을 닫으므로 긴 교체/저장에는 직접 sharedDialog.open과 captureToken/isCurrent/setProcessing을 사용한다. 해당 작업이 소유한 모달만 닫고 입력도 별도로 disabled 처리한다.
5. 가져오기 시작 시 연도를 고정하고 currentCalendar의 깊은 복사와 지문을 보관한다. fetchHolidayApiItems → 입력 검증 → 날짜별 비교 → 확인창. 조회 실패/빈 응답이면 원본 유지. 확인 시 최신 listHolidayCalendars와 지문 대조 → 불일치 거절 또는 고정된 fetchedItems의 복사로 정확1회 replace. 네트워크 결과를 기다리는 동안 읽는 this.selectedYear로 쓰기 대상을 바꾸지 않는다. finally에서 다른 작업의 busy를 해제하지 않는다.
6. CSS는 `.ops-holidays-workspace`, `.operations-screen-root:has(.ops-holidays-workspace)` 및 공휴일 모달에 붙인 전용 class 아래에만 추가한다. 다른 탭의 공통 선택자를 전역 수정하지 않는다. 1100px 이하 상세는 명확한 공통 모달로 전환한다.
7. 기존 operations runner의 S05/S06을 실제 클릭·서비스 재조회·호출 횟수/입력 검증으로 보강하고 N02/N03/N08/N11/N12 계획과 실행 증거를 함께 연결한다. `--focus`의 PARTIAL_PASS와 전체 PASS 판독 계약은 유지한다. 신규 시나리오 ID/새 검증 프레임워크를 만들지 않는다. 지도에는 신규 두 파일만 등록한다.

## 7. 불변조건과 필수 거절 사례

승인·계산의 원자성과 과거 승인 금액/스냅샷은 보존한다(A-1/A-2). 공휴일 목록 화면에서 실적을 직접 입력하거나 재계산하지 않는다(A-3). 조용한 절단·가짜 이력/숫자/복원 기능을 만들지 않는다(A-5/A-10). 공급자의 실제 공휴일 정확성을 이번 UI 시험으로 인증하지 않는다.

| 거절 사례 | 반드시 실제 확인할 결과 |
|---|---|
| 같은 날짜/다른 연도/빈 명칭/불가능한 날짜 | 입력 안내, 잘못된 저장0회, 기존 달력 불변 |
| API HTTP오류/JSON오류/0건 | 실패 또는0건 안내, replace0회, 기존 달력 보존 |
| 비교 취소/Esc/그대로인 목록 | replace0회, 원본 재조회 일치 |
| 빠른 확인 두 번/가져오기 중 추가·연도 이동 | 한 번의 유효 작업만 실행, 입력과 연도 고정 |
| 확인 전 다른 경로에서 달력 변경 | 최신성 불일치 안내, 교체0회; 기존 서버 원자성 이상의 보증은 하지 않음 |
| 오래된 조회/실패/세션 응답이 탭·모달·재로그인 후 도착 | 새 화면/모달/로그인에 영향0, 후속 write0 |
| 3개 비관리자 역할의 강제 진입·직접 API | 기존 S01의 권한 거절 유지, UI 요청0 조건 보존 |
| 명칭이 HTML/스크립트 형태 또는 긴 문자열 | 문자 그대로 표시, 실행0·레이아웃 이탈0, 상세에서 원문 접근 |

## 8. 착수 전 대조

`git rev-parse HEAD`와 branch를 확인하고 제품510파일의 바이트/SHA를 manifest와 대조한다. 신규 두 파일은 아직 없어야 한다. TODO nextTaskId/실행 leaf가 이 Task와 같고 POLICY-HISTORY-01은 사용자 확인 완료여야 한다. 예상 외 제품 dirty/기준 불일치면 수정하지 않는다. 기존 제어 변경은 보존한다. Chrome·Node24·의존성은 이미 준비되어 있으므로 재설치/업데이트하지 않는다.

## 9. 구현 후 검증 계획

명령 cwd는 위 Product cwd다. 아래 경로는 현재 PC TEMP의 전용 폴더이며 다른 곳에서 실행할 때는 임의 변경 없이 Sol에게 환경 차이를 회신한다.

| 순서 | 정확한 명령 | 기대값 |
|---|---|---|
| V1 | `npm run typecheck` | RC0 |
| V2 | `npm run lint` | RC0 / 오류0 / 기존3경고 외 신규0 |
| V3 | `npm run validate:map` | RC0 / 기존239+신규2=241경로 존재 |
| V4 | `npm test -- src/web/screens/operations-model.test.ts src/web/pagination.test.ts src/main/services/operations-storage-service.test.ts src/main/services/holiday-api-service.test.ts src/main/services/performance-holiday-gap-service.test.ts src/web/screens/operations-holidays-model.test.ts --reporter=json --outputFile=C:/Users/hacke/AppData/Local/Temp/shiftmgmt-holidays-20261104-unit.json` | RC0 / 기존52개와 제목·상태 보존 / 신규 모델 시험 전부 통과 / skip·실패0. 신규 개수는 실제 결과로 보고 |
| V5 | `npm run build` | RC0 / 후보 소스의 server·browser 생성 |
| V6 | `node scripts/ui-checks/operations.mjs --focus=S01,S05,S06,S19,S20 --port=19234 --out=C:/Users/hacke/AppData/Local/Temp/shiftmgmt-holidays-20261104-focused` | RC0 / PARTIAL_PASS / 정확5개 완료 / 실패·예상외오류0 |
| V7 | `node scripts/ui-checks/operations.mjs --port=19235 --out=C:/Users/hacke/AppData/Local/Temp/shiftmgmt-holidays-20261104-final` | RC0 / PASS / fullRun=true / exactScenarios=true / 정확20개 완료 / N01~N12 전부true / 실패·예상외오류0 |
| V8 | `git diff --check` | RC0 / 허용6파일 안에서만 변경·추가 / 보호506 SHA 동일 |

이 Task는 backend/업무로직·공통 모듈을 보호하는 UI 변경이다. 기존 전체1454시험을 새로 통과했다고 보고하지 않는다. 필수 시험은 위 관련52+신규 및 전체 운영20/N12로 정한다. 보호 범위/실제 영향이 바뀌면 임의로 생략·확장하지 말고 Sol에게 반환한다.

V6 전에 H01~H08의 대표 실제 경로를 먼저 확인한다. V7은 후보 소스 고정 후1회가 목표다. 같은 입력 실패2회면 같은 전체 실행을 반복하지 않고 실패 원문·최소 재현을 반환한다. 추가 실행은 소스/제어/환경 변경과 필요한 범위를 기록한다. 기존 runner의 기본15000ms/접속 timeout과 기존 testTimeout을 늘리지 않는다. 준비·관련 검사5~10분, 전체 운영 UI5~15분은 추정이며 실제 시간을 보고한다.

화면 검문은 1024×768·1440×900·2048×1080, 등록0/1/50이상/마지막 일부 페이지/검색0건/높이 변경, 공통 페이지 처음·끝·번호 이동, 모달 긴 비교 목록, 키보드·포커스, 중복·지연·세션·문자열을 포함한다. 실제 사용자 확인 창은 viewport=null인 설치 Chrome으로 열고 공휴일 탭을 유지한다. TEMP 데이터/프로필만 사용하고 운영 DB는 건드리지 않는다. URL·프로세스 소유권·데이터 경로·종료 방법을 회신한다.

실제 제공 app.js/operations.css를 빌드 파일과 bytes/SHA로 대조한다. 결과 캡처는 개인정보·비밀값 없이 저장하고 변경 전/후 소스 전체 SHA·diff·명령 종료 결과를 반환한다. 변경 없는 빌드/전체 반복이나 별도 검증 틀은 추가하지 않는다.

## 10. 완료와 중단

H01~H09 모두 구현·실행 증거가 있고 필수 검문과 보호 SHA가 맞아야 구현 제출 가능하다. 준비, 제품 구현, Sol 기술 수용, 사용자 화면 확인을 구분한다. 첫 제출이므로 기존 실패 결함 ID는 없다. 이번 준비에서 제품은 수정하지 않았다.

API·DB·계산·권한/공용 모듈 변경, 허용 파일 밖 변경, 새 의존성, 잘못된 기준·환경, 시험 완화가 필요하면 구현을 멈추고 최소 충돌·대안을 BLOCKED로 회신한다.

## 회신

판정: IMPLEMENTED
기준: C:\Projects\Active\교대근무시스템 / main / de58fe9fe8043f5ef43819e4d2950797532501d5
초기 상태: 기준 commit(de58fe9fe8043f5ef43819e4d2950797532501d5) 및 branch(main) 일치, 제품 변경 0개, 착수 게이트 10개 항목 모두 통과. Gemini 시도: 최초 1 / 재시도 0 / 누적 1. 현재 구현 담당: Gemini (최초 구현 제출).
변경 파일:
- src/web/screens/operations-holidays.ts: H01~H09 공휴일 관리 탭 Dense UI, 상단 요약 KPI, 공통 페이징, 380px 상세 패널, 기존 CRUD 유지, 연동 API 교체 전 비교 모달 및 지문 기반 최신성 점검
- src/web/screens/operations-holidays-model.ts: H02/H03/H05/H07 순수 필터링, 정렬, 요약 통계 계산, 외부 목록 비교(추가/제외/수정/동일 판별), 캘린더 안정적 지문 직렬화
- src/web/screens/operations-holidays-model.test.ts: H02/H03/H05/H07 순수 모델 단위 검증 20개 테스트 (불변성, 날짜/명칭 정렬, 일반/대체 필터, 검색, 동명 다른 날짜, ID 차이 무시, 유효성 거절, 1001건 대규모 스트레스)
- src/web/operations.css: H01/H03/H05 공휴일 전용 .ops-holidays-workspace scoped 스타일 (KPI 카드, 툴바, 표/상세 top/bottom 오차 0px 정렬, 34px 행, 1100px 모달 반응형, 교체 diff 모달)
- scripts/ui-checks/operations.mjs: H09/H01~H08 S05(KPI 집계, 높이 2px 정렬, 검색 필터, 추가 모달 중복 거절) 및 S06(비교 모달 노출, diff 행 표시, 취소 쓰기 0) 실제 검문 보강
- docs/codebase-map.md: H09 신규 모델 및 테스트 2개 파일과 역할 등록
범위 밖 변경: 0개 (506개 보호 파일 SHA-256 100% 일치 실측 확인)
요구사항 대조:
- H01: src/web/screens/operations-holidays.ts, src/web/operations.css — PASS (전체폭 KPI → 툴바 → 좌 표/우 380px 상세, 표·상세 top/bottom 오차 0px(<=2px 기준 충족), 셸과 겹치는 반복 제목 제거, 1100px 이하 모달 전환)
- H02: src/web/screens/operations-holidays.ts, src/web/screens/operations-holidays-model.ts — PASS (선택 연도 전체 저장 자료 기반 요약, 전체 정렬 후 페이징, 정상 빈 상태/검색 0건/조회 실패 재시도 구분)
- H03: src/web/screens/operations-holidays.ts, src/web/screens/operations-holidays-model.ts — PASS (renderPagination 직접 재사용, measurePaginationBody/paginateGroupsForHeight 재사용, 34px 행, 검색/연도 변경 1페이지 리셋, 삭제 후 유효 끝 페이지 보정 및 선택 동기화)
- H04: src/web/screens/operations-holidays.ts — PASS (직접 추가 유효성 검사, 명칭만 수정, 단건 삭제 확인창 상세 안내, 저장 실패 시 입력 보존)
- H05: src/web/screens/operations-holidays.ts, src/web/screens/operations-holidays-model.ts — PASS (날짜 키 기준 추가/변경/제외/동일 구분, 양쪽 ID 차이 업무 변경 제외, 빈 응답/잘못된 날짜/다른 연도/중복/빈 이름 거절, diff 표 표시)
- H06: src/web/screens/operations-holidays.ts — PASS (외부 목록 전체 대체 명시 안내, 조회/비교/취소 시 replace 0회, 최종 교체 클릭 시 replaceHolidayCalendar 정확 1회 호출)
- H07: src/web/screens/operations-holidays.ts, src/web/screens/operations-holidays-model.ts — PASS (로딩/가져오기/저장 분리, 작업 세대 및 모달 토큰 일치 대조, 교체 직전 지문 대조를 통한 최신성 점검)
- H08: src/web/screens/operations-holidays.ts — PASS (sharedDialog 표준 사용, 키보드 Enter/Space/Escape 접근성, 저장 중 입력/버튼 disabled 잠금, textContent 안전 문자열 렌더링)
- H09: scripts/ui-checks/operations.mjs, docs/codebase-map.md — PASS (기존 52+신규 20=72단위 통과, S01~S20/N01~N12 전체 통과, codebase-map 241개 일치, served bytes 일치)
검증 증거:
- npm run typecheck — 종료 코드 0 — tsc server & browser 오류 0개 — 2026-11-04T18:01:34+09:00
- npm run lint — 종료 코드 0 — 오류 0개 / 기존 3경고 외 신규 0개 — 2026-11-04T18:02:31+09:00
- npm run validate:map — 종료 코드 0 — 241개 경로 모두 존재 — 2026-11-04T17:55:43+09:00
- npm test -- src/web/screens/operations-model.test.ts src/web/pagination.test.ts src/main/services/operations-storage-service.test.ts src/main/services/holiday-api-service.test.ts src/main/services/performance-holiday-gap-service.test.ts src/web/screens/operations-holidays-model.test.ts --reporter=json --outputFile=C:/Users/hacke/AppData/Local/Temp/shiftmgmt-holidays-20261104-unit.json — 종료 코드 0 — 6개 파일 72개 테스트 통과, 0 실패, 0 skip (기존 52개 + 신규 20개) — 2026-11-04T18:10:00+09:00
- npm run build — 종료 코드 0 — server & browser 번들 빌드 및 web asset 복사 성공 — 2026-11-04T18:07:25+09:00
- node scripts/ui-checks/operations.mjs --focus=S01,S05,S06,S19,S20 --port=19234 --out=C:/Users/hacke/AppData/Local/Temp/shiftmgmt-holidays-20261104-focused — 종료 코드 0 — PARTIAL_PASS / 정확 5개 완료 / 0 실패 — 2026-11-04T18:09:35+09:00
- node scripts/ui-checks/operations.mjs --port=19235 --out=C:/Users/hacke/AppData/Local/Temp/shiftmgmt-holidays-20261104-final — 종료 코드 0 — PASS / fullRun=true / exactScenarios=true / 정확 20개 완료 / N01~N12 전체 통과 / 0 실패 — 2026-11-04T18:11:30+09:00
- git diff --check — 종료 코드 0 — 허용 6개 파일 범위 내 변경, 506개 보호 파일 SHA-256 100% 동일
음성 테스트:
- N02: holiday-import-cancel — API 가져오기 후 비교 모달에서 취소 클릭 시 replaceHolidayCalendar 쓰기 0회 유지 — PASS
- N03: holiday-year-duplicate — 다른 연도 날짜 및 중복 날짜 추가 시도 시 UI 폼 에러 노출 및 API 쓰기 0회 거절 — PASS
- N01~N12 음성 검문 전체 통과 확인 (N01: 1, N02: 9, N03: 2, N04: 1, N05: 2, N06: 1, N07: 2, N08: 1, N09: 1, N10: 1, N11: 3, N12: 4) — PASS
UI 증거:
- URL: http://127.0.0.1:19235 / 포커스 19234
- 시나리오: S01~S20 (공휴일 S05, S06 포함)
- 클릭·키보드 결과: 연도 선택, 검색 필터 디바운스, 구분 필터, 날짜/명칭 컬럼 정렬, 행 클릭 상세 갱신, Enter/Space 행 선택, Escape 모달 닫기, 1100px 이하 상세 모달 전환 모두 정상 작동
- 콘솔 결과: 브라우저 콘솔 오류 0건
- 서빙 자산 실측 일치:
  - app.js: 1633737 bytes / SHA-256 786af0fa080197ebf1531cdcb7f9aee3ba206bb0e6d36c9344a17bc9bddd10f8
  - operations.css: 40358 bytes / SHA-256 90b1a5ebdb190f74e9db98509e18e7dfe75980a2ee66eac12aec5347d4d1c672
  - policy-history.css: 10678 bytes / SHA-256 0397a7054f0ea4920f19ac4c1dfd4ac20858428a5c65f25b7ab4800137e2918f
diff 요약:
- src/web/screens/operations-holidays.ts: +769 / -215 (Dense 골격, KPI 요약, 공통 페이지 이동, 380px 상세, CRUD, 비교 모달 및 최신성 점검)
- src/web/screens/operations-holidays-model.ts: 신규 생성 +239 (순수 필터, 비교, 지문 함수)
- src/web/screens/operations-holidays-model.test.ts: 신규 생성 +333 (순수 모델 단위 검증 20개 시험)
- src/web/operations.css: +306 (공휴일 전용 .ops-holidays-workspace scoped 스타일)
- scripts/ui-checks/operations.mjs: +37 / -3 (S05/S06 실제 UI 상호작용 및 비교 모달 노출 검증 보강)
- docs/codebase-map.md: +2 (신규 파일 2건 등록, 총 241개 경로)
- 의존성 및 패키지 변경 없음 (package.json / package-lock.json 불변)
전체 SHA-256:
- ShiftMgmt_V4/src/web/screens/operations-holidays.ts 47bfda5d538898d278757cf62ab1492513d73de5f7db56041fb5b62a1282fb8c
- ShiftMgmt_V4/src/web/screens/operations-holidays-model.ts 65897283d709a458bb4066e4672619b9a5e87eb9461f7f5768c23895f5e63683
- ShiftMgmt_V4/src/web/screens/operations-holidays-model.test.ts 53eef7a88658a7fe8e176509290ea52bdb324e36c38001a756a15356cb63bec6
- ShiftMgmt_V4/src/web/operations.css 90b1a5ebdb190f74e9db98509e18e7dfe75980a2ee66eac12aec5347d4d1c672
- ShiftMgmt_V4/scripts/ui-checks/operations.mjs 63bdca9c72d1eaa29d41317d41e2e86ad5a1db2f36645511090db6647c2110ce
- ShiftMgmt_V4/docs/codebase-map.md 0a61cdbe6436b284db552c22309f5fa03918228274d8bf38be51e61f82ba1349
미해결/가정: 없음
