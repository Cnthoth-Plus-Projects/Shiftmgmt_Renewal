# HANDOFF — Phase 3-2c-A 독립 검수 종결

- 작성: Sol / 2026-10-01 22:43:38 KST
- To: 사용자 (Gemini에는 검수 결과 참조용으로 수동 전달 가능)
- Action: REVIEW_RESULT
- 판정: **FAILED / A_NOT_ACCEPTED — A 수용 보류, 기존 REPLAN 유지**
- 회신: 불필요
- 추가 제품 구현 허가: **없음**. 이 문서는 IMPLEMENT/CORRECT 패킷이 아니다.
- 검수 대상: `C:\Projects\Active\ShiftMgmt_V4`, `main`, HEAD `160940f9aaeb6696538447f83b44658073e382f0`, dirty12/source341.

## 1. 결론과 다음 단계

Gemini의 IMPLEMENTED 회신을 독립 검수했으나 A단계를 수용하지 않는다. 정상 core9/7artifact와 보호 회귀2는 실제로 통과했고 허용 파일 범위도 지켰다. 그러나 검증기가 잘못된 증거를 실제로 PASS 처리한다. 실제 오류 주입6건 중5건에서 부모 RC0/PASS를 재현했으며, 기존 화면8case의 신규 로그인 실패를 단순 coverage 미완성으로 숨기는 회귀도 확인했다. 고정 계약을 읽는 것과 실행에서 계약을 강제하는 것은 별개이며 후자가 충족되지 않았다.

외부 계약 v1/STRATEGY/checker/baseline은 유지한다. 이번 제출의 계약 이탈과 기존 R32C-06을 해결한 증거가 없으므로 이 패킷을 FAILED로 닫는다. 과거 동일 결함군의 두 차례 수정 소진 이력은 그대로다. CORRECT3 또는 A-CORRECT1로 회수를 초기화한 새 구현 지시는 내리지 않는다. Sol이 다음 구현 전략의 실행 경계와 승인 조건을 먼저 닫아야 한다. 제품 코더는 계속 Gemini이며 사용자 수동 중계 방식이다. Sol의 제품 소스 변경은0이다.

B 전체10case/87ID, 전체3-2 수용,3-2d 커밋,3-3 인력 관리는 대기다.3-1e 사용자 직접 시각 확인도 이번 검수로 대체하지 않는다. 이번 core PASS는 로그인 페이지의 제한된 기반 증거일 뿐 로그인 성공/접속기록 화면 전체 검증을 뜻하지 않는다.

## 2. 수신 원본, 범위 및 검수 시점 고정

수신 HANDOFF를 교체하기 전에 아래 원본을 그대로 보존했고 바이트 동일성을 검증했다.

| 항목 | 실측 |
|---|---|
| 수신 원본 | `C:\Projects\Active\교대근무관리 시스템\Log\20261001_220126_3-2c-A-Gemini-IMPLEMENTED_수신원본.md` |
| 수신 바이트/SHA-256 | 44,403 / `F408FC1DFD5368439CF48B5D94CD3047C0A5C4E96345E029A8117C22C58DBBFC` |
| 발송본 | `Log\20261001_172401_3-2c-A-Sol-IMPLEMENT_발송본.md`,29,974bytes / `588DBC12078DAE556F243F17F016227F311F4C44465E765DFAE1D091D2BD464E` |
| 요청 본문 동일성 | 정확한 단독 `## 회신` 경계 이전의 본문이 발송본과 바이트 동일; body SHA `1675AFF7C8770982AC6F2DCD0401C66D6FED0AEBCF395A3DC23002AC3A3CDBD9` |
| 제출 source12 해시/바이트 | 실제12개 모두 회신 수치와 일치 |
| 제품 범위 | 기준341개 중 허용4개만 변경, 보호337개 불변; HEAD/main/status12 일치 |
| Control 정본 | 활성 검수 대상 종결 **직전까지18개** 모두 기준 해시/바이트 동일 |

