# HANDOFF — Phase3-2c 독립 검수 종결 / FAILED · REPLAN

- Action: REVIEW_RESULT / REPLAN_REQUIRED — 제품 구현 지시 아님
- From: Sol(frontier, 유일한 오케스트레이터)
- To: 사용자 / Gemini(검수 결과 참고)
- Time: 2026-10-01 16:37:56 KST
- 회신: 불필요
- 판정: **FAILED / REPLAN. 구현 제출 수용 보류.**
- Repository: `C:\Projects\Active\ShiftMgmt_V4` / main
- Full HEAD: `160940f9aaeb6696538447f83b44658073e382f0` / 새 commit·push·배포 없음
- 수신 원본: `C:\Projects\Active\교대근무관리 시스템\Log\20261001_160642_3-2c-Gemini-IMPLEMENTED_수신원본.md`
- 수신 bytes: 52871 / SHA-256 `48384DE2A5195055B384B7B6C62A3401C1FCDB9F55A52B2755A9372CDFEF2DAB`
- 독립 증거: `C:\Projects\Active\교대근무관리 시스템\.ai\reports\phase3-2c-review-20261001_160642` / `final-evidence.json`
- 종결 불변 기록: `C:\Projects\Active\교대근무관리 시스템\Log\20261001_163756_3-2c-Sol-FAILED-REPLAN_독립검증종결본.md`

## 1. 결론과 현재 권한

정상 실행 10case와 기존 133파일·919시험은 Sol 독립 실행에서 통과했다. 그러나 검증기 자체를 시험한 7개 변조 실행 중 6개가 RC0/PASS를 반환했다. 잘못된 표시 값, 예상외 오류, 결과 파일 쓰기 실패를 성공으로 받아들이므로 V32-01/04/05/06을 수용할 수 없다. 제품 화면 결함을 새로 발견했다는 뜻이 아니라, 오류를 잡아내는 검증기 계약이 불완전하다는 뜻이다.

기존 R32C-06과 연결된 허위 통과 결함이다. 이전 CORRECT1/2 두 번 실패 후 발송한 구조 재설계 제출도 계약을 다 충족하지 못했다. 수정 회수를 자동 초기화하거나 CORRECT3를 발송하지 않는다. 이번 IMPLEMENT 패킷은 이 문서로 종결한다. Gemini는 이 종결문으로 제품을 추가 수정하지 않는다. 다음 발송은 Sol이 독립 검증 계약을 먼저 확정한 새 패킷이어야 한다.

## 2. 범위·불변 조건 검증 — 제품 PASS / 중계 본문 이력 일부 UNVERIFIED

- 원본 52,871bytes를 Log에 보존한 뒤 해시·바이트 동일을 확인했다.
- 정확한 `## 회신` 단독 행으로 본문을 분리하면 09:20 발송보존본과 수신본문은 R32-09 집계 설명·원 IMPLEMENT의 동결 설명 두 hunk가 다르다. 이 두 설명은 이번 회신 이전 사용자의 「다음은 무슨 작업해야해?」 질문 때 이미 읽은 현재 HANDOFF에도 있었다. 마지막 실제 중계본 전체 bytes/hash가 없어 본문 불변의 전수 판정은 UNVERIFIED, Gemini가 바꿨다는 귀속도 미확정이다. 현재 명시된5파일/341/12/336 보호 경계를 기준으로 제품 검수했다. 정확diff는 request-body-diff.patch, 정확행 원본 검사는 sol-request-body-check.json.
- main/HEAD 동일, 현재 변경 12경로, 제품 소스 341파일. 기존2 변경+신규3 = 허용5파일만 baseline에서 달라졌다. 보호336파일 SHA/bytes 전부 일치.
- 제출12파일의 SHA-256/bytes가 실제 파일과 일치. 모든 .mjs 파일은 30,000bytes 이하.
- 잠긴 Control 정본15파일은 검수 중 모두 불변. TODO/current-state 갱신은 검수 대상 종결 후 Sol이 수행한다.
- Sol 검수 전·정적/빌드 후·Chrome 후·변조 후·최종 제품341파일 해시/바이트/HEAD/status 동일. Sol 제품 소스 변경0.
- 실제제품 UI/CSS/셸/모델, DB/API/권한 정책, 계산 코드, 의존성, 공통 검증 helper 변경0. V3.4 수정0.
- map90 명령 통과. 지도 변경 범위는 신규3개 검증 모듈 추가이며, 기존87경로 보호를 별도 재구성 해시로 교차검토했다(세부 근거 final-evidence).

## 3. Sol 독립 명령 결과

