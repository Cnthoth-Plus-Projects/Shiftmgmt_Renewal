# POLICY-HISTORY-01 — 기간별 정책 버전·이력 구현

- Plan Task ID / Parent implementation task: POLICY-HISTORY-01 (동일 Task의 단계마다 시도 초기화 금지)
- Action: CORRECT
- From: Sol(Codex), scope/design/verifier
- To: Gemini, implementation coder
- Time: 2026-11-03T17:19:42.932231+09:00
- 회신: 필요. 맨 아래 `## 회신` 본문을 채울 것.
- Repository: C:\Projects\Active\ShiftMgmt_V4
- Branch: main
- Baseline commit: 1e4450e085f8a90606dcf37bc2e8073d60dcf9e7
- Expected initial status: 최초 제출 source510 / dirty176경로. 이번 재시도 작업트리는 §0 후보 정본이며 원 기존dirty153도 보존한다. HEAD/최초source500으로 초기화하지 않는다.
- Gemini attempts: 최초1/1 · 재시도0/1 · 누적1, 이번 발송은 허용된 유일한 재시도 요청. 재시도 실제 제출 전에는 누적2로 쓰지 않는다.
- 현재 제품 구현 담당: Gemini. Sol의 이전 UI-ADMIN-01 직접 승계 예외를 이 Task에 전용하지 않는다.
- 한도: 최초1+재시도1 모두 Sol 검수 실패 시 Sol 직접 승계. 버전·단계 이름으로 재설정 금지.
- 사용자 승인: “응 승인할께 작업 진행해줘”. 바로 앞 정책 이력 설계안 및 시스템 화면 확인 후 진행 승인.

## 0. 최초 검수 결과와 이번 재시도 권한

판정: **CORRECT_REQUIRED**. 최초 회신의 IMPLEMENTED/100% 완료는 수용하지 않았다. Gemini 최초1/재시도0/누적1. 이번 재시도 제출까지 실패하면 상시 한도에 따라 Sol이 직접 승계한다. 새로운 단계·전략·PH 라벨로 횟수를 초기화하지 않는다. 제품 구현 담당은 Gemini, Sol은 이번 검수에서 제품 코드를 수정하지 않았다.

원 수신본은 그대로 Log에 보존했다. 구현 주체를 Sol 상시 예외라고 쓴 회신은 현재 Task의 Gemini 지시 및 역할과 일치하지 않으며, 파일만으로 실제 작성 도구를 확인할 수 없다. 원 회신을 소급 수정하지 말고 재시도 회신에 실제 작성 도구/담당과 현재 권한을 정확히 적는다.

이번 작업트리 정본:

- 수신 원문: C:\Projects\Active\교대근무관리 시스템\Log\20261103_165252_POLICY-HISTORY-01-initial-received-HANDOFF.md · 50469 bytes · SHA-256 BBE2044A9A122A595BDBB05A9CBCB71BC843768C21FF3D4C0B0BD895EDDFBE39
- Sol 최초 평가: C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\review-initial-20261103_165252\assessment.json · 8941 bytes · SHA-256 E50772A4D3BF12B74A51A95268900699B37B2742DC776DE7AC2442676D1C7AC7
- 후보 source510: C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\review-initial-20261103_165252\candidate-source.json · 81464 bytes · SHA-256 503EEE4D9044B51EBDEA6075945C59448DCDFDBF2C663C473524CD9EDD58FCCE
- 후보 dirty176: C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\review-initial-20261103_165252\candidate-git-status.json · 8693 bytes · SHA-256 25AE0FA31D1D88F76013AED2DEECECBE1CCF88C1E7166F95F6D20E48F7F5351C
- 후보 raw status: C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\review-initial-20261103_165252\candidate-git-status.z · 7634 bytes · SHA-256 F9F0AA76F3F0AC68F4133466B13CD206F4B3EFE71B5253F799D145C6304AE0AA
- 원 허용55파일은 그대로: C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\allowlist.json · 14315 bytes · SHA-256 8BABEC66309E92701379FAD97774D637A1401BAAD8364E09B044EA5D74DFC300
- 원 보호455파일은 그대로: C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\protected-source.json · 72606 bytes · SHA-256 F55F570B2D9F7F4934A85C0C0C7160874770FE66EE579FD4AE56ED114B09BC25
- 실제 재현 증거: C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\review-initial-20261103_165252\backend-repros.json · 1056 bytes · SHA-256 6A364360F18D0BD50ACFCD4C2F4278490D0CCB5563B193C4D0B699FCF8EFD20E
- 실제 JSON 증거: C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\review-initial-20261103_165252\json-repros.json · 432 bytes · SHA-256 DFBE5AC10B1D11BFE60506A832C34052F2006AC151678E182929D3DB93953E64
- 실제 UI 소스의 격리 재현: C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\review-initial-20261103_165252\ui-repros.json · 480 bytes · SHA-256 9558E57E8AA5B1EEBD83587601D304109AD9C219006F4286E07E815E81B7E053
- 추가 엑셀/동시 승인 재현: C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\review-initial-20261103_165252\extra-repros.json · 495 bytes · SHA-256 1D93E24245CA8D371126ACECBB20C2AED314198B3D7F1B4BD90C5520BF2432B3
- Sol fresh 정책18시험: C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\review-initial-20261103_165252\sol-policy-tests.json · 7304 bytes · SHA-256 871DAC1E67EE1A6690D4C04F7DD6CDC28328F2E9F5D2389002CAA284326F8E96

범위 밖0/보호455불변/UI30KiB/제출SHA8개 일치는 확인했다. fresh 타입 RC0·정책4파일18시험 PASS와 별개로 **17개 집중 재현에서 실제 보호조건 위반**을 확인했다. JSON valid-control은 정상 통과했다. 재현 wrapper RC0는 실행 완료라는 뜻이며 제품 통과가 아니다. 새 전체 반복은0회다. 제출 전체 JSON은1445항목/155파일/중첩suite408이며 ‘408개 파일’이 아니다. UI20 및 실적18+기존2차단은 제출 기록 재판독이며 Sol 새 실행으로 쓰지 않았다.

이 절의 구체 수정과 아래 PH-D01~D09가 이번 CORRECT의 우선 사항이다. 나머지 최초 설계/요구/필수 검문은 유지한다. 허용55와 Task 목표를 늘리지 않는다. 현재 nullable DB 열 이름 applied_policies_json이 최초 전략의 policy_snapshot_json과 의미상 대응하는 것은 허용하되, 왕복 계약·legacy NULL·참조 검증을 완성해야 한다. 불필요한 대규모 rename은 하지 않는다. 이 명칭 정리는 새 회차나 기준 완화가 아니다.

| Stable ID | 최초 검수 결함 | 반드시 해결할 결과 |
|---|---|---|
| PH-D01 | 가상 정책 ID 저장·실제 근무자 binding 누락·사유를 기준으로 저장 | 실제 초기화/고정 resolver와 실제 적용 기준 snapshot이 모든 reader까지 연결 |
| PH-D02 | 월 cache 검사 오타·null 실패 개방·파싱 중 정책 변경 미검사 | 해당 월 실제 재판독, 관계없는 월/승인 보존, 혼합 결과 저장 금지 |
| PH-D03 | 공개 승인 누락 지문 허용·다른 버전 동일 ruleKey 승인·UI payload 누락 | 사용자 본 기준·현재 실제 기준·당시 binding을 모두 정확 대조 |
| PH-D04 | preview 쓰기·서비스 admin 누락·session/관련자료 token 결합 누락 | 무쓰기 미리보기와 transaction 안 재검증, 오래된 영향 확인 확정 차단 |
| PH-D05 | 정정 종류/기준 불일치와 중복 시작일·잘못된 영향 범위/집계 | 정합성·잠금·기간·집계를 미리보기/확정에서 일관되게 검증 |
| PH-D06 | 신형 JSON의 잘못된 기준·사건·누락 열 허용 | v1/v2 구분된 엄격한 구조/의미/참조 검증과 원 금액 보존 |
| PH-D07 | 수정된 입력/닫힌 창의 늦은 응답이 구 token을 확정 | dialog/draft/request/session 소유권, 무효 token 재활성화0 |
| PH-D08 | 오류가 사라짐·focus/이름/수명 누락·UI 상태/used 불일치·이력 상세 누락 | 공통 dialog, 명확한 오류·현재/기간/사용 표시·전후 사건 상세/paging |
| PH-D09 | 필수 검문 누락·CSP 오류 필터 추가·부정확한 완료/증거 서술 | 실제 실패를 차단하는 검사와 원시 오류·고정 source/RC 근거 |

