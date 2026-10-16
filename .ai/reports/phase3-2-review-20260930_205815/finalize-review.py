# -*- coding: utf-8 -*-
from pathlib import Path
import hashlib
import json
import subprocess
from datetime import datetime
from zoneinfo import ZoneInfo

CONTROL = Path(r'C:\Projects\Active\교대근무관리 시스템')
PRODUCT = Path(r'C:\Projects\Active\ShiftMgmt_V4')
REVIEW = CONTROL / '.ai/reports/phase3-2-review-20260930_205815'
ORIGINAL = CONTROL / '.ai/reports/phase3-2-20260930/baseline.json'
HEAD = '160940f9aaeb6696538447f83b44658073e382f0'
ALLOW = ['src/web/screens/access-history.ts', 'src/web/screens/access-history-model.ts',
         'src/web/screens/access-history-model.test.ts', 'src/web/access-history.css',
         'scripts/ui-checks/access-history.mjs']
NOW = datetime.now(ZoneInfo('Asia/Seoul'))
STAMP = NOW.strftime('%Y%m%d_%H%M%S')
TIME = NOW.strftime('%Y-%m-%d %H:%M:%S KST')

def sha(data):
    return hashlib.sha256(data).hexdigest().upper()

def meta(p):
    data = p.read_bytes()
    return {'bytes': len(data), 'sha256': sha(data)}

def read_json(p):
    return json.loads(p.read_text(encoding='utf-8-sig'))

def write_json(p, value):
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def write_once(p, data):
    with p.open('xb') as f:
        f.write(data)
    assert p.read_bytes() == data

def git(*args):
    r = subprocess.run(['git', '-c', 'safe.directory=C:/Projects/Active/ShiftMgmt_V4', *args],
                       cwd=PRODUCT, capture_output=True, check=True)
    return r.stdout.decode('utf-8')

def product_state():
    names = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0')
    names = sorted(set(n for n in names if n and (PRODUCT/n).is_file()))
    return {n: sha((PRODUCT/n).read_bytes()) for n in names}

received = read_json(REVIEW/'received.json')
old = read_json(ORIGINAL)
before = read_json(REVIEW/'scope-before.json')
raw = (CONTROL/'HANDOFF.md').read_bytes()
assert sha(raw) == received['sha256'] and len(raw) == received['bytes']
assert Path(received['receivedArchive']).read_bytes() == raw
assert git('rev-parse', 'HEAD').strip() == HEAD
assert git('branch', '--show-current').strip() == 'main'
status = git('status', '--short', '--untracked-files=all').splitlines()
assert status == before['status']
files = product_state()
assert {p:files[p] for p in before['productFiles']} == before['productFiles']
extra = sorted(files.keys() - before['productFiles'].keys())
assert len(files) == 338 and len(extra) == 9
for p in extra:
    assert p.startswith('양식샘플/'), p
    blob = subprocess.check_output(['git','-c','safe.directory=C:/Projects/Active/ShiftMgmt_V4','show',f'{HEAD}:{p}'],cwd=PRODUCT)
    assert sha(blob) == files[p], p
for p, expected in old['protectedFiles'].items():
    assert files[p] == expected, p
for p, expected in old['canonical'].items():
    assert meta(CONTROL/p) == expected, p
probes = read_json(REVIEW/'probe-results.json')
assert len(probes['groups']) == 8
assert [g['status'] for g in probes['groups']] == ['FAIL']*6 + ['PASS']*2
assert not any(probes[k] for k in ['consoleErrors','pageErrors','requestFailures','responses'])
cleanup = read_json(REVIEW/'server-cleanup.json')
assert cleanup['tempDataCleaned'] and cleanup['serverStopped']
assert read_json(REVIEW/'server-cleanup.json.first-pass')['tempDataCleaned']
assert read_json(REVIEW/'supplied-unknown-case.json')['exitCode'] == 0
assert all(x['exitCode'] == 0 for x in read_json(REVIEW/'static-results.json'))

transition = CONTROL/'Log'/f'{STAMP}_3-2b-Gemini_CORRECT전환보존.md'
write_once(transition, raw)

