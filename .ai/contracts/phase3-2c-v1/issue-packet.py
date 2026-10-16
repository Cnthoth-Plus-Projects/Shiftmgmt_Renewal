# -*- coding: utf-8 -*-
"""Sol packet preparation; --publish only copies an audited preview to HANDOFF."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timezone, timedelta

HERE = Path(__file__).resolve().parent
CONTROL = HERE.parents[2]
PRODUCT = Path(r"C:\Projects\Active\ShiftMgmt_V4")
REVIEW = CONTROL / ".ai/reports/phase3-2c-review-20261001_160642"
HEAD = "160940f9aaeb6696538447f83b44658073e382f0"
ALLOWED = ["scripts/ui-checks/access-history.mjs", "scripts/ui-checks/access-history-shared.mjs",
           "scripts/ui-checks/access-history-positive.mjs", "scripts/ui-checks/access-history-negative.mjs"]


def sha(data):
    return hashlib.sha256(data).hexdigest().upper()


def info(path):
    data = Path(path).read_bytes()
    return {"bytes": len(data), "sha256": sha(data)}


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(text.encode("utf-8"))


def write_json(path, value):
    write(path, json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def git(*args):
    return subprocess.check_output(["git", *args], cwd=str(PRODUCT)).decode("utf-8").strip()


NEGATIVE = [
    ("A-N01", "owner 인수0 / --case= / unknowncase", "각RC1; temp/server/worker/network0"),
    ("A-N02", "owner 중복case / --case와 별도값 / --url / positional URL / case 앞뒤공백", "각RC1; 외부 요청0; 자동trim/default0"),
    ("A-N03", "positive/negative/shared direct CLI: knowncase·unknowncase·인수0·2개", "각RC1; bootstrapread/network/browser/mkdir0"),
    ("A-N04", "direct worker에 forged SHIFT_*/SHIFTMGMT_* URL/run/bootstrap와 가짜 healthy stub", "IPC 없으면 RC1, stub request0, 원worker unknown-case우회0"),
    ("A-N05", "IPC 있음/packet없음·timeout / nonce·ownerPid·workerPid·ppid·case 불일치", "각nonzero; dispatch전 sideeffects0; 자기child kill뒤close확인"),
    ("A-N06", "IPC contractPath/digest 누락·불일치 / run/temp/bootstrap realpath 외부·형제경로·symlink", "각nonzero; outside read/write/network0; source변경0"),
    ("A-N07", "caller tolerance2·4·NaN / actualNaN·Infinity / numeric133.5 기대132 오차1", "모두거부;132와133은경계정상;상수actual/provenance불일치거부"),
    ("A-N08", "core receipt ID 하나누락·중복·unknown·extra / caseunknown", "각nonzero; 누락/중복/추가 실제목록기록; 빈required집합0"),
    ("A-N09", "fixture schedule-publish 근무편성공개 / canonical compiled label/hash drift", "각nonzero;canonical fullmap/bytes 실측; 실제정본변경0"),
    ("A-N10", "core raw console SOL_UNEXPECTED_UNRELATED_CONSOLE_ERROR_401 또는 pageerror", "각nonzero;raw원문보존;문자열401예외0"),
    ("A-N11", "context.close 실제종료후throw / browser.close 실제종료후throw", "각nonzero;다른자원close시도·첫실패/cleanup보존;누수0"),
    ("A-N12", "worker timeout·kill요청 / kill했지만close이벤트미관측 / server stop timeout", "각nonzero;timer=close0;PIDs/close/잔여temp실측;타PIDkill0"),
    ("A-N13", "worker spawn error / server spawn error / listening 로그확인전 server종료", "각nonzero;bootstrap/health순서우회0;partial/log/정리기록"),
    ("A-N14", "owner-final 쓰기거부(동기/async/atomicrename 실제사용API) / worker-final 쓰기거부", "각nonzero;parent PASS출력0;실패경로/첫stack stderr;자원종료확인"),
    ("A-N15", "stdout/stderr 로그쓰기 또는capture/core-observations 쓰기거부", "각nonzero;stdoutPASS0;가능한partial보존;close/cleanup완료"),
    ("A-N16", "owner final에서 capture 누락·hash불일치·외부경로·깨진PNG / worker-final없음", "각nonzero;파일존재/bytes/hash/path정확확인"),
    ("A-N17", "protected ui-check preflight health/Chrome 실패로 steps전 process.exit", "parentnonzero;원stdout/stderr/childRC·미실행/partial미생성표시;finally가정0"),
    ("A-N18", "18741 사전점유 자기stub / inherited SHIFT_*,SHIFTMGMT_*,NODE_OPTIONS 오염", "포트점유시foreignHTTP0/server0/temp0;정상owned실행은오염0·execArgv자동전달0"),
    ("A-N19", "정상8case의 requiredfull ID 누락 / legacy extraID", "RC1/FAIL_INCOMPLETE,missing/extra/duplicate및모든실제오류보존;case/전체PASS0"),
    ("A-N20", "core 관측 actual과raw pointer 불일치 / caller expected/pass/tolerance 필드", "각nonzero;record의자기PASS를믿지않음"),
]


def prepare():
    now = datetime.now(timezone(timedelta(hours=9)))
    stamp, when = now.strftime("%Y%m%d_%H%M%S"), now.strftime("%Y-%m-%d %H:%M:%S KST")
    report = CONTROL / (".ai/reports/phase3-2c-foundation-plan-" + stamp)
    report.mkdir(parents=True, exist_ok=False)
    old = (CONTROL / "HANDOFF.md").read_bytes()
    assert sha(old) == "FB072898CC88DE9C0326F0C6A1A68A821D68D18922ADF00F94F5378E627CBB40"
    archive = CONTROL / ("Log/" + stamp + "_3-2c-Sol-REPLAN_새패킷전_보존본.md")
    with archive.open("xb") as target:
        target.write(old)
    assert archive.read_bytes() == old and info(archive) == info(CONTROL / "HANDOFF.md")
    received = json.loads((REVIEW / "final-evidence.json").read_text(encoding="utf-8"))
    names = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=str(PRODUCT)).decode("utf-8").rstrip("\0").split("\0")
    files = {name: info(PRODUCT / name) for name in names}
    assert len(files) == 341 and files == received["sourceManifest"]
    assert git("rev-parse", "HEAD") == HEAD and git("branch", "--show-current") == "main"
    status = subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=all"], cwd=str(PRODUCT)).decode("utf-8").splitlines()
    assert len(status) == 12
    write_json(report / "source-before.json", {"head": HEAD, "branch": "main", "status": status, "files": files})
    contract_info, checker_info, strategy_info = info(HERE / "contract.json"), info(HERE / "verify-evidence.py"), info(HERE / "STRATEGY.md")
    command = ["python", str(HERE / "verify-evidence.py"), "--contract-sha", contract_info["sha256"], "--self-test"]
    trial = subprocess.run(command, capture_output=True, cwd=str(PRODUCT))
    write_json(report / "checker-self-test.command.json", {"argv": command, "cwd": str(PRODUCT), "time": when, "rc": trial.returncode})
    (report / "checker-self-test.stdout.txt").write_bytes(trial.stdout)
    (report / "checker-self-test.stderr.txt").write_bytes(trial.stderr)
    assert trial.returncode == 0
    self_test = json.loads(trial.stdout.decode("utf-8"))
    assert self_test["result"]["rejectedMutations"] == 19
    # Only approved current status/next-action fields change. Preserve historical bytes.
    todo_path = CONTROL / "TODO.md"
    todo_raw = todo_path.read_bytes()
    todo = todo_raw.decode("utf-8")
    newline = "\r\n" if "\r\n" in todo else "\n"
    latest = ("> **최신 정본(" + when + ")**: 사용자 「오케이 진행해」 승인에 따라 3-2c 독립계약 v1 고정, **A 기반 IMPLEMENT READY_TO_CODE / 사용자 중계 대기**. 외부계약 CORE9/fullUI87ID·독립checker19변조거부. 제품341/dirty12/HEAD불변·4검증파일만허용·337보호. Gemini는A(owner/IPC/coverage/정리/증거)만 구현, B전체화면은A독립수용후별도패킷. FAILED/REPLAN과R32C-06이력유지·수정회수초기화0. AcorePASS≠전체3-2수용. 정본 `.ai/contracts/phase3-2c-v1/STRATEGY.md`, 현재 `HANDOFF.md`. 아래는 이전 이력.")
    assert "## 지금 위치와 다음 행동" + newline in todo
    todo = todo.replace("## 지금 위치와 다음 행동" + newline, "## 지금 위치와 다음 행동" + newline + newline + latest + newline, 1)
    todo = todo.replace("| **지금 위치** | **Phase3-1c ACCEPTED · 하네스5.1 적용 완료(2026-09-30).** 아래는 과거 진행 이력:", "| **지금 위치** | **Phase3-2c-A 기반 IMPLEMENT 준비 완료 / 사용자 중계 대기.** 아래는 과거 진행 이력:", 1)
    lines = todo.splitlines(keepends=True)
    output = []
    found = set()
    for line in lines:
        if line.startswith("| **다음 행동** |"):
            line = "| **다음 행동** | 현재 HANDOFF를 Gemini에 중계해 허용4파일의 A 기반(owner/IPC/coverage/정리·증거) 구현→Sol 독립 검수. immutable 계약/checker 및337제품파일 보호. B 전체시나리오는 A 수용 후 별도 HANDOFF. |" + newline
            found.add("next")
        elif line.startswith("| **그 다음** |"):
            line = "| **그 다음** | A 수용→B 전체10case 독립검수→3-2d 커밋·사용자확인→3-3 인력 관리 순서. 3-1e 사용자 직접 시각 확인은 별도 대기. |" + newline
            found.add("after")
        elif line.startswith("| 3. 화면 재구축 |"):
            line = "| 3. 화면 재구축 | 1/10 | 🔄 3-0/3-1a~d 완료·3-1e 직접확인 대기. 3-2c 기존제출 FAILED/REPLAN, A 기반 IMPLEMENT 준비·B 대기. 3-2 수용·커밋 보류 |" + newline
            found.add("phase")
        elif line.startswith("  - 🔄 3-2c."):
            line = "  - 🔄 3-2c. 기존 검증기 제출 FAILED/REPLAN 이력 유지. 사용자 진행 승인(2026-10-01)→독립계약 v1(CORE9/fullUI87)·Sol checker19변조거부·337파일보호/4검증파일허용. A 기반만 새 IMPLEMENT 준비; B와전체3-2수용은 대기. 근거 `.ai/contracts/phase3-2c-v1/STRATEGY.md` / 현재 `HANDOFF.md`." + newline
            line += "    - 🔄 3-2c-A. owner/IPC·외부고정coverage·정리/쓰기 실패·partial증거 기반 구현. READY_TO_CODE / 사용자 Gemini 중계 대기. 실제 core9·회귀2·기반음성20그룹을 구현후 Sol 독립검수." + newline
            line += "    - ☐ 3-2c-B. A 독립수용 후 별도 패킷으로8화면/2회귀 전체87ID·시각/query/callback·fault검증. 현재 구현허용0." + newline
            found.add("task")
        output.append(line)
    assert found == {"next", "after", "phase", "task"}
    write_json(report / "control-before.json", {"TODO.md": info(todo_path), ".ai/current-state.md": info(CONTROL / ".ai/current-state.md")})
    (report / "TODO.before.md").write_bytes(todo_raw)
    (report / "current-state.before.md").write_bytes((CONTROL / ".ai/current-state.md").read_bytes())
    todo_path.write_bytes("".join(output).encode("utf-8"))
    state_path = CONTROL / ".ai/current-state.md"
    old_state = state_path.read_bytes().decode("utf-8")
    eol = "\r\n" if "\r\n" in old_state else "\n"
    assert old_state.startswith("# Current Project State")
    historical = old_state.split(eol, 4)[4]
    new_state = f"""# Current Project State

