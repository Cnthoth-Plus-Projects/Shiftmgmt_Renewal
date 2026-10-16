# Phase 3-1d — Sol 직접 Chrome 통합 검수

- 시각: 2026-09-30 16:19:13 KST
- 판정: **CORRECT / 전체3-1 수용 보류**. 검수 실행은 완료했다.3-1d는 수정·재검증까지 진행 중이며3-1e 커밋은 대기한다.
- 사용자 지시: “오케이 직접 테스트 진행해”. 제품 변경 없이 Sol이 직접 검수했다.
- 런타임: 실제 설치 Chrome 154.0.8037.58,1440×900,격리 신규 DB,`http://127.0.0.1:18740/`.
- 최종:8그룹 완료,78항목 중64 PASS/14 FAIL,캡처15,예기치 않은 콘솔·페이지·요청·HTTP 오류0.
- `node integration-check.mjs`의 exit0은 soft-check 실행 완료다.14 FAIL을 수용 PASS로 해석하지 않는다.
- 최종 결과: `run-2026-09-30T07-08-33-331Z/results.json`, 전량 파일 실재·해시: `scope-evidence.json`.

## 정상 확인

- 실제 ID/비밀번호 입력과 Enter 로그인, 최초 비밀번호 변경 후 셸 진입,약한/불일치 비밀번호의 변경 API 호출0.
- L1 Tab 순서,눈 버튼 Space/Enter,2px 포커스 링,Esc 후 화면 유지. 이 단계는 전체 페이지이므로 Esc로 닫을 모달이 없다.
- 셸220↔64/헤더56/상태줄32/본문812,첫 Tab 본문 바로가기,실제 본문 액션으로 순차 포커스 이동.
- 관리자9메뉴/다른 세 역할7메뉴.8업무 메뉴는 각각 정확한 제목·aria-current·준비 안내를 표시하며 홈 복귀 정상.
- administrator/operator/planner/reviewer를 실제 서버 계정·실제 로그인으로 검수. planner/reviewer는 임시 DB의 기존 관리자 API로 만들었다.
- 비관리자 화면은 관리 메뉴/감시 칸이 없고 감시 API 자동 호출0. 명시적 감시/사용자목록 조회는 기존 HTTP200 BridgeFailure `AUTH_FORBIDDEN`으로 차단됐다.
- 관리자 감시 중단→다시 시작 Enter→실제 감시 실행,키보드 로그아웃 정상.
- 서버 `signOut`로 실제 세션 무효화→상태 조회401 `AUTH_SESSION_REQUIRED`→로그인 복귀/셸 파기 정상. 시간 경과에 의한 TTL 만료를 새로 기다린 시험은 아니다.
- 홈·셸1440 및 보조1024×768에서 가로 넘침 없음. 홈 아이콘은 조상 aria-hidden을 포함해 숨김 정상.
- 제품 HEAD/status92 및324파일 해시 불변. 보호 지침5·정본6·승인 로그인/셸 HTML4도 불변.
- 소스 불변을 근거로 기존132파일/912시험·Chrome26시나리오/40캡처·액션 수명28조건을 재사용했다. 새 전체 단위시험 실행을 주장하지 않는다.

## 실패14조건 — 중복 영향을 포함한 검사 조건 수

| 검사 | 실제 | 정본/기대 |
|---|---|---|
| `L1-background` | `rgb(245, 246, 248)` | #E5E7EB |
| `L1-card-border` | `rgb(216, 220, 226)` | #E2E5EA |
| `L1-input-radius` | `4px` | 6px canonical wins older HTML |
| `L1-button-font` | `13px` | 14px login approved variant |
| `L4-lock-described` | `None` | aria-describedby -> visible reason |
| `L4-lock-focusable` | `True` | validation lock remains keyboard focusable |
| `token---bg` | `#F5F6F8` | #F4F5F7 |
| `token---line` | `#D8DCE2` | #E2E5EA |
| `token---text` | `#191B1F` | #1F2430 |
| `token---text-sub` | `#606877` | #4B5563 |
| `token---accent-hover` | `#32479A` | #32479B |
| `token---success-bg` | `#EAF5ED` | #E8F5EE |
| `placeholder-card-flat` | `results.json 상세 실측 참조` | 6px/no shadow |
| `watch-restart-font-min12` | `11px` | >=12px |

## 안정 결함 ID / 한 번에 수정할4종류