assessment = f'''# Phase3-2b — Sol 독립 검증 종결 / CORRECT 1

- From: Sol · frontier — 권한/비동기 수명/통합 수용 결정
- Date: {TIME}
- Verdict: **CORRECT — 수용 보류, 첫 통합 수정 요청**
- Repository: `{PRODUCT}` · main · `{HEAD}` · commit/push/제품 변경 by Sol = 0
- 수신원본: `{received['receivedArchive']}` · {received['bytes']}bytes · SHA-256 `{received['sha256']}`
- 전환 보존: `{transition}` — 수신원본과 byte-for-byte 일치
- 검증 증거: `{REVIEW}`

## 1. 통과한 범위 / 실제 실행

수신본문은 발송본과 일치하고 변경은 정확히 신규5/기존4의9경로다. 기존 수신 manifest의329파일과 그 manifest에 포함되지 않았던9개 양식샘플을 추가 확인했다. 샘플9개는 HEAD blob과 byte-for-byte 같고 현재 전체338파일을 새 기준에 넣었다. 보호320파일/정본13파일은 기존 baseline과 일치한다. 제출9파일의 크기/해시도 회신과 일치하며 각 신규파일30,000bytes 이하, HEAD/status 불변이다.

Sol이 typecheck, runner syntax, lint(기존5경고), map87, 관련3파일11시험, diff check, build를 실행해 전부 RC0를 확인했다. `static-results.json`과 각각의 raw log가 근거다. **전체133파일919시험은 Gemini 자기보고이며 Sol은 이번 반려 검토에서 전체 시험을 재실행하지 않았다.** 기존 시험 결과를 독립 full 검증으로 표현하지 않는다.

설치 Chrome154.0.8037.58 / 1440×900 / fonts.ready로8개 독립 그룹을 실행했다.6 FAIL/2 PASS, 예상외 console/pageerror/requestfailed/HTTP 오류0. API fixture는 UI 수명/렌더링 재현에만 사용했다. operator/planner/reviewer는 격리 서버의 실제 계정/cookie로 검증했고 menu0/자동list·users0/직접API AUTH_FORBIDDEN/data없음 전부 PASS다. 날짜 조건 잠금도 actual focus/DOM disabled=false/aria-disabled=true/2px outline/Space·Enter·click requests0 PASS다.

## 2. stable 결함 — 한 번에 묶은 수정 범위

| ID | 심각도 / 독립 근거 | 실패한 요구사항 |
|---|---|---|
| R32C-01 | High. `access-history.ts:232–239,274–279,374` 검색 입력 즉시 세대 무효화가 없어250ms 사이에 old success가4ms 후 표시되고 old AUTH_SESSION_REQUIRED가 유효한 현재 화면을 로그인으로 이동시킨다. keyword→즉시refresh는 같은query를192ms 간격으로2회 호출했다. | R32-02/03/06 |
| R32C-02 | Medium. `access-history.ts:358–369` 날짜 오류 분기가 renderBody를 호출하지 않는다. held 조회 중 start09-30/end09-01로 바꾸면 오류와 로딩이 함께 남고 old release 후에도 loading1이다. | R32-03/05/06 |
| R32C-03 | Medium. `access-history.ts:577–582` users 재시도에 pending guard/native disabled가 없다. held 재시도 두 번에 users2/logs2, retry.disabled=false다. | R32-03/05 |
| R32C-04 | Medium. `model.ts:157–162` approve 정규식이 danger보다 먼저 실행돼 performance-hide-approved(승인완료 목록삭제)가 green으로 표시된다. schedule-publish도 green이지만 승인 G1 HTML:573은 info blue다. 새 model test:207도 잘못된 publish 기대값이다. | R32-07 / 원 발송 §6.1 |
| R32C-05 | Medium. 실제 정상행59px/긴행541.5px, 날짜input130×34, 사용자열161.5625px, 표 자체 accessible name 없음. 기준40/132×34/140/이름과 다르다. 상세 원문1216자/title1216자는 보존돼 있으므로 보존 동작은 유지한다. | R32-04/07 |
| R32C-06 | High(검증 신뢰성). `node scripts/ui-checks/access-history.mjs --case=sol-unknown-case` 실제 RC0/PASS. CASE/URL 검문 없음, arbitrary http URL 사용, start/launch가 finally 밖, cleanup 전에 PASS, console에401/403이 있으면 포괄 제외, requestfailed/HTTP/font 계측 누락. role는operator만, stale는success만, filters는click만, session은같은page signOut. 요구한 완전한 행동검사/action-assertions가 없어10case RC0만으로 수용할 수 없다. | R32-08/09 |

원본 그룹 결과·요청시각·실제값: `probe-results.json`. 디자인, invalid-date loading, stale-auth redirect, retry duplicate 각각 PNG가 있다. runner false PASS는 `supplied-unknown-case.log/.json`에 보존했다. 검사기가 실행하지 않은 동작을 회신에서 PASS로 서술한 부분은 수정해야 한다. session capture 회신의 `session-expired-login.png`와 실제코드의 `session-expired-redirect.png`도 다르다.

## 3. 검수 도구 자체의 첫 실행 오류 / 수정

첫 Sol probe는 기본 start09-01에서 end09-01만 설정해 equal valid 조건을 잘못 invalid로 간주했다. invalid-date/keyboard 두 결과는 제품 판정 근거에서 제외한다. 실제 start09-30/end09-01을 설정하고 새 격리서버에서 재실행해 위 최종 결과를 얻었다. 첫 role setup은 planner/reviewer bootstrap이 없어 PROBE_ERROR였으며, 재실행은 기존 admin saveOperationUser API로 두 실제계정을 만들어 확인했다. 제품/API/DB 소스 변경과 직접SQL은0이다. 첫 probe source/results/server info/cleanup은 `.first-pass`로 보존했다.

## 4. 종결 / 다음 경계

3-2b 원 IMPLEMENT 검증 대상은 이 CORRECT 판정으로 닫는다. 이후 Sol이 승인된 TODO의 사실 상태와 current-state만 갱신한 뒤, 받은338파일 바이트를 새 기준으로 **5파일만** 고치는 CORRECT 지시서를 발송한다. 기존9경로 dirty/main/HEAD를 유지하고 나머지333파일을 보호한다. 3-2 완료/커밋/사용자 확인은 보류다. 3-1e 사용자 직접 화면 확인도 증거가 없어 여전히 대기다. 같은 결함군 재제출 최대2회 뒤 재설계한다.

독립 probe Chrome/context는 finally 종료, MCP browser 닫음, 이번 소유 서버2회 exit 및 temp 정리 확인. 과거 보존 temp는 건드리지 않았다. 자기보고 runner의 각 역사 temp 전체 정리를 독립 검증했다고 주장하지 않는다.
'''
assessment_bytes = assessment.encode('utf-8')
closeout = CONTROL/'Log'/f'{STAMP}_3-2b-Sol-CORRECT1_독립검증종결본.md'
write_once(closeout, assessment_bytes)
(REVIEW/'assessment.md').write_bytes(assessment_bytes)
# Explicitly close the old validation target before changing its TODO hash.
(CONTROL/'HANDOFF.md').write_bytes(assessment_bytes)

todo_path = CONTROL/'TODO.md'
todo = todo_path.read_bytes().decode('utf-8')
marker = '## 지금 위치와 다음 행동\r\n\r\n'
assert marker in todo
notice = (f'> **최신 정본({TIME})**: 3-2b 회신 검수 **CORRECT 1 / 수용 보류**. '
          '독립 typecheck·lint·map87·build·관련11시험 PASS, 실제Chrome8그룹6 FAIL/2 PASS. '
          '검색 debounce 경합·invalid 날짜 로딩·retry 중복·배지·수치/표이름·검증기 false PASS를 R32C-01~06으로 통합했다. '
          f'종결 원문 `{closeout.relative_to(CONTROL).as_posix()}`. 다음은 HANDOFF의 닫힌5파일 Gemini 수정→Sol 재검증. '
          '3-2 완료/커밋과3-1e 사용자 직접 화면 확인은 대기다. 아래 이전 정본은 진행 이력이다.\r\n\r\n')
