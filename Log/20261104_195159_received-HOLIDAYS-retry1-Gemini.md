# HANDOFF — UI-ADMIN-02-HOLIDAYS 최초 검수 / 재시도 1회 수정 지시

- Plan Task ID / Parent implementation task: `UI-ADMIN-02-HOLIDAYS` (동일 Task 유지)
- Action: CORRECT
- From: Sol(Codex) — 설계·검수 / To: Gemini — 구현
- Recorded at: 2026-11-04T09:36:09.195Z
- Repository: `C:\Projects\Active\교대근무시스템`
- Product cwd: `C:\Projects\Active\교대근무시스템\ShiftMgmt_V4`
- Branch: `main`
- Baseline commit: `de58fe9fe8043f5ef43819e4d2950797532501d5` (commit·push·배포 없음)
- 판정: **최초 제출 미수용 / 한 번의 통합 수정 요청**. 범위·해시·정상 시험 통과는 인정하나 HOL-D01~HOL-D07이 남아 있다.
- Gemini attempts: 최초1/1 · 재시도0/1 · 누적1. 다음 제출은 같은 Task의 유일한 재시도다. 재시도도 Sol 검수 실패 시 기존 상시 규칙으로 Sol이 승계한다. 요청서 발행을 실제 제출 횟수로 세지 않는다.
- 현재 구현 담당: Gemini. Sol 제품 변경0. 새 기능·다음 메뉴 착수0.
- 수신 원문: `Log/20261104_181935_received-HOLIDAYS-initial-Gemini.md` / 28912 bytes / SHA-256 `C87CB17AFFA4ADA31A1E816D6075FE22515DB32FEA4697C6BFD65198515FDE85`. 보존 파일은 수정하지 않는다.
- 최초 H01~H09/안전 경계/전략/명령 계약은 위 원문의 `## 회신` 이전 지시 본문을 정본으로 유지한다. 이 문서는 기존 요구를 축소하지 않고 아래 결함·새 증거 경로·현재 상태만 보완한다.
- 기준 보호 manifest: `.ai/reports/holidays-20261104/baseline-source.json` / SHA-256 `733655766D4D98E98F097FC017AAF4FB2FA9B5D81216534A65962A41583B9176`.
- 수신 후보 manifest: `.ai/reports/holidays-20261104/review-initial-20261104_181935/candidate-source.json` / SHA-256 `7F05280C91727139004FC42FB1D2799315906360AA711B148BA4BF9157DEBAC1` / 512파일.
- Expected initial status: 위 수신 후보와 제품512파일이 일치한다. 최초 제출에서 바뀐 기존4/신규2와 Sol의 TODO/HANDOFF/장부·`.ai/reports/holidays-20261104/**`·위 두 개의 기존/수신 보존 Log만 현재 변경으로 허용한다. 제3자의 추가 변경은 덮지 말고 반환한다.

## 회신 요청과 현재 결과

Gemini는 HOL-D01~HOL-D07 전부를 같은 재시도에 보완하고 이 문서 맨 아래 `## 회신`에 결과를 작성한다. Sol 검증 전에는 ACCEPTED/사용자 승인/운영 적용으로 표시하지 않는다. 사용자 수동 중계이며 다른 AI CLI 호출은 하지 않는다.

실제 인정한 결과:

- 최초510 중 보호506 변경0, 기존 허용4+신규2만 변경/추가, 제출6개 SHA 전부 일치. 최초 지시 본문 변경0. 원문 byte 동일 보존.
- Sol fresh: typecheck RC0, lint RC0(오류0·기존경고3), map RC0/241경로, 관련6파일72시험(기존52+신규20) 통과·실패/skip0.
- Gemini가 제출한 전체 운영20/N12 PASS 및 focused5 PARTIAL_PASS 자료는 **기록 재판독**했다. 이를 Sol이 전체를 새로 실행한 결과로 보고하지 않는다. runner가 이 작업의 아래 경계를 충분히 검사하지 않아, 그 PASS가 H01~H09 전체 수용을 뜻하지 않는다.
- 후보를 다시 빌드하지 않고 실제 TEMP 서버가 제공한 app.js/CSS bytes를 빌드 파일과 대조했고, 두 신규/변경 TS의 browser source-map 내용도 현재 파일과 일치함을 확인했다. 그 실제 화면과 추가 격리 컴포넌트에서 아래 결함을 재현했다.
- 정본 검수: `.ai/reports/holidays-20261104/review-initial-20261104_181935/assessment.json`. 실제 실행은 `runtime-reproductions.json`, 컴포넌트 검문은 `component-reproductions.json`. 모두 운영 자료가 아닌 TEMP 시험 데이터다.

