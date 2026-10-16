import datetime
import hashlib
import json
import pathlib
import re
import subprocess

CONTROL = pathlib.Path(r'C:/Projects/Active/교대근무관리 시스템')
REPO = pathlib.Path(r'C:/Projects/Active/ShiftMgmt_V4')
OUT = CONTROL / '.ai/reports/verification-3-1c-20260930'
EXPECTED_HEAD = '2d97d9bb3dc649f8c40c0d1d0cfc9fdeae0df283'
EXPECTED_STATUS = '8D4954EE16CAAFDFD5B908D58E42CAF962316D539AAA3DB742DD3B366982D08B'
RECEIVED_SHA = '43C1DC3973B516001C45150F754536922164AE297EF6F479C3AFD86B77C944C9'
ALLOW = {'src/web/screens/home.ts', 'scripts/ui-checks/home.mjs'}

def sha(data):
    return hashlib.sha256(data).hexdigest().upper()

def file_sha(path):
    return sha(path.read_bytes()) if path.is_file() else 'ABSENT'

def git(*args):
    return subprocess.check_output(['git', '-c', 'safe.directory=C:/Projects/Active/ShiftMgmt_V4', '-c', 'core.quotepath=false', *args], cwd=REPO).decode('utf-8').rstrip('\r\n')

def encoded(text):
    return text.replace('\r\n', '\n').replace('\n', '\r\n').encode('utf-8')

def create_new(path, data):
    with path.open('xb') as stream:
        stream.write(data)
    assert path.read_bytes() == data
    return {'path': path.relative_to(CONTROL).as_posix(), 'bytes': len(data), 'sha256': sha(data)}

def preserve_write(path, text):
    before = path.read_bytes()
    bom = b'\xef\xbb\xbf' if before.startswith(b'\xef\xbb\xbf') else b''
    eol = '\r\n' if b'\r\n' in before else '\n'
    path.write_bytes(bom + text.replace('\r\n', '\n').replace('\n', eol).encode('utf-8'))

received = (CONTROL / 'HANDOFF.md').read_bytes()
assert len(received) == 43342 and sha(received) == RECEIVED_SHA
archive = CONTROL / 'Log/20260930_113233_3-1c-Gemini-IMPLEMENTED_수신원본.md'
assert archive.read_bytes() == received
assert git('rev-parse', 'HEAD') == EXPECTED_HEAD
assert git('branch', '--show-current') == 'main'
status = git('status', '--short', '--untracked-files=all').splitlines()
assert len(status) == 92 and sha('\n'.join(status).encode()) == EXPECTED_STATUS
rows = [(line, file_sha(REPO / line[3:])) for line in status]
scope = json.loads((OUT / 'scope-evidence.json').read_text(encoding='utf-8'))
browser = json.loads((OUT / 'browser-reproduction.json').read_text(encoding='utf-8'))
assert scope['protected_count'] == 84 and not scope['protected_mismatch']
assert all(item['match'] for item in scope['source_docs'])
assert len(scope['missing_failures']) == 6
assert len(browser['results']) == 7 and all(item['violatedRequirement'] for item in browser['results'])
assert browser['backendAuthVerified'] is False and browser['sourceProductWrites'] == 0
request = received.decode('utf-8-sig').replace('\r\n', '\n')
retained_requirements = request.split('## 4. 요구사항\n', 1)[1].split('## 5. Sol 코드 전략', 1)[0].strip()
retained_negatives = request.split('### 8.2 음성 시험\n', 1)[1].split('### 8.3 UI·회귀', 1)[0].strip()
fixed_controls = ['AGENTS.md', '.ai/HARNESS.md', 'PROTOCOL.md', 'GEMINI.md', 'CLAUDE.md', '07-invariants-and-pitfalls.md', '.ai/harness.yaml']
fixed_hashes = {name: file_sha(CONTROL / name) for name in fixed_controls}
now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)))
stamp = now.strftime('%Y%m%d_%H%M%S')
time_label = now.strftime('%Y-%m-%d %H:%M:%S KST')
assessment_path = CONTROL / f'Log/{stamp}_3-1c-Sol-CORRECT_검증본.md'
closed_path = CONTROL / f'Log/{stamp}_3-1c-Sol-CORRECT_회신종결본.md'
outgoing_path = CONTROL / f'Log/{stamp}_3-1c-Sol-CORRECT1_발송본.md'
failed_manifest_lines = '\n'.join('- `' + item['path'] + '` — FAIL, 최초 회신에 누락.' for item in scope['missing_failures'])