todo = todo.replace(marker, marker+notice, 1)
replacements = {
 '| **다음 행동** | 3-1e 검수된 제품 변경 커밋 완료(`160940f`), 사용자 직접 화면 확인은 별도 대기. 사용자 09-30 「빠르게 진행」 지시에 따라3-2a 활동 이력 명세 확정·Gemini IMPLEMENT 패킷 준비 완료. 다음은 사용자 HANDOFF 중계→Gemini3-2b 구현→Sol 독립 검증. |':
 '| **다음 행동** | 3-2b 회신을 Sol이 검수해 CORRECT 1 판정. HANDOFF를 Gemini에 중계→R32C-01~06 닫힌5파일 수정→Sol 재검증. main `160940f` 유지, 수용/커밋 보류.3-1e 사용자 직접 화면 확인은 별도 대기. |',
 '🔄 3-0 ACCEPTED,3-1a/b/c/d 완료,3-1e 커밋 완료·직접 화면 확인 대기.3-2a 확정·3-2b Gemini 중계 대기':
 '🔄 3-0 ACCEPTED,3-1a/b/c/d 완료,3-1e 커밋 완료·직접 화면 확인 대기.3-2a 확정·3-2b/c CORRECT 1 수정/재검증 진행',
 '  - ☐ 3-2b. Gemini 구현 — 관리자 전용 진입·실제조회·필터·5열 표·빈 상태·오류/세션·요청 수명 관리.':
 '  - 🔄 3-2b. Gemini 9파일 구현 회신 수신. Sol 검수 CORRECT 1: R32C-01~06 통합 결함을 HANDOFF의 닫힌5파일에서 수정 후 재제출. 구현 제출과 수용을 구분하고 완료/커밋 선언 금지.',
 '  - ☐ 3-2c. 타입·규칙·관련 시험·실제Chrome 시안 대조·클릭/키보드·권한/경합을 Sol 독립 검증.':
 '  - 🔄 3-2c. 1차 독립검수: typecheck/lint/map87/build/관련11시험 PASS, 실제Chrome8그룹6 FAIL/2 PASS, 역할3종 실제서버 차단/invalid 잠금 PASS. 전체919시험은 Gemini 자기보고이고 Sol full 재실행 아님. CORRECT1 수정본에서 필수Chrome10case·회귀·경합·전체시험 증거 재검증.',
}
for src,dst in replacements.items():
    assert todo.count(src) == 1, src
    todo = todo.replace(src,dst,1)
todo_path.write_bytes(todo.encode('utf-8'))

state_path = CONTROL/'.ai/current-state.md'
old_state = state_path.read_text(encoding='utf-8-sig')
old_state = old_state.replace('## Current task — accepted work committed / activity history implementation packet ready',
                              '## Historical task — accepted work committed / activity history implementation packet ready',1)
body = old_state.split('\n',4)[4]
state = f'''# Current Project State

Status: PHASE_3_2B_CORRECT_1_USER_RELAY

## Current task — activity history review closed, consolidated correction ready ({TIME})

- Latest user request: 「핸드오프 확인해」. Existing roadmap continuation authorizes review/control updates. Sol product changes0; Gemini remains the product writer through manual user relay.
- Received exact archive: `{received['receivedArchive']}` / {received['bytes']}bytes / `{received['sha256']}`. Body/scope9/protected320/canonical13/claimed9 hashes all matched before closing the validation target.
- Verdict CORRECT1, not accepted. Stable R32C-01 query/debounce stale-auth+duplicate refresh;02 invalid-date stale loading;03 users retry duplicate;04 badge priorities/publish color;05 actual row/input/columns/table name;06 truthful complete safe runner. Sol closeout `{closeout.relative_to(CONTROL).as_posix()}`. Evidence `{REVIEW.relative_to(CONTROL).as_posix()}`.
- Independent static/build/focused3files11tests PASS. Gemini reported full133files919tests; Sol did not independently repeat full suite in this rejection turn. Installed Chrome154.0.8037.58/1440×900:8 groups6FAIL/2PASS; raw unexpected browser error arrays empty. All3 nonadmin real sessions denied APIs with no data/menu/automatic calls. Invalid lock actual focus/Space/Enter/click0 PASS.
- First control probe used equal dates by mistake and lacked two bootstrap roles; preserved `.first-pass` source/results. Corrected preconditions and genuine saveOperationUser role setup on fresh owned temp, reran before final findings. Never change canonical requirements to match a bad test.
- Product main HEAD `{HEAD}`,9dirty paths,338 files unchanged through Sol review. Next correction allows only5 activity files, protects remaining333, no new files/deps/backend/auth/API/DB/global CSS/common-runner changes. CORRECT1 maximum two resubmissions for same group, then replan.
- TODO status updated only after original3-2b target explicitly closed.3-2 not complete/committed;3-1e direct user visual confirmation still pending. No push/deployment/other AI CLI.
- Owned Chrome/probe contexts, MCP browser, both review servers/temp folders cleaned. No historical temp folder removed. Harness5.1/project roles4.0 retained. Balanced Terra unavailable; evidence review used available gpt-6-sol fallback, independently checked by Sol. Active JIT P04/P05/P06/P21/P26/P17/P08; Jev disabled.

Earlier entries below are historical and do not override this entry.

{body}
'''
state_path.write_text(state, encoding='utf-8')

lesson_path = CONTROL/'.ai/lessons/date-negative-preconditions.md'
if not lesson_path.exists():
    lesson_path.write_text('''# 날짜 음성 시험의 전제조건을 먼저 검증

- Date: 2026-09-30 · Phase3-2 Sol control probe
- Failure: default start09-01에서 end09-01만 설정하고 invalid라고 잘못 판단했다. 첫 invalid/keyboard 결과는 제외하고 원본을 `.first-pass`로 보존했다.
- Root cause: 운영일의 default start와 입력한 end의 실제 관계를 시험이 확인하지 않았다.
- Fix: 두 경계를 모두 명시(start09-30/end09-01), DOM값과 validation 사유를 확인하고 동일 조작 재실행. 잘못된 시험 결과를 제품 결함으로 기록하지 않는다.
- Recall: 날짜 범위/금액 한도/역할 거절 시험은 부정 조건이 실제로 성립하는지 동작 전에 assertion한다. 요청0·pending·focus는 각 독립 측정으로 확인한다.
''', encoding='utf-8')

