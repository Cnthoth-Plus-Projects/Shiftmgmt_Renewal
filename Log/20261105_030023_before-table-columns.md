# HANDOFF — 인력 관리 가로스크롤 제거 기술검수 완료

동일 UI-NAV-LAYOUT-REFINE의사용자후속지시로 Sol직접구현, Gemini0/0/0 유지. 사용자확인대기. 정본 .ai/reports/menu-layout-20261105/workforce-fit/assessment.json / 6070bytes / SHA256 49E4B03B5FC2357A1461805C88475B95D1B1AF2F9F8B23D9571A75CBAE06C602.

## 적용

- 원11열 모두유지, 고정픽셀폭/최소1002px를비율폭과줄바꿈으로변경. 폰트12px와공통시작선/검색규격유지.
-1250px이하목록전체폭, 행클릭/Enter로기존상세를native모달표시. Esc/닫기·초점복귀/리사이즈원상세복구·기존수정창연결. 넓은창우측상세유지.
-행높이기반페이지를모든폭에서측정, 필터별초기화/동기행높이반영/새페이지선택앵커로누락·중복방지.
-제품3파일: workspace.css, screens/workforce.ts, screens/workforce-list.ts. 총517/다른514byte동일. Task누적허용13/보호504. 업무/API/DB/계산·권한·저장로직보존.

## 검증

4폭1024/1440/1707/1920×2높이825/900×2모드×사이드바2=32실제화면, 11열/전체셀/표/본문가로넘침0·페이지보임. 장문이름/연락처/이메일4사례·원문HTML이스케이프, 키보드/초점/기존수정창/크기변경/필터/페이지/접기 PASS. .ai/reports/menu-layout-20261105/workforce-fit/matrix/workforce-fit.json.

기존인력S01~S05집중검사: S02의고정10명1페이지기대1곳만가변행후속검사로대체한격리runtime에서5 PASS. 전체21 신규실행주장없음.21명순회중복/누락검사는그대로, 추가로필터10명모두1회·유형일치·각페이지뷰포트맞춤검사. 옛고정검사실패와원본검사파일보존. 최초좁은폭10명fallback/비동기페이지범위변경을실제원인대로수정했고같은가정으로무변경전체반복안함. 새원테마T01~T12 PASS, 타입2/lint/자산 PASS(기존경고3), 실제제공app/workspaceCSS/index byte대조. 최종 .ai/reports/menu-layout-20261105/workforce-fit/source-final.json.

## 확인

http://127.0.0.1:19284/?developmentPreview=1 실제Chrome최대화·인력관리자료표시·격리TEMP시험자료, native 1707×825. .ai/reports/menu-layout-20261105/workforce-fit/native/captures/native-workforce-fit.png. 다음양식Task/commit/push/운영적용0.

교체전 Log/20261105_021701_before-workforce-fit-result.md / 687bytes / SHA256 641618915FB9B7259370A73D1A10164A05C6E24BAA254FE75EAAFF44257F078D byte동일보존.
