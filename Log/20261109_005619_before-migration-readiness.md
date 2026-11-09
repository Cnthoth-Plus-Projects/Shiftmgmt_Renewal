# HANDOFF — REL-EXE-01 완료

사용자 요청에 따라 Windows 64비트 EXE 설치 파일을 생성하고 기존 정식1.0.3 릴리즈에 추가했다. Sol직접/Gemini 최초0·재시도0·누적0. 구현·기술검수·공개다운로드 검증 완료, 실제 새PC설치/업무운영은 사용자 진행 대기(REL-03). 초기1~2h 추정, 현재 약37분.

## 사용자 확인 결과물

- 설치파일: https://github.com/Cnthoth-Plus-Projects/Shiftmgmt_Renewal/releases/download/v1.0.3/ShiftMgmt-1.0.3-Setup-x64.exe
- 릴리즈: https://github.com/Cnthoth-Plus-Projects/Shiftmgmt_Renewal/releases/tag/v1.0.3
- EXE 실행 → 마법사 설치 → 바탕화면 ‘교대근무관리 시스템’. Node 포함, Chrome 필요. 첫 admin/1234 로그인 후 비밀번호 변경 강제.
- 기본 프로그램 위치 LocalAppData\Programs\ShiftMgmt_V4, 업무자료 LocalAppData\ShiftMgmt_V4. 관리자권한 불필요. Windows 설치된앱에서제거하되 DB와모르는사용자파일은보존. 기존프로그램/자료/바로가기/설치소유정보 충돌시설치전거절. 실행중제거차단.
- EXE는코드서명없음(NotSigned): Windows게시자확인안내가나올수있음. 공식컴파일러의Valid서명과생성EXE서명을구별한다. 별도 INSTALLER_SHA256SUMS.txt 제공.

## 소스·빌드·보존

- 앱 소스 ceb66933c1af03a9331e611d254384aa6452c9b4/tree 5990bbc2c44a777a0ed677b71fe598d950dc7e9f. 기존 ZIP SHA256 40274eeacf935f9bc2e99b6bde241ff60d26073c48148a837bad41ec65295f03; 동일2683파일을설치한다. 앱재컴파일/런타임/산식/승인원문/DB스키마/의존성/V3변경0.
- 설치도구소스 8d86d02c125584cf196b093ce00113872fe5e01b/제품tree ad60e20f5542f2a8a8d0cf833f052326073bedd2. 제품540파일중허용7경로만변경(기존5·새2), 기존533파일바이트보존. main과 source/shiftmgmt-v4 비강제push완료. v1.0.3태그는기존앱커밋그대로.
- EXE 54067890bytes/SHA256 cbb0d4ff2f3957db64f7781cc49e980a1d0826e9bfc1edd808cc5d7a510cf52c. INSTALLER_BUILD_RECEIPT.json은앱/설치도구커밋과compiler/ZIP/EXE를각각고정한다.
- 공식 Inno Setup6.7.4 고정SHA/Authenticode Valid(Pyrsys B.V.)확인후TEMP portable모드사용,119도구파일해시확인. P15는외부도구출처에적용. npm/runtime의존성추가0.
- 기존정식6첨부 ID/bytes/digest와ZIP/태그보존. 새EXE·INSTALLER_SHA256SUMS·INSTALLER_BUILD_RECEIPT·VERIFICATION_EXE_INSTALL 총4첨부추가, 전체10첨부. 로그인없는실제다운로드4개 bytes/SHA일치.

## 검증 결과

| 검문 | 결과 | 실제 근거 |
|---|---|---|
| EXE01 | PASS | 공식compiler SHA/Valid서명·119파일·동일ZIP/payload |
| EXE02 | PASS | 실제PE1.0.3·최종빌드·wrapper/app별도binding, syntax2개·지도261 |
| EXE03 | PASS | 실제EXE설치17검문: 한글/공백·충돌/중복·Node/Chrome·첫로그인/강제변경·종료/재실행. 변조ZIP음성만기존PowerShell설치기경로 |
| EXE04 | PASS | 실제마법사5화면/취소후쓰기없음·설치파일/등록대조, 제거6검문(실행중/접근거부차단·자료/사용자파일보존·기존시작메뉴충돌거절) |
| EXE05 | PASS | 설치본Node24.19에서새계산/실제Excel승인/A4품의서·별첨1·별첨2 35검문 |
| EXE06 | PASS | 정식/Latest·태그Ceb보존, 기존6첨부보존+추가4첨부익명실다운로드해시일치 |

기존전체1598시험/160파일은변하지않은앱payload와이전원문근거를재판독한것이며이번새전체실행은0회. 새EXE17/설치본35/제거6/마법사검증은실제실행이다. GUI API행동자체는unasserted이며후속페이지/파일/레지스트리와화면캡처로독립확인했다. TEMP설치본은검증후제거했고자료보존시험DB/사용자파일은전용TEMP에유지했다.

실제빌드5회: 최초IntToHex미지원컴파일실패수정,독립검토후시작메뉴충돌/OpenProcess접근거부보강,CreateAppDir=no의app경로해석문제로실제설치가안전거절되어yes수정,DLLGetLastError사용으로정확오류보존후최종빌드통과. 초기실패/후속근거를보존했다. 검증기compiler판번호판독/PowerShell레지스트리문자열보정은제품결함과구분했고중복전체앱시험대신최소증거/실제경로검증으로전략재검토했다.

최종전략은잠긴앱ZIP을재사용하고설치경로를새실행검증,이후저장증거/소스/공개첨부를최종재판독한다. 증거 C:\Users\hacke\AppData\Local\Temp\shiftmgmt-exe-8uhrjP. build-05, publish-preflight.json, public-exe-verification.json, gui-verification.json, uninstall-verification.json과실제설치/계산원문. 공개첨부에는TEMP경로/DB/계정비밀/원본개인자료를넣지않았다. J run a21693fb-dd6b-48e2-98e0-f3df951418ec, guided Skill적용/분석→계획→구현→검증→인계기록. final 검증은 RECORDED_EVIDENCE_REVALIDATION_WITH_FRESH_PUBLIC_READ 로구분한다.

수신HANDOFF Log/20261108_170342_before-exe-installer-result.md,2100bytes/SHA256 0B815E84724D0E846B13F500690CA12999E504CB178BB7D10FA0985A73C5B2C4 바이트동일보존. 다음은사용자가새PC에이EXE를설치하고첫로그인/버전/자료위치및실제운영을확인하는REL-03이다.
