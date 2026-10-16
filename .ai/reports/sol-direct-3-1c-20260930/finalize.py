# -*- coding: utf-8 -*-
from pathlib import Path
from datetime import datetime
import hashlib
import json
import re
import subprocess
import difflib

CONTROL = Path(__file__).resolve().parents[3]
PRODUCT = Path('C:/Projects/Active/ShiftMgmt_V4')
INSTALL = Path('C:/Users/pangyo/AppData/Local/AI-Harness')
REPORT = Path(__file__).resolve().parent
now = datetime.now().astimezone()
stamp = now.strftime('%Y%m%d_%H%M%S')
time_text = now.strftime('%Y-%m-%d %H:%M:%S %Z')

def sha(data):
    return hashlib.sha256(data).hexdigest().upper()

def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def git(root, *args):
    result = subprocess.run(['git', '-c', 'safe.directory=' + root.as_posix(), '-C', str(root), *args], capture_output=True, encoding='utf-8', check=True)
    return result.stdout

def write_text(path, text):
    path.write_bytes(text.encode('utf-8'))

pending = (CONTROL / 'HANDOFF.md').read_bytes()
baseline = read_json(REPORT / 'baseline.json')
received_archive = Path(baseline['archive'])
assert pending == received_archive.read_bytes()
assert len(pending) == 42080 and sha(pending) == baseline['archiveSHA']
original = pending.decode('utf-8-sig').replace('\r\n', '\n')
acceptance = read_json(REPORT / 'product-acceptance.json')
harness = read_json(CONTROL / '.ai/reports/harness-v5.1-20260930/installed-update-evidence.json')
old_audit = read_json(CONTROL / '.ai/reports/verification-3-1c-correct1-20260930/scope-evidence.json')
final_runs = read_json(REPORT / 'ui-results-all-2026-09-30T05-42-08-742Z.json')
assert len(final_runs) == 26 and all(r['exitCode'] == 0 and r['tempCleaned'] for r in final_runs)

status_rows = git(PRODUCT, 'status', '--short', '--untracked-files=all').splitlines()
status_sha = sha('\n'.join(status_rows).encode('utf-8'))
assert len(status_rows) == 92 and status_sha == acceptance['statusSHA']
assert git(PRODUCT, 'rev-parse', 'HEAD').strip() == '2d97d9bb3dc649f8c40c0d1d0cfc9fdeae0df283'
allowed = {f['path'] for f in acceptance['changedFiles']}
block = re.search(r'## 12\..*?```text\n(.*?)```', original, re.S).group(1)
protected = []
for line in block.splitlines():
    status, expected = line.rsplit('\t', 1)
    path = status[3:]
    if path in allowed:
        continue
    p = PRODUCT / path
    actual = sha(p.read_bytes()) if p.is_file() else 'ABSENT'
    assert actual == expected, (path, expected, actual)
    protected.append({'path': path, 'sha256': actual})
assert len(protected) == 90
for f in acceptance['changedFiles']:
    data = (PRODUCT / f['path']).read_bytes()
    assert len(data) == f['bytes'] and sha(data) == f['sha256']
    backup = REPORT / (Path(f['path']).name + '.before')
    diff = ''.join(difflib.unified_diff(backup.read_text(encoding='utf-8-sig').splitlines(keepends=True), (PRODUCT / f['path']).read_text(encoding='utf-8-sig').splitlines(keepends=True), fromfile=f['path'] + '.before', tofile=f['path']))
    write_text(REPORT / (Path(f['path']).name + '.diff'), diff)

