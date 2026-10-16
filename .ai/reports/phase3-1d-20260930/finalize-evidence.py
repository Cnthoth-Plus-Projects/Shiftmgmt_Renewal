import hashlib, json, subprocess
from pathlib import Path
from datetime import datetime, timezone, timedelta

ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
PRODUCT=Path('C:/Projects/Active/ShiftMgmt_V4')
now=datetime.now(timezone(timedelta(hours=9)))
stamp=now.strftime('%Y%m%d_%H%M%S')
time=now.strftime('%Y-%m-%d %H:%M:%S KST')
def sha(data):return hashlib.sha256(data).hexdigest().upper()
def hashfile(p):return sha(p.read_bytes())
def readj(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def writej(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def git(*args):return subprocess.check_output(['git','-c','safe.directory=C:/Projects/Active/ShiftMgmt_V4','-C',str(PRODUCT),*args],encoding='utf-8').strip('\r\n')
baseline=readj(OUT/'baseline.json')
status=git('status','--short','--untracked-files=all').splitlines()
assert status==baseline['status'],'Product git status changed'
assert git('rev-parse','HEAD')==baseline['head'],'Product HEAD changed'
product_hashes={rel:hashfile(PRODUCT/rel) for rel in baseline['productFiles']}
assert product_hashes==baseline['productFiles'],'Product content changed'
canon_hashes={rel:hashfile(ROOT/rel) for rel in baseline['canonical']}
assert canon_hashes==baseline['canonical'],'Canonical document changed'
prior=readj(ROOT/'.ai/reports/sol-direct-3-1c-20260930/final-scope-evidence.json')
controls={rel:hashfile(ROOT/rel) for rel in prior['unchangedControls']}
assert controls==prior['unchangedControls'],'Product/role rules changed'
references=['시안/2026-09-02-2차검토/스냅샷19차/2차/'+n for n in ['01-login-1.html','01-login-2.html','00-shell-1.html','00-shell-2.html']]
reference_hashes={rel:hashfile(ROOT/rel) for rel in references}
expected_reference=['D9294BD934E8625DB60BF4B50C26ED92CFC801710EBE7199BAEF79481A726CDF','F4A42028D8B0105975164CF27D5A1375BC3E1FF007BBBC6FEDCF23933B37B902','13662ACB30005ACE6F8B802DDC28CED68ACD343BB27A0702E64242C80D6644D1','2745AE05BB39DC6D5A42A43E94ECCBB43FF2F21A5C465158DA5A92AFD7BBEB67']
assert list(reference_hashes.values())==expected_reference,'Approved login/shell HTML changed'
latest=readj(OUT/'latest-run.json')
run_dir=Path(latest['directory'])
result=readj(run_dir/'results.json')
assert result['summary']=={'passed':64,'failed':14,'groupsCompleted':8,'groupsFailed':0,'unexpectedErrors':0,'captures':15},'Unexpected final test result'
captures=[{'path':str((run_dir/n).relative_to(ROOT)).replace('\\','/'),'bytes':(run_dir/n).stat().st_size,'sha256':hashfile(run_dir/n)} for n in result['captures']]
attempts=[]
for d in sorted(OUT.glob('run-*')):
 r=readj(d/'results.json')
 attempts.append({'directory':str(d.relative_to(ROOT)).replace('\\','/'),'summary':r['summary'],'resultsSHA256':hashfile(d/'results.json'),'captures':r['captures'],'command':'node .ai/reports/phase3-1d-20260930/integration-check.mjs','exitCode':0,'exitMeaning':'The soft-check runner completed; acceptance requires failed=0, groupsFailed=0, unexpectedErrors=0.'})
assert len(attempts)==3,'Unexpected attempt inventory'
retained=readj(OUT/'server-info.attempt1.json')
retained_path=Path(retained['dataDir'])
assert retained_path.exists(),'Refresh cleanup record: first temp path changed'
cleanup={'attempt1':{'serverStopped':True,'tempDataCleaned':False,'retainedPath':str(retained_path),'reason':'Two native PowerShell recursive deletion commands were rejected with blocked by policy; no reason was supplied. Read-only inspection confirmed an ordinary task-created directory and no remaining server PID44256. No alternative deletion was used for the rejected target.'},'attempt2':readj(OUT/'server-cleanup.attempt2.json'),'attempt3':readj(OUT/'server-cleanup.attempt3.json')}
writej(OUT/'cleanup-evidence.json',cleanup)
scope={'time':time,'head':baseline['head'],'branch':git('branch','--show-current'),'status':status,'statusSHA':sha('\n'.join(status).encode()),'productFilesChecked':len(product_hashes),'productFiles':product_hashes,'productContentChanges':0,'canonical':canon_hashes,'controls':controls,'approvedLoginShellReferences':reference_hashes,'priorAcceptanceReused':{'unitTests':912,'testFiles':132,'chromeScenarios':26,'chromeCaptures':40,'reason':'All324 existing product-file hashes and92-path status match the before-test baseline; the baseline independently matched the accepted3-1c evidence.'},'runs':attempts,'finalCaptures':captures,'cleanup':cleanup}
writej(OUT/'scope-evidence.json',scope)

failure_table='\n'.join(f"| `{c['id']}` | `{str(c['actual']) if not isinstance(c['actual'],dict) else 'results.json 상세 실측 참조'}` | {c['expected']} |" for c in result['checks'] if not c['pass'])
report=f'''# Phase 3-1d — Sol 직접 Chrome 통합 검수

- 시각: {time}
- 판정: **CORRECT / 전체3-1 수용 보류**. 검수 실행은 완료했다.3-1d는 수정·재검증까지 진행 중이며3-1e 커밋은 대기한다.
- 사용자 지시: “오케이 직접 테스트 진행해”. 제품 변경 없이 Sol이 직접 검수했다.
- 런타임: 실제 설치 Chrome {result['actualChrome']},1440×900,격리 신규 DB,`http://127.0.0.1:18740/`.
- 최종:8그룹 완료,78항목 중64 PASS/14 FAIL,캡처15,예기치 않은 콘솔·페이지·요청·HTTP 오류0.
- `node integration-check.mjs`의 exit0은 soft-check 실행 완료다.14 FAIL을 수용 PASS로 해석하지 않는다.
- 최종 결과: `{run_dir.name}/results.json`, 전량 파일 실재·해시: `scope-evidence.json`.

## 정상 확인

- 실제 ID/비밀번호 입력과 Enter 로그인, 최초 비밀번호 변경 후 셸 진입,약한/불일치 비밀번호의 변경 API 호출0.
- L1 Tab 순서,눈 버튼 Space/Enter,2px 포커스 링,Esc 후 화면 유지. 이 단계는 전체 페이지이므로 Esc로 닫을 모달이 없다.
- 셸220↔64/헤더56/상태줄32/본문812,첫 Tab 본문 바로가기,실제 본문 액션으로 순차 포커스 이동.
- 관리자9메뉴/다른 세 역할7메뉴.8업무 메뉴는 각각 정확한 제목·aria-current·준비 안내를 표시하며 홈 복귀 정상.
- administrator/operator/planner/reviewer를 실제 서버 계정·실제 로그인으로 검수. planner/reviewer는 임시 DB의 기존 관리자 API로 만들었다.
- 비관리자 화면은 관리 메뉴/감시 칸이 없고 감시 API 자동 호출0. 명시적 감시/사용자목록 조회는 기존 HTTP200 BridgeFailure `AUTH_FORBIDDEN`으로 차단됐다.
- 관리자 감시 중단→다시 시작 Enter→실제 감시 실행,키보드 로그아웃 정상.
- 서버 `signOut`로 실제 세션 무효화→상태 조회401 `AUTH_SESSION_REQUIRED`→로그인 복귀/셸 파기 정상. 시간 경과에 의한 TTL 만료를 새로 기다린 시험은 아니다.
- 홈·셸1440 및 보조1024×768에서 가로 넘침 없음. 홈 아이콘은 조상 aria-hidden을 포함해 숨김 정상.
- 제품 HEAD/status92 및324파일 해시 불변. 보호 지침5·정본6·승인 로그인/셸 HTML4도 불변.
- 소스 불변을 근거로 기존132파일/912시험·Chrome26시나리오/40캡처·액션 수명28조건을 재사용했다. 새 전체 단위시험 실행을 주장하지 않는다.

## 실패14조건 — 중복 영향을 포함한 검사 조건 수

| 검사 | 실제 | 정본/기대 |
|---|---|---|
{failure_table}

## 안정 결함 ID / 한 번에 수정할4종류

| ID | 문제 | 수정 위치 |
|---|---|---|
| R31D-01 | 공통6색상 토큰이 정본과 다름. 로그인 카드 테두리 실패도 같은 영향 | src/web/styles.css :root |
| R31D-02 | 로그인 배경 F5F6F8→E5E7EB,입력 모서리4→6,텍스트 동작 버튼13→승인14. 눈 버튼 모서리4는 같은 버튼6 규칙을 어긴 정적 대조 추가 항목 | src/web/login.css |
| R31D-03 | 준비 카드8px/그림자,감시 재시작11px. 정적 대조에서 재시작/사이드바 토글 모서리4 및 헤더 제목18도 확인됨(정본6/6/20). 역할 배지12는 지정19차 HTML과 같아 이번 수정 대상으로 삼지 않음 | src/web/shell.css |
| R31D-04 | L4 입력 조건 잠금을 native disabled로 처리해 포커스 불가,aria-describedby 없음. 규칙/불일치 차단과 처리 중 잠금은 유지해야 함 | src/web/screens/login.ts, scripts/ui-checks/login.mjs |

정적 추가4항목(눈/사이드바/재시작 모서리,헤더 글자)은78개 자동 검사 수에 더하지 않았다. CSS 실제 선언과 정본·지정19차 셸의 `.header-title`20px를 대조한 별도 근거다. `styles.css`6~22,`login.css`3/74/103,`shell.css`165/192/234/319,`login.ts`408~498을 확인했다.

## 시안·시각 대조

지정된19차 로그인/셸과1차 승인 홈을 같은 Chrome에서 렌더링했다. 로그인·홈 실제 캡처와 참조 캡처를 Sol이 이미지로 열어 대조했다. 여러 상태를 세로로 담은 참조 캡처를 단일 제품 화면과 픽셀 동일하다고 주장하지 않는다.

확정 디자인 시스템 v1.3은 값 충돌 시 토큰 정본이다.19차 로그인 자체도 일부 옛 색상/입력4px를 보유한다. 이를 근거로 제품 차이를 승인하거나 정본을 수정하지 않는다. 홈 승인본의 옛 헤더·고정 건수·판번호·데모 버튼은 앞선3-1c 지시대로 구현 대상에서 제외한다. 제품의 실제0건·1/2 준비 비율을 시안의 가짜128건으로 바꾸지 않는다. 로그인 카드460/8px/지정 그림자는 승인 변형이며 통과했다.

## 실행 이력과 시험 전제 정정

1.1차:46 PASS/30 FAIL,7그룹 완료/1미완료,14캡처,예기치 않은HTTP1. 실제 제품 실패 외16개 시험 전제 오류를 포함했다. 기존 API 오류 필드는 `errorCode`이고 차단은 `AUTH_FORBIDDEN`/HTTP200이다. 준비 안내는 독립 exact text가 아니라 notice-banner 문장이다. 홈 아이콘은 조상 aria-hidden을 고려해야 한다. 본문에 포커스 가능한 액션이 없으면 다음 Tab이 첫 링크로 돌아갈 수 있다. 또한 서버는 성공 로그인 때 기존 sessionMap을 비우므로 관리자 브라우저를 열어 둔 채 다른 계정을 로그인하는 전제를 제거했다.
2.2차:64 PASS/14 FAIL,8그룹 완료,15캡처,오류0. 실제 세션 무효화는 다른 역할 로그인 전에 검수했다. 본문에 실제 감시 재시작 버튼이 있는 상태로 skip 이동을 확인했다.
3.최종3차:같은64 PASS/14 FAIL,8그룹 완료,15캡처,오류0. 약한/불일치 비밀번호 차단을 버튼 속성 검사에서 실제 change-password 요청0 확인으로 보강했다. 현재 native disabled 버튼은 키보드 포커스를 받을 수 없다는 실패를 별도 유지했다.

세 실행 결과와 각 실행 당시 helper 사본을 전부 보존했다. 실패를 지우거나 테스트 결과를 고쳐 쓰지 않았다. 테스트 도구 준비 과정의 잘못된 cwd/파일 경로 조회는 실제 제품 결함으로 집계하지 않는다. Python Playwright 미설치로 기존 Node Playwright와 설치 Chrome을 사용했으며 의존성을 설치하지 않았다. Playwright MCP로 초기 화면·키보드를 직접 관찰한 결과도 `mcp-login.png`에 보존했다.

## 정리와 남은 상태

최종·2차 서버/브라우저·임시 자료는 종료·삭제 검증했다. MCP 브라우저도 닫았다. 첫 실행의 서버PID44256은 종료됐으나 자동 정책 검사에서 임시 폴더 재귀 삭제 두 명령이 `blocked by policy`로 거부됐다(추가 사유 없음). 거부된 대상은 우회 삭제하지 않았다. 잔여 경로: `{retained_path}`. 실제 운영 데이터는 사용하지 않았으며 이 경로는 이번 신규 검수 DB/부트스트랩만 담는다. 세부 정리는 `cleanup-evidence.json`.

제품 소스 수정0·커밋0. 제품 구현 주체는 AGENTS.md에 따라 Gemini다. 다음 조치는 루트 HANDOFF.md의 닫힌5파일 수정 후 동일 통합 검수를 다시 확인하는 것이다.3-1c 수용과 하네스5.1 적용은 유지하되 전체3-1은 아직 수용하지 않는다.
'''
(OUT/'report.md').write_text(report,encoding='utf-8')

old=(ROOT/'HANDOFF.md').read_bytes()
assert sha(old)=='2000A80E8BB56A4F7E3A6065FA96748D7B4522F77128D2059A99602F7F9497CC','Current handoff unexpectedly changed'
archive=ROOT/'Log'/f'{stamp}_3-1c종결_3-1d검수전_보존본.md'
with archive.open('xb') as f:f.write(old)
assert archive.read_bytes()==old

editable=['src/web/styles.css','src/web/login.css','src/web/shell.css','src/web/screens/login.ts','scripts/ui-checks/login.mjs']
edit_table='\n'.join(f"| `{rel}` | {('R31D-01' if rel.endswith('styles.css') else 'R31D-02' if rel.endswith('login.css') else 'R31D-03' if rel.endswith('shell.css') else 'R31D-04')} | `{product_hashes[rel]}` |" for rel in editable)
canonical_table='\n'.join(f'| `{rel}` | `{h}` |' for rel,h in {**canon_hashes,**controls,**reference_hashes}.items())
handoff=f'''# HANDOFF — Phase3-1d 디자인·접근성 통합 검수 CORRECT

- Task: 확정 디자인과 L4 잠금 접근성을 맞춰 전체3-1 통합 검수를 통과한다.
- Action: CORRECT
- From: Sol(xhigh, Codex) — orchestrator
- To: Gemini — implementation coder
- Time: {time}
- 회신: 필요 — 사용자 수동 전달
- Repository: `C:\\Projects\\Active\\ShiftMgmt_V4`
- Branch: main
- Baseline commit: `{baseline['head']}`
- Expected initial status:92행,LF 연결/마지막LF 없음 SHA `{baseline['statusSHA']}`. §12에 정확한 전량 목록.
- Routing: frontier — Sol의 최종 통합 검수·수용 판정.

## 회신 요청

Gemini는 아래 착수 게이트를 확인한 뒤 닫힌 범위만 구현·검증하고 맨 아래 `## 회신`에 응답한다. 자동 AI CLI 호출은 없다. 이 본문은 수정하지 않는다. 회신 후 Sol이 독립 재검증한다.

## 1. 목표와 비목표

확정 디자인 시스템 v1.3에 맞는 로그인·셸·홈 공통 스타일과,포커스 가능한 L4 입력 조건 잠금을 제공한다.

이번 작업은 기존3-1d 검수의4종 결함 수정이다. 미구현8업무 화면 연결,활동 이력3-2,새API/계산/DB/권한,운영 데이터,의존성,재설계,정본 토큰 변경,3-1e 커밋/푸시는 범위 밖이다.3-1c 수용된 홈 오류·액션 수명 구현은 보존한다.

## 2. 현재 상태·실패 근거

Sol이 사용자 “오케이 직접 테스트 진행해”에 따라 실제 설치 Chrome154.0.8037.58/1440×900에서 직접 검수했다. 최종8그룹/78조건 중64 PASS·14 FAIL,15캡처,예기치 않은 브라우저 오류0. 전량 근거는 제어 저장소 `.ai/reports/phase3-1d-20260930/report.md`,`scope-evidence.json`,`{run_dir.name}/results.json`이다.14는 중복 영향을 포함한 검사 조건 수다. 정적 추가4항목은 별도 기재했다.

**Stable defect IDs: R31D-01,R31D-02,R31D-03,R31D-04. 모두 미종결.** 제품 수정0,HEAD/status92/324제품 파일 불변,기존132파일/912시험과26 Chrome 시나리오의 수용 증거를 재사용했다.3-1d는 🔄,3-1e는 ☐다.

기존 루트 HANDOFF는 교체 전에 원문 바이트로 보존했다: `Log/{archive.name}`,{len(old)}bytes/SHA `{sha(old)}`. 최초 시험 전제 오류와 임시 폴더 잔여는 report.md에 공개했다. 신규 코드 수정 예외를 Sol이 받은 것으로 해석하지 않는다.

## 3. 정본과 불변조건

- 운영 권한: AGENTS.md→.ai/HARNESS.md→PROTOCOL.md→GEMINI.md. 정상 제품 코더 Gemini,최종 판정 Sol. TODO/제어 문서 편집은 Sol만.
- 제품 불변: CLAUDE.md,07-invariants-and-pitfalls.md. V3.4와 실제 운영 DB 읽기 전용. 계산·업무·기존 데이터 이력 변경 금지.
- 토큰 값은 `시안/2026-09-06-최종정리/05-디자인-시스템-확정본-v1.3.md` §1/2/3/4/5/6/7,규칙은 `11-디자인-요청서.md` §C-4/§E-3/§K.
- 지정 로그인·셸 참조는19차/2차 HTML4개,홈은1차 승인03-home-1/2. 지정 HTML에 옛 토큰/헤더/가짜128건이 있어도 토큰 정본과3-1b/c 지시를 우선한다. 상태 라벨바·샘플 판번호·미구현 목적지 버튼은 만들지 않는다.
- 비관리자 감시 칸/API 자동 호출 금지. 관리자 메뉴 숨김,보호 조회 `AUTH_FORBIDDEN`/HTTP200 계약,세션 없음 `AUTH_SESSION_REQUIRED`/401 계약을 그대로 둔다.
- 입력 조건 잠금은 aria-disabled+aria-describedby+포커스 가능+클릭/Space/Enter 차단. 처리 중 잠금은 native disabled+isSubmitting 가드로 별개다.
- 공통 오류 수집기와 수용된28개 홈 액션 수명 조건을 약화하지 않는다.

## 4. 수정 경계 — 닫힌5파일

| 제품 상대경로 | ID | 착수 전SHA-256 |
|---|---|---|
{edit_table}

이외 제품 경로 전부 보호한다. 전량324파일 기준은 제어 저장소 `scope-evidence.json`의 productFiles(위5개 제외319개),삭제 상태는 §12로 대조한다. scripts/lib/ui-check.mjs,home.ts/home.mjs,app.ts,shell.ts,status-bar.ts,홈CSS/모델,서버/auth/API/DB,package.json/lockfile는 수정 금지. 테스트·빌드의 기존 ignored artifacts/dist 출력만 허용한다. 임시 테스트 DB는 시스템 임시 폴더의 신규 `shiftmgmt-sol-31d-*`를 쓰며 이번 테스트 helper가 정리한다.

제어 저장소 TODO/AGENTS/PROTOCOL/GEMINI/CLAUDE/07/정본/.ai/Log는 읽기 전용이다. Gemini는 이 파일의 마지막 회신 칸만 채운다. git commit/stage/push/checkout/reset/stash/clean 금지. 원래92경로 사용자 변경을 보존한다.

## 5. 요구사항 — 결함별 수용 기준

| ID | 대상/현재 실패 | 기대 결과 |
|---|---|---|
| R31D-01 | styles.css :root6색 | --bg #F4F5F7,--line #E2E5EA,--text #1F2430,--text-sub #4B5563,--accent-hover #32479B,--success-bg #E8F5EE. accent/surface/strongline/기존 상태 계약 유지 |
| R31D-02 | login.css 배경/입력/텍스트 버튼 | .login-container 배경 #E5E7EB; .form-input/.btn-eye-toggle 모서리6; 로그인 .btn-primary/.btn-secondary 텍스트14px. 카드460px/8px/36px32px/승인 그림자 유지 |
| R31D-03 | shell.css 카드·토글·제목·감시 버튼 | .content-card 모서리6/그림자없음; .btn-sidebar-toggle 모서리6; .header-title20px/600; .btn-statusbar-restart12px/모서리6. 상태줄32/셸220↔64/헤더56/본문812 유지. 지정 역할 배지12는 유지 |
| R31D-04 | login.ts L4 validate/submit + login.mjs flow | 약한/불일치 상태는 포커스 가능,aria-disabled=true,aria-describedby=l4-rule-desc,항상 보이는 적절한 사유. native disabled는 처리 중에만. 클릭/Space/Enter/폼Enter 모두 changePassword 호출0. 유효 입력은 Enter로1회 호출,즉시 입력 정리/세션 재확인/세대 차단/오류 상태 유지 |

추가 정적4항목은 R31D-02/03의 같은 규격 위반이다. 새로운 디자인 제안이 아니다. L1 카드 테두리는 R31D-01 공통선 수정으로 해결한다.

## 6. Sol 코드 전략 — 순서대로

1.styles.css의 지정6값만 수정한다. 다른 토큰과전역구조는 건드리지 않는다.
2.login.css에서 승인 로그인 배경을 별도로 적용하고입력/눈 버튼6을 맞춘다. home.css의 전역 .btn-primary13px가 뒤에 로드되어 현재 로그인14px를 덮는다. `.login-container .btn-primary,.login-container .btn-secondary`처럼 로그인으로 한정한 선택자로14px를 보장한다. 홈 버튼 규격은 변경하지 않는다.
3.shell.css의 §5 선택자만 맞춘다. CSS만 변경하고 메뉴/상태줄 데이터 흐름은 유지한다. 작은 상태줄 버튼은12px로 올리되32px상태줄 안에서 잘리거나 넘치지 않아야 한다.
4.login.ts renderL4의 검증은 기존 password-policy 재사용. `canSubmitChange` 등 명시적인 유효 상태를 validate에서 계산한다. 입력 조건 미충족 때 native disabled=false/aria-disabled=true/사유 연결을 적용한다. 조건 충족 시 잠금·사유 해제. submit 가드는 postChangeState/isSubmitting에 더해 유효 상태를 확인하여 native disabled 여부에 의존하지 않는다. required/currentPassword검증을 유지한다. 실제 요청을 시작하는 구간의 native disabled/isSubmitting=true,즉시3입력 정리,postChangeGeneration/verifyPostChangeSession 흐름은 보존한다.
5.login.mjs flow의 기존 약한/불일치 `isDisabled()` 검사2곳은 새정본에 맞춰 aria/사유/포커스 및 실제 API 호출0 확인으로 교체한다. 버튼이 단순 enabled라는 검사로 약화하지 않는다. 현재 비밀번호를 유효하게 채운 상태에서 각 잠금 입력을 검수하고 클릭/Space/Enter/폼Enter 차단을 계측한다. 약한/불일치 뒤 유효 비밀번호로 Enter 제출을 확인한다. 나머지11 로그인 시나리오를 삭제하거나 재작성하지 않는다.

L4 상태 조건 잠금과 처리 중 잠금을 하나로 섞거나,isSubmitting을 단지 aria-disabled로 치환하지 않는다. 서버 비밀번호 정책/API 오류코드/세션 매니저는 수정하지 않는다. 파일 전체 재생성/광역포맷 금지.

## 7. 착수 게이트 / 즉시 중단

repo/branch/fullHEAD/status92/허용5파일 해시/보호319파일/정본 해시를 모두 실측한다. 하나라도 다르거나 범위 밖 파일·의존성·API/DB/권한 변경이 필요하면 수정 없이 BLOCKED로 회신한다. 읽기 전용 제어 검수 helper는 변경하지 않는다. 검증 자체의 전제가 제품 규약과 충돌하면 실패와 근거를 회신한다.

## 8. 검증 명령·순서

제어 저장소=`C:\\Projects\\Active\\교대근무관리 시스템`,제품 저장소=`C:\\Projects\\Active\\ShiftMgmt_V4`.

| 작업경로 | 정확한 명령 | 기대 |
|---|---|---|
| 제품 | npm run typecheck | exit0 |
| 제품 | node --check scripts/ui-checks/login.mjs | exit0 |
| 제품 | npm run lint | exit0/오류0,기존 경고5 보존 |
| 제품 | npm run validate:map | exit0/CODEBASE_MAP_OK82 |
| 제품 | npm run build | exit0/WEB_ASSETS_OK |
| 제품 | git diff --check | exit0/기존 줄바꿈 설정 유지 |
| 제어 | node .ai/reports/phase3-1d-20260930/start-test-server.mjs | 独立127.0.0.1:18740 서버준비,server-info.json |
| 제어/다른 셸 | node .ai/reports/phase3-1d-20260930/integration-check.mjs | exit0 AND results failed=0/groupsFailed=0/unexpectedErrors=0,8그룹/78조건/15캡처 |
| 제어 | node .ai/reports/sol-direct-3-1c-20260930/run-ui.mjs | 기존전체26시나리오 exit0/각manifest PASS/전체40캡처,각임시자료정리true |
| 제품 | npm test | exit0/기존132파일912시험 유지(신규 관련시험이면 증가 가능,기존시험 삭제 금지) |

통합 helper 실행은 단일 서버만 사용한다. 격리 info.stopFile에 `stop`을 기록하면 helper가 소유 서버와 그 신규 임시 자료를 종료·정리한다. process-tree Ctrl+C만으로 종료해 임시 폴더를 남기지 않는다. 부트스트랩 자격증명·cookie·현재/새 비밀번호를 출력하거나스크린샷에 노출하지 않는다. 자동 정책 거부 경로는 report.md대로 건드리지 않는다.

**정적 추가4규격은 실제 Chrome computedStyle로 따로 계측한다**: 눈/사이드바/재시작 radius6,header-title20/600. 자동78조건만0FAIL이라고 추가4조건 수용을 생략하지 않는다. CSS 출력/캡처/실측을 회신에 포함한다.

## 9. 음성·회귀·UI 수용 기준

- N1 약한 비밀번호: 유효현재PW+약한새PW/확인; 버튼포커스/이유낭독 연결,클릭/Space/Enter/폼Enter에서 auth:change-password 요청0.
- N2 강한PW 확인불일치: N1과동일차단,불일치사유항상표시. 처음/중간문자입력에도처리중으로오인금지.
- N3 유효PW: 키보드Enter 요청1회,pending native disabled+isSubmitting으로중복0; 즉시비밀번호DOM정리,세션확인중 셸금지. 기존 post-change null/error/race/destroy11시나리오 보존.
- N4 비관리자3역할: 관리메뉴/감시칸없음,감시API자동0,명시조회AUTH_FORBIDDEN; session없는조회401후L1복귀.
- N5 스타일: 로그인 승인변형을 보존하며6공통색/로그인규격/셸규격 전부정본,카드그림자금지,2px포커스. 같은1440×900 실제Chrome에서확인. 새가짜UI 금지.
- N6 기존홈 실패→H4금지,H5즉시전환,복구/감시busy세대수명28조건전부PASS.
- scope: §4 allowlist외제품파일content0,status92외추가경로0,정본/지침/승인HTML불변,HEAD불변. 허용파일해시는실제full64자와byte수로회신.

## 10. 회신 증거·성공 조건

현재 검수와모든실패 실행을 숨기지 말고 각명령시각/exit/핵심값/모든manifest/캡처/임시정리상태를 기록한다. 구현자가 IMPLEMENTED를 쓰는 것은 제출이며완료승인이 아니다. Sol은 R31D-01~04와 추가4규격·보호범위를독립검증한뒤3-1수용/3-1e 여부를판정한다.

## 11. 정본·지침SHA-256 — 전량 읽기 전용

| 제어 상대경로 | SHA-256 |
|---|---|
{canonical_table}

## 12. 예상 초기 status92 — 원문행

```text
{chr(10).join(status)}
```

## 회신

> Gemini는 이 영역만 채운다.

```text
판정: IMPLEMENTED | BLOCKED | FAILED
기준: 저장소 / branch / 전체baselineHEAD / 최종HEAD
초기 상태:92행·statusSHA·허용5·보호319·정본/지침 전수대조
변경파일/범위밖변경:
결함대조:
- R31D-01: 원인 -> 변경위치 -> 재현/실측 -> PASS|FAIL
- R31D-02: 원인 -> 변경위치 -> 재현/실측 -> PASS|FAIL
- R31D-03: 원인 -> 변경위치 -> 재현/실측 -> PASS|FAIL
- R31D-04: 원인 -> 변경위치 -> 재현/실측 -> PASS|FAIL
정적추가4규격의실제Chrome실측:
명령전량: 실제명령 / 시작종료 / exit / 핵심값
음성시험: 입력·click/Space/Enter·요청수·사유연결·포커스·처리중잠금
UI: 실제Chrome판번호 / viewport / 모든manifest·캡처 / console·network / 임시정리
전체SHA-256/bytes: 각변경파일,보호검증,정본검증
diff요약: 추가삭제/기존수정보존/의존성0
실패와복구이력/미해결사항:
```
'''
(ROOT/'HANDOFF.md').write_text(handoff,encoding='utf-8')
handoff_archive=ROOT/'Log'/f'{stamp}_3-1d-Sol-CORRECT_발송본.md'
with handoff_archive.open('xb') as f:f.write((ROOT/'HANDOFF.md').read_bytes())
assessment_archive=ROOT/'Log'/f'{stamp}_3-1d-Sol-직접검수_검증본.md'
with assessment_archive.open('xb') as f:f.write((OUT/'report.md').read_bytes())

todo=ROOT/'TODO.md';text=todo.read_text(encoding='utf-8-sig');lines=text.splitlines(keepends=True)
for i,line in enumerate(lines):
 if line.startswith('> **현재 정본(2026-09-30)**'):
  lines[i]=f'> **현재 정본(2026-09-30)**: Phase1·2·2.5/3-0·3-1a/b/c ACCEPTED 및 하네스5.1 적용 완료 유지. 사용자 지시로 Sol이3-1d 직접 Chrome 통합 검수를 실행했다. 최종8그룹/78조건 중64 PASS·14 FAIL/15캡처/예기치 않은 오류0. 공통색·로그인규격·셸규격·L4 잠금 접근성4종 수정 필요. 정적추가4규격도 수정 packet에 포함. **3-1d CORRECT/전체3-1 미수용**,3-1e 대기. 제품324파일/HEAD/status92 불변. 상세 `.ai/reports/phase3-1d-20260930/report.md`,발송 정본 `Log/{handoff_archive.name}`.\n'
 elif line.startswith('| **다음 행동** |'):
  lines[i]='| **다음 행동** | 루트 HANDOFF의3-1d CORRECT를 Gemini에 수동 전달 → 닫힌5파일 디자인/접근성 수정 → Sol 독립 재검증 → 전체3-1 수용 뒤3-1e 커밋·사용자 확인. |\n'
 elif line.startswith('| **현재 확인** |'):
  lines[i]=line.replace('| **현재 확인** |','| **현재 확인** | 3-1d 직접 검수:64/78 PASS,14조건 미충족·정적추가4,권한/키보드/실제 세션 무효화 PASS,수정본 대기. 제품변경0/324해시·status92 불변. 최초 검수 임시 폴더1개 자동 삭제정책 거부로 잔여,2차/최종 임시자료정리 완료. 아래는 종전 수용 증거: ',1)
 elif line.startswith('| 3. 화면 재구축 |'):
  lines[i]=line.replace('3-1d/e 대기','3-1d CORRECT 진행/3-1e 대기')
 elif line.startswith('  - 🔄 3-1d.'):
  lines[i]=line.rstrip('\r\n')+f' **직접 검수 CORRECT(09-30):64/78 PASS,14조건 미충족·정적추가4. 공통색/로그인/셸/L4 잠금4종 수정 후 재검증.** 근거 `Log/{assessment_archive.name}`.\n'
todo.write_text(''.join(lines),encoding='utf-8')

state=ROOT/'.ai/current-state.md';oldstate=state.read_text(encoding='utf-8-sig')
oldbody=oldstate.split('\n',4)[4].replace('## Current task — direct fix accepted / harness applied','## Historical task — direct fix accepted / harness applied',1)
newstate=f'''# Current Project State

Status: PHASE_3_1D_CORRECT_REQUIRED_HARNESS_5_1_APPLIED

## Current task — direct integration verification / correction ready ({time})

- User authorized direct tests. Sol changed no product source. Final actual Chrome154/1440×900:8 groups,78 checks,64 PASS/14 FAIL,15 captures,unexpected browser errors0.
- Stable defects R31D-01 common6 colors,R31D-02 login design,R31D-03 shell design,R31D-04 L4 focusable validation lock/reason. Four additional static design measurements are included in the same correction packet.
- Role menus/actual forbidden APIs,keyboard actions/skip navigation,watch restart,real server session invalidation all PASS. Home icons are aria-hidden via ancestors; the initial test assumption was corrected and is not a product defect.
- Product324 file hashes,HEAD `{baseline['head']}`,status92/SHA `{baseline['statusSHA']}` unchanged. Reuse prior132 files/912 tests and26 Chrome scenarios; no claim of a new full unit-suite execution.
-3-1c remains accepted,harness5.1 remains applied.3-1d still in progress/CORRECT;3-1e commit pending. Normal product writer remains Gemini. Root HANDOFF is closed5-file CORRECT; manual user relay. No additional permission question required for already-authorized testing/control work.
- Three runs are retained: initial test-assumption failures,corrected run,final API-blocking evidence. Second/final server/browser/temp cleanup PASS; first server stopped but temp `{retained_path}` retained after two automatic policy rejection messages `blocked by policy`. No bypass deletion.
- Assessment `.ai/reports/phase3-1d-20260930/report.md`,full evidence `scope-evidence.json`; immutable assessment `Log/{assessment_archive.name}` and outgoing packet `Log/{handoff_archive.name}`.

Earlier entries below are historical and do not override this entry.

'''
state.write_text(newstate+oldbody,encoding='utf-8')
close={'time':time,'assessment':str(assessment_archive.relative_to(ROOT)),'assessmentSHA256':hashfile(assessment_archive),'receivedHandoffArchive':str(archive.relative_to(ROOT)),'receivedHandoffSHA256':hashfile(archive),'receivedHandoffBytes':len(old),'outgoingHandoffArchive':str(handoff_archive.relative_to(ROOT)),'outgoingHandoffSHA256':hashfile(handoff_archive),'outgoingHandoffBytes':handoff_archive.stat().st_size,'productChanges':0,'acceptance':'CORRECT','finalTests':result['summary']}
writej(OUT/'closeout.json',close)
print(json.dumps({'productFilesUnchanged':len(product_hashes),'status':len(status),'final':result['summary'],'assessment':str(assessment_archive.relative_to(ROOT)),'handoff':str(handoff_archive.relative_to(ROOT)),'firstTempRetained':True},ensure_ascii=False))
