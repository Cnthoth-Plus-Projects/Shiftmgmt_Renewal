# HANDOFF — 한국 공휴일 동기화·부분 요율 누락 차단·주말 시간 기준 계획

현재 leaf HOLIDAY-FOLLOWUP-PLAN-01: 사용자 요청에 따라 이해한 요구와 실행 계획만 보고한다. 제품 코드·DB·릴리즈 변경은 0이며 구현 Task HOLIDAY-FOLLOWUP-IMPL-01는 계획 확인 전 미착수다. 담당 Sol, Gemini 최초0·재시도0·누적0. Tier frontier: 수당 분류·근무표 시간·Excel 실적·동기화 UI를 함께 검토해야 한다.

## 1. 사용자 결정과 해석

- 1번: 실제 근무시간이 있는 축의 배율이0이면 부분 지급 상태로 승인되지 않게 보완한다. 연장120분0배+야간150분2.5배가88125원으로 승인된 재현을 거절 사례로 바꾼다. 시간이0인 기본/연장/야간 축은0배여도 오류로 보지 않는다. 운영 배율의 숫자는 임의로 정하지 않는다.
- 2번: 연도 선택→한국 공휴일 동기화 클릭→오른쪽에 받아온 목록·출처·변경사항 표시→오른쪽 적용하기 클릭→공휴일 DB 저장→왼쪽 목록 갱신. 조회만으로 DB는 바뀌지 않는다. API를 우선 사용하고 검색은 공식 자료 대조에 활용한다. 검색 결과를 검증 없이 DB에 넣지 않는다.
- 3번: 공휴일 수당 여부는 공휴일 DB 날짜로 결정한다. 토·일 정규근무표/시간 설정 자체로 공휴일 수당을 발생시키지 않는다. 공휴일이 토요일이면 토요일 시간, 일요일이면 일요일 시간을 적용하고 수당 구분은 공휴일로 유지한다.
- 4번: 현재 자동 갱신/정정 보존 동작과 충돌하는 현행 문서 설명을 정리한다. 과거 결정·원문은 지우지 않는다.

| 날짜 성격 | 근무시간 적용 기준 | 공휴일 수당 판단 |
|---|---|---|
| 일반 토요일 | 토요일에 정의된 시간 | 토요일이라는 이유로 공휴일 수당 생성 안 함 |
| 일반 일요일 | 일요일에 정의된 시간 | 일요일이라는 이유로 공휴일 수당 생성 안 함 |
| 평일에 있는 공휴일 | 공휴일에 정의된 시간 | 공휴일 요율 |
| 토요일이면서 공휴일 | 토요일에 정의된 시간 | 공휴일 요율 |
| 일요일이면서 공휴일 | 일요일에 정의된 시간 | 공휴일 요율 |

해석을 분명히 한다: 이번 예외는 ‘근무시간’ 우선 적용이다. 근무자 배치·근무유형·조별 반복 사이클까지 토·일 패턴으로 무조건 바꾸는 것으로 확대하지 않는다. 기존 근무편성 기준을 유지하면서 시간 선택과 수당의 공휴일 판단을 구분한다. 별도로 접수한 연장·대체 실적은 기존 지급 규칙을 유지한다. 토·일 별도 시간이 미설정이면 현재의 기본 시간 폴백을 보존하고, 명시적 휴무나 근무0분에 임의 시간을 만들지 않는다. 사용자 확인에서 다른 의도가 나오면 구현 전에 이 해석을 조정한다.

## 2. 현재 소스 확인

