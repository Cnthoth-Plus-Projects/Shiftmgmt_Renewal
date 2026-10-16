from pathlib import Path
from datetime import datetime, timezone, timedelta
import json, hashlib, subprocess, difflib

FOLDER=Path(__file__).resolve().parent
ROOT=FOLDER.parents[2]
REPO=Path('C:/Projects/Active/ShiftMgmt_V4')
NOW=datetime.now(timezone(timedelta(hours=9)))
STAMP=NOW.strftime('%Y%m%d_%H%M%S')
TIME=NOW.strftime('%Y-%m-%d %H:%M:%S KST')
def sha(b):return hashlib.sha256(b).hexdigest().upper()
def hf(p):return sha(p.read_bytes())
def j(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def wj(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def git(*args):return subprocess.check_output(['git','-c','safe.directory=C:/Projects/Active/ShiftMgmt_V4','-C',str(REPO),*args],encoding='utf-8').rstrip('\r\n')
received=j(FOLDER/'received.json')
assert hf(ROOT/'HANDOFF.md')==received['receivedSHA256'],'Current response changed during review'
assert (ROOT/received['archive']).read_bytes()==(ROOT/'HANDOFF.md').read_bytes(),'Received archive mismatch'
scope_before=j(FOLDER/'scope-before.json')
base=j(ROOT/'.ai/reports/phase3-1d-20260930/scope-evidence.json')
expected=dict(base['productFiles'])
for item in scope_before['changed']:expected[item['path']]=item['afterSHA256']
actual={rel:hf(REPO/rel) for rel in expected}
assert actual==expected,'Product changed during Sol review'
assert git('rev-parse','HEAD')==base['head']
status=git('status','--short','--untracked-files=all').splitlines()
assert status==base['status']
canonical={}
for group in ['canonical','controls','approvedLoginShellReferences']:
 for rel,h in base[group].items():assert hf(ROOT/rel)==h,rel;canonical[rel]=h
static=j(FOLDER/'static-results.json')
assert len(static)==5 and all(r['exitCode']==0 for r in static)
build=j(FOLDER/'build-result.json');tests=j(FOLDER/'full-test-result.json')
assert build['exitCode']==0 and tests['exitCode']==0
testlog=(FOLDER/'full-test.log').read_text(encoding='utf-8',errors='replace')
assert '132 passed (132)' in testlog and '912 passed (912)' in testlog
run_dir=Path(j(FOLDER/'latest-run.json')['directory'])
integration=j(run_dir/'results.json')
assert integration['summary']=={'passed':83,'failed':0,'groupsCompleted':8,'groupsFailed':0,'unexpectedErrors':0,'captures':15}
assert integration['browserClosed']
ui_path=next(FOLDER.glob('ui-results-all-*.json'))
ui=j(ui_path)
assert len(ui)==26 and all(r['exitCode']==0 and r['tempCleaned'] for r in ui)
ui_records=[];artifacts=[];matrices=[]
for record in ui:
 for m in record['manifests']:
  p=REPO/m['path'];manifest=j(p);assert manifest['status']=='PASS',m['path']
  assert manifest['chrome']['version']=='154.0.8037.58'
  captures=[]
  for c in manifest['captures']:
   cp=REPO/c['path'];assert cp.is_file();captures.append({'path':c['path'],'bytes':cp.stat().st_size,'sha256':hf(cp)})
  ui_records.append({**record,'manifest':m['path'],'manifestSHA256':hf(p),'captures':captures})
  artifacts+=captures
  matrix=p.parent/'action-assertions.json'
  if matrix.is_file():
   data=j(matrix);assert data['realSession'] and len(data['assertions'])==14 and all(a['result']=='PASS' for a in data['assertions']);matrices.append({'path':str(matrix.relative_to(REPO)).replace('\\','/'),'sha256':hf(matrix),'assertions':data['assertions']})
assert len(artifacts)==40 and len(matrices)==2
integration_caps=[{'path':str((run_dir/n).relative_to(ROOT)).replace('\\','/'),'bytes':(run_dir/n).stat().st_size,'sha256':hf(run_dir/n)} for n in integration['captures']]
cleanup=[]
for name,cleanupname in [('server-info.first-sol-run.json','server-cleanup.first-sol-run.json'),('server-info.json','server-cleanup.json')]:
 info=j(FOLDER/name);clean=j(FOLDER/cleanupname);assert clean['serverStopped'] and clean['tempDataCleaned'] and not Path(info['dataDir']).exists();cleanup.append({'info':name,'cleanup':cleanupname,**clean,'pathAbsent':True})
scope={'time':TIME,'head':base['head'],'branch':'main','status':status,'statusSHA256':sha('\n'.join(status).encode()),'productFiles':actual,'checkedFiles':324,'changedByGemini':scope_before['changed'],'protected319Unchanged':True,'changedBySol':0,'canonicalAndRules':canonical,'integration':{'directory':str(run_dir.relative_to(ROOT)).replace('\\','/'),'summary':integration['summary'],'captures':integration_caps,'resultsSHA256':hf(run_dir/'results.json')},'uiResults':str(ui_path.relative_to(ROOT)).replace('\\','/'),'ui':ui_records,'actionMatrices':matrices,'static':static,'build':build,'unitTests':tests,'cleanup':cleanup,'testBrowserProcessesRemaining':0}
wj(FOLDER/'final-evidence.json',scope)

# Preserve the old Sol-owned helper and publish the verified correction for future runs.
helper=ROOT/'.ai/reports/phase3-1d-20260930/integration-check.mjs'
assert helper.read_bytes()==(FOLDER/'integration-check.mjs.received-baseline').read_bytes()
helper_old=helper.read_bytes()
helper_archive=ROOT/'Log'/f'{STAMP}_3-1d-Sol검수기_정정전_보존본.mjs'
with helper_archive.open('xb') as f:f.write(helper_old)
assert helper_archive.read_bytes()==helper_old
helper.write_bytes((FOLDER/'integration-check.mjs').read_bytes())
helper_meta={'beforeSHA256':sha(helper_old),'afterSHA256':hf(helper),'archive':str(helper_archive.relative_to(ROOT)),'reason':'isDisabled includes aria-disabled; use native DOM disabled plus actual Tab focus, and execute all locked-button keyboard probes. Add4 explicit design checks and1 pending duplicate-submit check. Wait until held route.continue completes before unroute.'}
wj(FOLDER/'helper-correction.json',helper_meta)
lessons=ROOT/'.ai/lessons';lessons.mkdir(exist_ok=True)
lesson=lessons/'aria-disabled-and-native-disabled.md'
assert not lesson.exists()
lesson.write_text('''# aria-disabled와 native disabled를 분리해서 검수한다

- Trigger: 포커스 가능한 입력 조건/권한 잠금과 native 처리 중 잠금을 구분하는 UI 검수.
- Failure: Sol 검수기가 Playwright locator.isDisabled()를 native 버튼 disabled와 동일시해 올바른 aria-disabled 버튼을 실패로 집계했다. 같은 메서드로 키보드 음성 검사를 건너뛴 문제도 있었다.
- Cause: Playwright disabled 판정에는 aria-disabled가 포함된다. 이것은 브라우저의 HTMLButtonElement.disabled/Tab 포커스 가능 여부와 다른 조건이다.
- Prevention: native 상태는 el.disabled로 읽고 실제 Tab→document.activeElement와 2px 포커스 링을 확인한다. aria-disabled·aria-describedby·보이는 사유를 별도로 검사한다. 클릭/Space/Enter/폼Enter의 API 호출0,처리 중 native disabled/중복0도 확인한다. 지연 응답 fixture는 route 처리 완료 뒤 unroute한다.
- Evidence: [Playwright Enabled](https://playwright.dev/docs/actionability#enabled), `.ai/reports/phase3-1d-review-20260930_165922/final-evidence.json`(83/83 PASS).
''',encoding='utf-8')

file_table='\n'.join(f"| `{r['path']}` | {r['bytes']} | `{r['afterSHA256']}` |" for r in scope_before['changed'])
static_table='\n'.join(f"| `{r['label']}` | {r['exitCode']} | `{Path(r['label']+'.log')}` |" for r in static)
ui_table='\n'.join(f"| {r['label']} | `{r['manifest']}` | {len(r['captures'])} | PASS |" for r in ui_records)
report=f'''# HANDOFF — Phase3-1d Sol 독립 검증 ACCEPTED

- Action: ACCEPTED / CLOSED
- From: Sol(xhigh, Codex)
- To: 사용자 · 프로젝트 다음 세션
- 회신: 불필요
- Time: {TIME}
- Routing: frontier — 디자인·접근성 수정의 최종 통합 검증
- Product repository: `C:\\Projects\\Active\\ShiftMgmt_V4`, main
- Product HEAD: `{base['head']}` — 신규 커밋0

## 1. 판정과 현재 단계

**Gemini의 R31D-01~04 수정 수용. Phase3-1d ACCEPTED.** 로그인·셸·홈 제품 통합 검수는 통과했다. 3-1a/b/c의 수용과 하네스5.1 적용은 유지한다. **전체 Phase3-1의 커밋·사용자 확인(3-1e)이 남아 있으며 이 세션에서는 커밋하지 않았다.** 다음 단계는3-1e다.

Sol이 회신을 읽는 데 그치지 않고 실제 해시·diff·명령·Chrome·네 역할·세션·키보드를 독립 검증했다. Sol 제품 코드 수정0. 기존 정상 역할대로 제품 수정은 Gemini,검수·제어 문서 갱신은 Sol이다.

## 2. 수신 원문 보존과 착수 상태

수신 HANDOFF를 교체 전에 그대로 보존했다:

- `{received['archive']}`
- {received['receivedBytes']}bytes / SHA-256 `{received['receivedSHA256']}`
- 현재 수신 파일과 아카이브의 바이트 동일 확인. 발송 본문은 줄바꿈 표현을 정규화한 텍스트 기준 불변이고 회신 영역만 내용이 추가됐다. 원문 아카이브의 줄바꿈을 변경하지 않았다.

HEAD/main/status92 유지. 상태행 LF 연결(마지막 LF 없음) SHA `{scope['statusSHA256']}`. 허용5파일은 회신의 SHA·bytes와 전부 일치하며 보호319제품 파일·정본/지침/승인HTML15파일은 불변이다. 324제품 파일은 검수 시작~종료에도 동일했다.

## 3. 결함별 독립 판정

| ID | Sol 확인 | 판정 |
|---|---|---|
| R31D-01 | 공통6색 토큰 정본 일치. 로그인 카드 선색도 #E2E5EA로 복구 | PASS |
| R31D-02 | 로그인 배경 #E5E7EB,입력·눈 버튼6px,로그인 텍스트 버튼14px. 카드460px/8px/36px32px/승인 그림자 유지 | PASS |
| R31D-03 | 준비 카드6px/그림자none,사이드바 토글6px,헤더20px/600,재시작12px/6px. 셸220↔64/56/32/본문812 보존 | PASS |
| R31D-04 | native disabled=false/aria-disabled=true/사유 연결,실제 Tab 포커스와2px링,약한·불일치 입력에서 클릭/Space/Enter/폼Enter 요청0. 유효 요청1회·즉시3입력정리·처리중 native disabled·중복0 | PASS |

login.ts와3CSS는 바뀐 부분을 역으로 복원한 기준 파일이 이전 실제 SHA와 일치하여 요청 전·후 최소 diff를 재현했다. 해당 `*.request-baseline`/`*.request-diff`와 `minimal-css-diffs.json`을 보존했다. UI 로그인 시험의 잠금 검사를 native DOM·실제 포커스·사유·API 요청수로 강화한 부분도 소스로 확인했다. 기존11 로그인/13홈/셸/준비 시나리오는 유지한다.

| 수정 제품 파일 | bytes | 최종 SHA-256 |
|---|---|---|
{file_table}

## 4. 검수 도구의1실패 판정 정정 — 제품 오류가 아님

Gemini 회신의 통합 검수77 PASS/1 FAIL은 Sol 도구의 `L4-lock-focusable` 조건 오류였다. `locator.isDisabled()`는 aria-disabled도 disabled로 판정한다. 이것을 브라우저 native disabled/포커스 불가와 동일하게 취급한 검사가 잘못됐다. 공식 [Playwright Enabled 설명](https://playwright.dev/docs/actionability#enabled)과 실제 Chrome DOM·Tab을 대조했다.

Sol은 기존 검수기 원문을 `{helper_meta['archive']}`에 보존하고 native `el.disabled`+실제 Tab→document.activeElement+포커스 링으로 정정했다. 같은 잘못된 판정 때문에 Space/Enter 음성 검사를 건너뛰던 조건도 고쳤다. 테스트를 생략하거나 성공값을 고정하지 않았다. 정적 추가4규격과 처리중 중복 제출1검사를 추가하여 **83조건 전부 PASS**를 확인했다.

별도 경과: 추가한 지연 응답 fixture 첫 실행은 `route.continue: Route is already handled!`로 중단됐다. held route의 완료 전에 unroute한 Sol 도구 오류였다. 제품에 변경 없이 처리 완료를 기다리도록 고치고 신규 임시 DB에서 재실행했다. 첫 실행에서 기록된19조건·완료1그룹의 부분 원장과 helper 사본을 삭제하지 않았다. 최종 검수는8그룹 전량 완료·83 PASS/0 FAIL·예기치 않은 오류0·15캡처다.

회신의 눈 버튼 width94.1406px는 글꼴 준비 완료 이후의 측정으로 재현되지 않았다. Sol이 document.fonts.ready 이후 실측한 눈 버튼은32×32,아이콘 폭24,Material Symbols Outlined 로드true,radius6이다. 이 값은 이번 수정 기준의 모서리6을 충족한다. 숫자 차이를 숨기지 않고 최종 원장에 기록했다.

제어 검수기의 정정본을 기존 `.ai/reports/phase3-1d-20260930/integration-check.mjs`로 반영했다. 제품 테스트/소스는 Sol이 수정하지 않았다. 재발 방지 기록: `.ai/lessons/aria-disabled-and-native-disabled.md`.

## 5. Sol 재현 명령과 게이트

| 검사 | exit | 증거(이번 report 폴더 상대경로) |
|---|---|---|
{static_table}
| npm run build | 0 | build.log / build-result.json; CLEAN_SERVER_BUILD_OK,WEB_ASSETS_OK |
| npm test | 0 | full-test.log / full-test-result.json;132파일912시험,276.16초 |
| 교정 통합 helper | 0 | `{run_dir.name}/results.json`;8그룹83조건/15캡처,PASS |
| 기존전체 UI runner | 0 | `{ui_path.name}`;26시나리오/40캡처,PASS |

정적 검사에서 lint는 오류0/기존 경고5,지도82경로 일치. 명령별 실제 시작·종료·exit는 `static-results.json`,`build-result.json`,`full-test-result.json`에 있다. UI각 명령/시각/exit/임시정리/manifest는 ui-results 원장과 final-evidence.json에 있다. Gemini 회신의 누락된 일부 명령·시각·정확한 manifest 증거를 Sol 재현 원장으로 보완했다.

## 6. 실제 Chrome·권한·시각 확인

- 설치 Chrome154.0.8037.58/1440×900. 로그인의 L1 Tab/눈 Space·Enter/실패 안내/L4 변경,셸 펼침·접힘/8메뉴 제목·aria-current·준비 안내/홈 복귀/로그아웃을 확인했다.
- 최초 Tab은 본문 바로가기. 실제 본문 감시 재시작 버튼이 있는 상태에서 nav/header를 건너뛰어 본문 액션으로 이동한다.
- 관리자/operator/planner/reviewer를 실제 세션으로 검수했다. 비관리자 관리메뉴·감시칸없음/감시API자동0,명시적 관리자 조회는 AUTH_FORBIDDEN/HTTP200으로 차단됐다. 실제 서버 signOut 무효화→보호 조회401→L1복귀·셸파기 정상. 시간 경과 TTL을 기다린 시험은 아니다.
- 관리자 감시 중단→키보드 다시 시작→실제 감시 실행 정상. 처리 중 중복 제출은 요청 경계를 지연시켜 실제1회만 호출되는지 확인했다.
- 1440×900 및 보조1024×768 가로 넘침 없음. 장식 홈 아이콘은 조상 aria-hidden을 포함해 정상이다.
- 지정19차 로그인/셸과1차 승인홈을 Chrome에서 렌더링했다. 최종 실제 로그인·홈·감시중단 캡처를 Sol이 이미지로 직접 열어 확인했다. 값 충돌은 디자인시스템v1.3 우선,옛 헤더/가짜128건/샘플 판번호/다중상태 라벨바는 복사하지 않는다. 비밀번호 캡처의 마젠타 영역은 검수 마스킹이며 제품 스타일이 아니다.

## 7. 기존26시나리오 — 전량 PASS

| 시나리오 | 제품 상대 manifest | 캡처 | 결과 |
|---|---|---|---|
{ui_table}

추가2개 action-assertions.json은 각각14/합계28조건 전부 PASS,실제세션/HTTP 응답 경계임을 확인했다. 복구/감시의 성공·일반실패·AUTH·통신실패/refresh/destroy 수명 회귀가 유지된다. 26 manifest와40실제캡처,통합15캡처,2행동원장의 full SHA/bytes는 `final-evidence.json`에 보존했다.

## 8. 정리·제한·다음 행동

이번 Sol18740 서버의 첫 도구 오류 실행과 최종 실행은 소유 stopFile로 종료했고 임시 폴더 부재를 확인했다. 기존26 UI실행은 전량 tempCleaned=true다. 최종브라우저종료true이며 검수 종료 뒤 Playwright Chromium 프로필을 가진 잔여 Chrome 프로세스0을 확인했다. 실제 운영DB/V3는 사용하거나 수정하지 않았다.

이전 세션16시대 첫 검수의 `{base['cleanup']['attempt1']['retainedPath']}`는 자동 삭제정책 거부 때문에 남은 기존 항목이며 이번 지시에 따라 건드리지 않았다. 이번 검수의 임시 자료는 전량 정리했다. 이전 제한은 전체 과거 임시 폴더0이라고 고쳐 쓰지 않는다.

**수정본 수용 완료.** 제품 신규 커밋0,HEAD/status92 유지. TODO3-1d를 완료로 갱신하고3-1e 커밋·사용자 확인을 다음 단계로 둔다. 3-1e 이후3-2활동 이력 화면으로 진행한다. Gemini에 추가 수정 회신은 필요 없다.

## 9. 증거 위치

- 제어 보고 폴더: `{str(FOLDER.relative_to(ROOT)).replace(chr(92),'/')}`
- 수신 보존/해시: received.json
- 범위 전/후: scope-before.json/final-evidence.json
- 명령: static-results.json/build-result.json/full-test-result.json
- 통합: `{run_dir.name}/results.json`/15캡처
- 기존26: `{ui_path.name}`/제품 manifest40캡처/행동28조건
- 도구 정정: helper-correction.json/helper.diff/정정전Log원문

## 회신

불필요 — Sol 검증 ACCEPTED/CLOSED. 다음 작업3-1e.
'''
(FOLDER/'assessment.md').write_text(report,encoding='utf-8')
(ROOT/'HANDOFF.md').write_text(report,encoding='utf-8')
log=ROOT/'Log'/f'{STAMP}_3-1d-Sol-ACCEPTED_검증종결본.md'
with log.open('xb') as f:f.write((ROOT/'HANDOFF.md').read_bytes())
assert log.read_bytes()==(ROOT/'HANDOFF.md').read_bytes()

todo=ROOT/'TODO.md';lines=todo.read_text(encoding='utf-8-sig').splitlines(keepends=True)
for i,line in enumerate(lines):
 if line.startswith('> **현재 정본(2026-09-30)**'):
  lines[i]=f'> **현재 정본(2026-09-30)**: Phase1·2·2.5/3-0·3-1a/b/c 및 **3-1d ACCEPTED**,하네스5.1 적용 유지. Gemini 닫힌5파일 디자인/접근성 수정본을 Sol이 독립 검증했다.132파일912시험/실제Chrome26시나리오40캡처/통합83조건15캡처/액션수명28조건 전부PASS.검수도구의aria-disabled 오판1건을 DOM·실제Tab 기준으로 정정.제품보호319파일·정본/지침15 불변,HEAD/status92 유지. **전체3-1의커밋·사용자확인3-1e가 남음.** 종결 정본 `Log/{log.name}`.\n'
 elif line.startswith('| **다음 행동** |'):
  lines[i]='| **다음 행동** | 3-1d ACCEPTED →3-1e 제품 커밋·사용자 확인 →3-2 활동 이력 화면. Gemini 수정 회신 대기는 종결됐다. |\n'
 elif line.startswith('| **현재 확인** |'):
  lines[i]=f'| **현재 확인** | Sol3-1d 독립재검증 ACCEPTED:912시험·Chrome26/40캡처·통합83/15캡처·행동28 PASS. 타입/규칙(기존경고5)/지도82/빌드 PASS. Gemini5파일외보호319/정본15 불변,Sol제품변경0.검수도구 오판과지연응답fixture 오류는정정·재현·원문보존.이번임시자료전량정리,이전정책거부잔여1폴더는기존기록유지. |\n'
 elif line.startswith('| 3. 화면 재구축 |'):
  lines[i]='| 3. 화면 재구축 | 1/10 | 🔄 3-0 ACCEPTED,3-1a/b/c/d 완료,3-1e 커밋·사용자 확인 대기 |\n'
 elif line.startswith('- 🔄 3-1. 로그인'):
  lines[i]='- 🔄 3-1. 로그인 · 앱 껍데기(메뉴·상태줄) — 확정 디자인 시스템 적용·통합 검수3-1a/b/c/d Sol ACCEPTED.3-1e 커밋·사용자 확인이 남아 전체3-1은 미완료.\n'
 elif line.startswith('  - 🔄 3-1d.'):
  lines[i]=f'  - ✅ 3-1d. 타입·규칙·시험,실제Chrome 시안대조·주요클릭/키보드·권한/범위 통합검수 — Sol ACCEPTED(09-30):912시험·26UI/40캡처·83통합조건/15캡처·행동28 전부PASS. 근거 `Log/{log.name}`.\n'
todo.write_text(''.join(lines),encoding='utf-8')
state=ROOT/'.ai/current-state.md';old=state.read_text(encoding='utf-8-sig');oldbody=old.split('\n',4)[4].replace('## Current task — direct integration verification / correction ready','## Historical task — direct integration verification / correction ready',1)
state.write_text(f'''# Current Project State

Status: PHASE_3_1D_ACCEPTED_PHASE_3_1E_PENDING

## Current task — Gemini correction accepted / integration verified ({TIME})

- Sol independently verified R31D-01~04 and4 additional design conditions. Product code changed by Gemini only in the5-file allowlist;319 other files/canonical15 unchanged. Sol product changes0.
- Typecheck/syntax/lint(existing5 warnings)/map82/build PASS. Full132 test files/912 tests PASS,276.16s. Installed Chrome154/1440×900:26 UI scenarios/40 captures PASS;8 integration groups/83 checks/15 captures PASS;28 home action-lifetime assertions PASS.
- Gemini's77/78 result was1 false failure in Sol's helper: Playwright isDisabled includes aria-disabled. Corrected native DOM disabled plus actual Tab focus/outline,executed locked-button keyboard probes,and added4 style+1 pending duplicate-submit checks. All83 PASS. Preserved old helper and failed route-fixture partial run; corrected route completion before unroute. Lesson saved in .ai/lessons/aria-disabled-and-native-disabled.md.
- Scope HEAD `{base['head']}`,main/status92/SHA `{scope['statusSHA256']}` unchanged. New commit0.3-1d ACCEPTED;3-1e commit/user confirmation pending; entire Phase3-1 not yet administratively complete. Next after3-1e is3-2 access history.
- Harness5.1 remains applied; project roles/overlay4.0 unchanged. No approval question is needed for already-authorized review/control work. Product writer remains Gemini.
- Current review temp servers/browser/data cleaned;26 UI temp folders cleaned. Prior session retained temp from policy rejection remains documented without claiming all historical temp folders are gone.
- Receipt `{received['archive']}`/{received['receivedBytes']}bytes/{received['receivedSHA256']}. Closeout `Log/{log.name}`;all evidence `{str(FOLDER.relative_to(ROOT)).replace(chr(92),'/')}/final-evidence.json`.
- Active policies P06(verification),P17(real auth/role denial),P08(test-harness root cause/lesson);Jev disabled.

Earlier entries below are historical and do not override this entry.

'''+oldbody,encoding='utf-8')
wj(FOLDER/'closeout.json',{'time':TIME,'verdict':'ACCEPTED','received':received,'assessmentArchive':str(log.relative_to(ROOT)),'assessmentSHA256':hf(log),'assessmentBytes':log.stat().st_size,'finalEvidenceSHA256':hf(FOLDER/'final-evidence.json'),'productChangesBySol':0,'integration':integration['summary'],'fullTests':912,'uiScenarios':26,'uiCaptures':40,'actionAssertions':28,'next':'3-1e commit and user confirmation'})
print(json.dumps({'verdict':'ACCEPTED','integration':integration['summary'],'fullTests':912,'uiScenarios':26,'uiCaptures':40,'protectedFiles':319,'log':str(log.relative_to(ROOT)),'productCommit':False},ensure_ascii=False))