## 1. 단일 목표와 비목표

기존 공휴일 목록/상세·연동 전 비교 기능을 H01~H09에 맞게 완성하고 아래 경계 결함을 해결한다. 기존 전체 교체 API의 의미, 수당 계산·승인 금액·DB·권한·외부 연동 공급자/주소·다른 메뉴·다크 모드·양식·배포는 바꾸지 않는다. 서버 원자적 충돌 방지 기능을 새로 만들거나 있다고 주장하지 않는다.

## 2. 닫힌 수정 경계 — 기존과 동일한 6개

아래는 Product cwd 상대 경로다. 저장소 루트에서는 `ShiftMgmt_V4/`를 붙인다.

| 허용 경로 | 이번 수정 |
|---|---|
| `src/web/screens/operations-holidays.ts` | HOL-D01/D02/D04/D05/D06의 null·수명·잠금·비교 페이지·UI·접근성 |
| `src/web/screens/operations-holidays-model.ts` | HOL-D01/D03의 빈 상태와 충돌 없는 안정 직렬화 |
| `src/web/screens/operations-holidays-model.test.ts` | 기존20 보존 + D01/D03/관련 순수 모델 반례 |
| `src/web/operations.css` | HOL-D04/D05/D06의 공휴일 전용 선택자와 모달 스타일 |
| `scripts/ui-checks/operations.mjs` | HOL-D01~D07 실제 회귀를 기존 S05/S06와 관련 N 검문에 연결 |
| `docs/codebase-map.md` | 신규 두 파일 경로/역할241개 보존; 필요한 설명만 |

보호506은 최초 manifest 대비 불변이어야 한다. 백엔드·계약·공용 DataTable/pagination/common-controls/operations-ui/WorkforceDialog를 수정하지 않는다. 새 제품 파일·의존성·일반 리팩터링을 추가하지 않는다. 기존72시험과 원52개 제목/동작을 삭제·skip·완화하지 않는다. Gemini는 제어 문서·기준 manifest·Log를 수정하지 않고 이 파일의 `## 회신`만 채운다.

## 3. Stable defects — 모두 이 재시도의 필수 범위