솔이 실행한 정적검사/빌드/브라우저/오류주입 동안341개 소스의 바이트·해시·HEAD·Git 상태는 매 단계 및 최종 시점까지 동일하다. 소스/테스트/설정/마이그레이션/제품 코드 지도는 편집하지 않았다. 빌드 출력과 검수 소유 ignored artifact만 생성했다. V3.4는 건드리지 않았다. commit/push/deploy/다른 AI CLI 호출도 없다.

종결 후에만 TODO/current-state의 사실 상태를 FAILED/A_NOT_ACCEPTED로 갱신한다. 계약4파일 및 다른 정본은 계속 불변이다. 이 사후 상태 갱신은 과거 검증 대상이 처음부터 달랐다는 뜻이 아니다. 이 종결본 보존 경로는 `Log\20261001_224338_3-2c-A-Sol-FAILED_독립검수종결본.md`; 수신본/발송본/기존 Log는 변경하지 않는다.

허용4파일의 현재 전체 SHA-256:

| 파일 (`scripts/ui-checks/`) | bytes | SHA-256 |
|---|---:|---|
| access-history.mjs | 21,253 | `C6F2EF91CD00A4D4D4C7480D0E4061B7634977D5C3132C340DEA0676EDD7DF18` |
| access-history-shared.mjs | 18,974 | `94DAF63798AA5E9A7B05582A2C0368A286096F511F5E4C285A7F75E61071EE25` |
| access-history-positive.mjs | 18,000 | `BF5E8628576F917517B124B2722A0E2D2C1300BDC54F89906BD72909E29A974A` |
| access-history-negative.mjs | 7,290 | `17B2905F59E3DF3891355FAFF466ED4DEBCC3874AA3EFB062E209A4583B0E7BE` |

읽기 전용 고정 계약 디렉터리: `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-v1`.

| 계약 파일 | bytes | SHA-256 |
|---|---:|---|
| contract.json | 29,515 | `014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE` |
| STRATEGY.md | 26,069 | `0A6136FD23F989F7065993449F8A705CD4047FA358248218BB0719497B9F12D1` |
| verify-evidence.py | 19,880 | `24244C9C2098F1C587BE633FF017979CB1EE982C38038A6FDC90F752A921A954` |
| baseline.json | 61,201 | `E590E18BF5C79CDD19B4F93AD86D4D194D4E280DAF26C60A57BB59E43CE4AA50` |

## 3. 독립 실행 결과와 한계

모든 명령의 실제 argv/cwd/start/end/PID/RC 및 stdout/stderr는 아래 evidence 디렉터리의 각 `*.command.json`/`*.stdout.txt`/`*.stderr.txt`에 있다. 표의 PASS를 전체 A 수용으로 확대하지 않는다.

| 검사 | Sol 실측 |
|---|---|
| typecheck | RC0,8.469s |
| lint | RC0,21.187s; 기존5warnings/0errors |
| validate:map | RC0,90경로 |
| git diff --check 및 허용4 node --check | 모두 RC0 |
| build | RC0,9.765s |
| 관련 Vitest | RC0,3files/11tests,7.922s; model/service/route-registry |
| 외부 scope checker | RC0,files341/protected337/dirty12/changedAllowed4 |
| 외부 parser selftest | RC0,positive2/rejected19; **parser 시험만**, 제품 검증기 음성시험 대체 불가 |
| 무변조 contract-core | RC0,92.531s; 독립 checker RC0/CORE9/artifacts7/FOUNDATION_ONLY |
| 정상 화면8case | 모두 부모 RC1/FAIL_INCOMPLETE; 실제 자식 오류 은폐/partial 부재 때문에 A 미충족 |
| 보호 regression-shell/home | 실제 보호 runner 실행 RC0, 실제4+1캡처 존재; 부모의 증거 판정은 별도 결함 |
| malformed 공개CLI9/직접 privateCLI12 | 총21개 실제 RC1; 이 부분 개선 확인 |

이번 전체133files/919tests는 재실행하지 않았다. 이전 독립 검수의 역사적 결과를 이번 새 실행으로 주장하지 않는다. 허용 검증파일 이외 제품 소스/테스트는 그대로이고 관련11시험을 새로 실행했다.

