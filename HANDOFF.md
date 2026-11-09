# HANDOFF — 1.0.4 정식 릴리즈·익명 다운로드 검증 완료

사용자지시 1.0.4 EXE릴리즈와바로가기실행시자동업데이트구현을완료했다. REL-1.0.4 기술/배포완료,다음REL-03은사용자새PC설치/실제운영JSON검수대기다. Sol직접/Gemini최초0·재시도0·누적0. 운영자료/사용자PC를이환경에서이관했다고말하지않는다.

## 사용자 파일과 순서

- 릴리즈 https://github.com/Cnthoth-Plus-Projects/Shiftmgmt_Renewal/releases/tag/v1.0.4
- EXE https://github.com/Cnthoth-Plus-Projects/Shiftmgmt_Renewal/releases/download/v1.0.4/ShiftMgmt-1.0.4-Setup-x64.exe, 54077372bytes, SHA256 be9bb6843b5d8f6d504ea50eb4135c73e7485f24a13b4b69dc98ad58394339cb.
- 최초1.0.4 설치후바탕화면바로가기로실행한다. admin/1234로처음로그인해비밀번호변경. 운영관리→설정→백업·복원에서구판0.5.8 JSON복사본선택→요구조건검사→미리보기→‘교체’로복원한다. 복원후계정도구판계정이므로기존운영PC의아이디/비밀번호를사용한다.
- 인력/근무지/시급이력/근무표/승인건수·월별수당합계를원본과대조하고재시작한다. 과거Excel은JSON에없으므로승인완료폴더의연도/월구조로별도복사(수정시각보존),실적관리‘승인완료보관본’/근무월·근무일/원본열기를확인한다. 실제Excel앱실행은사용자가확인한다. JSON과업무원본은보존한다.
- 이후호환되는새정식버전은같은바로가기실행시확인/다운로드/검증한다. 실행중업데이트없음,별도버전사본의정상시작후활성화. 통신/검증/시작실패는기존판으로실행하고자료는같은폴더를쓴다. 데이터구조가바뀌는버전은자동적용하지않고별도안내를따른다. HTML단독실행은업데이트진입점이아니다.

## 소스·파일 바인딩

main앱소스 6f5614bd5149f4e624527eafdf08255ee0468843, 제품트리 78d6a90ae2c26cb058f1266332e3ac028a8909cf, 고정candidateHash C1D9E9C7760FA1EE6346746033AA49181E2C9768385B1A88202135E937471B5A. 태그 v1.0.4는이소스에고정. 제품542개중이번허용10변경/532바이트보존,앞선이관14수정도그대로포함. 허용 VERSION/package.json/package-lock.json/README.md/docs/fresh-install.md/docs/release-1.0.4.md/scripts/lib/installed-update.mjs/scripts/start-installed.mjs/scripts/package-windows.mjs/src/main/services/windows-release.test.ts. 의존성/산식/스키마/실운영자료변경0. lock은root버전2곳만수정. 기존1.0.3 태그/10첨부 ID·크기·해시보존.

ZIP SHA 4fd3c9a637a8035a26659e5afaa1e605b0eaa04ca9fa898173e1ecc69cc9baa4,2684파일. EXE는같은ZIPpayload/manifest와고정Inno6.7.4 compiler원문SHA/126개이상도구파일지문을확인해빌드. 설치전후동일manifest SHA와모듈을대조했다. 앱소스와설치도구소스는같은commit이다. 자동업데이트신뢰경계는고정공식repo HTTPS/정식버전·정확한자산이름·GitHub API digest·전체manifest/소스SHA/동일DB계약이다. 구판원본/금융스냅샷삭제나자동재승인은없다.

## 새 실행 검증