Status: PHASE_3_2C_A_READY_TO_CODE_USER_RELAY_PENDING

## Current task — fixed independent contract and foundation IMPLEMENT prepared ({when})

- User 「오케이 진행해」 approved contract-first replan and new Gemini packet. Sol remains sole orchestrator/product edits0; Gemini implements only four existing verifier modules via manual HANDOFF relay; no other AI CLI/commit/push/deploy.
- Prior FAILED/REPLAN and R32C-06/V32F-01~06 retained; two-correction history not reset. New A foundation strategy has fixed external contract/checker; B full UI requires independent A acceptance plus a separate packet. Current READY_TO_CODE applies to A only.
- contract v1: CORE9, fullUI87 IDs across existing10 cases. A core proves actual owned server/installed Chrome login DOM, raw observations/canonical compiled labels, artifact integrity and cleanup; no sign-in/UI-completion inference. Existing normal8 cases fail closed FAIL_INCOMPLETE for missing/extra IDs; protected regression2 requires real child evidence.
- Sol checker parser selftest positive2/rejected19 RC0. This is parser evidence only, not Gemini runtime evidence. Product HEAD {HEAD}/main, source341/dirty12 unchanged vs closed review. Allowlist4, protected337 incl current map/UI/model/helper/deps; new productfile0.
- Locked contract/schema/strategy/checker/baseline: {HERE}. Gemini read-only. Product strategy and manual handoff body must not be changed; fill only exact standalone ## 회신 section. TODO was updated after old target closure under user's new approval, and is now re-locked in baseline.
- Scope and core evidence validator invoked with exact full SHA from HANDOFF; all named canonical files rehashed. Source-map90 remains frozen. A independent runtime/20 negative groups remains future/unverified until Gemini reply.
- Received closing HANDOFF archived unchanged at {archive}; its52871byte earlier Gemini receipt and closed-review15601byte assessment retain separate immutable records. New outgoing bytes/hash and exact reply-boundary digest are recorded in the current plan report dispatch.json.
- Latest plan evidence {report}. Economy extraction and balanced Terra fallback gpt-6-sol supplied read-only evidence; Sol checked cited source/schema and corrected visibility/canonical/version evidence limitations. No subagent edits or completion authority transfer.
- Full3-2/3-2d/3-3 pending;3-1e user direct visual confirmation not claimed. Harness5.1/project overlay4.0 unchanged. Relevant JIT P04/P05/P06/P10/P13/P17/P21/P25/P26 record_only; MCP capabilities inspected, no new MCP failure.