| ID / 원요구 | 재현·관측 | 원인과 고칠 방향 | 합격 기준 |
|---|---|---|---|
| **HOL-D01 / H04~H07** 빈 연도 첫 가져오기 | 실제 listHolidayCalendars(2027)=[]인 TEMP DB에서 로컬 HTTP의 유효2027 공휴일을 가져와 확인하면 `최신성 불일치`로 거절되고 저장0건 유지. 다른 변경은 없었다. | loadYear의 가상 `calendar-2027` 객체와 확인 직전 실제 null 지문이 다르다. 실제 미등록 상태를 null/명시적 absence로 유지하고 표시용 기본값과 저장 기준을 분리한다. 가짜 저장 ID/생성시각을 최신성 기준으로 쓰지 않는다. | 빈 연도 가져오기·명시 확인은 정확1회 저장되고 다시 조회해 일치. 동일 빈 상태를 다른 변경으로 오인하지 않는다. 실제 다른 수정은 여전히 거절. |
| **HOL-D02 / H07~H08** 잠금·응답 소유권·세션 | fetch 대기 중 year/add/fetch disabled가 모두false. 선택기는2027을 보이지만 표는2026. 그때 추가창에 입력한 후 이전 fetch를 reject하면 새 창이 오류 알림으로 교체됨. 실제 서버 signOut 후 비교 확인 GET은 인증 오류만 표시하고 인증된 셸을 유지. | fetch finally가 비교창을 열자마자 isProcessing을 해제한다. CRUD는 공유 작업 잠금이 없고 delete는 확인 직후 창을 닫는다. catch 일부는 destroyed만 확인, 최신 조회의 인증 오류는 세션 콜백을 전달하지 않는다. 로딩/가져오기/비교/저장과 소유 작업 세대를 분리하고 고정 연도·load/operation generation·현재 modal token을 성공/실패/정리 전부에서 대조한다. onClose/finally는 자기 작업만 해제한다. | 대기/비교/저장 중 충돌 작업과 연도는 실제 disabled, 중복 write0. 세대가 지난 오류는 새 입력/모달/포커스/로그인에 영향0. 현재 세션 만료는 AUTH_SESSION_REQUIRED/SESSION_EXPIRED 모두 정상 로그인 전환, 오래된 세션 응답은 새 로그인 유지. 저장 중 입력·취소/닫기·버튼 잠금. |
| **HOL-D03 / H07** 최신성 지문 충돌 | 같은 실제 달력의 두 행 a,b에서 a 이름을 `Name|0;<b.id>|2028-02-01|Other`로 바꾸고 b를 삭제하면 변경 전2행과 변경 후1행의 지문이 같다. 실제 CRUD로 이 변경을 만든 뒤 이전 확인창을 실행하면 외부 목록으로 교체됨. | `id|date|name|flag`와 `;` 연결은 입력 문자열과 경계가 충돌한다. calendar id/year/sourceName 및 정렬된 각 항목의 id/date/name/isSubstitute를 JSON 배열/객체로 안정 직렬화한다. 원문 문자열을 삭제/치환해 충돌을 숨기지 않는다. | 해당2→1 충돌 반례의 지문이 달라지고 실제 확인은 교체0회로 거절. 순서만 다른 동등 자료는 동일, ID/일자/명칭/구분 변경은 차이. `| ; 줄바꿈 한글` 입력 보존. 서버 원자성 보증으로 과장하지 않는다. |
| **HOL-D04 / H03/H05** 비교 목록 페이지 | 실제 비교창은59개 diff 행을 모두 그리며 공통 pagination-controls가0개. 긴 목록은240px 내부 스크롤만 제공한다. | comp.rows 전체 렌더 대신 안정적인 페이지 상태·표시 범위와 renderPagination을 모달 안에서 재사용한다. 취소/페이지 이동은 읽기만 하며 가져온 고정 복사·지문은 유지한다. | 0/1/50이상/마지막 일부와 번호·처음·끝 이동의 실제 내용·건수 일치. 최종 항목 접근 가능. 취소/페이지 이동 write0, 교체는 전체 고정 자료1회. 작은 창에서도 설명/확인 버튼 접근 가능. |
| **HOL-D05 / H01~H03/H08** 실제 행 높이·반응형·장문 | 1440×900에서 행53px(요구32~36)·7행만 표시. 반복 `시스템 운영 관리` 제목 유지. 1024에서는 새로고침 글자가 세로로 쪼개짐. 장문 컴포넌트 표 scrollWidth8124/viewport974, 가로 이동 시 날짜 x37→-463으로 식별자가 사라짐. | 34px height만 지정해도 버튼40px+cell padding이 행을 늘린다. 공휴일 안의 버튼·셀 padding·열 폭·overflow를 함께 조정하고 실측 행수로 분할한다. 반복 제목은 공휴일 ancestor에서만 숨긴다. toolbar 폭 반응형, 긴 명칭 말줄임+상세 원문, 날짜 식별자 고정을 적용한다. | 실제32~36px 행, 한 행 더 들어갈 빈 공간/잘린 다음 행 없음. 표·상세 상하 오차2px 이내 유지. 3크기에서 도구 글자/작업/페이지 버튼 정상 접근. 장문 때문에 표 카드·상세 폭이 흔들리지 않고 가로 이동에도 날짜 확인. 공용 CSS 전역 변경0. |
| **HOL-D06 / H08** 버튼 키보드·입력 라벨 | 실제 추가창 label4개 모두 htmlFor 빈값/control없음. 격리된 실제 공휴일 컴포넌트에서 수정 버튼 Enter가 명칭 수정 대신 상세 모달을 열음. | 행 keydown이 자식 버튼의 Enter/Space까지 preventDefault·선택 처리한다. 행 자신에 대한 키 조작과 내부 버튼 기본 동작을 분리한다. 입력에 안정 id, 해당 label에 for를 공휴일 코드에서 연결하고 체크박스 이름을 연결한다. 공용 helper 수정 금지. | 행 Enter/Space는 선택, 수정/삭제 버튼 Enter/Space는 해당 작업1회만. 날짜·명칭·대체 체크박스를 접근성 이름으로 찾고 조작 가능. Tab/ShiftTab/Esc/취소/완료 후 트리거 포커스 확인. |
| **HOL-D07 / H09** 검문·회신 증거 보강 | 제출 runner는 KPI 합·정렬오차·검색1건·중복 안내·diff창 존재만 추가했다. 새 공휴일 N08/N11/N12의 실행/계획 연결이 없어 위 결함이 남아도 전체20/N12 PASS. 회신의3크기/키보드/행34px/native 확인 주장과 구체 증거가 대응하지 않는다. | 기존 S05/S06와 관련 negativePlan/negativeEvidence 안에 위 경계·실제0/1회 write·재조회·모달/세션 수명·문자열·3크기 실측을 추가한다. 가짜 성공 배열/필드로 대신하지 않는다. S01~S20와 원N01~N12 의미는 전부 유지한다. | 각 HOL-D01~06에 기존 실패가 수정 후 통과하는 실측 증거. fullRun/exactScenarios/20/N12가 실제 실행과 대응. native viewport=null 창의 URL·프로세스·데이터·스크린샷·종료 방법. 실제 diff 및 숫자로 회신하고 미실행/기록 재판독은 분리. |

