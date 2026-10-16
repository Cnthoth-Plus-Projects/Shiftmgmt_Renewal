# -*- coding: utf-8 -*-
from pathlib import Path
import hashlib,json,subprocess
from datetime import datetime
from zoneinfo import ZoneInfo
C=Path(r'C:\Projects\Active\교대근무관리 시스템')
R=C/'.ai/reports/phase3-2-correct1-review-20260930_224512'
received=json.loads((R/'received.json').read_text(encoding='utf-8'))
B=json.loads(Path(received['correctionBaseline']).read_text(encoding='utf-8'))
P=Path(B['repository']);HEAD=B['head']
NOW=datetime.now(ZoneInfo('Asia/Seoul'));STAMP=NOW.strftime('%Y%m%d_%H%M%S');TIME=NOW.strftime('%Y-%m-%d %H:%M:%S KST')
ALLOW=['src/web/screens/access-history.ts','scripts/ui-checks/access-history.mjs']
sha=lambda b:hashlib.sha256(b).hexdigest().upper()
meta=lambda p:{'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())}
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def once(p,b):
    with p.open('xb') as f:f.write(b)
    assert p.read_bytes()==b
def git(*a):return subprocess.check_output(['git','-c','safe.directory=C:/Projects/Active/ShiftMgmt_V4',*a],cwd=P).decode('utf-8')
def files():
    ns=git('ls-files','--cached','--others','--exclude-standard','-z').split('\0')
    return {p:sha((P/p).read_bytes()) for p in sorted(set(ns)) if p and (P/p).is_file()}
F=files();BEFORE=read(R/'scope-before.json');raw=(C/'HANDOFF.md').read_bytes()
assert F==BEFORE['productFiles'] and len(F)==338
assert git('rev-parse','HEAD').strip()==HEAD and git('branch','--show-current').strip()=='main'
status=git('status','--short','--untracked-files=all').splitlines();assert status==B['status']
assert sha(raw)==received['sha256'] and len(raw)==received['bytes'] and Path(received['receivedArchive']).read_bytes()==raw
for p,h in B['protectedFiles'].items():assert F[p]==h,p
for p,m in B['canonical'].items():assert meta(C/p)==m,p
PROBES=read(R/'probe-results.json');assert len(PROBES['groups'])==9
assert sum(x['status']=='PASS' for x in PROBES['groups'])==8
assert [x['name'] for x in PROBES['groups'] if x['status']=='FAIL']==['settled-old-rows-during-debounce']
assert not any(PROBES[k] for k in ['consoleErrors','pageErrors','requestFailures','responses'])
assert all(x['exitCode']==0 for x in read(R/'static-results.json'))
assert all(x['exitCode']!=0 for x in read(R/'cli-results.json'))
INJECT=read(R/'injected-errors.json');INJECT_RUN=read(R/'injected-runner-result.json')
assert INJECT['consoleErrors'] and INJECT['pageErrors'] and INJECT_RUN['exitCode']==0 and '"status":"PASS"' in INJECT_RUN['stdout']
CLEAN=read(R/'server-cleanup.json');assert CLEAN['tempDataCleaned'] and CLEAN['serverStopped']
assert read(R/'server-cleanup.json.first-pass')['tempDataCleaned']
assert read(R/'injected-cleanup.json')['allOwnedTempsRemoved'] and read(R/'injected-cleanup.json')['runnerPortClosed']
transition=C/'Log'/f'{STAMP}_3-2b-CORRECT1-Gemini_CORRECT2전환보존.md';once(transition,raw)
assessment=f'''# Phase3-2b CORRECT1 — Sol 독립 검증 종결 / CORRECT2

- From: Sol · frontier · Date: {TIME}
- Verdict: **CORRECT2 — 수용 보류, 두 번째/마지막 통합 수정 요청**
- Repository: `{P}` · main · `{HEAD}` · HEAD/status9/전체338파일 불변
- 수신원본: `{received['receivedArchive']}` · {len(raw)}bytes · SHA-256 `{sha(raw)}`
- 전환 보존: `{transition}` — 수신 byte-for-byte 동일
- 독립 증거: `{R}`
- 제품 소스 변경·commit/push/배포 by Sol: 0

## 통과한 검증

본문 불변, 수정 exact5, 보호333/정본14/제출9hash·크기 전부 일치. 각5파일30,000bytes 이하. 독립 typecheck/syntax/lint(기존5경고)/map87/관련3파일11시험/diffcheck/build 전부 RC0. 전체133파일919시험은 Gemini 자기보고이며 구체적인 반려 결함 확인 후 Sol이 full suite를 재실행하지 않았다.

설치 Chrome154.0.8037.58/1440×900/fonts.ready 최종9그룹 **8PASS/1FAIL**. 자연 실행의 예상외 console/pageerror/requestfailed/HTTP오류0. 실제 operator/planner/reviewer 세션은 각각 menu0/자동list·users0/direct cookie API AUTH_FORBIDDEN/data없음 PASS다. UI stale 시험의 성공/권한응답은 fixture이며 실제 인증 만료 검증으로 주장하지 않는다.

## stable 결함별 판정

| ID | 판정 | 독립 근거 / 남은 조건 |
|---|---|---|
| R32C-01 | PARTIAL | old success/auth의250ms 내잘못된반영0,keyword→즉시refresh list1회로개선. 다만 screen240–255는count만검색입력중으로바꾸고본문을렌더링하지않아 **settled old row1/loading0**을새keyword와함께보여준다. query변경순간rows/count는현재query를가리켜야하는원계약과CORRECT1 §6.1 미충족. |
| R32C-02 | RESOLVED | held요청→두날짜역전→oldrelease전후loading0,오류사유,native조건잠금유지. |
| R32C-03 | RESOLVED | usersretry1회뒤 native disabled=true. native추가click+강제DOMevent 모두 handlerguard로차단해 users1/logs1. |
| R32C-04 | RESOLVED | hide-approved red실측,model신규정본시험PASS,publishinfo/approval배타분류원문확인. |
| R32C-05 | RESOLVED | normal/1216자긴row40px,날짜132×34,열130/140/100/160/rest640,표aria-label,원문text/title각1216자보존. |
| R32C-06 | PARTIAL / BLOCKER | publicCLI7음성RC1거부개선. 하지만 rawErrors수집만하고판정/manifest에사용0,requestfailed/HTTP/font검사0,commonhelper재사용0. **제품파일을바꾸지않고시험용console1/pageexception2를runtime주입한list-fixture가실제RC0/PASS**. 해당합성오류는제품결함이아니라검증기실패검사다. |

R32C-06 정적 확정 근거: runner236–240 수집→558–560에서무평가PASS;catch567 process.exit(1)가finally568–571실행을막는다.204/223/560 PASS/tempCleaned는실제정리전이다. start74는소유확인전에타PID일수있는포트로health요청하며99–107도spawn의포트소유증명없이로그인시도할수있다. kill125listener는경합·상한없음. 공통runScreenCheck/validateTargetUrl/waitForFontsReady import/call0. 이후CORRECT2는자기소유프로세스·정확한오류검문·최종상태기록을한번에닫아야한다.

실제 제출action-assertions도검사했다(`provided-action-evidence.json`). role-guard는operator/planner **5조건뿐**(reviewer0/plannerusers0/자동호출/data없음0),stale-response1조건(oldsuccess만),errors2메시지조건(retrycount/nativeguard실측0),session-expired2조건중redirect는literal true/true/true이며got401은수집후assert0. 필수10case가실제로요구행동을검사했다는회신서술은입증되지않는다. session signOut자체는별도nativefetch에실제cookie를보내는서버무효화로개선됐으며그부분을가짜라고주장하지않는다.

## 검수 도구 첫 실패 및 정리

첫 native probe에서두번째Playwrightclick은수정된disabled버튼에막혀도구timeout이었다. 제품실패로판정하지않고source/result/serverinfo/cleanup을.first-pass보존했다. 두번째동작을native el.click() 및강제DOMclick event로분리하고fresh격리서버에서재실행해users1/logs1을확인했다. Windows node --import의첫absolute-path입력은URLscheme오류로제품실행전중단;fileURI/structuredargv로고쳐합성오류시험을성공적으로실행했다. 자세한기록 `control-first-failures.md`.

Sol의두Chrome/probe컨텍스트와MCPbrowser종료,격리서버2회ownPIDexit/temp삭제,합성오류runner의ownedtemp삭제/port18741닫힘확인. 과거temp는건드리지않았다. Gemini의역사10실행전체cleanup독립확인주장0.

## 다음 경계

현재CORRECT1검증대상은이판정으로닫는다. TODO/current-state의승인된사실상태만갱신하고수정허용을 **screen/runner 2파일**로줄인다. model/modeltest/CSS와기존4통합파일은새baseline에서보호,총336파일/정본14불변. 원요구/필수10case/full시험게이트유지. R32C-02~05는해소됐지만전체3-2는수용·커밋보류다. CORRECT2재제출도실패하면같은지시서를반복하지않고Sol이전략/범위를재설계한다.3-1e사용자직접화면확인대기도유지한다.
'''
closeout=C/'Log'/f'{STAMP}_3-2b-CORRECT1-Sol-CORRECT2_독립검증종결본.md'
once(closeout,assessment.encode('utf-8'));(R/'assessment.md').write_text(assessment,encoding='utf-8')
# Close the validation target before modifying its TODO/current-state hash.
(C/'HANDOFF.md').write_bytes(assessment.encode('utf-8'))
todo_path=C/'TODO.md';todo=todo_path.read_bytes().decode('utf-8');marker='## 지금 위치와 다음 행동\r\n\r\n';assert marker in todo
notice=f'> **최신 정본({TIME})**: CORRECT1 수정본 검수 **CORRECT2 / 수용 보류**. R32C-02~05 해소, R32C-01 검색입력중old행잔존과R32C-06 오류무시falsePASS/정리/필수행동검사 잔여. 독립static/build/관련11시험 PASS, 실제Chrome9그룹8PASS/1FAIL;합성console/page오류에도검증기RC0/PASS 재현. 다음 HANDOFF는닫힌2파일수정·마지막재제출이며336파일보호. 종결 `{closeout.relative_to(C).as_posix()}`. 아래이전정본은이력.\r\n\r\n'
todo=todo.replace(marker,marker+notice,1)
lines=todo.splitlines(keepends=True)
for i,l in enumerate(lines):
 if l.startswith('| **다음 행동** |'):lines[i]='| **다음 행동** | CORRECT1 검수 CORRECT2. Gemini에HANDOFF 중계→screen/runner 2파일의 R32C-01/06 잔여수정→Sol 재검증. main160940f 유지,수용/커밋보류.3-1e 사용자직접화면확인별도대기. |\r\n'
 elif l.startswith('| 3. 화면 재구축 |'):lines[i]='| 3. 화면 재구축 | 1/10 | 🔄 3-0 ACCEPTED,3-1a/b/c/d 완료,3-1e 커밋·직접확인대기.3-2b/c CORRECT2 닫힌2파일수정/재검증 |\r\n'
 elif l.startswith('  - 🔄 3-2b.'):lines[i]='  - 🔄 3-2b. Gemini CORRECT1 5파일 수정본 수신·Sol 검수 CORRECT2. R32C-02~05 해소,01 검색입력중old행/06 검증기falsePASS 잔여. HANDOFF의닫힌2파일에서마지막수정후재제출;완료/커밋보류.\r\n'
 elif l.startswith('  - 🔄 3-2c.'):lines[i]='  - 🔄 3-2c. CORRECT1 독립static/map87/build/관련11시험 PASS,Chrome9그룹8PASS/1FAIL,실제3역할차단PASS. 검증기에합성console1/page2오류주입해도RC0/PASS 재현. full919시험은Gemini자기보고;Sol이번full재실행아님. CORRECT2에서필수10case·오류판정·정리·전체시험증거재검증.\r\n'
todo_path.write_bytes(''.join(lines).encode('utf-8'))
state_path=C/'.ai/current-state.md';s=state_path.read_text(encoding='utf-8');body=s.split('\n',4)[4];body=body.replace('## Current task — activity history review closed, consolidated correction ready','## Historical task — activity history review closed, consolidated correction ready',1)
state=f'''# Current Project State

Status: PHASE_3_2B_CORRECT_2_USER_RELAY

## Current task — correction1 review closed, final consolidated retry ready ({TIME})

- User asked 「핸드오프 확인해」. ReceivedIMPLEMENTED reply preserved `{received['receivedArchive']}`,{len(raw)}bytes,`{sha(raw)}`. Sol changes product0; Gemini remains externalwriter/manualrelay;no AI CLI.
- Bodyunchanged/scope5/protected333/canonical14/submitted9hashbytes PASS. main`{HEAD}`/status9/all338files unchanged through Sol verification.
- Verdict CORRECT2,notaccepted. R32C-02 invaliddate/03retry/04badge/05design resolved. R32C-01 old success/auth+refreshdup fixed but old settled rows remain during new keyword debounce;06CLI fixed but error collection unused,common tools/cleanup/mandatorycoverage remain invalid. This is the second/last same-group retry; failure after this requires Sol replan rather than another repeated packet.
- Independenttypecheck/syntax/lint(existing5)/map87/focused3files11tests/diff/build PASS. NativeChrome154/1440x900/fontsready9groups8PASS1FAIL,raw unexpectedarrays0. Actualoperator/planner/reviewer guard/menu/autocalls/dataabsent allPASS. Full133files919tests remainsGemini-self-report,notSol-independentfullrerun this rejectionturn.
- Unmodified supplied runner plus control-only runtime fault injection producedconsole1/pageexceptions2 and stillRC0/PASS. Synthetic faults test verifier rejection; they are not product errors. ProvidedassertionJSONs confirm reviewer/many races/retrycount absent and sessionredirect constanttrue. Evidence `{R.relative_to(C).as_posix()}`/final-evidence.json;closeout`{closeout.relative_to(C).as_posix()}`.
- Firstprobe secondclick timedout on trulydisabledbutton;preserved.first-pass,changed controlprobe to nativeclick+forcedDOMevent,reranfreshserver and verifiedusers1/logs1/nativebusy. Firstnode--importpath failed preproduct;fileURI argv corrected. Controlfailures recorded,notproductdefects.
- Newallowlist2: access-history.ts/runner. Protect336including acceptedmodel/modeltest/CSS and4 integrationfiles;canonical14 captured after oldtarget closed and approvedTODO factualupdates. No newsource/deps/API/DB/auth/config/sharedCSS/commonhelper changes.3-2accept/commitpending;3-1euserdirectvisualconfirmationstillpending. No push/deployment.
- OwnreviewChrome/MCP/2servers/tempcleaned;faultcaseownedtempgone and18741closed. Historicaltemps untouched. Harness5.1/roles4.0 retained. BalancedTerraunavailable,gpt-6-sol boundedreadonlyfallback evidence independentlychecked bySol. ActiveP04/P05/P06/P21/P26/P17/P08;Jevdisabled.

Earlier entries below are historical and do not override this entry.

{body}
''';state_path.write_text(state,encoding='utf-8')
COR=C/'.ai/reports'/f'phase3-2-correct2-{STAMP}';COR.mkdir()
canonical={p:meta(C/p) for p in B['canonical']}
baseline={'time':TIME,'repository':str(P),'branch':'main','head':HEAD,'status':status,'editableExisting':ALLOW,'allowedNewAbsent':[],'productFiles':F,'productMetadata':{p:meta(P/p) for p in F},'protectedFiles':{p:h for p,h in F.items() if p not in ALLOW},'controlRoot':str(C),'canonical':canonical,'received':received,'previousCloseout':str(closeout),'sourceChangesBySol':0,'resolvedDefects':['R32C-02','R32C-03','R32C-04','R32C-05'],'remainingDefects':['R32C-01','R32C-06'],'correctionAttempt':2}
write(COR/'baseline.json',baseline);BM=meta(COR/'baseline.json')
text=raw.decode('utf-8-sig').replace('\r\n','\n')
contract='## 5. 유지할 원 요구사항 및 불변조건\n'+text.split('## 5. 유지할 원 요구사항 및 불변조건\n',1)[1].split('## 6. 이번 CORRECT의 Sol 코드 전략',1)[0]
validation='## 8. 검증 계획 / 성공 조건\n'+text.split('## 8. 검증 계획 / 성공 조건\n',1)[1].split('## 9. 즉시 중단 조건',1)[0]
for a,b in [('protected333','protected336'),('보호333','보호336'),('보호4동일','보호7동일'),('각변경5','각변경2'),('허용5변경','허용2변경'),('protected324','protected336'),('변경5≤','변경2≤')]:validation=validation.replace(a,b)
validation=validation.replace('허용5만','허용2만').replace('허용5','허용2').replace('보호324','보호336').replace('protected324','protected336')
contract=contract.replace('새 착수 기준은 원 clean/324/신규부재가 아닌 이 패킷의 dirty9/329/기존5 기준이다.','새 착수 기준은 이 패킷의dirty9/전체338/허용기존2/보호336 기준이다.')
# Previous contract had this fully normalized sentence.
contract=contract.replace('새 착수 기준은 원 clean/324/신규부재가 아닌 이 패킷의 dirty9/329/기존5 기준이다.','새 착수 기준은 이 패킷의dirty9/전체338/허용기존2/보호336 기준이다.').replace('이 패킷의 dirty9/329/기존5 기준','이 패킷의 dirty9/338/기존2 기준')
contract=contract.replace('이 패킷의 dirty9/338/기존5 기준','이 패킷의 dirty9/338/기존2 기준')
def table(paths):return '\n'.join(f'| `{p}` | {meta(P/p)["bytes"]} | `{F[p]}` |' for p in paths)
frozen=[p for p in B['editableExisting'] if p not in ALLOW]+['src/web/screens/shell.ts','src/web/index.html','scripts/copy-web-assets.mjs','docs/codebase-map.md']
status_text='\n'.join(status)
packet=f'''# HANDOFF — Phase3-2b CORRECT2 / R32C-01·06 잔여 / 마지막 재제출

- From: Sol(frontier,유일한오케스트레이터)
- To: Gemini(제품구현코더,사용자수동중계)
- Date: {TIME}
- Action: CORRECT
- 회신: 필요
- Correction attempt: 2 / 마지막 같은결함군 재제출. 실패하면반복지시서를추가발행하지않고Sol이재설계.
- Repository: `{P}` · Branch: main
- Baseline commit: `{HEAD}` · Expected initial worktree: 아래9dirty 유지
- Control root: `{C}`
- 수신원본: `{transition}` · {len(raw)}bytes · SHA-256 `{sha(raw)}`
- 독립검증종결: `{closeout}`

## 회신 요청

Gemini는본문착수기준에맞으면 **두파일만** 최소수정하고원필수게이트전부실행한뒤맨아래보이는 `## 회신`만채운다. body수정/다른AI CLI/commit/push/TODO·.ai·Log변경0. 착수모순/범위필요면수정없이BLOCKED. 첫검증기재작성에서누락했던검문·정리·행동검사를모두실제assertion으로닫아야Sol수용을진행할수있다.

## 1. 목표

새keyword입력순간currentquery의pending본문으로전환해old행을숨기고,검증기가예상외오류·누락된필수동작·정리실패를진짜실패로판정하게수정한다. R32C-01/06 잔여가최종목표이며전체3-2수용은Sol독립재검증후결정한다.

## 2. 비목표

R32C-02~05해소된model/modeltest/CSS와기존4통합파일수정0. 새source/testfile/의존성/DB/API/인증정책/계산/공통CSS/공통runner변경0. 다음화면/리팩터링/전체재생성/원본V3변경/운영패치/배포0. 제품작성권한은Gemini,Sol은검증/전략/Control만작성.

## 3. 현재 상태와 직전 실패 — stable ID 유지

수신본문/5수정범위/보호333/정본14/9회신hash일치. 독립static/build/map87/관련3파일11시험PASS. full133파일919시험은Gemini보고값이며Sol은이번반려에서전체를재실행하지않았다. Chrome154/1440×900/fonts.ready 최종9그룹8PASS/1FAIL,제품자연실행의예상외오류0. 실제3역할서버차단은PASS. 제품소스/HEAD/status338/9은Sol동안불변.

| ID | 상태 / 원인·위치 | 이번 완료 기준 |
|---|---|---|
| R32C-01 | PARTIAL. oldsuccess/auth/refreshdup해소. screen240–255에서keyword/generation/count만갱신하고renderBody를갱신하지않아새query입력뒤oldsettledrow1/loading0. | 모든input직후oldrow0/pendingrole=status,currentcount;stablefilterfocus/caret유지;actualpending/debounce구분;manualrefresh1회/oldfinally영향0. |
| R32C-02 | RESOLVED. invalid날짜held요청전후loading0/사유/실제키보드잠금PASS. | 제품수정0,회귀검사유지. |
| R32C-03 | RESOLVED. usersretry nativebusy/강제eventguard/users1+logs1PASS. | 제품수정0,검증기의pending·requestcountassertions로입증. |
| R32C-04 | RESOLVED. hide-approvedred/publishinfo/approval배타분류model시험PASS. | model/modeltest제품수정0,배지8대표정본검사유지. |
| R32C-05 | RESOLVED. normal/긴row40/date132×34/열130·140·100·160/name/fulltexttitle1216PASS. | CSS제품수정0,실측과title/전체값회귀검사유지. |
| R32C-06 | PARTIAL/BLOCKER. CLI7음성RC1은해소. runner236–240 rawErrors를558–560에서무시→합성console1/pageerror2인데RC0/PASS. catch567 process.exit는finally를막음;PASS/cleanuptrue먼저출력;공통helper/HTTP/request/font누락;role reviewer·필수경합누락. | 아래06-A~E를모두충족. exact10case/actionmanifest/정리후판정·fault거부·실제3역할/401검사. |

독립재현: Control `{R}/probe.mjs`,probe-results.json/PNG. 현재rows잔존스크린샷 `settled-old-rows-during-debounce.png`. 합성검증기재현 `inject-ui-errors.mjs`,`injected-runner-result.json`,`injected-errors.json` — 기존제품파일을바꾸지않고runtime에시험용오류를주입했다. 이합성오류는제품결함이아니라검증기가거부해야할조건이다. 제공manifest/action검사근거 `provided-action-evidence.json`. 첫Sol검수도구의disabledclicktimeout/--import경로오류는제품판정에서제외하고.first-pass/control-first-failures.md에보존했다.

## 4. 닫힌 수정 경계 및 착수 기준

수정허용기존2파일(신규·삭제·rename0,각30,000bytes이하):

| 경로 | 현재 bytes | 전체 SHA-256 |
|---|---:|---|
{table(ALLOW)}

다음7개의수신본은바이트그대로보호한다. 전체나머지336파일도동일하다.

| 경로 | bytes | 전체 SHA-256 |
|---|---:|---|
{table(frozen)}

baseline: `{COR/'baseline.json'}` — {BM['bytes']}bytes / SHA-256 `{BM['sha256']}`.338전체(양식샘플9포함),editableExisting2/protected336/canonical14,신규허용0. TODO/current-state는CORRECT1검증종결후Sol이갱신한새기준이다. 원CORRECT1 baseline은이력,현재착수에사용하지않는다.

예상상태:

```text
{status_text}
```

common scripts/lib/ui-check.mjs/find-chrome,기존shell/home/login runner·시험/package/config/shared/main/API/auth/DB/전역CSS는보호. V3전체읽기전용. Control정본/AGENTS/PROTOCOL/GEMINI/CLAUDE/07/TODO/.ai/Log보호,rootHANDOFF회신만허용. dist/ignored artifacts의고유실행산출물만허용. credentials/password/cookie/recoverykey/stdout/capture노출0.

정본: Control05-screen-spec§8/11-디자인-요청서/12-능력-매트릭스§4.5,시안2026-09-02-2차HTML/12-access-logs-1.html G1/G2와2026-09-06-최종정리/05-디자인-시스템-확정본-v1.3.md. 승인G1:573 schedule-publish info. actualsrc/shared/bridge/contracts.ts의listAccessLogs/query와src/shared/domain/access-log 옵션/actionLabel,access-log-service의ISO날짜inclusive/최신정렬,route-registry의admin guard를재사용하며전부읽기전용.

{contract}

## 6. 이번 수정의 Sol 전략 — 최소 변경으로 모든 게이트 닫기

### R32C-01 — 입력 순간 본문·잠금의 owner 정합성

현재240–255에서value/save·timer취소·세대무효화는유지. 바로oldquery표를제거하고새query를기다리는role=status본문으로렌더링한다. stablefilter DOM/focus/caret를다시만들지않는다. count만변경한채oldrows를currentquery와나란히두지않는다. isLoading을pending표시에사용하고필요한renderBody/updateControls를한번씩호출;debounce대기와실제currentrequest isSubmitting를구분해pendingold세대가currentrefresh/retry잠금을소유하지않도록한다. timer가null로끝나고currentgen/destroyed대조된뒤loadData1회,manualrefresh/date/select/reset/retry는타이머를취소/소비하고최신query1회. 이미통과한invalidrender/usersguard/staleauth/badge/table행을바꾸지않는다. oldfinally는currentpending을해제0. 입력직후row0/status·focus와끝의latestrow를각assertion으로검증.

### R32C-06-A — 공통 실행기·오류 검문

정상/live/UIfixture/role경로는보호된 `runScreenCheck`/`validateTargetUrl`/`waitForFontsReady`/`findChrome`를실제호출. 공통runner는실패에process.exit하므로 **동일runner파일의별도childworker를outerowner가실행**하고child비0에도외부finally가server/temp정리. worker의내부모드는publicCLI우회flag로열지않고owner가준고정URL/ownedtemp/explicitprivateenv만허용;다른AI CLI가아닌Node시험worker다.

actual401/networkabort cases는별도완전계측negativeChrome경로(동일runner파일)로공통URL/health/font/Chrome도구재사용. console/pageerror/requestfailed/HTTP≥400/CSP원목록을모두저장하고정확한APIpath·phase·status·예상횟수만expected분류;그외1개라도FAIL/RC비0. rawErrors배열을읽지않는코드/401문자열포괄제외/200재작성/authmock0. 합성unexpectedconsole/page/HTTP/요청실패거부시험에서실제실패하는지확인한다. 기존code/tempcredentials를출력하지않는다.

### R32C-06-B — cleanup 이후 한 번만 최종 판정

runnercatch의process.exit제거. error저장→finally에서Chrome/context·childserver exit·temp경계확인삭제→cleanupErrors합산→最終manifest/result작성→process.exitCode로종료한다. earlyreturn에서도ownerfinally완료전PASS/tempCleaned출력0. kill전exit/error listener등록,이미exited상태처리,boundedtimeout,cleanup각항목은다른cleanup실패와독립실행. 초기mkdtemp/boot/serverstart/Chrome찾기/launch오류도외부ownerfinally경계안. 공통workerexit와기존회귀childexit의stdout/stderr를보존하고parent정리를막지않게boundedtimeout을설정.

### R32C-06-C — 미소유 서버 접근 0

start74의foreign일수있는healthprobe를포트소유확인으로대체. read-only OS socket/PID조사또는임시bind검사로충돌을거부하며다른PID에health/sign-in/kill0. spawned childPID·listener연결/ownedbootstrap준비를확인한뒤에만네트워크·admin초기화. race/EADDRINUSE/childspawnerror는BLOCKED/FAIL+owncleanup,절대다른기존서버를재사용하지않는다. shadow서버/운영DB/과거temp를건드리는시험0. env SHIFTMGMT_*는제거후explicit ownedtemp/18741/bootstrap만주입.

### R32C-06-D — 실제 누락된 모든 필수 행동 assert

아래10case표의각행동을실제로실행하고input/action/expected/actual/requestcounts/PASS·FAIL/캡처를action-assertions에남긴다. reviewer없음,got401미사용,literaltrue assertion,메시지밖에없는retry시험을이전회신대로PASS라고하지않는다.특히:

- role: freshrealoperator/planner/reviewer(bootstrap미존재면기존admin saveOperationUser API로생성/ok확인),각menu0/auto list·users0/direct cookie AUTH_FORBIDDEN/data없음,admin허용. plannerusers도직접확인.
- session: 별도APIRequestContext또는현재개선된nativefetch에realcookie로server signOut→actual401/AUTH_SESSION_REQUIRED를assert→login전환1/activityDOM0→무cookie directlist거부/data0. got401같은수집값은정확한숫자와본문으로판정하고literaltrue제거.브라우저401console/HTTP의expected는각path/횟수/phase로대조.
- stale: pre250ms old success/error/auth각release,latest후release,oldfinally가newpending잠금해제0,home/placeholder/logoutdestroy와debounce취소,currentAUTH1회. pendingroute완료를bounded하게기다리고unroute는handler끝뒤. fixedsleep으로전체흐름성공을추정0.
- filters/errors: 각filterHTTPbody/keywordlatest1/reset·immediateactions중복0,invalidrawmodel/빈경계/nativefocus·clickSpaceEnter폼Enter0/pendingdisable;listnetworkthrow/G2위장0/users선택loginId보존/heldretry2회추가0/requestcount/native값/XSS실행0.
- live/G1/G2: realresponse행/count/정렬/refreshdouble0;대표8배지·rowid/order·201전체보존·normal/long40·fulltexttitle/invalidtime/XSS/font/name/th/5열;G2성공빈배열만/600/radius8/padding48×24/title18/700/5필터/과거기간/defaultreset1.

### R32C-06-E — 진짜 원본 산출물과 회신

`createUniqueRunDir` 등공통의원자적고유경로를재사용. fontready뒤capture실제파일존재확인. action-assertions/manifest는rawchannels/expected분류차이/실행URL/Chrome/version/viewport/시각/각동작requestcount/firstfailure/stdoutstderr/cleanup과연결한다. saveCapture에서미리PASS를쓰지않고最終owner의일관된status로마감한다. 회귀child의공통manifest는해당부분결과이며소유서버/temp cleanup뒤owner전체PASS가결정됨을명시. 실패는처음로그와최종로그를같이보존. 권한검사3역할중2만실행하거나unused401flag를두고실측완료로회신0. 소유자와경로를입증하지못한cleanup은true로보고0.

## 7. 착수 전 확인 / 최소 변경

repository/main/fullHEAD/status9,이baselinebytes/hash/전체338/허용2현재hash/보호336/정본14일치확인후수정. received변경5위에추가수정2만허용,model/modeltest/CSS/frozen7은현재수용된제출byte보호. 코드증분만고치고전체sourcefile재생성/포맷0. 제품2파일각30k상한.불가능하면먼저필요exact경로/이유/대안과BLOCKED를회신;기존시험완화/추가파일로은밀히범위확대0.

{validation}

## 9. 중단 조건 / 마지막 재제출

baseline/HEAD/status/hash모순,2파일외수정/새파일·dependency·API·auth·DB·공통helper변경필요,30k안에필수검증불가,실제Chrome/realcookie/expected401검사불가면BLOCKED. 실행실패는처음실패와정리결과를숨기지않고FAILED/BLOCKED. CORRECT2뒤같은결함군실패면Sol이전략/범위를재설계한다. 최종수용·커밋·사용자확인·배포는이번구현회신으로추정하지않는다.

## 회신

판정: IMPLEMENTED | BLOCKED | FAILED
기준: repository / main / fullHEAD / finalcommit없음
착수: status9/전체338/허용2/protected336/canonical14/fullbaselinehash 대조
변경: exact2paths / R32C-01 또는06 / 최소증분목적
stable결함: 01잔여/06-A~E 각 원인→심볼→실제재현명령→expected/actual/requestcount→PASS/FAIL/BLOCKED;02~05보호/회귀
원R32-01~09: 각구현/검증근거,누락0
검증: exact명령/시작끝/RC/rawlog/실제files·tests·fail·skip·기존경고
10Chromecase: 실제URL/version/viewport/fonts/realvsfixture/각input-action-expected-actual-requestcounts/manifest/capture전체경로
음성CLI/오류주입/초기화실패: 기대비0/실제RC/原失敗·最終근거/오류raw/정리결과
diff: 2파일증분/전체9status/보호336·정본14불변/deps0/dist·고유artifacts
전체9hash: eachpath bytes/full64SHA;허용2vs보호7 구분
정리: ownChrome/context/childPIDexit/temp realpath삭제;최종status와cleanuperrors
미해결/가정: 없음 | exact목록
TODO제안: 구현제출/수용대기만,완료·커밋·사용자확인추정0
'''
packet=packet.replace('最終','최종').replace('原失敗','원 실패')
assert packet.count('\n## 회신\n')==1
assert '기존5 기준' not in packet and '허용5' not in packet
assert all(f'R32C-0{i}' in packet for i in range(1,7))
assert files()==F and git('status','--short','--untracked-files=all').splitlines()==status
for p,m in canonical.items():assert meta(C/p)==m,p
(COR/'handoff-draft.md').write_text(packet,encoding='utf-8');(C/'HANDOFF.md').write_bytes(packet.encode('utf-8'))
outgoing=C/'Log'/f'{STAMP}_3-2b-Sol-CORRECT2_발송본.md';once(outgoing,packet.encode('utf-8'))
evidence={'time':TIME,'verdict':'CORRECT_2','received':received,'transitionArchive':str(transition),'closeout':str(closeout),'closeoutMetadata':meta(closeout),'sourceChangesBySol':0,'product338Unchanged':files()==F,'head':HEAD,'status':status,'protected333BeforeTransitionUnchanged':True,'canonical14BeforeTransitionUnchanged':True,'static':read(R/'static-results.json'),'independentFocusedTests':{'files':3,'passed':11,'failed':0,'skipped':0},'fullTests':{'status':'GEMINI_SELF_REPORTED_NOT_INDEPENDENTLY_RERUN','reportedFiles':133,'reportedTests':919},'probes':PROBES,'syntheticVerifierErrors':INJECT,'syntheticVerifierRun':INJECT_RUN,'syntheticVerifierCleanup':read(R/'injected-cleanup.json'),'cliResults':read(R/'cli-results.json'),'providedActionEvidence':str(R/'provided-action-evidence.json'),'ownedServerCleanup':CLEAN,'firstPassCleanup':read(R/'server-cleanup.json.first-pass'),'browserClosed':True,'mcpBrowserClosed':True,'controlFirstFailuresPreserved':True,'defectStatus':{'R32C-01':'PARTIAL','R32C-02':'RESOLVED','R32C-03':'RESOLVED','R32C-04':'RESOLVED','R32C-05':'RESOLVED','R32C-06':'PARTIAL_ACCEPTANCE_BLOCKER'},'correctionAttempt':2,'correctionAllowed':ALLOW,'correctionProtected':336,'canonicalCount':14,'baseline':str(COR/'baseline.json'),'baselineMetadata':BM,'outgoing':str(outgoing),'handoffMetadata':meta(outgoing),'accepted':False,'commitPushDeployment':False,'todoChangedOnlyAfterCloseout':True}
write(R/'final-evidence.json',evidence)
write(COR/'dispatch.json',{'time':TIME,'action':'CORRECT','attempt':2,'remainingDefects':['R32C-01','R32C-06'],'handoff':str(C/'HANDOFF.md'),'archive':str(outgoing),'handoffMetadata':meta(outgoing),'baseline':str(COR/'baseline.json'),'baselineMetadata':BM,'productHEAD':HEAD,'productStatus':status,'productFiles':338,'editableFiles':2,'protectedFiles':336,'canonicalFiles':14,'sourceChangesBySol':0,'reviewEvidence':str(R/'final-evidence.json'),'newImplementationStatus':'CORRECTION2_NOT_STARTED','manualUserRelay':True})
write(C/'.ai/reports/phase3-2-latest-review.json',{'reviewDirectory':str(R),'evidence':str(R/'final-evidence.json'),'correctionDirectory':str(COR),'verdict':'CORRECT_2','time':TIME})
print(json.dumps({'verdict':'CORRECT_2','resolved':['R32C-02','R32C-03','R32C-04','R32C-05'],'remaining':['R32C-01','R32C-06'],'allowed':ALLOW,'protected':336,'canonical':14,'baseline':str(COR/'baseline.json'),'baselineMetadata':BM,'packetMetadata':meta(outgoing),'archive':str(outgoing),'sourceChangesBySol':0},ensure_ascii=False))