Earlier entries below are historical and do not override this entry.

## Historical task — verifier redesign rejected, prior closeout ({'2026-10-01 16:37:56 KST'})

"""
    write(state_path, new_state.replace("\n", eol) + historical)
    control_names = list(received["canonicalPreCloseout"]["files"])
    controls = {str(CONTROL / name): info(CONTROL / name) for name in control_names}
    for name in ("contract.json", "STRATEGY.md", "verify-evidence.py"):
        controls[str(HERE / name)] = info(HERE / name)
    baseline = {"time": when, "repository": str(PRODUCT), "head": HEAD, "branch": "main", "status": status,
                "files": files, "allowed": ALLOWED, "control": controls,
                "previousReview": str(REVIEW / "final-evidence.json")}
    write_json(HERE / "baseline.json", baseline)
    baseline_info = info(HERE / "baseline.json")
    table = "\n".join("| `" + name + "` | " + str(files[name]["bytes"]) + " | `" + files[name]["sha256"] + "` |" for name in ALLOWED)
    lock_table = "\n".join("| `" + name + "` | " + str(info(HERE / name)["bytes"]) + " | `" + info(HERE / name)["sha256"] + "` |" for name in ("contract.json", "STRATEGY.md", "verify-evidence.py", "baseline.json"))
    check = f'python "{HERE / "verify-evidence.py"}" --contract-sha {contract_info["sha256"]} --baseline-sha {baseline_info["sha256"]}'
    core_ids = json.loads((HERE / "contract.json").read_text(encoding="utf-8"))["foundation"]["rules"]
    core_table = "\n".join("| " + r["id"] + " | `" + r["pointer"] + "` | " + (json.dumps(r["expected"], ensure_ascii=False) if "expected" in r else r["op"]) + " |" for r in core_ids)
    negatives = "\n".join("| " + " | ".join(row) + " |" for row in NEGATIVE)
    packet = f"""# HANDOFF — Phase3-2c-A 검증 기반 IMPLEMENT / 독립계약 v1

- Task: 허위 PASS를 차단하는 owner·IPC·고정coverage·정리/증거 기반만 구현
- Action: IMPLEMENT — 새 단계 전략 A, 이전 CORRECT 회수 초기화 아님
- From: Sol(frontier/xhigh, Codex) — sole orchestrator
- To: Gemini — implementation coder / 사용자 수동 중계
- Time: {when}
- 회신: 필요
- State: READY_TO_CODE(A only) / USER_RELAY_PENDING
- Repository: `{PRODUCT}`
- Branch: main
- Baseline commit: `{HEAD}`
- Product source: 341 files / dirty paths12 / 허용4 / 보호337 / 새제품파일0
- 이번 결과가 수용해도 전체3-2c/Phase3-2 완료·commit·3-3 착수로 확대하지 않는다.