- 현재 공휴일 화면은 외부 연동 별도 카테고리→비교 모달→연도 전체 교체 방식이다. 이를 기존 운영 관리 안의 좌측 등록목록/우측 가져온 결과 흐름으로 정리한다. 새 메뉴를 만들지 않는다.
- 현재 resolveHolidayStep은 public/saturday/sunday의 근무 선택과 시간 처리를 묶고, overlapPriority 선택이 있다. 새 기준이 ‘휴일 판단까지 주말로 바뀌는 일’이나 ‘공휴일 시간이 주말 시간을 덮는 일’을 만들지 않도록 시간 원천을 별도로 판정한다. 기존 근무편성 선택의 의미는 보존하고 UI 설명을 명확히 한다.
- 실적의 법정휴일 행은 Excel 색상/저장 근무표 시간을 읽는 경로가 있다. 주말 색상만으로 휴일 수당 행이 생기거나 공휴일·토일 두 행으로 중복 생성되지 않는지 검증한다. 원본/저장된 내보내기 스냅샷을 임의로 다시 만들지 않는다.
- 현재 API는 한국 요청에 HTTP200·18개를 반환했고 지원국 목록에도 KR이 있다. 이는 연결 확인이며 한국 공휴일의 완전성을 증명한 것은 아니다. 대체/임시공휴일·선거일 등은 구현 검증 때 신뢰할 수 있는 공식 목록과 대조한다. API 응답 https://date.nager.at/api/v3/PublicHolidays/2026/KR, 상세 C:\Users\hacke\AppData\Local\Temp\shiftmgmt-holiday-plan-4wzNEj\api-readonly-evidence.json.

## 3. 구현 순서·범위

1. 부분0배 승인 방어: 공유 도메인에 실제 근무분별 요율 누락을 판정하는 작은 함수를 두고 신규 승인과 수당 미리보기에 공통 적용한다. 오류에는 누락된 기본/연장/야간 축과 근무분, 요율 관리에서 고칠 위치를 표시한다. 승인/계산/정책기록은 기존 트랜잭션으로 함께 롤백한다. 순수 금액 계산의0배 what-if와 읽기 전용 영향도 비교는 유지한다. 기존 총액0 오류도 유지해 기존 계약/회귀를 약화하지 않는다.
2. 근무시간과 공휴일 판단 구분: 수당 분류는 DB 공휴일 여부, 시간 선택은 해당 날짜의 평일/토/일 설정으로 결정한다. 공휴일·토일 중첩에서 시간만 토·일 우선으로 정리하고 근무배치/사이클·날짜예외 등 기존 규칙은 보존한다. 근무지 편집 화면에는 이 관계를 설명한다.
3. 공휴일 동기화 UI: 기존 카테고리/헤더/밀도/버튼 스타일을 유지하며 왼쪽 DB 목록과 오른쪽 조회결과/적용하기를 고정된 영역에 배치한다. 불러오는 동안/연도를 바꿨을 때/오류가 났을 때 이전 응답을 잘못 적용하지 않는다. 1440과1024 폭 및 두 테마에서 읽기·버튼 위치를 확인한다.
4. DB 반영: 선택한 연도에 새 날짜를 추가하고 동일 날짜는 갱신하는 방식이 권장 기본안이다. API 목록에 없다는 이유로 기존 수동 추가일을 자동 삭제하지 않는다. 추가/변경/유지 내역을 미리 보여준다. 저장은 기존 SQLite 트랜잭션을 재사용한다. 필요하면 기존 replace 입력에 ‘기존 날짜 유지’ 선택값만 호환 확장하여 옛 전체교체 호출 동작을 보존한다. 신규 메뉴·DB스키마·의존성·새 검증 프레임워크는 추가하지 않는다.
5. 문서 정합성: 07 A-4의 ‘시급 변경 후 대기는 그대로’ 설명을 승인된 W06/W08과 현재 코드에 맞춘다. 02의 현행 설명/공휴일·주말 표와 필요 시 CLAUDE의 참조 설명도 대조한다. 동일일 정정의 이전 금액·사유 이력, 이미 승인된 스냅샷 보존을 명시한다.
6. 검증 후 수정판1.0.3 준비: 기존1.0.2 ZIP·6첨부·금융 이력은 그대로 보존한다. 코드가 바뀌면 새 버전으로 패키지/격리 설치·원격 초안까지 기존 릴리즈 준비 권한 안에서 구분한다. 공개 게시와 실제PC설치는 실행하지 않는다.