defects = '''| ID | 심각도·원래 기준 | 소스 원인 / 독립 재현 | 수정 후 기대 |
|---|---|---|---|
| R31C-01 | P1 · R2/R7, N6 | `home.ts:186–203`: 직원 조회 일반 실패를 건너뛰고 빈 map으로 준비 집계. `employees-fail`: active 근무지 1 + 유효 패턴에서 직원 조회 실패인데 정상 `0/1` 표시 | 준비 집계 미확인·오류; 알려진 다른 섹션 유지; 성공 새로고침 후 오류 해제 |
| R31C-02 | P1 · R3/R7, N6 | `home.ts:169–175,214–221`: sites 실패 뒤 빈 activeSites로 운영 집계. `sites-fail`: 당월 일치 schedule/export가 있으면 정상 `2/2` 표시 | sites/schedules/exports 모두 성공해야 운영 집계; sites 실패 시 비율 없이 미확인·오류 |
| R31C-03 | P2 · R6/R7, N6/N10 | `home.ts:164–166,615–618`: sync/recovery/watch 실패를 null로 숨기고 H4 성공 조건에서 제외. 3개 독립 실패 모두 “이번 달 처리할 일이 없습니다” | 해당 조회 오류를 명시, 알려진 할 일 유지, 필수 조회 성공 전 H4 금지; 비admin watch는 호출·필수조건에서 제외 |
| R31C-04 | P2 · R7, N9 | `home.ts:723–727,765–769`: 액션 응답에 destroyed/generation 검사 없음. retry/restart 각각 홈 destroy 뒤 늦은 AUTH 응답이 만료 callback 1회 호출 | 이탈·새로고침으로 오래된 액션의 AUTH/데이터/DOM 결과 무시; 살아 있는 액션 AUTH는 1회; busy 잠금·타이머도 수명 관리 |
| R31C-05 | 증거 게이트 · R9 | 최종 19 manifest는 실제 존재/PASS이나 같은 날 선행 FAIL 6건이 회신에서 누락 | 최초 실패 포함 실행 전수: 원인→수정 위치→재실행→최종 manifest; 기존 실패 증거 불변 보존 |'''

assessment = f'''# Phase 3-1c — Sol 독립 검증 / CORRECT 1

- Time: {time_label}
- 판정: **CORRECT — Gemini 최초 IMPLEMENTED 미수용. Phase 3-1c 진행 중.**
- 검증 대상: V4 main / HEAD `{EXPECTED_HEAD}`; 수신본 43,342 bytes / SHA-256 `{RECEIVED_SHA}`.
- 수신 원문 보존: `{archive.relative_to(CONTROL).as_posix()}`. 원본과 바이트·SHA·크기 일치.
- 원래 발송 기준: `Log/20260929_171538_3-1c-Sol-IMPLEMENT_최종발송본.md`; 요청 본문 텍스트 동일.

## 1. 판정과 결함 전수

{defects}

## 2. 확인한 게이트와 한계

| 게이트 | Sol 실측 |
|---|---|
| 범위 | 초기 87 상태행 SHA 일치. 기존 허용 3파일 외 보호 84경로 SHA/부재 전건 일치. 신규 5경로 정확히 일치. 현재 92경로 SHA `{EXPECTED_STATUS}` |
| 정본 | 능력/요청/화면설계/디자인 시스템/승인 home 시안 2개, 총 6개 SHA 일치 |
| 제출 파일 | 기존 3 + 신규 5, 총 8파일 실제 SHA가 Gemini 회신과 일치 |
| 정적 | `node --check scripts/ui-checks/home.mjs` 독립 실행 종료 0. typecheck/lint/map/build는 이번 Sol 검증에서 재실행하지 않음: UNVERIFIED |
| 관련·전체 시험 | Gemini 보고 12 단위 시험 / 132파일·912시험. Sol 이번 턴 재실행하지 않음: UNVERIFIED |
| 음성·UI | 실제 설치 Chrome {browser['chromeVersion']}, 1440×900. HomeScreen + 실제 browser bridge, HTTP 응답 fixture 7조건에서 위 결함 재현. console/pageerror 0. 재현 도구 종료 0은 결함 재현 성공이며 수용 PASS가 아님 |
| 실제 인증·회귀 | 이번 독립 probe는 생성한 관리자 session을 사용. 서버 인증·실제 로그인 및 기존 13 회귀를 독립 검증하지 않음: UNVERIFIED. Gemini 최종 19 manifest 존재/PASS는 파일 실측 |
| 증거 완전성 | FAIL 6건 누락: FAIL. 첫 probe의 schedule 필드 오타를 `scheduleMonth`로 바로잡아 다시 실행; 초기 JSON/캡처도 보존 |
| 제품 변경 | Sol 제품 소스 수정 0. 검증 생성물은 제어 프로젝트 `.ai/reports/verification-3-1c-20260930/`에만 생성 |

음성 필수 게이트에서 실제 실패를 재현했으므로 이번 제출은 수용할 수 없다. 전체 시험의 Gemini PASS 보고로 이 결함을 상쇄하지 않는다. 수정 회신 후 정적·관련/전체 시험·실제 로그인/역할·UI 게이트를 다시 독립 검증한다.

## 3. 재현 자료

- `.ai/reports/verification-3-1c-20260930/scope-evidence.json`: 보호 파일/정본/manifest 실측.
- `.ai/reports/verification-3-1c-20260930/browser-reproduction.json`: 최종 7조건 실제 관찰.
- `.ai/reports/verification-3-1c-20260930/run-home-review.mjs`, `probe-entry.ts`: 소스 조사 probe. 제품 회귀 검사 대체 아님.
- Chrome 캡처: `employees-fail.png`, `sites-fail.png`, `sync-fail.png`, `recovery-fail.png`, `watch-fail.png`, `late-retry-auth.png`, `late-watch-auth.png` (같은 보고 폴더).
- 첫 probe 자료: `browser-reproduction-initial.json`, `sites-fail-initial.png` 불변 보존.

## 4. 누락된 선행 실패 manifest

아래 경로는 제품 저장소 상대경로다. 비밀·계정·원본 데이터 경로를 보고에 복제하지 않는다.

{failed_manifest_lines}

## 5. 종결 상태와 다음 순서

최초 IMPLEMENTED 제출의 검증은 CORRECT로 반환한다. 작업 자체는 미완료다. Sol은 한 개의 통합 CORRECT1을 작성하고, 사용자가 수동 전달하면 Gemini가 닫힌 2파일 범위만 수정한다. 같은 결함 유형의 수정 제출은 최대 2회; 재실패 한계에서 원인/전략을 재계획한다.

사용자가 승인한 순서: **3-1c 수정 회신 수용 → 설치본/plan.json 전체 백업 → 고정 SHA의 하네스 5.1 적용 → 프로젝트 연결 문서 갱신**. 현재 로컬 하네스 3.0은 그대로다. 공개 v5.1.0 `8ebab0087b228c0203a202bead8fb56853d9cb27`와 프로젝트 Sol/Gemini 운영 규칙을 혼동하지 않는다.
'''