# 회신 요청

Gemini는 착수 게이트 불일치면 제품을 수정하지 않고 이 파일 맨 아래 정확한 단독행 `## 회신`에 BLOCKED로 답한다. 구현·검증 후 IMPLEMENTED 또는 FAILED와 원증거를 같은 칸에 기록한다. 본문 수정0; `## 회신 요청`을 회신 경계로 오인하지 않는다. 회신이 없으면 Sol 독립 검수/A수용/B 발송이 진행되지 않는다.

## 1. 목표와 비목표

**목표**: 외부에서 고정한 계약을 사용하여 검증 누락·잘못된 관측·worker 우회·정리 및 파일쓰기 실패가 RC0/PASS로 보고되는 경로를 차단한다. 실제 소유 서버와 Chrome 로그인 화면을 읽는 contract-core와 보호 회귀2를 실행하고, 기존 화면8case는 coverage가 미완성이면 정확히 실패한다.

**비목표**: A에서 기존 화면8case 본문 재작성/전체87ID 채우기, UI/CSS/셸/모델/권한/API/DB/양식/계산 수정, 새 제품파일/의존성/설정, 공통helper/map 수정, 운영자료 사용, SQL직접삽입, 전체완료/commit/push/deploy. B는 A를 Sol이 독립수용한 뒤 별도 새 패킷으로 허용한다. Sol을 대신한 요구사항/수용 판정0.

## 2. 현재 상태·실패 근거·동결 기준

현재 TODO 3-2c는 FAILED/REPLAN 후 사용자 「오케이 진행해」 승인으로 A 구현준비/B대기이다. 직전 검수 static/build/관련11·전체133파일919시험/실Chrome10case13캡처 PASS였지만7개 변조 중6개 falsePASS, zeroargs와 unknownworker도RC0였다. 근거 `{REVIEW / 'final-evidence.json'}` 및 immutable `Log/20261001_163756_3-2c-Sol-FAILED-REPLAN_독립검증종결본.md`. 이는 화면 결함 전체 재발 판정이 아니라 검증기 수용 실패다.

| 결함 | 이번 A 대조 | B에 남는 고정 검증 |
|---|---|---|
| V32F-01/R32C-06 | 외부ID·exact set·raw provenance·unknown 거부 | 8화면의 실제 전체 행동과87ID |
| V32F-02 | numeric<=1·nonfinite거부·canonical8fixture라벨 수정 | ID/순서/count/title/badge computed style 변조 |
| V32F-03 | core 예상외오류0·raw정밀형식·broad401 소거 | real401/status/code/data/phase/count 전체행동 |
| V32F-04 | 실제exit/close/PID·cleanup/write 실패전파 | 모든normal/negative 실행에서 독립재확인 |
| V32F-05 | 정확CLI·atomicdir·IPC PID/nonce/path/contractguard | 전체case정상호출 재확인 |
| V32F-06 | stdout/stderr/partial/capture·firststack·manifest 연결 | 모든8case full raw/action/trace |

현재 예상 git status는 아래12행과 정확히 같아야 한다. 기존 사용자 변경을 정리/복원하지 않는다.

```text
{chr(10).join(status)}
```

baseline의341파일 전체 bytes/fullSHA가 현재실측과 닫힌review sourceManifest와 일치했다. 독립검수전후 변경파일337개 보호를 machine scope gate로 검사한다. 허용4개 착수 기준:

| path | bytes | SHA-256 |
|---|---:|---|
{table}

외부 잠금 디렉터리 `{HERE}`. 아래4파일은 실측 bytes/fullSHA 일치가 필수이고 Gemini 수정0. `baseline.json`은 source341와 기존정본15+계약/전략/checker3=Control18의 정확한 시작값을 포함한다.

| control file | bytes | SHA-256 |
|---|---:|---|
{lock_table}

## 3. 수정 경계 — 닫힌 목록

| 제품경로 | 요구사항 | 허용 변경 | 금지 |
|---|---|---|---|
| scripts/ui-checks/access-history.mjs | A01~A10 | 정확CLI·atomic owner dir·server/child lifecycle·IPCdispatch·고정coverage/실제회귀수집·최종증거 | 제품UI/DB/외부server/범위확장 |
| scripts/ui-checks/access-history-shared.mjs | A02~A09 | 순수계약loader/비교기/collector·IPCguard·error/lifecycle helper·fixture 정본라벨·directcore진입 | import시실행·별도module생성·상수actual |
| scripts/ui-checks/access-history-positive.mjs | A03/A05~A09 | guard·partial collector·capture/manifest 연결·outer integration | 기존6case 행동본문 전면변경·B시나리오 구현 |
| scripts/ui-checks/access-history-negative.mjs | A03/A05~A09 | guard·raw event 정밀수집·부분증거·finally·broad401예외제거 | errors/session full B시나리오 재작성·authmock |

4 .mjs 각각30,000bytes 이하. source파일 집합341, dirty12 유지(새tracked/untracked source0·삭제/rename0). 그외337파일, 현재 docs/codebase-map.md(90paths), src/web 전체, tests/config/package/lock/build, scripts/lib/ui-check.mjs, find-chrome, shell/home 검증기 보호. `{CONTROL}`의 TODO/AGENTS/PROTOCOL/CLAUDE/GEMINI/.ai/기존Log 전부읽기전용, 이 HANDOFF의 `## 회신`만쓰기. V3.4 전체읽기전용.

시험/빌드 산출물만 기존 ignored dist/node_modules/artifacts를 사용한다. fault·시험harness는 `artifacts/captures/phase3/access-history-foundation-probes/` 아래 mkdtemp `run-` 자기디렉터리의 ignored `.mjs`/JSON/log/PNG로 생성해 보존한다. 이것은 검증용 artifact 허용이며 제품source신규 허용이 아니다. 이전Sol report/Log/output을 실행해서 덮지 않는다. 과거temp·타PID·브라우저프로필/운영자료 정리0. 시험기자체가 누수를 남기면 자기 PID/경로만 명확히 식별하여 정리하고 증거를 기록한다.

