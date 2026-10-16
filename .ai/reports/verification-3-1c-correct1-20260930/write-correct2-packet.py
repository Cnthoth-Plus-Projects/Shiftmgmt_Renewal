# -*- coding: utf-8 -*-
import datetime,hashlib,json,pathlib,re,subprocess
C=pathlib.Path(r'C:/Projects/Active/교대근무관리 시스템')
R=pathlib.Path(r'C:/Projects/Active/ShiftMgmt_V4')
O=C/'.ai/reports/verification-3-1c-correct1-20260930'
HEAD='2d97d9bb3dc649f8c40c0d1d0cfc9fdeae0df283'
STATUS='8D4954EE16CAAFDFD5B908D58E42CAF962316D539AAA3DB742DD3B366982D08B'
sha=lambda b:hashlib.sha256(b).hexdigest().upper()
fsha=lambda p:sha(p.read_bytes()) if p.is_file() else 'ABSENT'
def encode(t):return t.replace('\r\n','\n').replace('\n','\r\n').encode('utf-8')
def new(p,b):
 with p.open('xb') as f:f.write(b)
 assert p.read_bytes()==b
 return {'path':p.relative_to(C).as_posix(),'bytes':len(b),'sha256':sha(b)}
def write_preserved(p,t):
 b=p.read_bytes();bom=b'\xef\xbb\xbf' if b.startswith(b'\xef\xbb\xbf') else b'';eol='\r\n' if b'\r\n' in b else '\n'
 p.write_bytes(bom+t.replace('\r\n','\n').replace('\n',eol).encode('utf-8'))
