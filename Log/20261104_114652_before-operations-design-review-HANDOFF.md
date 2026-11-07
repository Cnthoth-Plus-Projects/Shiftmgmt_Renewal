# HANDOFF — UI-ADMIN-02-HOLIDAYS Sol 최종 기술검수

- Task / Parent: `UI-ADMIN-02-HOLIDAYS` / `UI-ADMIN-REFINE`
- Action: REVIEW_RESULT / USER_VISUAL_REVIEW_PENDING
- From: Sol(Codex) / To: 사용자 및 다음 담당자
- Recorded at: 2026-11-04T11:27:56.154Z
- 판정: **Sol 보완 후 기술 수용. 사용자 최종 화면 확인 대기.**
- Gemini 최초1 + 재시도1 = 누적2. 두 제출 모두 독립 검수 미수용. 상시 승계 규칙으로 Sol이 동일 Task·허용6파일 안에서 직접 보완했다. 세 번째 Gemini 요청0.
- Repository: `C:\Projects\Active\교대근무시스템`; product cwd: `ShiftMgmt_V4`; branch `main`; HEAD `de58fe9fe8043f5ef43819e4d2950797532501d5`.
- 정본 판정: `.ai/reports/holidays-20261104/review-retry1-20261104_195159/sol-assessment.json` / 13641 bytes / SHA-256 `FEB8958D49631CB578CA0EC804FE908FD542F8D4A386BECEDF4B34DB4446C29B`.

## 사용자가 확인할 결과물

1. 실제 테스트 창: **http://127.0.0.1:19238/** (Chrome에 공휴일 화면을 열어 둠).
2. 34px 공휴일 목록, 검색·구분 필터, 페이지 이동과 선택 상세를 확인한다. 넓은 화면은 우측 상세, 1100px 이하는 행 선택 시 상세 모달이다.
3. `연동 공휴일 불러오기`에서 날짜별 추가/제외/수정/동일 비교·페이지·전체 교체 안내를 확인한다. 취소·Esc는 저장0, 명시 적용만 전체 목록을 교체한다.
4. 화면 확인 완료를 알려주면 이 Task의 사용자 확인을 기록한다. 다음 관리 메뉴는 그 뒤 기존 순서에서 정한다.

- 스크린샷: `.ai/reports/holidays-20261104/review-retry1-20261104_195159/sol-ui-native/captures/holidays-preview.png`. 테스트 자료는58개 공휴일을 포함한 TEMP fixtures이며 운영 공휴일 확정 자료가 아니다.
- 현재 preview runner PID 13020, server PID 24988; 데이터 `C:\Users\hacke\AppData\Local\Temp\shiftmgmt-ops-data-d23da10833`; resources `C:\Users\hacke\AppData\Local\Temp\shiftmgmt-ops-res-b2d763cddb`.
- 창이 닫힌 경우 product cwd에서 `node scripts/ui-checks/operations.mjs --preview --port=19238 --out=C:/Users/hacke/AppData/Local/Temp/shiftmgmt-holidays-preview-new`로 새 TEMP 시험 창을 만든다. 이미 실행 중이면 재실행하지 않는다.
- 종료가 필요하면 Get-CimInstance로 PID 13020 명령이 operations.mjs --preview --port=19238인지 먼저 확인하고 해당 runner의 트리만 taskkill /PID 13020 /T /F 한다. 기존 Gemini19237 또는 다른 서버는 종료하지 않는다.

## 수신 원문·실패 이력

- 최초 원문: `Log/20261104_181935_received-HOLIDAYS-initial-Gemini.md` / 28912 bytes / SHA-256 `C87CB17AFFA4ADA31A1E816D6075FE22515DB32FEA4697C6BFD65198515FDE85`. byte 동일 보존; 이 파일들은 수정하지 않는다.
- 재시도1 원문: `Log/20261104_195159_received-HOLIDAYS-retry1-Gemini.md` / 26819 bytes / SHA-256 `274D207FC57AFFF311878F4784F9A0171632F871912B4FD940B1C0A517F73322`. byte 동일 보존; 이 파일들은 수정하지 않는다.
- 최초 HOL-D01~07 미수용, 재시도에서 HOL-D02/HOL-D07의 Esc 후 잠금과 늦은 오류의 새 상세창 덮어쓰기가 남아 미수용했다.
- 최초 판정: `.ai/reports/holidays-20261104/review-initial-20261104_181935/assessment.json`; 재시도 판정: `.ai/reports/holidays-20261104/review-retry1-20261104_195159/retry-assessment.json`; 재현: `.ai/reports/holidays-20261104/review-retry1-20261104_195159/retry-boundary-reproductions.json`.
- 이 문서는 새 Gemini 수정 지시서가 아니다. 기존 최초/재시도 실패 기록을 최종 성공으로 덮어쓰지 않는다.

## 최종 변경과 경계