| ID | 문제 | 수정 위치 |
|---|---|---|
| R31D-01 | 공통6색상 토큰이 정본과 다름. 로그인 카드 테두리 실패도 같은 영향 | src/web/styles.css :root |
| R31D-02 | 로그인 배경 F5F6F8→E5E7EB,입력 모서리4→6,텍스트 동작 버튼13→승인14. 눈 버튼 모서리4는 같은 버튼6 규칙을 어긴 정적 대조 추가 항목 | src/web/login.css |
| R31D-03 | 준비 카드8px/그림자,감시 재시작11px. 정적 대조에서 재시작/사이드바 토글 모서리4 및 헤더 제목18도 확인됨(정본6/6/20). 역할 배지12는 지정19차 HTML과 같아 이번 수정 대상으로 삼지 않음 | src/web/shell.css |
| R31D-04 | L4 입력 조건 잠금을 native disabled로 처리해 포커스 불가,aria-describedby 없음. 규칙/불일치 차단과 처리 중 잠금은 유지해야 함 | src/web/screens/login.ts, scripts/ui-checks/login.mjs |

정적 추가4항목(눈/사이드바/재시작 모서리,헤더 글자)은78개 자동 검사 수에 더하지 않았다. CSS 실제 선언과 정본·지정19차 셸의 `.header-title`20px를 대조한 별도 근거다. `styles.css`6~22,`login.css`3/74/103,`shell.css`165/192/234/319,`login.ts`408~498을 확인했다.

## 시안·시각 대조

지정된19차 로그인/셸과1차 승인 홈을 같은 Chrome에서 렌더링했다. 로그인·홈 실제 캡처와 참조 캡처를 Sol이 이미지로 열어 대조했다. 여러 상태를 세로로 담은 참조 캡처를 단일 제품 화면과 픽셀 동일하다고 주장하지 않는다.

확정 디자인 시스템 v1.3은 값 충돌 시 토큰 정본이다.19차 로그인 자체도 일부 옛 색상/입력4px를 보유한다. 이를 근거로 제품 차이를 승인하거나 정본을 수정하지 않는다. 홈 승인본의 옛 헤더·고정 건수·판번호·데모 버튼은 앞선3-1c 지시대로 구현 대상에서 제외한다. 제품의 실제0건·1/2 준비 비율을 시안의 가짜128건으로 바꾸지 않는다. 로그인 카드460/8px/지정 그림자는 승인 변형이며 통과했다.

## 실행 이력과 시험 전제 정정

1.1차:46 PASS/30 FAIL,7그룹 완료/1미완료,14캡처,예기치 않은HTTP1. 실제 제품 실패 외16개 시험 전제 오류를 포함했다. 기존 API 오류 필드는 `errorCode`이고 차단은 `AUTH_FORBIDDEN`/HTTP200이다. 준비 안내는 독립 exact text가 아니라 notice-banner 문장이다. 홈 아이콘은 조상 aria-hidden을 고려해야 한다. 본문에 포커스 가능한 액션이 없으면 다음 Tab이 첫 링크로 돌아갈 수 있다. 또한 서버는 성공 로그인 때 기존 sessionMap을 비우므로 관리자 브라우저를 열어 둔 채 다른 계정을 로그인하는 전제를 제거했다.
2.2차:64 PASS/14 FAIL,8그룹 완료,15캡처,오류0. 실제 세션 무효화는 다른 역할 로그인 전에 검수했다. 본문에 실제 감시 재시작 버튼이 있는 상태로 skip 이동을 확인했다.
3.최종3차:같은64 PASS/14 FAIL,8그룹 완료,15캡처,오류0. 약한/불일치 비밀번호 차단을 버튼 속성 검사에서 실제 change-password 요청0 확인으로 보강했다. 현재 native disabled 버튼은 키보드 포커스를 받을 수 없다는 실패를 별도 유지했다.

세 실행 결과와 각 실행 당시 helper 사본을 전부 보존했다. 실패를 지우거나 테스트 결과를 고쳐 쓰지 않았다. 테스트 도구 준비 과정의 잘못된 cwd/파일 경로 조회는 실제 제품 결함으로 집계하지 않는다. Python Playwright 미설치로 기존 Node Playwright와 설치 Chrome을 사용했으며 의존성을 설치하지 않았다. Playwright MCP로 초기 화면·키보드를 직접 관찰한 결과도 `mcp-login.png`에 보존했다.

## 정리와 남은 상태

최종·2차 서버/브라우저·임시 자료는 종료·삭제 검증했다. MCP 브라우저도 닫았다. 첫 실행의 서버PID44256은 종료됐으나 자동 정책 검사에서 임시 폴더 재귀 삭제 두 명령이 `blocked by policy`로 거부됐다(추가 사유 없음). 거부된 대상은 우회 삭제하지 않았다. 잔여 경로: `C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-sol-31d-2Kh5fr`. 실제 운영 데이터는 사용하지 않았으며 이 경로는 이번 신규 검수 DB/부트스트랩만 담는다. 세부 정리는 `cleanup-evidence.json`.

제품 소스 수정0·커밋0. 제품 구현 주체는 AGENTS.md에 따라 Gemini다. 다음 조치는 루트 HANDOFF.md의 닫힌5파일 수정 후 동일 통합 검수를 다시 확인하는 것이다.3-1c 수용과 하네스5.1 적용은 유지하되 전체3-1은 아직 수용하지 않는다.