def git(*args):return subprocess.check_output(['git','-c','safe.directory=C:/Projects/Active/ShiftMgmt_V4','-c','core.quotepath=false',*args],cwd=R).decode('utf-8').rstrip('\r\n')
received=(C/'HANDOFF.md').read_bytes()
a=json.loads((O/'received-archive.json').read_text(encoding='utf-8-sig'))
assert len(received)==a['bytes']==50150 and sha(received)==a['sha256']
assert (C/a['path']).read_bytes()==received
s=json.loads((O/'scope-evidence.json').read_text(encoding='utf-8'))
b=json.loads((O/'browser-reproduction.json').read_text(encoding='utf-8'))
assert s['requestBodyTextUnchanged'] and not s['protectedMismatch'] and not s['controlMismatch']
assert s['protectedCount']==90 and s['reportedManifestCount']==26
assert b['previousFixed']==7 and b['remainingFailures']==5 and not b['backendAuthVerified']
assert git('rev-parse','HEAD')==HEAD and git('branch','--show-current')=='main'
status=git('status','--short','--untracked-files=all').splitlines()
assert len(status)==92 and sha('\n'.join(status).encode())==STATUS
rows=[(line,fsha(R/line[3:])) for line in status]
fixed={x['path']:x['actual'] for x in s['controlMismatch']}
for name in ['AGENTS.md','.ai/HARNESS.md','PROTOCOL.md','GEMINI.md','CLAUDE.md','07-invariants-and-pitfalls.md','.ai/harness.yaml']:fixed[name]=fsha(C/name)
now=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)))
stamp=now.strftime('%Y%m%d_%H%M%S');when=now.strftime('%Y-%m-%d %H:%M:%S KST')
review=C/f'Log/{stamp}_3-1c-CORRECT1-Sol-CORRECT_검증본.md'
closed=C/f'Log/{stamp}_3-1c-CORRECT1-Sol-CORRECT_회신종결본.md'
sent=C/f'Log/{stamp}_3-1c-Sol-CORRECT2_발송본.md'
review_rel=review.relative_to(C).as_posix()
unreported=s['unreportedRecentRuns']
missing_table='\n'.join(f"| `{x['path']}` | {x['status']} |" for x in unreported)
outcomes='''| ID | CORRECT1 판정 | 근거 / CORRECT2 대상 |
|---|---|---|
| R31C-01 | 独立 재현 PASS | 직원 일반 조회 실패에서 준비 비율 없이 오류 표시. 성공 복원 회귀는 계속 유지 |
| R31C-02 | 独立 재현 PASS | sites 실패에서 운영 비율 없이 오류 표시. 알려진 KPI/이름 경고 구분 회귀 유지 |
| R31C-03 | 일부 수정 / 잔여 FAIL | sync/recovery/admin-watch 일반 실패의 H4 차단은 PASS. H4 화면에서 refresh 조회 보류 중 기존 “할 일 없음”이 계속 표시됨 (`home.ts:105–108,670–685`) |
| R31C-04 | 일부 수정 / 잔여 FAIL | destroy 뒤 늦은 AUTH는 retry/restart 모두 callback 0, PASS. pending 중 refresh 뒤 응답 종료 및 일반 실패 후 2초 timer 중 refresh에서 새 버튼 영구 disabled (`home.ts:849–896,925–971,788–801`) |
| R31C-05 | 일부 보완 / 잔여 FAIL | 최종26 manifest/36캡처 실재/PASS. 기존 누락FAIL6건+retry 단독FAIL1건은 기재. 그러나 금회13xx 실행52건 중24건(FAIL2/PASS22) 누락; stale 시험은 destroy+AUTH만, 요구된 refresh/타이머 등 누락; 사본 크기2개 오기 |'''.replace('独立','독립')
assessment=f'''# Phase 3-1c CORRECT1 — Sol 독립 검증 / CORRECT2

- Time: {when}
- 판정: **CORRECT — 첫 수정 제출 미수용. 두 번째 통합 수정 필요.**
- 대상: V4 main / HEAD `{HEAD}`, 92경로 SHA `{STATUS}`.
- 정확한 수신 원문: `{a['path']}`, {a['bytes']:,} bytes / SHA-256 `{a['sha256']}`. 바이트·크기·해시 일치 보존.
- 검증 당시 요청 본문/제어 validation target 불변. 보호90경로·정본6개·제어9개 SHA 일치.

## 1. 결함별 판정과 잔여 범위

{outcomes}

## 2. Sol 실제 Chrome 12조건 관찰

실제 Chrome {b['chromeVersion']} / 1440×900. 현재 제품 HomeScreen 및 실제 browser bridge, HTTP response fixture. 생성한 admin session이므로 서버 인증/실제 로그인 회귀를 수용 검증한 것은 아니다.

| 조건 | 실측 |
|---|---|
| 기존 직원/sites/sync/recovery/watch 실패5개 | 가짜 비율/H4 차단, 오류 표시: 5/5 PASS |
| 기존 destroy 뒤 late AUTH 2개 | expiredCalls=0, 새 화면 텍스트 불변: 2/2 PASS |
| pending action → refresh → 옛 AUTH 종료 (retry/watch 각각) | 요청 종료 후 busy=false지만 현재 버튼 disabled=true, “처리 중…” 지속: 2/2 FAIL |
| 일반 액션 실패 → 2초 timer 대기 중 refresh (retry/watch 각각) | timer 이후에도 busy=true/disabled=true, “처리 중…” 지속: 2/2 FAIL |
| H4 → refresh 요청 보류 | emptyTodosWhilePending=1, aria-busy=true 요소0: FAIL |

console/pageerror 0. 재현 도구 종료0은 7수정 확인 및 잔여5실패 재현에 성공했다는 뜻이다. 최종 수용 PASS가 아니다. 캡처 pending-refresh-retry.png를 Sol이 육안 대조했다.

## 3. 게이트별 증거와 한계

- 범위 PASS: 기존92상태행 일치, 수정은 home.ts/home.mjs만, 보호90개 SHA/부재 불변, 정본6개·제어9개 일치.
- 실제 diff PASS: home.ts +214/-31, home.mjs +426/-0. 사본 SHA는 착수 기준과 일치.
- 독립 `node --check scripts/ui-checks/home.mjs` 문법 오류 없음. 독립 `npx vitest run src/web/screens/home-model.test.ts --maxWorkers=1 --minWorkers=1` 종료0, 1파일/12시험 PASS(13:51 KST).
- `git diff --check` 및 사본→현재 no-index whitespace 비교에서 공백 오류 없음. Git CRLF 정규화 warning은 관찰되며 no-index 종료1은 파일 차이 존재를 나타낸다.
- typecheck/lint/map/build 및 전체132파일/912시험은 이번 독립 검증 재실행하지 않음: **UNVERIFIED**. Gemini PASS 보고만 있음. 필수 음성 게이트 실패로 추가 전체 실행은 중단.
- 실제 서버 인증/기존13 Chrome 회귀: 이번 독립 probe에서 미검증 **UNVERIFIED**. 최종26 manifest는 전건 존재/PASS, 36캡처 전건 존재 실측.
- H4 대기·busy 수명 음성/UI: FAIL. 검증기 두 stale case(`home.mjs:780–933`)는 실제 이탈 뒤 AUTH만 확인하며 refresh/다른 반환/타이머/살아 있는 AUTH·재시도 표를 검증하지 않음.
- 실행 이력 전수 FAIL: 이번13xx52건 중24건 미기재(FAIL2/PASS22). 아래 전수 목록. 기존6FAIL은 이번 회신에 기재됐으므로 다시 “6건 누락”으로 세지 않는다.

## 4. 새로 누락된 실행24건

| 제품 상대경로 | 실측 상태 |
|---|---|
{missing_table}

두 누락 FAIL의 실제 안전한 오류 요약: employees-error는 직원 실패 조건인데 정상 `1/2`가 관찰됨; sites-error는 실제 오류 안내가 보였으나 검증기의 기대 문구가 달라 실패. 원인→당시 수정→후속PASS는 Gemini가 실제 증거로 연결해야 한다.

## 5. 사본 byte count 정정

| 사본 | Gemini 보고 | Sol 파일 실측 | SHA 일치 |
|---|---|---|---|
| pre-edit-backup-31c-correct1/home.ts | 33,688 bytes | 30,562 bytes | 착수 SHA와 일치 |
| pre-edit-backup-31c-correct1/home.mjs | 21,348 bytes | 18,709 bytes | 착수 SHA와 일치 |

현재 제품 실측: home.ts37,972 bytes / `10A0A32F19BD8544EFA557502F531B09E01EE0002875FA84386BA71FE090E577`; home.mjs36,168 bytes / `FE79578666E2765A6DF897329E20C4E44BB80DF26C1C9D50F5E601721EA57145`. 제품 현재값은 보고와 일치한다. 숫자 오기를 그대로 재사용하지 않는다.

## 6. 자료와 다음 순서

`.ai/reports/verification-3-1c-correct1-20260930/`: received-archive.json, scope-evidence.json, browser-reproduction.json, check-evidence.py, run-home-review.mjs, probe-entry.ts, 캡처12개. 검증 산출물은 제어 프로젝트에만 생성, 제품 소스 수정0.

첫 수정 제출을 CORRECT로 반환하고 마지막 허용 수정인 **CORRECT2**를 한 패킷으로 발송한다. 같은 결함 유형의 두 번째 수정 제출도 실패하면 추가 CORRECT 왕복을 보내지 않고 Sol이 원인/전략을 재계획한다. 사용자 수동 전달·Gemini 제품 코드 전담 유지. 3-1c 및 3-1 전체 미완료. 하네스5.1 로컬 적용은 이 수정 회신 수용 뒤 진행하며 현재 설치3.0/프로젝트 운영4.0은 유지된다.
'''
records=[new(review,encode(assessment))]
closed_bytes=received+encode('\n\n### Sol 독립 검증 — CORRECT2 반환 / 2026-09-30\n\n'+assessment)
(C/'HANDOFF.md').write_bytes(closed_bytes)
records.append(new(closed,closed_bytes))
assert (C/'HANDOFF.md').read_bytes()==closed.read_bytes()