final_manifests = []
capture_count = 0
matrices = []
for run in final_runs:
    for m in run['manifests']:
        manifest_path = PRODUCT / m['path']
        actual = read_json(manifest_path)
        assert actual['status'] == 'PASS'
        assert all(not value for value in actual['errors'].values())
        assert actual['chrome']['version'] == '154.0.8037.58'
        for c in actual['captures']:
            assert (PRODUCT / c['path']).is_file()
        capture_count += len(actual['captures'])
        final_manifests.append({'label': run['label'], 'path': m['path'], 'status': actual['status'], 'sha256': sha(manifest_path.read_bytes()), 'captures': len(actual['captures'])})
        action = manifest_path.parent / 'action-assertions.json'
        if action.is_file():
            matrix = read_json(action)
            assert matrix['realSession'] and matrix['fixtureBoundary'] == 'HTTP responses'
            assert len(matrix['assertions']) == 14 and all(a['result'] == 'PASS' for a in matrix['assertions'])
            matrices.append({'path': action.relative_to(PRODUCT).as_posix(), **matrix})
assert capture_count == 40 and len(matrices) == 2

new_runs = []
for p in (PRODUCT / 'artifacts/captures/phase3').glob('*/run-20260930-*/manifest.json'):
    if p.parent.name[13:19] < '141701':
        continue
    data = read_json(p)
    new_runs.append({'path': p.relative_to(PRODUCT).as_posix(), 'status': data['status'], 'errors': data['errors']})
new_runs.sort(key=lambda m: m['path'].split('/')[-2])
assert len(new_runs) == 30 and sum(r['status'] == 'FAIL' for r in new_runs) == 1, [(r['path'],r['status']) for r in new_runs]

unchanged_controls = {}
control_block = original.split('## 13.', 1)[1].split('## 14.', 1)[0]
for path, expected in re.findall(r'\| `([^`]+)` \| `([A-F0-9]{64})` \|', control_block):
    if path in ('.ai/HARNESS.md', '.ai/harness.yaml', 'TODO.md', '.ai/current-state.md'):
        continue
    actual = sha((CONTROL / path).read_bytes())
    assert actual == expected, path
    unchanged_controls[path] = actual
assert len(unchanged_controls) == 5
assert git(INSTALL, 'rev-parse', 'HEAD').strip() == harness['targetHEAD']
assert git(INSTALL, 'status', '--short').splitlines() == ['?? plan.json']
assert sha((INSTALL / 'plan.json').read_bytes()) == harness['planSHA256']
assert (INSTALL / 'plan.json').stat().st_size == harness['planBytes']
backup_root = Path(harness['backupPath'])
policy_files = list((INSTALL / 'policies').glob('*.md'))
assert len(policy_files) == 26
for p in policy_files:
    assert p.read_bytes() == (backup_root / 'policies' / p.name).read_bytes()
assert harness['backupVerified'] and harness['backupFileCount'] == 121 and harness['checkExit'] == 0
yaml = (CONTROL / '.ai/harness.yaml').read_text(encoding='utf-8-sig')
assert 'version: "5.1"' in yaml and 'use_jit_skill_loading: true' in yaml and 'skills_dir: "skills"' in yaml
assert 'product_code_writer: "gemini"' in yaml and 'authority: "sol_xhigh"' in yaml and 'internal_agents_read_only: true' in yaml