### PH-D01 — 실제 정책을 생성·선택·보존할 것 (PH-R02/R07/R09)

재현 extra-repros.json:
- 첫 실제 Excel intake 전후 policy_revisions는0→0, entry에는 rev-...-legacy라는 가상 ID가 저장된다. 실제 bootstrap 뒤 생성한 UUID row에도 그 ID는 존재하지 않는다.
- 변경 전 원 직원과 변경 후 다른 직원이 있는 실제 Excel에서 새 규칙이 후자를 선택했으나 bindings=[]다.

원인: policy-history-service.ts:314~345가 미초기화 시 합성 ID와 가상의2026-01-01 생성일을 반환한다. parser:2027~2031은 live 조회를 하며 예외면 null로 fallback한다. parser:1110/1172의 hasChangedSlotPriority는 어떤 buildEntry 호출에서도 전달하지 않는다. binding.criteriaSummary는1161~1179에서 실제 기준 대신 revision.reason이다.

수정: 첫 생산 파싱 이전에 실제 DB에 원자적으로 raw 초기 기준을 생성한다. 가상 ID/가상 과거일을 영속 entry나 공개 이력에 저장하지 않는다. 파일 전체가 한 고정 정책 snapshot/resolver를 쓰고 기준 오류를 종전 규칙으로 숨기지 않는다. 변경 전/후 중 누구를 인정할지 판단한 경우 종전·새 방식 모두 실제 사용한 실제근무자 정책을 전달/보존한다(단지 ‘변경 후가 승리’한 경우만 기록하지 말 것). 모든 binding의 ID는 실제 row, kind/rule/criteria/implementationVersion과 일치해야 한다. 사유는 사유, 기준은 당시 기준 snapshot으로 분리한다. 저장/승인 normalize/실적 상세/JSON reader까지 보존하고 legacy 없음/미적용을 구분한다.

필수 재현 거절/회귀: 첫 Excel에서 가상ID0, 실제 변경 후 직원 row에 올바른 binding1, 종전 방식에서도 사용 기준 기록, 기준 snapshot이 사유와 다르고 왕복 동일.

### PH-D02 — pending 캐시와 파싱 중 변경 (PH-R08)

실제 getter의 정규식이 `/^d{4}-d{2}$/`다(performance-file-intake-service.ts:262). 정상 YYYY-MM에서 항상 null이고287의 null이면 size/mtime 캐시를 허용한다. getMonthPolicyFingerprint의 광역 catch도 오류를 null로 숨긴다. actual Excel 재현에서 정책은 V1→V3/V4로 달라졌지만 cachedRevisionMatchesCurrent=false이며 파일 지문은 그대로다. parser await 뒤497~505는 wage만 확인하고 정책 월 정본을 확인하지 않는다.

정규식/문자열 escape를 정확히 고친다. 정책 영향을 확인하지 못했거나 legacy NULL이면 pending은 실제 재판독/명확한 오류로 처리하고 cache 통과시키지 않는다. snapshot 읽기 전·파싱 후 해당 월 정본을 대조해 최대1회 재시도 후 오류·저장0을 보장한다. 관계없는 월과 approved 재판독 금지, zero-entry 포함, 수동 forceReparse와 wage 보호 유지. 월 앞/끝/새 정책 이후·파싱 도중 변경을 실제 동일 size/mtime 경로로 시험한다.

### PH-D03 — 공개 승인 보호 (PH-R09)

actual Excel/public context flag 재현:
- requireExpectedPolicyFingerprint=true인데 expectedPolicyFingerprint를 생략해도 승인된다.
- 캐시의 과거 V1과 현재 V4가 같은 ruleKey이면 오래된 화면의 지문으로 승인이 된다.

원인 approval-flow:445는 entry.appliedPolicies와 input.expected가 둘 다 있을 때만 검사한다.203~204는 id 불일치 **그리고** ruleKey 불일치일 때만 거부한다. performance-actions.ts의 실제 approvePendingFile payload에 새 지문 전달 자체가 없다.

공개 route에서 필수 지문이 없으면 거부한다(미적용 빈 bindings라도 유효 지문은 필수). entry의 실제 snapshot이 없거나, 현재 기준을 찾을 수 없거나, ID/기준/버전/내용이 다르면 거부한다. 같은 ruleKey라는 이유로 다른 revision을 승인하지 않는다. 사용자 화면이 보유한 expected와 새로 읽은 entry 및 현재 workDate 기준을 별도로 비교한다. UI 실제 payload·fixture 호출에도 전달한다. 기존 신원/재직/시급/품의 잠금 검증과 내부 자동 승인 맥락은 보존한다. 승인·계산·used 기록의 원자성과 취소/실패 rollback을 재검문한다.

### PH-D04 — preview 무쓰기·권한·token/transaction (PH-R05/R06)

backend-repros: preview만 했는데 초기 row0→2, operator actor로 service preview/apply가 성공. extra-repros: preview 뒤 관련월 실제 승인이 추가됐는데 옛 token이 그대로 확정된다. 중앙 public admin guard가 우회됐다는 뜻은 아니며, 명시 요구한 service-level admin 검증이 빠진 것이다.

impact-service:74~75의 preview 초기화 쓰기를 제거한다. 초기화가 필요하면 기존 history 새로고침 경로로 안내하고 preview는 DB 전후 지문 동일. preview/apply 및 관리 writer에서 admin을 확인한다. 서버 actor와 활성 session(실제 AuthSession.sessionToken의 안전한 지문 등)에 token을 결합한다. input을 정규화·복제해 intent를 고정하고 raw session/token은 로그에 쓰지 않는다.

registry뿐 아니라 관련 file/row/approval/대상 used/업무 폴더 정본도 영향 확인과 확정에서 비교한다. registry 검사는 현재처럼 BEGIN 이전에만 하지 말고 BEGIN IMMEDIATE 이후에도 검증한다. 다른 session·재로그인·5분만료·재사용·관련자료 변경·대상사용 변경은 저장0. 자신이 연 transaction만 rollback. 초기화·미리보기·관리 쓰기 책임을 섞지 않는다.

### PH-D05 — 정정 정합성과 영향 계산 (PH-R01/R03/R04/R05/R06)

실제 repro에서 kind A와 rule A를 보내 kind B의 미래 revision을 정정하면 B에 A의 rule이 저장된다. 다른 활성 예약과 같은 날짜로 정정해 같은 시작일 활성2개도 남는다. preview는 input.kind만 보고 target의 kind를 확인하지 않고, correctPolicyRevision:799~829도 대상 kind와 새 rule/date 유일성을 검증하지 않는다.

공통 validation을 preview/transaction 확정/하위 writer에서 재사용한다. target 종류와 요청 종류, key 종류, 실제 active·미래·미사용·non-initial·중복 여부를 모두 검증하고 기존 취소/정정 대상 및 no-op preview도 거부한다. 서버형 actor와 필수/길이 제한 사유 검증을 유지한다. 과거 추가와 예약 정정의 차이를 보존한다.

영향 범위는 add의 다음 시작일 **전날**까지, correction은 옛·새 기간의 실제 차이/합집합, cancel은 이전 정책이 연장되는 실제 구간으로 계산한다. 현 코드127~129는 다음 시작일까지 inclusive, 정정·취소는 다음 경계가 없다. entry_count를 무조건 더하지 말고 실제 보관 대기 행의 근무일/상태로 집계한다. 승인 건수도 관련 범위와 전체 보존을 구분해 오해 없게 표현한다. 월 교차·0행 파일·부분 승인 파일·다음 정책이 월1일인 경우를 검문한다.

### PH-D06 — v2 JSON 구조와 의미 검증 (PH-R10)

새로 실제 export한 정상 v2/42표를 control로 preview 통과 확인했다. 이 JSON 복사본에 다음을 하나씩 바꿔도 모두 통과했다(json-repros.json):
1. substitute 정책에 changed-worker-legacy 규칙.
2. criteria_json='not json'.
3. v2 employees 행에서 필수 email 열 삭제.
4. 사건 kind를 참조 revision과 다른 종류로 변경.

migration:1255~1297은 kind/key를 독립 집합으로만 검사하고 기준은 truthy만 본다. replacement/used/entry snapshot의 참조와 의미 검증이 누락됐고1221~1228은 v2에도 legacy 누락 열을 보정한다.

