# -*- coding: utf-8 -*-
"""Seal the resumed Sol strategy and issue a reviewable manual-relay packet.

Only orchestration/control paths are writable. Product source is read-only.
"""
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
from datetime import datetime, timezone
sys.dont_write_bytecode = True

REPORT = Path(__file__).resolve().parent
DOC = REPORT.parent.parent.parent
CTRL = DOC / '.ai/contracts/phase3-2c-a1-v4'
REPO = Path(r'C:\Projects\Active\ShiftMgmt_V4')
PYTHON = Path(r'C:\Users\pangyo\anaconda3\python.exe')
ALLOWED = ['scripts/ui-checks/access-history.mjs', 'scripts/ui-checks/access-history-shared.mjs']

def sha(data):
    return hashlib.sha256(data).hexdigest().upper()

def meta(path):
    data = path.read_bytes()
    return {'bytes': len(data), 'sha256': sha(data)}

def load(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def fresh(path, data):
    with path.open('xb') as stream:
        stream.write(data)

def dump(path, value):
    fresh(path, (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))

def snapshot():
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=REPO).decode('utf-8')
    names = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').rstrip('\0').split('\0')
    return {'repository': str(REPO), 'head': git('rev-parse', 'HEAD').strip(),
            'branch': git('branch', '--show-current').strip(),
            'status': git('status', '--porcelain', '--untracked-files=all').splitlines(),
            'files': {name: meta(REPO / name) for name in sorted(names)}}

def command(name, argv):
    env = dict(os.environ)
    env['PYTHONIOENCODING'] = 'utf-8'
    for key in list(env):
        if key.startswith(('SOL_', 'SHIFT_', 'SHIFTMGMT_')) or key in ('NODE_OPTIONS', 'NODE_DEBUG'):
            del env[key]
    out, err = REPORT / (name + '.stdout.txt'), REPORT / (name + '.stderr.txt')
    start = datetime.now(timezone.utc).isoformat()
    with out.open('xb') as stdout, err.open('xb') as stderr:
        child = subprocess.Popen(argv, cwd=REPO, env=env, stdout=stdout, stderr=stderr)
        rc = child.wait(timeout=30)
    record = {'argv': argv, 'cwd': str(REPO), 'pid': child.pid, 'start': start,
              'end': datetime.now(timezone.utc).isoformat(), 'rc': rc,
              'stdout': str(out), 'stderr': str(err),
              'stdoutSha256': sha(out.read_bytes()), 'stderrSha256': sha(err.read_bytes())}
    dump(REPORT / (name + '.command.json'), record)
    assert rc == 0, err.read_text(encoding='utf-8', errors='replace')
    return json.loads(out.read_text(encoding='utf-8'))