## 4. 요구사항

| ID | 입력/동작 | 기대 결과 / 실패 | 구현 |
|---|---|---|---|
| A01 | public argv | 정확1개 --case=등록값만. 0/2+/empty/공백/unknown/URL즉시RC1, temp/spawn/network0 | owner+sharedpureparser |
| A02 | 외부contract/baseline | bytes/fullSHA·case/ID exact·expected외부읽기·no finite/tolerance bypass | shared/owner |
| A03 | privateentry | actualIPC+ppid/childpid/nonce/case/ownedrealpath/contract검문 뒤만 ack·bootstrap/network/browser/mkdir | shared/positive/negative |
| A04 | ownedserver | 포트사전점유이면foreignHTTP0/temp0/spawn0; sourceanchored repository·mkdtemp격리·actualPID/listenlog/temp/health 일치 | owner |
| A05 | actual관측/collector | raw source와actual연결·partial기록·ID누락/중복/추가FAIL·numericfinite<=1·원값immutability | shared+workerwrappers |
| A06 | cleanup | created→close-start→closed 실제await; child/server exit+close확인후own temp삭제;timeout/kill요청=성공0 | owner/shared/negative |
| A07 | 증거 | stdout/stderr·원event·capture실경로/hash·부분/최종·firststack·원manifest 연결; 모든쓰기실패nonzero | 네파일 |
| A08 | errorledger | console/page/requestfailed/HTTP 이벤트전부원형; 예상예외exact상관만·문자열401예외0; core expected0 | shared/negative/core |
| A09 | contract-core | 실제owned서버/Chrome/fonts/loginDOM/fixture정본9ID/7artifact·리소스종료; core only PASS | shareddirectentry+owner |
| A10 | regression/normalgate | 보호shell/home 실제argv/manifest/capture/RC·3ID각. 기존normal8는fullcoverage누락FAIL_INCOMPLETE·phase전체완료0 | owner+minimalwrappers |

## 5. Sol 코드 전략 — 순서와 상태

1. **순수shared 계약/비교기부터**: static import는 sideeffects0. contract.json exactpath와 본문SHA를 loader로 읽는다. knowncase가 없으면 required=[] 반환0, throw. exact IDset·duplicate/extra/missing·callerexpected/tolerance/pass 거부를 구현한다. numeric에서 finite/type(booleans≠numbers)와 tolerance<=1. collector는 append-only snapshot이며 바깥 배열 수정으로 판정값이 바뀌지 않는다. 오래된 normal의 legacyID도 원값기록은 보존하되 최종fullcoverage에서거부한다.
2. **shared fixture 정본 수정**: 현재 schedule-publish=근무편성공개를 compiled `dist/server/shared/domain/access-log.js`의 accessLogActionLabels에서 근무표 배포로 가져온다. 고정8actions와 순서·canonical전체map을 매번 실제import해 대조한다. source map/type/도메인파일 수정0. core는 `createMockAccessLogs`의 생성라벨을 직접관측하고 임의 기대배열을 actual로 복제하지 않는다.
3. **owner 상태관리**: script URL에서repo root를정하고 현재cwd/expectedrepo를검문한다. CLI beforetemp/network. createUniqueRunDir(base,caseid) 재사용 atomic run 생성. 18741bind 사전검문(타serverhealth0) 뒤 temp mkdtemp/register, 모든SHIFT_/SHIFTMGMT_ 및NODE_OPTIONS 오염삭제·ownedenv만설정. DEFAULT_ADMIN_BOOTSTRAP_PASSWORD 등 기존본계약 재사용하되 비밀번호/쿠키/nonce원문로그0.
4. **서버/worker IPC**: 소유spawnPID를즉시등록, 원stdout/stderr파일을보존. listening 원로그에 정확URL+own temp 경로 및 생존PID를확인하기전health0. bootstrap exact ownpath와health status200/body.ok=true를 bounded관측. owner가 `stdio:['ignore','pipe','pipe','ipc']`로 workerspawn하며 process.execArgv 자동전달0. 보호regression은원stdout/stderrpipe와ownedenv/argv만, IPC새계약을그코드에추가0.
5. **private context packet**: owner전송 `{{type:'owner-context',protocol:1,case,ownerPid,workerPid,nonce,context:{{repository,url,runDir,tempDir,bootstrapFile,contractPath,contractSha256}}}}`. worker는process.send/connected+exactcase+process.ppid/actualpid+nonce형태(32 randombytes이상)와exactfixedpaths/realpath/SHA를확인한뒤 `{{type:'worker-ack',case,pid,parentPid,nonce}}`. owner가자신의소유child와fullpacket일치를재확인한뒤실행지시. env는검문근거가아니다. 전송5초timeout은fail+kill+close확인. nonce는통신내부만,receipt는SHA만. 이계약은우발적우회방지이며 임의악성native부모에대한OS인증으로주장0.
6. **core direct entry**: shared는fileURLToPath(import.meta.url)와process.argv[1] exact resolved path가 같을때만guard 후core실행. 순수import는guard/process.exit0. core는설치 findChrome, chromium.launch,newContext1440x900,newPage,브라우저이벤트beforegoto,fontsready<=15초,실제 input count/isVisible 및viewport/origin을읽고fullPage:false캡처. fixture route.fulfill/network0, sign-in0. context/browser 생성/close시작/실제완료시각과id를기록하며contextclose실패후에도browserclose시도. core-observations/worker-final은모든정리후쓰기,문제면partial+nonzero.
7. **positive wrapper**: guard후runScreenCheck 실제호출은유지. step내try/finally에서action/raw/firsterror/capture반환절대경로를실측저장. 보호helper가별도runDir에원manifest를만드는점을고려해stdout의정확manifestpath+capture return을owner evidence에연결한다. preflight process.exit는outerfinally를실행하지않으므로owner가partial없음/childRC/stdout/stderr를수집해FAIL. helper파일 수정·timestamp추측·globalprocess.exit패치로숨김0.
8. **negative wrapper**: guard→try부터resource등록→rawevent수집→기존case본문→finally context/browser 각각명시적close+오류보존→partial/final쓰기→exit. 현재 PASS파일쓰기뒤close와.catch(()=>{{}})소거를제거. 기존broadincludes401/!ok는성공근거에서제거하고exact상관이없으면오류로기록. A에서부족한fullcoverage와원런타임실패를둘다보존한다.
9. **owner adjudication**: workerRC0/PASS만으로성공0. 각실제artifact존재/귀속/hash·외부contract exact ID·rawerrors/cleanup검증. corePNG는signature/IHDR1440x900/chunk길이·CRC/IEND를직접검사하며깨진PNG가새hash와일치해도SUTparentnonzero;standalonechecker의거부만으로parent허위PASS를대신0. protectedshell/home은실제공통manifest·원캡처전수로REG*3ID를구성한다. childtimeout/kill뒤close/PID,serverstop뒤exit/close/PID/port를확인하고그뒤자기temp삭제. firstfailure유지·cleanup/evidence오류누적. finalmanifest쓰기/확인까지성공후single parentJSON/RC0. write실패는stderr대상경로/첫stack/nonzero·parentPASS0. 실패해도가능한부분증거를보존한다.