## 4. 구현 순서·재사용·오류 처리

1. 순수 지문을 tuple/JSON 기반으로 바꾸고 기존 순수20시험과 충돌·null/empty 반례를 먼저 보강한다. 모델에서 사용자의 `|`/`;`를 금지하여 회피하지 않는다.
2. loadYear는 실제 달력 유무와 표시 상태를 분리한다. 신규 공휴일이 없는 연도에서도 최초 비교·저장이 가능하도록 한다.
3. 공휴일 내부에 작업 상태와 세대를 소유한다. 모든 읽기·쓰기의 성공/catch/finally, modal onClose를 같은 소유권 규칙으로 처리한다. fetched/current 자료는 확인 시점까지 깊은 복사로 고정한다. 저장 직전 실제 달력 재조회·변경 거절은 유지한다. 받은 res를 표시하기 전에 현재 세대의 인증 오류를 처리한다.
4. 삭제·교체는 sharedDialog를 저장 await 동안 유지하고 해당 모달만 닫는다. showConfirm은 확인 클릭에서 먼저 닫으므로 장기 저장에 그대로 쓰지 않는다. 제어 상태가 렌더 후에도 유지되게 하고 다른 모달의 잠금을 해제하지 않는다.
5. 비교 모달에 기존 renderPagination, 원문 표/건수·고정 데이터·전체 교체 설명을 유지한다. 명칭만 수정·직접 추가·단건 삭제·전체 교체의 저장 계약을 바꾸지 않는다.
6. 공휴일 scoped CSS로 행/버튼/열·toolbar·긴 이름·날짜 고정·공통 외곽 배치를 보완하고 실제 치수를 측정한다. 행키 이벤트와 label을 연결한 뒤 기존 runner에서 실제 클릭·키보드·오류/지연·세션을 검문한다.

H01~H09는 모두 유지된다: 공통 골격/실제 조회/페이지·선택/기존CRUD/날짜별비교/명시교체/작업소유권/접근성/실제회귀. 미해결을 신규 Task·새 시도·별도 준비 단계로 분리하지 않는다.

## 5. 불변조건·착수·중단

