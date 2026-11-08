# HANDOFF — CALC-LOGIC-FIX-01 현재 검증 결과·최소 범위 추가 승인 대기

Sol 직접 구현, Gemini 최초0·재시도0·누적0. Task는 IN_PROGRESS, 기술 수용 전이다. 제품537개 중24개 변경·기존513개 바이트 보존. 현재 제품 후보 ead161cfdafcba840ef7274153f327b361972f11, tree 55c78aafdaa4c8b917b22af73a4a1b198e9af956. 이번Task 원격push/새ZIP/새draft/공개/실제PC설치 미실행. 근거 C:\Users\hacke\AppData\Local\Temp\shiftmgmt-calc-fix-GZlvE2.

근무일 기간 요율(과거 종료 이력 포함, 미래/초안/공백 대체 없음), 앞뒤 요율 기간 경계, 정확한 십진 올림, 공휴일 추가 연장 지급/0원 승인 차단, 저장 요율 미리보기, 재시작 시 승인·계산 원문 보호를 구현했다. 요율 UI는 현재/예정/종료 표시와 과거 중복 오류에서도 편집 진입을 제공한다. 운영 배율을 임의로 바꾸지 않았고 일반 토·일은 현재 공휴일 목록 기준을 유지한다.

실제 집중35시험/5파일 및101시험/5파일 통과(겹치는 파일 있으므로 합산하지 않음). 최종 소스의 Excel 검문19: 두 양식 실제 생성/회수→접수→승인→검토→XLSX3종에서15510원/A4; 휴일0원 거절 후 시험용2/2.5배144525원; 실적별251+251=502원; 기존 승인0/15511원과 원문은 요율 변경·재읽기·재개방 후 그대로. 실제 Chrome5검문·캡처7: 두 테마, 0원 안내, 요율 화면 수정 후 승인, 서버 실제 재시작 보존, 과거 중복을 초안으로 정리해도 금융 이력 유지. 기존 운영driver S07/S08, 실적driver S01/S05/S09 통과.

최종 release:check **1회, 실패 보존**: 단위1573/1574,159/160파일 통과,508.83초. 실패1은 boramae-holiday-weekday-diagnosis.test.ts:221의 옛 ‘휴일 연장0원 성공’ 기대값이다. 승인된 새 규칙에 따라 서비스가 ALLOWANCE_RATE_ZERO_AMOUNT로 차단하는 것이 실제 결과다. 타입/규칙0오류(기존경고3)/빌드/지도259/module89 통과. 전체 성공으로 보고하거나 재실행하지 않았다. raw C:\Users\hacke\AppData\Local\Temp\shiftmgmt-calc-fix-GZlvE2/full-final. 현재 실행 중인 테스트/서버는 없다(이 Task가 띄운 것만 종료). 실제 사용자 서버는 건드리지 않았다.

## 사용자에게 요청한 최소3개 추가 파일 — 승인 전 미수정

AGENTS.md:43: “add new scope only after explicit user authorization.” 현재28제품경로 밖이므로 허용 목록을 자동 확장하지 않았다. 앞선2파일 질문은 아래3파일 요청으로 정리했다.

1. scripts/package-windows.mjs: 기존 src/renderer/assets/brand-logo-clean.png를 ZIP의 dist/assets/brand-logo-clean.png에 포함하는 한 줄. 기존1.0.1 TEMP 설치본에서 로고해석null, 실제 Excel 접수→승인/수당검토 후3종출력 ALLOWANCE_DOCUMENT_EXPORT_FAILED를 재현했다. 기존ZIP/설치자료 수정0. 이는 새 패키지의 문서 출력에 필요한 기존자산 포함이다.
2. scripts/release-install-smoke.mjs: 설치된 Node/제품코드로 로고 해석을 실제 검사하는1검문을 기존16개에 추가한다. 설치 대상 실제PC는 사용하지 않는다.
3. src/main/services/boramae-holiday-weekday-diagnosis.test.ts: 0원성공 기대를 ‘0원계산거절·저장없음→시험용휴일요율 설정→156000원’으로 바꾸되 업무분류/480분/기존승인보존 검문을 유지한다. 지급 차단 코드를 약화하지 않는다.

구체 패치 C:\Users\hacke\AppData\Local\Temp\shiftmgmt-calc-fix-GZlvE2\proposed-three-file-scope.patch. 실제누락 C:\Users\hacke\AppData\Local\Temp\shiftmgmt-calc-fix-GZlvE2\package-logo-gap.json, 실제설치본출력실패 installed-document-export-gap.json. 현재3파일 사용자 승인 답변 대기다. 기존Task/defectID와 Gemini횟수를 유지한다.

## 다음 응답이3파일 승인이면 이어서 실행

현재 HANDOFF 바이트를 새 Log로 보존 후 같은 Task allowlist에 위3개만 추가하고 파생 TODO hash를 맞춘다. 제안 패치를 적용해 진단파일 집중 재현/정상 시험과 package 구문 검사를 먼저 한다. 제품 후보를 새로 커밋하고 전체 검사를 새 출력 폴더 full-final-02에 실행한다. 첫 전체 실패/원문을 덮어쓰지 말고 누적2회로 기록한다. 전체 성공 뒤 실제 새1.0.2 ZIP/포함Node/고정lock/라이선스/무결성, TEMP 설치17검문과 설치본 실제 신규 계산·문서3종을 확인한다. 기존권한 안에서main·source 미러 비강제push와새draft6첨부·재다운로드해시까지 준비한다. 공개/실제PC설치는 별도다.

현재 J run f400b469-fdb8-4b4f-95d0-3c9982e814a5. .jh-artifacts/calc-fix-path.json에 후보/증거경로가 있다. full1이 생성한 ignored 시험파일29개는 J의10001파일 cap 때문에 TEMP retained-suite-1-artifacts로 원본 SHA/bytes 확인 후 보존했다. retained-suite-1-before.json/retained-suite-1.json이 이동영수증이며 실패 검증을 성공으로 바꾸는 조치가 아니다. 기존Log/report/실자료/이전ZIP은 보존. 전체2가 끝나면 새29개 등 당회 생성물만 새 receipt로 보존하고 J최종검증을 한다.

이전 HANDOFF 원문 Log/20261108_010911_calculation-fix-scope-pending.md, 1037bytes / SHA256 52B76606E3D6521FDF45579A31271904D6695ECF4DC1A2B683517BB49204190F, 바이트동일. 현재평가 current-assessment.json. Skill/산술 독립검토는 조회·정적평가와 실제시험을 구분한다. 수용완료·배포완료 선언 금지.