closeout_name = f'Log/{stamp}_3-1c-Sol직접수정-ACCEPT_종결본.md'
lines = [
    '# HANDOFF — Phase 3-1c 직접 수정 수용 · AI-Harness 5.1 적용 완료',
    '',
    '- Action: ACCEPTED / CLOSED',
    '- From: Sol(xhigh, Codex)',
    '- To: 사용자 · 프로젝트 다음 세션',
    '- 회신: 불필요',
    f'- Time: {time_text}',
    '- Routing: frontier — 제품 수정의 최종 통합·완료 판정과 하네스 적용',
    '- Product repository: `C:\\Projects\\Active\\ShiftMgmt_V4`, main',
    '- Product HEAD: `2d97d9bb3dc649f8c40c0d1d0cfc9fdeae0df283` (커밋하지 않음)',
    '',
    '## 1. 사용자 지시와 판정',
    '',
    '사용자의 “너가 직접해 너무 오래걸린다”를 이번 Phase 3-1c의 두 파일 직접 수정 예외로 적용했다. 대기 중인 Gemini CORRECT2를 대체하여 Sol이 구현·검증을 마쳤다. 정상 제품 수정 주체는 이후에도 Gemini이며, Sol/Gemini/Luna/Terra의 운영 역할은 유지한다.',
    '',
    '**Phase 3-1c ACCEPTED. 승인된 순서에 따라 제품 수용 → 설치본 전체 백업 → v5.1.0 고정 커밋 적용 → 프로젝트 연결 갱신까지 완료했다.** 전체 Phase 3-1은 3-1d/e가 남아 있다.',
    '',
    '이전 HANDOFF는 교체 전에 원문 바이트로 보존했다:',
    f'- `{received_archive.relative_to(CONTROL).as_posix()}`',
    f'- {len(pending):,} bytes / SHA-256 `{sha(pending)}`',
    '',
    '## 2. 닫힌 수정 범위와 요구사항',
    '',
    '| 요구사항 | 결과와 근거 |',
    '|---|---|',
    '| R31C-01 직원 조회 실패 | 준비 비율로 변환하지 않고 오류 표시. employees-error 최종 Chrome PASS |',
    '| R31C-02 지사 조회 실패 | 정상 완료 비율로 변환하지 않고 오류 표시. sites-error 최종 Chrome PASS |',
    '| R31C-03 홈 오류/로딩 | sync/recovery/watch 실패에서 H4 금지. refresh 호출 즉시 H5/skeleton 및 aria-busy, 기존 H4 제거. 성공 완료 뒤에만 H4 복원 |',
    '| R31C-04 액션 수명 | owner/generation/ticket으로 늦은 응답 차단. 같은 요청의 finally에서 busy 해제하고 현재 DOM만 동기화. 실패 뒤 즉시 재시도, destroy 시 이전 DOM/세션 변화 없음. 28세부 조건 PASS |',
    '| R31C-05 증거 누락/실측 오류 | 이전 누락24건과 이번30건 전량 목록, 1건의 시험 전제 오류와 복구 이력 공개. 백업 byte count 실측으로 정정 |',
    '',
    '직접 제품 수정은 `src/web/screens/home.ts`, `scripts/ui-checks/home.mjs` 두 파일이다. 앞선 Gemini의 직원/지사 조회 오류 수정과 sync/recovery/watch H4 게이트는 유지한다. `home.ts`의 중복 액션 처리를 `handleHomeAction(kind)`로 묶고 2초 오류 잠금 타이머를 제거했다. 관리자 감시 재시작 권한을 유지한다.',
    '',
    'UI 시험은 실제 로그인·세션·역할을 사용하고 HTTP 응답 경계에서 성공/일반 실패/AUTH/통신 실패를 주입한다. 같은 HomeScreen의 refresh는 다른 홈 액션의 성공으로 발생시킨다. 셸의 “홈” 메뉴는 기존 인스턴스를 destroy하고 새 화면을 만드는 경로임을 실제 소스로 확인하여 시험을 정정했다. 공통 실행기의 오류 수집기는 유지하며, 의도적으로 중단한 액션 URL의 net::ERR_FAILED만 별도로 센다.',
    '',
    '| 파일 | 직접 수정 전 bytes / SHA-256 | 최종 bytes / SHA-256 |',
    '|---|---|---|',
]
for f in acceptance['changedFiles']:
    before = next(b for b in baseline['files'] if b['path'] == f['path'])
    lines.append(f"| `{f['path']}` | {before['bytes']:,} / `{before['sha256']}` | {f['bytes']:,} / `{f['sha256']}` |")
