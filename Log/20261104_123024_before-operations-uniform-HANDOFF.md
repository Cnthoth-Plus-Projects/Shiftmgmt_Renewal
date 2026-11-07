# HANDOFF — 공휴일 확인창 개발 로그인 자동입력 복구

- Task: UI-ADMIN-02-HOLIDAYS 후속 결함 / 기존 UI-03-DEV-LOGIN 상시 요구 유지
- Recorded at: 2026-11-04T12:20:55.406Z
- Action: REVIEW_RESULT / USER_REVIEW_PENDING
- 판정: 확인용 로그인 하단 자동입력·실제 로그인 복구 완료.
- 원인: 기존 로그인 화면에는 버튼 구현이 있었으나 운영관리 preview launcher가 개발 flag를 누락하고 자동입력과 다른 시험 비밀번호를 설정했다. Sol의 확인창 연결 누락이며 사용자 설정 문제가 아니다.
- 변경은 기존 허용 scripts/ui-checks/operations.mjs 1파일. 제품512 중511불변·원보호506불변. login.ts/development-login.ts/인증/DB/앱JS/CSS는 변경하지 않는다.
- Sol 담당 / Gemini최초1·재시도1·누적2·추가요청0. 같은Task 시도 횟수를 초기화하지 않는다.
- 정본: .ai/reports/holidays-20261104/visual-refinement-20261104/preview-login-followup/assessment.json, 6322bytes, SHA256 435B55E8567E213CBA490B4AF924DC774D416860A23A34036FCE99A946B4840B

## 사용자가 할 일

**http://127.0.0.1:19240/?developmentPreview=1** — 이 주소로 Chrome 창을 다시 열었다.

로그인 버튼 바로 아래의 ‘테스트 계정 자동입력’을 누른 뒤 ‘로그인’을 누른다. 정상 로그인 후 운영 관리 → 공휴일로 이동하여 화면을 확인한다. 시험 계정은 TEMP 확인용이며 운영 계정을 바꾸지 않는다. 개발 모드는 로컬 URL의 developmentPreview=1로 켜지고 같은 브라우저의 로그아웃 후에도 유지된다. developmentPreview=0과 일반 새 브라우저 모드에서는 표시하지 않는다.

## 실제 확인

- 하단 배너 위치, 클릭 후 두 필드 일치, 정상 로그인 성공.
- 로그아웃/쿼리 없는 같은 로컬URL에서도 배너 유지, mode0에서는 숨김.
- 새 브라우저 context에서도 flag URL → 자동입력 → 정상로그인 성공. 새 로그인은 이전 세션을 종료하는 원동작을 유지하여 확인용 주 창은 마지막에 로그인한다.
- 비preview S01/S17/S18 새 실행3/3 PARTIAL_PASS·오류0. S18은 S17의 실제 백업 fixture가 선행되어야 하므로 함께 실행했다. 처음 두 번의 부분 실행 실패와 진단은 보고서에 보존했다.
- node --check RC0. 앱과CSS 제공SHA 및511파일 불변 확인. 직전74시험/전체20/N12는 기록 재검증으로 재사용하며 이번에 전체를 새로 실행했다고 보고하지 않는다.
- 캡처 .ai/reports/holidays-20261104/visual-refinement-20261104/preview-login-followup/preview/captures/login-autofill.png; preview metadata .ai/reports/holidays-20261104/visual-refinement-20261104/preview-login-followup/preview/preview.json; 정상회귀 .ai/reports/holidays-20261104/visual-refinement-20261104/preview-login-followup/normal/summary.json.
- 이전 공휴일 카테고리·버튼·사용안내 구현/검수는 .ai/reports/holidays-20261104/visual-refinement-20261104/assessment.json 그대로 보존한다.

## 운영 상태

- 새 preview runner 27816, server 29308, TEMP data C:\Users\hacke\AppData\Local\Temp\shiftmgmt-ops-data-15043eef4c, resources C:\Users\hacke\AppData\Local\Temp\shiftmgmt-ops-res-619861882d.
- 예전19240 runner30940은 명령동일 확인 후 자기 트리만 종료했고 기존TEMP는 보존했다. 현재 서버를 종료하려면 새runner 명령이 operations.mjs --preview --port=19240인지 확인 후 해당트리만 종료한다.
- 이전 핸드오프 Log/20261104_122055_before-preview-login-fix-HANDOFF.md / 5640bytes / SHA256 CF963EBCF608F7DA4E26B19313883983449975911F5554CB69BE98DEF1593DFF. Log 수정0.
- 공휴일 최종 실제화면 사용자 확인 대기; 다음 요율 착수0·commit/push/배포0.