상태순서·exactfield/schema·B87ID와원관측/negative는아래self-contained핵심과 read-only `{HERE / 'STRATEGY.md'}`에확정되어있다. 새파일/상반된설계가필요하면구현전BLOCKED. sharedcore작업을다른module로빼거나scope임의확대0.

## 6. foundation 증거 계약

owner-final schema=shiftmgmt.verifier.evidence.v1, stage=foundation, case=contract-core, runId=atomicdir.name,contractSha256=위fullSHA,status=PASS/FAIL,exitCode=actual. owner:pid/nonceSha256/context(url,runDir,tempDir,bootstrapFile). worker:pid,parentPid,nonceSha256,contextAck,exitCode,exitSeen,closeSeen,aliveAfterClose,createdAtMs,exitAtMs,closeAtMs. server:pid,stdoutListenVerified,exitSeen,closeSeen,aliveAfterClose,portListeningAfterClose,createdAtMs,exitAtMs,closeAtMs. cleanup:tempRemoved. errors:primary/null,cleanup[],evidence[],unexpected[]. 실패시첫message/stack/phase와누락필드는실제값/null로남기고true기본값0.

정확7artifact ID=server-stdout,server-stderr,worker-stdout,worker-stderr,worker-final,core-observations,core-capture. 각id/path(ownrun아래absolute)/bytes/sha256uppercase실측. 최종ownermanifest자기해시등록0. stdout/stderr빈파일도존재. worker-final:case/runId/contractSha256/pid/parentPid/nonceSha256/checks 및오류/정리상세. checks 각record는정확키{{id,sourceArtifact:'core-observations',pointer,actual}}이며 expected/tolerance/pass추가0;rawpointer와완전일치하고worker/owner복사본일치. 아래정확9IDset:

| ID | raw pointer | independent expectation |
|---|---|---|
{core_table}

raw chrome={{path,version(findChrome폴더판),browserVersion(실제browser.version4자리)}}. 옆폴더정보와실제판동일을강요하지않고실행파일존재/실제판기록한다. raw resources는context/browser각1,kind/id/events(created→close-start→closed,timeMs각양수/비감소),성공한await뒤만closed. raw canonicalLabels={{path:dist/server/shared/domain/access-log.js 절대경로,bytes,sha256,labels:실제전체map}}를추가한다. checker가actualfilebytes/hash/Nodeimport map을대조한다. core-capture는PNG1440x900·fullPage:false·fonts후실제로그인화면. core 예상 console/page/request/HTTP/fixture오류0,raw모든원문보존.

read-only checker는--core로A만수용한다. sourceaudit·실Chrome·독립오류주입없이는JSON만으로실제행동을증명했다고주장0. --self-test는parser경계만증명한다. B rawschema와callbackharness는별도B패킷에서구체화한다. B구현지시를이A패킷에서추정0.

## 7. 적용할 불변조건 / 과거 함정

CLAUDE.md/07의 승인+계산원자성·forward-only·DB불변·사번신원게이트·copy-only영역·실적엑셀인테이크·영문오류/가짜UI/조용한데이터절단 금지는유지한다. 이번실서버는자기격리자료만,계정생성은기존API만사용한다. 실제상태/요청/값을구한후비교,상수true/부분문구/클래스이름만검사로성공0. 예상오류는method/path/channel/status/errorCode/requestId/phase/횟수/location전부정확상관,없는정보를추정0. timeout/kill요청/빈cleanupErrors를종료증거로쓰지않는다. map90/공통helper/UI/모델/테스트정본수정0.

이전수신본문의2hunk는마지막실제중계해시가없어귀속UNVERIFIED였다. 이번발송은정확bytes와단독행회신경계digest를dispatch.json에보존한다. Gemini는본문을보정하거나기준값을수정하지않는다.

## 8. 착수 게이트