## 4. 제안 제품 allowlist (39개)

- ShiftMgmt_V4/src/shared/domain/allowance-service.ts
- ShiftMgmt_V4/src/shared/domain/allowance-service.test.ts
- ShiftMgmt_V4/src/main/services/approved-allowance-calculation-service.ts
- ShiftMgmt_V4/src/main/services/approved-allowance-calculation-service.test.ts
- ShiftMgmt_V4/src/main/services/allowance-preview-service.ts
- ShiftMgmt_V4/src/main/services/allowance-preview-service.test.ts
- ShiftMgmt_V4/src/main/services/performance-approval-flow-service.test.ts
- ShiftMgmt_V4/src/shared/domain/holiday-pattern.ts
- ShiftMgmt_V4/src/shared/domain/holiday-pattern.test.ts
- ShiftMgmt_V4/src/shared/domain/monthly-schedule-draft.ts
- ShiftMgmt_V4/src/shared/domain/monthly-schedule-draft.test.ts
- ShiftMgmt_V4/src/main/services/schedule-return-performance-parser.ts
- ShiftMgmt_V4/src/main/services/schedule-return-performance-parser.test.ts
- ShiftMgmt_V4/src/main/services/schedule-plan-export-service.test.ts
- ShiftMgmt_V4/src/main/services/boramae-holiday-weekend-crosscheck.test.ts
- ShiftMgmt_V4/src/web/screens/sites-holiday-policy.ts
- ShiftMgmt_V4/src/web/screens/sites-model.test.ts
- ShiftMgmt_V4/src/web/screens/operations-holidays.ts
- ShiftMgmt_V4/src/web/screens/operations-holidays-model.ts
- ShiftMgmt_V4/src/web/screens/operations-holidays-model.test.ts
- ShiftMgmt_V4/src/web/operations.css
- ShiftMgmt_V4/src/main/services/holiday-api-service.ts
- ShiftMgmt_V4/src/main/services/holiday-api-service.test.ts
- ShiftMgmt_V4/src/main/services/operations-storage-service.ts
- ShiftMgmt_V4/src/main/services/operations-storage-service.test.ts
- ShiftMgmt_V4/src/shared/bridge/contracts.ts
- ShiftMgmt_V4/src/main/http/routes/operations-routes.ts
- ShiftMgmt_V4/src/main/http/routes/operations-routes.test.ts
- ShiftMgmt_V4/scripts/ui-checks/operations.mjs
- ShiftMgmt_V4/scripts/ui-checks/sites.mjs
- ShiftMgmt_V4/scripts/ui-checks/performance.mjs
- ShiftMgmt_V4/docs/fresh-install.md
- ShiftMgmt_V4/docs/codebase-map.md
- ShiftMgmt_V4/README.md
- ShiftMgmt_V4/VERSION
- ShiftMgmt_V4/package.json
- ShiftMgmt_V4/package-lock.json
- ShiftMgmt_V4/src/shared/config/app-brand.ts
- ShiftMgmt_V4/docs/release-1.0.3.md

필요한 경로만 수정한다. 통신의 메서드명·기존 필드·기존 호출 의미를 없애지 않으며 공휴일 적용의 보존 선택은 호환 가능한 입력 확장 범위로 한정한다. 제어/문서 허용 범위: TODO.md, .ai/task-plan.json, HANDOFF.md, 02-business-rules.md, 07-invariants-and-pitfalls.md, CLAUDE.md의 관련 현행 설명, 새 Log 원문, .jh-artifacts/holiday-followup-*와 전용 TEMP 증거. 기존 Log/report는 append-only다. V3, 운영 DB/원본 Excel, 기존 정책일/승인·계산 원문, 기존 설치 ZIP, 스키마/의존성은 보호한다.

## 5. 검증 계획 (14그룹)

