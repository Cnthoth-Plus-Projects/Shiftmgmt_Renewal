# HANDOFF — MIGRATION-COMPAT-FIX-01 기술검수 완료 / 승인완료 파일 흐름 계속

사용자 “오케이 작업 진행하자”에따라 MIG-01/02/03을직접구현·검증했다. Sol/Gemini최초0·재시도0·누적0. 현재다음leaf는사용자가확인한승인완료폴더원본/날짜조회흐름 MIGRATION-APPROVED-FILE-FLOW-01 이다. 전체이관/릴리즈완료를뜻하지않는다. 실제운영JSON/대상PC미제공·공개EXE아직미반영.

## 구현과 보존

- 제품540개중6개만변경,534개바이트보존. 허용6경로는Task장부동일. 산식/시급/요율·승인/계산/감사원문·스키마/의존성·V3실운영자료불변. 코드/제어문서commit/push없음.
- V1의정확한구판39표형태에만비어있는신규근무코드영역을메모리에서보완. 원본JSON무편집/SHA보존. V1 40표·V2/V3는기존계약유지,임의누락/미인지표/컬럼/키/잘못된타입은거절. 요구조건UI는실제원본39표로표시한다.
- V1 구판5종marker/progress쌍만인정,이전PC진행정보는이어쓰지않고현재지원되는미승인재분석표식으로변환/경고한다. 기존승인/계산원문은변경하지않는다.
- 백업은빠진6업무정책을실효기본값으로스냅샷에만보완한다. 저장된규칙/운영DB는덮어쓰지않아백업중지문경합검문을유지한다. 설정저장전즉시백업과교체전자동백업을실제로복원했다.
- 기존 verify-v3-json-migration.mjs 의특정인명/고정원수·42표가정을원본39/40입력기반표별모든필드·월별/상태별금액·새JSON3왕복·자동백업실제복구로교체. 원본SHA/표·행수CLI고정과3종잘못된입력실제거절검문. 무사번안전제외는검토한정확ID목록필수이며연결승인/계산/숨김이력있으면중단한다. 새일반검증프레임워크/공개API추가없음.

## 실행 근거

- 신규9회귀: 수정전4개실패·기존계약엄격음성5개통과를확인후수정. 집중86/5 PASS. 새전체1607/160 PASS,1회464.692초. 추가전체반복0. 타입/규칙기존경고3/지도261/서비스89/빌드PASS. 최초타입검사optional정책일TS2322는빈문자열기본값으로고친후PASS,원로그보존.
- 실제0.5.8 태그 e390e4ca741b767e871cd10e397132b3eb441933 producer의39표/215행미검토수당사례와39표/218행수당승인3건사례를무편집복원. 원본38업무표모든필드보존(기존허용nullable4컬럼만NULL보완),월별/상태별466050원일치. JSON3/43표백업→실제복원,초기대상의교체전백업으로실제복구까지확인. source_JSON/원본ExcelSHA불변.
- 실제Chrome7검문: 첫로그인/강제변경·설정저장전백업검사준비완료·원본39표검사/미리보기43표·취소/틀린확인문구/정확1회복원·금융5표/계정바이트보존·기존세션폐기/구판operator로그인·변경비밀번호재시작/466050원보존·페이지오류0/서버정상종료. 이번Chrome driver는신규실행RC0이다. 과거readiness의RC1재판독과구별한다.
- 소스/옛템플릿XLSX없는runtime-only환경,근무표템플릿source_path도존재하지않는값으로만든별도DB사본에서내장양식1·2실제생성. 이관된인력표시/금융5표불변. 양식2는실제2교대D/N패턴을제품API로설정했고양식1은기존3교대사용. 별도사본에서A4품의서/별첨1/별첨2 생성·각466050원확인.
- 구판sample2미승인JSON도실제로생성·복원,별도원본Excel복사/명시새로고침으로시급14100→14200원재분석/새정책스냅샷확인. 자동승인0·자동계산0. 원본JSON불변.
- fixture실패2건은3교대E를2교대양식에잘못사용한입력(제품의정상거절)과runtime-only복사에서실제패키지가포함하는로고이미지누락(ENVIRONMENT)으로분류했다. 실제패키징목록을대조해fixture만보완,제품소스/진행중전체시험변경0. 각실패/검토/후속근거보존.