def main():
    assert not (CTRL / 'baseline.json').exists(), 'Already sealed; do not reissue'
    initial = load(REPORT / 'initial-evidence.json')
    before = snapshot()
    assert before == initial['sourceBefore']
    assert len(before['files']) == 341 and before['branch'] == 'main'
    assert before['head'] == '160940f9aaeb6696538447f83b44658073e382f0'
    for path, expected in initial['historicalControls'].items():
        assert meta(Path(path)) == expected, path
    received = (DOC / 'HANDOFF.md').read_bytes()
    archive = Path(initial['archive'])
    assert received == archive.read_bytes()
    assert len(received) == initial['receivedBytes'] and sha(received) == initial['receivedSha256']
    for name in ALLOWED:
        assert meta(REPORT / 'received-product' / Path(name).name) == before['files'][name]
    validation = load(REPORT / 'control-validation.json')
    assert validation['status'] == 'PASS' and validation['A1Accepted'] is False
    assert validation['observerSummary']['actualControlChecks'] == 37
    assert validation['observerSummary']['rejectedCorruptions'] == 9
    for name, expected in validation['controlHashes'].items():
        assert sha((CTRL / name).read_bytes()) == expected, name
    assert len(validation['plans']['ipc']['cases']) == 19
    assert len(validation['plans']['runtime']['faults']) == 44
    health_root = Path(validation['observerSummary']['artifact'])
    health = load(health_root / 'selfcheck-result.json')
    assert health['status'] == 'PASS' and all(r['acceptedControlCheck'] for r in health['records'])
    for name, expected in health['controlFiles'].items():
        assert sha((CTRL / name).read_bytes()) == expected
    red_output = (REPORT / '20261012_161552-actual-legacy-partial-coverage.stdout.txt').read_text(encoding='utf-8')
    red = json.loads(red_output.splitlines()[-1])
    assert red['status'] == 'EXPECTED_LEGACY_REGRESSIONS_DETECTED' and red['modes'] == 5
    red_root = Path(red['artifact'])
    assert red_root.parent.resolve() == Path(os.environ['TEMP']).resolve()
    assert red_root.name.startswith('shiftmgmt-sol-a1v4-partial-')
    red_evidence = load(red_root / 'suite-result.json')
    assert all(r['detectedRegression'] and r['physical'] and not r['timedOut'] for r in red_evidence['results'])
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 18741))
    # Prior Log entries must survive byte-for-byte; new archives are append-only.
    prior_logs = {str(p): meta(p) for p in (DOC / 'Log').iterdir() if p.is_file()}
    dump(REPORT / 'resume-evidence.json', {
        'time': datetime.now().astimezone().isoformat(), 'sourceUnchanged': True,
        'sourceFiles': 341, 'protectedFiles': 339, 'snapshotsRetained': ALLOWED,
        'receivedArchiveVerified': {'path': str(archive), **meta(archive)},
        'controlValidation': meta(REPORT / 'control-validation.json'),
        'redCoverage': {'summary': red, 'evidence': str(red_root / 'suite-result.json'),
                        **meta(red_root / 'suite-result.json')},
        'redCoverageScope': 'Control replays against exact v3 SUT; no v4 product acceptance. API calls absent are not a changed-screen experiment.',
        'routing': {'primary': 'frontier', 'reason': 'orchestration and verification redesign',
                    'internal': 'unavailable Terra -> balanced gpt-6-sol; read-only evidence review'},
        'policyTrace': ['P04 scope', 'P06 verification', 'P13 executable recurrence guards', 'P25 replan'],
        'McpSurfaceInspected': True, 'McpFailures': [], 'skillsUsed': [],
        'productEditsBySol': 0, 'aiCliInvocations': 0, 'counterReset': 0})

    now = datetime.now().astimezone()
    when = now.strftime('%Y-%m-%d %H:%M:%S KST')
    fresh(REPORT / 'TODO.before-seal.md', (DOC / 'TODO.md').read_bytes())
    fresh(REPORT / 'current-state.before-seal.md', (DOC / '.ai/current-state.md').read_bytes())
    todo = (DOC / 'TODO.md').read_bytes().decode('utf-8')
    newline = '\r\n' if '\r\n' in todo else '\n'
    latest = (f'> **최신 정본({when})**: 사용자 「하던 작업 이어서 진행해줘」에 따라 중단된 **3-2c-A1 v4 재설계 마무리 / IMPLEMENT READY_TO_CODE·Gemini 수동 중계 대기**. '
              '실제 종료 관측·첫 실패/partial·실측 raw·전체 사전 잠금·엄격 IPC/gate 기준 고정. '
              '제어 구문/Python3·Node6/parser35추가거절·fresh observer37/기록변조9거절 확인, 기존 v3 대상 partial/측정 누락5건 재현은 control proof. '
              '새 제품 v4 구현/수용은 미실행, **A1_NOT_ACCEPTED 유지**. 제품341/보호339/main/HEAD/status12 불변·Sol제품변경0. '
              '런타임44+사전잠금3/IPC19+port/typed25/partial5는 Gemini·Sol 실제 검수 의무이며 아직 PASS 아님. '
              'R32C-06 두CORRECT소진/초기화0·A2/B/전체3-2·배포대기 유지. 정본 `.ai/contracts/phase3-2c-a1-v4/`, 현재 `HANDOFF.md`, 근거 `.ai/reports/phase3-2c-a1-v4-replan-20261012_154142/`. 아래 이전 정본은 이력.')
    marker = '## 지금 위치와 다음 행동' + newline + newline
    assert todo.count(marker) == 1
    todo = todo.replace(marker, marker + latest + newline + newline, 1)
    todo = todo.replace('**Phase3-2c-A1 v3 독립검수 FAILED / A1_NOT_ACCEPTED·관측/종료/판정/partial 및 검수 조건 재설계 필요.**',
                        '**Phase3-2c-A1 v4 재설계·IMPLEMENT READY_TO_CODE / 수동 중계 대기. A1_NOT_ACCEPTED 유지.**', 1)
    todo = todo.replace('| **다음 행동** | Sol이 실제 관측/자원 로그/partial 전략과 빠진 gate·close·protocol·typed 조건을 재설계한다. 현재 HANDOFF는 종결 검수 결과이며 새 Gemini 구현 허가 없음. A1/A2/B 수용 대기. |',
                        '| **다음 행동** | 사용자가 현재 HANDOFF를 Gemini에 수동 전달→허용2파일 v4 구현·실제 검증 회신→Sol 독립검수. A1 미수용·A2/B는 계속 대기. |', 1)
    lines = todo.splitlines(keepends=True)
    changes = 0
    for index, line in enumerate(lines):
        if line.startswith('  - 🔄 3-2c. A1 v3 독립검수 FAILED'):
            lines[index] = '  - 🔄 3-2c. A1 v4 재설계 마무리·IMPLEMENT READY_TO_CODE / Gemini 수동 중계 대기. A1_NOT_ACCEPTED·원본CORE9/fullUI87·R32C-06 소진 이력 유지. A2/B/전체3-2수용·배포 대기. 현재 `HANDOFF.md`, 정본 `.ai/contracts/phase3-2c-a1-v4/`.' + newline
            changes += 1
        elif line.startswith('    - ⏸ 3-2c-A. A1 v3 제출 FAILED'):
            lines[index] = f'    - 🔄 3-2c-A. A1 v4 IMPLEMENT 준비 완료 ({when}). frontier Sol이 실측/실제close/부분증거/사전잠금/닫힌IPC·gate 및 검수 전략 고정. 제어37·변조9/기존v3 누락5 재현; 제품v4 구현·runtime44/lock3/IPC19/typed25/partial5 수용은 미실행. 허용2·보호339·제품341 불변·CORRECT2소진/초기화0. A2 정상8/남은A-N01~20/B87 대기. 근거 `.ai/reports/phase3-2c-a1-v4-replan-20261012_154142/`.' + newline
            changes += 1
    assert changes == 2
    (DOC / 'TODO.md').write_bytes(''.join(lines).encode('utf-8'))
    state = (DOC / '.ai/current-state.md').read_bytes().decode('utf-8')
    nl = '\r\n' if '\r\n' in state else '\n'
    old_status = 'Status: PHASE_3_2C_A1_V3_FAILED_REPLAN_REQUIRED_NOT_ACCEPTED'
    assert state.count(old_status) == 1
    section = f'''Status: PHASE_3_2C_A1_V4_READY_TO_CODE_USER_RELAY_PENDING_NOT_ACCEPTED

## Current task — resumed A1 v4 replan sealed, manual Gemini relay pending ({when})

- User 「하던 작업 이어서 진행해줘」 authorizes continuation of the closed-review replan. Recovered unfinished v4 controls and prior actual observer/parser evidence; final hashes/counts revalidated before sealing. Gemini remains product writer; Sol product edits/AI CLI/commit/push/deployment0.
- Original received HANDOFF16738bytes/SHA {initial['receivedSha256']} archived unchanged at {archive}; received/archive byte equality rechecked. All28 historical v1/v2/v3 controls and existing logs preserved. Exact two allowed product files now retained as byte snapshots to make the next hunk review reproducible.
- E4-01..08 close full preflight protected/control/frozen hashes, actual acquisition/lifecycle/log-finish+close, measured core/typed immutable collector, closed context/registration/RUN/ACK and gate schemas, complete atomic partial/fallback with first-error preservation. Allowlist2/max30000bytes/frozen6575bytes/protected339/source341/main/fullHEAD/status12 retained.
- Actual control proof: Python3/Node6 syntax, extra parser35 rejects, runtime parser, plan counts44/lock3/IPC19/typed25/partial5; fresh observer37/event corruption9 with current file SHA binding PASS. Actual legacy partial replay5 detects exact v3 deficiencies, real owned Chrome/DOM/close evidence, all retained external fixtures. This is control coverage only, no v4 product runtime acceptance.
- New IMPLEMENT packet replaces execution strategy; prior R32C-06 two CORRECTs exhausted/reset0. A1 remains NOT_ACCEPTED. Gemini implementation plus original runtime44/lock3, uninstrumented3+observed3/final6, IPC19+port, semantic6/typed25/top4/realChrome close2, partial5 and Sol source review still required. A2normal8/login/remainingA-N01..20/B87/full3-2/uservisual/release remain pending.
- Versioned .ai/contracts/phase3-2c-a1-v4/baseline.json locks this TODO/state and fixed controls. Current HANDOFF is the IMPLEMENT request; do not edit TODO/state/control/source validation target until the packet closes. The user relays it manually to Gemini, then Sol independently checks the response.
- Evidence .ai/reports/phase3-2c-a1-v4-replan-20261012_154142/control-validation.json, resume-evidence.json, dispatch.json and final-evidence.json. FrontierSol; Terra unavailable -> balancedgpt-6-sol read-only coherence evidence independently checked. MCP surface inspected/no failure. Policy trace P04/P06/P13/P25; no skill/Jev/AI invocation. V3.4 read-only.

Earlier entries below are historical and do not override this entry.
'''
    state = state.replace(old_status, section.replace('\n', nl), 1)
    (DOC / '.ai/current-state.md').write_bytes(state.encode('utf-8'))

    old_baseline = load(DOC / '.ai/contracts/phase3-2c-a1-v3/baseline.json')
    paths = {Path(p) for p in old_baseline['control']}
    paths.add(DOC / '.ai/contracts/phase3-2c-a1-v3/baseline.json')
    paths.update(p for p in CTRL.iterdir() if p.is_file())
    paths.update([archive, REPORT / 'control-validation.json', REPORT / 'resume-evidence.json',
                  REPORT / 'initial-evidence.json', REPORT / 'received-product/access-history.mjs',
                  REPORT / 'received-product/access-history-shared.mjs'])
    baseline = {**before, 'time': now.isoformat(), 'allowed': ALLOWED,
                'control': {str(p): meta(p) for p in sorted(paths, key=str)},
                'previousReview': str(DOC / '.ai/reports/phase3-2c-a1-v3-review-20261012_143959/final-evidence.json'),
                'stageSlice': 'A1', 'acceptance': 'A1 prerequisite only; A2/B remain unaccepted',
                'retryHistory': old_baseline['retryHistory']}
    dump(CTRL / 'baseline.json', baseline)
    exsha = sha((CTRL / 'execution.json').read_bytes())
    bsha = sha((CTRL / 'baseline.json').read_bytes())
    gate = [str(PYTHON), '-X', 'utf8', '-B', str(CTRL / 'gate-evidence.py'),
            '--execution-sha', exsha, '--baseline-sha', bsha]
    scope = command('sealed-scope-before-dispatch', gate + ['--scope'])
    assert scope['status'] == 'PASS'
    control = load(CTRL / 'execution.json')
    expected_status = '\n'.join(before['status'])
    hashes = [CTRL / 'execution.json', CTRL / 'baseline.json', CTRL / 'gate-evidence.py',
              CTRL / 'frozen-shared.json', DOC / '.ai/contracts/phase3-2c-v1/contract.json',
              DOC / '.ai/contracts/phase3-2c-v1/verify-evidence.py']
    hash_table = '\n'.join(f"| `{p}` | {meta(p)['bytes']} | `{meta(p)['sha256']}` |" for p in hashes)
    allowed_table = '\n'.join(f"| `{name}` | {before['files'][name]['bytes']} | `{before['files'][name]['sha256']}` |" for name in ALLOWED)
    strategy = (CTRL / 'STRATEGY.md').read_text(encoding='utf-8')
    assert 'IPC19=' in strategy and control['privateIpcCasesRequired'] == 19
    request = f'''# HANDOFF — 3-2c A1 v4 실측·종료·부분 증거 실행 전략 구현

- Task: A1 검증기가 실제 관측·실제 종료·확보 증거·고정 외부 판정으로만 성공을 게시하도록 v4 전략 구현
- Action: IMPLEMENT
- From: Sol(xhigh, Codex) — orchestrator
- To: Gemini — implementation coder
- Time: {when}
- 회신: 필요
- Repository: {REPO}
- Branch: main
- Baseline commit: {before['head']}
- Expected initial status: 아래 정확한12경로와 일치, source341/허용2/보호339
- 현재 수용: **A1_NOT_ACCEPTED**. IMPLEMENTED는 제출이며 수용은 Sol 독립검수 뒤에만 결정.
- 사용자 승인: 「하던 작업 이어서 진행해줘」 — 중단된 Sol 재설계의 후속 실행. 제품 작성자는 Gemini로 유지.

# 회신 요청

누가: Gemini. 어디: 맨 아래 보이는 `## 회신`. 언제: 착수 게이트 충돌 시 제품 수정 없이 BLOCKED; 그 외 구현·모든 필수 검증 후 회신. 회신이 없으면 Sol 독립검수와 A2/B 진행이 멈춘다. 다른 AI CLI를 호출하지 않는다. 이 본문을 바꾸지 않는다.

## 1. 목표 / 2. 비목표

목표: CORE9와 기존 shell/home 회귀를 통과하더라도 잘못된 측정·종료 미관측·증거 소실·메시지 변조에는 성공을 게시하지 않는 A1 실행기를 구현한다.

비목표: A2 정상8/login/남은원본 A-N01~20, B전체UI87, 활동이력 UI/모델/API/계산/DB, 새 제품파일/의존성/설정, commit/push/배포. 원본 v1 계약을 완화하지 않는다. 기존 R32C-06 두 CORRECT 소진·초기화0을 유지하며 CORRECT3으로 표시하지 않는다.

## 3. 현재 상태와 근거

TODO 3-2c-A: 이전 v3 제출 FAILED/A1_NOT_ACCEPTED. 지정38fault·양성6 통과에도 추가 실제 outer gate/log.close 허위PASS2, raw7수용, protocol1 ACK, DOM 확보 후 partial 소실. 상수 관측/생성 전 created/사전 잠금 누락은 소스 근거였다. 독립 원문은 `{archive}`, 검수 `{DOC / '.ai/reports/phase3-2c-a1-v3-review-20261012_143959'}`.

Sol은 중단된 v4 제어 준비를 이어받아 실제 selfcheck37·event corruption9·parser35추가거절 및 Python3/Node6 구문을 재검증했다. 현재 정확한 v3 제품을 대상으로 실제 partial/측정 제어5건이 기존 결함을 감지하는 것도 확인했다(`{red_root}`). 이 결과는 **제어 도구 검증만**이며 새 제품 구현/실제v4 runtime44/IPC19/partial5 수용 증거는 아직 없다. 주입된 page API 값을 구현이 읽지 않는 시험은 실제 화면이 바뀌었다는 주장으로 쓰지 않는다.

초기 git status는 정렬·정리하지 말고 원문 그대로 대조:

```text
{expected_status}
```

초기 허용2 실제 bytes/SHA (수정 전 일치, 수정 후 변경 허용):

| 파일 | bytes | SHA-256 |
|---|---:|---|
{allowed_table}

이번 고정 제어 값(실제 bytes에서 계산):

| 경로 | bytes | SHA-256 |
|---|---:|---|
{hash_table}

## 4. 수정 경계

허용 제품 파일은 `{ALLOWED[0]}`(owner: E4-01/02/05/06/07) 및 `{ALLOWED[1]}`(shared: E4-03/04/05/07) 둘뿐이다. 각각 30,000bytes 이하. 기존 두 파일의 대상 함수·분기에만 필요한 hunk를 적용한다. 광역 포맷·전체 재생성·기타 제품파일 생성 금지.

보호: baseline.files 중 위2 제외339 전부, shared frozen fragment6575bytes/SHA `502F44C39A12311B81F5661C00B6CB448AFCD6201399774D24909ADD0F6A7EB1`, v1/v2/v3/v4 정본·검수 도구, TODO/AGENTS/PROTOCOL/CLAUDE/GEMINI/.ai/Log. `C:\\Projects\\Active\\ShiftMgmt_V3.4`는 읽기 전용. Gemini는 HANDOFF의 최종 `## 회신`만 작성할 수 있다. 실행 산출물은 새 own run/분리 temp와 검수 suite artifact만 허용하며 기존 산출물/foreign PID/Chrome profile/운영DB를 정리하지 않는다.

shared의 EXECUTION_PATH/SHA는 위 v4 execution 경로/hash로, owner의 BASELINE_PATH/SHA 및 GATE_PATH/SHA는 위 v4 경로/hash로 교체한다. PYTHON_PATH는 `{PYTHON}`. 원본 CONTRACT_PATH/SHA와 v1 checker는 그대로다. 경로/env override/다른 gate 사용 금지.

## 5. 요구사항 / 6. Sol 코드 전략

아래는 잠근 STRATEGY의 본문이다. E4-01..08을 모두 구현하며 A1V3-01..07/T01 대조와 위치를 회신한다.

{strategy}

## 7. 불변조건과 과거 함정

승인·계산 원자성, forward-only, 근무일 기준 요율, DB36구조, 엑셀 인테이크, UNIQUE 중복 방지, 조→sort_order→사번 순서, 내부 식별자, 비Pool·비BP 사번 신원 게이트를 건드리지 않는다. 미측정 수치/동작 없는 UI 금지. 화면·계산 이관 규칙을 그대로 보존한다. 운영 PC 패치는 그 턴 사용자 명시 승인·판 번호 대조·백업이 필요한 별도 작업이다.

실제 닫힘과 SUT의 close 관측은 구분한다. 자가보고 true/현재시각/Math.max는 종료 증거가 아니다. fixed gate rc0만으로 PASS를 만들지 않는다. 첫 실패를 cleanup/write 오류로 덮지 않는다. checker/selfcheck/list를 SUT 런타임 합격으로 보고하지 않는다. CORE9 성공은 전체3-2 완료가 아니다.

## 8. 착수 전 확인

저장소/main/fullHEAD/초기 status12/초기2파일 SHA/보호339/frozen/정본 hash와 요구사항을 대조한다. 아래 scope 명령이 rc0이어야 한다. 모순·경로/범위/환경 불일치면 제품 수정 없이 BLOCKED. 중간에 TODO/state/control을 바꿔 scope를 통과시키지 않는다.

## 9. 검증 계획 — 순서대로 실제 실행

모든 명령의 cwd는 `{REPO}`. PowerShell 초기 변수(그대로 사용):

```powershell
Set-Location -LiteralPath '{REPO}'
$a1Python = '{PYTHON}'
$a1Control = '{CTRL}'
$a1ExecutionSha = '{exsha}'
$a1BaselineSha = '{bsha}'
```

1. `& $a1Python -X utf8 -B "$a1Control\\gate-evidence.py" --execution-sha $a1ExecutionSha --baseline-sha $a1BaselineSha --scope` → rc0, source341/allowed2/protected339/control{len(baseline['control'])} 잠금 불변.
2. `node --check scripts/ui-checks/access-history.mjs`, `node --check scripts/ui-checks/access-history-shared.mjs` → 각각rc0. `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run validate:map`, `git diff --check`, `npm.cmd run build` → 모두rc0, 기존lint5warnings/지도90과 구분해 보고.
3. `npx.cmd vitest run src/web/screens/access-history-model.test.ts src/main/services/access-log-service.test.ts src/main/http/route-registry.test.ts --maxWorkers=1 --minWorkers=1` → rc0, 3파일11시험. 전체919 재실행을 했다는 주장은 실제 실행했을 때만.
4. `& $a1Python -X utf8 -B "$a1Control\\gate-evidence.py" --execution-sha $a1ExecutionSha --self-test`, `& $a1Python -X utf8 -B "$a1Control\\runtime-probes.py" --execution-sha $a1ExecutionSha --baseline-sha $a1BaselineSha --self-test` → 각각rc0, gate35추가거절 및 runtime receipt parser 검사. 형식 검사이며 SUT 수용을 대체하지 않는다.
5. `& $a1Python -X utf8 -B "$a1Control\\runtime-probes.py" --execution-sha $a1ExecutionSha --baseline-sha $a1BaselineSha` → rc0. 이 driver가 새 observer-selfcheck37/event변조9/control SHA 검문을 직접 수행한다. 무계측양성3+관측양성3·독립final6·실제PNG12, CLI9/deferred8, runtime fault44, preflight lock3 전부 통과. 마지막stdout JSON의 artifact 경로를 `$a1RuntimeRoot`로 실제 기록하고 내부 selfcheck receipt도 보존. list/parser/canary만 실행한 것은 대체 증거가 아니다.
6. `node "$a1Control\\ipc-probes.mjs"` → rc0, 실제 offline Chrome 진단과 private19+occupiedport 전부PASS. protocol1/추가packet/context/registration은 ACK0, RUN추가키는 validACK 뒤 거절, HTTP/Chrome/workerwrite0.
7. runtime 양성 contract-core의 실제 PASS manifestPath를 `$a1CoreFinal`에 대입. `node "$a1Control\\component-probes.mjs" --core-manifest $a1CoreFinal --execution-sha $a1ExecutionSha --baseline-sha $a1BaselineSha` → rc0, semantic6/typed25/topinvalid4/실제 소유Chrome closethrow2. 입력도 고정gate로 먼저 검문한다.
8. `node "$a1Control\\partial-probes.mjs"` → rc0, actual v4 partial5. 캡처 실패/close 실패/primary partial publish 실패/viewport·origin API값 변조의 first stack·획득 raw·실제 ledger·atomic fallback 검문. `--legacy-control-check`는 이 실행의 대체가 아니며 v3 exact-source 제어확인 전용이다.
9. scope 명령을 다시 실행→rc0. 두 허용 파일 fullSHA/bytes, 전체diff, 각 source snapshot 대비diff, frozen/339/control hash, HEAD/status12 재확인. runtime timeout/observer불건강/fault미발생/다른오류code는 UNVERIFIED_STOP으로 남긴다.

UI/런타임은 실제 own 앱 `http://127.0.0.1:18741/`, Chrome 1440x900. core는 로그인 입력 id/password 각1/visible, CORE-01..09 정확한9ID·raw값·정상 캡처1. 기존 shell 관리자펼침/접힘/watch중단/operator4캡처 및 home-live-admin1캡처/원래동작 유지. owner가 부트스트랩하는 분리DB/temp만 사용하고 실제 운영 계정/DB/기존listener에 연결하지 않는다. 음성 close/finish 미관측에서는 own temp 보존이 필수이고 성공 출력 금지다. 캡처는 실행이 만든 실제 경로/bytes/fullSHA로 보고한다.

## 10. 성공 조건

E4-01..08 원인→수정위치→재현→실제결과 대조, 허용2/frozen/보호339/control 불변, static/build/관련11, runtime44/lock3/양성6/final6/12PNG, private19+port, typed25/top4/semantic6/ownedclose2, partial5, exact terminal/first failure 모두 증거를 남긴다. 실패 결과도 보존한다. IMPLEMENTED 이후 Sol의 소스/증거/실제UI 독립검수까지 A1_NOT_ACCEPTED 상태다. A2/B 착수 금지.

## 11. 즉시 중단 조건

기준/잠금 불일치, 원문 전략과 실제 소스 모순, 두파일/30k/frozen 경계 안에서 구현 불가, 새파일/의존성/API/DB/권한/계산 변경 필요, 시험 약화나 상수/fallback 성공으로만 통과, 실제 Chrome/검수 환경 없음이면 BLOCKED/FAILED로 회신한다. 외부 서비스 메시지/AI CLI/commit/push/배포는 수행하지 않는다.

---

## 회신

Gemini가 이 칸만 작성한다. 미실행 명령·미측정 hash·성공을 창작하지 않는다.

```text
판정: IMPLEMENTED | BLOCKED | FAILED 중 실제 상태
기준: 저장소 / main / 전체 baseline commit / 최종 commit 해당없음
초기 상태: git status 원문과 착수 gate/scope 결과
변경 파일: 허용2 각각 목적과 E4 ID
범위 밖 변경: 실제 개수/경로
요구사항 대조: E4-01..08 및 A1V3-01..07/T01별 원인 -> 파일:행/심볼 -> 재현 명령 -> 실제 결과
검증 증거: exact argv/cwd/PID/start/end/rc/timeout/stdout/stderr 및 suite artifact 경로
음성 시험: CLI9/deferred8/runtime44/lock3/private19+port/typed25/top4/semantic6/realclose2/partial5 각 결과
UI 증거: 양성3+관측3/final6/core1+shell4+home1씩12PNG, 실제 URL/화면/동작/console
첫 실패·partial: 원 stack과 raw/checks/resource/child/log/cleanup/fallback 결과
diff: 받은2원문 snapshot 대비 모든hunk, added/deletedlines, 생성제품파일0, 의존성변경0
fullSHA-256: 두 제품파일 및 실제 manifest/candidate/PNG/raw/로그/receipt 각각 bytes/fullSHA
정본·보호 확인: source341/protected339/control 잠금/frozen/HEAD/status 초기→최종 대조
미해결/가정: 없음 또는 검증하지 못한 조건 전부
```
'''
    assert request.count('\n## 회신\n') == 1
    assert all(key in request for key in ('E4-01', 'E4-08', bsha, exsha, 'runtime fault44', 'private19'))
    preview = REPORT / 'HANDOFF.ready.md'
    fresh(preview, request.encode('utf-8'))
    assert (DOC / 'HANDOFF.md').read_bytes() == received
    (DOC / 'HANDOFF.md').write_bytes(preview.read_bytes())
    sent = (DOC / 'HANDOFF.md').read_bytes()
    sent_archive = DOC / 'Log' / (now.strftime('%Y%m%d_%H%M%S') + '_3-2c-A1-v4-Sol-to-Gemini_IMPLEMENT_발송본.md')
    fresh(sent_archive, sent)
    assert sent == sent_archive.read_bytes()
    post_scope = command('sealed-scope-after-dispatch', gate + ['--scope'])
    assert post_scope['status'] == 'PASS'
    assert snapshot() == before
    assert all(meta(Path(p)) == m for p, m in initial['historicalControls'].items())
    assert all(meta(Path(p)) == m for p, m in prior_logs.items())
    body = sent.split(b'\n## ' + '회신'.encode('utf-8') + b'\n', 1)[0]
    dispatch = {'status': 'READY_TO_CODE_USER_RELAY_PENDING', 'time': when,
                'receivedArchive': str(archive), 'received': meta(archive),
                'sentArchive': str(sent_archive), 'handoff': meta(DOC / 'HANDOFF.md'),
                'requestBodyBytes': len(body), 'requestBodySha256': sha(body),
                'baseline': meta(CTRL / 'baseline.json'), 'execution': meta(CTRL / 'execution.json'),
                'gate': meta(CTRL / 'gate-evidence.py'), 'controlFiles': len(baseline['control']),
                'productEditsBySol': 0, 'A1Accepted': False, 'GeminiImplementationRun': False,
                'priorCorrectionsExhausted': 2, 'counterReset': 0}
    dump(REPORT / 'dispatch.json', dispatch)
    dump(REPORT / 'final-evidence.json', {**dispatch, 'sourceAfter': before,
         'historicalControlsUnchanged': len(initial['historicalControls']), 'existingLogsUnchanged': len(prior_logs),
         'controlValidation': validation, 'redCoverage': red, 'scopeBefore': scope, 'scopeAfter': post_scope,
         'limits': ['Control proof only; v4 product implementation/acceptance pending',
                    'Legacy measurement API interception does not prove changed actual screen',
                    'Actual observed owned closes, not a universal OS Chrome process inventory']})
    print(json.dumps({'status': dispatch['status'], 'controlFiles': dispatch['controlFiles'],
                      'sourceUnchanged': True, 'handoffBytes': len(sent), 'handoffSha256': sha(sent),
                      'A1Accepted': False}, ensure_ascii=False))

if __name__ == '__main__':
    main()