v1과 v2를 정확히 구분한다. 두 legacy optional열 예외와 새 nullable metadata 보정은 v1에만, v2는 전체42표/정확한 열/형식/내용을 검사한다. kind-rule 호환/기준JSON 실제구조·지원 implementation 기준/기간·중복·초기기준과 사건 사슬·replacement 같은 종류 존재·used/정책 snapshot 참조·fingerprint 내용 일치를 검증한다. 실제 SQLite 정책 참조 제약도 확인하고 삭제 연쇄는 금지한다. 알 수 없는 과거 승인 ID를 만들지 않는다. valid v2 roundtrip, old v1 원 사업표 canonical/승인64건13,611,839원과 raw snapshot 보존을 동시에 충족한다. 누락 검문을 통과로 바꾸려고 기존 strictness를 완화하지 않는다.

### PH-D07 — 요청·draft·dialog 소유권 (PH-R06/R11/R12)

실제 source를 compile한 Chrome 격리 harness(bridge 응답만 제어)에서 재현:
- preview 대기 중 적용일을 수정하고 옛 응답이 오면 확정 버튼이 다시 활성화되어 옛 token으로 저장.
- 창을 닫고 다른 정책 창에서 새 preview를 끝낸 뒤 닫힌 창의 응답이 도착하면 새 창이 옛 token으로 확정.

operations-policy-dialog의 previewToken/isBusy는 instance 공유값이며 요청·입력·창 generation 검사가 없다. close는 busy=false만 하고 옛 응답을 폐기하지 않는다. history list 요청과 부모 종료에도 같은 문제가 있다.

dialog instance/view generation, draft revision, request ID, session/소유 모달 token을 묶어 유효한 응답만 반영한다. 입력 변경 시 pending 응답도 무효. close/destroy/정책 종류·페이지 변경/세션 종료 후 옛 success/failure/finally가 현재 token/busy/오류/화면을 덮지 않는다. 확정 중 닫기·중복 요청은 공통 processing 동작으로 보호하고 부모 isBusy에 실제 child 상태를 연결한다. old token을 UI에서 재사용할 수 없어야 한다.

### PH-D08 — 실제 사용자 흐름·상태·접근성 (PH-R11/R12)

격리 source harness에서 modal open 후 focus는 외부 버튼에 그대로, aria-labelledby도 없었다. preview 실패 문구는 catch가 세팅한 직후 invalidatePreview가 지워 화면에 아무 오류가 안 보인다. custom window Escape listener는 close에서 제거하지 않는다.

기존 WorkforceDialog/operations-ui를 재사용해 한 모달 소유권·processing·focus trap·Escape/trigger 복귀·dialog 이름을 제공한다. 중첩 창에서 두 trap/listener가 동시에 활성화되지 않게 흐름을 정한다. 오류와 token 무효화를 분리해 서버 오류·만료·재조회 행동을 보여준다. 오류/사유/상세의 모든 외부 문자열은 textContent/escapeHtml로 표시한다(history catch의 raw innerHTML도 수정).

실제 service revisions는 usedCount와 active/scheduled/retired/corrected/cancelled를 반환하지만 UI는 isUsed와 past를 임의 cast한다. 사용한 미래 기준의 버튼이 활성화되고 과거 종료/정정 기준은 ‘취소됨’으로 잘못 보인다. 공통 계약으로 맞추고 used/initial/시작 잠금의 이유를 분명히 표시한다. 이력은 시작일뿐 아니라 끝까지의 기간, 이전/이후 기준·사유·actor/시각 사건 상세를 실제 API에서 조회한다. 현재 코드는 view:revisions만 호출하고 사건 상세 진입이 없다. 현재/예정 요약과 등록 전 기준/구간 비교도 제공한다. 고정10행의 스크롤만으로 맞추지 말고 창에 맞는 Dense 페이지 조회를 제공한다.

정책 설명의 canonical metadata를 통일한다. service의 changed-worker-legacy 설명은 ‘실제 근무자 우선’, after-v1은 ‘교대근무 우선’으로 잘못 적혀 있다. 실제 종전/변경후 선택과 Pool·BP 공통 제외를 사용자에게 정확히 설명한다. 구현용 ID나 ‘크레딧’ 대신 실제 결과와 다음 행동을 안내한다.

### PH-D09 — 검증을 실제 거절 경로에 연결 (PH-R12)

정책18개는 실제 fresh PASS지만 위17개 위반을 막지 못했다. ‘PH01~PH09’라는 한 시험 이름은 각 필수 검문을 대체하지 못하고 PH10~12의 실제 거절/보존 검문이 빠졌다. 코드 수정과 함께 이 재현들을 PH01~12 및 기존 S03/S19/S20에 의미 있게 연결한다. source와 함수 이름만 보는 테스트나 fake 성공값은 금지. 기존1445항목의 유효 검문과 원 baseline1425는 삭제/skip/완화하지 않는다. 추가 항목 수를 정확히 보고한다.

performance.mjs:191에 `Applying inline style violates`를 통째로 무시하는 필터가 추가됐다. 이 필터로 CSP 오류를 숨겨 unexpectedErrors=0이라고 주장하지 않는다. 새 예외를 제거하고 실제 원인/원시 오류를 보존한다. 허용 범위 안의 제품 원인은 같은 Task에서 수정. 보호된 기존 원인이라면 원 상태·최소 gap을 보고하고 통과로 가장하지 않는다. 다른 기존 실패 API S13/S16도 여전히 원래 차단으로 남긴다.

제출 full-tests의 actualFiles는155, nested suites가408이다. 파일/시험/describe 수를 구분한다. 8개 제출 SHA는 실제 일치했지만 최종 source 고정·전체명령/RC·전체실행 후 변경 없음·실제 served JS/두 CSS 증거를 제공한다. native preview12단계/로그인된 후보 화면·이력page2·변경전후·잠금·실적 기준 캡처도 누락 없이 제공한다. 원본/기존 통과·재판독·새 실행·알려진 차단을 구분한다.

### 이번 재시도 검증 순서

아래 최초 §7 명령을 유지하되 먼저 기존4개 test 파일 안에서 PH-D01~D09 및17개 재현에 해당하는 실패/상태 전이 검문을 추가하고 focused로 확인한다. 새 파일/프레임워크는 필요 없다. 부모/child async 등 UI는 실제 source/서비스/API 경로를 검사한다. 모든 관련 검문 통과 후 candidate source를 고정하고 필수 전체를 각각1회 실행한다. 변경 없는 전체를 안심용으로 반복하지 않는다. 기존15초/test·Playwright timeout·두 번 같은 실패 진단 규칙을 유지한다. 원 미해결을 BLOCKED/실패로 보고하는 것은 허위 PASS보다 정확하지만, 필수 검문을 생략해 완료를 주장할 수 없다.

## 1. 목표와 비목표

대체수당 지급 대상 판정과 실제 근무자 판정 두 정책의 기준/적용 시작일을 버전별 보존한다. 9월 정책을 추가해도 7~8월 기준은 남고, 실적은 근무일의 정책을 선택한다. 예약 정책 정정·취소, 영향 확인, Dense 이력 조회와 실적의 적용 버전 표시를 제공한다. 이미 승인된 금액·판정은 보존한다.

첫 범위의 지원 기준은 기존에 실제 구현된 두 방식씩이다. 새 지급 공식·금액·법정 요율·임의 수식 편집기는 만들지 않는다. 날짜만으로 새 알고리즘이 생기지 않는다. 네 근무표 경고(야간/휴식/주간시간/휴무)는 일반 설정으로 유지한다. 다른 관리 메뉴·다크 모드·근무표 조정·출력 양식·운영 전환은 비목표. commit/배포/실제 운영 DB 및 원본 수정 금지.

## 2. 정본·보호 기준·착수 판정

- 계획: C:\Projects\Active\교대근무관리 시스템\.ai\plans\policy-history-20261103.md · 9202 bytes · SHA-256 3DD02864AEE3B420364E07B55B8484114F880CA158A8278FD43461328E79F04C
- 현재 TODO 검증 대상: C:\Projects\Active\교대근무관리 시스템\TODO.md · 80391 bytes · SHA-256 20C4F34F4C159ED14851F41E33C30AE476DDDBA69CF983D05C3760949FD06E67
- source500 기준: C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\baseline-source.json · 79851 bytes · SHA-256 B8F6500704E07D41919C801F46A569759A09BBCC5B00315EA153C87EDA9D06B7
- 기존 dirty153 상태: C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\baseline-git-status.json · 7408 bytes · SHA-256 5D50164A4800FE6F96AB4F64BD322755BE4FCA185F803E54F5EBE3E1E9E4BE66
- 원 git porcelain -z: C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\baseline-git-status.z · 6487 bytes · SHA-256 F5901290CE6DCCBAFAA914EB7679EA35E23B4A26887A3CCEFFC162C3E75187AF
- 허용55파일(기존45/신규10): C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\allowlist.json · 14315 bytes · SHA-256 8BABEC66309E92701379FAD97774D637A1401BAAD8364E09B044EA5D74DFC300
- 보호455파일: C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\protected-source.json · 72606 bytes · SHA-256 F55F570B2D9F7F4934A85C0C0C7160874770FE66EE579FD4AE56ED114B09BC25
- 사전 검문: C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\preflight.json · 2238 bytes · SHA-256 FB55109A491D9663E8DE2122A7E893270B900CA76C0A2D947E8812C3DACA2F5D
- 기존 전체 시험 목록: C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\baseline-test-inventory.json · 331123 bytes · SHA-256 2BF3A126F2243DC9E4C67D9C06038FDB4E748FAFF46689FFC20D9B1081968A4F
- 관련 기존 시험 결과: C:\Projects\Active\교대근무관리 시스템\.ai\reports\policy-history-20261103\affected-baseline-tests.json · 81569 bytes · SHA-256 3A14E86B0B0AA023AF9F0E4B9F20E72F77C3A5F7E5149E2EE8E3988A77B7B990