# The original target is assessed and archived before any TODO status change.
records = [create_new(assessment_path, encoded(assessment))]
assessment_link = assessment_path.relative_to(CONTROL).as_posix()
closed = received + encoded('\n\n### Sol 독립 검증 — CORRECT / 2026-09-30\n\n' + assessment)
(CONTROL / 'HANDOFF.md').write_bytes(closed)
records.append(create_new(closed_path, closed))
assert (CONTROL / 'HANDOFF.md').read_bytes() == closed_path.read_bytes()

todo_path = CONTROL / 'TODO.md'
todo = todo_path.read_text(encoding='utf-8-sig')
todo = todo.replace('> 최종 갱신: 2026-09-29 ·', '> 최종 갱신: 2026-09-30 ·', 1)
lines = todo.splitlines()
position_found = next_found = confirmation_found = task_found = False
for index, line in enumerate(lines):
    if line.startswith('> **현재 정본(2026-09-29)**:'):
        lines[index] = f'> **현재 정본(2026-09-30)**: Phase 1·2·2.5 종결, Phase 3-0·3-1a·3-1b ACCEPTED. **3-1c 최초 Gemini IMPLEMENTED는 Sol 독립 검증 CORRECT(미수용)**: 직원/근무지 조회 실패의 정상 비율, sync/recovery/watch 실패의 가짜 H4, 홈 이탈 뒤 늦은 액션 AUTH를 실제 Chrome 7조건에서 재현. 결함 R31C-01~04와 누락된 선행 FAIL 6건 R31C-05를 통합 CORRECT1으로 반환한다. 보호 84경로/정본 6개 일치; 현재 V4 `{EXPECTED_HEAD}`, 92경로 status SHA `{EXPECTED_STATUS}`. 제품 수정은 Gemini가 `home.ts`·`home.mjs` 2파일만 수행. 하네스 5.1 공개는 완료, 로컬 적용은 사용자 승인 순서에 따라 3-1c 수정 회신 수용 뒤 진행. 검증 정본 `{assessment_link}`; 활성 요청 `HANDOFF.md`.'
        lines.insert(index + 1, '> 아래 기록은 이전 상태의 진행 이력이다.')
        break
for index, line in enumerate(lines):
    if line.startswith('| **지금 위치** |'):
        marker = '아래는 과거 진행 이력:'
        history = line.split(marker, 1)[1] if marker in line else ''
        lines[index] = '| **지금 위치** | **Phase 3-1c CORRECT1 준비 완료(최초 구현 미수용, 2026-09-30).** 아래는 과거 진행 이력:' + history
        position_found = True
    elif line.startswith('| **다음 행동** |'):
        lines[index] = '| **다음 행동** | 사용자가 `HANDOFF.md` 통합 CORRECT1을 Gemini에 수동 전달 → Gemini 2파일 수정·전수 증거 회신 → Sol 독립 수용 검증. 통과 뒤 하네스 설치본/plan.json 백업·5.1 고정 SHA 적용·프로젝트 연결 문서 갱신. |'
        next_found = True
    elif line.startswith('| **현재 확인** |'):
        marker = '아래는 과거 확인 이력:'
        history = line.split(marker, 1)[1] if marker in line else ''
        lines[index] = '| **현재 확인** | 3-1c 보호 84경로·정본 6개 일치. Chrome 7조건에서 제품 결함 4건 재현, 선행 FAIL manifest 6건 누락. 전체 912시험/실제 인증 회귀는 이번 독립 검증 UNVERIFIED. 아래는 과거 확인 이력:' + history
        confirmation_found = True
    elif line.startswith('  - 🔄 3-1c.'):
        lines[index] = line.replace('Gemini 구현·회신 및 Sol 독립 검증 대기.', f'Gemini IMPLEMENTED 수신·원문 보존 뒤 Sol 독립 검증 **CORRECT1(미수용)**: R31C-01~04 제품 결함 4건, R31C-05 선행 FAIL 6건 누락. 실제 Chrome 7조건 재현, 보호 84경로·정본 6개 일치. 통합 2파일 수정 패킷 `HANDOFF.md` 준비, Gemini 수정·회신 대기. 검증 `{assessment_link}`.')
        task_found = True
assert all([position_found, next_found, confirmation_found, task_found])
assert '| R-16 |' not in '\n'.join(lines)
lines.append('| R-16 | 2026-09-30 | AI-Harness 문제 수정본을 GitHub v5.1로 공개하고 현재 프로젝트에 순서대로 적용 | GitHub v5.1.0 공개 완료. 3-1c 회신 검증에서 결함 발견, 통합 CORRECT1 준비. 수정 회신 수용 → 설치본/plan.json 백업 → 로컬 5.1 고정 SHA 적용 → 프로젝트 연결 문서 갱신; Sol/Gemini 역할 유지 | 🔄 |')
preserve_write(todo_path, '\n'.join(lines) + '\n')

