# -*- coding: utf-8 -*-
"""Close the received validation target, then issue a redesigned verifier packet.

Control artifacts only. Product paths are read-only in this script.
"""
from pathlib import Path
from datetime import datetime, timezone, timedelta
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parents[2]
PRODUCT = Path('C:/Projects/Active/ShiftMgmt_V4')
REVIEW = ROOT / '.ai/reports/phase3-2-correct2-review-20261001_085101'
OLD = ROOT / '.ai/reports/phase3-2-correct2-20260930_230510/baseline.json'
RECEIPT = ROOT / 'Log/20261001_085101_3-2b-CORRECT2-Gemini_수신원본.md'
HEAD = '160940f9aaeb6696538447f83b44658073e382f0'
EDITABLE = ['scripts/ui-checks/access-history.mjs', 'docs/codebase-map.md']
NEW = [
    'scripts/ui-checks/access-history-shared.mjs',
    'scripts/ui-checks/access-history-positive.mjs',
    'scripts/ui-checks/access-history-negative.mjs',
]


def digest(data):
    return hashlib.sha256(data).hexdigest().upper()


def meta(path):
    b = Path(path).read_bytes()
    return {'bytes': len(b), 'sha256': digest(b)}


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def json_bytes(data):
    return (json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def write_new(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('xb') as f:
        f.write(data)
    assert path.read_bytes() == data


def git(*args):
    return subprocess.check_output(
        ['git', '-c', 'safe.directory=C:/Projects/Active/ShiftMgmt_V4', *args],
        cwd=PRODUCT,
    )


def main():
    now = datetime.now(timezone(timedelta(hours=9)))
    stamp = now.strftime('%Y%m%d_%H%M%S')
    date = now.strftime('%Y-%m-%d %H:%M:%S KST')
    plan_dir = ROOT / f'.ai/reports/phase3-2-verifier-replan-{stamp}'
    closeout = ROOT / f'Log/{stamp}_3-2b-CORRECT2-Sol-REPLAN_독립검증종결본.md'
    outgoing = ROOT / f'Log/{stamp}_3-2c-Sol-IMPLEMENT_검증기재설계_발송본.md'
    baseline_path = plan_dir / 'baseline.json'
    lesson_path = ROOT / '.ai/lessons/verifier-measurements-and-output-isolation.md'

    old = read_json(OLD)
    before = read_json(REVIEW / 'scope-before.json')
    received_bytes = (ROOT / 'HANDOFF.md').read_bytes()
    assert received_bytes == RECEIPT.read_bytes()
    assert len(received_bytes) == 42128
    assert digest(received_bytes) == '9A3A7400E2F45F8DF73CB7777FE6A10856EAEA411B769F7AA666893C851B8987'
    assert git('rev-parse', 'HEAD').decode().strip() == HEAD
    assert git('branch', '--show-current').decode().strip() == 'main'
    status = git('status', '--short', '--untracked-files=all').decode('utf-8').splitlines()
    assert status == before['status'], status
    product_metadata = {n: meta(PRODUCT / n) for n in old['productFiles']}
    assert len(product_metadata) == 338
    assert {n: m['sha256'] for n, m in product_metadata.items()} == before['productFiles']
    # Track all source files and the nine pre-existing sample files in the inventory.
    paths = set(p.decode('utf-8') for p in git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split(b'\0') if p)
    assert paths <= set(product_metadata), sorted(paths - set(product_metadata))
    for n in NEW:
        assert not (PRODUCT / n).exists(), n
    for n, m in old['canonical'].items():
        assert meta(ROOT / n) == m, n
    assert not lesson_path.exists()
    assert not plan_dir.exists()
    assert not (REVIEW / 'final-evidence.json').exists()

    static = read_json(REVIEW / 'static-results.json')
    probe = read_json(REVIEW / 'probe-results.json')
    bad = read_json(REVIEW / 'bad-measurements-assertion-evidence.json')
    bad_run = read_json(REVIEW / 'bad-measurements-runner-result.json')
    fault_run = read_json(REVIEW / 'injected-errors-runner-result.json')
    drift = read_json(REVIEW / 'historical-artifact-drift.json')
    assert all(x['exitCode'] == 0 for x in static)
    assert len(probe['groups']) == 9 and all(x['status'] == 'PASS' for x in probe['groups'])
    assert bad_run['exitCode'] == 0 and bad['manifest']['status'] == 'PASS'
    assert any(x['name'] == 'table-aria-label' and x['actual'] != x['expected'] and x['pass'] for x in bad['assertions'])
    assert fault_run['exitCode'] != 0

    assessment = f'''# Phase3-2b CORRECT2 독립 검수 종결 — REPLAN

- From: Sol — 유일한 오케스트레이터
- Time: {date}
- Action: REVIEW / REPLAN
- Verdict: CORRECT2 FAILED; 전체 수용 보류
- 회신: 불필요 — 이 검수는 종결하고 별도 IMPLEMENT 패킷으로 검증 전략을 재설계한다.
- Repository: `{PRODUCT}` / main / `{HEAD}`
- 수신 원본: `{RECEIPT}` — 42,128 bytes, SHA-256 `{digest(received_bytes)}`.

## 판정

제품 화면의 기존 결함 R32C-01~05는 이번 독립 Chrome 9개 그룹 범위에서 해소됐다. R32C-06 검증기 신뢰성은 미해결이다. 두 번째이자 마지막 수정 제출이므로 PROTOCOL.md §F/111에 따라 같은 수정 패킷 재발송을 종료하고 검증 전략·파일 경계를 재설계한다. CORRECT3를 발행하지 않는다. Phase3-2 전체 완료·수용·커밋·배포를 선언하지 않는다.

## 독립 검증 결과

| 게이트 | Sol 확인 결과 |
|---|---|
| 수신/범위 | 본문 유지, 변경2, 보호336/정본14 SHA·bytes 유지, 제출9파일의 크기·해시 일치 |
| 저장소 | main HEAD 동일, dirty9, 전체338파일이 검수 전후 동일; Sol 제품 변경0 |
| 정적/관련 시험 | typecheck/syntax/lint/map87/build/diff RC0; lint 기존5경고; 관련3파일11시험 실패·skip0 |
| 제품 런타임 | 실제 Chrome154.0.8037.58, 1440×900, fonts.ready; 9/9 그룹 PASS, 예상외 오류0 |
| 화면 실측 | 정상·긴행40px, 날짜132×34, 앞4열130/140/100/160, 상세전체값/title1216, hide-approved 적색, 표 접근성 이름 정상 |
| 검색/경합 | 새 검색 중 old행0/pending1, 이전 success/auth 차단, refresh1회, invalid중 loading0, usersretry 요청1+1/native busy, 실제 Tab·Space·Enter·click 요청0 |
| 실제 권한 | operator/planner/reviewer 메뉴0·자동 list/users0·실제 cookie API 거부/data없음 |
| 전체 시험 | 133파일919시험은 Gemini 자기 보고; Sol 이번 반려에서 전체 재실행하지 않음 |
| 오류 주입 | 예상외 console1/pageerror2를 이번 검증기는 RC1/FAIL로 거부; 이전 결함 일부 해소 |
| 실측 변조 | 날짜90×24/표 이름 SOL_BAD_ACCESSIBLE_NAME을 주입했으나 RC0/PASS; 실제 값과 판정 연결 실패 재현 |

## 남은 차단 사유 — R32C-06

1. runner159–162는 호출자가 준 pass를 믿는다. 229–243 등은 실측이 틀려도 true를 넘긴다. Sol의 소스 변경 없는 DOM 변조에서 잘못된 이름/날짜 크기와 pass:true가 동시에 기록됐다. 이 주입은 제품 결함 판정이 아니라 검증기 거부 능력 시험이다.
2. stale-response356–358는 b.keyword를 읽는다. 실제 bridge108–119는 인자 배열을 전송한다. b[0].keyword를 읽어야 하므로 slow 경로가 held되지 않고도 시나리오 PASS가 가능하다. held 시작/해제/handler 완료를 필수 실측해야 한다.
3. 공통 runScreenCheck는 import/호출되지 않는다. fixture에 없는 actionType/필드를 발명했고 8대표·순서·전체201·G2·필터/경합 등 필수 검사가 누락됐다. 오류 예외도401문자열/경로 전체 허용 형태다.
4. 부분 PASS가 정리 전에 기록되고 close 오류를 삼킨다. 서버 종료 대기 타이머는 종료 증명 없이 성공할 수 있다. worker/regression timeout과 원출력 증거가 부족하다. startup 직후 소유 listen 증명이 없고 worker 환경변수로 소유 검문을 우회한다. 이 항목은 소유권 증명 부재/잠재 경합이며, 다른 서버 접촉이 관찰됐다는 뜻은 아니다.
5. 회신의 list/stale/role/session 캡처 경로4개가 실제로 존재하지 않는다. 주변 실제 산출물의 밀리초가 다르며, 주장한 정확 경로의 증거로 대신 인정하지 않는다.

## Control 검수 산출물의 격리 문제

Gemini가 기존 Sol 오류 주입 helper를 실행하면서 이전 `.ai/reports/phase3-2-correct1-review-20260930_224512/injected-errors.json`이 owner의 빈 오류 배열로 덮였다. 기존 final-evidence.json에 독립 측정 console1/page2가 남아 있어 교차 확인했다. 관찰된 덮어쓰기 바이트는 별도 새 Log와 이번 report에 보존한다. 이전 객체는 저장된 독립 증거로 복원하되 원본 바이트 완전 복원으로 주장하지 않는다. 다음 주입기는 복사본과 자기 소유 ignored 산출물에서만 실행하도록 계약을 변경한다. 정본14·제품 보호336 불변과 이 별도 Control 출력 변경을 구분해 보고한다.

## 정리·한계

이번 소유 Chrome/서버/임시 폴더는 종료·삭제 완료했다. Playwright MCP는 기존 mcp-chrome 프로필 점유로 실패했고 격리된 실제 Chrome으로 검증했다. 타 세션 프로필/PID/역사 임시 폴더는 건드리지 않았다. 실제 세션 만료 전체 시험과 필수10case의 독립 최종수용 게이트는 아직 미완료다. 3-1e 직접 사용자 화면 확인도 별도 증거가 없다.

## 재계획

제품 화면 전체를 현재 바이트로 동결한다. 검증기를 owner 진입점/공통 실측·계약/정상 사례/예상 오류 사례로 나누고 공통 비교기가 pass를 계산하도록 바꾼다. 기존 runner+코드지도2파일, 신규검증모듈3파일만 허용한다. 동작·API·DB·인증 정책·제품 화면·기존 시험·공통 helper는 바꾸지 않는다. 실측 변조/예상외 오류/초기화·정리 실패 음성 시험을 필수 성공 조건에 포함한다. 요구 목표는 유지하고 실패한 단일 파일 패치 전략을 교체한다. 이 종결문을 기록한 뒤에만 TODO/current-state의 사실 상태를 갱신하고 새로운 baseline을 잠근다.

근거: `{REVIEW}`의 scope-before/static-results/probe-results/bad-measurements-assertion-evidence/injected-errors-runner-result/provided-case-evidence/historical-artifact-drift/server-cleanup/fault-cleanup JSON 및 PNG/원로그.
'''

    lesson = '''# 검증기는 실제 값으로 판정하고 출력 위치를 격리한다

- Date: 2026-10-01 · Phase3-2 CORRECT2 → verifier REPLAN
- Trigger: 실측·시나리오 실행 여부·정리 성공을 검사하는 검증기 작성/수용.
- Failure: 날짜90×24와 잘못된 table 이름을 측정하고도 hardcoded pass:true 때문에 RC0/PASS. 인자 배열을 객체로 읽어 held 요청이 실제 시작되지 않아도 stale 시험이 통과했다. 재사용한 fault preload가 이전 Control report를 덮었다.
- Root cause: 호출자가 성공 여부를 제공; 비교/필수 coverage/요청 생명주기가 강제되지 않음; 시험 helper의 출력 경로를 실행 전에 격리하지 않음.
- Rule: 비교 API가 expected와 실제 measurement를 받아 판정한다. caller pass 인자 금지. 누락/NaN/중복 coverage는 실패. 날짜/권한/held 전제조건은 동작 전에 assert한다. 요청은 실제 bridge 인자 배열 계약으로 디코딩하고 held start/release/complete를 모두 유한 시간에 확인한다.
- Verification: 크기/accessible name/행수·순서 변조, console/page/HTTP/requestfailed 및 초기화·정리 실패 주입은 RC 비0여야 한다. 원출력·첫 실패·부분 결과·최종 owner cleanup을 보존하고, owner 최종 PASS는 모든 종료·삭제 검증 뒤에만 기록한다.
- Output boundary: 재사용 preload는 자기 소유 ignored artifact에 복사하고 출력도 그 안으로 설정한다. `.ai` 원본 실행으로 이전 report를 덮지 않는다. 과거 report 손상 발견 시 관찰 바이트를 append-only Log에 보존하고 저장 증거 기반 복원임을 명시한다.
- Evidence: `.ai/reports/phase3-2-correct2-review-20261001_085101/bad-measurements-assertion-evidence.json`, `historical-artifact-drift.json`; 제품 파일 변화 없이 재현.
- Promotion: 새로운 Phase3-2c 패킷의 V32-01~06 및 필수 음성 검증에 포함. 제품 수정 권한·기존 역할은 유지.
'''

    todo_path = ROOT / 'TODO.md'
    todo_bytes = todo_path.read_bytes()
    todo_text = todo_bytes.decode('utf-8-sig')
    todo_lines = todo_text.splitlines(keepends=True)
    changes = 0
    replacements = {
        '| **다음 행동** |': '| **다음 행동** | CORRECT2 독립 검수 REPLAN. 화면 관련9그룹 PASS, 검증기 실측변조 falsePASS 잔여. Gemini에 새 HANDOFF를 중계해 검증기 owner/공통/정상/음성 모듈을 구현한 뒤 Sol 재검증. main160940f 유지, 전체 수용·커밋 보류. 3-1e 사용자 직접 화면 확인 별도 대기. |',
        '| 3. 화면 재구축 |': '| 3. 화면 재구축 | 1/10 | 🔄 3-0 ACCEPTED,3-1a/b/c/d 완료,3-1e 커밋 완료·직접확인 대기. 3-2b CORRECT2 검수 종결/수용 보류,3-2c 검증기 재설계 IMPLEMENT 준비 |',
        '  - 🔄 3-2b.': '  - 🔄 3-2b. Gemini CORRECT2 두 파일 수정본 독립 검수 종결 REPLAN. R32C-01~05는 Chrome9그룹 범위에서 해소,06검증기 실측변조 falsePASS 잔여. 같은 결함군2회 재제출 종료; 전체 완료·수용·커밋 보류.',
        '  - 🔄 3-2c.': '  - 🔄 3-2c. 검증기 전략 재설계. Sol static/map87/build/관련11시험·Chrome9/9 PASS, console/page 주입 RC1 거부 확인; 잘못된 날짜90×24/표 이름에도 RC0/PASS 재현. 기존runner+지도2/신규검증모듈3만 Gemini 구현, 제품 UI·보호336 동결. full919는 Gemini 자기보고, 필수10case/실측변조/정리 음성/전체시험 독립 수용은 다음 검수. 근거 .ai/reports/phase3-2-correct2-review-20261001_085101/final-evidence.json.',
    }
    counts = {k: 0 for k in replacements}
    for i, line in enumerate(todo_lines):
        for prefix, value in replacements.items():
            if line.startswith(prefix):
                eol = '\r\n' if line.endswith('\r\n') else '\n'
                todo_lines[i] = value + eol
                counts[prefix] += 1
                changes += 1
                break
    assert changes == 4 and all(v == 1 for v in counts.values()), counts
    todo_after = ''.join(todo_lines).encode('utf-8')
    if todo_bytes.startswith(b'\xef\xbb\xbf'):
        todo_after = b'\xef\xbb\xbf' + todo_after

    state_path = ROOT / '.ai/current-state.md'
    state_bytes = state_path.read_bytes()
    state_eol = '\r\n' if b'\r\n' in state_bytes else '\n'
    state_old = state_bytes.decode('utf-8-sig').replace('\r\n', '\n')
    assert state_old.startswith('# Current Project State\n\nStatus: PHASE_3_2B_CORRECT_2_USER_RELAY')
    state_history = state_old.split('\n', 4)[4]
    state_history = state_history.replace('## Current task — correction1 review closed, final consolidated retry ready', '## Historical task — correction1 review closed, final consolidated retry ready', 1)
    state_after = f'''# Current Project State

Status: PHASE_3_2C_VERIFIER_REPLAN_USER_RELAY

## Current task — CORRECT2 review closed / redesigned verifier IMPLEMENT ready ({date})

- User asked 「핸드오프 확인해」. Exact received reply `{RECEIPT.name}`,42128 bytes,{digest(received_bytes)} archived and verified. Sol product changes0; Gemini remains product writer/manual relay; no AI CLI.
- Verdict REPLAN, acceptance withheld. R32C-01~05 resolved within native9-group evidence; R32C-06 still blocks acceptance. Maximum two same-group correction submissions exhausted; old packet closed, no CORRECT3.
- Independent static/map87/build/focused3files11tests PASS; lint existing5 warnings. Actual Chrome154.0.8037.58/1440x900/fonts-ready9/9 PASS and unexpected product browser errors0. Full133files919 tests is Gemini self-report, no independent full rerun this rejection turn.
- Unexpected console1/page2 now RC1/FAIL. Synthetic date90x24/table accessible-name corruption still RC0/PASS. Runner also decodes bridge args array incorrectly and its stale case never holds the slow route. Shared helper/coverage/cleanup/ownership/claimed-capture evidence remain incomplete.
- During review: main {HEAD},9dirty paths,338file bytes/hashes unchanged; protected336/canonical14 verified before closing target. Separate historical Control fault output drift observed and preserved; previous report object reconstructed from embedded independent evidence, exact-original-byte claim unavailable.
- New locked scope: existing runner+map2, new shared/positive/negative verifier modules3; frozen product UI/all other336 existing files. New canonical15 includes verifier integrity/output isolation lesson. Goal/API/DB/auth/deps/common helpers unchanged. Packet is an IMPLEMENT strategy replacement, not another identical correction. Requirements V32-01~06 retain R32C-06 traceability.
- Evidence `{REVIEW}` / final-evidence.json; closeout `{closeout.name}`. New baseline `{baseline_path}`. TODO facts updated only after CORRECT2 validation closed.
- Own Chrome/server/temp stopped/removed. Playwright MCP failed due to an occupied existing profile; independent isolated installed Chrome used. No foreign profile/PID/historical temp touched. 3-1e user direct visual confirmation pending; no commit/push/deployment.
- Harness5.1/project roles4.0 retained; balanced fallback read-only reviewer evidence checked by Sol. JIT P04/P05/P06/P21/P26/P17/P08/P13/P25; Jev disabled.

Earlier entries below are historical and do not override this entry.

{state_history}'''.replace('\n', state_eol).encode('utf-8')

    # Prepare the complete baseline and packet before any target/control transition.
    canonical = dict(old['canonical'])
    canonical['TODO.md'] = {'bytes': len(todo_after), 'sha256': digest(todo_after)}
    canonical['.ai/current-state.md'] = {'bytes': len(state_after), 'sha256': digest(state_after)}
    lesson_bytes = lesson.encode('utf-8')
    canonical['.ai/lessons/verifier-measurements-and-output-isolation.md'] = {'bytes': len(lesson_bytes), 'sha256': digest(lesson_bytes)}
    baseline = {
        'time': date, 'repository': str(PRODUCT), 'branch': 'main', 'head': HEAD,
        'status': status, 'editableExisting': EDITABLE, 'allowedNewAbsent': NEW,
        'productFiles': {n: m['sha256'] for n, m in product_metadata.items()},
        'productMetadata': product_metadata,
        'protectedFiles': {n: m['sha256'] for n, m in product_metadata.items() if n not in EDITABLE},
        'controlRoot': str(ROOT), 'canonical': canonical,
        'received': {'path': str(RECEIPT), **meta(RECEIPT)},
        'previousCloseout': str(closeout), 'sourceChangesBySol': 0,
        'resolvedDefectsWithinProbe': ['R32C-01', 'R32C-02', 'R32C-03', 'R32C-04', 'R32C-05'],
        'remainingDefects': ['R32C-06'], 'previousCorrectionAttemptsExhausted': 2,
        'strategy': 'comparator-owned verdict / closed coverage / split cases / owner lifecycle',
        'expectedFinalProductFiles': 341, 'expectedFinalStatusPaths': 12,
    }
    baseline_bytes = json_bytes(baseline)
    initial_status = '\n'.join(status)
    editable_rows = '\n'.join(f'| `{n}` | {product_metadata[n]["bytes"]} | `{product_metadata[n]["sha256"]}` |' for n in EDITABLE)
    frozen_names = ['src/web/screens/access-history.ts', 'src/web/screens/access-history-model.ts', 'src/web/screens/access-history-model.test.ts', 'src/web/access-history.css', 'src/web/screens/shell.ts', 'src/web/index.html', 'scripts/copy-web-assets.mjs', 'scripts/lib/ui-check.mjs']
    frozen_rows = '\n'.join(f'| `{n}` | {product_metadata[n]["bytes"]} | `{product_metadata[n]["sha256"]}` |' for n in frozen_names)
    canonical_rows = '\n'.join(f'| `{n}` | {m["bytes"]} | `{m["sha256"]}` |' for n, m in canonical.items())
    # Original authoritative behavior/design contract, excluding stale scope/strategy.
    original = received_bytes.decode('utf-8-sig')
    source_lines = original.splitlines()
    first = next(i for i,l in enumerate(source_lines) if l.startswith('| R32-01 |'))
    last = next(i for i,l in enumerate(source_lines) if l.startswith('위 원 계약은 유지'))
    original_excerpt = '| ID | 입력/행동 | 기대 결과 |\n|---|---|---|\n' + '\n'.join(source_lines[first:last]).strip()

    packet = f'''# HANDOFF — Phase3-2c / 검증기 전략 재설계 IMPLEMENT

- Task: 활동 이력 화면의 실제 실측·요청·음성 동작·정리를 신뢰할 수 있게 검사하는 검증 구조 구현
- Action: IMPLEMENT
- From: Sol(frontier, 유일한 오케스트레이터)
- To: Gemini(외부 제품 구현 코더, 사용자 수동 중계)
- Time: {date}
- 회신: 필요
- Repository: `{PRODUCT}`
- Control root: `{ROOT}`
- Branch: main
- Baseline commit: `{HEAD}`
- Expected initial status: 아래9dirty 경로를 그대로 이어받는다.
- Previous decision: CORRECT2 FAILED / REPLAN. 같은 결함군2회 재제출 종료. CORRECT3가 아니다.
- 수신 원본: `{RECEIPT}` / 42128 bytes / SHA-256 `{digest(received_bytes)}`
- Sol 종결문: `{closeout}`
- 착수 baseline: `{baseline_path}` / {len(baseline_bytes)} bytes / SHA-256 `{digest(baseline_bytes)}`

## 회신 요청

Gemini는 착수 기준을 확인하고 닫힌5파일 안에서 아래 구조를 구현한다. 필수10case와 검증기 음성 시험을 실행하고 맨 아래 `## 회신`만 채운다. 본문·TODO·.ai·Log를 변경하거나 다른 AI CLI/commit/push를 실행하지 않는다. 구현 제출은 Sol 수용과 별개다.

## 1. 목표

잘못된 실제 값, 실행되지 않은 시나리오, 예상외 오류 또는 소유 자원 정리 실패가 반드시 RC 비0/FAIL이 되는 활동 이력 검증기를 만든다. 제품 활동 이력 화면은 현재 바이트로 동결한다. 검증 코드의 비교 책임·필수 coverage·요청 생명주기·owner 종료 판정을 구조적으로 강제한다.

## 2. 비목표

제품 UI/모델/CSS/셸/기존 테스트 변경, API/DB/권한·인증 정책/계산/의존성/공통 helper 변경은0. 다음 화면/새 기능/운영 패치/배포는 범위 밖이다. 실패한 단일 파일을 다시 땜질하는 전략 대신 기존 검증기를 아래 모듈 경계로 추출·교체한다. 이번 명시된 검증 구조 재작성 외 불필요한 포맷/리팩터링은 하지 않는다.

## 3. 현재 상태와 증거

- R32C-01~05: 독립 실제 Chrome9그룹 범위에서 해소. 기본/긴행40, date132×34, 열130/140/100/160, 표 이름/배지/검색 pending/키보드/중복/실제3권한 PASS.
- R32C-06: 실측 변조에서 날짜90×24와 잘못된 표 이름을 측정하고도 caller pass:true 때문에 RC0/PASS. stale-case는 실제 인자 배열을 b.keyword로 읽어 held 경로가 실행되지 않는다. coverage/공통 helper/정리·ownership/정확한 capture 경로도 미해결이다.
- console1/pageerror2 주입은 이제 RC1로 거부했다. 이 개선은 유지한다. full133파일919시험은 Gemini 자기 보고이며 Sol 이번 반려에서는 전체 재실행하지 않았다.
- Sol 검수 동안 제품338파일/main/status9 불변. 기존 정본14도 불변. 별도 과거 Control 주입 출력 덮어쓰기 발견·원문 보존·저장된 독립 객체 복원; 다음 preload는 반드시 자체 artifact 복사본으로 격리한다.
- 구조 변경 근거: PROTOCOL.md §F(동일 결함군2회 실패 후 재설계), P13/P25. 제품 목표는 그대로이며 검증 Change Contract만 갱신한다. 다음 제출이 실패해도 무조건 수정 회수를 리셋하지 않고 Sol이 원인·전략을 다시 평가한다.

```text
{initial_status}
```

## 4. 수정 경계

### 4.1 제품 수정/생성 허용 — 정확히5파일

| 경로 | 요구사항 | 허용 변경 | 제한 |
|---|---|---|---|
| `scripts/ui-checks/access-history.mjs` | V32-03/04/06 | 엄격 public CLI, 소유 server/temp와 private worker dispatch, bounded child, 최종 판정 | 현재 파일을 owner로 추출·교체; 제품 UI/공통 helper 수정0 |
| `scripts/ui-checks/access-history-shared.mjs` | V32-01/02/04/06 | 비교기, 고정 coverage 계약, 유효 fixture, bridge query/held 생명주기, raw evidence | 신규; caller pass 인자0, 조작별 실제 관측값 |
| `scripts/ui-checks/access-history-positive.mjs` | V32-02/03/05 | 정상6case, 실제 runScreenCheck 호출과 steps | 신규; common helper 동작/기대값 완화0 |
| `scripts/ui-checks/access-history-negative.mjs` | V32-01/03/05 | errors/session-expired의 정밀 예상 오류 드라이버 | 신규; blanket401/문자열 포함 예외0 |
| `docs/codebase-map.md` | V32-06 | 신규3모듈 경로·책임만 추가 | 기존87경로 유지→90; 이외 문서 개편0 |

각 검증 .mjs 파일은30,000bytes 이하. 현재 기존2파일 baseline:

| 경로 | bytes | SHA-256 |
|---|---:|---|
{editable_rows}

새3파일은 착수 시 없어야 한다. 기존338 중 허용2를 제외한336파일을 전부 보호한다. 종료 시341파일, 기존9dirty+신규3=12경로여야 한다. 삭제/rename/새 dependency/lockfile/config 변경0. node_modules/dist/browser/artifacts는 기존 명령의 ignored 생성 위치만 허용하며 소스 파일 집계에서 제외한다. 기존 양식샘플9개는 baseline338에 포함된 보호 파일이다.

### 4.2 보호 경계

V3.4 전체 읽기 전용. 제품 `src/**`, package*/build/config/기존 scripts/lib·ui-checks/기존 테스트는 위 allowlist 밖 변경 금지. Control `TODO.md/AGENTS.md/PROTOCOL.md/CLAUDE.md/GEMINI.md/.ai/**/Log/**`는 전부 읽기 전용. `HANDOFF.md`의 보이는 `## 회신`만 채운다. preload/시험 산출물은 제품 `artifacts/captures/phase3/` 아래 원자적으로 만든 자기 소유 ignored 실행 디렉터리에서만 생성·실행한다. Control의 Sol helper는 참고용으로 읽을 수 있지만 거기서 직접 실행해 이전 report를 덮지 않는다.

핵심 동결 파일(그 외336 보호 파일도 baseline 전수 대조):

| 경로 | bytes | SHA-256 |
|---|---:|---|
{frozen_rows}

## 5. 요구사항 — stable R32C-06의 구조적 해결

| ID | 기대 결과 | 실패 조건 | 구현 위치 |
|---|---|---|---|
| V32-01 | actual measurement를 공통 비교기가 판정; 변조·누락·중복은 FAIL | caller true, 없는/NaN 값, 누락 coverage를 PASS | shared/negative |
| V32-02 | 유효 도메인 fixture와 실제 인자 배열 query, held 시작·해제·완료가 모두 증명 | 발명 action/field, never-held stale PASS | shared/positive |
| V32-03 | 정상6case는 runScreenCheck 실제 호출; 예상 오류2case 별도 정밀 드라이버 | helper import만, 광역 오류 허용, 기존 helper 수정 | owner/positive/negative |
| V32-04 | 자기 소유 listen/PID/temp 증명 뒤 접속; 모든 child 유한시간/실제 종료·삭제 뒤 최종 판정 | env public bypass, foreign 접속/정리, timeout을 종료 성공으로 간주 | owner/shared |
| V32-05 | 아래10case 모든 동작을 실제 클릭/키보드/요청/실측으로 검사 | case 이름만 존재/조건문으로 중요 단계 건너뛰기 | positive/negative/owner |
| V32-06 | 정확 경로/원출력/첫 실패/정리/부분·최종 결과 보존, map90/보호검증 | 없거나 추측한 캡처, 실패 덮기, 부분 PASS를 최종으로 보고 | 전5파일 |

## 6. Sol 코드 전략 — 이 순서로 구현

### 6.1 재사용 정본과 호출점

읽기 전용 실제 source를 먼저 확인한다: `scripts/lib/ui-check.mjs`의 validateTargetUrl/checkServerHealth/waitForFontsReady/createUniqueRunDir/runScreenCheck, `scripts/lib/find-chrome.mjs`, `src/shared/domain/access-log.ts`의 AccessLogRecord/actionLabels, `src/shared/bridge/contracts.ts`의 AccessLogListQuery/BridgeResult/Auth/AccessLog/OperationUsers 계약, `src/web/bridge/app-bridge.ts:108–119`, current activity model/screen, `src/main/server.ts:404–410`, 기존 home/shell runner. JS fixture에 labels를 수동 복사할 때는 실제 compiled 도메인 labels와 전수 대조해 유효성을 증명한다.

### 6.2 shared: 판정 책임과 전제조건

- Node `assert`의 deepStrictEqual 등으로 `expectEqual(id, expected, actual)`이 실제 비교를 수행한다. 수치/box는 `expectNear(id, expected, actual, tolerance<=1px)`로 검사한다. **pass 인자를 받지 않는다.** 실제 판정과 실패 stack을 원자료에 저장한 뒤 예외를 던진다. expected/actual undefined·NaN·없는 DOM·기록되지 않은 측정은 fail. 스스로 계산한 상수 `true`를 actual로 대입하는 검사는 금지.
- 아래 CASE 표의 각 하위 동작마다 고정 assertion ID/필수집합을 먼저 정의한다. request body·count·DOM·metric·전제조건 각 실제값을 기록한다. 중복 ID/필수 ID 누락은 실패. 최종에 count만 검사하지 말고 집합 일치 확인; 여러 race는 별도 ID. 단일 성공 플래그로 축약하지 않는다.
- fixture는 실제 AccessLogRecord 필드 id/userId/loginId/displayName/role/actionType/actionLabel/routeKey/routeLabel/details/occurredAt만 사용한다. 대표8: performance-approve / performance-reapprove / performance-hide-approved / schedule-publish / sign-in / route-view / performance-reject / site-save. invented approval-approve/operatorId/operatorName/route 등 금지. 201개 ID는 고유, 서버응답 순서를 미리 고정해 화면 ID·내용·전체count와 비교한다.
- bridgePOST는 JSON **인자 배열**이다. `Array.isArray(body)`부터 assert하고 query는 `body[0]`; noargs는[]이다. malformed body를 any nonOK로 인증 거부로 인정하지 않는다. query는 readonly snapshot으로 dateFrom/dateTo/loginId/actionType/trimkeyword를 정확 대조.
- held helper는 started→release→handlerComplete promise를 각각 유한 timeout으로 assert한다. held없으면 fail; `if (heldRoute)`로 시험을 생략하지 않는다. route request/release/complete 횟수와 query를 저장하고 모든 handler 완료 뒤 unroute. 키워드 입력 순간시간과 release시간을 기록해250ms발화 전/새결과 뒤 경합을 구분한다.

### 6.3 owner: 생명주기와 최종 결과

1. public CLI는 정확한 단일 `--case=CASE`만 받는다.10case 외/빈/duplicate/extraflag/모든 URL positional 거부는 mkdir/temp/spawn/network 이전. URL은 fixed `http://127.0.0.1:18741/`; validateTargetUrl도 사용한다. 외부/localhost URL은 문자열 검사만 하고 접속하지 않는다.
2. os.tmpdir의 `shiftmgmt-gemini-32v-*`를 mkdtemp로 새로 만들고 realpath 경계와 생성 소유권을 기록. 기존 SHIFTMGMT_*와 SHIFT_INTERNAL_*를 지운 child env에 필요한 owned DATA_DIR/PORT/BOOTSTRAP만 설정. public env worker bypass를 제거한다. credentials/cookie/복구키는 메모리/비공개 IPC만 사용, 증거에는 키 이름/존재 여부만 저장.
3.18741 bind preflight는 기존 서버에 요청하지 않는다. close 이후 spawn의 경합은 **자기 child stdout listening 신호/PID/expected dataDir** 검문으로 닫는다. `src/main/server.ts:410`의 port18741+생성한 dataDir 신호와 child 생존을 확인하기 전 health/sign-in 금지. 가능하면 Get-NetTCPConnection의 local listen OwningProcess로 child PID도 확인; 실패/다른PID/EADDRINUSE는 foreign health/auth 요청0. child stdout을 수집할 때 비밀값은 쓰지 않는다.
4. 모든 spawn은 windowsHide:true; error/exit/close listener를 시작부터 등록. Node fork IPC private job을 권장: actual process.send/process.ppid와 owner PID·nonce·검증된 절대 경로·URL을 확인한 worker만 dispatch. 누구나 설정 가능한 env 또는 임의 bootstrap/rundir를 믿지 않는다. CLI옵션으로 검문 우회경로를 추가하지 않는다. worker 환경 자체도 ownerjob과 동일 소유 경계를 확인한다.
5. 정상/음성/기존회귀 child는 async spawn/fork로 stdout/stderr/RC를 개별 저장; spawnSync 무기한 대기 금지. worker 기본최대120초, 복합 race180초, 전체case240초. 시작/health/route wait15초, cleanup각10초 등 모든 wait는 유한. timeout은 fail이며 owner가 자기 자원만 정리. Chrome 소유 child의 close/disconnect 및 worker/helper cleanup 오류를 각각 기록한다.
6. 초기화 시작부터 최상위try/finally. 실행 오류와 정리 오류를 따로 보존한다. 자기 server child의 실제 exit/close 증명을 받은 뒤 자기 temp realpath가 허용 경계에 있는지 재확인하여 rm하고 exists=false를 검증. 타이머 해결을 serverStopped=true로 쓰지 않는다. cleanup오류를 `.catch(()=>{{}})`로 삼키지 않는다. 프로세스 exit는 finally완료 뒤, 원래 실패는 cleanup성공으로 덮지 않는다.
7. owner unique runDir는 createUniqueRunDir로 원자 생성. 최종 owner manifest 하나에 overall verdict를 종료·삭제 확인 뒤 기록한다. 실패도 first failure/action records/raw events/부분 screenshot/child원출력/정리 결과를 보존. write실패도 fail. stdout은 final JSON 한 번이며 child PASS는 원로그로 보존.

### 6.4 positive: 공통 driver 실제 호출

live-admin/list-fixture/empty-fixture/filters/stale-response/role-guard는 `runScreenCheck({{id,url,steps}})`로 실행한다. steps callback에 scenario logic/shared assertions을 연결한다. 공통 helper가 process.exit를 호출하는 실패는 별도 child 안에 격리하여 owner finally를 보장한다. common capture 반환 절대 경로를 등록하고 helper manifest/캡처를 owner와 링크한다. helper/기존회귀 PASS는 **브라우저 부분 결과**로만 인정하고 overall PASS와 구분한다; 원파일을 덮지 않는다. 소유 server/temp 종료 뒤 owneroverall을 결정한다.

role-guard의 의도된 direct API401/403은 별도 APIRequestContext로 실제 cookie를 보내 common page driver의 오류0 규칙을 유지한다. 페이지에는 정상 사용자 동작만 한다. direct API/body/errorCode/data없음은 별도 정밀 assert한다. 모든 자동 API 계측은 **각 로그인 전에** list와users 둘 다 설치한다.

### 6.5 negative: 예상 오류를 정확히 분류

errors/session-expired는 findChrome/validateTargetUrl/checkServerHealth/waitForFontsReady를 재사용하는 별도 driver다. console/pageerror/requestfailed/HTTP>=400 raw는 삭제·변경하지 않고 시간/단계/method/정확 channel path/status/request id를 함께 수집한다. 의도한 실패는 정확 시나리오·단계·횟수·응답 errorCode에만 매핑하고 그 외 모두 fail. `message.includes('401')` 또는 logs/users경로 모든401허용 금지. 지정된 network abort 한 요청만 expected이며 같은 경로의 다른 오류는 unexpected. 예상 오류 자체가 발생하지 않아도 fail.

session은 실제 admincookie를 별도 APIRequestContext로 전달하여 signOut으로 서버세션을 무효화한다. UI refresh의 실제401/AUTH_SESSION_REQUIRED를 계측하고 login전환1/activityDOM0를 검사한다. 무cookie 요청도 올바른 인자 배열로 보내 실제401/정확 errorCode/data0를 확인한다. samepage signOut을 별도 context/TTL만료로 보고하지 않는다.

### 6.6 통합/지도

기존 map87를 유지하며 new3모듈 경로·책임을 추가해90. 새 구조에 unused helper/import나 이전 hardcoded assertions를 남기지 않는다. 제품 영역에서 결함이 발견되면 frozen source를 수정하지 말고 근거와 FAILED/BLOCKED를 반환한다. 수용은 모든 게이트를 Sol이 독립 검증한 후 결정한다.

## 7. 제품 불변조건과 기존 계약 — 검증 기대값 유지

화면은 새로, 계산은 그대로. V3/이관로직/DB/승인 스냅샷은 불변. HTTP200의 BridgeFailure도 UI실패다. 권한은 실제 서버검사, fixture로 우회0. id/loginId로 식별하고200행은 표시 단위일 뿐 데이터 절단0. 원문·전체 title/XSS 실행0. 아래 원 요구사항과 승인 디자인 수치는 **검증 기대값**이다; 이번에 제품 코드를 고치라는 허용이 아니다.

{original_excerpt}

## 8. 착수 게이트 / 잠긴 정본

저장소/main/fullHEAD/status9/전체338과baselinebytes/hash부터 확인한다. editable2와new3부재, protected336/canonical15를 전수 bytes/SHA 대조한다. 아래 정본은 새 재계획에서 잠긴 값이다. 이전 CORRECT2의 TODO/state해시는 검수 종결 전 이력이고 이번 착수기준으로 사용하지 않는다.

| Control 상대 경로 | bytes | SHA-256 |
|---|---:|---|
{canonical_rows}

## 9. 검증 계획

### 9.1 정적·빌드·관련·전체 시험 — 제품 저장소

| 정확 명령 | 기대 |
|---|---|
| `npm run typecheck` | RC0 |
| `node --check scripts/ui-checks/access-history.mjs` | RC0 |
| `node --check scripts/ui-checks/access-history-shared.mjs` | RC0 |
| `node --check scripts/ui-checks/access-history-positive.mjs` | RC0 |
| `node --check scripts/ui-checks/access-history-negative.mjs` | RC0 |
| `npm run lint` | RC0; 신규오류/경고0; 기존5경고 공개 |
| `npm run validate:map` | RC0; 기존87유지+신규3=90 |
| `npm run build` | RC0; frozen CSS/indexfont/CSP 연결 보존 |
| `npx vitest run src/web/screens/access-history-model.test.ts src/main/services/access-log-service.test.ts src/main/http/route-registry.test.ts --maxWorkers=1 --minWorkers=1` | RC0; 기존3파일11시험, fail/skip0 |
| `npm test` | RC0; 기존133파일919시험 유지, fail/skip0; 실제 집계 |
| `git -c safe.directory=C:/Projects/Active/ShiftMgmt_V4 diff --check` | RC0; untracked8파일도 trailing whitespace/EOF별도 대조 |

### 9.2 실제 Chrome10case — 각 `node scripts/ui-checks/access-history.mjs --case=CASE`

각 case는 자기 fresh temp/server, 실제 설치 Chrome/1440×900/fonts.ready에서 별도 실행한다. fixture UI상태와 실제cookie 권한 시험을 구분한다. 요청별 phase/query/count와 측정/캡처/firstfail/cleanup으로 연결한다. 아래 항목을 shared 필수 assertion ID집합으로 잠그고 한 항목이라도 누락하면 fail.

| CASE | 필수 실제 동작·값 |
|---|---|
| live-admin | 실제admin signin→활동→real list/users/응답행count·최신순 대조→refresh1/nativependingdouble0→홈/재진입→logout. fixture0; 필요 audit는 기존 authenticated recordAccessLog로 시험임을 표시 |
| list-fixture | 유효8대표배지 모두 정본색/문구/12px600/radius/padding, table native role/name/thscope/5열/font/date132×34/normal·longrow40/열130·140·100·160. 고유201응답 ID/순서/전체N201→처음200→more201/남은0. 긴원문과title전체 일치/invalidtime안전표시/특수HTML XSS0; 변조시 실제 실패 |
| empty-fixture | 성공[]만G2, loading/error중G2없음. width600/radius8/padding48×24/gap16/title18px700/desc13/font 실측.5필터 계속 접근→과거기간 조회→reset로로컬월초/오늘/all/all/빈query1회 및debounce0 |
| filters | dateFrom/dateTo/loginId/actionType/trimkeyword 실제body정확. 연속keyword250ms latest1; keyword후refresh/date/select/reset각 timer중복0. 두날짜명시설정 역전/빈경계/달력불가능일은 실제DOM·모델결과를 각각 확인. invalid click/Space/Enter/formEnter 요청0, native.disabled=false/aria=true/actualTabfocus/outline2px. 유효heldrequest중 native disabled/double0; 검색focus/caret 보존 |
| errors | list HTTP200BridgeFailure와networkthrow각 alert/retry/G2위장0/문구XSS0. usersfail+listok분리/선택loginId유지/heldusersretry nativebusy/두click추가0/users1+logs1. invalid날짜중이전heldrelease loading0. oldfinally가새owner잠금해제0. 지정 abort만expected; 예상외event0 |
| stale-response | oldsuccess/olderror/oldAUTH 각각 query변경→250ms발화전release시 화면/권한불변. 새query성공뒤oldrelease불변; 별도oldfinally가newpending해제0. keyword→manualrefresh1회. 홈/placeholder/logoutdestroy 각각 oldrelease/activityDOM0/debounce0. currentAUTH콜백1회. 각 heldstarted/release/completed횟수·시간을 bounded assert; unroute는완료뒤 |
| role-guard | realoperator/planner/reviewer 각각로그인전계측 list/users자동0/menu0. 실제cookie direct두API AUTH_FORBIDDEN/data없음. realadmin 두API허용/메뉴정상. 기존admin saveOperationUser로격리계정생성; directSQL/인증fixture0 |
| session-expired | realadmincookie별도context signOut→UIrefresh→actual401/AUTH_SESSION_REQUIRED 정확count/phase→login1/activityDOM0. 별도무cookie 실제list 올바른body+401/errorCode/data0. expected401 정확method/path/channel/횟수/raw분류 기록 |
| regression-shell | 같은ownedenv/bootstrap/URL에서 `node scripts/ui-checks/shell.mjs http://127.0.0.1:18741/` childRC0; stdout/stderr/commonmanifest/ownercleanup별도 보존 |
| regression-home | 같은ownedenv/bootstrap/URL에서 `node scripts/ui-checks/home.mjs http://127.0.0.1:18741/ --case=live-admin` childRC0; 기존source/기대값수정0,원출력 보존 |

### 9.3 검증기 자체 음성 시험 — 자동 실패 능력 필수

시험 harness/preload는 제품 ignored `artifacts/captures/phase3/`의 원자적 자기 실행 디렉터리에 생성한다. public CLI에 testbypass를 만들지 않는다. 정확 node --import **file URI**와 명령/원출력/RC/주입관측/최종정리를 보고한다. 부모→privateworker 주입 전달을 확인하되 다른Control출력에 쓰지 않는다. 부정 조건이 실제 일어난 것을 측정하기 전 PASS/FAIL주장을 하지 않는다.

| ID | 조작 | 기대 |
|---|---|---|
| N32-01 | `node scripts/ui-checks/access-history.mjs --case=sol-unknown-case` 및 빈case/duplicatecase/추가flag/임의URL/localhostURL/외부URL 각7음성 | 모두RC비0, 설명/시나리오PASS0,temp·artifact·spawn·network0. resource operation계측근거 |
| N32-02 | listfixture date input90×24와table name SOL_BAD_ACCESSIBLE_NAME runtime변조 | actual실측불일치/해당ID FAIL,RC비0; 최종PASS0,제품source불변 |
| N32-03 | displayed행 삭제/순서변조 또는비교actual값누락; 필수assertion한개 생략·duplicateID | 각각RC비0, ID와 expected/actual/누락목록; 미실행을PASS금지 |
| N32-04 | 예상외 console.error / pageexception / HTTP500 / requestfailed를 정상case에 각각주입 | 실제raw각channel있음, 각각RC비0; expected401/abort예외로 흡수0 |
| N32-05 | owned startup실패/Chromelaunch실패/시나리오assert실패 제어주입 | 원오류+boundedchildexit+외부finally+실제소유temp정리,RC비0; foreign접속0 |
| N32-06 | 자기자원 cleanupclose/삭제실패 제어주입 | 정리실패가overallFAIL/RC비0, 원실패보존; 관측 전true금지. 시험제어가 복구된뒤자기잔여만정리하고추가결과기록 |
| N32-07 | case재실행·기존포트점유·public SHIFT_INTERNAL_WORKER/rundir env | 고유dir충돌0. 점유port는접속/인증/kill0으로실패; ownstub로그요청0. env로private worker 검문우회0,임의dir/server접근0 |

달력 불가능일은 native date input이 값을 빈값으로 정규화할 수 있다. 먼저 실제DOM값을 기록해 해당 브라우저의 정규화와 모델의 유효성검사 증거를 구분하고, 빈값을 불가능일로 주장하지 않는다. invalidrange UI잠금은 두 날짜를 명시하여 실제역전부터 assert한다. Playwright isDisabled만으로 native disabled를 판단하지 않는다.

### 9.4 증거와 종료 대조

전체341/dirty12/허용5/protected336/canonical15를 bytes/SHA로 대조. 기존9+신규3 총12현재 hash/bytes와기존trackeddiff+untracked전체diff를 제공한다. 각case/fault마다 실제존재하는PNG/owner-final.json/action-assertions/raw-events/childstdout-stderr/cleanup경로를 **생성된경로에서읽어** 보고한다. 시각milliseconds를추측하지않는다. 부분manifest를최종으로대체0; 최초실패자료를덮지않는다. capture실패/manifest쓰기실패도FAIL. 자기serverexit/PID/temp삭제후만tempCleaned:true. historicaltemp `shiftmgmt-sol-31d-2Kh5fr` 포함타세션자원건드리지않는다.

## 10. 성공 조건

- V32-01~06, 원R32-01~09, 필수10case 전동작과 N32-01~07에 실행·실측·원출력·종료·정리 증거가 있다.
- 비교기가 expected/actual로판정하고 callerpass0/누락coverage0/never-held0. 정상/음성모듈분리·공통runScreenCheck실제호출·owner최종판정이구현됐다.
- exact5변경/336보호/15정본/341파일/dirty12; 새의존성/제품UI/공통helper/기존시험변경0.
- map90/static/build/full919/focused11/회귀/음성 실패 능력 전부 기대값. 불충족이면 FAILED, 범위·환경모순은 BLOCKED.
- 전체Phase3-2수용·커밋·사용자확인·배포는Sol후속독립판정으로남는다.

## 11. 즉시 중단 조건

HEAD/status/baseline/hash모순,5파일외수정/새의존성/API·DB·auth정책·제품UI변경필요,30k모듈경계에필수검사불가,공통helper와음성driver계약충돌,실제Chrome/realcookie/ownedlisten증명불가면 임의확장없이BLOCKED. 실행실패는첫오류와정리증거를포함하여FAILED/BLOCKED로반환한다. 시험을약화하거나없는요구를발명해통과하지않는다.

## 회신

Gemini는 아래 항목을 실제 측정값으로 채운다. 자리표시자·예정명령을 실행 증거로 제출하지 않는다.

- 판정: IMPLEMENTED / BLOCKED / FAILED 중 실제 결과
- 기준: repository / branch / 전체 baseline commit / 최종 commit 없음
- 초기 상태: git status 원문,338/보호336/정본15/new3부재/preflight 결과
- 변경 파일: 정확5경로,각 V32 ID와 목적; 범위 밖 변경 정확경로 또는0
- 요구사항 대조: V32-01~06 및 R32C-06 원인→구조 변경→재현 명령→결과. R32C-01~05 제품 동결/회귀 근거
- 검증 증거: 정확 명령 / 시작·종료 시각 / RC / 실제 files·tests·warnings / stdout·stderr 실제 경로
- Chrome10case: 각 필수ID·기대/실제·request counts·held생명주기·전체coverage·raw/expected/unexpected·실측·캡처
- 음성 N32-01~07: 실제 조작/관측/기대/RC/첫오류/최종cleanup; source변경0
- diff: tracked+untracked전체원문,생성물/deps/temp/child/browser/PID/종료·삭제 결과
- SHA-256: 기존9+신규3파일 전체64자·bytes,baseline/정본15/보호336 대조, 실제산출물해시
- 미해결/가정: 실제 목록 또는 없음; 확인하지 않은 게이트는 UNVERIFIED
'''
    packet_bytes = packet.encode('utf-8')
    # Lint the fully constructed packet before changing any validation targets.
    assert packet.count('\n## 회신\n') == 1
    assert 'Action: IMPLEMENT' in packet and 'CORRECT3를' not in packet
    assert all(n in packet for n in EDITABLE + NEW)
    assert all(f'V32-0{i}' in packet for i in range(1,7))
    assert all(f'N32-0{i}' in packet for i in range(1,8))
    assert '{{' not in packet and '}}' not in packet
    assert len(baseline['protectedFiles']) == 336 and len(canonical) == 15
    assert 'R32-09' in original_excerpt and '132px' in original_excerpt

    final_evidence = {
        'time': date, 'verdict': 'REPLAN', 'acceptance': 'WITHHELD',
        'correctionAttempt': 2, 'sameGroupRetriesExhausted': True,
        'repository': str(PRODUCT), 'head': HEAD, 'status': status,
        'received': {'path': str(RECEIPT), **meta(RECEIPT)},
        'scopeBefore': str(REVIEW / 'scope-before.json'),
        'scopeAfter': {'productFiles': 338, 'changedBySol': [], 'productHashesIdentical': True, 'protected336Unchanged': True, 'canonical14UnchangedBeforeClose': True},
        'static': static, 'focusedTests': {'files': 3, 'tests': 11, 'fail': 0, 'skip': 0},
        'fullSuite': {'files': 133, 'tests': 919, 'source': 'Gemini self-report', 'independentRerunThisTurn': False},
        'nativeProbe': probe, 'syntheticBadMeasurements': bad,
        'syntheticBadMeasurementsRun': bad_run, 'syntheticUnexpectedErrorsRun': fault_run,
        'capturePathsAudit': read_json(REVIEW / 'provided-case-evidence.json'),
        'historicalArtifactDrift': drift, 'mcpFallback': read_json(REVIEW / 'mcp-fallback.json'),
        'cleanup': {'server': read_json(REVIEW / 'server-cleanup.json'), 'fault': read_json(REVIEW / 'fault-cleanup.json')},
        'resolvedDefectsWithinProbe': baseline['resolvedDefectsWithinProbe'], 'remainingDefects': ['R32C-06'],
        'closeout': str(closeout), 'nextImplementation': str(plan_dir),
        'limitations': ['Full suite not independently rerun this rejection turn', 'Complete mandatory10case and session-expiry acceptance pending', '3-1e user direct visual confirmation has no evidence'],
    }

    # Immutable received bytes were checked above. Archive the closeout and prior control
    # bytes before replacing HANDOFF and closing the old validation target.
    write_new(closeout, assessment.encode('utf-8'))
    write_new(ROOT / f'Log/{stamp}_3-2b-CORRECT2종결전_TODO원문.md', todo_bytes)
    write_new(ROOT / f'Log/{stamp}_3-2b-CORRECT2종결전_current-state원문.md', state_bytes)
    (ROOT / 'HANDOFF.md').write_bytes(assessment.encode('utf-8'))
    assert (ROOT / 'HANDOFF.md').read_bytes() == closeout.read_bytes()
    # The old validation target is now explicitly closed; factual plan updates are allowed.
    todo_path.write_bytes(todo_after)
    state_path.write_bytes(state_after)
    write_new(lesson_path, lesson_bytes)

    drift_file = ROOT / drift['file']
    drift_observed = drift_file.read_bytes()
    assert json.loads(drift_observed.decode('utf-8-sig')) == drift['currentObserved']
    drift_archive = ROOT / f'Log/{stamp}_3-2b_검수주입출력덮어쓰기_관찰원문.json'
    write_new(drift_archive, drift_observed)
    write_new(REVIEW / 'historical-injected-errors-observed.json', drift_observed)
    reconstructed = json_bytes(drift['previousEmbedded'])
    drift_file.write_bytes(reconstructed)
    final_evidence['historicalArtifactRestoration'] = {
        'observedArchive': str(drift_archive), 'observedMetadata': meta(drift_archive),
        'restoredFile': str(drift_file), 'restoredMetadata': meta(drift_file),
        'basis': 'previous review final-evidence.json embedded independent object',
        'exactOriginalByteReconstructionClaimed': False,
    }

    write_new(REVIEW / 'assessment.md', assessment.encode('utf-8'))
    write_new(REVIEW / 'final-evidence.json', json_bytes(final_evidence))
    write_new(baseline_path, baseline_bytes)
    for n, m in canonical.items():
        assert meta(ROOT / n) == m, n
    write_new(outgoing, packet_bytes)
    (ROOT / 'HANDOFF.md').write_bytes(packet_bytes)
    assert (ROOT / 'HANDOFF.md').read_bytes() == outgoing.read_bytes()
    assert {n: meta(PRODUCT / n) for n in product_metadata} == product_metadata
    assert git('status', '--short', '--untracked-files=all').decode('utf-8').splitlines() == status
    dispatch = {
        'time': date, 'action': 'IMPLEMENT', 'strategyReplan': True,
        'handoff': str(ROOT/'HANDOFF.md'), 'outgoing': str(outgoing), **meta(outgoing),
        'baseline': {'path': str(baseline_path), **meta(baseline_path)},
        'closeout': {'path': str(closeout), **meta(closeout)},
        'received': {'path': str(RECEIPT), **meta(RECEIPT)},
        'preflight': {'productFiles':338,'protectedFiles':336,'canonical':15,'initialStatusPaths':9,'newAbsent':NEW,'packetConstructedBeforeMutation':True,'sourceChangesBySol':0},
    }
    write_new(plan_dir/'dispatch.json', json_bytes(dispatch))
    pointer = {'time':date,'reviewDirectory':str(REVIEW),'evidence':str(REVIEW/'final-evidence.json'),'implementationDirectory':str(plan_dir),'verdict':'REPLAN','nextAction':'IMPLEMENT','dispatch':str(plan_dir/'dispatch.json')}
    (ROOT/'.ai/reports/phase3-2-latest-review.json').write_bytes(json_bytes(pointer))
    (ROOT/'.ai/reports/phase3-2-active-review.json').write_bytes(json_bytes({**pointer,'status':'CLOSED_REPLAN_READY_TO_RELAY'}))
    print(json.dumps({'verdict':'REPLAN','handoff':meta(outgoing),'baseline':meta(baseline_path),'dispatch':str(plan_dir/'dispatch.json'),'sourceChangesBySol':0,'productFiles':338,'protected':336,'canonical':15,'TODOlinesUpdated':changes},ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
