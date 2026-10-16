"""Sol issue step: approved plan/status, fresh lock, complete manual handoff."""
from pathlib import Path
from datetime import datetime,timezone,timedelta
import hashlib,json,re,sys
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
DOC=HERE.parents[2]
REPORT=DOC/'.ai/reports/phase3-2c-a2-prepare-20261014'
sys.path.insert(0,str(HERE))
from prepare import inventory,meta,save,ALLOWED
def main():
    assert sys.argv[1:]==['--issue'],'Explicit local issue mode only'
    initial=json.loads((REPORT/'initial-evidence.json').read_text(encoding='utf-8'))
    ready=json.loads((REPORT/'control-validation-ready.json').read_text(encoding='utf-8'))
    assert ready['status']=='PASS' and ready['productEdits']==0 and not ready['A2Accepted']
    assert inventory()==initial['sourceBefore']
    for name,expected in initial['historicalControls'].items():assert meta(Path(name))==expected,name
    assert meta(DOC/'HANDOFF.md')=={k:initial['receivedHandoff'][k] for k in ['bytes','sha256']}
    assert Path(initial['archive']['path']).read_bytes()==(DOC/'HANDOFF.md').read_bytes()
    now=datetime.now(timezone(timedelta(hours=9)));stamp=now.strftime('%Y%m%d_%H%M%S');human=now.strftime('%Y-%m-%d %H:%M:%S KST')
    # The accepted A1 target is CLOSED. Update approved next-phase state before freezing.
    todo=DOC/'TODO.md';data=todo.read_bytes();newline=b'\r\n' if b'\r\n' in data else b'\n';text=data.decode('utf-8')
    note=f'> **최신 정본({human})**: 사용자 「응 다음 작업 진행해줘」·「한도 복구됬어 하던 작업 마저 이어서해줘」에 따라 **A2 v1 IMPLEMENT READY_TO_CODE / Gemini 수동중계 대기**. 실제 로그인/L4/조회·empty·session401 격리 Chrome recon 완료; 정상8 활성화/상수verdict 실측교체/원 A-N20 독립112벡터/불완전RC1 및 partial 기준 고정. 기존 A1 prerequisite ACCEPTED 유지, B87/전체A/3-2/배포 수용 대기. 준비 control syntax/원parser/새normal21+HTTP/후보final변조21/observer37+변조9/lifecyclecanary15 PASS는 A2제품수용이 아님. source341/보호337/dirty12/history89 불변·Sol제품수정0. R32C-06 CORRECT2소진/초기화0·A1v8생성0. 현재 HANDOFF.md, 정본 .ai/contracts/phase3-2c-a2-v1/, 근거 .ai/reports/phase3-2c-a2-prepare-20261014/.'
    marker='## 지금 위치와 다음 행동';pos=text.index(marker)+len(marker);text=text[:pos]+'\n\n'+note+text[pos:]
    text=re.sub(r'(?m)^  - 🔄 3-2c\. A1 Sol직접수정 ACCEPTED / A2준비대기\..*$', '  - 🔄 3-2c. A1 prerequisite ACCEPTED / A2 v1 IMPLEMENT READY_TO_CODE. 정상8·원A-N20 검증기 4파일 지시/수동 Gemini 전달 대기. B87/전체A/3-2/배포수용 대기. R32C-06소진/초기화0·A1v8생성0. 현재 `HANDOFF.md`.',text)
    todo.write_bytes(text.replace('\r\n','\n').replace('\n',newline.decode()).encode('utf-8'))
    state=DOC/'.ai/current-state.md';state_bytes=state.read_bytes();state_newline=b'\r\n' if b'\r\n' in state_bytes else b'\n';old=state_bytes.decode('utf-8').replace('\r\n','\n');old=re.sub(r'^Status: .*$', 'Status: PHASE_3_2C_A2_V1_IMPLEMENT_READY_TO_CODE_USER_RELAY_PENDING',old,flags=re.M,count=1)
    entry=f'''## Current task — A2 v1 closed IMPLEMENT packet, user relay pending ({human})

- User next-work/resume instructions authorize A2 preparation. A1v7 Sol direct repair remains ACCEPTED/CLOSED; DEC-002 direct exception fulfilled, normal Gemini writer preserved. This is A2 v1, not A1v8; no external AI CLI/product edit/commit/push/deploy.
- Received closed HANDOFF9714bytes/SHA6125E15E9FFB1557D7B95C9AE29F2C72A19423516D9354FB52A5BE60D99FDFF9 preserved byte-identically at Log/20261014_A1-v7-ACCEPTED_A2준비전보존.md. Product341/main/HEAD160940f9aaeb6696538447f83b44658073e382f0/dirty12 equals accepted sourceAfter. Fresh A2 allow4/protect337, frozen6575 bytes and accepted guard2250-byte body pinned. Historical89 controls unchanged.
- Strategy: genuine login/L4/session, pure negative support and guard relocation, actual protected positive runner, exact normal raw/coverage/process/capture, measured retry/home/logout in legacy diagnostics, normal8 owner FAIL_INCOMPLETE/RC1, true errors preserve partial and first stack. No canonical fullUI87 checks manufactured. Original A-N20 fixed112 vector groups incl all known-case expansions; remaining actual ephemeral probes source+receipt independently reviewed by Sol. Ledger parser alone not runtime acceptance.
- Read-only real Chrome recon ownfresh server18741 confirmed submit exists/oldlogin-btn0/L4/admin query rows2/date132x34/keyword160x34/G2/session list+users401; viewed two1440x900PNG. Root SDK context/browser close and own server close; local temp retained, bootstrap secrets never delivered. Auth schema actual data.userId/loginId/role from source; recon session summary ok only (its nested-user projection omitted identity, not an identity proof).
- Control proof: ready.json names exact parser/syntax receipts, normal synthetic candidate/final21 rejection proof, observer actual generic37 +corruption9/bootstrap acceptedA1 only, realchild/log lifecyclecanary15+parser15. Old deferred8 replaced by actualnormal8 obligations, originalfault51/partial11/typed32/IPC19+port/guard5/late15 retained. No actual A2 implementation/normal8/original112 acceptance yet.
- Sol independently checked agent findings: capture/filter/live matrix and route/query mismatches corrected; guard-provider allegation was stale, actual A2 AST already reads negative and strips export. Frontier Sol; Luna extraction, unavailable Terra -> balanced gpt-6-sol read-only fallback. MCP inspected/no failure; webapp-testing recon skill used. R32C-06 CORRECT2 exhausted/reset0; wholeA/B87/full3-2/release pending.
- New authority .ai/contracts/phase3-2c-a2-v1; fresh execution/baseline/gate/hash and closed methods in STRATEGY.md. HANDOFF only final visible reply writable. TODO/state/control target frozen after issuance. Gemini manual relay next; Sol review of actual diff/commands/negatives/Chrome after reply.

Earlier entries below are historical and do not override this entry.

'''
    pos=old.index('## Current task');old=old[:pos]+entry+old[pos:];state.write_bytes(old.replace('\n',state_newline.decode()).encode('utf-8'))
    # Pin the prior control surface at current bytes plus every new authority file.
    prior=json.loads((HERE.parent/'phase3-2c-a1-v7/baseline.json').read_text(encoding='utf-8'))
    paths={Path(p) for p in prior['control']}|{Path(p) for p in initial['historicalControls']}
    paths|={p for p in HERE.iterdir() if p.is_file() and p.name!='baseline.json'}
    paths|={DOC/n for n in ['TODO.md','.ai/current-state.md','AGENTS.md','GEMINI.md','PROTOCOL.md','CLAUDE.md','07-invariants-and-pitfalls.md','.ai/HARNESS.md','.ai/GEMINI_HANDOFF_TEMPLATE.md']}
    before=inventory();baseline={**before,'allowed':ALLOWED,'control':{str(p.resolve()):meta(p) for p in sorted(paths)}}
    save(HERE/'baseline.json',baseline)
    eh=meta(HERE/'execution.json')['sha256'];bh=meta(HERE/'baseline.json')['sha256'];gh=meta(HERE/'gate-evidence.py')['sha256']
    sources='\n'.join('| '+Path(n).name+' | '+str(before['files'][n]['bytes'])+' | `'+before['files'][n]['sha256']+'` |' for n in ALLOWED)
    status='\n'.join(before['status'])
    plan=json.loads((HERE/'negative-vectors.json').read_text(encoding='utf-8'))
    negative='\n'.join('| '+g['id']+' | '+g['input']+' | '+g['requiredObservation']+' |' for g in plan['groups'])
    controls='\n'.join('| '+p.name+' | '+str(meta(p)['bytes'])+' | `'+meta(p)['sha256']+'` |' for p in sorted(HERE.iterdir()) if p.is_file())
    hand=f'''# HANDOFF — A2 v1 정상8·잔여 A 음성 검증 구현

- Task: 활동 이력 검증기의 정상8 실제 로그인/실행/부분증거와 원 A-N01..20 검증 통합
- Action: IMPLEMENT
- From: Sol(xhigh, Codex) — sole orchestrator
- To: Gemini — external implementation coder
- Time: {human}
- 회신: 필요
- Repository: `C:\\Projects\\Active\\ShiftMgmt_V4`
- Branch: main
- Baseline commit: `160940f9aaeb6696538447f83b44658073e382f0`
- State: READY_TO_CODE / USER_RELAY_PENDING; A1 prerequisite ACCEPTED, A2 implementation NOT RUN
- Counter: R32C-06 기존 CORRECT2 소진/초기화0; A1 v8 생성0; 이번은 후속 A2 단계

## 회신 요청

Gemini는 본문/정본을 수정하지 말고 맨 아래 `## 회신`만 실제 값으로 작성한다. 착수 게이트 누락·기준 불일치·필요한 범위 초과는 수정 전 BLOCKED, 실제 구현·검증 실패는 원 출력/partial을 보존하여 FAILED. IMPLEMENTED는 구현 제출이며 Sol 수용이 아니다. 사용자가 수동으로 중계한다. 다른 AI CLI를 호출하지 않는다.

## 1. 목표

정상8을 자기 격리 서버/DB/실제 Chrome·로그인·IPC로 실행하고, 기획상 fullUI 미완성과 실제 실패를 정확히 구분하는 재현 가능한 증거를 반환한다. legacy ID는 원 fullUI87를 충족하지 않으므로 성공 시나리오도 public `FAIL_INCOMPLETE`/RC1이며 UI PASS가 아니다. 실제 오류를 missing coverage로 덮지 않는다.

## 2. 비목표

UI87 검사 구현·UI/API/DB/권한/계산 수정·새 파일/모듈/의존성 추가·A1 재설계·범위 밖 리팩터링·V3.4 수정·commit/push/deploy는 하지 않는다. frozen 옛 helpers를 수정하지 않는다. 전체A/B/3-2/배포 완료를 선언하지 않는다. Sol의 DEC-002 직접수정 예외는 종료했다.

## 3. 현재 상태와 근거

A1 v7 제출 결함은 사용자 명시 예외로 Sol owner1파일 직접수정 후 고정18명령/runtime51/partial11/guard5/late15/typed32/IPC19+port/관련11/PNG12 검증으로 CLOSED ACCEPTED. 종결 원문은 `Log/20261013_194918_3-2c-A1-v7-Sol直接修正-ACCEPTED_종결본.md`, 이번 교체 전 원문은 `Log/20261014_A1-v7-ACCEPTED_A2준비전보존.md` (9714bytes/SHA `6125E15E9FFB1557D7B95C9AE29F2C72A19423516D9354FB52A5BE60D99FDFF9`). 옛 baseline은 과거 기준이며 복원하지 않는다.

현재 정상 경로는 login-btn 부재, L4 미지원, collector 인수 불일치, Request/query와 Held API 불일치, normal IPC 미지원, 상수 retry/home/logout, raw/final/partial 부재 때문에 닫힌 실행을 못 한다. 관련 소스는 네 검증기, `scripts/lib/ui-check.mjs` 실제 보호 실행기, `src/web/screens/login.ts`, `src/web/screens/access-history.ts`, `src/shared/domain/model.ts:55`, `src/shared/bridge/contracts.ts:897`이며 뒤 파일들은 읽기 전용이다.

Sol 준비만: real isolated18741/Chrome155 recon에서 실제 submit/L4/list/G2/session list 및 users401, date132x34/keyword160x34 확인·PNG2 조회·자기 server/context/browser 종료. observer37+변조9, lifecycle 실제child/log canary15+parser15, 원 판정 parser19+35+43/순서13 및 normal 비교/HTTP/parser와 후보final 변조21 통과. 이것은 A2 제품/정상8/원112 실행 수용 증거가 아니다. 재현 증거 `.ai/reports/phase3-2c-a2-prepare-20261014/control-validation-ready.json`.

기대 초기 상태(source341/dirty12, 허용4/보호337):

```text
{status}
```

|수정 허용 기존 파일|현재 bytes|현재 full SHA-256|
|---|---|---|
{sources}

## 4. 수정 경계

|파일 (scripts/ui-checks/ 아래)|요구사항|허용 hunk|
|---|---|---|
|access-history.mjs|A2R01/07/08/10|새 anchors, 기존 IPC branch 일반화, 정상 evidence helper 호출/불완전 publication, guard export import/move, fixture env 정리, 현재 failure partial 연결|
|access-history-shared.mjs|A2R01/07|execution anchors, frozen 밖 IPC 허용case·actual failurecase·bootstrap realpath 검문만|
|access-history-positive.mjs|A2R02/03/04/05/06|negative normal export alias, 순수 CLI/RUN gating, 관측/partial glue, 기존 near8 tolerance→1, home/logout 실제DOM 진단, protected runScreenCheck 실제 호출 유지|
|access-history-negative.mjs|A2R02/03/04/05/06/08|순수 import/guarded main, named normal support exports 및 기존guard body 이동, 실제 held retry, 독립cleanup/원 raw·partial·final|

각 <=30000 bytes. 추가/삭제/rename0. shared frozen6575bytes/SHA `502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1` 그대로. guard2250bytes/SHA `656B3F632161ADAA1FE76AAE7A68F12E1225D236272C93DBCF61877B2F8EF652` 그대로(export prefix만 추가). 전 파일 재생성/무관format/minify0.

보호: 모든 나머지337제품 경로 및 `.ai/**`, `Log/**`, TODO/AGENTS/PROTOCOL/GEMINI/CLAUDE/07 문서, `C:\\Projects\\Active\\ShiftMgmt_V3.4\\**`. build/test 자연 산출물과 자기 ignore된 atomic captures/지정 osTemp 시험산출물만 허용. HANDOFF의 마지막 회신만 편집.

## 5. 요구사항

|ID|입력/행동 → 기대 결과|오류 경계/위치|
|---|---|---|
|A2R01|원 contract/core9/fullUI87/정밀도1/frozen/accepted guard 및 fresh A2 lock 재사용|scope/source drift 즉시차단; owner/shared/negative guard|
|A2R02|negative를 pure import 지원 모듈로, private CLI 모두 엄격 argv·IPC 후 실행|bootstrapread/mkdir/network/browser/timer는 검문후; noargs/공백/unknown/direct0효과|
|A2R03|실제 signIn/L4 changePassword/getSession과 재로그인 RAM password 갱신|data.userId/loginId/role 실측, authmock0/암호·토큰·cookie출력0; normal login helper|
|A2R04|legacy arity 정상화·near<=1·retry/home/logout 상수 실제 측정|실패diagnostic 먼저저장/throw, canonical 승격0; positive/negative normal helpers|
|A2R05|실제 request query/Held start/release/complete·expected401/403/DATABASE_ERROR 정확상관|raw삭제0/marker401예외0/응답drain5s; normal observer/collector|
|A2R06|각획득부터 partial/fallback, actual Chrome/font/viewport/capture/close·원오류|protected process.exit2 전후 finally가정0·독립close·firststack 보존; positive/negative|
|A2R07|정상8 IPC/RUN/부모자식·nonce/context·path/digest 검문, actual worker1만 정확분류|schema불일치/다른RC/workerfinal부재는실제FAIL; owner/shared|
|A2R08|worker/server/log/gate/barrier/atomic publication을 기존 단일경로에서 재사용|coveragefinal stderr exact8/RC1, 실오류 stdoutPASS0/partial; owner+normal support|
|A2R09|원 A-N20 고정112벡터 및 known-case별 독립확장 실제 실행|parser/canary/ledger만으로actual수용0; ephemeral foundation probes/증거회신|
|A2R10|보호337/frozen/guard 및 원A1 fault51/IPC/typed32/partial11/guard5/late15 유지+actualnormal8|관측generic37+변조9, deferred8을normal실행으로대체; 고정 driver/독립Sol검수|

## 6. Sol 코드 전략 — 선택 완료, 순서대로 구현

착수 전 `{HERE / 'STRATEGY.md'}` 전체를 읽는다. 이 파일은 본 지시서의 상세 closed code/원 raw·worker·owner 스키마이며 Gemini 변경 금지다. 참고 의견이 아니라 정본이다. TODO→AGENTS→HARNESS→PROTOCOL→GEMINI/template와 제품불변을 함께 읽는다.

1. negative에 순수 지원 모듈을 만들고 현재 CLI는 entry realpath 일치 시 main으로만 실행. `validateProcessReceipt` 단일본문 이동, self-contained `isObj` const 유지, owner에서 import. guard 복제/본문수정0.
2. `NormalAssertionCollector/performNormalLogin/parseNormalBridgeQuery/NormalHeldRouteController/installNormalObserver/publishNormalEvidence/readNormalWorkerEvidence` named exports를 STRATEGY §3.1의 닫힌 signatures로 구현. positive는 기존 로컬명 alias. legacy diagnostics는 actual/expected만 보존하여 원 assertion 실패 throw, trusted:false. 원 fullUI required 전부 missing, actuallegacy extra/duplicates 목록, canonical checks[].
3. 실제 `.login-form button[type=submit]`→필요한 L4 IDs→실 getSession, RAM credential 갱신. raw auth whitelist+actual API request 상관. pw/sessionToken/header 저장0. 자기 API로만 role fixture 생성.
4. 기존six/two body 유지와 명시 측정 보강만: near8개1; home재진입 activity/table1 및 logout login1/activity0; errors retry actualbtn1·held native disabled·실Enter/Space/nativeclick requestdelta1→DATABASE_ERRORrelease. 정상 raw에 query exact whitelist, fixture route actual patterns, requestdrain/phase/expectederror 상관.
5. protected runScreenCheck 실제 호출, source helper 변경0. 획득/step/finally/realclose별 partial 원자갱신. outer finally만 믿지 않음. 정확completed+closed+오류0에서만 workerfinal FAIL_INCOMPLETE/1; presteps/aftersteps 실제 exit2는 원 logs/RC/partial부재 또는 currentpartial로 FAIL.
6. shared frozen 밖 normalcase IPC만 추가하고 bootstrap 실제path+data realpath 검문. owner 기존IPCbranch scriptmapping/case/normal120s에 일반화, core0/regression기존 그대로. env는 자기값 외 SHIFT*/SOL*/AUTH_BOOTSTRAP_*/NODE_OPTIONS/NODE_DEBUG 제거. nonce전송RAM 유지, A2 저장ACK은 SHA projection. N18은 실행된 owner의 downstreamenv 검문이다.
7. 정상 support 검문은 settled JSON/PNG와 actual worker1만 읽음. stdout/stderr파일은 actualfinish/close뒤에만 읽어 원protectedpath/RC를 연결. parent 정상 worker1이라고 PASS처리0. sourcecase/workerPid/모든digest·rawSha·actual expectederror·capturepathfullPNG 검문.
8. 실제 worker/server+logssettle→sole guard→성공freeze/live barrier→artifact hash→own temp removal→atomic candidate→gate/spawn/logsettle→exactresult8→atomic final 유지. A2 raw/final/coverage 스키마는 STRATEGY §4/normal-evidence.py 그대로. normal최종 stderr8/RC1. 실오류는 원첫stack/currentpartial/temp보존. 원A1successPASS0형식은 그대로.
9. 대형 normal parser/copy는 negative에서 재사용, owner guard이동분 약2514bytes를 이용; shared는 길게 중복된 handshake path expression을 local 재사용. 실제bytes<=30000 gate, 범위확대/전체압축0.
10. 아래 고정 checks와 원 A-N전벡터 실제관측. 미확인 항목을 통과로 적지 않음. 보호UI실패가나면 firstfailure를보존하고 범위밖 수리 없이 FAILED/BLOCKED.

## 7. 불변조건/과거 함정

V3.4 read-only, 운영 DB/profile/users 접근0, fresh osTemp/bootstrap/session만. 승인·계산 원자성/forward-only/내부ID·근무일요율·DB불변·데이터 조용한절단 금지. API/RBAC/실UI경로를 fixtureauth/mock로 대체하지 않는다. 요청/자식/log의 실제종료가 증거이며 timer/kill요청/캐시 true는 종료가 아니다. actualSDKclose 뒤throw도 실패, 다른close시도 지속. 후반callback은 현재state/raw오류로 보존한다. 같은오류군CORRECT 카운터를 초기화하지 않는다. UI검사에 호출자expected/pass/tolerance를canonical로믿거나 pngheader만 검사하지 않는다.

## 8. 착수 게이트

source341/dirty12/main/fullHEAD 및 위4 초기SHA, 보호337, 역사89controls, frozen/guard, 아래lockedcontract/execution/baseline/gate 메타를 전부 실측. 원 contract/core/B 정본과 상세 STRATEGY/검증 사이 모순0. 하나라도 불일치면 source 수정 전 BLOCKED. `.ai/contracts/phase3-2c-a2-v1/`는 이번 정본, oldv7.baseline 복원0.

- originalContract SHA `014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE`
- executionPath `{HERE / 'execution.json'}` / SHA `{eh}`
- baselinePath `{HERE / 'baseline.json'}` / SHA `{bh}`
- gatePath `{HERE / 'gate-evidence.py'}` / SHA `{gh}`
- python `{Path(r'C:/Users/pangyo/anaconda3/python.exe')}`

owner/shared anchors에는 이 actual 절대경로/fullSHA만 넣는다. gate/parser 출력을 소스수정으로 맞추지 않는다.

## 9. 검증 계획

모든명령 cwd=`C:\\Projects\\Active\\ShiftMgmt_V4`. Python `-X utf8 -B` 사용. build/dist는 기존 npm build 정상산출물만; 제품 source추가0. 다음 첫 gate RC0:

```powershell
& 'C:\\Users\\pangyo\\anaconda3\\python.exe' -X utf8 -B '{HERE / 'gate-evidence.py'}' --execution-sha '{eh}' --baseline-sha '{bh}' --scope
```

구현후 closed112 원음성probe를 별도own osTemp에서 실행한다. 이전Suite와 완전히동일 vector는 최신 A2 소스실행의 정확receipt를 연결해 중복실행하지 않아도되며 oldA1 제출receipt는 새implementation증거로 재사용하지 않는다. 다른vector는 독립실행. fixed schema/전체112 ID는 `negative-vectors.json`, collector schema는 `validate-negative.py`와 STRATEGY §6이다. probe는 아래runtime-computed path에만 작성/실행:

```powershell
$a2ProbeRoot = (& node -e 'const fs=require("node:fs"),os=require("node:os"),path=require("node:path");process.stdout.write(fs.mkdtempSync(path.join(os.tmpdir(),"shiftmgmt-gemini-a2-tests-")));')
$a2ProbeScript = Join-Path $a2ProbeRoot 'foundation-probes.mjs'
$a2NegativeResult = Join-Path $a2ProbeRoot 'negative-results.json'
```

여기에만 source inventory 밖 foundation-probes.mjs/preload/그원logs 작성 허용. 새productfaultflag0. 아래actualprobe command는 모든vector 완료하면driverRC0, SUT/helper의 expected reject/nonzero/close/원stack/actualfault event은 개별trace에 그대로기록한다. 제출에는 변수값을 해소한 literal argv/UTC/PID/fullSHA가 있어야 한다.

```powershell
& node $a2ProbeScript --plan '{HERE / 'negative-vectors.json'}' --result $a2NegativeResult
& 'C:\\Users\\pangyo\\anaconda3\\python.exe' -X utf8 -B '{HERE / 'implementation-checks.py'}' --negative-result $a2NegativeResult
```

두driver기대RC0. actualnormal8각ownerRC1/FAIL_INCOMPLETE, 실제negativeSUT는원벡터기대nonzero(132/133boundary만정상). negative-ledger PASS는 completeness/hash 검문일뿐 독립actual수용이 아니다. Sol은 ephemeralprobe 소스/actualtrace/주입발동·원logs를 독립검수한다.

고정 implementation driver는 아래를 모두 실행/receipt화한다(총22command; 각명령 RC0, 각각자기stdout/stderr/PID/UTC/fullSHA). typecheck/lint/관련11 등count는 기존원시험을 유지하며 실패는원문 보존:

|묶음|exact 실행 및 기대값|
|---|---|
|scope/syntax|scope before+after; `node --check scripts/ui-checks/access-history.mjs`, shared/positive/negative 각각 (4)|
|static|`npm.cmd run typecheck`, `npm.cmd run lint`(기존warning5 허용), `npm.cmd run validate:map`(90), `git diff --check`, `npm.cmd run build`|
|관련시험|`npx.cmd vitest run src/web/screens/access-history-model.test.ts src/main/services/access-log-service.test.ts src/main/http/route-registry.test.ts --maxWorkers=1 --minWorkers=1` (3file/11tests)|
|parser|new gate --self-test (원19+35+receipt43+normal검문), runtime --self-test(기존preflight/ordering/partial13)|
|actualA1|runtime-probes.py execution/baselineSHA (fault51, CLI9, lock3, 양성3+관측3/final6/PNG12, freshgenericobserver37+변조9); deferred8는normal8로대체|
|actualprivate|`node ipc-probes.mjs`(19+port1), `node component-probes.mjs --core-manifest` actualcorefinal `--execution-sha` lockedSHA `--baseline-sha` lockedSHA (typed32/semantic6/top4/actualChromeclose2), `node partial-probes.mjs`(11)|
|actuallifecycle|`lifecycle-probes.py --guard`(valid1/reject5, negative export에서AST추출); default `lifecycle-probes.py`(late15, canary 대체0)|
|actualnormal8|`normal-probes.py --execution-sha`lockedSHA` --baseline-sha`lockedSHA (8case/8ownerRC1/8independentfinalgate, 오류모두실제partial)|
|negativeledger|`validate-negative.py --result $a2NegativeResult` (20groups/112vectors+known등록case별subcommand확장)|

### 9.2 원 A-N20 — 모든열거입력 독립실행

112는 집계plan수이고 N03/N04 knownprivatecase는 각각등록전부별subreceipt를추가한다. 상세expectedProof/허용NOT_USED는 고정JSON에만 있다. N11은 actualSDKclose 후throw, N12/13/14/15/17/18은 actualchild/process/I/O/port 관측이 필수이며 parseronly로 대체0. N07 경계132/133만수용, 나머지거절. N06ownjunction로run/temp/bootstrap 실제escape 검문 가능하나 outside payloadIO0. N14 미사용API만 AST/hash/line으로 NOT_USED, 실제사용API 전부 실제deny.

|ID|입력/주입|반드시관측할거부|
|---|---|---|
{negative}

### 9.3 실제 UI

`http://127.0.0.1:18741/`, installed Chrome `{ready['recon']['chrome']['version']}`, headless1440x900. 각case freshownerTemp, actuallogin/L4/admin·operator/planner/reviewer. 보호runScreenCheck six body/captures 그대로, errors heldretry/실keyboard, sessionactual401. 캡처이름 execution.normalCaptures exact8; `[normal-capture-ID]`를ownerownrun/id.png에복사/bytes/fullSHA/PNGCRC 검증, originalprotectedpath/hash와연결. 기존captures/live-admin/list-fixture-201/empty-fixture-g2/filters-validation-lock/errors-alert/stale-response-prevented/role-guard-operator-planner/session-expired-login. 조건 없는 substring401면제0. rawconsole/page/request/HTTPerrors 모두 보존, 허용은 정확case/phase/source/status/errorCode/request identity 상관만. Fonts15s/core90s/normal120s/home180s/readiness30s/IPC5s/close5s+force5s/log5s/gate15s. code_review만으로runtime완료 선언0.

## 10. 제출 성공 조건과 중단

A2R01..10 실제위치/검증증거 모두, 각4파일<=30000/diffminimal/보호337/frozen/guard/historycontrols불변, fixedchecks22+원112실제벡터및확장/normal8 실제RC1 및capturedraw/firsterrors/close/noncehash/정확coverage. 생성testartifacts실제경로/fullSHA를 제출. 정상8/전체A/B/3-2/배포 수용은 Sol만판정한다.

기준SHA/branch/status/내용모순,4파일scope/30k밖필요,새API/DB/권한설계필요,UI보호소스실패,정본/시험완화필요,환경/도구부재는수정범위확장없이BLOCKED/FAILED. 같은R32C-06 CORRECT3나v8패킷을 요청하지 않는다. failedfirsttest/partial을지우지말고 남긴다.

## 11. 잠금 메타 — 명령으로 산출한 full hash

아래모든 `.ai/contracts/phase3-2c-a2-v1/` 파일은읽기전용. baseline에는source341+currentcontrol{len(baseline['control'])}를잠갔다. 이발송후TODO/state/controls변경0.

|파일|bytes|full SHA-256|
|---|---|---|
{controls}

---

## 회신

판정: 미작성 — Gemini IMPLEMENTED | BLOCKED | FAILED로 실제값 작성

기준: 저장소/main/fullHEAD/최종commit(없으면없음)
초기 상태: exact gitstatus/모든 착수게이트 실측
변경 파일: 각4파일 A2R ID/목적, byte/fullSHA/encoding newline보존
범위 밖 변경: 실제0 또는 정확path/원인
요구사항 대조: A2R01..10 -> path:line/symbol -> 실제검증결과
검증 증거: 고정22command/literalargv/RC/PID/UTCstart/end/stdoutstderr paths+fullSHA
음성 테스트: 원20groups/112vectors/knowncase별모든확장 input->expected->actualRC/원trace/발동증거/close/temp/sideeffects; ledger와actual판정구분
UI 증거: normal8 및core/reg 실제URL/클릭·keyboard·capture/fullSHA/rawerrors/expectedcorrelations/실closedresource
diff 요약: 각file added/deleted/hunks/full diff path/fullSHA, source additions/dependencies0
미해결/가정: 없음 또는 모든firstfailure/미실행항목/partial없는이유/보호소스관련BLOCKED
implementation-result.json, negative-results.json, 각probe/preload 원문literalpath·fullSHA 및모든참조artifact를보존하고연결
'''
    (DOC/'HANDOFF.md').write_bytes(hand.encode('utf-8'))
    sent=DOC/'Log'/f'{stamp}_3-2c-A2-v1-Sol-IMPLEMENT_발송본.md'
    with sent.open('xb') as f:f.write((DOC/'HANDOFF.md').read_bytes())
    assert sent.read_bytes()==(DOC/'HANDOFF.md').read_bytes()
    assert inventory()==initial['sourceBefore']
    for name,expected in initial['historicalControls'].items():assert meta(Path(name))==expected
    for name,expected in baseline['control'].items():assert meta(Path(name))==expected
    result={'status':'READY_TO_CODE_USER_RELAY_PENDING','time':human,'proof':'PREPARATION_ONLY_NOT_A2_IMPLEMENTATION','sourceAfter':inventory(),'sourceUnchanged':True,'history89Unchanged':True,'controlCount':len(baseline['control']),'allowed':ALLOWED,'protected':337,'currentHandoff':{'path':str(DOC/'HANDOFF.md'),**meta(DOC/'HANDOFF.md')},'sentArchive':{'path':str(sent),**meta(sent)},'locks':{p.name:{'path':str(p),**meta(p)} for p in [HERE/'baseline.json',HERE/'execution.json',HERE/'gate-evidence.py']},'A1Accepted':True,'A2Accepted':False,'BAccepted':False,'v8Created':False,'productEdits':0,'next':'User relays complete HANDOFF to Gemini; Sol independently verifies actual implementation reply'}
    save(REPORT/'packet-issued.json',result)
    print(json.dumps({'status':result['status'],'time':human,'source':341,'protected':337,'controls':len(baseline['control']),'handoff':meta(DOC/'HANDOFF.md'),'archive':str(sent),'proof':result['proof']}))
if __name__=='__main__':main()
