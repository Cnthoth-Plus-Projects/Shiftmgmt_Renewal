# HANDOFF — MIGRATION-READINESS-01 준비·사전검증 완료 / 실제 이관 NOT_READY

사용자: 기존 https://github.com/hacker943410-debug/ShiftMS 를리뉴얼한새시스템으로새PC에서JSON이관예정,레고처럼기술적연결이맞는지최종시험준비요청. 이PC에는구판미설치,사용자가기준버전0.5.8로정정/릴리즈화면확인. Sol직접/Gemini 최초0·재시도0·누적0. 제품수정/배포/실제PC교체는하지않았다. 이번검토/준비Task는완료했지만현재그대로이관하면안된다.

## 고정 입력과 결과

- 원본 v0.5.8 → e390e4ca741b767e871cd10e397132b3eb441933. https://github.com/hacker943410-debug/ShiftMS/releases/tag/v0.5.8 의manifest공개첨부SHA/태그/패키지0.5.8대조. main의0.4.24는초기탐색이며이관판정에사용하지않았다.
- 원본코드/양식9개를전용TEMP에체크아웃하고실제백업서비스를실행. 빈DB표구조39표확인후,실제근무표Excel생성→인테이크→승인3건·시급정정/삭제감사를수행해215행39표의진짜구판형식JSON생성. 실제운영데이터가아닌합성시험자료다.
- 대상 공개1.0.3 앱소스 ceb66933c1af03a9331e611d254384aa6452c9b4, ZIP SHA256 40274eeacf935f9bc2e99b6bde241ff60d26073c48148a837bad41ec65295f03, EXE SHA256 cbb0d4ff2f3957db64f7781cc49e980a1d0826e9bfc1edd808cc5d7a510cf52c. 원본2683파일매니페스트검증후그페이로드의서비스/포함Node24.19/브라우저번들실제서빙을사용. EXE재설치반복없이동일설치페이로드로마이그레이션경로를실행했다.

## 수정이 필요한 연결부

| ID | 심각도 | 실제 현상 | 최소 수정 방향 |
|---|---|---|---|
| MIG-01 | P1 | 구판39표JSON에없는 shift_pattern_duty_types 를40표계약의필수표로요구,요구조건/미리보기/Chrome모두거절 | 알려진0.5.8형식의버전별어댑터. 새표만빈영역으로보완하고진짜원본누락/미인지표/컬럼검증은유지 |
| MIG-02 | P1 | 첫차이만격리하면구판이정상생성하는 wage_rate_reparse_marker 를알수없는설정으로거절 | 구판5종marker/progress쌍을정확히분류. 미승인재분석을안전하게유도하고승인/감사원문은보존. 임의키전체무시금지 |
| MIG-03 | P1 | 새설치→로그인/비밀번호변경→설정저장전즉시백업은성공표시하지만자체복원검사에서필수6업무정책누락으로거절. 새대상의교체전자동백업도같은문제 | 백업스냅샷에실효기본6정책을일관되게포함/검증. 검사약화없이즉시백업및교체전백업의실제복구까지보장 |
| MIG-04 | 절차공백 | JSON은DB만포함. 실적파일1행의구판절대경로가새대상밖에그대로남고원본Excel/외부첨부자체는복사되지않음 | JSON은DB운반형식유지,증적파일목록/해시/별도이동/새PC연결·중복방지와미존재안내를함께준비 |

구판임시표식은 substitute-policy / employee-master / team-work-type / monthly-schedule / wage-rate 의marker+progress5쌍이다. 현재허용키에는substitute-policy marker만있다. wage_rate표식은실제재현했고나머지는원본선언과허용목록대조근거다. 사용자가JSON을손으로고치도록안내하면안된다.

## 실제 실행과 한계

- 원본그대로의JSON은1.0.3에서거절됐다. 원본SHA불변·대상업무자료불변. 정상호환성PASS가아니다.
- 진단용별도사본에서만빈신규표추가+알려진시급표식1개제거후후속경로를격리했다. 이사본은승인된운영이관방식이아니다.
- 이진단복원에서PC설정표를제외한원본38표가행/모든필드정규화해시일치(새선택컬럼4개만NULL보완). 승인/계산/항목/시급삭제감사원문일치,승인3건총466050원·2026-03월합계동일. 실제기존operator계정비밀번호로그인성공(비밀은기록안함). 새PC경로유지·6업무정책원본값유지·교체전자동백업생성.
- 새JSON3/43표로다시백업→실제복원후금융4표원문동일,소비한토큰재사용거절. 실제시작보강/복구서비스실행에서도수정0·합계466050원,기존A/B/C코드패턴과월근무표조회성공.
- 별도DB사본에서명시적합성수당검토후품의서/별첨1/별첨2 실제Excel생성,각합계466050원·모든시트A4. 원래이관검증DB는변경하지않았다.
- 새관련시험77개/5파일전부통과,30.328초. 사전대표1시험은77개에포함되므로합산하지않는다. 전체앱시험재실행0. 기존시험은새V4백업/동일스키마수정위주여서원본0.5.8 producer연계와첫설치백업공백을놓쳤다.
- 포함Node+실제Chrome에서신규로그인/강제비밀번호변경·실제백업·구판JSON거절2개를확인,페이지오류0·실행버튼미노출·서버정상종료. UI원driver는후단검증의‘직원0명’오가정으로RC1. **원RC1을PASS로바꾸지않고보존**했다. 검사전실제백업에는기본직원3명이있었으며후단6업무표해시가그백업과일치함을별도 RECORDED_ACTUAL_UI_EVIDENCE_REVALIDATION_WITH_FRESH_READONLY_DB_CHECK 로판독해수용했다. 새브라우저전체성공으로보고하지않는다.
- 앞선fixture실패는원본양식누락(정확태그양식9개확보),구판정정감사오가정(실제삭제API로감사생성),health응답envelope/알림DOM선택오류로분리했다. 문서시험의최초로고오류는driver작업폴더가실제바로가기와달랐기때문이며,제품수정없이페이로드작업폴더로실행해3문서통과. 실패원문/전략재검토/후속근거는TEMP에보존했다.

