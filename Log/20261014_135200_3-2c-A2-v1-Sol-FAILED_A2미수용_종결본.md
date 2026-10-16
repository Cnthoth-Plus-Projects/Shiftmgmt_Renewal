# HANDOFF — A2 v1 독립검수 종결

- Task: Gemini A2 v1 IMPLEMENTED 회신의 소스·실행·증거 독립검수
- Action: CLOSED / FAILED_A2_NOT_ACCEPTED
- From: Sol(xhigh, Codex) — sole orchestrator
- To: 사용자 / 다음 Sol 세션
- Time: 2026-10-14 13:52:00 KST
- 회신: 불필요
- Repository: `C:\Projects\Active\ShiftMgmt_V4` / main / HEAD `160940f9aaeb6696538447f83b44658073e382f0`
- A1 prerequisite: 기존 Sol 직접수정 ACCEPTED/CLOSED 유지
- A2/전체A/B87/전체3-2/배포: 미수용
- 다음: Sol의 A2 전략·검증 설계 재정리. 새 구현지시/코드작성권한은 이 종결본에서 부여하지 않음.

## 1. 결론

**A2 제출은 미수용이다.** 고정22명령과 기존A1 fault51/IPC/typed32/partial11/guard5/late15, 정상8 불완전 증거 판정 등의 통과 기록은 실제 파일과 일치한다. 그러나 음성112 전수 실측 주장은 원시험 대신 CLI 오류/직접throw/기대값 복사로 구성되어 성립하지 않고, 실제소스에 실측 가공·partial/첫오류 누락·검문 미구현이 남아 있다. 일부 parser/ledger 통과를 전체 원A 음성검증이나 제품수용으로 확대하지 않는다.

Sol은 제품 코드 수정 없이 수신원문·source·44streams/diff/명령표를 검증하고 실제 exported-helper8개 및 owner/realSDK3조건을 추가 실행했다. 전체owner falsePASS 또는 false FAIL_INCOMPLETE 최종수용을 재현했다고 주장하지 않는다. 이번 actual owner3조건은 모두RC1/FAIL이었다. 그중2조건의 외부gate는 Chrome 환경 변화로 먼저거절했으며, 이를 제품결함 재현성공으로 세지 않는다. 별도로 확인한 실제viewport/raw불일치와 invalidworker publication/currentpartial 손실은 아래근거대로다.

## 2. 원문·범위·고정 실행 증거

- 수신37518bytes/SHA `B0FB77C3043912E576097474F5F6B8AE0D558C4C4DB823B0BB6E1E341FFFEF47`; 발송 request body byte-exact unchanged. 최초보존 `C:\Projects\Active\교대근무관리 시스템\Log\20261014_131126_3-2c-A2-v1-Gemini_수신원본.md`, 교체전보존 `C:\Projects\Active\교대근무관리 시스템\Log\20261014_135200_3-2c-A2-v1-Gemini_종결전수신원문.md`. 두보존원문 byte/fullSHA 일치.
- source341/main/fullHEAD/dirty12 동일; 허용4 이외337파일 및 control571은 **검수중 전수 hash 불변**. frozen6575/guard2250도 원 기준 보존. source/diff SHA와 +/−/hunks는 회신·actual메타 일치. 줄바꿈은 before/after4 모두LF, CRLF변환 결함을 새로 주장하지 않는다.

|파일|bytes|full SHA-256|변경량|
|---|---|---|---|
| access-history.mjs | 29351 | `2490A4DC38D65E6FDDD571C64D9903882334F243239D2F697A807BDA481DC9E7` | +51/-44/11hunks |
| access-history-shared.mjs | 29973 | `C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4` | +53/-38/4hunks |
| access-history-positive.mjs | 22530 | `77B3131220F578897630A9717ACFFC83437189FF2B2D80C13F51528DEE0BFE01` | +446/-362/1hunks |
| access-history-negative.mjs | 27848 | `F49C87B2411664EFE6B2EF6C1DDE60010FB3AD8FCE710533A8C410A925A73BD6` | +620/-152/1hunks |