무변조 core 실행: `node scripts/ui-checks/access-history.mjs --case=contract-core`.
실제 manifest: `C:\Projects\Active\ShiftMgmt_V4\artifacts\captures\phase3\access-history-contract-core\run-20261001-220622-5NxZB9\owner-final.json`. 실제1440x900 PNG를 열어 한국어 로그인 페이지를 확인했다. core의 보호자/자식 close 이후에도90초 타이머가 남아 프로세스가 계속 살아 있어 총92.531초가 걸렸다. `actual-core-result.json`이 명령 종료와 checker 실행을 담고 있다.

오류주입/기존10case 재현에서는 검수 소유 preload를 사용했다. **실제 자식 close 후에만** 부모의 남은90/120/180초 keepalive 타이머를 해제하여 반복 검수 대기 시간을 줄였다. 워커 실행·가드·자원 close·서버 종료는 실제 수행했으며 다른 동작을 우회하지 않았다. 무변조 core는 별도로 위처럼 그대로 실행했다. 각 주입은 검수 소유 ignored run의 실제 파일/콜백에 적용했고 소스 변경은 없다. 아래에서 이 계측을 숨기거나 전부 무변조 실행이라고 주장하지 않는다.

## 4. 실제 오류 주입 대조 — 6건 중5건 허위 PASS

`faults-results.json`에 실제 이벤트/최종manifest/독립 checker 결과가 묶여 있다. 독립 checker는 성공을 결정하는 제품 owner와 다른 코드이며 제품 owner가 이를 호출해 판정하는 구현은 아니다.

| 실제 주입 | 제품 부모 실측 | 독립 대조 / 의미 |
|---|---|---|
| png-24-byte-header | RC0/PASS | 정상 캡처를 signature/IHDR/dimensions가 남은24bytes로 실제 절단. checker RC1 `Truncated PNG chunk`. 부모는 CRC/IEND/청크 완결 검사를 하지 않는다. |
| duplicate-core-ids | RC0/PASS | 실제 worker-final의9checks를 CORE-01 중복9개로 교체. checker RC1 `Duplicate check ID`. 부모는 길이9만 검사한다. |
| unexpected-raw-error | RC0/PASS | actual core-observations.rawErrors.console에 무관한 `SOL_A_UNEXPECTED_UNRELATED_CONSOLE_ERROR_401` 추가. checker RC1 `Actual differs from raw observation`. 부모가 raw 관측을 다시 읽지 않는다. |
| server-close-not-observed | RC0/PASS/tempRemoved | 실제 server process는 정상 exit/close 후, owner의 close 관측 콜백만 억제. manifest closeSeen=false인데도 PASS/삭제. checker RC1 `server close not confirmed`. **이 시험의 실제 서버 누수는 없다.** 관측 없이 성공 판정한 오류다. |
| regression-no-evidence | RC0/PASS | 실제 보호 runner 대신 검수 소유 종료0 stub 실행. 실제 회귀 manifest/capture가 하나도 없어도 부모가3checks를 만들어 PASS. |
| owner-final-write | RC1/FAIL | 실제 최종 manifest 쓰기를 throw. 최종 파일 없음, stderr 오류/부모 실패 확인. 이전 write-error falsePASS는 개선됐으나 첫실패/stack/partial 보존과 모든 정리경로까지 입증한 것은 아니다. |

첫4개는 부모 manifest를 독립 checker에 실제 입력해 거절을 재현했다. 회귀 stub은 core checker의 입력 대상이 아니므로 checker 거절을 꾸며 쓰지 않는다. 부모가 실제 하위 회귀 증거를 확인하지 않고 성공을 만든다는 소스/실행 증거로 판단했다. 이들은 UI 제품에 새로 발견한 문제라는 주장이 아니라 검증기의 판정 오류 재현이다.

## 5. shared/IPC 가드 및 기존 화면 실행

`shared-and-ipc-probe.stdout.txt`와 retained `probe-result.json`에 실제 SUT 모듈을 import한 결과가 있다.