1. AGENTS→.ai/HARNESS→PROTOCOL→GEMINI와legacy-named productinvariants를읽는다. exactrepo/main/fullHEAD/status12/341/4/337·필수Chrome/Node24/Python·ownedport조건을확인한다.
2. contract/strategy/checker/baseline4files의bytes/fullSHA를명령으로대조한다. 아래scope명령RC0,protected337/control18 불변이필수. allowed4 현재SHA까지처음에는위표와동일. 시작이달라졌으면수정없이BLOCKED.
3. 소스와계약/caseflow/증거/검증명령간모순·누락이면BLOCKED. 외부fixedcontract를인라인복제로대체0. protectedmodule나추가source없이는안되면BLOCKED.

## 9. 검증 계획 — 제품 cwd에서 순서대로

각명령 argv/cwd/start/end/PID/RC/stdout/stderr는자기원자ignoredtestdir에JSON/원로그로보존한다. 명령체인을쓰지말고각RC를개별확인한다. npm testfull은A제품src/test불변이므로이번에는필수재실행아님;기존Sol919PASS는이력이며새실행주장0. 새로운실패/보호이탈이생기면중단·보고한다.

### 9.1 정적/관련/빌드

| 정확명령 | expected |
|---|---|
| `{check} --scope` | RC0;341/337/status12/control18불변 |
| `node --check scripts/ui-checks/access-history.mjs` | RC0 |
| `node --check scripts/ui-checks/access-history-shared.mjs` | RC0 |
| `node --check scripts/ui-checks/access-history-positive.mjs` | RC0 |
| `node --check scripts/ui-checks/access-history-negative.mjs` | RC0 |
| `npm run typecheck` | RC0 |
| `npm run lint` | RC0/errors0·기존warnings5초과새경고0 |
| `npm run validate:map` | RC0/map90 |
| `git diff --check` | RC0 |
| `npx vitest run src/web/screens/access-history-model.test.ts src/main/services/access-log-service.test.ts src/main/http/route-registry.test.ts --maxWorkers=1 --minWorkers=1` | RC0/3files11tests |
| `npm run build` | RC0·ignoreddist만쓰기 |
| `python "{HERE / 'verify-evidence.py'}" --contract-sha {contract_info['sha256']} --self-test` | RC0/positive2,rejected19/parseronly |
| `node scripts/ui-checks/access-history.mjs --case=contract-core` | RC0/Acore9/7artifact/실제정리 |
| `node scripts/ui-checks/access-history.mjs --case=regression-shell` | RC0/REGSHELL3ID/원manifest와실제캡처 |
| `node scripts/ui-checks/access-history.mjs --case=regression-home` | RC0/REGHOME3ID/원manifest와실제캡처 |

core exact실제owner-finalpath는owner stdout에출력하고회신에absolute를기록한다. 독립checker에는그값만넘긴다. PowerShell `Get-ChildItem artifacts/captures/phase3/access-history-contract-core -Filter owner-final.json -Recurse`로추측한latest를선택하지않는다. 실행직후stdout의onefinal JSON을파싱해path를보관한변수 `$coreManifest`를사용하는정확검사:

```powershell
{check} --core $coreManifest
```

### 9.2 정상 화면8case의 미완성 coverage fail-closed

아래각명령은RC1/FAIL_INCOMPLETE와외부requiredId缺落/legacyextra의구체목록,원관측/첫error/정리/partial을반환해야한다. A에서각시나리오를다완성하려하지않는다. 실제오류/정리실패도있으면모두기록,coverage오류로덮지않는다. 보호helper의childRC2는가능하나parent최종RC1;그직접원RC를증거로보존한다.

```text
node scripts/ui-checks/access-history.mjs --case=live-admin
node scripts/ui-checks/access-history.mjs --case=list-fixture
node scripts/ui-checks/access-history.mjs --case=empty-fixture
node scripts/ui-checks/access-history.mjs --case=filters
node scripts/ui-checks/access-history.mjs --case=errors
node scripts/ui-checks/access-history.mjs --case=stale-response
node scripts/ui-checks/access-history.mjs --case=role-guard
node scripts/ui-checks/access-history.mjs --case=session-expired
```

### 9.3 기반 음성20그룹 — 각그룹의 모든열거입력을독립실행

동일product파일을수정해서시험하지않는다. 자기ignoredtestdir의외부preload/probe만사용하며관측로그로주입이실제발생했음을증명한다. 새제품bypassenv/faultflag/--test특례 금지. probe `foundation-probes.mjs`를같은원자testdir에만생성,실제argv를회신에기록한다. 예시exact실행형식 `node --import $faultUri scripts/ui-checks/access-history.mjs --case=contract-core`, `$faultUri`는자기probe의pathToFileURL결과를회신에literalfileURI로기록. owner가execArgv를자동전달하지않으므로childfault는testpreload가자기소유spawn을instrument하여명시주입하고각actualpid/path를원로그에남긴다. source/runtime설정변경0. 시험driver는expectednonzero를확인하면driverRC0를반환하되각SUT의실제nonzero와주입증거를개별기록한다.

| ID | 입력/주입 | 반드시관측할거부 |
|---|---|---|
{negatives}

IPC5초/startup30초/health·font15초/context·browser·child·serverclose각5초및강제종료추가5초/core90초/normal120초/home180초. Owner상한=case+startup30+cleanup20초. 시험이주입한timeout단축은외부testinstrumentation으로만기록하며제품상한을바꾸지않는다. 살아있는소유PID를종료못하면FAIL·temp보존·PID/경로명시,타PID정리0. 무한sleep/timeout성공0.

### 9.4 최종 범위/해시/증거

scope명령다시RC0·341files/dirty12/protected337/control18 동일. 각4파일<=30,000bytes와fullSHA/bytes. git diff원문(기존tracked4의누적diff와이번allow4hunk 구별),untracked4 mjs원문hash/diff,기존UI4신규파일보호증거. artifact전체실제path/bytes/hash·sourceMap90·각childrawoutput·actualcleanup·portfree·nonce/cookie/password비노출. oldLog/reportbytes불변.