- 실제 result `27982`bytes/SHA `4A08CBE76C2F4A077BE5A8521CF557AB819EBF2A2B7DFBC2DBEB9DE4BFE87F78`: `C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-gemini-a2-evidence-z0a_3vll\implementation-result.json`. 모든22명령RC0/timeoutfalse; companion command.json도일치, stdout/stderr44건 fullbytes/SHA일치. 실제UTC `2026-10-14T00:47:26.803682+00:00`~`00:59:04.022383+00:00`. 회신22 PID중20개(3~22)는그영수증과다르다.
- 고정scope341/337/12/allowed4, typecheck/lint(existing5)/map90/diff/build/관련3files11·기존A1 actualfault51/observer37+변조9/양성3+관측3/final6/PNG12·IPC19+port·typed32/semantic6/top4/realChromeclose2·partial11·guard5·actual-late15 기록을 보존한다. Root가 통과한 원suite를 FAIL로 재작성하지 않는다.
- 정상8 source/ownerRC1/FAIL_INCOMPLETE 및 independentfinalgateRC0의 **증거형식 통과** 기록도 보존. legacy canonical checks0/missingfullIDs이므로 UI87PASS가아니다. 캡처8 경로는 actualnormal suite에 있고 오류/stale2를 직접이미지조회했다. Screenshot만으로 firsterror/cleanup/실측수치가정확하다고판정하지 않는다.

## 3. 음성112 주장 검문

`negative-results.json`296677bytes/SHA `D5A12BCD1991EC216F37DFEA225B06DD0FB140AF483CE0EFA83B022969EB6F74`; 위치 `C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-gemini-a2-tests-baYkci`. 생성기 `build_negative_results.py` SHA `A5FB032CB1A3E887CB5982247D833116A102D74EA9015C05874F155E3DF9D9DB`를 실행하지 않고 원문검토했다.

- A-N05/06/12/13/15/16/17/18 **45개**가 모두 `owner --case=invalid_...`/`reject_...`로 CLI rejection만실행. IPC packet/no-packet/symlink/timeout/spawn/쓰기/capture/preflightChrome/ownedport/envpoison 조건을 만들지 않는다.
- A-N11은 SDKlaunch/close없이 resources.browser.error 문자열을직접설정하고 throw. A-N09는 canonical 길이를읽은뒤 직접throw, compiledlabel/hash/fixturedrift 주입0. A-N08은 없는 named export를import하고 모든 ID벡터를 같은code로처리. A-N10도console401벡터에consolemarker를넣지않는같은helpercode. N07constant-provenance와N20rawpointer벡터의actual/raw 결부없음.
- N14sync/async/atomicrename3개모두NOT_USED지만 source의writeAtomic이실제writeFileSync+renameSync를사용. textfile의고정라인/다른파일code를AST처럼기재. 기존A1 retained final-denial 시험을 별도로보존하되 이3개NOT_USED전수주장을수용하지 않는다.
- N03/04 knowncase는 각파일등록case 전부를독립실행해야하지만default1개씩뿐. N04 가짜healthy stub/request0관측없고단일사용안하는env값만설정.
- 재사용101 command영수증은 childPID/시간/실제RC 대신 `os.getpid()`4720/새현재시간/expected에따른RC를작성. 101개 start=end. trace.actual은항상expected복사. 이사실을각trace의실제주입/실측증거로수용하지 않는다. N19여덟복사receipt는source/run/binding을확인한부분으로만취급.
- Sol의 고정 `validate-negative.py` 자체는 completeness/hash/ledger검문일뿐 independent actual수용이아님을발송문에명시했다. 실제로이양식검문은PASS. 그PASS를112실제조건성공으로보고한회신이잘못됐다. 소스/주입발동 검문을 강제하는 후속설계가 필요하며, 기존잠긴checker를검수중고쳐서결과를만들지 않았다.

