# -*- coding: utf-8 -*-
"""창구 계약표 111행 추출 스크립트 v0.2 (부록 C) — 원본 0.5.4를 읽기만 한다.
실행:  cd C:\\Projects\\Active\\ShiftMgmt_V3.4 && python extract-contract-table-v0.2.py > 02-창구-계약표-111-v0.2.md
v0.1 → v0.2 (Codex ③ 2차 DISAGREE 반영):
  - 활동 기록 판별식에 `activity: trackSuccess(` 추가(원본 `ipc-handler-helpers.ts:102,118,157,237`이 이 경로로 기록) → 12행이 아니라 63행
  - 「전송 특이」 열을 「대화상자」(열기(파일)/열기(폴더)/저장/경로 열기)와 「데이터 폴더」(실행 의존성)로 분리
  - 범례를 지시서 v1.2 S12(대화상자 채널은 서버가 같은 PC의 Windows 창을 띄운다 — 계약 무변경)로 교체
  - 표준 출력 줄 끝을 LF로 고정(Windows에서 리다이렉트해도 CRLF가 되지 않게)
  - 계약 인수·반환형 칸의 `|`(유니언 타입)를 `\|`로 이스케이프(v0.1은 그 행들이 표에서 칸이 밀렸다)
(같은 입력이면 같은 표가 나온다.)
"""
import re, glob, os, io, collections, sys

pre = io.open("src/preload/index.ts", encoding="utf-8").read()
lines = pre.split("\n"); methods = []
for i, ln in enumerate(lines):
    m = re.search(r'ipcRenderer\.invoke\(\s*"([^"]+)"', ln)
    if not m and re.search(r'ipcRenderer\.invoke\(\s*$', ln) and i + 1 < len(lines):
        m = re.search(r'^\s*"([^"]+)"', lines[i + 1])
    if not m:
        continue
    ch = m.group(1); name, params = None, ""
    for j in range(i, max(-1, i - 8), -1):
        mm = re.match(r'^\s*(\w+):\s*(?:async\s*)?\(([^)]*)\)', lines[j])
        if mm:
            name, params = mm.group(1), mm.group(2); break
    methods.append((name, params, ch))

contracts = io.open("src/shared/bridge/contracts.ts", encoding="utf-8").read()
def sig(name):
    m = re.search(r'\n\s+' + re.escape(name) + r':\s*\(([^)]*)\)\s*=>\s*Promise<([\s\S]*?)>;', contracts)
    if not m:
        return ("?", "?")
    p = re.sub(r'\s+', ' ', m.group(1)).strip() or "(없음)"
    return (p, re.sub(r'\s+', ' ', m.group(2)).strip())

ACTIVITY = re.compile(r'recordSuccessfulActivity|recordActivity|activity\s*:\s*trackSuccess\s*\(')
handlers = {}
for f in sorted(glob.glob("src/main/ipc/register-*.ts")):
    s = io.open(f, encoding="utf-8").read()
    pos = [(m.start(), m.group(1)) for m in re.finditer(r'ipcMain\.handle\(\s*"([^"]+)"', s)]
    for k, (p, ch) in enumerate(pos):
        blk = s[p:(pos[k + 1][0] if k + 1 < len(pos) else len(s))]
        guards = [g for g in ["withAdmin", "withActionPermission", "withSession", "withAccessHistory"] if re.search(g + r'\(', blk)]
        act = re.search(r'withActionPermission\(\s*"([^"]+)"', blk)
        dlg = []
        if "showOpenDialog" in blk:
            dlg.append("열기(폴더)" if "openDirectory" in blk else "열기(파일)")
        if "showSaveDialog" in blk or "runIpcSaveDialog" in blk: dlg.append("저장")
        if "runIpcOpenPath" in blk or "openPath" in blk: dlg.append("경로 열기")
        data_dir = "예" if ("getUserDataPath" in blk or 'getPath("userData")' in blk) else ""
        handlers[ch] = dict(file=os.path.basename(f), guards="·".join(guards) or "없음",
                            action=(act.group(1) if act else ""),
                            rec="예" if ACTIVITY.search(blk) else "",
                            dlg="·".join(dlg), data_dir=data_dir)

rows = []
for n, params, ch in methods:
    p, r = sig(n); h = handlers.get(ch, {})
    rows.append((ch, n, p, r, h.get("guards", "?"), h.get("action", ""), h.get("rec", ""), h.get("dlg", ""), h.get("data_dir", ""), h.get("file", "?")))
rows.sort(key=lambda r: r[0])
non_bridge = [r for r in rows if not r[3].startswith("BridgeResult<")]
gc = collections.Counter(r[4] for r in rows)
rec = sum(1 for r in rows if r[6]); dd = sum(1 for r in rows if r[8])
dc = collections.Counter(x for r in rows for x in r[7].split("·") if x)
pc = set(c for _, _, c in methods); hc = set(handlers)
assert len(rows) == 111 and not (pc - hc) and not (hc - pc), (len(rows), pc - hc, hc - pc)