| 게이트 | 실제 결과 | 증거 |
|---|---|---|
| typecheck | RC0 | typecheck.command/stdout/stderr |
| 네 모듈 각각 node --check | 모두RC0 | syntax-*.command/stdout/stderr |
| lint | RC0, 기존5warnings, errors0 | lint.* |
| validate:map | RC0, 경로90 | map.* |
| git diff --check | RC0 | diff-check.* |
| build | RC0 | build.* |
| 관련 vitest | RC0, 3파일11시험 | focused-tests.* |
| npm test | RC0, 133파일919시험, 293.97초 | full-tests.* |
| Chrome10case | 모든 실행RC0, 캡처13개 실제존재 | case-results.json / normal-capture-index.json |
| CLI 기존7음성 | 모두RC1 | cli-negative-results.json |

각 정확 argv/작업 경로/시각/PID/RC/stdout/stderr는 `C:\Projects\Active\교대근무관리 시스템\.ai\reports\phase3-2c-review-20261001_160642`의 `.command.json`에 기록했다. 정상 실행의 RC0는 해당 구현이 실행한 축약 시험의 성공이다. §9.2의 모든 하위 동작이 실행됐다는 뜻으로 확대하지 않는다. 원본 제출의 자기보고와 Sol 독립 결과를 구분한다.

## 4. 검증기 변조 시험 — FAIL

정확 재현: `python "C:\Projects\Active\교대근무관리 시스템\.ai\reports\phase3-2c-review-20261001_160642\fault-runner.py"`. 이 시험은 자기 고유 ignored artifact에 복사한 preload만 사용하며 제품 소스를 수정하지 않는다. 각 실제 Node argv·file URI·시각·RC·원출력·주입 관측·생성된 캡처/manifest 경로는 `fault-results.json`에 보존했다. 아래 결과는 원 실행값이다.

| 주입 | 실제RC | 판정 |
|---|---:|---|
| date-90x24 | 1 | 정상 거부 |
| date-tolerance | 0 | 허위 통과 / 계약 위반 |
| list-values | 0 | 허위 통과 / 계약 위반 |
| unexpected-console-401 | 0 | 허위 통과 / 계약 위반 |
| no-cookie-500 | 0 | 허위 통과 / 계약 위반 |
| negative-context-close | 0 | 허위 통과 / 계약 위반 |
| owner-manifest-write | 0 | 허위 통과 / 계약 위반 |
| cli-zero-args | 0 | 허위 통과 / 계약 위반 |

- date-90x24: 실제90×24 관측 후 width 비교에서 RC1. 날짜의 큰 실측 변조 거부 개선은 인정한다.
- date-tolerance: 실제133.5×34, 기대132×34 및 허용오차≤1px인데 RC0. caller가2/4px tolerance를 넘겨 계약이 약화됐다.
- list-values: 첫 두 행의 ID순서 교환, 201건을 `전체 999건 중 999건 표시`로 변경, 상세 title을 `상세 활동 내용`으로 자름, 승인 배지 색을 rgb(255,0,255)로 바꿈. 각각 실제 DOM 관측 후 RC0. 행 수·class 포함 여부·title substring만 검사해 잘못된 실제값을 통과시켰다.
- unexpected-console-401: `SOL_UNEXPECTED_UNRELATED_CONSOLE_ERROR_401`가 raw console에 기록됐지만 문자열에401이 있다는 이유로 제외, RC0.
- no-cookie-500: 무cookie direct 응답을500/SOL_UNRELATED_SERVER_FAILURE로 바꿨는데 `!ok`이면401검사 성공으로 인정, RC0. 실제 서버의 정상401을 부정하는 시험이 아니라 검증기의 정밀 거부 능력 시험이다.
- negative-context-close: 실제 자원 종료 뒤 정리 예외를 주입했지만 catch로 버리고 RC0. 이 주입 자체는 실제 브라우저 누수를 남기지 않았다.
- owner-manifest-write: owner-final.json 쓰기를 실제 거부했으며 파일이 없는데도 stdout `status:PASS, exitCode:0, tempCleaned:true`.
- 별도 CLI zero-args: 정확 단일case 인수 계약인데 인수 없이 live-admin을 실행하여 RC0. 기존7개 음성 입력 거부는 유지되지만 이 경계는 미해결이다.

## 5. 내부 worker 우회·정본 fixture — FAIL

`node "C:\Projects\Active\교대근무관리 시스템\.ai\reports\phase3-2c-review-20261001_160642\private-worker-probe.mjs"`를 제품 작업 경로에서 실행했다. Sol 소유의 임시 health/page stub와 가짜 bootstrap만 제공하여 `access-history-positive.mjs --case=sol-unregistered-case`를 owner 없이 직접 시작했다. 실제 RC0, assertions=[]이며 health·page·favicon 요청을 보냈다. 시험 등록·owner/PID/nonce 검문 전에 네트워크·브라우저가 실행된다. 자기 stub 서버 종료와 가짜 bootstrap 삭제를 확인했다. 증거 `private-worker-probe.json`.