# Old validation is closed before updating the authorized current status.
todo_path=C/'TODO.md';lines=todo_path.read_text(encoding='utf-8-sig').splitlines()
for i,line in enumerate(lines):
 if line.startswith('> **현재 정본(2026-09-30)**:'):
  lines[i]=f'> **현재 정본(2026-09-30)**: Phase 1·2·2.5 종결, Phase 3-0·3-1a·3-1b ACCEPTED。 **3-1c CORRECT1은 Sol 독립 검증 미수용, CORRECT2 준비 완료**. 기존 조회 실패5개와 홈 destroy 뒤 late AUTH2개는 Chrome에서 수정 확인(7/7). 그러나 액션 pending/실패 timer 중 refresh의 버튼 영구 비활성4조건, H4에서 refresh 조회 보류 중 이전 “할 일 없음”1조건을 재현(5FAIL). 최종26 manifest/36캡처 실재/PASS이나 이번 실행52건 중24건(FAIL2) 및 필수 수명 subcase 누락, 사본 byte count2개 오기. 보호90경로/정본6개/제어9개 불변. V4 `{HEAD}`, status92/SHA `{STATUS}`. 통합2파일 CORRECT2 `HANDOFF.md`를 Gemini에 수동 전달→독립 수용 뒤 하네스 백업/5.1 적용/연결 갱신. 검증 정본 `{review_rel}`。'.replace('。','. ')
 elif line.startswith('| **지금 위치** |'):
  history=line.split('아래는 과거 진행 이력:',1)[1]
  lines[i]='| **지금 위치** | **Phase3-1c CORRECT2 준비(첫 수정 미수용, 2026-09-30).** 아래는 과거 진행 이력:'+history
 elif line.startswith('| **다음 행동** |'):
  lines[i]='| **다음 행동** | 사용자가 `HANDOFF.md` 통합 CORRECT2를 Gemini에 전달 → 수명/로딩·실행 증거 수정 회신 → Sol 독립 검증. 두 번째 수정도 같은 결함으로 실패하면 재계획. 수용 뒤 하네스 설치본/plan.json 백업·5.1 고정 SHA 적용·프로젝트 연결 갱신. |'
 elif line.startswith('| **현재 확인** |'):
  history=line.split('아래는 과거 확인 이력:',1)[1]
  lines[i]='| **현재 확인** | CORRECT1 보호90경로·정본6개·제어9개 일치, 집중12시험 PASS, 기존7조건 수정 확인. Chrome 잔여5FAIL/필수 수명 시험 누락/새 실행24건 누락. 전체912시험·서버 인증 회귀는 독립 UNVERIFIED. 아래는 과거 확인 이력:'+history
 elif line.startswith('  - 🔄 3-1c.'):
  lines[i]=line+f' **첫 수정 CORRECT1 검증(2026-09-30): 미수용**. 기존7조건 수정 확인, refresh 버튼 잠금4조건·H4 대기1조건 재현. 금회24실행(FAIL2) 누락/사본 byte count2개 오기. 보호90경로·정본6개·제어9개 일치, 집중12시험 PASS. 통합2파일 CORRECT2 준비·Gemini 회신 대기; 두 번째 수정 실패 시 재계획. 근거 `{review_rel}`.'
 elif line.startswith('| R-16 |'):
  lines[i]=line.replace('통합 CORRECT1 준비.','CORRECT1 미수용, 통합 CORRECT2 준비.')
