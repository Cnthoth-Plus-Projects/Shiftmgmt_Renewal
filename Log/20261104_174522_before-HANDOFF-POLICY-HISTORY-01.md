# HANDOFF — POLICY-HISTORY-01 검수 완료 / Sol 보완 후 기술 수용

- Action: ACCEPTED_AFTER_SOL_TAKEOVER
- 시각: 2026-11-04T12:11:45.899076+09:00
- 최종 구현·통합·검수 담당: Sol(Codex)
- Gemini: 최초1 / 재시도1 / 누적2. 두 제출 실패 기록 보존, 새 요청·횟수 초기화 없음.
- 제품 구현·기술 수용 완료. 사용자 최종 화면 확인은 대기. 운영 적용·commit·배포는 수행하지 않았다.
- 다음 메뉴를 자동 착수하지 않는다. TODO의 UI-ADMIN-REFINE에서 공휴일 메뉴 범위를 구체화할 순서다.

## 회신

### 판정과 근거

받은 재시도 회신은 그대로 Log에 보존했다. source510/허용55/보호455를 대조했고, 미초기화 preview가0→2 정책행을 쓰는 결함을 재현하여 재시도도 수용하지 않았다. 상시 두 번 실패 승계 규칙에 따라 Sol이 같은 Task 안에서22파일을 보완했다. 최초·재시도 판정은 소급 변경하지 않는다.

준비: 최초 IMPLEMENT.md의 요구/범위/필수 검문과 baseline500·보호455를 유지했다.
구현: 실제 parser·저장·승인·정책이력·JSON·대화상자와 시험을 보완했다.
형식 검수: 아래 실제 실행과 source/served-byte 대조 후 기술 수용한다. 사용자 화면 승인이나 운영 전환 완료를 뜻하지 않는다.

정본 평가: `C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\review-retry1-20261104_110746\sol-assessment.json`
SHA-256: `E4BF819604E4AEB0D0D588C316A10CBE6EF26E4DD4DCDD20D00A7BC90E6CDD64` / 12529bytes.
원래 계약: `.ai/reports/policy-history-20261103/IMPLEMENT.md` 및 첫 review의 CORRECT-retry1.md.
증거 폴더: `C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\review-retry1-20261104_110746\sol-evidence`.

### 사용자가 확인할 동작

1. 운영 관리 → 설정 → 근무·수당 기준에서 두 정책의 현재 버전과 다음 예정 버전을 바로 확인한다.
2. 이력 및 관리에서 과거·현재·예정/정정/취소 상태와 적용 기간을 페이지로 조회한다. 표는 약52px 행으로 정리했으며 기준 상세와 사건의 변경 전·후/사유를 별도로 읽는다.
3. 새 정책은 기준·적용일·사유 입력 → 영향 확인 → 확인 후 등록 순서다. 일반 설정 저장과 별개로 등록된다. 입력이 바뀌면 이전 확인은 폐기되고, 저장 중에는 중복 입력·실행을 막는다.
4. 예약 정정·취소는 아직 시작하지 않고 승인에 쓰지 않은 정책만 가능하다. 원본·변경 전후·취소 사유를 보존한다. 사용/초기/시작한 기준의 잠금 이유를 표시한다.
5. 근무일별 해당 버전을 실제 엑셀 파싱부터 실적·승인 스냅샷까지 보존한다. 정책 변경으로 이미 승인한 금액을 다시 쓰지 않는다.

예: V1은6/30까지, V2는7/1~8/31, V3는9/1부터 적용한다. 새 버전 추가로 이전 두 구간을 덮어쓰지 않는다. 현재 확인 창에는 이 예시와12월 예정 버전이 있으며 실제 운영 자료가 아닌 격리 fixture다.

### PH-D01~D09 보완 결과