lines += [
    '',
    '직접 수정 전 두 파일은 `.ai/reports/sol-direct-3-1c-20260930/*.before`에 보존했다. 해당 폴더의 `home.ts.diff`, `home.mjs.diff`는 이 기준과 최종 파일의 줄 단위 diff다.',
    '',
    f'제품 status는 92경로로 동일하고 상태행 LF 연결(마지막 LF 없음) SHA-256은 `{status_sha}`다. 허용 두 파일을 제외한 90경로 해시/부재가 CORRECT2 §12와 일치한다. API·DB·계산·권한·공통 오류 수집기·V3 원본에 직접 수정이 없다. 정본과 AGENTS/PROTOCOL/GEMINI/CLAUDE/07 지침도 원래 해시를 유지한다. 제어 문서의 변경은 수용 후 승인된 상태 갱신과 하네스 연결 갱신이다.',
    '',
    '## 3. 실행 게이트',
    '',
    '| 명령/검증 | 최종 결과 |',
    '|---|---|',
    '| `npm run typecheck` | exit 0 |',
    '| `node --check scripts/ui-checks/home.mjs` | exit 0 |',
    '| `npm run lint` | exit 0, 오류0 / 기존 경고5 |',
    '| `npm run validate:map` | exit 0, CODEBASE_MAP_OK, 82경로 |',
    '| `npm run build` | exit 0, WEB_ASSETS_OK |',
    '| `npm test` | exit 0, 132파일/912시험, 277.24초 |',
    '| `git diff --check` | exit 0, 정상 저장소 줄바꿈 설정 기준 |',
    '| 실제 Chrome 154.0.8037.58 / 1440×900 | 최종26시나리오 PASS, 40캡처 실재, 예기치 않은 브라우저 오류0 |',
    '| 복구/감시 액션 세부 수명 시험 | 각각14 / 합계28 PASS |',
    '',
    'Sol이 명령 종료와 출력을 직접 확인했다. 전체912시험 이후 제품 home.ts 변경은 없고, UI 시험 전제 정정 이후 최종26시나리오를 전부 실행했다. 격리 실행기는 `.ai/reports/sol-direct-3-1c-20260930/run-ui.mjs`다. 각 명령·시작/종료·exit·manifest·임시 자료 정리 여부는 `ui-results-all-2026-09-30T05-42-08-742Z.json`에 있다. 수용 원장 `product-acceptance.json` 및 재검증 원장 `final-scope-evidence.json`을 함께 보존한다.',
    '',
    '실제 운영 DB를 사용하지 않았다. 127.0.0.1:18739의 독립 Node 서버와 시스템 임시 폴더의 신규 데이터로 로그인했다. 부트스트랩 자격증명은 출력하지 않았고 임시 자료와 자격증명 파일은 실행 후 제거됐다. 최종26실행의 정리 여부가 모두 true다.',
    '',
    '### 3.1 최종26시나리오와 manifest',
    '',
    '| 시나리오 | manifest (V4 상대경로) | 결과 / 캡처 |',
    '|---|---|---|',
]
for m in final_manifests:
    lines.append(f"| {m['label']} | `{m['path']}` | PASS / {m['captures']} |")
lines += ['', '### 3.2 액션 세부 조건', '', '| 조건 | 복구 | 감시 재시작 |', '|---|---|---|']
for a, b in zip(matrices[0]['assertions'], matrices[1]['assertions']):
    assert (a['scenario'], a['outcome']) == (b['scenario'], b['outcome'])
    lines.append(f"| {a['scenario']} / {a['outcome']} | PASS, 요청{a['requests']} | PASS, 요청{b['requests']} |")
lines += ['', '세부 결과 파일:']
for m in matrices:
    lines.append(f"- `{m['path']}`")