state_path = CONTROL / '.ai/current-state.md'
state = state_path.read_text(encoding='utf-8-sig')
state = state.replace('Status: PHASE_2_6_GEMINI_CORRECTION_READY', 'Status: PHASE_3_1C_GEMINI_CORRECT1_READY', 1)
state_insert = f'''## Current authority and task (2026-09-30)

- Phase 3-1b remains ACCEPTED. Phase 3-1c first Gemini IMPLEMENTED submission is **CORRECT / not accepted**; consolidated CORRECT1 is ready in root `HANDOFF.md`.
- Independent Chrome {browser['chromeVersion']} / 1440×900 reproduced four product defects through seven HTTP response fixtures: employee-read error shown as 0/1; site-read error shown as 2/2; sync/recovery/admin-watch errors shown as H4; late recovery/restart AUTH after HomeScreen destruction invokes expired callback. Backend login/session regression is UNVERIFIED in this probe.
- Stable IDs R31C-01~04 require product changes; R31C-05 requires reporting six omitted prior FAIL manifests and complete attempt/fix chains.
- V4 main/HEAD `{EXPECTED_HEAD}`, 92 status paths SHA `{EXPECTED_STATUS}`. Previous protected 84 paths and six canonical documents match. Sol product source writes: 0.
- Correction allowlist: `src/web/screens/home.ts`, `scripts/ui-checks/home.mjs`; other 90 status paths protected. Gemini alone changes product code. User manually relays HANDOFF; Sol verifies and decides acceptance.
- Assessment: `{assessment_link}`. Exact received packet: `{archive.relative_to(CONTROL).as_posix()}` (43,342 bytes, SHA-256 `{RECEIVED_SHA}`).
- User-approved sequence: accept corrected 3-1c → back up installed harness including `.git` and `plan.json` → apply v5.1.0 at `8ebab0087b228c0203a202bead8fb56853d9cb27` → update project harness connection metadata while preserving project overlay roles. Local installed harness remains v3.0.0; project overlay remains v4.0.0. Publication of v5.1.0 already complete.
- Historical sections below describe earlier states; their status summaries do not override this dated entry.

'''
state = state.replace('## Operational Reset (2026-09-17 — current authority)', state_insert + '## Operational Reset (2026-09-17 — operating roles retained)', 1)
preserve_write(state_path, state)

docs = [
('12-능력-매트릭스.md', 'ED6D8ADC632C2D81A3CF60FDCF42BADA65A593369A3BA19562BF7B3E6F579794'),
('11-디자인-요청서.md', 'B683DC2C760845CA14482DB4135E9C6B72DE097E7872116129BF7FEF399F4F73'),
('10-화면설계-초안.md', 'DF99AF07C33F09DBE90410D255562891D73282132349ED8B35BC48156801CD08'),
('시안/2026-09-06-최종정리/05-디자인-시스템-확정본-v1.3.md', '0975102B82DFBCE518CAACDF94C79C84A5C7236BE4DCAA6728615192507535D4'),
('시안/2026-09-06-최종정리/스냅샷-1차-승인본/03-home-1.html', 'C8042DC8797E90123CAAE5ABCBD29B493017C18BF81C750A06ADA43CA25BD1BF'),
('시안/2026-09-06-최종정리/스냅샷-1차-승인본/03-home-2.html', 'A52EEB3627E7F224FF318909D711788A24D0341E2FC207EB41DC2C128EDFA259')]
for path, expected in docs:
    assert file_sha(CONTROL / path) == expected