write_preserved(todo_path,'\n'.join(lines)+'\n')
state_path=C/'.ai/current-state.md';state=state_path.read_text(encoding='utf-8-sig')
state=state.replace('Status: PHASE_3_1C_GEMINI_CORRECT1_READY','Status: PHASE_3_1C_GEMINI_CORRECT2_READY',1)
insert=f'''## Current task — CORRECT1 reviewed / CORRECT2 ready ({when})

- First correction is NOT ACCEPTED. Chrome verified seven original failure/destroy cases fixed; five residual conditions fail (pending/failed-timer refresh leaves retry/restart permanently disabled, and pending refresh leaves old H4 visible). Backend authentication regression remains independently UNVERIFIED.
- Stable R31C-03/R31C-04 remain open; R31C-05 still lacks 24 CORRECT1 runs (2 FAIL/22 PASS), required lifetime subcases, and correct backup byte counts. R31C-01/02 retain regression checks.
- Scope90 protected paths + canonical6 + controls9 match. Current final26 manifest/36 captures exist/PASS. Narrow12 tests PASS; full912/type/lint/map/build not independently rerun due required negative failures.
- CORRECT2 is the second and last correction for these defect classes. Another same-class failure triggers Sol REPLAN. Product writer Gemini only; manual user relay. Allowlist remains home.ts/home.mjs; current92 status SHA `{STATUS}`, V4 HEAD `{HEAD}`.
- Assessment `{review_rel}`. Received archive `{a['path']}` ({a['bytes']} bytes, SHA `{a['sha256']}`).
- Harness remains pending: accept corrected3-1c → installed repository/plan.json backup → pinned v5.1.0 → project harness connection update. Full Access authorization is active; no additional permission request is needed for the already-authorized update.

Earlier entries below retain their historical state and do not override this entry.

'''
state=state.replace('## Current authority and task (2026-09-30)',insert+'## Current authority and task (2026-09-30, earlier CORRECT1 record)',1)
write_preserved(state_path,state)

body=re.split(r'^## 회신\s*$',received.decode('utf-8-sig').replace('\r\n','\n'),maxsplit=1,flags=re.M)[0]
body=body.replace('Sol CORRECT1: 조회 실패·액션 수명·증거 보완','Sol CORRECT2: 새로고침 잠금·로딩·전수 증거',1)
body=body.replace('Correction round: 1 / same defect class maximum 2','Correction round: 2 / same defect class maximum 2 / next same-class failure: Sol REPLAN',1)
body=re.sub(r'^- Time:.*$',lambda _: '- Time: '+when,body,count=1,flags=re.M)
def section(text,start,end,value):
 prefix,remainder=text.split(start,1);old,suffix=remainder.split(end,1)
 return prefix+start+'\n\n'+value.strip()+'\n\n'+end+suffix