lines += [
    '',
    '활성 화면의 중복 클릭은 추가 요청을 만들지 않고, 성공/실패/통신 중단 뒤 재시도 요청은 정확히 한 번 추가된다. 현재 AUTH는 세션 전환 한 번, refresh/destroy 뒤 오래된 AUTH는 새 화면 전환 없이 무시된다. 파괴된 DOM의 내용과 버튼 상태는 늦은 응답 뒤 바뀌지 않는다. 실패 후 refresh에서도 새 버튼이 영구 비활성화되지 않는다. 실패를 지연 타이머로 막던 원인이 제거됐으므로 2초 후 대기 없이 재시도할 수 있다.',
    '',
    '## 4. 전체 시도와 정정 이력',
    '',
    '직접 수정 후 manifest가 생성된 실행은 **30건: PASS29 / FAIL1**이다. 첫 empty-fixture PASS 이후 stale-retry-action 시험은 홈 메뉴를 같은 인스턴스의 refresh라고 가정해 실패했다. 실제 셸이 destroy/remount하는 경로임을 확인하고, 같은 인스턴스의 refresh를 반대 액션 성공으로 일으키도록 시험을 고쳤다. 이후 집중2건 PASS 및 최종26건 PASS를 확인했다. FAIL을 삭제하거나 최종26건에 섞어 성공으로 세지 않았다.',
    '',
    '브라우저 manifest 생성 전 서버 준비 시도4회도 있었다: health만으로 자격증명 생성을 기대한 시도, Origin 없는 세션 요청의 HTTP403 두 시도, Origin을 넣은 세션 요청200이나 사용자 초기화가 안 된 시도. 격리 서버의 실제 sign-in으로 초기 사용자를 생성하는 준비 절차를 고친 뒤 실제 Chrome 로그인을 실행했다. `ui-setup-failure.json`은 마지막 준비 실패를 보존하며, 4개의 개별 manifest가 있었다고 주장하지 않는다.',
    '',
    '| 이번 실행 manifest | 결과 |',
    '|---|---|',
]
for m in new_runs:
    lines.append(f"| `{m['path']}` | {m['status']} |")
lines += [
    '',
    '### 4.1 CORRECT1 회신에서 빠졌던24건',
    '',
    '이전 총52건 중 회신 누락24건(PASS22/FAIL2)은 아래와 같다. 직원 실패에서 1/2로 보인 FAIL은 앞선 Gemini 수정으로, 지사 오류 시험의 잘못된 기대 문구 FAIL은 시험 문구 수정으로 닫혔다. 최종 직접 검증에서도 두 오류 시나리오가 PASS다. 앞선 최초 제출의 누락 FAIL6건은 이미 `Log/20260930_131505_3-1c-Sol-CORRECT_검증본.md` 및 CORRECT1 수신본에 기록되어 있으며 그대로 보존한다.',
    '',
    '| 이전 누락 manifest | 당시 결과 |',
    '|---|---|',
]
assert len(old_audit['unreportedRecentRuns']) == 24
for m in old_audit['unreportedRecentRuns']:
    assert (PRODUCT / m['path']).is_file()
    lines.append(f"| `{m['path']}` | {m['status']} |")