| ID | 통과 조건 |
|---|---|
| Z01 | 기본/연장/야간 각각 실제분>0·해당배율0이면 신규승인 차단; 근무분0인 축은0배 허용 |
| Z02 | 연장120분0배+야간150분2.5배의 기존88125원 부분지급 승인 재현이 차단되고 승인/계산/항목/정책사용 기록 롤백 |
| Z03 | 정상양수 요율·총액0 기존오류·순수산식·영향도 비교의0배 what-if·과거 승인원문 보존 |
| H01 | 한국 공휴일 동기화는 우측미리보기만 갱신하고 DB·좌측기존목록 불변 |
| H02 | 적용하기에서만 선택연도 저장·좌측갱신; 날짜중복방지·수동기존목록 기본유지·다른연도 불변 |
| H03 | 통신실패/시간초과/빈목록/잘못된날짜·연도/중복클릭/늦은응답/화면이탈에서 기존DB 보존 |
| W01 | 일반토요일·일요일은 근무표 시간만 해당요일 설정, 공휴일수당 자동생성 없음 |
| W02 | 평일공휴일은 공휴일 시간·공휴일 요율, 공휴일토요일은 토요일시간·공휴일요율, 공휴일일요일은 일요일시간·공휴일요율 |
| W03 | 공휴일·주말 중복지급 없음; 근무자배치/근무유형·사이클·명시적 날짜예외·휴무/미설정 기존안전규칙 보존 |
| X01 | 두 양식 실제Excel 생성→실적접수→승인→DB→품의서/별첨1/별첨2 A4에서 주말중첩 시간/금액 일치 |
| D01 | 07/02/CLAUDE 관련 현행설명·시급변경후미승인자동갱신·동일일정정이력·승인스냅샷보존을 대조, 역사적기록 보존 |
| UI01 | 실제Chrome에서 동기화/우측결과/적용·새로고침·두테마·1440/1024 레이아웃과 0배 상세오류 확인 |
| F01 | 집중검사 후 고정소스 전체1회 목표(현재1574 기준 감소금지), type/lint/build/map/module smoke |
| REL01 | 이전1.0.2 원본보존, 새1.0.3 ZIP·포함Node/라이선스/무결성·TEMP설치 및 신규대표계산/출력·draft첨부 해시. 공개/실제PC설치 별도 |

집중 재현→영향 범위 단위/서비스→실제 Chrome·두 양식 Excel→소스 고정 전체1회→수정판 설치/출력 순서다. 현재 기준은1574/160파일이고 전체 직전 실측500.79초다. 실패하면 해당 원문/원인과 필요한 변경 후 재실행 이유를 기록한다. 기존 테스트 수나 판정/보존/롤백 조건을 줄이지 않는다. 구현/통합은 약2~4시간의 초기 추정이며 외부 공휴일 데이터 검증과 UI 상태 처리에 따라 달라질 수 있다.

## 6. 이번 산출물과 다음 단계

이번에는 계획·소스 대조·실제 API 연결 확인만 했다. 제품537파일 변경0, 새 제품 단위/빌드/Chrome/설치 시험0이다. 앞선1.0.2의 검증·초안 결과는 원문을 보존했으며 이번 계획을 새 구현 성공으로 보고하지 않는다. 계획과 해석을 사용자가 확인한 뒤 HOLIDAY-FOLLOWUP-IMPL-01 하나로 순차 실행한다. 실행 시 Sol 직접/기존 상시 예외를 따르고 Gemini 횟수는 실제 제출이 있을 때만 늘린다.

기준 HEAD ffdcc33b673dc10b5c7d7ba80ac464b3fdf7a2ea, 제품 tree be6fe6383eca01cf0458815c9c44a3f6b80bfd9e. 받은 HANDOFF Log/20261108_103710_before-holiday-followup-plan.md, 7988bytes/SHA256 604EFBE574970B4D5ED4DFDB2EF664F3253DE796CFA8A0CE7F0639D379A993A6 바이트 동일. 계획 증거 C:\Users\hacke\AppData\Local\Temp\shiftmgmt-holiday-plan-4wzNEj. 이 계획이 현재 정본이며 제품 수정/새 릴리즈/공개/실제PC설치를 이미 했다는 뜻이 아니다.