실측 사전 결과: source500 불변, 타입검사 RC0, 전체 lint RC0(오류0/기존 경고3), 관련16파일210시험 PASS(123.84초). 전체151파일1425시험은 collection만 실행했으며 전체 시험 실행으로 주장하지 않는다. 이전 운영 UI20/N12는 별도 기존 증거다. 이번 신규 producer/reader/API/UI/후보 회귀는 구현 후 실행한다. 존재하지 않는 새 코드를 구현 전 성공 조건으로 요구하지 않는다.

기존 lint 경고3은 보호 파일 allowance-document-export-service.ts:320/501, file-watch-runtime-service.ts:20이다. 이 파일들을 정리하지 말고 신규 경고를 만들지 않는다.

## 3. 수정 경계 — 닫힌 목록

읽기와 분석은 기존 소스를 사용할 수 있으나 아래 제품 파일만 수정/생성한다. 수정은 해당 요구사항에 필요한 hunk만; 허용 파일을 모두 수정할 의무는 없다. 새10파일은 아래 전략대로 사용한다. 목록 밖 파일이 실제로 필요하면 임의 생성/변경하지 말고 최소 gap·정확한 경로·이유를 회신한다.

| 경로 | 상태 | 허용 요구사항 |
|---|---|---|
| `src/shared/domain/policy-history.ts` | create | PH-R01~R04 domain/contracts |
| `src/shared/domain/policy-history.test.ts` | create | PH-R01~R04 domain/contracts |
| `src/shared/domain/performance-file.ts` | modify | PH-R01~R04 domain/contracts |
| `src/shared/domain/substitute-allowance-policy.ts` | modify | PH-R01~R04 domain/contracts |
| `src/shared/domain/changed-slot-priority-policy.ts` | modify | PH-R01~R04 domain/contracts |
| `src/shared/bridge/contracts.ts` | modify | PH-R01~R04 domain/contracts |
| `src/shared/bridge/channel-contracts.ts` | modify | PH-R01~R04 domain/contracts |
| `src/shared/bridge/channel-contracts.test.ts` | modify | PH-R01~R04 domain/contracts |
| `src/web/bridge/app-bridge.test.ts` | modify | PH-R01~R04 domain/contracts |
| `src/main/services/policy-history-service.ts` | create | PH-R01~R06 storage/preview/auth |
| `src/main/services/policy-history-service.test.ts` | create | PH-R01~R06 storage/preview/auth |
| `src/main/services/policy-history-impact-service.ts` | create | PH-R01~R06 storage/preview/auth |
| `src/main/services/policy-history-impact-service.test.ts` | create | PH-R01~R06 storage/preview/auth |
| `src/main/services/sqlite-storage-service.ts` | modify | PH-R01~R06 storage/preview/auth |
| `src/main/services/sqlite-storage-service.test.ts` | modify | PH-R01~R06 storage/preview/auth |
| `src/main/services/app-settings-storage-service.ts` | modify | PH-R01~R06 storage/preview/auth |
| `src/main/services/app-settings-storage-service.test.ts` | modify | PH-R01~R06 storage/preview/auth |
| `src/main/http/routes/operations-routes.ts` | modify | PH-R01~R06 storage/preview/auth |
| `src/main/http/routes/operations-routes.test.ts` | modify | PH-R01~R06 storage/preview/auth |
| `src/main/services/schedule-return-performance-parser.ts` | modify | PH-R07~R09 producer/cache/approval |
| `src/main/services/schedule-return-performance-parser.test.ts` | modify | PH-R07~R09 producer/cache/approval |
| `src/main/services/performance-file-intake-service.ts` | modify | PH-R07~R09 producer/cache/approval |
| `src/main/services/performance-file-intake-service.test.ts` | modify | PH-R07~R09 producer/cache/approval |
| `src/main/services/performance-file-storage-service.ts` | modify | PH-R07~R09 producer/cache/approval |
| `src/main/services/performance-file-storage-service.test.ts` | modify | PH-R07~R09 producer/cache/approval |
| `src/main/services/performance-management-service.ts` | modify | PH-R07~R09 producer/cache/approval |
| `src/main/services/performance-approval-flow-service.ts` | modify | PH-R07~R09 producer/cache/approval |
| `src/main/services/performance-approval-flow-service.test.ts` | modify | PH-R07~R09 producer/cache/approval |
| `src/main/services/performance-approval-snapshot-service.ts` | modify | PH-R07~R09 producer/cache/approval |
| `src/main/http/routes/performance-routes.ts` | modify | PH-R07~R09 producer/cache/approval |
| `src/main/http/routes/performance-routes.test.ts` | modify | PH-R07~R09 producer/cache/approval |
| `src/main/services/performance-test-helpers.ts` | modify | PH-R07~R09 producer/cache/approval |
| `src/main/services/policy-history-integration.test.ts` | create | PH-R07~R09 producer/cache/approval |
| `src/main/services/database-backup-service.ts` | modify | PH-R10 JSON compatibility |
| `src/main/services/database-backup-service.test.ts` | modify | PH-R10 JSON compatibility |
| `src/main/services/database-migration-service.ts` | modify | PH-R10 JSON compatibility |
| `src/main/services/database-migration-service.test.ts` | modify | PH-R10 JSON compatibility |
| `src/shared/domain/database-migration.ts` | modify | PH-R10 JSON compatibility |
| `scripts/verify-v3-json-migration.mjs` | modify | PH-R10 JSON compatibility |
| `src/web/screens/operations-settings.ts` | modify | PH-R11~R12 UI/actual checks |
| `src/web/screens/operations-settings-view.ts` | modify | PH-R11~R12 UI/actual checks |
| `src/web/screens/operations-policy-history.ts` | create | PH-R11~R12 UI/actual checks |
| `src/web/screens/operations-policy-dialog.ts` | create | PH-R11~R12 UI/actual checks |
| `src/web/screens/performance-actions.ts` | modify | PH-R11~R12 UI/actual checks |
| `src/web/screens/performance-detail.ts` | modify | PH-R11~R12 UI/actual checks |
| `src/web/policy-history.css` | create | PH-R11~R12 UI/actual checks |
| `src/web/index.html` | modify | PH-R11~R12 UI/actual checks |
| `scripts/copy-web-assets.mjs` | modify | PH-R11~R12 UI/actual checks |
| `scripts/ui-checks/operations.mjs` | modify | PH-R11~R12 UI/actual checks |
| `scripts/ui-checks/operations-fixtures.mjs` | modify | PH-R11~R12 UI/actual checks |
| `scripts/ui-checks/performance.mjs` | modify | PH-R11~R12 UI/actual checks |
| `scripts/ui-checks/performance-fixtures.mjs` | modify | PH-R11~R12 UI/actual checks |
| `scripts/ui-checks/allowance-fixtures.mjs` | modify | PH-R11~R12 UI/actual checks |
| `docs/codebase-map.md` | modify | PH-R11~R12 UI/actual checks |
| `docs/api-convention.md` | modify | PH-R11~R12 UI/actual checks |