lines += [
    '',
    'CORRECT1의 pre-edit-backup-31c-correct1 사본 byte count는 home.ts **30,562**(기존 보고33,688), home.mjs **18,709**(기존 보고21,348)로 정정한다. 당시 SHA는 기준과 일치했다. 이번 직접 수정 직전 사본은 위 §2처럼 별도 측정값37,972/36,168이며 같은 사본을 뜻하지 않는다.',
    '',
    '검증 중 `core.autocrlf=false`를 강제한 whitespace 검사에서 기존 CRLF가 대량의 허위 trailing-whitespace로 표시됐다. 정상 저장소 설정으로 `git diff --check` exit0을 확인했다. 이 검사 과정에서 제품 파일을 바꾸지 않았다.',
    '',
    '## 5. AI-Harness 5.1 적용',
    '',
    '- 공개 원격: `https://github.com/hacker943410-debug/ai-harness.git`',
    '- Release: `https://github.com/hacker943410-debug/ai-harness/releases/tag/v5.1.0`',
    f"- 설치 이전 HEAD: `{harness['beforeHEAD']}` (v3.0.0)",
    f"- 설치 최종 HEAD: `{harness['targetHEAD']}` (peeled v5.1.0 일치, detached pin)",
    f"- 전체 설치본 백업: `{Path(harness['backupPath']).relative_to(CONTROL).as_posix()}`",
    '- 숨김 .git 포함121파일을 경로/bytes/SHA-256으로 전건 비교해 일치 확인 후 fetch/checkout했다.',
    f"- plan.json: {harness['planBytes']:,} bytes / SHA-256 `{harness['planSHA256']}`, 원본 유지",
    '- 설치본 git status: `?? plan.json` 한 경로만 유지. core.hooksPath `.githooks` 유지.',
    '- 정책26개 원문은 백업과 바이트 동일하다.',
    '- `Test-HarnessRepo.ps1 -HarnessRoot <installed-root>`: exit0, PASS_WITH_WARNING. 기존 markitdown 0.0.1a4 prerelease 고정 경고1개가 남는다.',
    '- 프로젝트 `.ai/harness.yaml`: runtime version5.1, skills_dir 및 JIT skill loading만 연결. schema_version2.0 / initialized_with3.0 / 모든 역할·핸드오프 설정 유지.',
    '- `.ai/HARNESS.md`: 설치된 Global5.1과 프로젝트 운영 오버레이4.0을 구분하고 번들 Skill JIT 경로 및 Jev 미설정·비활성 경로를 기록했다.',
    '- PROJECT_INIT 재실행이나 역할 지침 교체는 없었다. AGENTS/PROTOCOL/GEMINI/제품 불변 규칙의 해시는 그대로다.',
    '',
    '설치 기본 스크립트는 untracked plan.json 때문에 그대로 실행할 수 없어, 전체 백업·tag/SHA 검증 후 해당 SHA를 checkout하는 방식으로 적용했다. plan.json 이동/삭제나 reset/clean은 하지 않았다. `apply-installed-harness.ps1`, `installed-v3-backup-manifest.json`, `installed-update-evidence.json`, `installed-v5.1-check.log`에 실행 절차와 결과가 남아 있다.',
    '',
    '## 6. 종결 및 다음 작업',
    '',
    'R31C-01~05를 닫고 3-1c를 ACCEPTED로 판정한다. R-16 하네스 공개/로컬 적용과 R-17 직접 수정 요구를 완료 처리한다. 이 종결본을 보존한 뒤 TODO/current-state에 승인된 완료 상태를 반영한다.',
    '',
    '다음 계획은 TODO의 3-1d(전체 로그인/셸/홈 디자인 및 조작 최종 통합 검수), 이어 3-1e(전체3-1 수용 뒤 커밋·사용자 확인)다. 현재 두 항목은 대기이며 이번 작업에서 전체3-1 완료나 V4 커밋을 선언하지 않는다.',
    '',
    f'이 문서의 동일 바이트 종결 보존본: `{closeout_name}`. 보존본 SHA/bytes는 별도 `closeout-receipt.json`에 기록한다.',
    '',
]
assessment = '\n'.join(lines)
write_text(REPORT / 'closeout-draft.md', assessment)
write_text(CONTROL / 'HANDOFF.md', assessment)
archive_path = CONTROL / closeout_name
assert not archive_path.exists()
archive_path.write_bytes((CONTROL / 'HANDOFF.md').read_bytes())
assert archive_path.read_bytes() == (CONTROL / 'HANDOFF.md').read_bytes()