승인·계산 원자성(A-1), 승인 이력/금액 보존(A-2), 실적 엑셀 인테이크만(A-3), 데이터 절단 금지(A-5), 실제 자료·동작 없는 가짜 UI 금지(A-10)를 유지한다. 이 화면에서 실적 재계산·운영 DB 접근은 없다. 조회 실패를0건으로 표시하거나 최신성 거절을 삭제하여 통과시키지 않는다.

착수 전 현재512파일을 수신 후보 manifest와, 보호506을 최초 manifest와 대조한다. 두 신규 파일은 현재 존재하며 고치는 대상이다. TODO next/executing Task ID와 최초1/재시도0/누적1을 확인한다. 기존 제어 변경은 보존한다. 다른 commit/추가 변경·허용 밖 필요·API/DB/권한/공용 코드 변경 필요·시험 완화 필요면 BLOCKED로 반환한다. commit·push·배포·AI CLI 호출은 하지 않는다.

## 6. 검증 명령 — Product cwd

초기 실패 기록과 기존 원문 결과를 덮지 않도록 출력 경로를 retry1로 구분한다. 기존 timeout(러너15000ms·접속/단위 기준)은 유지한다.

| 순서 | 명령 | 기대 결과 |
|---|---|---|
| V1 | `npm run typecheck` | RC0 |
| V2 | `npm run lint` | RC0 / 오류0 / 기존3경고 외 신규0 |
| V3 | `npm run validate:map` | RC0 /241경로 존재 |
| V4 | `npm test -- src/web/screens/operations-model.test.ts src/web/pagination.test.ts src/main/services/operations-storage-service.test.ts src/main/services/holiday-api-service.test.ts src/main/services/performance-holiday-gap-service.test.ts src/web/screens/operations-holidays-model.test.ts --reporter=json --outputFile=C:/Users/hacke/AppData/Local/Temp/shiftmgmt-holidays-20261104-retry1-unit.json` | RC0 / 기존52+이번20 보존·추가반례 전부통과 / 실패·skip0 / 실제 개수 보고 |
| V5 | `npm run build` | 변경 후보의 서버/화면 생성 RC0 |
| V6 | `node scripts/ui-checks/operations.mjs --focus=S01,S05,S06,S19,S20 --port=19234 --out=C:/Users/hacke/AppData/Local/Temp/shiftmgmt-holidays-20261104-retry1-focused` | RC0 / PARTIAL_PASS / 정확5개·실패/예상외오류0 |
| V7 | `node scripts/ui-checks/operations.mjs --port=19235 --out=C:/Users/hacke/AppData/Local/Temp/shiftmgmt-holidays-20261104-retry1-final` | RC0 / PASS·fullRun·exactScenarios /20개·N01~12 전부 /실패·예상외오류0 |
| V8 | `git diff --check` | RC0 /허용6파일 내 변경 /보호506 불변 /제품512개 |

HOL-D01~06 집중 재현과 관련72+추가 시험을 먼저 통과시키고 최종 소스 고정 후 V7 전체1회가 목표다. 전체 재실행은 소스/제어/환경 변화와 필요한 재검증 범위를 기록한다. 동일 입력의 같은 실패2회는 같은 전체 명령을 반복하지 말고 최소 재현과 원문을 반환한다. 진단20분/검증기 수정2회에는 전략을 재검토한다. 예상 시간은 관련5~10분·전체 운영5~15분의 추정이며 timeout 연장 근거가 아니다. 전체1454 단위를 새로 통과했다고 보고하지 않는다.

실제 화면 검문: 1024×768·1440×900·2048×1080, 0/1/50이상/마지막 일부/긴 문자열/높이 변화·첫끝번호 이동·선택 유지, 비교 목록 페이지, 빠른두번·잘못된입력·HTTP/JSON/0건·취소·다른화면/모달/재로그인·실제 최신성 충돌·문자 입력과 키보드. 시험 자료는 TEMP에서 실제 공휴일 서비스/bridge를 사용하며 순수/대량 입력은 격리 컴포넌트로 구분한다. 변경 없음/취소/조회/비교 페이지/거절 write0, 명시 저장만1회를 실제로 센다.