## 승인완료 원본/날짜 조회 — 다음 사용자 요구

사용자: “과거 원본파일은 승인완료 폴더로 이동되어 해당 날짜를 조회 및 필터링하면 확인할 수 있어야 하는거 아니야?” 이기대가맞다. 새PC승인완료폴더의원본을이관된승인기록에서근무월/근무일로조회/필터·열기할수있어야한다. 이미승인된자료를다시승인해연결하면안된다.

현재추가시험은사본ExcelSHA일치/재승인3건 PERFORMANCE_ALREADY_APPROVED 차단/금융5표466050원보존을확인했다. 하지만새로읽은행은parsed/is_effective=0이고기존승인활성행의file_path는구PC절대경로였다. 초기보고의‘새경로행1개면재연결성공’추론을철회하고actual is_effective 원문으로후속평가를남겼다(원보고보존). **구PC원본이같은시험PC에여전히존재했던조건**이므로다음시험은구PC경로가없는진짜새PC조건을명시한다. 현재healOrphanPerformanceFiles는없어진활성원본을경고만하고재연결하지않는코드다. UI는현재근무월/근무지/승인상태필터만있고검색어에근무일도포함되지않는다.

다음허용9경로: ShiftMgmt_V4/src/main/services/performance-file-intake-service.ts, ShiftMgmt_V4/src/main/services/performance-file-intake-service.test.ts, ShiftMgmt_V4/src/main/services/performance-file-storage-service.ts, ShiftMgmt_V4/src/main/services/performance-file-storage-service.test.ts, ShiftMgmt_V4/src/web/screens/performance-model.ts, ShiftMgmt_V4/src/web/screens/performance-model.test.ts, ShiftMgmt_V4/src/web/screens/performance-view.ts, ShiftMgmt_V4/src/web/screens/performance.ts, ShiftMgmt_V4/docs/fresh-install.md. FILE01~06과제: 구경로부재재현 → 승인완료보관본의이름/월/크기/시각/전체원본행서명일치·유일성·경로안전검문 → 기존file/entry/approval ID와승인금융스냅샷을유지한원본경로연결 → 근무일달력필터/월연동 → 실제Chrome날짜조회/원본열기/모호·불일치거절 → 관련/전체검증. 폴더밖링크/접근불가/여러후보는자동선택하지않는다. 산식/스키마/공개API/의존성변경금지. 파일삭제/새승인/수당재계산으로연결하지않는다. 원본/실자료는보존하고격리사본에서검증한다.

## 증거·인계

증거 C:\Users\hacke\AppData\Local\Temp\shiftmgmt-migration-fix-l5tPUk. assessment.json, candidate-source.json(540파일SHA), repro/ focused/test-vitest 및receipt, native-verifier.json, native-approved-source.json/native-approved-verifier.json, native-pipeline.json, native-chrome.json, native-pending.json, external-file-rehearsal.json 및external-file-assessment.json. 고정candidateHash 9BE644ADA0164467FF9794A745E2267B26B2EB1F202CA9E3870F14E983172524. 원본받은HANDOFF는그대로두었다가이번결과로한번교체했고 Log/20261109_015731_before-migration-compat-fix.md,9242bytes/SHA256 31CE2AE007AADA8BF8B0EBF1D71D62130C3730FDADC7497124E93C2C9A3AD6CD 바이트동일보존.

J run ef148eea-e54c-403a-b260-4bdf549e7b9b, root역사파일10000개로기본해시상한에도달해제품폴더범위로명시실행,최종검증기가root TODO/장부/HANDOFF/archive도별도바이트/해시대조한다. P16 full SHA d8d0ddc0d5183461f9845f1de8257a8a31ff517b98e5ccb99e48ad14d9231132, guided Skill분석/계획/구현/검증/인계. 정책기록은Agent보고이고실제명령/원문근거와구별한다. 공개1.0.3/EXE는변경하지않았다. 새EXE/릴리즈·실운영JSON리허설·대상PC설치는후속이며완료주장하지않는다.