CORRECTION = CONTROL/'.ai/reports'/f'phase3-2-correct1-{STAMP}'
CORRECTION.mkdir()
canonical = {p: meta(CONTROL/p) for p in old['canonical']}
canonical['.ai/current-state.md'] = meta(state_path)
baseline = {
    'time': TIME, 'repository': str(PRODUCT), 'branch':'main','head':HEAD,'status':status,
    'editableExisting':ALLOW,'allowedNewAbsent':[], 'productFiles':files,
    'productMetadata':{p:meta(PRODUCT/p) for p in files},
    'protectedFiles':{p:h for p,h in files.items() if p not in ALLOW},
    'controlRoot':str(CONTROL),'canonical':canonical,
    'received':received,'previousCloseout':str(closeout),'sourceChangesBySol':0,
    'reviewSource':str(REVIEW/'probe-results.json'),
}
write_json(CORRECTION/'baseline.json',baseline)

original_text = raw.decode('utf-8-sig').replace('\r\n','\n')
base_contract = original_text.split('## 5. 요구사항\n',1)[1].split('## 8. 착수 전 확인\n',1)[0]
base_contract = '## 5. 유지할 원 요구사항 및 불변조건\n'+base_contract
base_contract = base_contract.replace('## 6. Sol 코드 전략 — 이 순서','### 원 IMPLEMENT의 재사용 계약')
base_contract = base_contract.replace('### 6.1 확정 디자인 수치와 표시 선택','### 유지할 디자인 수치')
base_contract = base_contract.replace('## 7. 불변조건과 과거 함정','### 유지할 불변조건과 과거 함정')
base_contract += '\n위 원 계약은 유지하며, R32C-01~06과 아래 수정 전략이 이번 결함의 구현 순서를 구체화한다. 새 착수 기준은 원 clean/333/신규부재가 아닌 이 패킷의 dirty9/338/기존5 기준이다.\n'