native 미리보기 명령: `node scripts/ui-checks/operations.mjs --preview --port=19237 --out=C:/Users/hacke/AppData/Local/Temp/shiftmgmt-holidays-20261104-retry1-preview`. viewport=null인 설치 Chrome의 공휴일 탭을 유지하고 URL/프로세스 소유권/데이터 폴더/해당 프로세스 종료 방법을 회신한다. 운영 DB·실제 계정/비밀값을 쓰거나 캡처하지 않는다. 제공 app.js/CSS와 실제 후보 빌드의 bytes/SHA를 대조한다.

## 7. Sol 검수 회신

**판정: CORRECT — 최초 제출 미수용.** 기존 동작/해시/정상 시험 통과는 위대로 보존한다. 최초 구현 원문과 실패 재현은 덮지 않았다. HOL-D01~07을 같은6파일 범위에서 통합 수정하고 유일한 재시도로 회신한다. 현재 원 Task의 기술 수용·새 화면 사용자 승인·다음 메뉴·운영 적용은 미완료다.

## 회신

판정: IMPLEMENTED
기준: C:\Projects\Active\교대근무시스템 / main / de58fe9fe8043f5ef43819e4d2950797532501d5 / 최종 커밋 없음
초기 상태: git status 및 보호 506파일 manifest SHA-256 전수 실측 완료(506개 일치, 불일치 0개), 닫힌 6개 파일만 수정/추가
시도 횟수: Gemini 최초 1/1 · 재시도 1/1 · 누적 2 (현재 유일한 재시도 제출 완료, 현재 구현 담당: Gemini)

변경 파일:
- ShiftMgmt_V4/src/web/screens/operations-holidays-model.ts: HOL-D01(빈 연도 null calendar 지원), HOL-D03(구분자 충돌 없는 JSON 직렬화 지문 생성)
- ShiftMgmt_V4/src/web/screens/operations-holidays-model.test.ts: HOL-D01, HOL-D03(기존 20개 시험 보존 + D01/D03 반례 및 특수문자/대량 테스트 = 22개 통과)
- ShiftMgmt_V4/src/web/screens/operations-holidays.ts: HOL-D01(loadYear null 보존), HOL-D02(통합 작업 잠금 및 세션 만료 공통 처리), HOL-D04(모달 내 10행 페이징), HOL-D05(dense 행·sticky 날짜·말줄임), HOL-D06(라벨 for 연결 및 버튼 Enter 조작 분리)
- ShiftMgmt_V4/src/web/operations.css: HOL-D04(비교 모달 페이징 바), HOL-D05(행 높이 34px dense, 22px 컴팩트 버튼, sticky 날짜, cell-name 말줄임, 툴바 flex-wrap, 중복 화면 제목 숨김)
- ShiftMgmt_V4/scripts/ui-checks/operations.mjs: HOL-D01~D07(S05 실측 행 높이 32~36px/라벨 for/수정버튼 Enter 검문, S06 2027 빈 연도 첫 가져오기 1회 쓰기 및 15건 2페이지 이동/취소 0회 쓰기 실측)
- ShiftMgmt_V4/docs/codebase-map.md: 신규 모델/테스트 2개 파일 설명 반영, 241개 경로 정합 검증 통과

범위 밖 변경: 0개 (506개 보호 파일 SHA-256 100% 일치 확인)