out = ["# Phase 1-3 창구 계약표 111 — v0.2 (2026-09-07, 원본 0.5.4에서 스크립트 추출 · v0.1 Codex ③ DISAGREE → 활동 기록 판별식 수정 · 대화상자/데이터 폴더 열 분리)", "",
"- 추출 원본(읽기만): `src/preload/index.ts`(메서드→채널) · `src/shared/bridge/contracts.ts`(인수 타입·반환형) · `src/main/ipc/register-*.ts`(가드·활동 기록·대화상자·데이터 폴더). 추출 스크립트 = `Phase1/extract-contract-table-v0.2.py`(같은 스크립트를 다시 돌리면 같은 표가 나온다).",
f"- 행 수 {len(rows)} = preload invoke {len(methods)} = 핸들러 {len(handlers)}(preload에만/핸들러에만 있는 채널 0). 반환형이 `BridgeResult<…>`가 **아닌** 채널 {len(non_bridge)}개(★ = `app:get-version` → `string`, 원본 문자열 반환 유지).",
f"- 가드 분포: withAdmin {gc['withAdmin']} · withSession {gc['withSession']} · withActionPermission {gc['withActionPermission']} · withAccessHistory {gc['withAccessHistory']} · 없음 {gc['없음']} = 111 (`12-능력-매트릭스.md` §4.1 검산 7+6+35+22+40+1과 일치). **활동 기록 {rec}행**(판별식 = `recordSuccessfulActivity` · `recordActivity` · `activity: trackSuccess(` — 마지막 것은 `ipc-handler-helpers.ts:102,118,157,237`의 `activity.recordSuccessfulActivity` 경로) · 대화상자 {sum(dc.values())}행(열기(파일) {dc['열기(파일)']} · 열기(폴더) {dc['열기(폴더)']} · 저장 {dc['저장']} · 경로 열기 {dc['경로 열기']}) · 데이터 폴더 {dd}행.",
"- 「가드」 = 핸들러 블록에 등장하는 가드 이름(중첩 포함). 「권한 동작」 = `withActionPermission`의 첫 문자열 인수. 「활동 기록」 = 성공 시 활동 기록을 남기는 채널(1-3에서 같은 이름·같은 판정으로 옮긴다).",
"- 「대화상자」 = 원본이 Electron `dialog.showOpenDialog`(열기(파일)·열기(폴더)) · `dialog.showSaveDialog`(저장) · `shell.openPath`(경로 열기)를 쓰는 채널. **형태 ①에서도 서버가 같은 PC의 Windows 대화상자를 띄우고(지시서 v1.2 S12) 계약 인수·반환형·취소 시 값·활동 기록을 원본과 똑같이 유지한다** — 브라우저 업로드·다운로드로 바꾸지 않는다. 요청·응답 형식도 다른 채널과 같다(`POST /api/<채널>` · `application/json` · 계약 반환형 JSON). 취소 시 값 = 원본 핸들러 그대로(열기 4 = `{ ok: true, data: null }` · `dashboard:export-chart-data`·`dashboard:export-report` = `{ ok: false, errorCode: \"EXPORT_CANCELLED\" }`(`register-core-handlers.ts:235,282`) · `operations:preview-document-template` = `{ ok: true, data: null }`(`register-operations-handlers.ts:737`)). `buttonLabel` 인수는 Windows 대화상자가 지원하지 않아 받되 무시한다. 구현 스크립트(PowerShell 대화상자·OS 열기)는 1-3c 지시서에서 고정.",
"- 「데이터 폴더」 = 핸들러가 `getUserDataPath()`를 쓰는 채널(실행 의존성 — 서버는 `SHIFTMGMT_USER_DATA_DIR` 또는 기본 폴더를 같은 이름으로 넘긴다). 전송 방식과 무관.",
"- 1-3 구현 규칙: 모든 채널은 `POST /api/<채널>`(인수 = JSON 배열, 선택 인수는 **생략**(뒤쪽 undefined는 배열에서 잘라냄)), 응답 = 계약 반환형 JSON 그대로. 화면 쪽 `window.appBridge`는 아래 111 메서드를 같은 이름·같은 반환형으로 제공한다.", "",
"| # | 채널 | 메서드 | 계약 인수(타입) | 계약 반환형 | 가드 | 권한 동작 | 활동 기록 | 대화상자 | 데이터 폴더 | 핸들러 파일 |", "|---|---|---|---|---|---|---|---|---|---|---|"]
esc = lambda t: t.replace("|", "\\|")  # 유니언 타입의 `|`가 표 칸을 가르지 않도록(GFM `\|`)
for i, r in enumerate(rows, 1):
    star = "★ " if not r[3].startswith("BridgeResult<") else ""
    out.append(f"| {i} | `{r[0]}` | `{r[1]}` | `{esc(r[2])}` | {star}`{esc(r[3])}` | {r[4]} | {r[5]} | {r[6]} | {r[7]} | {r[8]} | `{r[9]}` |")
sys.stdout.reconfigure(encoding="utf-8", newline="\n")
print("\n".join(out))
