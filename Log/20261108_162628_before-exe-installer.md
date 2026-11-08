# HANDOFF — REL-03 정식1.0.3 공개·다운로드 검증 완료

사용자 “새 PC설치는 릴리즈를 해야 새로운 PC에서 해당 릴리즈 버전을 다운받아서 설치해서 사용을해야지.”에 따라 정식공개를 완료했다. Sol 직접/Gemini 최초0·재시도0·누적0. 실제 새PC는 사용자가 공개릴리즈에서 내려받아 설치한다. 이 환경에서 실제대상PC설치는미실행이며 REL-03 전체상태는 WAITING_USER_INSTALL이다.

## 새 PC에서 할 일

1. Google Chrome이 있는 Windows64비트PC에서 https://github.com/Cnthoth-Plus-Projects/Shiftmgmt_Renewal/releases/tag/v1.0.3 를 연다. GitHub 로그인은 필요 없다.
2. ShiftMgmt-1.0.3-win-x64.zip 및 SHA256SUMS.txt를 내려받는다. 직접 ZIP https://github.com/Cnthoth-Plus-Projects/Shiftmgmt_Renewal/releases/download/v1.0.3/ShiftMgmt-1.0.3-win-x64.zip
3. ZIP을 모두 압축해제하고 INSTALL.cmd를 실행한다. 바탕화면에생긴 교대근무관리시스템 바로가기로실행한다. Node는포함되어있다.
4. 실행창의초기로그인정보로첫로그인후비밀번호를변경한다. 운영관리에서공휴일/실제요율/자료폴더와계정을확인한다. 기존자료/프로그램이있으면설치를중단하는기존보호를유지한다.

## 공개 검증

- 정식페이지 https://github.com/Cnthoth-Plus-Projects/Shiftmgmt_Renewal/releases/tag/v1.0.3, 공개시각 2026-11-08T12:01:51Z, draft=false·prerelease=false·Latest.
- 태그 v1.0.3 → ceb66933c1af03a9331e611d254384aa6452c9b4, 제품tree 5990bbc2c44a777a0ed677b71fe598d950dc7e9f. 검증했던소스/ZIP/6첨부를그대로사용했다.
- ZIP 58939806bytes, SHA256 40274eeacf935f9bc2e99b6bde241ff60d26073c48148a837bad41ec65295f03. 첨부ID/bytes/SHA 보존. 로그인/Authorization/Cookie 없는실제다운로드6개가전부일치했다.
- 기존전체1598/160·설치17·설치본계산/출력35는소스538파일/ZIP지문으로재확인한이전실행근거다. 이번에새전체시험/빌드/재패키징은하지않았다.

| 검문 | 결과 | 근거 |
|---|---|---|
| PUB01 | PASS | 제품538파일·tree/ZIP/SHA 동일, 기존1598/160·설치17·설치본35 검증근거 재판독 통과; 새 전체시험/빌드 없음 |
| PUB02 | PASS | 공개 저장소·정확한 후보소스/태그·원격6첨부 ID/bytes/SHA 동일, 새PC 설치 순서와 직접 다운로드 문안 반영 |
| PUB03 | PASS | 1.0.3 정식공개·prerelease=false·Latest, v1.0.3 태그가 검증후보 ceb66933c1af03a9331e611d254384aa6452c9b4 지칭 |
| PUB04 | PASS | GitHub 로그인/Authorization/Cookie 없이 공개페이지200·API/최신/태그 확인, 첨부6개 실제다운로드 bytes/SHA 일치 |

기존1.0.0~1.0.2 초안/첨부·1.0.3 첨부6개·운영DB/V3/정책/승인원문은변경하지않았다. 공개설명만새PC설치순서와정식공개표기로정리했다. 첨부 VERIFICATION_RELEASE.json의 publicReleasePublished=false는게시전검증시점기록으로그대로보존한다. 현재공개상태는위공개검증과REL-03장부가정본이다.

제품수정0. 제어문서 TODO/장부/HANDOFF와새Log만갱신·push한다. 증거 C:\Users\hacke\AppData\Local\Temp\shiftmgmt-publish-wM2w9T, preflight.json/published.json/public-verification.json 및 익명다운로드원본6개. 현재J run7b7fa1eb-11bf-4838-831b-d680ece52a6f, 최종검문은저장된다운로드증거/현재소스·원격공개상태대조다. Guided Skill·P07을적용했고조회/Agent기록과실제원격검증을구별한다.

수신HANDOFF Log/20261108_120420_before-release-publication-result.md, 1408bytes/SHA256 26FDAF19E30D74F197DB43E3683A1B382686592109D8196D326D82031910BA12 바이트동일보존. 정식공개는완료, 실제새PC설치/업무운영확인은사용자진행대기다.