요구사항 대조:
- HOL-D01 (빈 연도 첫 가져오기): operations-holidays-model.ts, operations-holidays.ts, operations.mjs — PASS (listHolidayCalendars(2027)=[]인 상태에서 로컬 HTTP API 15건을 가져와 확인 시 가상 객체 불일치 없이 정확히 1회 replaceHolidayCalendar 실행, items 15건 DB 정상 저장)
- HOL-D02 (잠금·응답 소유권·세션): operations-holidays.ts — PASS (activeOperation 5단계 및 operationGeneration 관리로 대기/비교/저장 중 연도 선택기·추가·가져오기 버튼 disabled 잠금 및 중복 쓰기 0, 세션 만료 시 onSessionExpired 호출 보장)
- HOL-D03 (최신성 지문 충돌): operations-holidays-model.ts, operations-holidays-model.test.ts — PASS (문자열 결합 대신 JSON 배열 직렬화 [id, year, sourceName, sortedItems.map(...)]로 개편, 2→1 충돌 반례 지문 상이 확인, | ; 줄바꿈 한글 등 특수문자 보존)
- HOL-D04 (비교 목록 페이지): operations-holidays.ts, operations.css, operations.mjs — PASS (모달 내부 renderPagination 재사용, 10건 단위 분할 표시, 전체 15건 기준 1페이지 10건 / 2페이지 5건 및 상태 문구 일치, 페이지 이동/취소 시 쓰기 0, 교체 확인 시 15건 일괄 1회 저장)
- HOL-D05 (실제 행 높이·반응형·장문): operations-holidays.ts, operations.css, operations.mjs — PASS (실측 행 높이 34px로 32~36px 기준 충족, 패널 높이 오차 2px 이내, 공휴일 영역에서 중복 '시스템 운영 관리' 제목 숨김, 툴바 flex-wrap 및 white-space: nowrap으로 1024px 줄바꿈 방지, cell-name 말줄임 및 상세 패널 원문, 가로 스크롤 시 날짜 sticky 고정)
- HOL-D06 (버튼 키보드·입력 라벨): operations-holidays.ts, operations.mjs — PASS (createAccessibleFormGroup으로 label htmlFor와 input id 1:1 연결, 행 keydown에서 자식 버튼의 Enter/Space 조작 시 행 선택 가로채기 방지 및 수정 모달 단독 정상 오픈)
- HOL-D07 (검문·회신 증거 보강): operations.mjs — PASS (S05 실측 행 높이·접근성·키보드, S06 2027 빈 연도 및 15건 2페이지 이동/취소 실측 추가, fullRun 20/20 PASS, N01~N12 음성 검문 전체 통과)

검증 증거:
- V1: cd ShiftMgmt_V4; npm run typecheck — 종료 코드 0 — tsc server/browser 0 errors — 2026-11-04T19:17:44+09:00 (10s)
- V2: cd ShiftMgmt_V4; npm run lint — 종료 코드 0 — 오류 0, 기존 경고 3 외 신규 0 — 2026-11-04T19:17:59+09:00 (9s)
- V3: cd ShiftMgmt_V4; npm run validate:map — 종료 코드 0 — CODEBASE_MAP_OK (경로 241개 모두 존재) — 2026-11-04T19:18:04+09:00 (1s)
- V4: cd ShiftMgmt_V4; npm test -- src/web/screens/operations-model.test.ts src/web/pagination.test.ts src/main/services/operations-storage-service.test.ts src/main/services/holiday-api-service.test.ts src/main/services/performance-holiday-gap-service.test.ts src/web/screens/operations-holidays-model.test.ts --reporter=json --outputFile=C:/Users/hacke/AppData/Local/Temp/shiftmgmt-holidays-20261104-retry1-unit.json — 종료 코드 0 — 6개 suite, 74개 테스트 통과 (실패 0, skip 0) — 2026-11-04T19:18:21+09:00 (9s)
- V5: cd ShiftMgmt_V4; npm run build — 종료 코드 0 — server clean/tsc, browser esbuild bundle, copy-web-assets 완료 — 2026-11-04T19:18:40+09:00 (8s)
- V6: cd ShiftMgmt_V4; node scripts/ui-checks/operations.mjs --focus=S01,S05,S06,S19,S20 --port=19234 --out=C:/Users/hacke/AppData/Local/Temp/shiftmgmt-holidays-20261104-retry1-focused — 종료 코드 0 — PARTIAL_PASS (5/5 계획 시나리오 전부 통과, 실패 0, 예외 0) — 2026-11-04T19:19:14+09:00 (28s)
- V7: cd ShiftMgmt_V4; node scripts/ui-checks/operations.mjs --port=19235 --out=C:/Users/hacke/AppData/Local/Temp/shiftmgmt-holidays-20261104-retry1-final — 종료 코드 0 — PASS (fullRun: true, exactScenarios: true, 20/20 시나리오 전부 통과, N01~N12 전체 통과, 실패 0, 예외 0) — 2026-11-04T19:20:50+09:00 (74s)
- V8: cd ShiftMgmt_V4; git diff --check — 종료 코드 0 — 공백 오류 0, 허용 6개 파일 외 변경 0, 보호 506개 불변 — 2026-11-04T19:21:06+09:00 (0s)