| 결함 | 실제 보완 및 확인 |
|---|---|
| D01 실제 정책/바인딩 | parser 진입에서 실제 초기 이력 생성, 고정한 timeline으로 ID·Vn·기준 전문·구현 버전 보존. 최초 parser ID 실존과 실제 변경후 직원의 binding 재현 통과. |
| D02 캐시/읽는 중 변경 | workbook await 전에 timeline 고정, 반환 지문도 그 기준으로 계산. 누락/연속 충돌은 재확인 오류. 영향 월 대기 cache만 재판독하고 승인 결과는 보존. 실제 Excel 비동기 경로 시험 통과. |
| D03 공개 승인 | 지문 누락·stale 거부, 승인 transaction 안에서 ID/버전/기간/기준 전문 대조. 승인/계산/used 기록 원자성과 되돌림 이후 used 보존 확인. |
| D04 무쓰기/권한/token | 미초기화 preview는 조회 안내만 하고 쓰지 않음. 관리자·동일 로그인 세션·5분·의도 복사·1회 token 및 실제 관련 행/승인/파일/폴더 지문을 transaction에서 재검사. typed 오류 공개. |
| D05 정정/영향 | 종류·원본 상태·중복/과거 날짜·no-op 거부. 예약을 다른 버전 뒤로 옮길 때 두 개의 실제 변경 구간을 계산. 없는 행을 메타 entry_count로 만들지 않음. 취소 사유 영속 보존. |
| D06 JSON | v2 표/열/기준 의미/전후 참조/스냅샷 엄격 검증. email/holiday 호환 예외는v1만. 실제 백업-미리보기-복원, 삭제된 승인에 대한 used tombstone 보존·잘못된v2 거부 시 live 불변 확인. |
| D07 수명/소유권 | 공통 WorkforceDialog 재사용, 부모 busy·세션 종료·destroy·generation/token 결합. 늦은 preview/apply·다른 모달 열기·닫힌 창 응답·저장 중 입력 시나리오 실제 검문. |
| D08 사용자 흐름/디자인 | 현재/예정 카드, Dense 페이지 이력·전후 상세·사유·잠금. Tab/ShiftTab/Escape/복귀, label,5개 크기의 기본 설정/하단 버튼과 스크롤 기준 통과. |
| D09 실제 검증 | 가짜 JSON 규칙 배열 시험을 실제 서비스 왕복 시험으로 교체. 기존1425 보존, 계약 숫자13개 제목 대응, 신규29 추가. 실제 API·Excel·브라우저 경로 검증. |

### 실행과 결과

실행 cwd: `C:\Projects\Active\ShiftMgmt_V4`.
임시 실행 증거: `C:\Users\pangyo\AppData\Local\Temp\policy-history-retry-review-20261104`.

| 검문 | 판독 결과 |
|---|---|
| npm run typecheck | 최종 RC0 |
| npm run lint | 최종 RC0 / 오류0 / 기존 보호 소스 경고3 / 신규0 |
| npm run validate:map | 최종 RC0 /239경로 존재 |
| 관련9파일 시험 | fresh RC0 /201개 통과 |
| 새4개 정책 시험 |27개 통과, PH01~12 전부 포함 |
| npm run build | 최종 RC0, 실제 browser/server 생성 |
| operations --focus=S03,S04,S19,S20 | fresh RC0 /PARTIAL_PASS4/20, 전체 통과로 혼동하지 않음 |
| npm test -- --no-cache --reporter=json | fresh RC0 /1454시험·155파일 /실패0·skip0 /396.68초. 기존1425 보존, 승인된 계약 제목13개 대응, 순증29 |
| operations 전체 | 최종 fresh RC0 /PASS·fullRun·exactScenarios /20개·N12 전부 /오류0 |
| performance 전체 | native RC2 /18PASS·정확S13/S16만 기존BLOCKED /실패0·N12 전부·예상외오류0 |
| 실제 구형 JSON | fresh RC0 /원본40표3599행3217906bytes 불변 /target42 /사업39표 canonical 일치 /승인64건13,611,839원 보존 /SQLite무결성ok |
| git diff --check /범위 | RC0 /보호455 불변 /범위외0 /source510 /UI각30KiB이하 /HEAD유지 |
| native 시각 확인 | 로그인된 실제 정책 화면, 개정 표52~52.5px /개요와 이력 PNG 확인 |