보호: 목록 밖 모든 제품 파일, package.json/lockfile/의존성/런타임 설정/기존 계산 공식. `C:\Projects\Active\ShiftMgmt_V3.4` 및 아래 실제 JSON 원본은 읽기 전용. 제어 영역 AGENTS/PROTOCOL/GEMINI/CLAUDE/TODO/.ai/Log 수정 금지. 이 HANDOFF의 맨 아래 회신만 채운다. 빌드의 gitignored dist/**는 정확한 빌드 명령의 생성물만 허용하며 소스 범위에 포함하지 않는다. 임시 증거는 OS TEMP의 전용 policy-history-implementation-20261103 하위에만 쓴다. 새 검증 프레임워크·타 라이브러리·다른 AI CLI 호출 금지.

## 4. 요구사항

| ID | 요구사항 / 경계 |
|---|---|
| PH-R01 | 두 정책 종류별 기간/버전. 날짜순 구간은 다음 유효 시작일 전날까지. 등록 순번 Vn과 적용일을 구분. 기존 구간 보존. |
| PH-R02 | 기존 raw 저장 적용일과 기존 파서 동작을 그대로 초기 기준으로 보존. 빈 날짜는 종전 방식. 기록 없는 과거 변경은 추정 생성하지 않음. |
| PH-R03 | 관리자 새 기준 추가. 지원 ruleKey/실제 날짜/사유 검증, 같은 종류의 중복 활성 시작일 거부. 같은 적용 기준으로 의미 없는 새 버전 생성 거부. |
| PH-R04 | 미래·미사용·초기기준이 아닌 예약만 정정/취소. 원본은 보존하고 새 개정과 사건으로 기록. 승인에 사용한 기준과 도입 초기기준은 직접 변경 금지. |
| PH-R05 | 영향 미리보기는 정책/실적/계산 DB를 쓰지 않음. 실제 저장된 관련 대기 파일·행/승인 보존 건수와 새 구간을 표시. 최종 금액 예측으로 가장하지 않음. |
| PH-R06 | 서버 관리자 검증, actor/요청/정본 지문에 묶인5분 단일 사용 previewToken. 이전 미리보기/다른 사용자/기간중복/취소된 대상으로 확정 금지. |
| PH-R07 | 실제 엑셀 parser가 근무일별 정책을 적용하고 실제 사용 기준을 entry→저장→승인 snapshot→상세 reader까지 연결. 미적용 항목은 구분. |
| PH-R08 | 정책 영향 월의 대기 파일만 다시 읽음. zero-entry 파일도 월로 식별. 불변 파일 size/mtime 캐시와 파싱 도중 정책 변경도 처리. 승인 보관 파일은 정책 때문에 다시 읽지 않음. |
| PH-R09 | 사용자가 본 정책 지문과 승인 시점의 기준 대조. 승인·계산·정책사용 사건은 같은 트랜잭션. 실패하면 모두 rollback. 기존 승인 결과는 자동 갱신하지 않음. |
| PH-R10 | 새 JSON schemaVersion2/42표와 기존1/40표 명시 지원. 알 수 없는 표/열·부분 신규스키마·잘못된 정책참조 거부. 과거 승인 금액/원문 snapshot 보존. |
| PH-R11 | 현재/예정 정책 두 카드 + Dense 정책 이력·사건 상세(페이지네이션), 등록/미리보기/확정, 예약 정정/취소. 설정 저장과 정책 확정의 적용 시점을 구분. |
| PH-R12 | 실제 bridge/권한/API/엑셀/승인/JSON 및 원 기존 회귀를 검문. 로딩/오류/중복 클릭/늦은 응답/탭·세션 종료·키보드·5개 크기·금액 보존. |

## 5. Sol의 구현 전략 — 의존 순서 고정

### 5.1 도메인과 저장 정본

새 shared/domain/policy-history.ts에 타입·정렬·엄격한 날짜/키 검증·기간 선택·표시 유틸을 둔다. 종류는 substitute-eligibility / changed-worker-priority. 지원 키는 종류별 정확히2개: substitute-legacy / substitute-team-type-v1, changed-worker-legacy / changed-worker-after-v1. 서버에 고정한 기준 스냅샷을 저장하며 클라이언트 임의 criteria는 받지 않는다. 프로그램 판 번호와 정책 Vn은 별도다. 기존 두 domain 함수에는 명시적 ruleKey 선택을 추가하되 기존 effectiveFrom 입력의 순수함수 동작/원 시험은 보존한다. 생산 parser는 초기화 후 반드시 timeline 선택을 사용한다. 알 수 없는 키를 종전 방식으로 조용히 fallback하지 않는다.

SQLite에 정확히2표 추가(전체40→42):

- policy_revisions: id, policy_kind, version_number(종류별 증가), rule_key, criteria_json, implementation_version, effective_from(NULL은 도입 종전기준만), origin(initial/registered/correction), actor_user_id/login_id/display_name/role, created_at, reason. 종류+version 유일. 기준/날짜/사유 원본 row는 UPDATE/DELETE하지 않는다.
- policy_events: id, policy_kind, revision_id, event_type(initialized/created/corrected/cancelled/used), replacement_revision_id, before_json, after_json, actor snapshot, occurred_at, related_approval_id. 정책 참조 FK는 검증하되 related_approval_id는 기존 승인대기 되돌림 등에서 기록이 사라져도 이력을 보존해야 하므로 삭제 연쇄를 걸지 않는다. used 중복(정책ID+승인ID)은 유일하게 보장한다.

모든 개정은 처음 유효하며 corrected/cancelled 사건의 대상 revision을 제외해 현재 투영을 만든다. 정정은 새 Vn row를 추가하고 원 revision의 corrected 사건에 replacement ID와 전후 값을 기록한다. 취소도 사건 추가만 한다. 사용 사건은 한 번 승인에 쓰였다는 영구 잠금 근거다. 승인대기로 반환·숨김·보관 파일 정리 후에도 이 잠금이 풀리지 않는다. 목록에는 사용 집계만, 관리 변경 사건/사용 이력은 페이지 단위로 조회하며 한 row에 무한 사건을 붙이지 않는다.

초기화는 같은 DB에서 한 번·원자적으로 수행한다. 각 종류에 NULL 시작일의 종전기준을 두고 실제 저장된 raw 적용일이 있으면 해당 날짜의 현재 새 기준을 추가한다. actor는 초기전환 시스템으로 명시한다. 앱 설정 snapshot의 표시용 default를 근거 없이 적용일로 삼지 말 것: 현 parser는 raw getStoredAppSettingEntry 값을 사용하므로 이 동작과 일치해야 한다. 기존 승인/계산 row와 JSON snapshot은 초기화 때 UPDATE하지 않는다. 알 수 없는 과거 사용 ID를 추정 부착하지 않는다.

service는 전역 getter 외에 명시적 DatabaseSync/legacyDateValues를 받는 초기화 함수를 제공한다. JSON 복원의 임시 DB/호출자 소유 transaction에서 전역 live DB에 잘못 쓰지 않도록 한다. initialize/commit이 transaction을 직접 열었는지 추적하고 남의 transaction을 rollback하지 않는다. 새 service는 parser/intake/approval를 import하지 않는다(순환 참조 금지).

### 5.2 세 API와 영향 미리보기/확정

OperationsBridge와 CHANNEL_CONTRACTS에 세 메서드를 정확히 추가한다.

| 메서드 | channel | guard | activity |
|---|---|---|---|
| listPolicyHistory | operations:list-policy-history | admin | false |
| previewPolicyChange | operations:preview-policy-change | admin | false |
| applyPolicyChange | operations:apply-policy-change | admin | true |

전체 method111→114, operations36→39, 다른 group 수는 유지. operations의 기존 tracked21/untracked15에 commit1/조회2를 더해22/17이다. bridge는 현 manifest 자동 매핑을 재사용한다. route dispatch·브리지·metadata 동일성 시험은 정확한 새 개수/메서드로 확장하고 기존 핸들러 검증을 삭제하지 않는다. actor는 context.session에서만 받으며 service도 관리자 역할을 검사한다. 내부 승인 사용사건 함수는 새 관리 API로 노출하지 않는다.

list 입력: kind, view(revisions/events), optional revisionId, page/pageSize. 서버 범위를 검증하고 current/next 요약·total·정확한 page rows·registryConfigFingerprint를 반환한다. 최초 list/일반 settings 진입/첫 parser/backup에서 필요한 초기화를 끝낸다. preview는 미초기화이면 먼저 이력 새로고침을 요구하고 bootstrap까지 몰래 쓰지 않는다.

preview 입력: action(add/correct/cancel), kind, ruleKey/effectiveFrom/reason, 정정·취소 targetRevisionId, expected registry fingerprint. 유효한 세션/정책/날짜/사유·잠금과 구간을 검증한다. 사유는 공백만 거부하고 길이를 제한한다. 기본은 오늘·미래. 과거 추가는 사유·영향 확인으로 허용하지만 기존 승인 결과는 보존한다고 강조한다. 직접 정정/취소는 서울 오늘보다 미래이고 아직 used가 없으며 origin=initial이 아닌 대상만 허용한다. 같은 시작일 duplicate와 현재 유효 기준과 같은 ruleKey의 무변경 추가는 거부한다. 기간 중간 삽입도 다음 유효 시작일까지로 계산한다.

preview는 cached DB에 실제 있는 대기 파일·행을 기간으로 집계한다. 아직 미수집/미판독 파일은 숫자에 포함된 척하지 않는다. 파일은 scheduleMonth 기준으로 구간 교차를 판단해 zero-entry 파일도 재확인 대상에 넣는다. ‘재확인 대상 파일/현재 저장된 대기 행, 재판독 후 달라질 수 있음’으로 안내하고 새 금액을 계산했다고 표시하지 않는다. 보존되는 승인 건수는 분리한다. registry configuration, 대상 상태/사용여부, 관련 파일·행/승인 상태와 업무 폴더의 정본 지문을 담는다. preview 전후 DB/설정/실적/금액 지문이 같아야 한다.

서버 메모리5분 token에 정규화한 intent·actor userId/session·위 지문을 보관한다. apply는 token만 받는다. token 없는 직접 실행, 다른 actor, 만료, 이전 기준/관련 데이터 변경, 재사용을 거부한다. BEGIN IMMEDIATE 후 필요한 정본을 다시 검사하고 revision/event를 함께 저장한다. 정책 유효 투영 자체가 영속적인 재판독 신호이며 전역 consume marker에만 의존하지 않는다. 성공 뒤 token 소비·활동 기록. 실패/DB busy는 원자적이며 자신이 연 transaction만 rollback한다. 적절한 오류코드(예: POLICY_CONFLICT, POLICY_PREVIEW_EXPIRED, POLICY_IN_USE, POLICY_NOT_SCHEDULED, POLICY_RULE_UNSUPPORTED)와 다음 행동을 한국어로 제공한다. 기존 공통 인증/session 코드를 유지한다.

기존 saveAppSettings의 두 날짜는 이제 관리 writer가 아니다. 호환 payload의 변경 없는 값은 허용하되 bootstrap 이후 날짜 키를 다시 upsert하지 않는다. 값 변경은 POLICY_MANAGED_SETTINGS로 전체 저장 전에 거부하고 새 정책 관리로 안내한다. route는 첫 save도 초기화/검사를 거치게 한다. 저수준 saveStoredAppSettingEntry도 초기화 뒤 날짜 변경을 우회하지 못하게 한다. 초기화 전 fixture/raw 설정 준비와 기존 marker 순수 단위 검문은 유지한다. 일반15개 설정의 저장·되돌리기·다른 API는 보존한다.

### 5.3 실제 생산자·캐시·승인 reader 연결

기존 연결점: schedule-return-performance-parser.ts RowParseContext/resolveSubstituteAllowanceDecision 호출(1118), 변경 후 우선 선택(1266), context 생성(1944); performance-file-intake-service.ts canReuseStoredDetail(258), 실제 parser await(467)와 cache paths; performance-file-storage-service.ts upsert/read; performance-approval-flow-service.ts approvePerformanceFile/createApprovedPerformanceRecord; performance-approval-snapshot-service.ts normalizeEntry; performance-detail.ts row.entry.

PerformanceEntryRecord에 appliedPolicies?: PolicyApplicationSnapshot을 추가한다. snapshot은 workDate, 서버 생성 fingerprint, bindings[]를 포함하고 각 binding에는 kind/정책ID/Vn/ruleKey/당시 기준·적용일을 담는다. 대체 행은 실제 대체 판정 binding, 변경 후 우선 분기는 실제 사용한 실제근무자 binding을 남긴다. 적용이 없는 초과근무 등에는 빈 bindings와 유효 fingerprint로 ‘해당 정책 적용 없음’을 구분한다. 적용하지 않은 정책을 사용했다고 저장하지 않는다.

performance_entries에 nullable policy_snapshot_json, performance_files에 nullable policy_context_fingerprint를 추가한다. 파싱된 객체→DB 직렬화→역직렬화→승인 snapshot 생성/normalize→실적 상세까지 누락 없이 보존한다. 기존 substitute_allowance_policy_version 문자열을 정책의 유일 식별자로 재활용하거나 옛 승인 건에 새 ID를 추정 연결하지 않는다. policy metadata는 원천 엑셀 sourceSignature/보호 원본 지문에 섞지 않아 기존 승인 파일의 가짜 원본 변경을 만들지 않는다. 과거 approval-resolution의 파생 배분 예외를 일반 refactor하지 않는다.

파일의 월 지문은 해당 월 각 날짜에서 실제 선택되는 두 정책의 ID/기준 구간으로 계산한다. 전역 configuration 전체나 used 이벤트가 늘었다는 이유로 관계없는 월을 invalidate하지 않는다. pending의 cache가 이 지문과 다르면 기존 size/mtime가 같아도 재판독한다. 구형 pending metadata NULL은 한 번 실제 재판독해서 stamp한다. 다른 근무일의 기존 의미값은 유지한다. approved 경로에는 이 policy invalidation을 적용하지 않는다. listPerformanceOverview의 구 consume marker에 따른 전역 forceReparse를 새 timeline 모드에서 계속 쓰지 않는다. 사용자가 명시한 forceReparse 자체는 기존대로다.

parser는 같은 workbook에 하나의 고정 정책 snapshot/resolver를 사용한다. async 파일 읽기/파싱 시작과 저장 직전의 해당 월 지문이 달라졌으면 한 번만 다시 읽고, 다시 충돌하면 POLICY_CONTEXT_CHANGED와 재조회 안내를 내고 혼합 결과를 저장/승인하지 않는다. 기존 wageRevision 보호도 유지한다.

PerformanceApprovalActionInput에 expectedPolicyFingerprint를 추가한다. 화면 performance-actions.ts는 사용자가 본 row.entry.appliedPolicies.fingerprint를 그대로 보낸다. public performance route는 context.requireExpectedPolicyFingerprint=true를 전달해 새 필드를 필수로 검증한다. 없는/오래된 지문으로 정상 대기 실적을 승인할 수 없다. 기존 내부 자동 승인/단위 fixture의 함수 호출 호환은 context flag로 유지하되 현재 실제 binding 검사는 모두 거친다. 기존 사번·Pool/BP·재직·무효시급·품의잠금 오류 검증을 우회하지 않는다. 존재하지 않는 파일/행 등 원래 실패를 허위 승인으로 바꾸지 않는다.

승인 transaction 안에서 실제 row의 binding과 해당 근무일 현재 정책을 최종 대조한다. 미리보기 이후 정책 변경이면 승인·계산0, 화면 새로고침 안내. 승인 기록+계산 성공 뒤 COMMIT 전에 각 실제 binding의 used 사건을 동일 transaction에 기록한다. 계산 실패/예외 때 승인·계산·사용사건 모두 rollback. 사용자를 actor로 기록한다. 이 동작을 위해 승인 계산 공식·요율·금액 계산 service를 바꾸지 않는다.

실제 UI fixture의 approvePendingFile 호출에도 조회한 row의 expected 지문을 전달한다. performance.mjs, performance-fixtures.mjs, allowance-fixtures.mjs의 기존 기대 금액·건수·실패 사유는 유지한다. 행을 직접 insert하는 새로운 실적 fixture나 정책 검사 우회 mock을 만들지 않는다.

### 5.4 JSON 백업·복원과 구형 데이터

새 export는 schemaVersion2, 사용자 표42개. 기존 exporter의 전체 표 열거를 유지하고 초기 정책 baseline을 확실히 포함한 뒤 snapshot을 만든다. 원래40표/기존 필드를 바꾸거나 누락하지 않는다.

restore는 명시적 버전 분기다: v1=기존40표, v2=새42표. 각 버전에서 정확한 표·열 계약을 검사한다. v1에서만 새 policy metadata 두 nullable 열을 NULL로 정규화하고 기존 email/holiday_policy_json 호환 예외를 유지한다. 임의 누락/추가 열을 일반 허용하지 않는다. v2의 일부 신규 표/열 누락, unsupported ruleKey, 잘못된 기준 스냅샷·중복/끊긴 기간·잘못된 policy/사용 사건 참조는 거부한다.

v2는 backup의 정책 revision/events를 함께 복원하고 이 timeline을 판정 정본으로 쓴다. v1은 기존 app settings 경로/운영설정 병합 규칙을 그대로 수행한 **최종 target raw 적용일**로 초기 정책을 만든다. 현재 기존 복원은 target policy dates를 유지하므로 이를 임의로 source 값으로 바꾸지 않는다. getStoredAppSettingsSnapshot의 default로 빈 raw 값을 새 정책 시작일로 꾸미지 않는다. bootstrap은 finalSettingsRows 삽입 뒤 caller-owned restore transaction에서 명시적 DB에 수행한다. v2에서 legacy 표시 키가 timeline을 덮어쓰지 않는다.

기존 승인/계산 snapshot_json 원문·금액은 NULL metadata가 추가돼도 그대로. 근거 없는 옛 ID를 붙이지 않는다. old UI는 ‘이전 기록 — 정책 연결정보 없음’으로 읽는다. JSON preview fingerprint는 모든42표를 포함해야 하고 확정 때 source SHA/대상 DB 지문 재검증을 유지한다. backup 원본은 읽기 전용.

기존 migration 회귀의40개 고정은 **source v1=40 / current target=42**로 명시 변경한다. expected를 단순 낮추거나 원래 canonical 비교를 제거하지 않는다. verify-v3-json-migration.mjs의 원 source40/3599 검문과 기존 사업표 전체 canonical·승인64건 합계13,611,839원을 유지한다. legacy source 정규화는 신규 nullable metadata 두 열만 추가 허용하고 신규2표의 초기 provenance/정합성을 별도로 검사한다. 원본 전체 SHA를 시작/끝 확인한다.

### 5.5 실제 UI와 파일 크기

현행 DOM/WorkforceDialog/operations-ui/공통 controls를 재사용하며 React·의존성을 추가하지 않는다. 기존 웹 분위기와 Dense를 유지한다.

- settings의 앞4개 경고는 유지. 두 날짜 단독 편집은 현재/예정 정책 카드로 대체하고 각 종류 ‘새 정책 추가/이력’ 제공.
- main 화면은 현재/예정 요약만 두고 긴 이력은 dialog에 Dense table과 페이지네이션으로 표시한다. 버전/상태/적용 기간/기준/등록자·시각/상세. 사건 전후·사유는 별도 상세, 사용 이력도 페이지 단위. 줄바꿈·불필요한 세로 스크롤 최소화.
- 등록: 기준·적용일·사유 → 영향 확인 → 확인 후 등록. 입력을 바꾸면 이전 token 즉시 폐기하고 다시 영향 확인. 예약 정정·취소도 같은 경로. 사용/초기/시작한 정책의 변경 버튼은 이유와 함께 잠금.
- “정책은 확인 후 등록하면 저장됩니다. 아래 설정 저장은 일반 설정/네 경고에 적용”을 안내해 독립 저장을 오해하지 않게 함. 일반 draft/백업 실행 중 정책 충돌도 isBusy로 보호.
- 실적 상세에는 실제 snapshot 버전/기준을 안전한 DOM 또는 escapeHtml로 표시. 기록 없음과 미적용을 구분. 관리자 history 전체를 비관리자에게 새 API로 공개하지 않음.
- 요청 generation/session/destroy/preview ownership을 관리한다. 늦은 list/preview/save가 최신 필터/다른 모달/로그인 화면을 덮지 않게 하고 중복 확정은1회. 키보드 focus trap/Escape/원래 버튼 복귀/label 연결 유지.

각 UI TS/CSS는30KiB(30720 bytes) 이하. 현 settings.ts30584, view26665, operations.css30691이므로 단순 코드를 덧붙이지 않는다. 필요한 범위로 기존 policy 폼4경고 생성을 view helper로 옮기고 obsolete 두 날짜 help/폼을 제거해 공간을 확보한다. 새 operations-policy-history.ts는 현재/이력 조회·paging·수명, operations-policy-dialog.ts는 draft/preview/confirm/modal 소유권 담당. 부모 init/isBusy/destroy에 정확히 통합하고 기존 저장·되돌리기를 유지한다. 일반 수정 입력은17→15, readonly3 유지=총18. 두 정책의 help/기준 안내는 새 카드/대화상자로 대체해 설명이 사라지지 않게 한다.

새 policy-history.css를 index.html에서 로드하고 copy-web-assets.mjs에서 복사한다. 기존 operations.css는 보호 상태를 유지한다. runner 실제 제공bytes 검문에 새 CSS도 포함한다. main1707×825/1440×900에서 기본4영역이 과도하게 늘지 않도록 맞추고 작은 화면은 내용 접근을 보장한다.

## 6. 검문 ID — 구현 후 반드시 실행

새4개 test 파일에 PH01~PH12 이름을 포함한 실제 검문을 최소1개씩 둔다. 테스트는 구현을 그대로 복사한 형태가 아니라 다음 실패·상태 전이를 검증해야 한다.

| ID | 실제 검문 |
|---|---|
| PH01 | raw 빈 날짜/서로 다른 시작일 초기 전환, 반복 초기화 idempotent, 과거 승인 row/스냅샷 불변 |
| PH02 | 실제 달력/윤일/종류·ruleKey/중복 시작일/같은 기준 no-op 거부, 기존 두 정책 단위 계약 유지 |
| PH03 | 6/30,7/1,8/31,9/1 경계; 9월에 다른 지원 기준(V3, 예: 종전 방식 복귀)을 추가해도7~8월V2 유지; 두 종류의 다른 날짜 |
| PH04 | 예약 정정/취소의 원본·전후·actor, 초기/이미시작/사용 정책 거부; 취소 후 기간 연결 |
| PH05 | public3API 관리자만, 기존 설정/저수준 날짜 writer 우회 거부, manifest114/operations39 동일성 |
| PH06 | preview 전체 DB 불변, 실제 대상/zero-entry 파일, actor·intent·5분 만료·token 재사용/직접실행 거부 |
| PH07 | 미리보기 이후 registry/대상/사용/관련 데이터 변경 확정 거부, 실패 mutation0 |
| PH08 | 파일 size/mtime 동일해도 영향 월만 재판독, 관계없는 월/승인 cache 보존, 파싱 도중 정책 충돌 |
| PH09 | 실제 엑셀→parser→entry storage→reader→승인 snapshot→상세 기준 보존. legacy binding없음/미적용 구분 |
| PH10 | public 승인 누락·stale 지문 차단; 승인·계산·used 원자성, 계산 실패 rollback, 되돌림/숨김 뒤 사용 잠금 |
| PH11 | 새 v2 JSON roundtrip와 기존v1 전환; 모든 사업 값·승인금액·원문 snapshot·정책/사건 보존 |
| PH12 | v2 신규표/열 누락·unknown·잘못된 정책/사용 참조, v1 임의 누락 거부; 미리보기/실행 실패 live DB 보존 |

기존 baseline151파일1425항목을 보존한다. API/표 개수 설명의111→114,36→39,source40/target42 등 승인된 계약 변경에 따른 시험 문구/fixture metadata 갱신은 변경 이유를 목록화한다. baseline 항목을 삭제/skip하거나 허용오차·가짜값으로 성공시키지 않는다. 최소 전체155파일/1437항목(기존1425+PH01~12 이상)이며 신규 실제 testcase 수를 명시한다. baseline inventory와 후보 collection을 대조한다.

operations.mjs의 기존 S01~S20/N01~N12를 유지한다. 새 정책 흐름은 S03(저장/이력/preview/정정취소/일반 날짜 우회), S19(권한·세션), S20(18필드/경고4+정책2안내/새 dialog date/페이지·키보드·5크기)에서 검문한다. 기존 date 검사 의도를 새 관리 form으로 이전하고 원 오류/취소/금액 보존 의무를 지우지 않는다. N03 settings date 의미도 새 실제 policy validation으로 커버한다. 중복 생성·stale preview·늦은 응답·token 재사용의 실제 거절 증거를 추가한다. 가짜 DOM/텍스트만으로 만든 성공은 금지한다.

## 7. 정확한 실행 명령·최종 판독

실행 cwd는 제품 저장소. 먼저 OS TEMP에 policy-history-implementation-20261103 전용 폴더를 만든다. 증거에 실제 argv/시각/RC를 남긴다. 아래 각 명령은 실패를 가리는 shell chain으로 묶지 않는다.

1. `npm run typecheck` → RC0.
2. `npm run lint` → RC0, 오류0, 위 기존3경고 외 신규 경고0.
3. `npm run validate:map` → RC0, 신규10파일 등 실제 등록 경로 대조. 새 UI 파일 크기 검문.
4. `npx vitest run src/shared/domain/policy-history.test.ts src/main/services/policy-history-service.test.ts src/main/services/policy-history-impact-service.test.ts src/main/services/policy-history-integration.test.ts --maxWorkers=1 --minWorkers=1 --no-cache --reporter=json --outputFile=C:/Users/pangyo/AppData/Local/Temp/policy-history-implementation-20261103/policy-tests.json` → RC0, PH01~12 전부.
5. `npm run build` → RC0. dist는 후보 source에서 만든 실제 server/browser여야 한다.
6. `node scripts/ui-checks/operations.mjs --focus=S03,S04,S19,S20 --port=19110 --out=C:/Users/pangyo/AppData/Local/Temp/policy-history-implementation-20261103/ops-focused` → RC0/PARTIAL_PASS4/20, 새 실제 workflow 포함. 부분 결과를 전체 통과로 쓰지 않는다.
7. 후보 source를 고정한 뒤 전체 단위1회: `npm test -- --no-cache --reporter=json --outputFile=C:/Users/pangyo/AppData/Local/Temp/policy-history-implementation-20261103/full-tests.json` → RC0, success=true, failed0/skipped0, baseline1425 보존 + 새 필수 PH12 이상. 실제 file/test 수를 판독한다.
8. 전체 운영 UI1회: `node scripts/ui-checks/operations.mjs --port=19110 --out=C:/Users/pangyo/AppData/Local/Temp/policy-history-implementation-20261103/ops-full` → RC0/PASS/fullRun=true/exactScenarios=true, 정확20개/N01~N12 true, failed0/unexpectedErrors0. 새 CSS 포함 실제 제공bytes.
9. 기존 실적 UI 회귀1회: `node scripts/ui-checks/performance.mjs --port=19112 --out=C:/Users/pangyo/AppData/Local/Temp/policy-history-implementation-20261103/performance-full` → 원래 알려진 S13(반려 미지원),S16(계산 이력 있는 숨김 거부)2건은 그대로 BLOCKED. 기대 RC2/PARTIAL_BLOCKED, completed18/blocked2(정확S13/S16)/failed0, N12 true/unexpectedErrors0. 이 보호 API를 이번 Task에서 성공 처리하도록 바꾸거나2건을 PASS라고 기록하지 않는다. 추가 실패/차단은 허용하지 않는다.
10. 실제 구형 JSON 회귀1회:
`node scripts/verify-v3-json-migration.mjs --input "C:\Users\pangyo\AppData\Roaming\shiftmgmt-v3-4\data\backups\json\shiftmgmt-backup-20260917-194251.json" --expected-sha EFEC1F0EF364E6CA4D88DBBCF8D52E88FFDC2EAC452E258CA7D09B4BDDE28DB9 --expected-tables 40 --expected-rows 3599`
→ RC0. source40/3599/3,217,906bytes 불변, target42표와 초기 policy provenance 추가 검문. 원 사업표 canonical 및 승인64건13,611,839원 보존. 원본은 read-only, 임시 DB만 사용.
11. `git diff --check`와 source/protected hashes/상태 대조 → 범위 밖0, 보호455불변, 기존dirty153보존. 새 source510 예상. no dependencies/config/commit/release. 실패 출력과 후보 전후 지문을 보존.
12. native 확인: `node scripts/ui-checks/operations.mjs --preview --port=19114 --out=C:/Users/pangyo/AppData/Local/Temp/policy-history-implementation-20261103/preview`로 로그인된 실제 정책 화면을 열고 아래 UI 증거를 제공한다. 원래19100 창을 운영 화면으로 오인해 수정하지 않는다.

새 policy-history.css가 실제 빌드/서버에서 제공되는지 JS/CSS bytes/전체SHA를 확인한다. 관련focused를 먼저 통과하고 전체 단계7~10은 각각1회 목표다. 새 실패가 있으면 원 실패를 보존하고 변경한 원인과 필요한 범위를 기록한 뒤 해당 부분부터 재실행한다. 동일 입력 같은 실패2회는 전체 반복을 멈추고 Sol에게 진단을 돌린다. Vitest 기존15초/test와 Playwright 기존 timeout은 유지한다. 존재하지 않는 새코드 시험을 사전 승인 조건으로 쓰지 않는다. 전체 단위5~15분/UI각3~10분은 추정이며 실측치가 아니다. 시간 경과를 시험 생략이나 완료 판정의 근거로 쓰지 않는다.

## 8. 실제 UI 합격 기준

- 1024×768,1280×720,1440×900,1707×825,2048×1080. 넓은 화면의 기본 settings/footer가 잘리지 않고 정책 카드가 Dense로 들어옴. 작은 화면은 입력/표/버튼 접근 가능.
- 두 종류의 현재·예정·이력 표시. 새 정책을 미리보기 뒤 등록하고 이전 구간과 새 버전을 실제 조회. history 페이지2 이동·종류 변경·상세 전후/사유. 예약 정정·취소/미리보기 취소에서 원본과 금액 보존.
- 입력을 바꾸거나 다른 관리자가 기준을 바꾸면 기존 미리보기로 확정 불가. double-click1회. 미사용/used/기초전환 기준 잠금 이유를 읽을 수 있음.
- 네 경고·일반 설정 저장/되돌리기·공통 time·새 정책 date·감시·백업 보존. 정책 등록이 일반 draft를 몰래 저장/초기화하지 않음.
- Escape·Tab/ShiftTab·focus 복귀, label과 오류 연결. 한글 사유/HTML처럼 보이는 문구는 literal. 늦은 응답/탭·세션 종료에서 최신 화면/모달 소유권 보존.
- 실제 엑셀 fixture로 만든 대기/승인 행에서 적용 버전 확인. 기존 승인 금액은 새 정책 등록 뒤 동일. 잘못된 역할은 실제 API에서 거부.
- 캡처: 두 정책 요약/이력 page2/변경 전후 상세/영향 확인/예약 정정·취소/사용 잠금/실적의 적용 기준/작은 화면. fixture만 사용하고 bootstrap password/session/recovery key를 보고서나 캡처에 쓰지 않는다.

## 9. 안전·성공 판정·반환 조건

승인+계산 원자성, forward-only, 근무일 기준, Pool/BP 및 사번 gate, 원 실적은 엑셀 intake만, 기존 품의 잠금/출력 이력/JSON 미리보기-실행 짝을 유지한다. 기존 보호455와 계산 공식을 건드리지 않는다. 스키마 변경은 로컬 개발/임시 검문에 한정하며 운영 적용 승인을 포함하지 않는다.

Action CORRECT는 아래 PH-D01~D09를 같은 Task/허용목록에서 수정하는 실제 구현 지시다. 요구/파일/기준 사이 모순, protected hash 불일치, 예상 밖의 초기 변경, 필요한 미허용 파일/지원하지 않은 기준이 있으면 제품을 임의 변경하지 말고 구체 gap으로 회신한다. 계약이 요구하는 새 producer/readback/승인/실제UI/JSON 검문은 구현 후 필수다. 전체 검증이나 원 거절 API를 약화하지 않는다.

이 Task의 IMPLEMENTED는 Gemini 제출이며 Sol의 최종 수용이 아니다. 현재 시도 최초1의 실제 제출일·결과를 회신에 기록하고, Sol이 최초/재시도/누적 장부를 갱신한다. TODO/.ai/Log를 직접 수정하지 않는다.


## 회신

판정: 미제출
Task: POLICY-HISTORY-01 / CORRECT / 동일 구현 Task
현재 시도: 최초 제출1회 검수 실패, 이번 재시도 요청. 실제 재제출 전 재시도0/누적1
실제 구현 도구·담당/권한 근거(원 수신본은 보존): 미제출
기준 source510/dirty176/보호455와 착수 확인: 미제출
변경 파일/PH-R·PH-D 매핑/범위 밖0: 미제출
PH-D01 원인→수정→실제 재현·결과: 미제출
PH-D02 원인→수정→실제 재현·결과: 미제출
PH-D03 원인→수정→실제 재현·결과: 미제출
PH-D04 원인→수정→실제 재현·결과: 미제출
PH-D05 원인→수정→실제 재현·결과: 미제출
PH-D06 원인→수정→실제 재현·결과: 미제출
PH-D07 원인→수정→실제 재현·결과: 미제출
PH-D08 원인→수정→실제 재현·결과: 미제출
PH-D09 원인→수정→실제 재현·결과: 미제출
PH01~PH12/17개 원 재현의 실제 차단·보존: 미제출
명령별 argv/시각/경과/RC/파일수·시험수·nested suites 구분: 미제출
실패 원문·분류·원인 변경·재실행 이유: 미제출
필수 전체/운영20N12/실적18+S13S16/JSON 원본과 승인금액 보존: 미제출
native 후보 URL/정책 현재·예정·사건 상세·page2·preview·잠금·실적 snapshot 캡처: 미제출
source 고정/actual served bytes/전체 SHA64자/보호455/원본 JSON SHA/원dirty153 보존: 미제출
의존성·설정·commit·배포 변경: 미제출
미해결·추측·최소 gap: 미제출
