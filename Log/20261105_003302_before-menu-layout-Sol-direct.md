# HANDOFF — UI-NAV-LAYOUT-REFINE 검토완료/구현담당 확인대기

사용자 현재요청은 실적가져오기 좌상단 정렬, 미구현 근무표조정/조직관리 메뉴 용도확인, 활동이력 값잘림 조정. 양식보다 우선하는 동일후속Task로 등록했다.

- 정본 .ai/reports/menu-layout-20261105/review.json / SHA256 268C176293D02FA86815282240D8D5278DDD42AAB1BFB46ED261AA8323DF3A9E. 실제3크기12상태+미구현2메뉴 캡처 .ai/reports/menu-layout-20261105/before. 제품516 byte동일·수정0. Gemini최초0/재시도0/누적0, 현재Sol검토완료/구현담당대기.
- 정상Gemini writer 복구 지침(TODO 2026-11-01)이 현재새Task에 적용되며, 이전Sol직접예외는 다크모드만이었다. 구체수정안을 만든 뒤 사용자에게 ‘이번5파일 보완도 Sol이 직접 수정 / Gemini 전달’ 선택을 async로 질문했다. 답변 없이는 제품변경하지 않는다. 이는 Skill의 별도승인 요구가 아니라 기존프로젝트 writer 지침이다.

## 구체수정안

1. performance.css: main24+내부16 중복여백으로 기준236,72보다260,96에 시작. 부모16/16/8·내부0으로 맞추고 기존380px상세/표·하단페이지 유지.
2. shell.ts: schedule-adjust/org-mgmt는 실제스크린분기가 없고 준비안내만 표시. 사용불가2메뉴를 사이드바에서 숨김. 기능개발/자료삭제/권한변경 없음. 조직·조별배정의 기존업무는 근무지/인력관리에서 유지.
3. access-history.css: 활동시간130px 대비 실제내용172px로3폭에서 모두잘림. 시간208/user200/role96/action200, detail가변과 table최소폭1100 및기존표내스크롤을 권장. 장문user/action/detail은줄바꿈·행높이유연화. formatter/query/필터/API/DB 미변경.
4. scripts/ui-checks/shell.mjs: 관리자메뉴존재 anchor를 미구현조직관리에서 운영관리로바꾸고2미구현메뉴부재·기존권한음성검사를유지. theme.mjs: 같은2준비메뉴캡처대신부재검사, 나머지T12유지. 허용5파일(정본리스트) 밖 수정금지.

## 검증

동일3크기/양테마/사이드바접기 시작좌표·가로넘침, 시간완전표시/장문사용자ID·actionbadge·상세줄바꿈 및행높이·표내스크롤·필터/더보기, 실제admin/operator메뉴·세션원조건, 기존실적S01/S04/S20등관련검사 및T12를 확인한다. 원타임아웃유지, 실제실측과원문보존.

원활동이력positive 검증기의130/140폭잠금은 사용자새폭요청으로 대체되는 이전수용기준이다. 과거정본은 보존하고 새치수/값가독성검문을 후속근거로 명시, 바뀐화면에서 옛폭검사통과를 주장하지않는다. 서버/금액/이력/권한/원봉인검증기 변경하지않는다.

초기read-only reviewer loader가 stdin문자열의 import까지바꿔실패했다. 변환을 실제top-level import문만으로좁힌 후 동일앱12상태를확인했다. 실패TEMP shiftmgmt-layout-review-before-v1 보존, 성공before-v2 보존. 제품실패로분류하지않는다.

이전 HANDOFF Log/20261104_235417_before-menu-layout-review.md / 1413bytes / SHA256 2DF18397B735863D30722C20D9546A7123AC7F170BD6B61A0A5168B444AE6844 byte동일 보존. 구현/새후보검증/사용자후보승인/commit/push/운영배포는 아직없다.