`contract-probe.mjs`에서 shared fixture를 실제 compiled accessLogActionLabels와 대조했다. schedule-publish의 기대 문구는 `근무표 배포`, 현재 fixture는 `근무편성공개`이다. V32-02의 정본 라벨 전수 대조가 없다. 알려지지 않은 case의 빈 coverage도 통과했다. 증거 `contract-probe.json`.

## 6. 결함 대조와 위치

| ID | 요구사항 / 원인 | 실제 파일·줄 | 다음에 충족할 조건 |
|---|---|---|---|
| V32F-01 | V32-01/05 필수coverage 축약, 상수true, unknowncase 빈집합 | shared:5,161; positive:64,68,119,180,187; negative:73 | §9.2의 모든 하위 동작에 고정ID·독립 기대값·실제 관측, case/ID 집합 정확 일치, 누락/추가/중복 모두FAIL |
| V32F-02 | V32-01/02 tolerance2/4, ID/순서/count/style/title 미검사, fixture 라벨 drift | positive:94–127; shared:130,179 | 수치 tolerance≤1, 전체ID/순서/총수·남은수, 전체 text/title, 배지 computed style·문구, compiled labels 전수일치 |
| V32F-03 | V32-03/05 예상오류 broad401, nonOK=401, errorCode/data/phase 없음 | negative:104–131,149–157 | method/path/channel/status/errorCode/requestId/phase/횟수 정확 매핑, 그 외 console/HTTPFAIL; 올바른401+정확code+data없음 실제대조 |
| V32F-04 | V32-04/06 정리 예외 및 manifest 쓰기 오류 소거 | negative 마지막finally; owner:135–155,179–182,271–300 | 모든 정리/증거 쓰기 실패가overallFAIL; timeout을 실제server/child종료로 인정하지 않고close/PID 생명주기 증명 |
| V32F-05 | V32-04 public zeroargs/비원자runDir/privateworker 소유 검문 없음 | owner:24–47,200–220; positive:17–32; negative:19–35 | 정확1case, 원자적dir, worker knowncase+parent/nonce/ownedbootstrap 검문 전 spawn/network0; arbitraryenv 우회0 |
| V32F-06 | V32-06 child 원출력/부분manifest·capture 링크/첫 실패 누락 | owner:169–176,271–284; positive 마지막write | stdout/stderr·각capture·raw events·비교 기록·첫stack·정리·부분/최종 결과 정확경로 보존, 실패경로도 기록 |

coverage 누락은 live의 real list/users·최신순/held refresh, 목록의 구조/배지전체/invalidtime/XSS실행, G2의 loading/error·본문수치/reset값, filter5query·빈경계/불가능일·타이머경합/실제Tab/caret, users오류/oldfinally, oldsuccess/error/AUTH·destroy3종·currentAUTH, admin users API와 session errorCode를 포함한다. shared의 현재 필수ID는8case의 일부만 포함하며 regression2는 별도 owner 실제결과가 필요하다. Held release 자체에 유한timeout·정확횟수·query/timestamp 관측도 없다.

이는 정적 소스 근거로 확인한 누락이며, 빠진 모든 UI 동작이 제품에서 실패한다고 주장하지 않는다. server stop timeout/owner token 관련 전체 오류 가지의 재현은 UNVERIFIED이다. 이번에 직접 재현한 실패는 §4/5의 경우이며 그 범위를 넘겨 완료를 주장하지 않는다.

## 7. 전략 평가와 다음 단계

네 검증 모듈로 나누고 공통 정상 driver를 재사용하는 구조는 유지할 수 있다. 실패 원인은 코드가 스스로 축약한 coverage를 자기검사하고, 기대값·오류 예외·종료 성공을 임의로 넓힐 수 있게 남긴 것이다. 같은 문장을 다시 전달하여 수정 회수를 재개하지 않는다.

다음 Sol 작업은 **구현자 수정 범위 밖의 독립 검증 계약을 먼저 고정**하는 것이다. §9.2 전체를 case별 하위ID/정본출처/expected/관측소스/요청count·phase·time/실패 주입으로 전개하고, 정리·파일쓰기·worker 검문을 별도 선행게이트로 고정한다. unknowncase/축약coverage/상수actual/넓은error예외가 Sol 검수에서 기계적으로 거부돼야 한다. 그 후 shared/owner 선행 구조→positive/negative 전체 시나리오의 순서로 작게 닫힌 구현 패킷을 준비한다. 각 단계의 수용 조건과 이전 실패 누적을 보존하며 최종10case는 마지막 전체게이트다.