- Gemini 재시도에 포함된 null 빈 연도 처리, JSON tuple 지문, 비교 페이지, 행/버튼 키보드 구분을 유지했다.
- Sol이 모달 소유 토큰·조회/작업 세대와 중앙 종료 정리를 적용했다. 비교창을 Esc/닫기로 끝내면 자기 잠금을 해제하고, 이전 화면 응답은 새 입력창·모달·로그인 상태에 영향을 주지 않는다.
- 연동/비교/CRUD 저장 중 충돌 제어·입력을 잠근다. 현재 세션 오류 두 코드 모두 로그인으로 전환하고, 비교 후 실제 달력 변경은 적용 전에 거절한다.
- 공휴일 범위의 도구·입력·모달·장문·실제 창 메뉴 스타일을 보완했다. 선택 항목은 높이 변경 후 해당 페이지로 유지한다.
- 기존 S06에 실제 닫기/지연오류/달력충돌/장문/세션/4크기 검문을 연결했다. N08/N11/N12에 실행된 공휴일 증거를 추가하고 원래20개와 N01~12 의미를 유지했다.
- 제품512개; 보호506개 변경0; 범위외 신규0. Sol은 재시도 대비 아래3파일만 바꾸었다: `scripts/ui-checks/operations.mjs`, `src/web/operations.css`, `src/web/screens/operations-holidays.ts`.
- 최종 manifest: `.ai/reports/holidays-20261104/review-retry1-20261104_195159/sol-final-source-v2.json` / SHA-256 `9961EA65CFD4BBBE0C0B7585AB9EE7DFCF84A1FAA9604333CF52834ECBF37E47`. 기존4+신규2 허용6 경계 유지.
- 백엔드·공용 제어·계산·DB/API 계약·의존성 변경0. 서버 원자적 충돌 보장은 추가하지 않았으며 적용 직전 클라이언트 재조회 범위다.
- H03 원계약대로 좁은 폭은10행·표 내부 스크롤, 넓은 폭은 실제 높이만큼 온전한 행을 채운다.

## 실제 검증

| 항목 | 결과 |
|---|---|
| typecheck / lint / map | RC0 / 오류0·기존경고3 / 241경로 |
| 관련6파일 단위시험 | 74 PASS, 실패0·skip0, 이전72개 제목 보존 |
| 최종 집중 S01/S05/S06/S19/S20 | 5/5, PARTIAL_PASS(부분실행을 전체로 표기하지 않음) |
| Sol 새 전체 운영 실행 | fullRun=true, exactScenarios=true, S01~S20 20/20, 오류0 |
| N01~N12 | 전부 true, 추가 공휴일 N08/N11/N12 실제 assertion 포함 |
| 실제 크기 | 929×917 / 1024×768 / 1440×900 / 2048×1080, 행34px, 넓은 표·상세 정렬0px, 페이지 가로 넘침0 |
| Native Chrome | viewport=null 실제929×917, 화면 직접 판독 완료 |
| 코드 연결 | full/focused/native 제공 app.js·CSS SHA와 dist 일치, 두 TS source-map 내용 일치 |

- 명령/출력: `.ai/reports/holidays-20261104/review-retry1-20261104_195159/sol-static-unit-commands.json`; 단위시험 `.ai/reports/holidays-20261104/review-retry1-20261104_195159/sol-unit-final.json`.
- 전체/집중/실제 창 근거: `.ai/reports/holidays-20261104/review-retry1-20261104_195159/sol-ui-full`, `.ai/reports/holidays-20261104/review-retry1-20261104_195159/sol-ui-focused`, `.ai/reports/holidays-20261104/review-retry1-20261104_195159/sol-ui-native`.
- 최종 원본·자산·기존 제목 대조: `.ai/reports/holidays-20261104/review-retry1-20261104_195159/sol-evidence-check.json`.
- 정적/단위 검사는 최종 TS 상태에서 실행했고 이후 CSS/runner native 보완만 있었다. 기존 빌드 후 CSS는 기존 copy-web-assets로 복사했다. 그 최종 V2에서 집중5와 전체20을 새로 실행했다. V1 자료는 과거 기록으로만 유지한다.
- 중간 검문 실패 두 건(문자열 끝 공백/실제 서버 세션이 살아 있는 mock)을 fixture에서 고친 뒤 집중 재실행했다. 제품의 trim·세션 계약을 바꾸지 않았다. 전체20은 최종 V2에서1회 실행했다.
- 실제 단위/정적 실행 시간은 명령 JSON에 기록했다. UI 전체 명령 종료0은 관측했으나 정밀 시작/종료 시각은 수집하지 않아 소요 시간을 추정하여 쓰지 않는다.
- 기존 Gemini PASS 기록과 이번 fresh Sol 실행을 구분한다. J Harness 마지막 검문은 이 실제 결과·해시·장부의 일관성을 검사하며, 자체 PASS만으로 제품 수용을 대신하지 않는다.

## 다음 상태

기술 수용 완료 / 사용자 화면 확인 대기. TODO와 task-plan을 동기화했다. 다음 메뉴 착수·commit·push·배포·운영 데이터 적용은 하지 않았다. 이 Task의 사용자 화면 확인이 남아 있다.