- `AssertionCollector`에 CORE-01 `/viewport` actual=[777,555], caller expected=[777,555]를 전달하면 받아들인다. 계약의 고정 expected=[1440,900]를 조회하지 않는다.
- unknown case에서 빈 coverage가 받아들여지고, 중첩 객체의 NaN도 받아들인다. 관측 객체 x=1을 기록 후999로 바꾸면 저장 checks도999가 되어 기록이 snapshot이 아니다. caller tolerance2는 올바르게 거절했다.
- 실제 fork/IPC/부모PID/nonce를 사용하되 URL을 소유 stub의58853으로, runDir을 `access-history-contract-core-sol-sibling-*`으로, temp를 os.tmpdir 외 ignored 하위로, bootstrap/contractPath를 존재하지 않는 소유 경로로 지정했다. worker가 ACK를 보냈다. 두 번째 실행 승인 메시지를 보내지 않았는데도 실제 Chrome이 GET `/`/`favicon.ico` 두 건을 요청하고 sibling 경로에 PNG/raw 관측 파일을 썼다. worker는 **그 뒤** CORE origin 비교에서 RC1로 종료했다. 나중의 오류가 실행 전 부작용0 가드를 충족시키지는 않는다.
- 이 프로브의 부모/워크/서버/파일은 모두 검수 소유이며 외래 서비스 접속/자격증명 열람은 없다. OS 수준 인증 취약점 판정을 주장하는 것이 아니라 요구된 운영 경계 및 2단계 승인 가드의 실패다.
- 포트18741을 검수 소유 stub으로 점유한 실제 시험은 부모RC1/FAIL, 외래HTTP0/제품서버spawn0이었다. 그러나 포트 검사 전에 isolated temp가1개 생성됐다. 계약의 port-preflight temp0과 어긋난다. 생성된 자기 temp는 실제로 정리됐다. `port-occupied-probe.*` 참조.

정상8case는 각각 실제 실행했다. 모두 새로운 shared `performLogin`의 `page.locator('#login-btn').click()`에서30초 timeout이 발생했다. 실제 `src/web/screens/login.ts`의 submitButton에는 그 ID가 없다. 이전 Enter 로그인과 L4 필수 비밀번호 변경 처리가 사라졌다. 따라서 A에서 의도한 기존 body 실행 후 필수ID 부족과 다른 **새 로그인 회귀**다.

부모는 이8개 자식 RC1/첫실패를 읽지 않고 필수ID를 전부 missing으로 써서 FAIL_INCOMPLETE만 반환한다.8/8 실행에서 partial-action-assertions가 없고 parent manifest의 첫오류/errors도 없다. case body 수정까지 진행했으나 실패 때 실제 관측을 보존하는 기반을 구현하지 못했다. negative body는 기존 실제 retry/이벤트 검사를 제거하고 false/false 상수 비교로 바꾸었으며 rawErrors 최종 판정도 제거했다. exact401/AUTH_SESSION_REQUIRED 개선을 모든 오류 처리의 충족으로 인정할 수 없다.

반면 보호 regression-shell/home의 정상 실행에서는 실제 하위 runner가 실행됐고 각4개/1개 캡처가 존재한다. core1과 합쳐 정상 캡처6개를 Sol이 실측했다. `capture-index.json`, `child-evidence-index.json`에 경로/해시가 있다. 정상 회귀의 실제 캡처가 없다는 주장은 하지 않는다. 문제는 부모가 해당 증거를 연결·검사하지 않아 없는 경우에도 성공한다는 점이다.

## 6. 통합 결함 목록 — 기존 R32C-06/V32F-01~06 추적 유지

아래는 새 수정 패킷이 아니라 이번 검수의 통합 진단이다. 모든 파일 참조 기준은 위 고정 소스 해시다. 실행 재현과 소스상 미충족을 구분했다. 수정 회수는 초기화하지 않는다.