hash_table = '\n'.join(f'| `{p}` | {meta(PRODUCT/p)["bytes"]} | `{files[p]}` |' for p in ALLOW)
frozen4 = [p for p in old['editableExisting']]
frozen_table = '\n'.join(f'| `{p}` | {meta(PRODUCT/p)["bytes"]} | `{files[p]}` |' for p in frozen4)
status_text = '\n'.join(status)
bm = meta(CORRECTION/'baseline.json')
packet = f'''# HANDOFF — Phase3-2b 활동 이력 CORRECT 1 / R32C-01~06

- From: Sol (frontier / 오케스트레이터)
- To: Gemini (외부 구현 코더, 사용자가 수동 중계)
- Date: {TIME}
- Action: CORRECT
- 회신: 필요
- Verdict of previous submission: CORRECT / 수용 보류
- Repository: `{PRODUCT}`
- Branch: `main`
- Baseline commit: `{HEAD}`
- Expected initial worktree: **아래9경로 dirty 그대로**. 기존 제출물 위에서 수정하며 clean 요구·reset·checkout·삭제·commit/push 금지.
- Control root: `{CONTROL}`
- 이전 수신: `{transition}` · {len(raw)}bytes · SHA-256 `{sha(raw)}`
- 독립 검증 종결: `{closeout}`
- Correction attempt: 첫 통합 수정. 같은 결함군 최대2회 재제출;2회 실패 후 Sol 재설계.

## 회신 요청

Gemini는 아래 착수 기준과5파일 경계를 확인한다. 불일치면 수정 없이 즉시 BLOCKED, 일치하면 모든 R32C-01~06을 묶어 수정·전체검증하고 맨 아래 **보이는 `## 회신`만** 채운다. 이 본문을 변경하지 않는다. 회신 전 Sol 수용/다음 단계는 대기한다. 외부 AI CLI 호출, TODO/.ai/정본/Log 수정, 임의 commit/push는 금지다.

## 1. 목표

기존 활동 이력 구현의 query 수명/검증 오류/재시도 중복/표시 의미·수치/검증 신뢰성 결함을 최소 수정하고 재현 가능한 증거로 재제출한다. 이전 PASS 서술로 누락된 요구를 면제하지 않는다.

## 2. 비목표

새 기능·다음 화면·공통 CSS/라우터·API/인증 정책·DB/계산·이관원본·의존성 변경0. 기존4통합파일과 기존 시험/공통 runner를 고치지 않는다. 사용자 직접 화면 확인/운영 패치/배포/최종 완료 선언0. Sol은 제품 코드를 변경하지 않았다.

## 3. 현재 상태와 근거 / 직전 실패

3-2b 제출 범위9/보호320/정본13/회신hash 검증 PASS. Sol static/build/map87/관련3파일11시험 PASS. full133파일919시험은 Gemini 자기보고이며 이번 반려 단계의 Sol 독립 full 결과가 아니다. Chrome154/1440×900 최종8그룹6FAIL/2PASS, 예상외 console/pageerror/requestfailed/HTTP오류0. 실제 operator/planner/reviewer 서버 guard와 invalid 잠금키보드는 PASS. 받은 전체338파일/HEAD/status는 Sol 검수 동안 불변이었다.

완전한 판정은 위 종결본과 `{REVIEW}/assessment.md`에 있다. 원본 probe/결과/PNG/명령 raw log를 읽기 전용으로 참조한다. 첫 control probe의 잘못된 equal-date 전제와 missing-role fixture 오류는 `.first-pass`로 보존했고, fresh 서버에 전제를 고쳐 재실행한 **최종 `probe-results.json`만** 제품 판정에 사용한다. 이것을 제품 회귀로 고치지 않는다.

| stable ID | 구현 위치 / 실제 실패 | 수정 후 기대 |
|---|---|---|
| R32C-01 | screen keyword input232/refresh274/loadGeneration374. 검색 직후250ms 내old success가4ms후현재결과에표시, old AUTH_SESSION_REQUIRED가로그인전환. keyword후refresh는동일list2회. | 입력 순간old세대무효;old success/error/auth/finally 영향0. 즉시refresh/선택/날짜/reset은남은timer취소후현재query1회. 최신요청finally만잠금관리. |
| R32C-02 | screen datevalidation358–369. start09-30/end09-01 invalid인데 held old load release 전후 loading1잔존. | invalid 입력즉시사유+행/로딩제거, count현재조건표시, list0. 이전결과해제해도invalid화면불변. |
| R32C-03 | screen users retry577–582. 두click에users2/logs2, native retry.disabled=false. | 동일 pending retry 추가요청0/native disabled=true/handler guard. list/users 실패분리·현재loginId보존, 정상조건변경의새세대는허용. |
| R32C-04 | model157–162 및 새test207. hide-approved가approve에먼저매칭green, publishgreen(승인G1 HTML573은info). | hide-approved/fail/reject/delete/deactivate danger;sign-in/route neutral;실제approve/reapprove만green;publishinfo. 신규기대값을정본으로바로잡고교차조건회귀추가. |
| R32C-05 | CSS/table rendering. row59/541.5px,date130×34,usercol161.5625px,표자체accessible name0. | normal/긴row40,날짜132×34,열130/140/100/160/detailrest,표자체이름. fulltext/title/접근성을보존하고linewrap행팽창방지. |
| R32C-06 | runner115/178/185/374. unknowncase실제RC0/PASS,검문누락·초기화finally밖·정리전PASS·포괄오류제외·network/font누락. 역할1/키보드click/oldsuccess만검사,행동실측없이PASS보고. | strictCLI/ownedURL,초기화부터finally정리,완전한8신규/2회귀,raw오류/행동실측/assertion/캡처manifest,cleanup뒤truthfulPASS. 누락·실패를누락한회신금지. |

## 4. 수정 경계 / 새 착수 baseline

**수정 허용은 다음5기존파일뿐. 신규/삭제/rename0, 각각30,000bytes 이하 유지.**

| 허용 파일 | 현재 bytes | 전체 SHA-256 |
|---|---:|---|
{hash_table}

원9파일 중 다음4는 이미 통합된 제출 상태 그대로 보호한다. 나머지 baseline의 모든 파일도 보호하며 총333파일 불변이다.

| 보호된 이전 통합 파일 | bytes | 전체 SHA-256 |
|---|---:|---|
{frozen_table}

전체 baseline: `{CORRECTION/'baseline.json'}` — {bm['bytes']}bytes / SHA-256 `{bm['sha256']}`. productFiles338(수신manifest329+기존양식샘플9), protectedFiles333, canonical14(TODO·current-state는 Sol 종결후새값). editableExisting5, 신규허용0. 원 baseline은 이력이며 현재 착수에는 사용하지 않는다.

예상 초기 `git status --short --untracked-files=all`:

```text
{status_text}
```

main/src/shared/기존시험/package*.json/tsconfig*/scripts/lib/ui-check.mjs/기존login·shell·home runner·전역CSS·빌드설정은 읽기 전용. `C:\\Projects\\Active\\ShiftMgmt_V3.4` 전체 읽기 전용. Control의 TODO/AGENTS/PROTOCOL/GEMINI/CLAUDE/07/정본/.ai/Log 전부 보호, HANDOFF 회신만 허용. build/Chrome의 ignored 산출물만 기존 artifacts/dist 경로에 생성할 수 있고, 소스나 기존 captures를 덮어쓰지 않는다.

### 정본 및 호출 계약 — 읽기 전용

- Control `05-screen-spec.md`§8: 관리자 전용 최신순 활동기록/사용자·기간·동작필터.
- `11-디자인-요청서.md`, `12-능력-매트릭스.md`§4.5: admin만 G1/G2 동작. 역할은 계단식이 아니다.
- `시안/2026-09-02-2차HTML/12-access-logs-1.html`#state-g1/#state-g2.573행 schedule-publish는badge-info다. 토큰/수치는 `시안/2026-09-06-최종정리/05-디자인-시스템-확정본-v1.3.md` 우선.
- `src/shared/bridge/contracts.ts`: listAccessLogs(query?)의optional dateFrom/dateTo/loginId/actionType/keyword, BridgeResult<AccessLogRecord[]>;별도paginationtotal계약없음. `src/shared/domain/access-log.ts` 옵션·actionLabel 사용.
- `src/main/services/access-log-service.ts`: ISO저장날짜부분 inclusive/filter/login exact/latestDESC 유지;프런트시간대변환으로검색의미변경0.
- `src/main/http/route-registry.ts` existing requireRoleSession admin guard 유지. 화면숨김은보조이며 서버검증은실제cookie로.
- `src/web/screens/shell.ts`: 기존 mount/destroy/session/logout 수명계약 유지. 공통 runner와 `.ai/reports/phase3-1d-review-20260930_165922/start-test-server.mjs`는 읽기 전용참고.

{base_contract}

## 6. 이번 CORRECT의 Sol 코드 전략 — 순서대로

1. **R32C-01/02 screen 상태전이**: 중앙에 timer 취소/세대무효/invalid·pending 렌더링 수명 동작을 작게 묶는다. keyword input에서 값저장 직후 loadGeneration을 증가시켜 old 권한/성공/오류/finally를 무효화하고 stable filter DOM/focus/caret 유지.250ms timer는 실행 전에 자기참조를null로 하고 생성시세대와destroyed를 대조한다. debounce 대기중도 rows/count가이전query성공으로보이지않게 role=status 상태를정합하게갱신하고 현재처리owner를명확히관리한다.
2. 모든 즉시query행동(date/select/reset/refresh/retry)은 pending debounce를 취소하고 immutable currentquery로1회만 시작한다. refresh가 debouncing 상태에서도 즉시실행가능해야하므로 debounce대기와 actualrequest pending native lock을구분한다. 단순 `if(isSubmitting)return`을 loadData 전체에 넣어 유효필터변경의 새세대를막지 않는다. old finally는현재잠금/로딩을해제할수없다. 유효한수동request와필터변경의수명은각세대가소유한다.
3. 날짜invalid 분기에서 timer·old세대무효, isLoading/isSubmitting false, visible rows/count/alerts/filterlocks를모두현재invalid조건으로렌더링. renderBody의validation분기를실제로호출한다. G2성공빈배열로위장0. 경계없는날짜는omit하고존재하지않는날짜는model검증으로거부;native dateinput이불가능날짜를빈값으로바꾸는점은실제DOM값·modelraw검증을구분한다.
4. **R32C-03** renderAlerts의두retry에 handlerguard와현재pending native disabled를적용. 경고가재렌더돼도동일pending동작은반복되지않아야한다. 현재선택loginId는list/users각실패와옵션재구성에서유지(서버에서없어진경우에도선택을조용히all로바꾸지말고표시). 기존병렬결과/실패분리·usersLoaded 정책유지. 현재방식에서users retry가logs도읽는다면단한쌍으로제한하고회신에정확한requestcount기록.
5. **R32C-04** actionbadge는explicit danger/approval 분류로 precedence를닫는다. danger먼저또는중첩하지않는exact 집합. shared액션계약을변경하지않는다. sign-in/route neutral,hide-approved danger,publishinfo가한test에서서로구별되어야한다. 새 model시험의publish기대값207을canonblue로정정하고hide-approved/substr충돌회귀를추가;기존protected시험은수정0.
6. **R32C-05** native table자체 aria-label또는caption 제공. 고정열구조+table layout/col widths를 screen/CSS 범위에서닫고해당열바운딩박스로실측. timestamp/user/login/action/detail은40px한줄에표시하되원문·title·접근가능텍스트보존. horizontal scroll/ellipsis는시각표시만;원본데이터slice삭제/문자열자르기0. nowrap/lineheight/box-sizing을적정조합하고기존긴detailtitle을보존. 날짜width132,height34,outline2px 유지. 모델format invalidtimestamp 안전원문도동일접근보장. 스타일전체재작성0.
7. **R32C-06 CLI/프로세스**: public인수는기존 `--case=<10enum>`만,생략시live-admin. unknown/empty/duplicatecase/추가flag/URL인수는temp/artifact/spawn/network전에RC비0거부.임의explicitUrl지원제거. fixed root `http://127.0.0.1:18741/`만검문하고자기소유서버와대응. constructor/mkdtemp부터start/bootstrap/Chrome launch/case실행/서버exit/temp삭제까지외부try/finally로둘러싼다. 서버가18741을소유하지못하면다른PID에health/sign-in/종료하지않는다. start.exit와readiness상한,windowsHide:true,소유PID·real os.tmpdir immediatechild·prefix 검증을유지. kill/exitlistener race와경계검증실패는별도로실패기록.
8. **공통 정상 실행기 재사용**: 정상/live/fixture/role는보호된 `runScreenCheck`,검문 `validateTargetUrl`,font `waitForFontsReady`,설치 `findChrome` 사용. 공통runner는치명적실패에process.exit를사용하므로 **outer owner가동일파일의별도child worker로실행해childexit에도외부finally가server/temp를정리**한다. 내부worker는외부publicCLI의우회flag로열지말고owner가준고정URL·ownedtemp/명확한내부모드만사용;무검문외부URL수용0. 기존regression도별도child를실행하고exit/stdout/stderr/manifest를보존. timeout≤15초/조건wait 사용,임의sleep으로흐름을추정하지않는다.
9. **음성 실행기**: actual401/session과지정networkabort는같은5파일내runner의별도완전계측Chrome driver로만수행. 보호된공통도구검문/health/font/Chrome재사용, raw console/pageerror/requestfailed/HTTP/CSP를각수집. 정확한API경로·phase·status·횟수로expected오류와차이를분류하고예상외0;401/403문자열포괄제외/HTTP200재작성/서버authmock금지. authcookie/암호는private memory와temp bootstrap에서만사용하며stdout/JSON/캡처금지.
10. **정직한 산출물/회신**:각동작마다 input/action/expected/actual/requestcount/PASS 또는FAIL/캡처경로를고유ignoredrunDir의action-assertions.json에저장.8case시나리오의assertion누락을PASS로치지않는다. raw오류목록·브라우저/URL/viewport/font검증·실행시각·manifest·첫실패출력·cleanup결과를연결. PASS는해당실행의모든검사와Chrome/서버/temp정리가끝난뒤에만최종owner가발행. 공통worker의UI PASS는종합수용이아닌부분결과이며owner result에서그차이를명시. 실제캡처파일존재검증, session-expired-login/redirect처럼잘못된이름을회신하지않는다. 실패시nonzero+FAILmanifest,cleanup실패도원실패와동시보존.

## 7. 착수 전 확인 — 불일치면 수정 없이 BLOCKED

1. repository/main/full HEAD와위9줄status 일치. 모든5허용파일은현재존재해야하고byte/hash표일치. 새파일불필요.
2. baseline.json bytes/fullhash,product338/metadata/보호333/canonical14를대조한다. TODO/current-state는이패킷의새기준;기존종결전hash를요구하지않는다.
3. R32C-01~06 모두원실패를확인하고최소5파일전략으로가능한지판단. 공통runner/API/DB/새sourcefile변경이필요하면먼저BLOCKED로exact경로/이유/대안을회신한다.
4. 원제출물전체재생성·format·staging/commit/reset하지않는다. 제품/Control비밀을명령출력에남기지않는다.

## 8. 검증 계획 / 성공 조건

### 8.1 정적·빌드·관련·전체시험 — 제품 저장소에서 순서대로

| 명령 | 기대 |
|---|---|
| `npm run typecheck` | RC0 |
| `node --check scripts/ui-checks/access-history.mjs` | RC0 |
| `npm run lint` | RC0,신규오류/경고0,기존5경고공개 |
| `npm run validate:map` | RC0,기존87경로 유지 |
| `npm run build` | RC0,CSS dist/browser/web·indexlink/font/CSP 정상 |
| `npx vitest run src/web/screens/access-history-model.test.ts src/main/services/access-log-service.test.ts src/main/http/route-registry.test.ts --maxWorkers=1 --minWorkers=1` | RC0,관련기존11시험 유지+의미있는badge회귀,skip/fail0,실제개수기록 |
| `npm test` | RC0,133파일/919시험 이상 유지+추가실제집계,fail/skip0.신규scope밖시험수정0 |
| `git -c safe.directory=C:/Projects/Active/ShiftMgmt_V4 diff --check` | RC0;untracked5file후행공백/EOF여분별도검사 |

### 8.2 실제 Chrome10case — 각각 명령/RC/원출력/실측/캡처

각case를 `node scripts/ui-checks/access-history.mjs --case=CASE`로별도실행. 각실행자기소유fresh `os.tmpdir()/shiftmgmt-gemini-32-*`,port18741,1440×900,Chrome/font준비,기존SHIFTMGMT_*제거후명시ownedenv 설정. 무권한/만료거부는실제servercookie,UI상태fixture는fixture로명시.역할planner/reviewer bootstrap이없으면기존admin `saveOperationUser`로격리계정생성;directSQL0.

| CASE | 반드시 실제로 검사할 동작·값 |
|---|---|
| live-admin | real sign-in/L4→활동→real list/users와행/count/순서대조→refresh1회/pendingdouble0→홈/재진입→logout. fixture0,필요audit는existing authenticated recordAccessLog로시험임을표시. |
| list-fixture |8대표액션(approve/reapprove/hide-approved/publish/sign-in/route/reject/info)G1색/font/table역할name/th/5열/normal40px/날짜132×34/130·140·100·160수치.201record응답ID/순서/전체N=201보존,처음200→more201/남은0.긴텍스트/invalidtimestamp/특수HTML 원문title·40px·XSS실행0.|
| empty-fixture |successful[]만G2,loading/error는G2아님.600/radius8/padding48×24/title18/700/font실측.5필터접근유지→pastdates→reset/currentdefaultquery1회/debounce0/capture. |
| filters | HTTP query body dateFrom/dateTo/loginId/actionType/trimkeyword정확.연속keyword250ms latest1회,keyword후refresh/date/select/reset timer중복0.두날짜를모두설정한역전·model불가능일·빈경계 각각실제값확인. invalid에서click/Space/Enter/formEnter requests0,DOMdisabled=false/aria=true/actualTabfocus/outline2px.실제requestpending native disabled/refreshdouble0. |
| errors |list HTTP200BridgeFailure/networkthrow별도alert/retry/G2위장0/오류문자열XSS0. usersfail+listok분리/선택loginId유지/usersretryheld두click추가0/실제requestcount.처리중disable/finally새owner보호.指定networkabort의raw오류만정확히expected분류.|
| stale-response |heldold success/error/auth 각query변경후 **250ms timer발화전** release에도화면/권한불변.새query성공뒤old release불변.별도old finally가newpending을해제0. keyword→manualrefresh1회.홈/placeholder/logoutdestroy→oldrelease/activityDOM0/debounce0. currentAUTH전환은1회.각request/releasehandler완료를boundedwait하고unroute는완료뒤. |
| role-guard |realoperator/planner/reviewer 각login세션 menu0/auto list·users0/direct cookie API AUTH_FORBIDDEN/data없음,admin허용.인증fixture0. |
| session-expired |realadmincookie를별도APIRequestContext로전달하고signOut을실행해 **서버세션무효화**→UI refresh→actual401/AUTH_SESSION_REQUIRED→login1/activityDOM0.별도무cookie directlist실제거부/data0.같은page signOut을별도context라고보고0,TTL경과주장0,expected401정확channel/count기록.|
| regression-shell |같은ownedenv/bootstrap/URL로기존 `node scripts/ui-checks/shell.mjs http://127.0.0.1:18741/` childRC0.기존소스/기대값수정0.|
| regression-home |같은ownedenv/bootstrap/URL로기존 `node scripts/ui-checks/home.mjs http://127.0.0.1:18741/ --case=live-admin` childRC0.기존소스/기대값수정0.|

### 8.3 必須 CLI 음성 게이트 / 범위 / 정리

- `node scripts/ui-checks/access-history.mjs --case=sol-unknown-case`: RC비0,unknown설명,시나리오PASS0,temp/artifact/spawn/network0.수정전falsePASS원출력은보존.
- `node scripts/ui-checks/access-history.mjs --case=` 및 duplicatecase/추가flag/임의URL/localhostURL/외부URL문자열각거부. URL문자열은preflight만하며실제foreignnetwork접근0. 거절시점과자원생성0의근거기록.
- startup/Chrome초기화/시나리오/정리실패모두outerfinally도달·RC비0·truthfulFAIL. 이미있는다른포트/PID서버를조회/종료하지않는다. controlled ownedstartup실패에서exit/temp정리도확인하고테스트목적때문에public검문우회옵션을추가하지않는다.
- capture/manifest/action-assertions실제파일존재/경로일치·실행시각·첫실패+최종증거보존. `tempCleaned:true`는실제realpath경계/exit/삭제완료후만쓴다.기존거부temp `shiftmgmt-sol-31d-2Kh5fr`등historicaltemp건드리지않는다.
- currentgitfile집합338/status9/HEAD불변,허용5만새baseline에서변경,protected333/canonical14 SHA·bytes불변.각변경5≤30k/new/delete/rename/deps0.전체diff원문·9현재크기/sha·생성물/temp/Chrome/childexit 결과기록.원4통합파일보호유지.

위 R32C-01~06/원R32-01~09/경계/10case/full시험/음성CLI/정리가모두충족돼야 IMPLEMENTED. 불충족시FAILED 또는환경/설계경계BLOCKED로회신한다. 고친한결함만보고다른게이트생략0.

## 9. 즉시 중단 조건

새baseline/status/HEAD/hash불일치,5파일외변경/새파일/새dependency/DB/API/auth변경필요,30k상한내검증불가,실제Chrome/서버cookie/필수음성검사불가,보호시험완화/오류숨김/foreign서버이용으로만통과가능하면수정없이BLOCKED. 진행중범위이탈은즉시중단하고원실패/현재diff/필요exact경로/선택지를Sol에돌린다. 재설계/최종수용은Sol이한다.

## 회신

판정: IMPLEMENTED | BLOCKED | FAILED
기준: repository / main / full baseline commit / final commit 없음
초기 상태: 위9dirty/338files/허용5hash/보호333/canonical14/착수게이트 결과
변경 파일: exact경로 / R32C-ID / 최소변경목적
범위 밖 변경: 0 | exact경로/원인
결함 대조: R32C-01~06 각각 원인 -> 변경심볼/위치 -> 재현명령 -> expected/actual/requestcount -> PASS/FAIL/BLOCKED
원 요구사항 대조: R32-01~09 구현/행동근거,누락0
검증: exact명령 / 시작·종료시각 / RC / raw log경로 / files/tests/skip/fail/기존경고
Chrome10case: URL / real 또는fixture / actual동작·DOM측정·요청수 / assertion·rawerror·manifest·capture실제경로
음성CLI/초기화실패: expected拒否 / actualRC / 자원·network0 또는ownedcleanup 근거
최초실패와 수정: 원실패로그 / 변경원인 / 최종결과,숨긴실패0
전체diff/生成물/의존성: 추가·삭제 / 보호333·정본14대조 / dist·고유artifacts / HEAD·최종status9
전체 SHA-256: current9파일 each bytes/full64hash;허용5변경 vs 보호4동일
정리: Chrome/context/ownserverPID exit/temp realpath·삭제완료,실패면원실패와동시기록
미해결/가정: 없음 | exact목록
TODO 제안: 구현제출/수용대기만;수용·최종완료·사용자확인추정0
'''
# Normalize occasional non-Korean template labels before publishing.
packet = packet.replace('指定networkabort','지정 network abort').replace('必須','필수').replace('expected拒否','expected 거부').replace('生成물','생성물')
(CORRECTION/'handoff-draft.md').write_text(packet,encoding='utf-8')
assert all(i in packet for i in [f'R32C-0{n}' for n in range(1,7)])
assert packet.count('\n## 회신\n') == 1
assert product_state() == files
assert git('status','--short','--untracked-files=all').splitlines() == status
for p,v in canonical.items():
    assert meta(CONTROL/p) == v,p