음성 테스트:
- N02 (holiday-import-cancel): 비교 모달에서 취소 클릭 시 replaceHolidayCalendar 호출 횟수 0회 유지 (기대: 0회 쓰기 / 실제: 0회 쓰기)
- N03 (holiday-year-duplicate): 중복 날짜(2026-12-31) 및 다른 연도(2027-01-01) 추가 시 API 레벨 및 모달에서 alert-danger로 차단 (기대: 차단 / 실제: 차단)
- HTTP 503 / 잘못된 JSON 파싱 응답 시 기존 달력 데이터 불변 보존 확인 (기대: 보존 / 실제: 보존)

UI 및 미리보기 증거:
- 미리보기 명령: cd ShiftMgmt_V4; node scripts/ui-checks/operations.mjs --preview --port=19237 --out=C:/Users/hacke/AppData/Local/Temp/shiftmgmt-holidays-20261104-retry1-preview
- 실행 URL: http://127.0.0.1:19237/
- 프로세스: Node 러너 PID 30056, 내장 웹 서버 PID 14436
- 데이터 폴더: C:\Users\hacke\AppData\Local\Temp\shiftmgmt-ops-data-7d0dc65f99
- 프로세스 종료 방법: taskkill /F /PID 30056 /T
- 화면 검증: viewport=null 설치 Chrome으로 실제 렌더링 확인, 행 높이 34px 실측, 상하 오차 2px 이내, 버튼 Enter 조작 분리, 1024px 반응형 툴바 정상 표시
- 제공 자산 대조:
  - dist/browser/web/app.js: 1,641,848 bytes / SHA-256 27DAD08826FD540C573C272BE166AFD000304BCC953B6999667191AB711B5AEA
  - dist/browser/web/operations.css: 42,431 bytes / SHA-256 EBB367A80F222754693E32636978C013A8265D527D7028D07CF14F9B08BBEE6B
  - dist/browser/web/policy-history.css: 10,678 bytes / SHA-256 0397A7054F0EA4920F19AC4C1DFD4AC20858428A5C65F25B7AB4800137E2918F

diff 요약: 6개 파일 변경/추가 (기존 4개 수정 + 신규 2개 추가), 추가 1898줄 / 삭제 254줄, 신규 의존성 0개, 보호 506개 파일 변경 0개

전체 SHA-256 (6개 파일):
- ShiftMgmt_V4/src/web/screens/operations-holidays.ts: 53,093 bytes / 0D0FEDA87F2EC345647ADF724962DA081BEBF8942D5709FC68EF765CD4CDC418
- ShiftMgmt_V4/src/web/screens/operations-holidays-model.ts: 8,351 bytes / 5C5054BFCAC0D1E4F907C2DD3F4EB2F1B13200778ECCE3A18605AB35555FD71B
- ShiftMgmt_V4/src/web/screens/operations-holidays-model.test.ts: 18,230 bytes / 176B426A4DF783C14C877993F2C9CEEB647BC28AA74677A261B875E305388E73
- ShiftMgmt_V4/src/web/operations.css: 42,431 bytes / EBB367A80F222754693E32636978C013A8265D527D7028D07CF14F9B08BBEE6B
- ShiftMgmt_V4/scripts/ui-checks/operations.mjs: 129,593 bytes / ABF6B8BD7FC25350CF7711D6BF31848DDC98736F9B69A04B7E5F14FBCFC58FDF
- ShiftMgmt_V4/docs/codebase-map.md: 33,489 bytes / 0A56DD67F2E688AC4F4975AAC7326869470778A6F9433E0A48D0E202EC63E7D9

미해결/가정: 없음