## 10. A 성공/중단 조건

- A01~10 구현 및정확source위치·원증거,core9/7artifact→standalonecheckerRC0.
- static/focused/build/회귀2PASS·normal8정확FAIL_INCOMPLETE·20음성그룹의모든열거입력거부와주입실제증거.
- scope341/337/12/control18·4mjs크기·제품정본/기존사용자수정/V3.4 불변.
- cleanup/write/누락/unknowncase가어느가지에서도parentRC0/PASS가되지않음,실패원로그/partial보존.
- 새source/새의존성/공통helper변경·계약기대완화·B본문작성없이구현가능해야함. 충돌/범위이탈/필수도구없음/검증못함이면수정중단하고BLOCKED/FAILED로명시. Gemini IMPLEMENTED는제출만,Sol A수용대기. A미수용이면B진행0.

## 11. 회신에필수인증거

초기게이트·final341/337/12·4filefullSHA/bytes·별도source바이트비교·명령별literalargv/cwd/time/PID/RC/stdout/stderr·coreManifestabsolute/checker원결과·회귀2원manifest/capture·normal8missing/extra/errors·20음성subcase별입력/실제주입/expectedRC/actualRC/partial/cleanup·첫실패stack및cleanup/write에러·unresolved없음또는명시. 실패를재실행성공으로덮지말고모든시도원본보존. TODO변경안은제안만,직접수정0.

## 회신

판정: 대기 — Gemini가 IMPLEMENTED / BLOCKED / FAILED 중 실제값으로 채움
기준: repository / main / 전체 baseline commit / 최종 commit 없음
초기 상태·착수 게이트: 미실행
변경 파일·A요구사항/기존 V32F 결함 대조: 미제출
범위 밖 변경: 미검증
정적/관련/빌드 명령·RC·counts·원로그·시각: 미제출
core9/7artifact·absolute owner-final·독립checker 결과: 미제출
회귀2 원manifest/원출력/실제캡처: 미제출
normal8 FAIL_INCOMPLETE/missing/extra/실제오류: 미제출
기반 음성20그룹과모든subcase 실제주입/RC/cleanup: 미제출
diff·전체 SHA-256/bytes·341/337/12/control18: 미제출
미해결/가정·TODO 상태변경 제안: 미제출
"""
    packet = packet.replace("requiredId缺落", "requiredId 누락")
    write(HERE / "HANDOFF.preview.md", packet)
    packet_data = (HERE / "HANDOFF.preview.md").read_bytes()
    matches = list(re.finditer(rb"(?m)^## " + "회신".encode("utf-8") + rb"\r?$", packet_data))
    assert len(matches) == 1
    body = packet_data[:matches[0].start()]
    result = {"time": when, "report": str(report), "archive": str(archive), "received": info(archive),
              "outgoing": info(HERE / "HANDOFF.preview.md"), "body": {"bytes": len(body), "sha256": sha(body)},
              "contract": contract_info, "strategy": strategy_info, "checker": checker_info, "baseline": baseline_info,
              "sourceChangesBySol": 0, "sourceIdenticalToClosedReview": True, "routing": "frontier; economyLuna extraction; balancedTerra unavailable gpt-6-sol read-only fallback",
              "policyTrace": {"active": ["P04", "P05", "P06", "P10", "P13", "P17", "P21", "P25", "P26"], "mode": "record_only"},
              "stage": "A only; B/fullPhase3-2 not accepted", "selfTest": self_test}
    write_json(report / "prepared.json", result)
    write_json(HERE / "pending-dispatch.json", result)
    print(json.dumps({"report": str(report), "contractSha": contract_info["sha256"], "baselineSha": baseline_info["sha256"], "packetBytes": len(packet_data)}, ensure_ascii=False))


def publish():
    pending = json.loads((HERE / "pending-dispatch.json").read_text(encoding="utf-8"))
    assert info(CONTROL / "HANDOFF.md") == pending["received"]
    assert info(HERE / "HANDOFF.preview.md") == pending["outgoing"]
    command = ["python", str(HERE / "verify-evidence.py"), "--contract-sha", pending["contract"]["sha256"],
               "--baseline-sha", pending["baseline"]["sha256"], "--scope"]
    trial = subprocess.run(command, capture_output=True, cwd=str(PRODUCT))
    report = Path(pending["report"])
    write_json(report / "scope-final.command.json", {"argv": command, "cwd": str(PRODUCT), "rc": trial.returncode})
    (report / "scope-final.stdout.txt").write_bytes(trial.stdout)
    (report / "scope-final.stderr.txt").write_bytes(trial.stderr)
    assert trial.returncode == 0, trial.stderr.decode("utf-8")
    outgoing = (HERE / "HANDOFF.preview.md").read_bytes()
    archive = CONTROL / ("Log/" + pending["time"][:19].replace("-", "").replace(":", "").replace(" ", "_") + "_3-2c-A-Sol-IMPLEMENT_발송본.md")
    with archive.open("xb") as target:
        target.write(outgoing)
    assert archive.read_bytes() == outgoing
    (CONTROL / "HANDOFF.md").write_bytes(outgoing)
    assert info(CONTROL / "HANDOFF.md") == pending["outgoing"]
    pending["published"] = True
    pending["outgoingArchive"] = str(archive)
    pending["scopeFinal"] = json.loads(trial.stdout.decode("utf-8"))
    write_json(report / "dispatch.json", pending)
    print(json.dumps({"published": True, "handoff": str(CONTROL / "HANDOFF.md"), "outgoingArchive": str(archive), "bytes": len(outgoing), "sha256": sha(outgoing), "scope": pending["scopeFinal"]}, ensure_ascii=False))


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    publish() if sys.argv[1:] == ["--publish"] else prepare()