packet_bytes = packet.encode('utf-8')
(CONTROL/'HANDOFF.md').write_bytes(packet_bytes)
outgoing = CONTROL/'Log'/f'{STAMP}_3-2b-Sol-CORRECT1_발송본.md'
write_once(outgoing,packet_bytes)
evidence = {
 'time':TIME,'verdict':'CORRECT_1','received':received,'transitionArchive':str(transition),
 'closeout':str(closeout),'closeoutMetadata':meta(closeout),'productHEAD':HEAD,'productStatus':status,
 'sourceChangesBySol':0,'product338Unchanged':product_state()==files,'protected320BeforeTransitionUnchanged':True,
 'canonical13BeforeTransitionUnchanged':True,'static':read_json(REVIEW/'static-results.json'),
 'independentFocusedTests':{'files':3,'passed':11,'failed':0,'skipped':0},
 'fullTests':{'status':'GEMINI_SELF_REPORTED_NOT_INDEPENDENTLY_RERUN','reportedFiles':133,'reportedTests':919},
 'chromeProbes':probes,'providedUnknownCase':read_json(REVIEW/'supplied-unknown-case.json'),
 'browserClosed':True,'mcpBrowserClosed':True,'ownedServerCleanup':cleanup,
 'firstPassCleanup':read_json(REVIEW/'server-cleanup.json.first-pass'),
 'firstPassPreconditionErrorsExcluded':['equal_dates_not_invalid','missing_role_bootstrap'],
 'correctionBaseline':str(CORRECTION/'baseline.json'),'correctionBaselineMetadata':bm,
 'correctionAllowed':ALLOW,'correctionProtected':333,'correctionCanonical':14,
 'outgoing':str(outgoing),'handoffMetadata':meta(CONTROL/'HANDOFF.md'),
 'handoffArchiveIdentical':(CONTROL/'HANDOFF.md').read_bytes()==outgoing.read_bytes(),
 'todoChangedOnlyAfterCloseout':True,'accepted':False,'commitPushDeployment':False,
}
write_json(REVIEW/'final-evidence.json',evidence)
write_json(CORRECTION/'dispatch.json',{
 'time':TIME,'action':'CORRECT','defects':[f'R32C-0{i}' for i in range(1,7)],
 'handoff':str(CONTROL/'HANDOFF.md'),'archive':str(outgoing),'handoffMetadata':meta(outgoing),
 'baseline':str(CORRECTION/'baseline.json'),'baselineMetadata':bm,
 'productHEAD':HEAD,'productStatus':status,'productFiles':338,'editableFiles':5,'protectedFiles':333,
 'canonicalFiles':14,'sourceChangesBySol':0,'reviewEvidence':str(REVIEW/'final-evidence.json'),
 'newImplementationStatus':'CORRECTION_NOT_STARTED','manualUserRelay':True,
})
write_json(CONTROL/'.ai/reports/phase3-2-latest-review.json',{
 'reviewDirectory':str(REVIEW),'evidence':str(REVIEW/'final-evidence.json'),
 'correctionDirectory':str(CORRECTION),'verdict':'CORRECT_1','time':TIME,
})
print(json.dumps({'verdict':'CORRECT_1','packetBytes':len(packet_bytes),'packetSHA256':sha(packet_bytes),
 'baselineBytes':bm['bytes'],'baselineSHA256':bm['sha256'],'correctionDirectory':str(CORRECTION),
 'protected':333,'canonical':14,'productChangesBySol':0,'outgoing':str(outgoing)},ensure_ascii=False))