전체 단위/실적 실행 뒤 마지막 변경은 `operations-policy-history.ts`의 표시명·기간 줄바꿈과 `policy-history.css`의 표 컬럼 폭뿐이다. 다른508소스·시험·설정·backend/producer/reader/계산은 봉인한 full-run source와 byte 동일함을 재검증했다. 두 UI 파일을 시험에서 직접 가져오는 경로가 없고 최종 타입/lint/build와 전체 operations20/N12 및 실제 served JS/CSS bytes를 fresh로 다시 확인했다. 단위/실적 결과는 **마지막 표시 변경 뒤 다시 실행한 것으로 보고하지 않는다**. 이전 fresh 실행과 동일 입력의 기록 재검증을 구분한다. 원 proof는 sol-frozen-source.json, 마지막 후보는 sol-final-source.json에 보존했다.

실제 JSON 원본 SHA-256: EFEC1F0EF364E6CA4D88DBBCF8D52E88FFDC2EAC452E258CA7D09B4BDDE28DB9 (최종 재확인 동일).
실적의 기존 S13=반려 미지원, S16=계산 이력 있는 승인 숨김 거부는 PASS로 바꾸지 않았다.

### 재실행·실패 기록

- 첫 focused 정책21개 중5개는 한국어 typed 오류/실제 행0과 옛 기대값15 불일치였다. 기대를 오류코드 및 실제 행으로 맞추고 실제 음성 사례를 추가했다.
- C02의 새 v2 fixture가 기준{}/한 종류뿐인 무효 자료여서 거부됐다. 실제 bootstrap로 만든 두 종류/사건을 사용하여487열 검문의 원 의도를 보존했고 전체 통과했다.
- UI fixture가 현재와 같은 기준을 추가하거나 page2에 부족한8행을 준비하던 부분은 실제 현재 rule과12개 개정으로 수정했다. 검증기 가정을 재검토하고 오류 문구를 노출해 원인을 좁혔다.
- 현재/예정 카드 추가 후 스크롤과 표의 긴 줄바꿈을 실측해 해당 화면 안에서 배치를 줄였다. 마지막 표 보완 때문에 operations 전체를 두 번째 실행했다.
- performance 첫 결과18/2는 정상이었으나 PowerShell의 bare native exit2가 shell RC1로 전달됐다. 최소 node exit2 재현 후 명시적 native RC 보존으로 재실행해 실제RC2를 확인했다. 첫 결과는 버리지 않았다.
- Sol 전체 실행 시작: 단위1 /운영2 /실적2. 추가 실행 사유가 있는 범위만 진행했고 단위 전부를 안심용으로 다시 돌리지 않았다. 시간 절감률이나 전체 진행보고 간격 무누락을 측정 없이 주장하지 않는다.

### 화면과 다음 상태

로그인된 별도 확인 창: `http://127.0.0.1:19114/` (CDP19115). 현재 근무·수당 기준 화면을 열었다. 기존19100 확인 창과 운영 DB는 변경하지 않았다.
PNG: `C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\review-retry1-20261104_110746\sol-evidence\policy-overview-final.png` / `C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\review-retry1-20261104_110746\sol-evidence\policy-history-final.png`.

현재 Task의 기술 미해결0. 최종 사용자 디자인 확인은 대기이며 운영 적용·commit·배포는 별도 범위다. 다음은 기존 UI-ADMIN-REFINE 공휴일 메뉴의 구체 Task/허용 범위 정리이며 이번 회신에서 새 제품 작업을 시작하지 않는다.
TODO 정본: 81060bytes / SHA-256 40AE5B82E7508D135F77BD1E22EE76E746F9EBA001519EE6E1F73135947CF085.

## 후속 Git 동기화 요청 — 2026-11-04

사용자가 현재 상태의 commit·push·동기화를 명시 승인했다. 위 기술 수용 당시 미수행이던 commit의 후속 승인이다. 제품510파일은 검수 정본과 byte 동일하며 995b92a85e8a006c3489b2ad171d2c5366dda8c8에 커밋했다. 대상은 기존 `Cnthoth-Plus-Projects/Shiftmgmt_Renewal`이며, 통합 `main`의 `ShiftMgmt_V4/` 구조와 전체 소스 이력을 보존하고 `source/shiftmgmt-v4`를 제품 작업 폴더의 추적 브랜치로 사용한다. 제품 코드·버전·배포 설정은 추가 변경하지 않는다. 실제 push/원격 동일성 결과는 후속 Git 실행 receipt로 확인한다.