canonical_rows = '\n'.join(f'| `{path}` | {(CONTROL / path).stat().st_size} | `{expected}` |' for path, expected in docs)
control_rows = '\n'.join(f'| `{path}` | `{file_sha(CONTROL / path)}` |' for path in fixed_controls + ['TODO.md', '.ai/current-state.md'])
baseline_block = '\n'.join(line + '\t' + digest for line, digest in rows)
new_cases = ['employees-error', 'sites-error', 'sync-error', 'recovery-error', 'watch-error', 'stale-retry-action', 'stale-watch-action']
home_cases = ['live-admin', 'operator-fixture', 'empty-fixture', 'loading-error', 'stale-response', 'admin-action'] + new_cases
case_literals = ','.join("'" + name + "'" for name in home_cases)
login_cases = ['flow', 'locked', 'recovery', 'session-error', 'post-change-null', 'post-change-error', 'post-change-race-success', 'post-change-race-null', 'post-change-race-error', 'post-change-race-login', 'post-change-first-held']
login_literals = ','.join("'" + name + "'" for name in login_cases)
packet = f'''# HANDOFF — Phase 3-1c Sol CORRECT1: 조회 실패·액션 수명·증거 보완

- Task: 실제 데이터 홈의 실패/이탈 처리를 원래 요구사항에 맞게 고치고 전체 실행 증거를 회신한다.
- Action: CORRECT
- Correction round: 1 / same defect class maximum 2
- From: Sol(xhigh, Codex) — orchestrator
- To: Gemini — implementation coder
- Time: {time_label}
- 회신: 필요
- Repository: C:\\Projects\\Active\\ShiftMgmt_V4
- Control workspace: C:\\Projects\\Active\\교대근무관리 시스템
- Branch: main
- Baseline commit: {EXPECTED_HEAD}
- Expected initial status: 92경로, §12 전체 SHA/부재. 상태행 LF 연결(마지막 LF 없음) SHA-256 `{EXPECTED_STATUS}`.

---

# 회신 요청

Gemini는 착수 기준/닫힌 2파일 범위/필수 검증이 충돌하면 **제품 파일 수정 없이 BLOCKED**를 맨 아래 보이는 `## 회신`에 기록한다. 구현·검증 뒤에도 그 칸에 전수 증거를 남긴다. 요청 본문은 고정이며 수동 전달은 사용자만 한다. 구현 완료 보고는 Sol 수용이 아니다.

## 1. 목표와 비목표

조회 실패를 정상 수치나 “할 일 없음”으로 표시하지 않고, 홈을 떠난 뒤 늦은 액션 응답이 새 화면의 세션/DOM을 바꾸지 않게 한다. 최초 구현의 R1~R9, 계산·API·권한·디자인 기준을 그대로 충족한다.

이번 범위는 오류 상태와 홈 액션 수명 및 검증 증거 보완이다. API/DB/계산 정의/권한 변경, 새 업무 화면·의존성·새 제품 파일, 하네스 업데이트, 광역 리팩터링, 커밋은 범위 밖이다. 하네스 적용은 Sol이 수정 회신 수용 후 진행한다.

## 2. 현재 상태와 Sol 독립 검증 결과

{defects}

전체 Sol 검증은 `{assessment_link}`에 불변 보존. 수신 원문 `{archive.relative_to(CONTROL).as_posix()}` 43,342 bytes / `{RECEIVED_SHA}`. 보호 84경로·정본 6개·제출 8파일 SHA 일치. 현재 92경로. 실제 Chrome {browser['chromeVersion']} / 1440×900, HTTP fixture 7조건에서 제품 결함 4건 재현; console/pageerror 0. 이 probe는 HomeScreen+실제 bridge를 쓰지만 생성한 session이므로 실제 서버 인증/로그인 검증은 아니다. 전체 912시험·type/lint/map/build·기존 13 인증 회귀는 이번 Sol 검증에서 재실행하지 않아 UNVERIFIED다. 최초 구현 회신의 최종 19 manifest PASS는 실측했으나 선행 FAIL 6건이 누락되었다. 최초 제출의 판정은 **CORRECT, 미수용**이며 3-1c 자체는 진행 중이다.

## 3. 정본과 현재 제품 호출점

정본 경로는 Control workspace 기준이다. 최초 요청의 API 의미와 계산 정의를 바꾸지 않는다.

| 정본 | bytes | SHA-256 |
|---|---|---|
{canonical_rows}

기존 호출점: `HomeScreen.loadData/renderContent/handleRetryRecovery/handleRestartWatch/destroy`, `window.appBridge`, `src/web/screens/home-model.ts`의 순수 집계. 브리지 계약 `src/shared/bridge/contracts.ts`, HTTP 조회 `src/main/http/routes/workforce-routes.ts` 읽기 전용. `listApprovedTargets`는 승인된 미계산 실적이므로 품의 미승인 건수가 아니다. 정산 최신 approval은 approvedAt DESC/id DESC, 일치 exportRecordId의 당월 출력과 3개 파일명으로 판단한다. 운영 published 출력은 같은 site/month의 어느 schedule ID든 해당 ID와 정확히 일치하면 완료한다.

## 4. 닫힌 수정 경계

| 허용 파일 | ID | 허용 변경 |
|---|---|---|
| `src/web/screens/home.ts` | R31C-01~04 · R2/R3/R6/R7 | 필수 조회 오류 상태·합계/H4 게이트·액션 응답/타이머 수명·중복 잠금 최소 hunk |
| `scripts/ui-checks/home.mjs` | R31C-01~05 · R9 | 기존 6 case 유지, §9 신규 7 case와 요청/DOM/수명 검증 및 전수 evidence |

현재 두 파일 모두 untracked다. 수정 전 격리 temp에 바이트 사본을 보존하고 **실제 pre→post unified diff**를 제출한다. 일반 `git diff`가 비어도 변경 없음이라고 보고하지 않는다. 사본 정리 또는 보존 정책을 기록한다.

표 외 모든 제품 파일은 보호된다. `home-model.ts`, `home-model.test.ts`, `home.css`, `shell.ts`, `index.html`, `copy-web-assets.mjs`, `login.ts`, `status-bar.ts`, 기존 helper/회귀 스크립트, `src/main/**`, `src/shared/**`, package/lockfile 포함. 92경로 중 나머지 90경로의 SHA/부재 불변; status에 없는 추적 파일도 변경 금지다. Git status 경로 집합·상태행은 그대로 92개여야 한다. 기존 사용자 변경 초기화 금지.

읽기 전용: `C:\\Projects\\Active\\ShiftMgmt_V3.4\\**`; Control workspace `TODO.md`, `AGENTS.md`, `PROTOCOL.md`, `CLAUDE.md`, `GEMINI.md`, `.ai/**`, `Log/**`. Gemini 제어 변경은 root HANDOFF의 `## 회신`만. 제품에서 ignored `dist/`·`artifacts/captures/`와 저장소 밖 격리 temp 검증 산출물은 허용하되 기존 증거 삭제/변경 금지. 비밀/원본 데이터 경로를 캡처·회신에 넣지 않는다.

## 5. 요구사항 — 기존 R1~R9 전부 유지

{retained_requirements}

### 5.1 수정 요구사항과 구현 위치

| ID | 입력/행동 | 정상·실패 결과 | 위치 |
|---|---|---|---|
| R31C-01 | active site의 listEmployees 일반 실패 | 준비 전체 비율은 미확인·섹션 오류, 가짜 0/1 금지; 다음 성공 refresh 정상 복원 | `home.ts:loadData`, `home.mjs:employees-error` |
| R31C-02 | sites 실패, schedules/exports 성공 | 운영 비율 미확인; overview 성공의 알려진 4 KPI 유지, 이름 경고 unknown | `home.ts:loadData`, `home.mjs:sites-error` |
| R31C-03 | sync/recovery/admin watch 각각 실패 | 세 조회 오류 상태를 구분하고 할 일 섹션에 안내, 알려진 행 유지; H4 금지; 성공 refresh 오류 해제 | `home.ts:loadData/renderContent`, `home.mjs` 오류 3 case |
| R31C-04 | retry/restart 반환 전 destroy 또는 refresh | 오래된 AUTH/성공/일반 오류/throw/타이머는 기존 DOM·새 화면·만료 callback 변경 0. 살아 있는 AUTH는 기존 경로 1회, 정상 성공 재조회, 빠른 중복 1회, 오류 뒤 재시도 가능 | `home.ts` 두 handler/destroy, `home.mjs:stale-retry-action/stale-watch-action` |
| R31C-05 | 최초 실패를 포함한 모든 실행 | 실행별 기대/관찰/원인→수정→재실행 연결과 최종 manifest; 누락된 과거 FAIL 6건도 설명, 파일 불변 | `home.mjs` 검증 + HANDOFF 회신 |

## 6. Sol 코드 전략 — 이 순서대로

1. **수정 전 보존/착수 실측**: §12 92상태행·각 SHA, 정본/제어 SHA, 실제 API/role 계약 확인. 두 untracked 허용 파일을 os.tmpdir() 바로 아래 고유 폴더에 정확한 바이트로 보존한다.
2. **준비/운영 전제조건**: active site 직원 응답 중 하나라도 일반 실패하면 준비 집계 호출을 하지 않고 prepData=null + 안전한 오류 안내. AUTH는 기존 만료 경로. 운영은 sitesRes/schedulesRes/exportsRes 모두 성공한 경우만 집계. 실패를 빈 배열/map으로 변환해 집계하지 않는다. 이미 성공한 다른 섹션은 표시한다.
3. **할 일 조회 오류**: sync/recovery/admin-watch의 성공·오류를 별도로 기록한다. H4는 관련 섹션과 해당 역할의 모든 필수 할 일 조회가 성공하고 실제 todos가 0일 때만. 실패 시 기존 오류 스타일/DOM 패턴을 재사용해 해당 상태를 확인할 수 없음을 표시한다. known todo는 유지한다. admin 이외 watch 조회 0, watch 성공 조건 요구 없음. refresh 시작/완료 상태 갱신에서 이전 오류가 남거나 잠깐 H4로 노출되지 않게 한다.
4. **액션 수명**: retry/restart 시작 때 owner/load generation과 액션 ticket을 캡처. await 뒤·catch·timeout에서 destroyed/owner/generation 유효성을 확인하기 전 AUTH/데이터/DOM 갱신하지 않는다. destroy에서 타이머/ticket 무효화. 살아 있는 AUTH는 기존 세션 만료 callback 1회로 전달한다. 기존 API 반환 계약을 유지한다.
5. **busy 소유권**: 진행 중 액션이 있으면 새로 렌더된 현재 버튼도 해당 잠금 상태를 반영한다. 오래된 응답은 결과를 버리되 `finally`에서 그 액션 ticket이 소유한 잠금은 정리한다. 홈이 아직 mount된 경우 현재 컨트롤의 잠금만 동기화하며 이전 button 참조를 변경하지 않는다. ticket 일치 확인 없이 새 액션 잠금을 풀지 않는다. refresh/destroy/catch/timeout/bridge 부재 뒤 영구 비활성·중복 호출을 만들지 않는다. 정상 성공은 잠금 정리 후 기존 관련 재조회, 일반 실패는 안전한 안내와 다시 시도 가능 상태.
6. **검증기**: 기존 runScreenCheck·격리 bootstrap·Playwright HTTP response fixture를 재사용. 실제 Chrome/실제 로그인 session·역할, `/api/<channel>` 경계만 통제. 제품에 fixture 넣기·HomeScreen private 메서드를 직접 불러 수용 검증하기 금지. 신규 7 case에서 API 요청수/실제 클릭·Tab/Enter/페이지 상태·늦은 응답·오류 복원을 검증. 기존 6 case 및 13 회귀 보존.
7. **최소 hunk/증거**: 기존 순수 집계/계산/UI 토큰을 바꾸지 않는다. 넓은 포맷·재생성 없이 바이트 사본과 실제 unified diff·전체 해시를 제출한다. §9 전수 실행의 최초 FAIL과 수정 연결을 기록한다.

## 7. 필수 불변조건과 과거 함정

`CLAUDE.md`·`07-invariants-and-pitfalls.md`: 가짜 UI/추정 수치/오류 숨김 0 fallback 금지. 월 배정 이력의 미공개 필드 사용 금지. 역할은 계단식이 아니며 operator/planner/reviewer/admin을 직접 구분한다. recovery retry 전 역할, watch 조회/restart admin만. 준비=근무지, 운영·정산=단계, 대기 실적=그룹/건. 비밀·비밀번호·토큰·원본 경로 노출 금지. 미구현 목적지 버튼 금지. 시험 약화/skip/가짜 SHA/선행 FAIL 생략 금지. 삭제 대신 기존 증거 보존. 실제 API·DB·계산·권한 불변.

## 8. 착수 게이트

한 항목이라도 충돌하면 제품 수정 없이 BLOCKED: 저장소/main/HEAD 일치; §12 status 92개와 전건 SHA/부재 일치; §3 정본 6개·§13 제어 SHA 일치; R31C-01~05가 모두 존재; 2파일 범위로 전략/검증 구현 가능; 실제 설치 Chrome/격리 temp/실제 로그인 환경 사용 가능. 추가 파일·새 API·계산/권한 결정 필요 시 솔에게 근거로 반환한다.

## 9. 검증 계획

### 9.1 명령 — 제품 저장소에서 순서대로

| 명령 | 종료/합격 |
|---|---|
| `node --check scripts/ui-checks/home.mjs` | 0 |
| `npx vitest run src/web/screens/home-model.test.ts --maxWorkers=1 --minWorkers=1` | 0, 기존 12개 전부 PASS |
| `npm run typecheck` | 0 |
| `npm run lint` | 0 errors, 기존 5 warnings에서 새 warning 0 |
| `npm run validate:map` | 0, 기존 82개 참조 |
| `npm test` | 0, 기존 132파일/912시험 전부 PASS, 축소/skip 없음 |
| `npm run build` | 0, WEB_ASSETS_OK, dist/browser/web/home.css 존재 |
| `git diff --check` 및 허용 untracked 2파일 whitespace 검사 | 0, 사본→현재 unified diff 별도 제출 |
| `git -c core.quotepath=false status --short --untracked-files=all` | §12와 동일 92 상태행, 허용 2파일 외 90개 SHA/부재 불변 |

사본과 현재 파일의 unified diff 및 whitespace 검사는 `git diff --no-index`로 비교한다. `--no-index` 종료 1은 파일 차이 존재이며 그 자체가 오류는 아니다. `--check` 결과의 실제 공백 오류와 명령 실패를 구분한다. 전체 명령·시각·종료·핵심 결과를 회신한다.

### 9.2 원래 음성 N1~N10 유지

{retained_negatives}

### 9.3 신규 Chrome case — 모두 실제 동작 확인

| case | 입력·순서 | 기대 |
|---|---|---|
| employees-error | active site 1/유효 패턴, 직원 조회 실패→refresh 성공 | prep 오류/unknown·0/1 정상 비율 없음; 다른 known KPI 유지; 성공 시 오류 해제 |
| sites-error | sites 실패, 당월 일치 schedule/published export→refresh 성공 | ops 오류/unknown·2/2 정상 비율 없음; overview 알려진 4 KPI만, 이름 경고 unknown; 복원 |
| sync-error | 다른 필수 조회 성공·todos 0, sync 실패→성공 | H4 없음/오류 안내; 성공 all-zero이면 진짜 H4 |
| recovery-error | 같은 조건의 recovery 실패→성공 | H4 없음/오류 안내; known todo가 있으면 함께 유지 |
| watch-error | admin watch 실패→성공; 비admin 별도 검증 | admin H4 없음/오류; 비admin watch 호출 0·성공 가정 강요 없음 |
| stale-retry-action | 실제 retry 클릭·응답 보류→실제 메뉴 이동 또는 refresh→AUTH/성공/일반 오류/throw 해제 | 이탈 뒤 새 화면·DOM·login 전환 불변; refresh 세대 변경 뒤 오래된 결과 무시/잠금 해제·재시도; 살아 있는 AUTH 만료 1회·중복 1회·오류 retry 가능 |
| stale-watch-action | admin restart로 위 수명 subcase 반복 | stale 갱신 0/살아 있는 만료 1회, 잠금/타이머 정리·재시도; 비admin restart UI/API 0 |

실제 설치 Chrome, `http://127.0.0.1:18739/`, 1440×900. build 후 `os.tmpdir()` 바로 아래 고유 SHIFTMGMT_USER_DATA_DIR와 그 하위 data/bootstrap-credentials.json의 SHIFTMGMT_UI_BOOTSTRAP_FILE. 기존 login/shell 실행기의 안전한 계정·서버 준비법 사용. 계정 값 출력/비밀번호 화면 캡처 금지. temp 정리는 절대 경계를 검증하거나 보존 경로·이유를 회신한다. manifest에 fixture 경계/expected failures/role/URL/행동·기대·실제 기록. console/pageerror/requestfailed/예상 밖 4xx·5xx 0, 의도된 오류는 기대 목록 일치, home.css 200·font 404=0. stale의 transport throw fixture는 의도된 requestfailed를 명시·일치 검증한다.

PowerShell에서 서버 준비 후 정확히 실행한다. 각 run 실패 시 원인 기록/수정 후 해당 검증과 관련 회귀를 재실행하고 선행 기록을 보존한다.

```powershell
$homeCases = @({case_literals})
foreach ($homeCase in $homeCases) {{ node scripts/ui-checks/home.mjs http://127.0.0.1:18739/ "--case=$homeCase" }}
$loginCases = @({login_literals})
foreach ($loginCase in $loginCases) {{ node scripts/ui-checks/login.mjs http://127.0.0.1:18739/ "--case=$loginCase" }}
node scripts/ui-checks/shell.mjs http://127.0.0.1:18739/
node scripts/ui-checks/ready.mjs http://127.0.0.1:18739/
```

최종 홈 13 + 기존 login/shell/ready 13 = **최소 26 manifest PASS**. 신규 stale 두 case의 각 수명 subcase를 manifest assertions에 명시한다. 기존 스크립트/helper와 과거 복구 캡처 가림은 보존. 통과한 마지막 실행만 골라 보고하지 않는다.

### 9.4 누락된 최초 실패 이력 보완

{failed_manifest_lines}

여섯 실패의 원인·당시 수정·실제 후속 PASS와 현재 파일의 해당 위치를 전수 대응시킨다. 이번 수정의 모든 run(FAIL/PASS), 초기 probe 오류 수정 포함, timestamp/manifest/capture 존재/최종 연결을 보고한다. Sol 별도 probe는 위 §2 한계와 함께 별도 분류하며 실제 로그인 회귀 PASS로 대체하지 않는다. 기존 실패 artifact 수정/삭제 금지. 원시 민감 metadata 복제 금지.

## 10. 성공 조건

- [ ] R1~R9 및 R31C-01~05 각각 구현 위치/실행 증거·원인→수정→재현 결과 연결.
- [ ] 닫힌 2파일만 변경, 나머지 90경로·정본·제어 SHA 불변, 새 제품 파일/의존성 0.
- [ ] §9.1 모든 검사와 기존 12/전체 912시험 통과, 원래 N1~N10 및 신규7 case 기대 충족.
- [ ] 실제 로그인/역할과 HTTP 경계 fixture, 최종 최소26 Chrome manifest PASS, console/예상 밖 network 오류0.
- [ ] 최초 실패 포함 실행 전수와 기존 누락FAIL6건의 원인/수정/최종 대응 제출.
- [ ] 2파일 실제 pre→post unified diff/크기/SHA와 92경로 최종 실측, temp 보존/정리 기록.

## 11. 즉시 중단 조건

baseline/status/정본/제어 SHA 불일치, 2파일 밖 수정·새 의존성/API/DB/계산/권한 필요, 시험 약화·미검증 mock/0 fallback 필요, 검증 환경 부재·비밀 없는 캡처 불가, 요구사항/실제 계약 충돌은 제품 수정 전에 BLOCKED로 근거와 필요한 결정만 회신한다. 성공 조건 미충족은 FAILED/미해결로 사실대로 적는다. 커밋·TODO 변경·하네스 설치는 하지 않는다.

## 12. 착수 기준 92경로 상태·파일 SHA

LF로 상태행만 연결(마지막 LF 없음) SHA-256 `{EXPECTED_STATUS}`. 파일 해시는 바이트 SHA-256, 삭제/부재는 ABSENT. 허용 2파일 외 90경로는 최종에도 일치해야 한다.

```text
{baseline_block}
```

## 13. 제어 문서 착수 SHA — Control workspace

TODO는 최초 제출 검증이 CORRECT로 종결된 뒤 승인된 상태만 갱신했다. 아래가 새 요청의 고정 validation target이다. Gemini는 수정하지 않는다.

| 경로 | SHA-256 |
|---|---|
{control_rows}

---

## 회신

Gemini는 이 칸 아래에 실제 값으로 작성한다. 본문 수정 금지.

```text
판정: IMPLEMENTED 또는 BLOCKED 또는 FAILED
기준: 저장소 / main / 전체 baseline commit / 커밋 없음
초기 상태: 92상태행 SHA 및 92경로/정본/제어 착수 실측
변경 파일: 허용2파일 각각 ID·목적
범위 밖 변경: 실제 개수·경로
요구사항 대조: R1~R9 및 R31C-01~05 → 원인 → 변경 위치 → 재현 명령 → 실제 결과
검증 증거: 정확한 명령 → 시각 → 종료 코드 → 핵심 수치 (미실행은 UNVERIFIED)
음성 시험: N1~N10 및 신규7 case의 각 입력/행동 → 기대 → 실제
UI 증거: 실제 로그인/role/URL/Chrome/viewport/클릭·키보드/manifest assertions
전체 실행 이력: 최초 FAIL 포함 모든 실행 manifest·캡처 → 원인/수정 → 최종 PASS 연결; 기존 누락FAIL6건 별도 전수
diff: 허용2파일 pre→post 실제 unified diff/증감/사본 경로, 보호90개 실측
SHA-256: 실제 명령에서 나온 전체64자리 / byte count / status SHA
temp/생성물: 격리 경계 및 정리 또는 보존 경로·이유
미해결/가정: 실제 목록 또는 없음
```
'''
packet_bytes = encoded(packet)
(CONTROL / 'HANDOFF.md').write_bytes(packet_bytes)
records.append(create_new(outgoing_path, packet_bytes))
assert (CONTROL / 'HANDOFF.md').read_bytes() == outgoing_path.read_bytes()
assert git('status', '--short', '--untracked-files=all').splitlines() == status
assert all(file_sha(REPO / line[3:]) == digest for line, digest in rows)
assert all(file_sha(CONTROL / name) == digest for name, digest in fixed_hashes.items())
assert packet.count('\n## 회신\n') == 1
assert 'Action: CORRECT' in packet and all(packet.count('R31C-' + str(i).zfill(2)) >= 2 for i in range(1,6))
assert '<case>' not in packet and not re.search(r'<(?:command|path|YYYY|repository)', packet)
result = {'time':time_label, 'decision':'CORRECT', 'phaseAccepted':False, 'harnessApplied':False, 'records':records, 'handoff': {'bytes':len(packet_bytes),'sha256':sha(packet_bytes)}, 'todo': {'bytes':todo_path.stat().st_size,'sha256':file_sha(todo_path)}, 'currentState': {'bytes':state_path.stat().st_size,'sha256':file_sha(state_path)}, 'productFilesUnchanged':len(rows), 'newCorrectionProtectedPaths':len(rows)-len(ALLOW), 'fixedControlsUnchanged':fixed_hashes}
create_new(OUT / 'control-write-evidence.json', (json.dumps(result, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
print(json.dumps(result, ensure_ascii=False))
