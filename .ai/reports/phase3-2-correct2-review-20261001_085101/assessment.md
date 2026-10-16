# Phase3-2b CORRECT2 독립 검수 종결 — REPLAN

- From: Sol — 유일한 오케스트레이터
- Time: 2026-10-01 09:20:54 KST
- Action: REVIEW / REPLAN
- Verdict: CORRECT2 FAILED; 전체 수용 보류
- 회신: 불필요 — 이 검수는 종결하고 별도 IMPLEMENT 패킷으로 검증 전략을 재설계한다.
- Repository: `C:\Projects\Active\ShiftMgmt_V4` / main / `160940f9aaeb6696538447f83b44658073e382f0`
- 수신 원본: `C:\Projects\Active\교대근무관리 시스템\Log\20261001_085101_3-2b-CORRECT2-Gemini_수신원본.md` — 42,128 bytes, SHA-256 `9A3A7400E2F45F8DF73CB7777FE6A10856EAEA411B769F7AA666893C851B8987`.

## 판정

제품 화면의 기존 결함 R32C-01~05는 이번 독립 Chrome 9개 그룹 범위에서 해소됐다. R32C-06 검증기 신뢰성은 미해결이다. 두 번째이자 마지막 수정 제출이므로 PROTOCOL.md §F/111에 따라 같은 수정 패킷 재발송을 종료하고 검증 전략·파일 경계를 재설계한다. CORRECT3를 발행하지 않는다. Phase3-2 전체 완료·수용·커밋·배포를 선언하지 않는다.

## 독립 검증 결과

| 게이트 | Sol 확인 결과 |
|---|---|
| 수신/범위 | 본문 유지, 변경2, 보호336/정본14 SHA·bytes 유지, 제출9파일의 크기·해시 일치 |
| 저장소 | main HEAD 동일, dirty9, 전체338파일이 검수 전후 동일; Sol 제품 변경0 |
| 정적/관련 시험 | typecheck/syntax/lint/map87/build/diff RC0; lint 기존5경고; 관련3파일11시험 실패·skip0 |
| 제품 런타임 | 실제 Chrome154.0.8037.58, 1440×900, fonts.ready; 9/9 그룹 PASS, 예상외 오류0 |
| 화면 실측 | 정상·긴행40px, 날짜132×34, 앞4열130/140/100/160, 상세전체값/title1216, hide-approved 적색, 표 접근성 이름 정상 |
| 검색/경합 | 새 검색 중 old행0/pending1, 이전 success/auth 차단, refresh1회, invalid중 loading0, usersretry 요청1+1/native busy, 실제 Tab·Space·Enter·click 요청0 |
| 실제 권한 | operator/planner/reviewer 메뉴0·자동 list/users0·실제 cookie API 거부/data없음 |
| 전체 시험 | 133파일919시험은 Gemini 자기 보고; Sol 이번 반려에서 전체 재실행하지 않음 |
| 오류 주입 | 예상외 console1/pageerror2를 이번 검증기는 RC1/FAIL로 거부; 이전 결함 일부 해소 |
| 실측 변조 | 날짜90×24/표 이름 SOL_BAD_ACCESSIBLE_NAME을 주입했으나 RC0/PASS; 실제 값과 판정 연결 실패 재현 |

## 남은 차단 사유 — R32C-06

1. runner159–162는 호출자가 준 pass를 믿는다. 229–243 등은 실측이 틀려도 true를 넘긴다. Sol의 소스 변경 없는 DOM 변조에서 잘못된 이름/날짜 크기와 pass:true가 동시에 기록됐다. 이 주입은 제품 결함 판정이 아니라 검증기 거부 능력 시험이다.
2. stale-response356–358는 b.keyword를 읽는다. 실제 bridge108–119는 인자 배열을 전송한다. b[0].keyword를 읽어야 하므로 slow 경로가 held되지 않고도 시나리오 PASS가 가능하다. held 시작/해제/handler 완료를 필수 실측해야 한다.
3. 공통 runScreenCheck는 import/호출되지 않는다. fixture에 없는 actionType/필드를 발명했고 8대표·순서·전체201·G2·필터/경합 등 필수 검사가 누락됐다. 오류 예외도401문자열/경로 전체 허용 형태다.
4. 부분 PASS가 정리 전에 기록되고 close 오류를 삼킨다. 서버 종료 대기 타이머는 종료 증명 없이 성공할 수 있다. worker/regression timeout과 원출력 증거가 부족하다. startup 직후 소유 listen 증명이 없고 worker 환경변수로 소유 검문을 우회한다. 이 항목은 소유권 증명 부재/잠재 경합이며, 다른 서버 접촉이 관찰됐다는 뜻은 아니다.
5. 회신의 list/stale/role/session 캡처 경로4개가 실제로 존재하지 않는다. 주변 실제 산출물의 밀리초가 다르며, 주장한 정확 경로의 증거로 대신 인정하지 않는다.

## Control 검수 산출물의 격리 문제

Gemini가 기존 Sol 오류 주입 helper를 실행하면서 이전 `.ai/reports/phase3-2-correct1-review-20260930_224512/injected-errors.json`이 owner의 빈 오류 배열로 덮였다. 기존 final-evidence.json에 독립 측정 console1/page2가 남아 있어 교차 확인했다. 관찰된 덮어쓰기 바이트는 별도 새 Log와 이번 report에 보존한다. 이전 객체는 저장된 독립 증거로 복원하되 원본 바이트 완전 복원으로 주장하지 않는다. 다음 주입기는 복사본과 자기 소유 ignored 산출물에서만 실행하도록 계약을 변경한다. 정본14·제품 보호336 불변과 이 별도 Control 출력 변경을 구분해 보고한다.

## 정리·한계

이번 소유 Chrome/서버/임시 폴더는 종료·삭제 완료했다. Playwright MCP는 기존 mcp-chrome 프로필 점유로 실패했고 격리된 실제 Chrome으로 검증했다. 타 세션 프로필/PID/역사 임시 폴더는 건드리지 않았다. 실제 세션 만료 전체 시험과 필수10case의 독립 최종수용 게이트는 아직 미완료다. 3-1e 직접 사용자 화면 확인도 별도 증거가 없다.

## 재계획

제품 화면 전체를 현재 바이트로 동결한다. 검증기를 owner 진입점/공통 실측·계약/정상 사례/예상 오류 사례로 나누고 공통 비교기가 pass를 계산하도록 바꾼다. 기존 runner+코드지도2파일, 신규검증모듈3파일만 허용한다. 동작·API·DB·인증 정책·제품 화면·기존 시험·공통 helper는 바꾸지 않는다. 실측 변조/예상외 오류/초기화·정리 실패 음성 시험을 필수 성공 조건에 포함한다. 요구 목표는 유지하고 실패한 단일 파일 패치 전략을 교체한다. 이 종결문을 기록한 뒤에만 TODO/current-state의 사실 상태를 갱신하고 새로운 baseline을 잠근다.

근거: `C:\Projects\Active\교대근무관리 시스템\.ai\reports\phase3-2-correct2-review-20261001_085101`의 scope-before/static-results/probe-results/bad-measurements-assertion-evidence/injected-errors-runner-result/provided-case-evidence/historical-artifact-drift/server-cleanup/fault-cleanup JSON 및 PNG/원로그.