| ID / 요구 추적 | 원인 및 위치 (`scripts/ui-checks/`) | 증거 / 수용 조건 미충족 |
|---|---|---|
| **A32F-01** / A02,A07~09 / 판정·증거 | owner access-history.mjs:84~99,427~470,512.24bytePNG헤더/9checks 길이/7파일 존재+hash만 검사. 정확ID/expected/raw pointer/예상치않은오류를 판정하지 않는다. | PNG/duplicate/raw-error **실행 falsePASS3건**. 고정ID집합·관측연결·완전PNG·실제오류 검증이 owner 최종판정에 필요. |
| **A32F-02** / A10 / 보호 회귀 연결 | owner:524~558. child0만으로 actual='PASS' 3checks를 만든다. plaintextstdout에 대응 JSONpointer도 없다. 실제 회귀manifest/capture/수명증거를 읽지 않는다. | 회귀no-evidence **실행 falsePASS**; 정상2runner/5PNG 존재는 별도로 확인. 하위 실제manifest/캡처를 검증해 성공을 결정해야 한다. |
| **A32F-03** / A02,A04,A07,A08 / 불변 비교·관측 | shared:123~145,195~201,321~322,371~406,419~468. callerexpected/unknownfallback[], 중첩finite미검사, mutablechecks, viewport/fixturecount 상수actual; domain모듈을 읽지만 고정fixture와 실제compiledlabel 대조가 없다. CORE07/08 직접push. | callerexpected/unknown/nestedNaN/mutable **SUT 직접실행 허용**; tolerance2거절은 개선. 외부계약은 로드됐으나 각 비교에 적용되지 않는다. 날짜133.5·라벨drift 모든 하위 runtime경로는 이번에 입증되지 않았음. |
| **A32F-04** / A03,A05 / 실행 전 IPC 검문 | shared:206~271. tempbasename만, runprefix만 검사; fixedURL/os.tmpdir/exactcontractPath/bootstrap 소유실재 검문 없음. ACK후 즉시실행. owner:354~384 wrongACK reject뒤에도contextAck=true, 송신후listener등록. | 실제 IPC에서 잘못된 경로/URL ACK 및 승인전2HTTP/파일쓰기. lateRC1로 가드충족 불가. wrongACK race 자체는 소스상 미충족이며 이번 별도 실행재현으로 주장하지 않는다. |
| **A32F-05** / A06,A09 / 수명·정리·실패 보존 | owner:203~253,393~409,473~512,587~636. exit/close미확인에도temp삭제/default시간; 성공후cleanup결과반영없음; timeout미해제; kill후자식close대기/최상위registry부족. shared:356~369/negative:158~161 context.close throw시browser.close건너뜀. | close-not-observed **실행 falsePASS/temp삭제**, 무변조core92.531s. ownerwrite실패RC1개선 확인. 실제timeout/kill/spawn/contextthrow 모든 분기의 독립운영증거는 미완결이므로 universal cleanup PASS아님. |
| **A32F-06** / A10,A09 / 기존 body 보호·partial | shared:63~68,positive:373~380,negative:52~71,101~105,158~161; owner:559~585. 새로그인 selector/L4흐름회귀, case body실제retry→상수; partial최종쓰기만, childerror/extra 누락. | 정상8 실제로그인timeout/partial0/부모첫오류없음. negative diff +63/-88,positive +22/-10. A 허용경계는 최소entry연결/관측보존이지 화면body재작성과오류삭제가 아니다. |
| **A32F-07** / A07,A09 / 제출 증거 재현 | 수신회신281~334. coreartifact5/7reportedhashbytes불일치; 여러 음성시험을 parser selftest로대체; IPCdriverfalse인subcase에도RC0. | 아래실측표 및 submitted-ipc-probe-reproduced.*. “미해결없음”/기반20그룹충족 주장을 수용할 수 없다. 사실/부족/가정을 분리해야 한다. |
| **A32F-08** / A01,A06,A09 / preflight·시간·쓰기 경계 | owner:12,103~119,123,145~200. cwd를repository기준으로삼음; constructor가포트확인전temp/log생성; readinessfetch 반복300회×요청1초로global30초아님; childspawn/streamerror handler 및로그finishawait부족. | 실제점유port temp1. globaldeadline/spawn/streamwrite/cwd대체 각 모든 branch는 소스상 미충족으로 분류하며 별도새runtimePASS증거 없음. 외래손대지않는 사전검문과 실패를 끝까지 기록하는 bounded처리가 필요. |

기존 실패의 중심인 “검증기가 요구 관측·오류·정리 실패를 성공으로 판정”은 그대로다. 새 합성 프로브를 제품 UI 결함으로 오인하거나 이전 해결된 UI결함 전체를 무근거로 재개하지 않는다.

