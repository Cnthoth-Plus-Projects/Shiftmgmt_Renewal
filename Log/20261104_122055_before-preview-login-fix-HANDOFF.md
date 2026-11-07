# HANDOFF — UI-ADMIN-02-HOLIDAYS 카테고리·버튼·사용 안내 적용 완료

- Task: UI-ADMIN-02-HOLIDAYS / Parent: UI-ADMIN-REFINE
- Action: REVIEW_RESULT / USER_ACTUAL_SCREEN_REVIEW_PENDING
- Recorded: 2026-11-04T12:05:49.461Z
- 판정: 승인 시안의 실제 공휴일 화면 구현·기술검수 완료. 시안 사용자 확인과 최종 실제 제품 화면 확인을 구분한다.
- 구현 담당 Sol(같은Task 상시승계); Gemini 최초1/재시도1/누적2, 추가 요청0. 최초·재시도 실패 이력은 이전 판정에 그대로 보존한다.
- 정본: .ai/reports/holidays-20261104/visual-refinement-20261104/assessment.json / 9780 bytes / SHA256 F2DB7C570AE060BA06415A7E7E9CC0AB38C7DD6CA20D02D583F6D01B8D4DD7C5
- 변경4파일: docs/codebase-map.md, scripts/ui-checks/operations.mjs, src/web/operations.css, src/web/screens/operations-holidays.ts. 기존 허용6·제품512·보호506 변경0.
- 저장소 main / HEAD de58fe9fe8043f5ef43819e4d2950797532501d5. commit/push/배포0.

## 사용자 확인 화면과 사용법

**실제 화면 http://127.0.0.1:19240/** — Chrome native 창을 열어 두었다. TEMP 테스트 자료이며 운영 공휴일 자료가 아니다.

1. ‘등록 공휴일’에서 대상 연도·검색·구분·페이지를 선택하고 행을 눌러 상세를 확인한다. 직접 추가/명칭 수정/삭제 버튼을 사용한다.
2. ‘외부 공휴일 연동’은 대상 연도 확인 → 불러와 비교 → 확인 후 교체의3단계다. 카테고리 이동·불러오기·비교는 저장하지 않는다.
3. 비교창에서 추가/제외/변경/동일과 페이지를 확인하고 ‘이 목록으로 교체’를 눌렀을 때만 선택 연도의 전체 목록을 교체한다. 수동 추가 항목도 외부 목록에 없으면 제외된다. 취소하면 기존 목록을 유지한다.
4. 불러오기 실패는 기존 자료를 유지한다. 인터넷 연결과 설정 → 시스템·감시의 공휴일 연동 주소를 확인하도록 안내했다.

- wide 좌측 카테고리/우측 콘텐츠, narrow 가로 카테고리/상세 모달. 검색·구분·페이지·선택 상태를 카테고리 전환 후 유지한다.
- 버튼: 주요34px/행28px·글꼴 통일·명시적 border/appearance·아이콘+동작 이름. 행34px 유지. 수정은 중립색, 삭제는 붉은색이며 기존 확인·잠금을 유지한다.
- 실제 두 영역 이미지: .ai/reports/holidays-20261104/visual-refinement-20261104/actual-calendar-1440.png 및 actual-import-1440.png. native929×917 원문은 .ai/reports/holidays-20261104/visual-refinement-20261104/native-ui/captures/holidays-preview.png.

## 검증 근거

| 검문 | 결과 |
|---|---|
| typecheck / lint / map | RC0 / 오류0·기존경고3 / 241경로 |
| 관련6파일 단위시험 | 74 PASS · 실패0 · skip0 · 이전74제목 보존 |
| S01/S05/S06/S19/S20 집중 실행 | 5/5 PARTIAL_PASS · 오류0 |
| 최종 새 전체 운영 UI | S01~S20 20/20 PASS · fullRun/exactScenarios=true |
| N01~N12 | 전부 true · 기존 의미 보존 |
| 새 카테고리 검문 | 키보드/검색·페이지·선택 보존/이동 API0·write0/3단계·영향 안내/버튼28px·동일글꼴 PASS |
| 기존 안전경계 | Esc/닫기 해제·늦은 오류 소유권·지문충돌 거절·세션만료·literal 문자열 PASS |
| 크기 | 929×917/1024×768/1440×900/2048×1080, 행34px·넓은 표/상세정렬0px·가로넘침0 |
| source/build | full/focused/native JS·CSS SHA 일치, 현재 TS source-map 일치, 최종 source512불변 |

실제 명령·시각·RC·해시: .ai/reports/holidays-20261104/visual-refinement-20261104/commands-v1.json, focused-v1.command.json, full-final.command.json. 집중1회 통과 뒤 최종소스에서 전체1회 실행했다. browser build/asset copy는 새로 실행했고 보호 서버 소스 불변으로 기존 server build는 재사용했다. 제품/검증기 실패0; 최초 root cwd의 typecheck ENOENT는 제품 cwd에서 올바르게 실행하여 해결했다. 전체 회귀를 그 진단에 재실행하지 않았다.

## 보존·후속 상태

- 구현 전 받은 핸드오프: Log/20261104_115548_before-holiday-visual-implementation.md. 이번 구현 중 제어문서도 Log/20261104_120549_before-holiday-visual-final-HANDOFF.md / 923bytes / SHA256 81F13876744023A01D4055A8F09C4849A1C03120FC3B673460B006F24EA2C212로 보존했다. Log는 수정하지 않는다.
- 기존 최초/재시도 원문·실패판정·기능수용은 .ai/reports/holidays-20261104/review-retry1-20261104_195159/sol-assessment.json 및 그 안의 참조로 보존한다.
- backend/API/DB/계산/의존성/공용제어 변경0. 지문 재조회는 클라이언트 적용 직전 검사이며 서버 원자성을 새로 보장하지 않는다.
- 현재 실제화면 사용자 확인 대기. 다른 탭은 승인된 카테고리·버튼·쉬운 안내 기준으로 기존 순서에서 진행하며 이번에 구현한 것으로 표시하지 않는다. 다음 대상은 요율이며 아직 착수하지 않았다.
- preview runner 30940, server 27372; data C:\Users\hacke\AppData\Local\Temp\shiftmgmt-ops-data-6bfc08c04c; resources C:\Users\hacke\AppData\Local\Temp\shiftmgmt-ops-res-ee886ad866. 종료 필요 시 해당 runner 명령이 operations.mjs --preview --port=19240인지 먼저 확인하고 그 트리만 taskkill /PID 30940 /T /F 한다. 다른 preview는 건드리지 않는다.
- 새 창 재생성: product cwd에서 node scripts/ui-checks/operations.mjs --preview --port=19240 --out=C:/Users/hacke/AppData/Local/Temp/shiftmgmt-holiday-preview-new (실행 중이면 중복실행 금지).
