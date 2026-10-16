# -*- coding: utf-8 -*-
"""Close v7 review/direct repair before approved factual plan updates."""
from pathlib import Path
from datetime import datetime,timezone,timedelta
import hashlib,importlib.util,json,sys
sys.dont_write_bytecode=True
REPORT=Path(__file__).resolve().parent;DOC=REPORT.parent.parent.parent;REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4');CTRL=DOC/'.ai/contracts/phase3-2c-a1-v7'
CHECKS=Path(r'C:\Users\pangyo\AppData\Local\Temp\shiftmgmt-gemini-a1v7-evidence-y_b3ujev')
def load(p):return json.loads(p.read_text(encoding='utf-8'))
def meta(p):
    b=p.read_bytes();return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest().upper()}
def fresh(p,b):
    with p.open('xb') as f:f.write(b)
def dump(p,v):fresh(p,(json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
def main():
    initial=load(REPORT/'initial-evidence.json');audit=load(REPORT/'final-audit-before-close.json');plan=load(REPORT/'direct-change-plan.json')
    spec=importlib.util.spec_from_file_location('sol_v7_close_snapshot',DOC/'.ai/work/prepare-a1-v7.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    assert m.snapshot()==audit['sourceAfter']
    assert all(meta(Path(p))==h for p,h in {**initial['controlBefore'],**initial['versionControls']}.items())
    assert (DOC/'HANDOFF.md').read_bytes()==Path(initial['receivedArchive']).read_bytes()
    now=datetime.now(timezone(timedelta(hours=9)));when=now.strftime('%Y-%m-%d %H:%M:%S KST');stamp=now.strftime('%Y%m%d_%H%M%S')
    received=DOC/'Log'/(stamp+'_3-2c-A1-v7-Gemini_直接修正後종결전수신원문.md');fresh(received,(DOC/'HANDOFF.md').read_bytes());assert meta(received)==initial['received']
    old_decision=DOC/'Log'/(stamp+'_DEC-002_조건부승인_직접수정종결전보존.md');fresh(old_decision,(DOC/'.ai/decisions/DEC-002.md').read_bytes())
    preserved=REPORT/'control-before-close';preserved.mkdir()
    for name in ('TODO.md','.ai/current-state.md'):fresh(preserved/Path(name).name,(DOC/name).read_bytes())
    findings=[
        {'id':'A1V7-01','requirement':'E7-02','before':'checkBarrier invokes toManifestRecord again after successful cache; controlled helper calls snapshot1','after':'direct live scalar/map/callback comparisons using node:util isDeepStrictEqual; helper snapshotcalls0','kind':'actual extracted helper + source review; no full-owner false PASS claim','status':'FIXED_BY_SOL'},
        {'id':'A1V7-02','requirement':'E7-04','before':'four false/missing/extra/partial logsSettled records accepted by success guard','after':'four rejected; exact own maps and true settlement required','kind':'actual extracted success guard, not full owner run','status':'FIXED_BY_SOL'},
        {'id':'A1V7-03','requirement':'E7-03/06','before':'stop rejection skips settleLogs and drops cleanup error; first stream.end exception skips second stream','after':'both operations/streams independently attempted; original stack retained; two real owner endthrow failures close both streams, retain temp/core proof, no candidate/final','kind':'actual helper fixtures + explicit real owner stream exceptions','status':'FIXED_BY_SOL'},
        {'id':'A1V7-04','requirement':'E7-02/06','before':'finish/close listeners use on despite once contract','after':'finish/close once; error/log-error remain on for every occurrence','kind':'source and regression verification','status':'FIXED_BY_SOL'}
    ]
    dump(REPORT/'findings.json',{'submittedGeminiVerdict':'NOT_ACCEPTED_REQUIREMENT_GAPS','finalVerdict':'ACCEPTED_A1_AFTER_SOL_DIRECT_FIX','findings':findings,'originalSubmittedSuitesPassPreserved':True,'v8Created':False})
    handoff=f'''# HANDOFF — A1 v7 검수·Sol 직접 수정 종결

- Task: 활동 이력 검증기 A1 v7 회신 독립검수 및 승인된 Sol 직접수정
- Action: CLOSED / ACCEPTED_A1_AFTER_SOL_DIRECT_FIX
- From: Sol(xhigh, Codex) — sole orchestrator
- To: 사용자 / 다음 Sol 세션
- Time: {when}
- 회신: 불필요
- Gemini 제출 판정: NOT_ACCEPTED_REQUIREMENT_GAPS
- 최종 판정: A1 prerequisite ACCEPTED, v7 기준으로 Sol 직접수정 후 검증 완료
- 다음: A2 정상8/login/남은A-N01~20 준비, B87/전체3-2/배포 대기
- v8 구현지시서: 생성하지 않음
- Repository: `{REPO}` / main / HEAD `160940f9aaeb6696538447f83b44658073e382f0`

## 1. 결과와 직접수정 권한

**A1 기반 검수는 직접수정 후 통과했다.** Gemini의 v7 제출은 지정18명령/원runtime51/late15/partial11/guard5 등이 실제로 통과하고 회신 해시·diff·명령자료도 정확했다. 그러나 소스 및 실제추출 helper 검수에서 성공snapshot 반복 생성, 로그settlement 검문누락, 정리 예외누락/후속정리스킵, stream once 계약이탈을 확인하여 제출본 그대로 수용하지 않았다.

사용자 「v7 이번에도 해결안되면 v8하지말고 너가 직접하자」와 「한도 복구됬어 작업 이어서 진행해줘」에 따라 `.ai/decisions/DEC-002.md`의 조건부 직접수정 권한을 적용했다. v8 재지시나 추가 Gemini 재제출 없이 기존 owner 한 파일만 직접 수정하고 고정 v7 검증기준을 그대로 재실행했다. 정상 제품 작성자 Gemini 역할의 일반규칙은 유지하며 이번 작업에만 예외를 썼다.

원Gemini runtime/late15 PASS를 FAIL로 다시쓰지 않았다. 이번 원제출 미수용 근거는 아래 helper/source 요구사항 결함이며 v7에서 전체owner falsePASS를 새로 재현했다고 주장하지 않는다. 직접수정 최종판정도 A1 기반에 한정하고 정상8조건·전체87 UI·전체3-2·배포완료로 확대하지 않는다.

## 2. 수신 원문·범위·원제출 증거

- 수신 39097bytes/SHA `3D7F5E3B0C895F9A7F570C420A06F8EF26C8A1BDEA8439C899EFC4AF708022C7`, 요청본문29211bytes 발송본과동일. 마지막회신만수정됨.
- 최초보존 `{initial['receivedArchive']}`; 교체전재보존 `{received}`. 받은파일/두사본 bytes와fullSHA 일치.
- Gemini 변경2: owner29998bytes/SHA `F1C51C85F969D56EDF1AD264088D6E6271702AC1395940AB2BA22BBE397292EC`, shared29907bytes/SHA `FA30EA3CB60A4F7A6FDADFFB626C365FBDA1A12B0D38C66C9C551A89BBB0DA25`.
- 원제출 owner +65/-177/10hunks, shared +2/-2/1hunk 및diff bytes/SHA 모두정확. 실제 `implementation-result.json` 21781bytes/SHA `6400B4D08968C52BD9D6CB762A9888D47C77692964E5F24DA9CB07C62A4AA5DC`.
- 원제출자료 `C:\\Users\\pangyo\\AppData\\Local\\Temp\\shiftmgmt-gemini-a1v7-evidence-n52y76tx/implementation-result.json`: 18명령의PID/UTC/RC 및36 stdout/stderr 메타 전수대조. 모두RC0/timeout없음. stderr는Git LF→CRLF 경고4개 및Node SQLite experimental warning2개이고기능실패가아니다.
- source341/main/fullHEAD/status12/보호339/control538/v7정본20/frozen6575bytes는검수·직접수정중보호기준대로유지. Sol의제품변경은owner1개뿐이며shared는Gemini제출이후불변.

## 3. 남은 요구사항 결함과 최소 직접수정

| 결함 | 원제출 실제근거 | 직접수정 결과 |
|---|---|---|
| A1V7-01 / E7-02 | barrier에서새toManifestRecord, 제어helper snapshot1 | 현재scalar/map/callbacks를동결cache와strict대조, snapshot0 |
| A1V7-02 / E7-04 | logsSettled false/missing/extra/partial4를성공guard가수용 | exact own map/true검문,4거절 |
| A1V7-03 / E7-03·06 | stop오류뒤settle호출0/cleanup오류0; stdout.end오류뒤stderr.end호출0 | 독립정리/오류원stack보존,두stream종료시도 |
| A1V7-04 / E7-02·06 | log finish/close에on 사용 | once로변경,모든error/log-error는on유지 |

수정파일 `scripts/ui-checks/access-history.mjs`: sourcehelper·guard·barrier 관련6hunks +23/-19, 새의존성0. Node built-in util만사용. CRLF/UTF-8보존. bytes 29998→29736 (-262), 각파일30k제약준수.

최종 owner SHA `803C53C05E509D0BF95FFB3880F449B6AD48A559B2F790C096103D27CFFC0564`, shared SHA `FA30EA3CB60A4F7A6FDADFFB626C365FBDA1A12B0D38C66C9C551A89BBB0DA25`. frozen SHA `502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1` 그대로.

`helper-before-direct.stdout.txt`와`helper-after-direct.stdout.txt`는현재source에서추출한함수/실제Writable에명시적인제어예외를준실행이다. 자연OS오류나앱전체실행이라고확대하지않는다. 원stack·secondstream정리·actualtype 검문과snapshot횟수차이를따로확인했다.

## 4. 직접수정 뒤 실제독립검증

고정 `implementation-checks.py`를Sol이직접실행했다. fresh자료 `{CHECKS}/implementation-result.json`와각18 `*.command.json`/stdout/stderr에정확argv/cwd/PID/UTCstart/end/RC/fullSHA가있다. 스크립트임시폴더이름에gemini가포함돼도이번실행주체는Sol이며원제출자료와별개의fresh run이다.

| 검증 | 결과 |
|---|---|
| owner/shared node --check, typecheck/lint/map90/diff/build | 전RC0, lint기존5경고 |
| 관련Vitest3files | 11 PASS |
| original19/legacy35/receipt43, 순서·획득13 판정parser | PASS |
| 원runtime86records/51fault/CLI9/deferred8/lock3 | PASS |
| fresh observer45/control기록변조9 | PASS, bootstrapfalse |
| 정상unobserved3+observed3/finalgate6/PNG12 | PASS |
| IPC19+occupiedport1 | 20 PASS |
| component semantic6/top4/typed32/실제Chromeclose예외2 | PASS |
| partial실제11 | PASS |
| actual guard 정상1/음성5 | PASS |
| actual late15 | PASS,15개각RC1차단/상위suiteRC0,canary아님 |
| helper추가settlement4/independentcleanup/snapshot0 | PASS |
| realowner server/worker endthrow추가2 | PASS |
| 최종scope·source·control·frozen | PASS |

root actualruntime `{load(CHECKS/'implementation-result.json')['runtime51']['artifact']}/suite-result.json`, actual late15 `{load(CHECKS/'implementation-result.json')['late15']['artifact']}/suite-result.json`. 별도 endthrow2 `{load(REPORT/'extra-end-summary.json')['artifact']}/extra-result.json`: 실제worker/server의stdout.end에명시적예외를주입했고두stream물리close/첫원stack/최초core획득raw9checks/acquisition/temp보존/candidate·final없음을확인했다. 자연발생오류라고주장하지않는다. sealed v7 검증파일은수정하지않았다.

각late15의관측해시체인을재검문하고currentfailure콜백·최초stack·exacttemp·candidate staging/rename/gatespawn·finaltmp/게시차단·CORE binding을독립재대조했다. PNG12의실제bytes/fullSHA/규격을재검문하고core로그인/home PNG2를직접열어확인했다. 회귀click/keyboard/console/network는실제protectedrunner의성공결과로확인했다. 전체UI87 시각확인이나사용자직접3-1e확인은아니다.

## 5. 최종 자원·완료 게이트

`final-audit-before-close.json`: 실제관측PID번호368개, 현재남은번호9개는모두관측종료뒤새로생성된PID재사용이며종료하지않았다. 관측된자기프로세스잔류0/port18741 bind가능. directchild/log 및actualbrowserclose 근거이며모든OSdescendant이력을보증한다고표현하지않는다. ownfaulttemp{len(audit['retainedRuntimeOwnTemps'])}개·late/partial/extra자료를그대로보존,과거/foreign/운영DB/기존Chromeprofile정리없음.

scope/invariants/static/relevanttests/negative/runtimeUI/reproducibleevidence의7게이트를위범위에서확인했다. 내부Luna의명령inventory와Terra대체balanced gpt-6-sol의boundedsource 검토는근거보조였고Sol이직접재검증했다. 사용자허가에따른Sol제품1파일수정외새제품파일/의존성/DB/API/계산/UI변경0. commit/push/배포0,V3.4readonly. 기존R32C-06 CORRECT2소진/초기화0 유지.

## 6. 다음 작업과 검증 대상 종결

현재는 **A1 prerequisite ACCEPTED after Sol direct repair**. 다음은A2 정상8/login/남은A-N01~20의상세전략·별도IMPLEMENT범위준비다. 전체A수용뒤에만B87패킷허용. A2/B 구현권한을이종결문으로주지않는다.

이HANDOFF로v7검증대상을CLOSED한뒤TODO/state와DEC-002실행사실을갱신했다. 그따라옛v7baseline의TODO/statehash는역사검증목표다. 후속단계는새현재검증스냅샷을사용하며옛파일을복원해재통과시키지않는다. v8추가구현지시서는만들지않는다.

## 회신 — Sol 최종

원제출: NOT_ACCEPTED_REQUIREMENT_GAPS. 직접수정후: **ACCEPTED_A1_AFTER_SOL_DIRECT_FIX / CLOSED**. E7-01..08이번A1범위충족, A2/B/전체3-2/배포미수용. 새Gemini재제출불필요.

완전근거 `{REPORT}/initial-evidence.json`, `direct-fix-authorization-trigger.json`, `findings.json`, `direct-change-plan.json`, `sol-direct.diff`, `helper-before-direct.command.json`, `helper-after-direct.command.json`, `extra-end-summary.json`, `final-audit-before-close.json`, `final-evidence.json`, 실제18명령 `{CHECKS}/implementation-result.json`. 수신원문·최종종결문byte/SHA보존,기존Logappend-only.
'''
    bytes_out=handoff.replace('\n','\r\n').encode('utf-8');closing=DOC/'Log'/(stamp+'_3-2c-A1-v7-Sol直接修正-ACCEPTED_종결본.md');fresh(closing,bytes_out)
    assert closing.read_bytes()==bytes_out
    (DOC/'HANDOFF.md').write_bytes(bytes_out);assert (DOC/'HANDOFF.md').read_bytes()==closing.read_bytes()
    # Closed target now permits approved factual tracking updates.
    todo=(DOC/'TODO.md').read_bytes().decode('utf-8');nl='\r\n' if '\r\n' in todo else '\n';mark='## 지금 위치와 다음 행동'+nl+nl
    assert todo.count(mark)==1
    entry=f'> **최신 정본({when})**: v7회신원문·18명령/diff/SHA일치, 지정51/late15등PASS였으나helper/source4결함으로원제출미수용. 사용자조건부승인DEC-002에따라 **Sol직접1파일수정·A1 prerequisite ACCEPTED / CLOSED**,v8생성0. 원51/late15/guard5/partial11/observer45+변조9/IPC20/typed32/추가actualendthrow2/관련11/양성6·PNG12 재검증PASS. owner29998→29736bytes·CRLF보존,보호339/control538/v7정본20검수중불변. R32C-06소진/초기화0·A2/B/전체3-2/배포대기. 종결 `{closing.relative_to(DOC).as_posix()}`, 근거 `{REPORT.relative_to(DOC).as_posix()}/`.'+nl+nl
    todo=todo.replace(mark,mark+entry)
    old='**Phase3-2c-A1 v7 IMPLEMENT READY_TO_CODE / Gemini 수동 중계 대기. A1_NOT_ACCEPTED 유지.**';assert todo.count(old)==1
    todo=todo.replace(old,'**Phase3-2c-A1 Sol 직접수정 ACCEPTED / A2 준비 대기. 전체 A·3-2 수용은 대기.**')
    lines=todo.splitlines(keepends=True);count=0
    for i,line in enumerate(lines):
        if line.startswith('| **다음 행동** |'):lines[i]='| **다음 행동** | A1직접수정독립검수통과. Sol이A2정상8/login/남은A-N01~20의전략·별도패킷준비→Gemini구현→Sol전체A검수. A/B전체수용·배포대기. |'+nl;count+=1
        elif line.lstrip().startswith('- 🔄 3-2c. '):
            prefix=line[:len(line)-len(line.lstrip())];lines[i]=prefix+'- 🔄 3-2c. A1 Sol직접수정 ACCEPTED / A2준비대기. 원v7제출helper/source결함4를사용자DEC-002승인으로직접해결,v8생성0. A2/B/전체3-2수용·배포대기. 원CORE9/fullUI87·R32C-06소진/초기화0유지. 현재 `HANDOFF.md`.'+nl;count+=1
        elif line.lstrip().startswith('- 🔄 3-2c-A. '):
            prefix=line[:len(line)-len(line.lstrip())];lines[i]=prefix+f'- 🔄 3-2c-A. A1 prerequisite Sol직접수정 ACCEPTED ({when}), 전체A는A2대기. 원제출4결함→owner1파일6hunks +23/-19,29736bytes. 원51/late15/guard5/partial11/observer45/변조9/IPC20/typed32/추가ownerendthrow2/관련11/PNG12 PASS. 보호339/control538/v7정본20종결전불변. DEC-002조건실행·v8생성0·R32C-06초기화0. A2정상8/login/남은A-N01~20·B87대기. 근거 `{REPORT.relative_to(DOC).as_posix()}/`.'+nl;count+=1
    assert count==3;todo=''.join(lines)
    assert '| R-18 |' not in todo
    todo=todo.rstrip('\r\n')+nl+'| R-18 | 2026-10-13 | 「v7 이번에도 해결안되면 v8하지말고 너가 직접하자」 — A1 v7 미해결시Sol직접수정 | 조건부직접수정승인 DEC-002. v7검수4결함확인→Sol이owner1파일직접수정·동일v7필수검수전수PASS·A1 ACCEPTED. v8지시서0/추가승인재요청0. 다른작업의일반Gemini작성자역할유지. | ✅ 승인·조건실행완료 |'+nl
    (DOC/'TODO.md').write_bytes(todo.encode('utf-8'))
    state_path=DOC/'.ai/current-state.md';state=state_path.read_bytes().decode('utf-8');pos=state.index('## Current task')
    current=f'''# Current Project State

Status: PHASE_3_2C_A1_V7_SOL_DIRECT_ACCEPTED_CLOSED_A2_PREPARATION_PENDING

## Current task — v7 review/direct repair closed A1 ACCEPTED ({when})

- User 「핸드오프 확인해」 plus DEC-002 「v7 이번에도 해결안되면 v8하지말고 너가 직접하자」 and resume 「한도 복구됬어 작업 이어서 진행해줘」. ReceivedGemini39097bytes/SHA3D7F5E3B0C895F9A7F570C420A06F8EF26C8A1BDEA8439C899EFC4AF708022C7 archived unchanged at {initial['receivedArchive']} and {received}. Request29211bytes unchanged. Complete closingHANDOFF archived {closing}. Target CLOSED before factualTODO/state updates.
- OriginalGemini evidence21781bytes/SHA6400B4D08968C52BD9D6CB762A9888D47C77692964E5F24DA9CB07C62A4AA5DC/18commands/PIDUTC/36outputs/diff+65/-177/10hunks,+2/-2/1hunk allmatch. Original51+late15PASS retained. Source/helper residual A1V7-01..04 repeatedsnapshot, logsSettled4invalidaccepted, cleanupskip/errorloss/secondstreamskip, streamon-vs-once -> submissionnotaccepted. No fullownerfalsePASS claimed for helper evidence.
- Conditionaldirectauthority triggered; Sol directlychangedonlyowner6hunks+23/-19; 29998→29736bytes/SHA803C53C05E509D0BF95FFB3880F449B6AD48A559B2F790C096103D27CFFC0564/CRLFpreserved. Live strictfieldcomparison(no repeattoManifest), settled exactownmaps, independentcleanup+originalstack, independentstreamends/destroy, oncefinishclose/errorson. SharedGemini29907bytes/SHAFA30EA3CB60A4F7A6FDADFFB626C365FBDA1A12B0D38C66C9C551A89BBB0DA25 unchanged bySol. No v8packet/commit/push/deploy/newdependency/productschemaUIchange;V3.4readonly.
- Postdirectactual18commands allRC0/noTimeout at {CHECKS}/implementation-result.json: syntax/typecheck/lint(existing5)/map90/diff/build/focused3files11; originalruntime86/51fault/CLI9/deferred8/lock3/observer45/corrupt9/positive6/final6/PNG12; IPC19+port1; semantic6/top4/typed32/realChromeclose2; partial11; guardreject5; defaultactual-late15. Extraactualserver/workerendthrow2 originalstack/bothlogsclosed/temp+firstcorestatepreserved/no candidatefinal. Helper4settlementreject/cleanupstop+settle/snapshot0 PASS. Viewedcore/home2,PNG12fullSHA/dimensionschecked. A1 prerequisite ACCEPTED afterdirectfix, notA2/B/fullUI87/whole3-2/release.
- Source341/main/HEAD160940f9aaeb6696538447f83b44658073e382f0/status12/protect339/control538/v7files20/frozen6575bytes stablethroughclosure; onlyownerchangedbySol. Audit368observedPIDnumbers/currentlive9alllaterOScreationPIDreuse/noforeignkill,ownobservedremaining0/18741free. Retainownfaulttemps{len(audit['retainedRuntimeOwnTemps'])} pluslate/partial/extraevidence. Directchild/log+actualbrowsercloseproof,notuniversalOSdescendanthistory.
- R32C-06 CORRECT2exhausted/reset0 remains. NormalGeminiwriter role preserved except completedcurrentdirectexception. Next Sol A2normal8/login/remainingA-N01..20 strategy/separatepacket; wholeAaccepted beforeB87. No freshA2/Bimplementationauthorization fromclosedreport. Oldv7baseline becomeshistorical afterTODO/state updates; do notrestore/repair/reuse asfreshvalidationtarget.
- Evidence {REPORT}/initial-evidence.json, direct-fix-authorization-trigger.json, findings.json, direct-change-plan.json, sol-direct.diff, helperbefore/afterreceipts, extra-end-summary.json, final-audit-before-close.json, final-evidence.json. FrontierSol/economyLunainventory/balancedTerrafallbackgpt-6-solreadonlyreview independentlychecked. MCPinspected/noMCPfailure, code_review/P04/P06/P13 applied. R-18 registered afterclosure,DEC-002 fulfilled.

Earlier entries below are historical and do not override this entry.


'''
    state_path.write_bytes(current.replace('\n','\r\n').encode('utf-8')+state[pos:].encode('utf-8'))
    decision_path=DOC/'.ai/decisions/DEC-002.md';decision=decision_path.read_bytes().decode('utf-8')
    decision=decision.replace('- 상태: 사용자 승인 완료 / 조건부 실행 대기','- 상태: 사용자 승인 완료 / 조건 충족·Sol 직접수정 및 A1 검증 완료',1)
    decision+=f'\n## 실행 완료 기록 ({when})\n\n위 실행 전 설명은 승인 당시 기록이다. v7 독립검수에서 현재 작업의 요구사항 결함을 재현하여 조건이 충족됐고, Sol이 owner 한 파일을 직접 수정했다. 기존 v7 필수검수와 추가실제 stream.end 예외2조건이 통과하여 A1 prerequisite ACCEPTED로 종결했다. v8 지시서는 만들지 않았다. 원승인 기록은 `{old_decision}`에 바이트 그대로 보존했다. 근거 `{REPORT}/final-evidence.json`.\n'
    decision_path.write_bytes(decision.encode('utf-8'))
    registry=DOC/'.ai/decisions/registry.md';b=registry.read_bytes();fresh(preserved/'registry.md',b);reg=b.decode('utf-8');regnl='\r\n' if '\r\n' in reg else '\n'
    assert '`DEC-002`' not in reg;registry.write_bytes((reg.rstrip('\r\n')+regnl+'| `DEC-002` | EXECUTED / A1 ACCEPTED | TASK_SPECIFIC_CODE_OWNER_EXCEPTION | v7 미해결시v8없이Sol직접수정. 조건실행·검증완료, 다른작업Gemini역할유지 |'+regnl).encode('utf-8'))
    after=m.snapshot();assert after==audit['sourceAfter']
    skipped={str(DOC/'TODO.md'),str(state_path)};still=0
    for p,h in initial['controlBefore'].items():
        if p not in skipped:assert meta(Path(p))==h,p;still+=1
    for p,h in initial['versionControls'].items():assert meta(Path(p))==h,p
    final={'verdict':'ACCEPTED_A1_AFTER_SOL_DIRECT_FIX','submittedVerdict':'NOT_ACCEPTED_REQUIREMENT_GAPS','time':when,'reviewTargetClosed':True,'A1Accepted':True,'A2Accepted':False,'BAccepted':False,'whole3_2Accepted':False,'sourceBefore':initial['sourceBefore'],'sourceAfter':after,'SolProductFilesChanged':['scripts/ui-checks/access-history.mjs'],'receivedArchive':{'path':str(received),**meta(received)},'closingArchive':{'path':str(closing),**meta(closing)},'currentHandoff':meta(DOC/'HANDOFF.md'),'directAuthorityOriginalArchive':{'path':str(old_decision),**meta(old_decision)},'decisionCurrent':meta(decision_path),'controlFilesDuringReview':538,'controlsUnchangedDuringReview':True,'controlsUnchangedAfterClosure':still,'intentionalPostClosureStateUpdates':{p:meta(Path(p)) for p in sorted(skipped)},'versionControlsUnchanged':20,'actualChecks':str(CHECKS/'implementation-result.json'),'directDiff':plan,'findings':findings,'audit':meta(REPORT/'final-audit-before-close.json'),'v8Created':False,'counterReset':0,'commitPushRelease':False,'next':'A2 strategy preparation; B87/whole3-2/release pending'}
    dump(REPORT/'final-evidence.json',final)
    print(json.dumps({'status':final['verdict'],'time':when,'handoff':meta(DOC/'HANDOFF.md'),'controlsAfterClosure':still,'SolChangedFiles':1,'A1Accepted':True,'A2Accepted':False,'v8Created':False}),flush=True)
if __name__=='__main__':main()