## 7. 수신 증거 대조와 기반20그룹 상태

수신 core의 실제 원본 경로 `artifacts/captures/phase3/access-history-contract-core/run-20261001-174842-f2iqH8`는 보존했다. 수신 설명의7artifact 중 **5개**는 보고 hash/bytes와 다르고 빈 workerstdout/stderr2개는 일치한다. 원래 manifest 내부 artifact해시는 현재 파일과 일치한다. 누구의 의도/변경 책임인지 추정하지 않는다.

| artifact | 수신 bytes | 실제 bytes | 실제 SHA-256 |
|---|---:|---:|---|
| server-stdout | 139 | 745 | `0236C6FA55672B9123EFAD21AF469E9FDA49746F59F797BFAC3773535C030BF6` |
| server-stderr | 0 | 169 | `0D98832FB03FE0940C418CA1956CC60147718B7DE6989802296E149E983F2F6A` |
| worker-final | 1,846 | 3,676 | `323C8F1DA045FD3409A41FA2342046475BA6DD6202E54B86ACD5131EA256D92F` |
| core-observations | 3,782 | 5,620 | `94CD3CD59440926E02636F59671C1FF48510B5EBA5D6382A8CF290AF1BBA4A43` |
| core-capture | 42,674 | 25,688 | `C167ABE077C0568593103AF8941A08EA8D9CBF928C788E20FC206A8F5CB28F8D` |

server-stderr는 Node SQLite ExperimentalWarning이며 이를 예상치않은 브라우저 오류로 계산하지 않는다. 수신 core checker를 현재 다시 돌렸을 때 workerPID48016 alive로RC1이었으나, 독립 프로세스 생성시각 확인 결과 그 PID는17:58:34에 새로 시작한 Chrome으로 재사용된 것이다. 원래 worker는17:48:43 실행이었다. 이를 원래 worker누수로 단정하지 않고 foreignChrome은 건드리지 않았다. `submitted-pid-reuse.json` 참조. 새 Sol core는 종료 직후 checker를 실행해RC0을 확인했다.

수신 IPC fault script도 실제 재실행했다. case/PID mismatch거절은true, contracthash mismatch부분은 **거부확인:false**인데 driver전체RC0이었다. 그 하위 입력은 hash검문 전에 없는temp realpath에서 실패했으므로 hash검문을 입증하지 못한다. 로그 전체가 `submitted-ipc-probe-reproduced.*`에 있다.

| 음성그룹 | 이번 독립 상태 |
|---|---|
| A-N01~04 | 공개/직접worker/위조env CLI 실제21개 RC1 개선 확인. 전부상세하위조건을 새로입증했다는 확대주장 없음. |
| A-N05~06 | 앞단case/PID거절 일부 확인. 잘못된URL/경로/승인전실행 실제가드FAIL. 전체패킷/timeout/digest 모든조건PASS아님. |
| A-N07 | tolerance2거절 확인, nestedNaN/callerexpected/mutable SUT허용. 날짜/finite전체branch는UNVERIFIED; parser만으로PASS불가. |
| A-N08 | 실제중복ID 부모falsePASS. 누락/추가도 부모length만검사하는 소스결함; 모든별도runtime시나리오는미실행. |
| A-N09 | canonical8라벨문자열은정정됨. 실제compiled정본대조강제/라벨drift제품runtime증거는미완결. |
| A-N10 | unrelatedrawconsole실제falsePASS. 모든page/requestfailed/badResponse하위runtime집합은UNVERIFIED. |
| A-N11~13 | close미관측 falsePASS, cleanup/timeout/spawn등록소스미충족. 모든실제예외/timeout/kill후자원종료하위조건은입증안됨. |
| A-N14 | 실제최종manifest쓰기throw에서RC1개선 확인; partial/firststack 완결아님. |
| A-N15 | stream error/finish처리소스미충족. 실제모든로그쓰기실패조합은UNVERIFIED. |
| A-N16 | 실제24bytePNG 부모falsePASS. 독립checker는거절. |
| A-N17 | 일부직접CLI/IPC검문거절은확인. 모든workerpreflight exit 오류와partial수명전파증거는UNVERIFIED. |
| A-N18 | 점유port 부모RC1/foreignHTTP0/serverSpawn0, **temp1**로계약FAIL. |
| A-N19 | 정상8부모FAIL_INCOMPLETE는재현. 신규로그인실패은폐/partial0으로A기반FAIL. |
| A-N20 | 실제callerexpected덮어쓰기/unknowncase/관측mutable허용, rawpointer불일치falsePASS. |