todo_path = CONTROL / 'TODO.md'
todo = todo_path.read_text(encoding='utf-8-sig')
todo_lines = todo.splitlines(keepends=True)
for i, line in enumerate(todo_lines):
    if line.startswith('> **현재 정본(2026-09-30)**'):
        todo_lines[i] = f'> **현재 정본(2026-09-30)**: Phase 1·2·2.5 종결, Phase 3-0·3-1a·3-1b 및 **3-1c ACCEPTED**. 사용자 직접 수정 지시로 Sol이 home.ts/home.mjs 두 파일을 보완했다. 전체132파일/912시험, 실제 Chrome 최종26시나리오/40캡처, 액션 수명28조건 PASS. 보호90경로·정본/역할 지침 불변, V4 HEAD/status92 유지. **하네스 설치본 전체121파일(.git/plan.json 포함) 백업·해시 검증 뒤 v5.1.0 고정 SHA 적용 및 프로젝트 연결 갱신 완료**. plan.json 보존, 운영 오버레이4.0/기존 역할 유지. 종결 정본 `{closeout_name}`. 다음은3-1d/e이며 전체3-1은 미완료.\n'
    elif line.startswith('| **지금 위치** |'):
        line = line.replace('**Phase3-1c CORRECT2 준비(첫 수정 미수용, 2026-09-30).**', '**Phase3-1c ACCEPTED · 하네스5.1 적용 완료(2026-09-30).**', 1)
        todo_lines[i] = line
    elif line.startswith('| **다음 행동** |'):
        todo_lines[i] = '| **다음 행동** | 3-1d 전체 로그인·셸·홈의 디자인/주요 조작 최종 통합 검수 → 전체3-1 수용 뒤3-1e 커밋·사용자 확인. CORRECT2/Gemini 회신 대기는 직접 수정 완료로 종결했다. |\n'
    elif line.startswith('| **현재 확인** |'):
        history = line.split('아래는 과거 확인 이력:', 1)[1]
        todo_lines[i] = '| **현재 확인** | Sol 직접 수정 두 파일 검증: 전체912시험·타입/규칙/지도/빌드 PASS, Chrome26시나리오 및 액션28조건 PASS. 보호90경로 불변. 하네스5.1 설치 검사 exit0(기존 prerelease 경고1), plan.json 원본·전체 백업 검증 완료. 아래는 과거 확인 이력:' + history
    elif line.startswith('| 3. 화면 재구축 |'):
        todo_lines[i] = '| 3. 화면 재구축 | 1/10 | 🔄 3-0 ACCEPTED, 3-1a/b/c 완료, 3-1d/e 대기 |\n'
    elif line.startswith('- 🔄 3-1.'):
        todo_lines[i] = line.replace('3-1b는 Sol ACCEPTED, 3-1c~e가 남아', '3-1b/c는 Sol ACCEPTED, 3-1d/e가 남아', 1)
    elif line.startswith('  - 🔄 3-1c.'):
        todo_lines[i] = line.replace('  - 🔄 3-1c.', '  - ✅ 3-1c.', 1).rstrip('\r\n') + f' **직접 수정 종결(2026-09-30)**: 사용자 “너가 직접해” 지시로 대기 CORRECT2를 대체했다. Sol이 두 파일의 액션 수명·새로고침 로딩과 실제 검증을 보완하여 R31C-01~05 ACCEPTED. 전체912시험·Chrome26/40캡처·액션28조건 PASS, 보호90경로 불변. 이전 누락24건과 이번30건(29PASS/1시험 전제 FAIL)을 전수 보존했다. 근거 `{closeout_name}`.\n'
    elif line.startswith('| R-16 |'):
        todo_lines[i] = f'| R-16 | 2026-09-30 | AI-Harness 문제 수정본을 GitHub v5.1로 공개하고 현재 프로젝트에 순서대로 적용 | GitHub v5.1.0 공개 및 로컬 고정 SHA `8ebab0087b228c0203a202bead8fb56853d9cb27` 적용 완료. 3-1c 수용 → 설치본121파일/.git/plan.json 전체 백업·해시 일치 → 설치 검사exit0 → 연결 문서 갱신. plan.json·정책26개·기존 역할 유지. 근거 `{closeout_name}` | ✅ |\n'
        todo_lines.insert(i + 1, f'| R-17 | 2026-09-30 | “너가 직접해 너무 오래걸린다” — 대기 중3-1c 수정은 Sol이 직접 수행 | 이번 home.ts/home.mjs 두 파일에 한정한 직접 구현 예외로 CORRECT2를 대체. 수정·전체912시험·Chrome26시나리오/액션28조건 통과, 3-1c ACCEPTED. 정상 제품 작성자Gemini 역할 유지. 근거 `{closeout_name}` | ✅ |\n')
        break
