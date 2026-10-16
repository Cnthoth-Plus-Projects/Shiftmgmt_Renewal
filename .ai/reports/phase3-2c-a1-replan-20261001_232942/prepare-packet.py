# -*- coding: utf-8 -*-
"""Sol control-only plan update and immutable A1 packet preparation.
Does not edit any product source, test, configuration, or historical Log file.
"""
from datetime import datetime
from pathlib import Path
import hashlib, json, subprocess, sys
ROOT=Path.cwd().resolve()
REPORT=ROOT/'.ai/reports/phase3-2c-a1-replan-20261001_232942'
NEW=ROOT/'.ai/contracts/phase3-2c-a1-v2'
OLD=ROOT/'.ai/contracts/phase3-2c-v1'
REPO=Path(r'C:\Projects\Active\ShiftMgmt_V4')
def sha(data):return hashlib.sha256(data).hexdigest().upper()
def meta(path):
    data=Path(path).read_bytes();return {'bytes':len(data),'sha256':sha(data)}
def write_json(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def git(*args):return subprocess.check_output(['git',*args],cwd=REPO).decode('utf-8')
init=json.loads((REPORT/'init.json').read_text(encoding='utf-8-sig'))
source=init['source'];allowed=init['allowed']
received=(ROOT/'HANDOFF.md').read_bytes()
assert len(received)==init['closedHandoffBytes'] and sha(received)==init['closedHandoffSha256']
assert Path(init['closedHandoffArchive']).read_bytes()==received
names=git('ls-files','--cached','--others','--exclude-standard','-z').rstrip('\0').split('\0')
assert set(names)==set(source['files']) and len(names)==341
assert git('rev-parse','HEAD').strip()==source['head'] and git('branch','--show-current').strip()==source['branch']
assert git('status','--porcelain','--untracked-files=all').splitlines()==source['status']
assert all(meta(REPO/name)==value for name,value in source['files'].items())
assert meta(OLD/'baseline.json')['sha256']=='E590E18BF5C79CDD19B4F93AD86D4D194D4E280DAF26C60A57BB59E43CE4AA50'
old_baseline=json.loads((OLD/'baseline.json').read_text(encoding='utf-8-sig'))
for name,expected in old_baseline['control'].items():
    if Path(name) not in [ROOT/'TODO.md',ROOT/'.ai/current-state.md']:assert meta(name)==expected, name
assert not (NEW/'baseline.json').exists(), 'Do not regenerate a dispatched baseline'
now=datetime.now().astimezone();stamp=now.strftime('%Y%m%d_%H%M%S');label=now.strftime('%Y-%m-%d %H:%M:%S KST')
prior_controls={str(p):meta(p) for p in [ROOT/'TODO.md',ROOT/'.ai/current-state.md']}
def preserve_update(path,fn):
    raw=path.read_bytes();bom=raw.startswith(b'\xef\xbb\xbf');text=raw.decode('utf-8-sig')
    newline='\r\n' if '\r\n' in text else '\n';text=text.replace('\r\n','\n');changed=fn(text)
    assert changed!=text;path.write_bytes((b'\xef\xbb\xbf' if bom else b'')+changed.replace('\n',newline).encode('utf-8'))
def todo_update(text):
    heading='## 지금 위치와 다음 행동\n'
    assert text.count(heading)==1
    paragraph=f'\n> **최신 정본({label})**: 사용자 「응 진행해줘」「작업이 멈췄네 이어서 작업해줘」「한도 복구됬어 하던 작업 이어서 진행해」 승인에 따라 **3-2c-A1 실행 전략 v2 IMPLEMENT 준비 / Gemini 수동 중계 대기**. owner/shared 기존2파일만 허용·339제품파일/기존helper frozen 보호. 정리 뒤 sealed candidate를 고정 외부 gate가 실제 판정한 경우에만 PASS. 원래계약v1·CORE9/fullUI87·R32C-06 기존2회CORRECT소진 이력 유지, 회수초기화0. Sol제품수정0·제품341/main/HEAD/status12 불변. 정상8로그인·partial·남은음성조건은 A2 별도패킷, A1만으로A전체수용불가/B허용0. 새판정기 parser/selftest·파일형식3양성/14거절 확인은 제품runtime증거가 아니다. Gemini구현·Sol독립검수는 아직미실행. 정본 `.ai/contracts/phase3-2c-a1-v2/`, 현재 `HANDOFF.md`. 아래 이전 정본은 이력.\n'
    text=text.replace(heading,heading+paragraph,1)
    lines=text.splitlines()
    for i,line in enumerate(lines):
        if line.startswith('| **지금 위치** |'):
            start=line.index('아래는 과거 진행 이력:');lines[i]='| **지금 위치** | **Phase3-2c-A1 실행 전략 v2 IMPLEMENT 준비 완료 / Gemini 사용자 중계 대기.** '+line[start:]
        elif line.startswith('| **다음 행동** |'):
            lines[i]='| **다음 행동** | 새 `HANDOFF.md`를 Gemini에 전달 → 허용 owner/shared2파일 A1 구현·고정 gate/실제음성시험 증거 회신 → Sol 독립검수. 정상8/A2와 전체87ID/B는 별도패킷 대기. |'
        elif line.startswith('| 3. 화면 재구축 |'):
            lines[i]='| 3. 화면 재구축 | 1/10 | 🔄 3-0/3-1a~d 완료·3-1e 직접확인 대기. 이전3-2c-A FAILED 이력 유지·A1 실행 전략 v2 준비/A2·B 대기. 3-2 수용·커밋 보류 |'
        elif line.startswith('    - ⏸ 3-2c-A.'):
            lines[i]='    - 🔄 3-2c-A. 이전 제출 독립검수 FAILED / A_NOT_ACCEPTED 이력 유지(2026-10-01 22:43:38 KST, `Log/20261001_224338_3-2c-A-Sol-FAILED_독립검수종결본.md`). 사용자 승인으로 A1 실행 전략 v2 IMPLEMENT 준비: owner/shared2파일·보호339·외부고정gate 필수·실제core9/회귀2/오류주입24/IPC 검증. 현재 구현·수용 미실행. 정상8로그인·partial·원래A-N01~20 남은하위조건은 A2 별도패킷. R32C-06/기존2회수정소진 유지·회수초기화0.'
        elif line.startswith('    - ☐ 3-2c-B.'):
            lines[i]='    - ☐ 3-2c-B. A1+A2 전체 A 독립수용 후 별도 패킷으로8화면/2회귀 전체87ID·시각/query/callback·fault검증. 현재 구현허용0.'
    return '\n'.join(lines)+('\n' if text.endswith('\n') else '')
preserve_update(ROOT/'TODO.md',todo_update)
def state_update(text):
    old='Status: PHASE_3_2C_A_FAILED_ACCEPTANCE_WITHHELD_REPLAN_PENDING'
    assert text.count(old)==1;text=text.replace(old,'Status: PHASE_3_2C_A1_READY_TO_CODE_USER_RELAY_PENDING',1)
    entry=f'''## Current task — A1 execution strategy v2 packet prepared ({label})

- User approved continued replan/new packet; latest 「한도 복구됬어 하던 작업 이어서 진행해」 restores continuation only. Sol orchestrator/control writer; Gemini product writer/manual relay. Product edits by Sol0; AI CLI/commit/push/deploy0; V3.4 read-only.
- Prior A FAILED/A_NOT_ACCEPTED and R32C-06/two exhausted corrections retained; IMPLEMENT strategy replacement, no CORRECT3/counter reset. Original v1 contract/strategy/checker/baseline unchanged. A1 is prerequisite only; A2 normal8/login/partial/remaining original negative obligations and B87 remain unaccepted/unauthorized.
- Closed allowlist2: access-history owner/shared; source341/protected339/HEAD main160940f9aaeb6696538447f83b44658073e382f0/status12 unchanged. Legacy shared helper fragment6,575bytes frozen, known login/collector defects deferred to A2. No new product files/dependencies/UI/model/normal-case edits.
- New locked control folder .ai/contracts/phase3-2c-a1-v2: execution/strategy/frozen fragment, external gate, actual runtime fault/IPC/component probes, fresh baseline after this approved plan update. Candidate after quiescence→actual fixed Python adjudicator→gate close/log finish→atomic final→single PASS. No parser selftest substitution for SUT evidence.
- Control Python compile2/Node syntax3, gate selftest original2positive/19reject +10extra rejects, filesystem parser3positive/14reject and plan list checks passed. These are control/parser proof only; Gemini implementation and A1 runtime acceptance are future/unverified. Offline owned Chrome spawn/close confirms sanitized Node diagnostic channel only. Native Windows process-start subscription access denied, not silently claimed available.
- Luna read-only scope discovery; Terra unavailable, balanced gpt-6-sol bounded packet review fallback. Sol checked sources and incorporated current-run helper inputs, preflight side effects, fault-specific gate rejection, regression IPC=false, actual Chrome observation and finite supervisor waits. No subagent writes or final authority transfer.
- Received failed closeout archived unchanged before replacement at {Path(init['closedHandoffArchive']).relative_to(ROOT).as_posix()}, SHA {init['closedHandoffSha256']}, {init['closedHandoffBytes']}bytes. New outgoing exact hash/bytes/reply-body digest are recorded in {REPORT.relative_to(ROOT).as_posix()}/dispatch.json; append-only Log dispatch preserved. TODO/state locked by fresh baseline; Gemini may edit only final reply section.
- Next: user manually relays HANDOFF to Gemini; Gemini implements A1 two files and returns exact scope/source/artifact/command/negative evidence. Sol independently verifies before A1 acceptance and any A2 packet. Phase3-2/3-2d/3-3 and3-1e user direct visual confirmation pending.

Earlier entries below are historical and do not override this entry.

'''
    anchor='## Current task — A submission independently rejected';assert text.count(anchor)==1
    return text.replace(anchor,entry+'## Historical task — A submission independently rejected',1)
preserve_update(ROOT/'.ai/current-state.md',state_update)
controls={name:meta(name) for name in old_baseline['control']}
controls[str(OLD/'baseline.json')]=meta(OLD/'baseline.json')
for name in ['execution.json','STRATEGY.md','frozen-shared.json','gate-evidence.py','runtime-preload.mjs','runtime-probes.py','ipc-probes.mjs','component-probes.mjs']:
    controls[str(NEW/name)]=meta(NEW/name)
assert len(controls)==27
baseline={'time':now.isoformat(),'repository':str(REPO),'head':source['head'],'branch':source['branch'],
    'status':source['status'],'files':source['files'],'allowed':allowed,'control':controls,
    'previousReview':init['previousReview'],'stageSlice':'A1','acceptance':'A1_PREREQUISITE_ONLY_A2_B_PENDING',
    'retryHistory':{'class':'R32C-06','correctionsExhausted':2,'resetAllowed':False}}
write_json(NEW/'baseline.json',baseline)
execution_meta=meta(NEW/'execution.json');baseline_meta=meta(NEW/'baseline.json')
locked_args=f"--execution-sha {execution_meta['sha256']} --baseline-sha {baseline_meta['sha256']}"
gate_cmd=f"& '{sys.executable}' '{NEW/'gate-evidence.py'}' {locked_args}"
status='\n'.join(source['status'])
control_table='\n'.join(f"| `{name}` | {value['bytes']} | `{value['sha256']}` |" for name,value in {**controls,str(NEW/'baseline.json'):baseline_meta}.items())
dirty_names=[line[3:] for line in source['status']]
source_table='\n'.join(f"| `{name}` | {source['files'][name]['bytes']} | `{source['files'][name]['sha256']}` | {'A1 수정 허용' if name in allowed else '바이트 보호'} |" for name in dirty_names)
requirements='''| E2-01 | CLI/cwd/고정hash/등록case/점유port | 부작용 전에 검문, 정상8은 BLOCKED_STAGE/RC1 | owner CLI/preflight |
| E2-02 | 서버 생성·readiness | registry/단일30sdeadline/실제 health/temp/첫오류 보존 | owner server owner/registry |
| E2-03 | owner context→worker ACK→owner RUN | 실제 PID/nonce/고정URL/정확path/hash, RUN 전 부작용0 | shared performWorkerIpcHandshake + owner IPC |
| E2-04 | 실제 core 실행 | DOM/viewport/route event/compiled labels/fixture/Chrome/resources 관측과 CORE9 | shared runContractCore |
| E2-05 | 관측→checks | fixedexpected/op/ID/pointer·recursivefinite/type·immutable snapshot·추가arg거절 | shared collectCoreChecks |
| E2-06 | 실패·자원 종료 | context/brower 독립close/primary보존/actualexit+close/logfinish/불확실temp보존 | shared settleOwnedResources + owner teardown |
| E2-07 | 보호회귀2 | 실제 runner/원manifest/복사4+1PNG/health/error/time/3raw pointers | owner regression dispatch/evidence |
| E2-08 | 정리→candidate→외부gate→final | 실제고정Python판정·close/logfinish·atomicpublish뒤단일PASS | owner adjudication/publish |
| E2-09 | 범위·실제검증·회신 | source341/allow2/protect339/control27/frozen 보존·현재runtime증거·A2/B대기명시 | 두allowed파일/회신 |'''
defects='''| A32F-01 판정/PNG/coverage/raw 오류 | E2-04/05/08의 실제 gate 판정 및 runtime fault |
| A32F-02 회귀 child0만으로 PASS | E2-07 원 증거/캡처 판정, no-evidence 실제 음성 |
| A32F-03 비교/관측 | E2-04/05 core 경로 교체; frozen legacy collector/normal8 문제는 A2 미해결 |
| A32F-04 IPC/ACK후즉시실행 | E2-03 등록/검문/ACK/RUN와 실제14 IPC+owner fault |
| A32F-05 cleanup/timeout/firstError | E2-02/06/08 A1 수명 교체; normal8 partial/cleanup 및 원래남은분기는 A2 |
| A32F-06 로그인/body/partial 회귀 | A2에 보존. A1 수정 허용0·8case stage차단은 해결/전체수용으로 보고금지 |
| A32F-07 증거 hash/시험 대체 | E2-09 실제 command/PID/time/RC/artifact 전체SHA·미검증명시 |
| A32F-08 preflight/deadline/쓰기 | E2-01/02/06/08 실제 부작용0/단일deadline/실패firstError |'''
core_rules='\n'.join(f"| {r['id']} | `{r['pointer']}` | `{r['op']}` | `{json.dumps(r.get('expected', 'actual installed Chrome or actual closed resources'),ensure_ascii=False,separators=(',',':'))}` |" for r in json.loads((OLD/'contract.json').read_text(encoding='utf-8'))['foundation']['rules'])
strategy=(NEW/'STRATEGY.md').read_text(encoding='utf-8-sig')
strategy=strategy.replace('--execution-sha <locked> --baseline-sha <locked>',locked_args)
strategy=strategy.replace('# Phase3-2c-A1 실행 전략 v2 — 고정 외부 판정의 필수 호출','### 6.1 실행 전략 전문 — Sol 정본')
# Preserve section hierarchy when embedding the complete normative strategy.
strategy='\n'.join('###'+line[2:] if line.startswith('## ') else line for line in strategy.splitlines())
body=f'''# HANDOFF — Phase3-2c-A1 실행 전략 v2 구현

- Task: 검증 owner가 실제 관측·정리 완료 증거를 고정 외부 판정기에 제출한 뒤에만 성공하도록 A1 실행 경로를 교체한다.
- Action: IMPLEMENT
- From: Sol(xhigh, Codex) — orchestrator
- To: Gemini — implementation coder
- Time: {label}
- 회신: 필요
- Repository: `{REPO}`
- Branch: main
- Baseline commit: `{source['head']}`
- Expected initial status: 아래 기존12경로 정확 일치. clean 전환/기존 변경 제거 금지.
- Validation target: 새 A1 baseline `{NEW/'baseline.json'}` — {baseline_meta['bytes']}bytes, SHA-256 `{baseline_meta['sha256']}`.

```text
{status}
```

# 회신 요청

**누가**: Gemini. **어디에**: 맨 아래 단독 `## 회신`. **언제**: 착수 게이트 충돌이면 수정 없이 BLOCKED; 구현/필수검증 후 IMPLEMENTED 또는 FAILED. 회신 없으면 Sol 독립검수와 다음 단계가 대기한다. 본문 불변, 사용자가 수동 중계한다. 다른 AI CLI 호출0.

## 1. 목표

A1의 실제 core9와 보호회귀2가 정확한 원 증거·오류·자원 종료를 충족하고 고정 외부 판정 프로세스가 수용한 경우에만 owner가 최종 PASS/RC0을 발행한다.

## 2. 비목표와 단계 경계

정상8 화면body/로그인/partial/retry 복구는 A2 별도 패킷이다. 전체87ID/화면수용 B, 제품 UI/model/도메인/API/DB/계산/의존성 변경, 커밋/push/배포는 허용0. A1 성공은 전체A/3-2 수용이 아니다. 원래 v1 계약과 A-N01~20의 모든 남은 하위 의무는 보존한다.

## 3. 현재 상태와 검수 근거

사용자의 재설계 진행·중단 복구 승인을 반영한다. 이전 3-2c-A 회신은 FAILED/A_NOT_ACCEPTED로 종결됐다. 무변조core9/회귀2는 통과했으나 실제6fault중5허위PASS, normal8 로그인회귀/partial없음이 확인됐다. 원래 외부 계약은 변조를 거절했지만 owner 성공 경로가 그 판정기를 실행하지 않았다. 이번 IMPLEMENT는 worker 관측→정리→sealed candidate→고정 외부 gate의 필수 실제 실행으로 바꾸는 전략 교체다. R32C-06/기존2회CORRECT소진·V32F/A32F 이력 유지, CORRECT3/A-CORRECT1/회수초기화 금지.

이전 종결본 `Log/20261001_224338_3-2c-A-Sol-FAILED_독립검수종결본.md`. 새 패킷 전 수신원문은 `{Path(init['closedHandoffArchive']).relative_to(ROOT).as_posix()}`에 {init['closedHandoffBytes']}bytes/SHA `{init['closedHandoffSha256']}` 그대로 보존·검증했다. 이전 구현·시험 이력은 이번 A1 런타임 성공 증거로 재사용하지 않는다.

실제 호출점: owner `access-history.mjs`의 현재 최상위 CLI, run/temp 생성, server/worker dispatch, teardown/finalize; shared `loadContract`, `performWorkerIpcHandshake`, `runContractCore`, direct-entry. 보호 `scripts/lib/ui-check.mjs`의 `checkServerHealth`, `waitForFontsReady`, `createUniqueRunDir`, `runScreenCheck`; `scripts/lib/find-chrome.mjs`의 `findChrome`; 실제 보호 runner `scripts/ui-checks/shell.mjs`, `scripts/ui-checks/home.mjs`. 기억에 따른 ui-common/shell-regression 같은 이름으로 대체하지 않는다.

| 이전 stable defect | 이번 처리와 잔여 |
|---|---|
{defects}

## 4. 수정 경계

### 4.1 닫힌 허용 목록 — 기존2파일만

| 제품 경로 | 요구사항 | 허용 변경 | 보호 |
|---|---|---|---|
| scripts/ui-checks/access-history.mjs | E2-01/02/03/06/07/08/09 | A1 owner/registry/dispatch/teardown/gate/publish hunk | 각30,000B 이하·제품파일 추가0 |
| scripts/ui-checks/access-history-shared.mjs | E2-03/04/05/06/09 | core/IPC/새collectCoreChecks/settleOwnedResources/import-safe entry hunk | frozen legacy helper구간/기존export 보존·각30,000B 이하 |

소스집합341/보호339. normal-case positive/negative 모듈, UI/CSS/model/tests/설정/락파일/지도, 모든 위 표 외 파일은 바이트 보호다. shared의 `CANONICAL_8_ACTIONS` 선언부터 `performWorkerIpcHandshake` 직전까지6,575B/SHA `502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1` 고정. 기존 `performLogin`의 #login-btn/legacy AssertionCollector 결함도 A2 대기 상태로 보존하며 A1은 호출하지 않는다. 신규 productfile/의존성0.

### 4.2 읽기 전용과 검증 출력 경계

`C:\\Projects\\Active\\ShiftMgmt_V3.4\\**` 읽기 전용. 제어 workspace의 TODO/AGENTS/PROTOCOL/CLAUDE/GEMINI/.ai/기존Log와 모든 contract/checker/probe는 Gemini 수정 금지다. 허용 제어 변경은 이 HANDOFF 맨 아래 회신뿐이다. 실행은 신규 소유 ignored `artifacts/captures/phase3/**/run-*` 증거, 빌드의 ignored dist, 소유 os.tmpdir direct-child `shiftmgmt-gemini-32v-*`만 쓴다. 과거run/외래temp/profile/운영DB 삭제/변조 금지. 불확실한 close의 자기temp는 보존·정확경로 보고한다.

### 4.3 초기 dirty12 파일 실측 — 모두 현재 기준

| 제품 경로 | bytes | 전체 SHA-256 | A1 경계 |
|---|---|---|---|
{source_table}

### 4.4 잠긴 제어 정본27개 + 새 baseline 자체

아래 전부 착수/완료 실측. baseline의 files에는 전체341개의 bytes/fullSHA, control에는27개의 bytes/fullSHA가 있다. baseline 자체는 위 머리말 SHA로 검문한다. 원래 v1의4파일은 변경0이며 새 baseline만 현재 승인된 계획을 고정한다.

| 절대 경로 | bytes | 전체 SHA-256 |
|---|---|---|
{control_table}

## 5. 요구사항

| ID | 입력/행동 | 기대와 오류/경계 동작 | 구현 위치 |
|---|---|---|---|
{requirements}

CORE9는 원래 계약 그대로다. actual은 모두 raw pointer에 연결한다. caller expected/tolerance/pass/ID를 받지 않는다.

| ID | pointer | op | 고정 expected 또는 실제 관측 검문 |
|---|---|---|---|
{core_rules}

## 6. Sol의 코드 전략 — 순서와 schema를 그대로 구현

{strategy}

### 6.2 구현 순서/최소 변경

1. 두 allowed파일과 실제 보호 helper/runner/현재 source를 읽고 착수 gate를 통과한다. preflight/고정 paths/hashes/등록case부터 구현한다.
2. shared에 frozen구간 밖 `collectCoreChecks`와 `settleOwnedResources`, protocol2 ACK/RUN/direct-entry를 구현한다. core가 실제 같은 export를 사용한다.
3. owner에 생성 즉시 registry/단일deadline/firstError와 core/보호 runner dispatch를 연결한다. 관측·정리·logfinish/소유temp 검문을 끝낸다.
4. candidate sealed→잠긴 gate subprocess→actual RC/exit/close/logfinish/정확stdout→atomic final→단일 PASS로 연결한다. owner의 예전 길이/header/child0 판정을 성공 근거로 유지하지 않는다.
5. 명시된 실제 시험/보호 해시/전체diff/회신을 완료한다. 광역 재생성/포맷/로그인body 임의수정0. 설계 충돌은 제품 수정 없이 BLOCKED로 반환한다.

고정 Python 실행파일: `{sys.executable}`. gate 경로와 execution/baseline/gate SHA는 위 표의 실측값을 코드 상수로 고정한다. 환경/CLI/IPC로 대체 금지. 기존 API·도메인·권한 호출 계약은 유지한다.

## 7. 불변조건과 과거 함정

CLAUDE.md/07-invariants-and-pitfalls.md의 승인·계산 원자성, forward-only, 엑셀 인테이크, 근무일요율, SQLite36/API111의 현재 승인된 계약, 권한/내부ID, 운영데이터/원본 보호를 그대로 유지한다. 이번 허용은 검증기 A1 두 파일이며 업무 규칙 결정 권한은 없다. 한국어 UI/실제숫자/실제동작 원칙 유지, 인증/list/users route fixture·broad401 예외로 오류 숨김 금지. Chrome/서버는 소유 임시 데이터만 사용한다. core는 실제 로그인 DOM만 읽고 signin/credential본문열람0; 보호 runner는 기존 로그인/실제 클릭 그대로다. credential/cookie/nonce본문 출력0.

과거 header-only PNG, 동일ID9개, raw401무시, child0만 PASS, ACK뒤승인전실행, kill요청을 close로기록, 정리실패뒤PASS, 마지막쓰기실패은폐, 상수actual, 실패첫오류/partial삭제, parser시험을실제음성으로 보고하는 함정을 재현 시험으로 차단한다. fullSHA는 명령 실측만 쓰고 이력 삭제/초기화 금지다.

## 8. 착수 전 확인

수정 전에 머리말 repo/main/fullHEAD/dirty12, 위 정본 SHA/bytes, frozen6,575B, source341/허용2/보호339와 Python/설치Chrome/실제protectedhelper/compiled domain을 검문한다. 서로 다른 상태/파일누락/도구부재/설계충돌이면 BLOCKED로 반환한다. 아래 명령은 PowerShell에서 repository cwd로 실행한다.

```powershell
Set-Location -LiteralPath '{REPO}'
git rev-parse HEAD
git branch --show-current
git status --porcelain --untracked-files=all
{gate_cmd} --scope
```

scope RC0: files341/protected339/dirtyPaths12. 착수 changedAllowed=[], 구현후 changedAllowed는허용2내에서만. helper/frozen/control drift0. 머리말 source341은 Sol이 이 패킷 작성시 전수 실측했다.

## 9. 검증 계획 — 전부 실제 실행하고 원문 보존

### 9.1 정적·빌드·관련시험

```powershell
node --check scripts/ui-checks/access-history.mjs
node --check scripts/ui-checks/access-history-shared.mjs
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run validate:map
git diff --check
npm.cmd run build
npx.cmd vitest run src/web/screens/access-history-model.test.ts src/main/services/access-log-service.test.ts src/main/http/route-registry.test.ts --maxWorkers=1 --minWorkers=1
{gate_cmd} --scope
& '{sys.executable}' '{NEW/'gate-evidence.py'}' --execution-sha {execution_meta['sha256']} --self-test
```

각RC0. lint 기존5warnings 외 새warnings0, map90, 관련3파일11시험. build는코드/설정변경허용이아니다. selftest original2positive/19reject+10extra는 parser확인만. 전체133파일919시험은 이전검수이력이며 이번 실행을 주장하지 않는다. 실패/새회귀에는 원문출력/RC를 남겨FAILED로 회신한다.

### 9.2 무변조 실제 양성3 + 외부 final 검문

아래 PowerShell은 owner 단일stdout JSON의 실제 manifestPath를 받아 검문한다. 임의로 latest 폴더를 찾아 대체하지 않는다. 성공stdout은 전략의 exact JSON schema, stderr에는 raw 경고/오류를 구분해 보존한다. 각명령RC0, capture 실제core1/shell4/home1, checks9/3/3·artifacts7/10/7.

```powershell
$A1CoreOutput = @(node scripts/ui-checks/access-history.mjs --case=contract-core)
if ($LASTEXITCODE -ne 0) {{ throw 'A1 core owner failed' }}
if ($A1CoreOutput.Count -ne 1) {{ throw 'A1 core stdout is not one JSON line' }}
$A1CoreResult = $A1CoreOutput[0] | ConvertFrom-Json
if ($A1CoreResult.status -ne 'PASS') {{ throw 'A1 core did not PASS' }}
$A1CoreManifest = $A1CoreResult.manifestPath
{gate_cmd} --final $A1CoreManifest
if ($LASTEXITCODE -ne 0) {{ throw 'A1 core final adjudication failed' }}
$A1ShellOutput = @(node scripts/ui-checks/access-history.mjs --case=regression-shell)
if ($LASTEXITCODE -ne 0 -or $A1ShellOutput.Count -ne 1) {{ throw 'A1 shell owner failed' }}
$A1ShellManifest = ($A1ShellOutput[0] | ConvertFrom-Json).manifestPath
{gate_cmd} --final $A1ShellManifest
if ($LASTEXITCODE -ne 0) {{ throw 'A1 shell final adjudication failed' }}
$A1HomeOutput = @(node scripts/ui-checks/access-history.mjs --case=regression-home)
if ($LASTEXITCODE -ne 0 -or $A1HomeOutput.Count -ne 1) {{ throw 'A1 home owner failed' }}
$A1HomeManifest = ($A1HomeOutput[0] | ConvertFrom-Json).manifestPath
{gate_cmd} --final $A1HomeManifest
if ($LASTEXITCODE -ne 0) {{ throw 'A1 home final adjudication failed' }}
```

### 9.3 실제 필수 음성/IPC/정리 시험

```powershell
& '{sys.executable}' '{NEW/'runtime-probes.py'}' {locked_args}
node '{NEW/'ipc-probes.mjs'}'
node '{NEW/'component-probes.mjs'}' --core-manifest $A1CoreManifest {locked_args}
{gate_cmd} --scope
git status --porcelain --untracked-files=all
git diff --stat
git diff --check
```

각suite 자체RC0은 모든 지정 입력이 기대대로 거절된 경우만이다. 개별fault의 SUT는실제RC1/FAIL·PASS출력0이어야한다. runtime suite 실제양성3/별도gate--final 전제, deferred8 부작용0/BLOCKED_STAGE, malformed9 부작용0/RC1, corefault23+regressionfault1=24. IPC실제14case+port1 및 실제offlineChrome관측채널확인, component실제helper semantic6와 소유context/browser close예외2가필수다. --list/--self-test/직접작성JSON으로 대체 금지. 세도구중하나 실패/timeout이면시험미완료/FAILED 또는 환경BLOCKED, 같은군자동CORRECT 제출권한없다.

| 음성군 | 기대 증거 | 실패 판정 |
|---|---|---|
| CLI9/deferred8/점유port | RC1·정확stage차단·spawn/directory/file/fetch/Chrome0, 외래HTTP0 | RC1만 있고 사전부작용 존재 |
| 실제후보변조14 | 실제worker/server진행→자기candidate주입trigger→실제gate subprocess→해당결함거절문구→ownerFAIL | 다른오류RC1/gate미실행/주입미발생 |
| 추가수명/IPC/쓰기/spawn9+회귀증거0 1 | 실제trigger·구조화firstError/marker·RC1/PASS0, close미관측temp보존 | fakeclose/첫오류삭제/정리실패PASS |
| IPC14 | 등록된 실제child/consistent marker, validACK/noRUN5s종료(ACK후close≤6s), wrongRUN즉시실패, preRUNHTTP/Chrome/파일0 | ACK후실행/잘못된경로허용/시간초과/검수관측불가 |
| component6+close2 | core사용실제export·고정비교/불변snapshot/finite/type/추가arg거절·실제Chrome close·firstError동일 | test전용다른함수/상수증거/cleanup이primary덮음 |

runtime의 실제후보변조14는 PNG24/CRC2, ID중복/누락/추가3, callerexpected/constantactual2, rawconsole/page/requestfailed/http4, canonicaldrift1, worker/serverclosereceipt2다. 나머지 core9는 실제close관측억제, final쓰기거부, server spawnENOENT, serverlog쓰기실패, wrongACK/noACK/noRUN, gate spawnENOENT/gatelog쓰기실패. 마지막회귀1은 actualchildRC0/증거0다. 필수 주입결과/argv/PID/start/end/RC/stack/원raw·checks·PNG·로그·candidate·receipt·final을 모두 실제경로로 보고한다.

### 9.4 UI/런타임 합격 기준

URL 고정 `http://127.0.0.1:18741/`, viewport1440×900/설치Chrome/fonts완료/자기임시DB. core는실제로그인DOM/viewport/요청계수/event/compiledmap/fixture/PNG완전성·자원종료검문. signin/UI화면완료로 추론금지. shell은기존 admin-expanded/admin-collapsed/watch-stopped/operator 클릭과4캡처, home은기존 live-admin 실제동작과1캡처를원runner그대로수행한다. 원manifestChrome/health/errors7fields/원캡처와owner복사SHA동일/실제worker수명범위가필수. 콘솔/pageerror/requestfailed/badResponses 예상외0·primary/cleanup/evidence/unexpected0·allchildrenclosed/logfinish/portfree/tempabsent 후gate판정. 정상8/전체화면시각87ID/사용자직접확인은미실행으로남긴다.

## 10. 성공 조건과 회신 증거

E2-01~09의 구현위치와실제실행증거, source341/protect339/control27/frozen/dirty12 보존, 정적/관련11/빌드 PASS, 무변조양성3와실제필수runtime24/IPC14+port/component6+2가모두필요하다. firstError/cleanup/retainedpaths와미검증조건은숨기지않는다. 정상8/A2/B는잔여의무로기재한다. Gemini IMPLEMENTED는제출일뿐 Sol독립수용이아니다.

회신에는요구사항/이전stable결함별 cause→file:line→actual command→RC/결과/미해결을구분한다. 초기·완료 gitstatus/fullHEAD/전체diff, 두allowed최종bytes/fullSHA 및 기존dirty12전체SHA, control/frozen/scope출력, 실제각run의 ownercandidate/final/workerraw/checks/allPNG/log/gate receipt 해시·bytes를실측표로적는다. stdout/stderr 원문을파일로보존하고정확명령/cwd/PID/시각/RC와함께연결한다. 수신한요청본문해시도 exact standalone reply-boundary 이전 bytes로실측한다.

Sol이이번에실행한것은 제어문법/파서시험/파일형식시험/관측채널상태확인/소스범위전수실측뿐이다. 신규 A1 제품 구현/실제suite는 미실행이다. `.ai/reports/phase3-2c-a1-replan-20261001_232942/`의 control-validation-final.json/filesystem-parser-validation.json은 parser proof만이며 제출 runtime proof로대체할수없다.

## 11. 즉시 중단 조건

기준repo/HEAD/branch/dirty12/source/protected/control/frozen불일치, 새파일/의존성/허용밖수정/30k초과필요, Python/설치Chrome/compiledmodule부재, 요구/source/schema/시험충돌이면 제품추가변경없이 BLOCKED. 시험실패/새회귀는 FAILED로원문보존. supervisor timeout/childquiescence미확인은 UNVERIFIED/STOP·자기경로보존, 외래PID/profile/temp삭제로성공을만들지않는다. 운영데이터/비밀로그/원본수정/AI CLI/commit/push/deploy금지. 새로운설계선택/추가수정회수는Sol에반환한다.

---

'''
reply='''## 회신

Gemini가 아래 양식을 실제 값으로 채운다. 본문·정본·TODO·Log 수정 금지.

```text
판정: IMPLEMENTED | BLOCKED | FAILED
기준: 저장소 / main / 전체 baseline commit / 최종 commit(이번 commit 허용0)
초기 상태: gitstatus12 / source341 / protected339 / control27 / frozen / 도구 사전검문
변경 파일: 허용2 각각 요구사항 ID와 목적
범위 밖 변경: 0개 또는 정확한 경로와 사유
요구사항 대조: E2-01~09 -> 구현 file:line -> 실제command/RC -> 결과
이전 결함 대조: A32F-01~08 -> cause/changedfile/실제재현/결과 또는 A2 미해결
검증 증거: 정확한 command/cwd/PID/start/end/exitCode/개수/stdout/stderr 원문 경로
음성 테스트: runtime24/CLI9/deferred8/IPC14+port/component6+close2 각 기대/trigger/실제결과
UI 증거: 실제URL/시나리오/클릭/설치Chrome/fonts/캡처/core1+회귀4+1/console/원manifest
diff 요약: 추가/삭제줄 / 제품file 추가0 / dependency0 / 전체diff
전체 SHA-256: 실제명령으로 얻은 허용2/dirty12/control/frozen/candidate/final/worker/raw/PNG/log/receipt bytes와64자SHA
오류와 자원: firstError/cleanup/evidence/unexpected / 실제PID exit+close/logfinish/port/temp/retained경로
미해결/가정: 정상8/A2 원래 남은의무/B87 미검증 및 다른未검증조건
수용 경계: A1 prerequisite 제출이며 전체A/3-2 완료 또는 Sol ACCEPTED를 주장하지 않음
```
'''
packet=(body+reply).replace('\n','\r\n').encode('utf-8')
assert packet.count(b'\r\n## '+ '회신'.encode('utf-8')+b'\r\n')==1
assert (ROOT/'HANDOFF.md').read_bytes()==received
(ROOT/'HANDOFF.md').write_bytes(packet)
archive=ROOT/'Log'/f'{stamp}_3-2c-A1-Sol-IMPLEMENT_발송본.md'
with archive.open('xb') as out:out.write(packet)
assert archive.read_bytes()==packet
boundary=packet.index(b'## '+ '회신'.encode('utf-8')+b'\r\n')
dispatch={'time':now.isoformat(),'action':'IMPLEMENT','stageSlice':'A1','acceptance':'READY_TO_CODE_A1_ONLY_NOT_ACCEPTED',
    'path':str(ROOT/'HANDOFF.md'),'archive':str(archive),'bytes':len(packet),'sha256':sha(packet),
    'requestBodyBytes':boundary,'requestBodySha256':sha(packet[:boundary]),'replyBoundary':'exact standalone ## 회신',
    'baseline':{'path':str(NEW/'baseline.json'),**baseline_meta},'execution':{'path':str(NEW/'execution.json'),**execution_meta},
    'sourceFiles':341,'allowed':allowed,'protectedFiles':339,'controlFiles':27,
    'productEditsBySol':0,'priorControl':prior_controls,'controlPlanChanges':{str(p):meta(p) for p in [ROOT/'TODO.md',ROOT/'.ai/current-state.md']},
    'runtimeAcceptance':'NOT_RUN_IMPLEMENTATION_PENDING','retriesReset':False}
write_json(REPORT/'dispatch.json',dispatch)
print(json.dumps(dispatch,ensure_ascii=False,indent=2))