이는 재계획 방향과 다음 책임을 명시한 것이며 READY_TO_CODE 선언이 아니다. 현재 수정 허용0. 새 패킷의 후보 경계는 기존4검증모듈만, map·UI·helper·API/DB/auth/의존성 등337기존파일은 보호, 새제품파일0이다. 제품 목표와 Phase3 순서는 그대로 유지한다. 계약이 완성되기 전 Gemini 추가 구현·commit·다음화면 착수0.

3-2d 커밋·사용자확인, 3-3 인력 관리는 대기. 기존3-1e 사용자 직접 시각 확인도 별도근거가 없으므로 완료를 주장하지 않는다.

## 8. 보존·정리·미확인 사항

자기 정상10/변조7/zeroargs1 실행의 owner는 tempCleaned:true였고 현재18741 listen 없음. 이번 close-error 주입은 실 context를 먼저 닫았다. 별도 worker stub도 닫혔으며 가짜 bootstrap 삭제 완료. 현재 시험 artifact와 Control report는 증거로 보존한다. 과거temp·다른PID/Chrome프로필·운영 데이터·기존Log를 건드리지 않았다. owner의 일반적인 종료 보장은 V32F-04가 해결되기 전 미수용이며, 이 정상 실행의 정리와 구분한다.

내부 Luna 해시 inventory는 Sol이 직접 전수 hash를 재검증했다. Luna의 초기 '일부 제출artifact 전부누락' 결론은 owner/helper의 서로 다른dir을 혼동한 것으로 확인되어 채택하지 않았다. 실제 errors/session 원래 owner-final/action 파일은 존재하고 별도 luna-artifact-correction.json에 정정됐다. 결함은 전부없다는 주장이 아니라 정확 연결·원출력·회신경로가 없다는 것이다. Luna의 본문 동일 판정도 `## 회신 요청` 접두사에 잘못 멈춘 검사여서 채택하지 않고 Sol이 정확 `## 회신` 단독행으로 재검증했다. balanced Terra 불가로 gpt-6-sol read-only 검토를 대체 사용했고, Sol이 인용 소스/재현을 확인했다.

## 9. 현재12파일 실제 SHA-256 / bytes

| 경로 | bytes | SHA-256 |
|---|---:|---|
| `docs/codebase-map.md` | 12802 | `4B7FE910A7FA66FDB5427985B76BD85167EE653E85626EFA53861D2112F63794` |
| `scripts/copy-web-assets.mjs` | 4292 | `68147FF528AF9C8C6606B31E348554DC48C433549EA330B2EF464AA6F2AF0115` |
| `src/web/index.html` | 601 | `1E3AAE08F0D97B2D1F41E65A63E761180DA10BDE7C7BD0683462B629F41C8CE2` |
| `src/web/screens/shell.ts` | 16334 | `27750E549BCACDFFD90C9404491C5D4DFC0301B37C10787ECE9D06BD483F2130` |
| `scripts/ui-checks/access-history-negative.mjs` | 7521 | `89EB001A64FB37BFF55F3D638AA61E851E675D6E440FA13F62798FA2EF25AA7C` |
| `scripts/ui-checks/access-history-positive.mjs` | 17523 | `2B6D9713E09B4CABC09912E96F023907D3998FB3A5192CB5B9EC3ADB13370C60` |
| `scripts/ui-checks/access-history-shared.mjs` | 11162 | `D1B984D420F4F8A95003AC16F3D56E3906EEBE43D0429ABFBC610A1A741DF3C5` |
| `scripts/ui-checks/access-history.mjs` | 9320 | `D2DD49C2AFA7AA1C39D8E799CF84BDD794167F0E9F9BB2F448337F06AB28910E` |
| `src/web/access-history.css` | 7261 | `286A0DF91BB3B0EEDEEE7B21A01CA26521BB441051B23F3FF8C10F3381B1E8A1` |
| `src/web/screens/access-history-model.test.ts` | 10177 | `29ED9EA2CC5637B36A475753F523EAD180F09BA029C7A3E9F681862F66871F3E` |
| `src/web/screens/access-history-model.ts` | 6786 | `03C511282B010774CBEFAE9C0CC0377A8A5CBBEB4C70168663E1695E48765265` |
| `src/web/screens/access-history.ts` | 29601 | `E6BB9E4A7487EB791F9534340A65F89C1B61D5B19F7014EB9C3F545E8FD25979` |

## 회신

불필요. 검수 종결 기록이며 추가 구현 지시가 아니다. 다음 책임은 Sol의 독립 계약 확정과 새 구현 패킷 준비다.