assert not any(l.startswith('| R-17 |') for l in todo.splitlines())
write_text(todo_path, ''.join(todo_lines))
state_path = CONTROL / '.ai/current-state.md'
state = state_path.read_text(encoding='utf-8-sig')
state = state.replace('Status: PHASE_3_1C_GEMINI_CORRECT2_READY', 'Status: PHASE_3_1C_ACCEPTED_HARNESS_5_1_APPLIED', 1)
entry = f'''## Current task — direct fix accepted / harness applied ({time_text})

- The user's specific “너가 직접해 너무 오래걸린다” instruction authorized Sol to modify home.ts/home.mjs for this task. Pending CORRECT2 is closed; normal future product-code ownership remains Gemini.
- Phase3-1c ACCEPTED: R31C-01~05 closed. Typecheck/lint/map82/build PASS; 132 files/912 tests PASS; final Chrome26 scenarios/40 captures PASS; real-session recovery/watch lifetime assertions28 PASS.
- This direct execution produced30 manifests:29 PASS and1 initial test-assumption FAIL. All runs and prior CORRECT1 omissions24 are recorded in the closeout. The sidebar Home menu remounts; same-owner refresh is now tested through the other home action's success.
- Protected90 product paths unchanged; canonical and role guidance unchanged. V4 main HEAD2d97d9bb3dc649f8c40c0d1d0cfc9fdeae0df283; status92 SHA `{status_sha}`. No V4 commit.
- Installed harness v5.1.0 at `{harness['targetHEAD']}` after verified121-file full backup including.git and plan.json. plan.json22047 bytes/SHA `{harness['planSHA256']}` unchanged; status only untracked plan.json.26 policy documents unchanged.
- Installation checker exit0/PASS_WITH_WARNING: existing markitdown0.0.1a4 warning. Project connection now5.1 with bundled Skill JIT; operating overlay4.0 and all fixed roles retained. Jev unconfigured/disabled.
- R-16/R-17 completed. Next approved plan items3-1d/e remain pending; entire3-1 is not yet complete.
- Closeout `{closeout_name}`; detailed evidence `.ai/reports/sol-direct-3-1c-20260930/` and `.ai/reports/harness-v5.1-20260930/`.

Earlier entries below retain historical state and do not override this entry.

'''
state = state.replace('## Current task — CORRECT1 reviewed / CORRECT2 ready', entry + '## Historical task — CORRECT1 reviewed / CORRECT2 ready', 1)
write_text(state_path, state)

scope = {'time': now.isoformat(), 'protectedPaths': protected, 'statusPaths': 92, 'statusSHA': status_sha, 'unchangedControls': unchanged_controls, 'changedProductFiles': acceptance['changedFiles'], 'finalManifests': final_manifests, 'finalCaptureCount': capture_count, 'actionMatrices': matrices, 'allDirectRuns': new_runs, 'priorUnreportedRuns': old_audit['unreportedRecentRuns'], 'harness': harness, 'policyFilesUnchanged': 26}
write_text(REPORT / 'final-scope-evidence.json', json.dumps(scope, ensure_ascii=False, indent=2) + '\n')
receipt = {'time': now.isoformat(), 'assessmentArchive': closeout_name, 'assessmentBytes': archive_path.stat().st_size, 'assessmentSHA256': sha(archive_path.read_bytes()), 'receivedArchiveVerified': True, 'updatedControls': {path: {'bytes': (CONTROL / path).stat().st_size, 'sha256': sha((CONTROL / path).read_bytes())} for path in ['HANDOFF.md', 'TODO.md', '.ai/current-state.md', '.ai/HARNESS.md', '.ai/harness.yaml']}}
write_text(REPORT / 'closeout-receipt.json', json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'decision': 'ACCEPTED', 'archive': closeout_name, 'archiveBytes': receipt['assessmentBytes'], 'archiveSHA256': receipt['assessmentSHA256'], 'finalChromeRuns': 26, 'captures': capture_count, 'actionAssertions': 28, 'allDirectRuns': len(new_runs), 'protected': len(protected), 'harnessApplied': harness['targetHEAD']}, ensure_ascii=False, indent=2))