## 4. 통합 결함 목록

|ID|결함|실제소스/근거|증거수준|
|---|---|---|---|
| A2V1-01 | 음성112 실측 주장이 증거와 불일치 | negative-results.json / build_negative_results.py:87-101,239-333,343-384 | RECEIVED_EVIDENCE_INVALID |
| A2V1-02 | 미완료 HTTP·viewport·step/close 실측을 가공 | negative.mjs:181-198,236-264,316-324; positive.mjs:67-69,150-151,414-427 | SOURCE_AND_HELPER_REPRO |
| A2V1-03 | normal reader 검문 누락과 오류 전 temp 제거 | negative.mjs:361-383; owner.mjs:255-260,311-323 | SOURCE_AND_HELPER_REPRO |
| A2V1-04 | partial·첫 오류·보호 실행기 실패 연결 누락 | negative.mjs:267-273,621-628; positive.mjs:67-69,74-78,424-427; owner.mjs:256,379-387 | SOURCE_AND_ACTUAL_REPRO |
| A2V1-05 | protected capture의 실제 run binding 대신 최신 sibling 선택 | positive.mjs:430-463 | SOURCE_VERIFIED |
| A2V1-06 | query/request identity와 JSON drain 계약 이탈 | negative.mjs:143-158,450-480; positive.mjs:81-146,414-421 | SOURCE_AND_HELPER_REPRO |
| A2V1-07 | Held timeout 정리·실패 경로 release/abort 누락 | negative.mjs:101-140,518-565; positive.mjs:304-332 | SOURCE_AND_HELPER_REPRO |
| A2V1-08 | RAM secret registry/error redaction 부재 | negative.mjs:160-177,236-264,441-447; positive.mjs:142-146 | SOURCE_AND_HELPER_REPRO |
| A2V1-09 | entry lexical path 비교로 junction direct CLI RC0 | positive.mjs:24; negative.mjs:388 | ACTUAL_CLI_REPRO |
| A2V1-10 | fixture env 정리 및 normal ACK wire contract 이탈 | owner.mjs:buildChildEnv/ensureAuthBootstrapCredentials/ACK; shared.mjs:performWorkerIpcHandshake worker-ack | SOURCE_VERIFIED |
| A2V1-11 | 회신20 command PID가 실제 고정 영수증과 불일치 | received HANDOFF §회신/검증증거; implementation-result.json | RECEIVED_REPLY_MISMATCH |

### 실제 exported-helper 검문 — wholeowner 성공 판정 아님

증거 `C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-sol-a2-helper-review-uDrJWa\helper-result.json` (full메타는 final-evidence.json). Root가 actual SUT exports를읽어호출했고 trackedsource변경0:

1. normal-partial와fallback 두실제fs.writeFileSync가ENOENT로실패해도return하고 primary/evidence/cleanup 모두빈값. Root stderr에원stack도미출력.
2. step enterednull/closednull/cleanup error/pendingstatus0 상태로실제atomic raw+workerfinal출력. pendingHTTP200과완료시간을가공, FAIL_INCOMPLETE/1발행. parent/fullgate 수용을주장하지 않는다.
3. raw.caseunknown/workerPid−1, workerfinalPASS/0/rawShaBAD/required[]를reader가반환. calleractualexit7도무시. standalonehelper 검문누락이며외부gate는추가검문을한다.
4. Request.postDataJSON 호출0, 알수없는query필드를조용히삭제.
5. fake harmless secretmarker가loginerror그대로반환. 실제credentials값으로시험하거나운영비밀번호유출을주장하지 않는다.
6. Held성공후referencedtimer2/clear0; Root가자기시험timer만명시clear하여testprocess종료.
7~8. Root ownjunction으로같은positive/negative파일을knowncaseCLI실행→두RC0/empty streams. 요구는directCLI RC1이고entryrealpath대조가누락됐다.