- 정식clean checkout에서release:check9개 PASS,새전체1653/160 PASS1회494191ms(테스트477.33s),추가전체0. 집중40/2,기존lint경고3/지도261/서비스89/정식빌드PASS. 새자동업데이트29회귀. 기본검증기수용과대표실제실행후긴전체를돌렸다.
- 실제EXE설치/Chrome첫로그인/강제변경/재시작/중복·기존자료보호17,설치본계산·내장양식1/2·A4문서35,제거·자료보존6 PASS. 실제운영자료0인TEMP설치이며레지스트리/바로가기까지정리했다. 고정설치파일코드서명은없다.
- 설치본모듈로0.5.8 native JSON39표218행을무편집복원,38업무표원문비교·JSON3왕복·교체전자동백업실제복구 PASS. 실제Chrome복원7묶음,근무일/원본연결6묶음 PASS. 구경로없는조건에서동일승인ID file_path만바꾸고실적/승인/계산/계산항목/수당승인/시급감사6표및메타다른필드보존. 승인3건466050원전후동일. 구판계정재로그인/재시작/원본JSON·ExcelSHA/페이지오류0/정상종료확인. OS openPath경계를캡처했으며Excel프로세스자체는실행하지않았다.
- 실제런처/Windows ZIP리더로오프라인기본판→시험용5정상전환→오프라인캐시→시험용6실패시이전정상판→실패판재시도차단→손상캐시기본판복귀,원본앱·금융6표보존까지7묶음 PASS. 시험용1.0.5/6은로컬feed fixture이며실제GitHub에공개하지않았다. DB롤백은하지않는다.
- Git main/새태그atomic push,11개첨부draft검증후정식·Latest공개. 로그인없이11개HTTP200/크기/SHA다운로드대조PASS. 구1.0.3은보존했다. 공개검증JSON에는로컬경로/비밀번호/운영자료를넣지않았다.

## 실패·보정 기록

실제Compress-Archive 역슬래시를과도거절하던제품결함은경로정규화후이탈/예약장치명검문을유지하며회귀추가,최종전체전에수정했다. 제어/환경보정:Windows --import file URL,lock의제3의존성버전보호,map의빌드선행,과거mixed-EOL의clone복원/정본LF동등성. UI두driver출력파일충돌은6검문원문을새이름에복사보존하고같은EXE를새TEMP에실설치해7검문만새로확보후제거했다. draft태그API404는릴리즈목록/ID로조회해그대로11첨부검증후공개했고재생성/덮어쓰기없다. 원실패/후속근거보존,검문완화없음. 일부긴작성구간60초보고목표초과가있었고한도중단후재개했다. 전체반복은0이다.

## 증거·다음

증거 C:\Users\hacke\AppData\Local\Temp\shiftmgmt-release-104-6iYE9F: assessment.json,candidate-source.json,checkout-byte-equivalence.json,release-check/원로그,auto-update-runtime.json,installed-fingerprint.json,installed-native-verifier.json,installed-json-chrome.json,installed-files-chrome.json,installed-probes-*/results.json,uninstall-verification.json,public-assets.json,published-release.json,anonymous-verification.json. R10401~07 모두PASS. 실제운영JSON/대상PC설치검수는아직미실시이며사용자진행.

원문HANDOFF는 Log/20261109_031133_before-release-104.md(6560bytes/SHA E477C49970C95C71D3E10317651BBA65FEC1EE235EBCDD99DEF26B30F6A56E10),스코프전정본 Log/20261109_031444_before-release-104-auto-update.md,이번수신정본 Log/20261109_045346_before-release-104-result.md(3596bytes/SHA C1DE729AD39A543F86F4F0C5A27ACC74A156942F0C93FF01977C72C32395D89B)로append-only보존. J run994d24c1-0503-4723-a16a-efa9a4b58803,guided Skill/P16 적용. root역사파일상한으로 --project ShiftMgmt_V4 를명시,최종검증은rootTODO/장부/HANDOFF/archive·GitHub/자산/SHA까지별도대조한다. 정책/Skill적용은Agent실행기록이며OS강제관측으로표현하지않는다.