## 다음 패치와 최종 수용 계획

아래는제안이며제품수정승인/착수는아니다. 새Task후보 MIGRATION-COMPAT-FIX-01. 허용경로후보6개: ShiftMgmt_V4/src/main/services/database-migration-service.ts, ShiftMgmt_V4/src/main/services/database-migration-service.test.ts, ShiftMgmt_V4/src/main/services/database-backup-service.ts, ShiftMgmt_V4/src/main/services/database-backup-service.test.ts, ShiftMgmt_V4/scripts/verify-v3-json-migration.mjs, ShiftMgmt_V4/docs/fresh-install.md. 실제릴리즈버전/재패키징은수정수용후기존배포권한범위와별도로확인한다.

1. 원본39표JSON을그대로받는0.5.8버전어댑터와구판표식분류. 원본수정0,새정책컬럼만명시기본값,승인스냅샷자동재계산금지. 실제미인지표/필드/키·사업규칙누락은기존처럼거절한다.
2. 첫설치즉시JSON과교체전자동백업에실효6정책을포함. 자동백업파일실제복구를검증하고,실패시기존DB/파일/세션영향을확인한다.
3. 기존 verify-v3-json-migration.mjs 는schema1/42표하드코딩·특정무사번1행등과거fixture가정으로현재0.5.8 39표와맞지않음. 고정구판입력프로필/예상변환/표별해시/월별금액/원본SHA를입력별로독립검증하도록현재도구안에서보완한다. 새일반검증프레임워크는만들지않는다.
4. 수정후이번원본39표JSON무편집→요구조건/미리보기/Chrome실제교체→재시작→새JSON왕복→A4문서3종,표38개/승인3건466050원/감사/계정검증을그대로재실행. 기존77음성/동시성/롤백검문과필요한관련회귀.
5. 외부원본파일인벤토리·해시/새PC연결·이중가져오기차단·없는파일안내·미승인재분석과승인원문보존을실제이동사본으로검증. JSON만으로파일자체가옮겨졌다고가정하지않는다.
6. 실제운영PC0.5.8에서백업한JSON+필요한증적사본으로최종리허설. 백업시점이후구판의새승인입력을멈추고원본/총액/월별집계를보존→빈새PC설치→계정변경안내/파일연결→이관→재시작/문서/백업복구확인. 이최종실자료검증은현재미실행이다. 새JSON3를구판에되넣는롤백은지원하지않으므로구판원본DB/JSON/파일은별도보존한다.

현재MIGRATION-READINESS-01는준비/검토완료,실제이관준비완료가아니다. .ai/task-plan.json의M01~08판정과assessment.json참조. 제품540파일변경0·공개1.0.3/설치파일/원본V3/운영DB변경0,commit/push없음. 실제운영백업없음·실제대상PC교체없음. 다음승인된기존큐REL-03는사용자설치확인대기지만,구판자료이관은이문제해결전미진행한다.

증거 C:\Users\hacke\AppData\Local\Temp\shiftmgmt-json-migration-Hwt9HA. assessment.json / original-source-v0.5.8.json / consumer-preflight.json / rich-compatibility.json / diagnostic-two-fixes.json / diagnostic-startup.json / diagnostic-documents.json / focused-suite.json·receipt / actual-release-ui-revalidation.json 및원RC1/캡처. P16 full source SHA d8d0ddc0d5183461f9845f1de8257a8a31ff517b98e5ccb99e48ad14d9231132 적용,중요경계는실제운영교체미실행으로유지. J run0f5ea5af-0e8f-4710-9413-be9d071a55e8 guided analyze→plan→implement(격리시험)→verify→handoff,정책/Skill기록은Agent보고이며실행원문이독립근거다.

수신HANDOFF Log/20261109_011940_before-migration-readiness-result.md,1090bytes/SHA256 0131D59B9686278644DE00D25C050A5930D09E977C8BD4143416ECA1053DAA43 바이트동일보존.