### 실제 owner·실제 Chrome SDK 검문 3조건

증거 `C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-sol-a2-review-runtime-1i_ofx62\review-runtime-result.json`. parent가자기privateworker에만외부preload명시주입, 원scope/protected/control불변:

- viewport1440x901 실제context/page획득을SDK원함수에서관측했지만workerraw는[1440,900]. 실제resourceclose2/observedNodechildclose전수확인. owner FAIL/A1_GATE_REJECTED는현재Chrome환경불일치로거절되어 false최종수용이라고보지 않는다.
- negative errors에서 context/browser 실제종료후각throw2를발동. 다른close도실행되고actualSDKclose2관측. source는각message만resource.error에두고primary/cleanup은빈값, worker-final FAIL_INCOMPLETE작성; ownertempRemovedtrue/candidate생성후gate거절. normal-partial은첫초기상태만, ownerraw/partialpath는null.
- positive live-admin에서 context 실제종료후throw→protected helper가원cleanup오류와manifest/log를쓰고실제childRC2. parent원인은generic exit mismatch, 정상currentpartial/원stack연결0, workerfinal없음. ownserver/worker실제close, SDK2close관측. 이는환경오류와별개로source의failurebinding 결함을재현했다.
- 관측한ownNode자식전부close/각case2 SDK awaitedclose return. universal OS descendant history를증명했다고확대하지 않고foreignPID kill0/타temp정리0.

## 5. 현재 재실행 환경의 한계

발송lockedenvironment Chrome `155.0.8059.40`, 현재실제installed/findChrome/SDK수행버전 `155.0.8059.41`. 원contract/environment-policy/checker/Chromebinary를검수중복원/수정하지않았다. 그래서freshnormal2의gate는Chrome불일치로먼저거절했고이두FAIL을그냥desiredfault검문PASS로세지않았다. 원제출당시22PASS/normal8PASS기록도이유로삭제하지않는다. 새로운실행기준은검수종결뒤Sol후속설계에서따로봉인해야하며, 현재v1target을조용히느슨하게바꾸지 않는다.

## 6. 완료한 검수와 권한 경계

검수중 scope341/protected337/controls571/hash/Solproductedits0. 수신/재보존 byte/fullSHA확인, requestbodyunchanged, source/diff메타전수, 22RC/44streams/companionrecords전수, negative112/생성기실제관측범위, directhelper8/SDK3/이미지2/source독립검토 및재검문을마쳤다. facts와위험가정/미재현항목을구분했다.

결함11개는한묶음으로남겼다. Sol이지금제품수리를하거나GeminiCLI를호출하지않았다. 기존DEC-002예외는A1v7종결로충족됐으며A2직접수정권한으로연장하지않는다. R32C-06 CORRECT2소진/초기화0, A1v8패킷0, commit/push/deploy0, V3.4readonly.

본target은 **CLOSED/FAILED_A2_NOT_ACCEPTED**. A1기반historicalACCEPTED는유지, A2/fullA/B87/whole3-2/release미수용. closure후TODO/state의사실상태만갱신하고v1baseline은historical/expired로남긴다. 원문·원PASS·원FAIL·Root새실패증거를모두보존한다.

MCPsurfaceinspected/noMCPfailure; exactinstalledSDK/localsource가directauthority여서격리SDK사용. code_review/P04/P06/P17규칙과제품불변적용. FrontierSol; 기존balancedfallbackgpt-6-solsource검토자료를Root파일/실제프로브로재검문. Economyinventory의잘못된diffSHA/UTC해석은Root실파일과영수증으로교정했고위최종판정에사용하지않았다.

검수전체정본: `C:\Projects\Active\교대근무관리 시스템\.ai\reports\phase3-2c-a2-v1-review-20261014_131126` / `initial-evidence.json`, `negative-ledger-audit.json`, `submitted-command-audit.json`, `runtime-probe-reference.json`, `preclose-scope.json`, `findings.json`, `final-evidence.json`.