summary=f'''{outcomes}

첫 수정 미수용의 전체 독립 평가: `{review_rel}`. 정확한 수신 원문 `{a['path']}` ({a['bytes']:,}bytes/SHA `{a['sha256']}`). 요청 본문/보호90경로/정본6개/제어9개 불변. 실제 Chrome12조건 중 기존7조건 수정 확인, refresh/button/timer/H4 잔여5FAIL. 최종26 manifest/36캡처 실재/PASS는 확인했지만 전수 실행/수명 subcase 게이트는 FAIL. 집중12시험 독립 PASS. 전체912/type/lint/map/build·서버 로그인 회귀는 이번 독립 검증 UNVERIFIED. probe는 생성한 admin session+실제 bridge HTTP fixture이며 실제 인증 시험을 대체하지 않는다.

본 CORRECT2가 같은 결함 유형의 마지막 수정이다. 다시 실패하면 추가 CORRECT를 보내지 않고 Sol이 전략을 재계획한다. 수정 완료를 임의 ACCEPTED로 표시하지 않는다.'''
body=section(body,'## 2. 현재 상태와 Sol 독립 검증 결과','## 3. 정본과 현재 제품 호출점',summary)
requirements='''| ID | 입력/행동 | 요구 결과 | 위치 |
|---|---|---|---|
| R31C-01 | active site 직원 조회 실패/복원 | 비율 unknown·오류, 다른 known 섹션 유지; 성공 복원 회귀 유지 | home.ts/loadData, employees-error |
| R31C-02 | sites 실패/복원 | 운영 unknown·오류, overview4 KPI와 이름 unknown 분리 회귀 | home.ts/loadData, sites-error |
| R31C-03 | sync/recovery/admin watch 실패; H4→refresh 보류→실패/성공 | 오류별 H4 차단 유지. refresh 시작 즉시 H5/aria-busy로 전환하고 이전 H4 제거; 완료 시 현재 세대의 전부 성공/zero만 H4 | loadData 시작/renderSkeleton/renderContent, 오류3 case+empty-fixture |
| R31C-04 | pending/오류 액션 중 refresh/destroy 및 모든 응답 분기 | 오래된 결과의 세션/데이터/DOM 변경0, 소유 ticket 잠금은 종료 시 정리하고 현재 mounted 버튼도 활성화; 원래 버튼 참조 변경0; retry/restart 모두 재시도 가능 | 두 handler/destroy/renderContent, stale 두 case의 전수 subcase |
| R31C-05 | 이번52 실행·앞선 기록·새 시험 전수 및 실제 사본 크기 | 누락24건 포함 PASS/FAIL 전수 연결, 실제 subcase 증명, byte count 실측. 이번 새 파일 현재값은 §12를 기준으로 정확히 새 사본 보존 | home.mjs + HANDOFF 회신 |'''
body=section(body,'### 5.1 수정 요구사항과 구현 위치','## 6. Sol 코드 전략 — 이 순서대로',requirements)
strategy='''1. **착수/사본**: §12 현92상태행/SHA와 §3·§13 정본/제어 전건 확인. 이번 착수 home.ts37,972 bytes / home.mjs36,168 bytes를 새 고유 os.tmpdir() 폴더에 바이트 그대로 보존한다. 이전 CORRECT1 사본은 덮어쓰지 않는다. pre→post 실제 unified diff/해시/파일 길이를 제출한다.
2. **진입·새로고침 H5**: 모든 loadData 진입에서 generation 증가 뒤 즉시 isLoading/월 상태와 H5 skeleton(aria-busy=true)을 렌더한다. 이전 H4를 요청 시작 시 제거한다. 완료·catch는 destroyed/current generation 확인 뒤 현재 결과만 렌더한다. 이전 busy/error/current 버튼을 임시 성공 상태로 바꾸지 않는다. 첫 render와 refresh의 로딩 전이를 일관되게 유지한다.
3. **기존 수정 보존**: 직원실패 prep unknown, sites 실패 ops unknown, sync/recovery/admin watch 별도 오류, H4의 전부 성공 게이트를 유지. 기존 순수 함수/계산 정의/권한/known 섹션 표시를 변경하지 않는다.
4. **액션 결과와 잠금 정리를 분리**: retry/restart 각각 시작 ticket+generation+owner를 캡처하고 기존 busy이면 호출하지 않는다. await/catch 결과의 AUTH/성공 재조회/일반 실패 표시는 owner·generation·ticket이 살아 있을 때만 허용한다. stale 결과는 모두 버린다. 그러나 matching ticket이 소유한 잠금 정리는 stale 여부와 무관하게 finally에서 수행한다. destroy가 owner를 무효화했다면 그 새 화면을 건드리지 않는다.
5. **현재 컨트롤 동기화**: 잠금을 정리할 때 홈이 살아 있으면 container 안의 현재 해당 버튼만 재조회해 disabled/text 상태를 동기화한다. 이전 button 인수를 fallback으로 쓰지 않는다. 현재 H5로 버튼이 없으면 다음 render가 해제된 busy를 반영한다. generation 불일치를 이유로 matching ticket의 cleanup을 건너뛰지 않는다. 다른 ticket의 새 액션 잠금을 풀지 않는다. 공통 helper를 쓸 경우 이 두 액션의 기존 계약만 공유하고 외부 구조를 바꾸지 않는다.
6. **2초 잠금 복구 타이머 제거**: 이번 전략은 오류 뒤 인위적인 2초 cooldown을 제거한다. 요청이 완료되면 matching ticket의 busy를 finally에서 즉시 해제하고 현재 버튼을 다시 누를 수 있게 한다. 현재 세대의 일반 실패/throw는 안전한 실패 안내를 활성 버튼에 유지하되 stale 세대에는 오류 결과를 표시하지 않는다. 지연 타이머가 busy의 소유권을 갖지 않게 한다. destroy와 이전 timer 정리 부분도 필요 없는 timer를 남기지 않는다. 정상 성공은 잠금 정리 후 기존 관련 재조회, 살아 있는 AUTH는 기존 callback1회, stale AUTH0회. 임의 polling/API/권한 추가 금지.
7. **검증 확장**: 아래 stale case의 표를 retry/restart 각각 실행한다. 첫 클릭·빠른 중복 요청수1, pending 중 실제 홈 메뉴 클릭(refresh)·이탈, AUTH/성공/일반 실패/transport throw 반환, stale 새 화면 불변/현재 버튼 활성화·재시도 요청수 증가를 계측한다. 실패 직후 즉시 홈 refresh하는 분기도 반복해 기존 cooldown race가 사라졌음을 확인한다. 살아 있는 AUTH는 실제 로그인 전환1회와 현재 액션 요청수로 확인. 제품 private 메서드를 직접 호출하는 것은 수용시험 대체로 금지; Playwright 실제 클릭·HTTP boundary fixture·실제 로그인 role 사용.
8. **증거 전수**: 기존13 home+13 회귀와 추가 subcase를 최소26 manifest로 검증한다. assertion별 기대/실제/요청수와 완료 시점을 회신·manifest에 명시한다. 이력52건과 누락24건, 이번 새 run 전수를 원인→수정→최종 연결한다. 모든 숫자는 실제 명령에서 추출, 오기를 수정하고 이전 증거 파일은 그대로 보존한다. 필요한 hunk만, 새 제품 파일/의존성/보호90개 변경 금지.'''
body=section(body,'## 6. Sol 코드 전략 — 이 순서대로','## 7. 필수 불변조건과 과거 함정',strategy)
cases='''| case | 추가 필수 순서 | 기대 |
|---|---|---|
| employees-error / sites-error | 기존 조회실패→성공 refresh 및 known 다른 KPI | 정상비율 없음/오류→성공 복원, 기존 R31C-01/02 회귀 |
| sync-error / recovery-error / watch-error | initial 실패, H4 성공 화면→refresh 조회 보류→각 실패, 이후 성공 all-zero | refresh 요청 시작 즉시 H4없음/H5 aria-busy=true, 실패 시 해당 오류·known todo, 성공 후만 H4. 비admin watch 조회0 |
| empty-fixture | 진짜 all-success/zero 후 H4에서 refresh 응답 보류 | 완료 전 이전 H4 노출0, 성공 뒤 H4 복원; 오류 뒤 H4없음 |
| stale-retry-action / stale-watch-action | 아래 액션 수명 표 전수, 같은 실제 role/session·실제 DOM 클릭 | 표의 모든 결과 및 요청수·현재 버튼 재시도 확인 |

두 액션 각각 실행해야 할 subcase:

| 상황 | 해제 응답 | 기대 |
|---|---|---|
| 살아 있는 홈, 빠른2회 클릭 | 성공 / 일반 실패 / transport throw | in-flight 요청1; 정상 성공 재조회; 실패/throw 안내·버튼활성·다음 retry 가능 |
| 살아 있는 홈 | AUTH_SESSION_REQUIRED | 기존 만료 전달/로그인 전환1회; busy 누수 없음 |
| 액션 pending → 실제 홈 메뉴 refresh → 새 DOM | 성공 / 일반 실패 / AUTH / transport throw 각각 | stale 결과에 auth/data/error 전환0; owner의 잠금정리 뒤 현재 버튼 활성·재시도 실제 요청 가능, detached 옛 버튼 갱신0 |
| 액션 일반 실패 또는 throw 완료 → 즉시 홈 메뉴 refresh | 다음 상태 성공/실패 각각 | 인위적인 timer 없음, 새 버튼 잠금 없음, 최소2초 후에도 재시도 가능 |
| 액션 pending → 실제 메뉴 이탈 | 성공 / 일반 실패 / AUTH / transport throw 각각 | 새 화면·DOM·login 전환 불변, late callback0, 불필요 timer0 |

실제 Chrome URL `http://127.0.0.1:18739/`,1440×900, 격리 bootstrap/계정/서버 준비, 캡처/비밀 보호 조건은 원래와 동일. `/api/<channel>` 응답 경계만 통제. 의도된 transport throw는 expected requestfailed로 명시·계측하고 예상 외 오류0. 기존13 home/13회귀 각각 최종PASS, subcase마다 expected/actual·API 요청수·버튼 enabled를 재현 가능한 assertion으로 manifest 또는 회신에 남긴다. 단순400ms sleep 뒤 화면이 보이는 것만으로 busy cleanup PASS를 선언하지 않는다.

서버 준비 뒤 PowerShell에서 실행(각 명령의 종료 코드를 즉시 기록, 실패 시 전수 이력 보존하고 수정 후 재검증):

```powershell
$homeCases = @('live-admin','operator-fixture','empty-fixture','loading-error','stale-response','admin-action','employees-error','sites-error','sync-error','recovery-error','watch-error','stale-retry-action','stale-watch-action')
foreach ($homeCase in $homeCases) { node scripts/ui-checks/home.mjs http://127.0.0.1:18739/ "--case=$homeCase"; if ($LASTEXITCODE -ne 0) { throw "Home case failed: $homeCase" } }
$loginCases = @('flow','locked','recovery','session-error','post-change-null','post-change-error','post-change-race-success','post-change-race-null','post-change-race-error','post-change-race-login','post-change-first-held')
foreach ($loginCase in $loginCases) { node scripts/ui-checks/login.mjs http://127.0.0.1:18739/ "--case=$loginCase"; if ($LASTEXITCODE -ne 0) { throw "Login case failed: $loginCase" } }
node scripts/ui-checks/shell.mjs http://127.0.0.1:18739/
if ($LASTEXITCODE -ne 0) { throw 'Shell case failed' }
node scripts/ui-checks/ready.mjs http://127.0.0.1:18739/
if ($LASTEXITCODE -ne 0) { throw 'Ready case failed' }
```

최종 최소26 manifest PASS, 전체 실행 전수 포함. 새로 생성하는 검증 데이터/계정은 os.tmpdir() 바로 아래 고유 SHIFTMGMT_USER_DATA_DIR 및 그 하위 bootstrap 파일만, 포트/프로세스 충돌은 기존 PID 무단 종료 금지. 실제 로그인·role·fixture/expected errors·비밀없는 캡처를 확인. 폰트404=0/home.css200, console/pageerror/예상 밖4xx·5xx/requestfailed0. temp는 절대 경계검증 뒤 정리하거나 보존 경로·이유 기록. 기존 helper/회귀/로그/캡처 보호.'''
body=section(body,'### 9.3 신규 Chrome case — 모두 실제 동작 확인','### 9.4 누락된 최초 실패 이력 보완',cases)
legacy=json.loads((C/'.ai/reports/verification-3-1c-20260930/scope-evidence.json').read_text(encoding='utf-8'))['missing_failures']
legacy_lines='\n'.join('- `'+x['path']+'` — 기존 FAIL, CORRECT1에 보고됐으며 기록/최종 대응 유지.' for x in legacy)
history=f'''CORRECT1 이력52건(13xx), 기존6FAIL 및 단독retry FAIL1 보고는 보존한다. 아래 추가24건은 전수 누락됐으므로 PASS도 포함해 원인/당시 수정/최종 대응을 작성한다.

기존6FAIL 정확한 경로:

{legacy_lines}

기존 단독retry FAIL: `artifacts/captures/phase3/home-stale-retry-action/run-20260930-132721-CFn4B6/manifest.json`; 후속 `run-20260930-132928-DKQsE5` 및 최종 `run-20260930-133656-7jQWKT` PASS 연결은 유지한다.

| 제품 상대경로 | 실측 상태 |
|---|---|
{missing_table}

새 FAIL2개: employees-error 정상1/2 관찰, sites-error 안내 기대 문구 불일치. 실제 원인과 수정 시점은 당시 manifest/diff에 근거해 설명한다. 현재 개선됐다고 원래 실패를 삭제·덮어쓰지 않는다.

기존 CORRECT1 사본 byte count 오기 정정: home.ts 보고33,688→실측30,562; home.mjs 보고21,348→실측18,709. 두 SHA는 착수 기준과 일치. 이번 CORRECT2 착수 사본은 현재37,972/36,168 bytes를 별도 보존하고 full SHA·길이를 실측한다. 새로 수행한 모든 PASS/FAIL manifest/capture/실제 subcase 결과/명령 종료/수정 대응을 전수 보고. raw credential/원본 경로 metadata 복제 금지. Sol 생성session probe를 실제 서버 인증 PASS로 표시하지 않는다.'''
body=section(body,'### 9.4 누락된 최초 실패 이력 보완','## 10. 성공 조건',history)
baseline='LF로 상태행만 연결(마지막 LF 없음) SHA-256 `'+STATUS+'`. 허용2파일 외90경로/부재 보호, status에 없는 제품 파일도 수정 금지. 현재 착수 허용파일 byte count home.ts37,972 / home.mjs36,168.\n\n```text\n'+'\n'.join(x+'\t'+h for x,h in rows)+'\n```'
body=section(body,'## 12. 착수 기준 92경로 상태·파일 SHA','## 13. 제어 문서 착수 SHA — Control workspace',baseline)
control_names=list(fixed)+['TODO.md','.ai/current-state.md']
body=body.split('## 13. 제어 문서 착수 SHA — Control workspace')[0]+'''## 13. 제어 문서 착수 SHA — Control workspace

첫 수정 제출 검증을 CORRECT로 종결한 뒤 승인된 현재 상태만 갱신했다. 아래는 새 고정 validation target이며 Gemini 변경 금지.

| 경로 | SHA-256 |
|---|---|
'''+ '\n'.join(f'| `{p}` | `{fsha(C/p)}` |' for p in control_names)+'''\n\n---

## 회신

Gemini는 이 칸 아래에 실제 값으로 기록하며 요청 본문은 수정하지 않는다.

```text
판정: IMPLEMENTED 또는 BLOCKED 또는 FAILED
기준: 저장소/main/전체 baseline commit/커밋 없음
초기 상태: 92상태행·92파일 SHA/부재·정본6·제어9 실측
변경 파일: 허용2파일 ID·최소hunk 목적/범위 밖 실제 개수
요구사항: R1~R9·R31C-01~05 원인→변경 위치→재현 명령→실제 결과
검증: 정확한 명령/시각/종료/시험수·미실행 UNVERIFIED
수명 subcase: §9.3 모든 행×retry/restart 기대·실제·요청수·当前 버튼활성/재시도/로그인 전환수
로딩: H4→refresh 시작 즉시 H5·H4없음→보류→성공/오류의 실제 화면·응답해제 증거
UI: 실제 로그인/role/Chrome/viewport/fixture/캡처/최종 최소26 manifest
이력: CORRECT1 누락24건+기존FAIL6+단독retryFAIL1+새 전체실행의 원인/수정/최종 manifest 연결
diff: 이번2파일 정확한 바이트사본/실제unified diff/증감
SHA/bytes: 현재·사본 full64자리/실측파일길이/보호90개·status SHA
temp: 격리 경계/정리 또는 보존 이유
미해결/가정: 실제 목록 또는 없음
```
'''.replace('当前','현재')
packet=encode(body)
(C/'HANDOFF.md').write_bytes(packet);records.append(new(sent,packet))
assert (C/'HANDOFF.md').read_bytes()==sent.read_bytes()
assert all(fsha(R/x[3:])==h for x,h in rows)
assert git('status','--short','--untracked-files=all').splitlines()==status
assert all(fsha(C/n)==h for n,h in fixed.items())
assert body.count('\n## 회신\n')==1 and 'Correction round: 2' in body
assert all(body.count('R31C-'+str(i).zfill(2))>=2 for i in range(1,6))
result={'time':when,'decision':'CORRECT','round':2,'phaseAccepted':False,'harnessApplied':False,'records':records,'received':a,'handoff':{'bytes':len(packet),'sha256':sha(packet)},'todoSHA':fsha(todo_path),'stateSHA':fsha(state_path),'productFilesUnchanged':92,'newCorrectionProtectedPaths':90}
new(O/'control-write-evidence.json',(json.dumps(result,ensure_ascii=False,indent=2)+'\n').encode())
print(json.dumps(result,ensure_ascii=False))