특히 수신 A-N07/08/09/10/11/16/20은 외부 parser의 selftest로 대체됐다. 고정 parser가 변조를 거절하는 사실은 제품 owner/worker가 같은 변조를 거절한다는 증거가 아니다. 나머지 그룹에도 실제 argv/time/PID/stdout/stderr와 각각의 하위조건 증거가 없는 서술이 있으므로 “기반20그룹 완료”로 처리하지 않는다. 새 전략의 필수 수용조건을 낮추거나 이번 수행하지 않은 시험을 성공으로 채우지 않는다.

## 8. 증거 위치, 소유 자원 및 보고 책임

전체 독립 evidence: `C:\Projects\Active\교대근무관리 시스템\.ai\reports\phase3-2c-a-review-20261001_220126`.

- `final-evidence.json`: 통합 판정,원문/종결해시,소스/정본전후,각실행/오류주입결과 링크.
- `init.json`, `source-before.json`, `scope-closeout-final.json`, `scope-after-closeout.json`, `control-closeout-final-before.json`: 원문/body 및341/337/18 경계 증거.
- `static-results.json`, `actual-core-result.json`, `claimed-check-results.json`, `cli-results.json`: 실제 명령/RC/시간/로그.
- `faults-results.json`, `fault-preload.mjs`, `fault-runner.py`: 주입방법/실제파일/이벤트/부모 및checker판정. 소유ignoredartifact에만 주입.
- `cases-results.json`, `capture-index.json`, `child-evidence-index.json`: 기존8실패 및 보호회귀2/실제캡처6.
- `shared-and-ipc-probe.mjs/.stdout.txt`, `port-probe.mjs`, `port-occupied-probe.stdout.txt`: shared/IPC/port 실제경계.
- `submitted-hash-check.json`, `submitted-pid-reuse.json`, `submitted-ipc-probe-reproduced.*`: 수신 증거 교차검증.
- `resource-final.json`: 관측한55개 review PID를 read-only 확인(없음/종료후재사용), 알려진격리temp6개 부재,18741비점유. 실제childclose이벤트도 보존.

자기 정상/주입 서버·IPC stub·브라우저 run은 끝났고 검수소유 아티팩트는 재현을 위해 retained다. 누락된 owner-final쓰기실패 시험의 증거는 stderr/실제childclose이벤트에 있으며 최종manifest가 존재하는 척하지 않는다. 모든 오류분기의 수명관리 검증을 완료했다는 주장은 하지 않는다. historical/foreign temp/PID/Chrome profile/기존 Log는 변경·삭제하지 않았다.

frontier: Sol이 계약·범위·실패 판정과 최종 통합을 책임졌다. Luna의 read-only 기계 inventory와 balanced Terra unavailable→`gpt-6-sol` read-only 집중리뷰를 참고했고, 인용파일/해시/명령증거는 Sol이 독립 대조했다. 초기 inventory의 “7개 모두 불일치/정상회귀artifact없음” 표현은 채택하지 않고 실제5/7불일치·정상회귀artifact존재로 정정했다. 내부 에이전트는 파일 편집/완료결정/사용자 보고를 하지 않았다. MCP surface는 한 번 확인했고 이번새MCP실패없음; 설치된 독립Chrome과localraw증거가 직접적인 검수수단이었다.

Harness5.1/projectoverlay4.0 및 역할 경계 유지. JIT P04/P05/P06/P10/P13/P17/P21/P25/P26는 record_only, Jev미사용. 검수결과를 낮추거나 제품구현권한을 Sol/내부agent로 이전하지 않는다.

## 회신

회신 불필요. 이 문서는 Gemini IMPLEMENTED 제출에 대한 Sol 독립 검수 종결 결과다. **A_NOT_ACCEPTED / B 대기 / 추가 구현 허가 없음.**
