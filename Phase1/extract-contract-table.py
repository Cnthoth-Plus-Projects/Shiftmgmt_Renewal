# -*- coding: utf-8 -*-
"""창구 계약표 111행 추출 스크립트 (부록 B) — 원본 0.5.4를 읽기만 한다.
실행:  cd C:\\Projects\\Active\\ShiftMgmt_V3.4 && python extract-contract-table.py > 02-창구-계약표-111-v0.1.md
(Claude 실행 2026-09-07 22:10 — 같은 입력이면 같은 표가 나온다.)
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

handlers = {}
for f in sorted(glob.glob("src/main/ipc/register-*.ts")):
    s = io.open(f, encoding="utf-8").read()
    pos = [(m.start(), m.group(1)) for m in re.finditer(r'ipcMain\.handle\(\s*"([^"]+)"', s)]
    for k, (p, ch) in enumerate(pos):
        blk = s[p:(pos[k + 1][0] if k + 1 < len(pos) else len(s))]
        guards = [g for g in ["withAdmin", "withActionPermission", "withSession", "withAccessHistory"] if re.search(g + r'\(', blk)]
        act = re.search(r'withActionPermission\(\s*"([^"]+)"', blk)
        io_ = []
        if "showOpenDialog" in blk: io_.append("열기 대화상자→업로드")
        if "showSaveDialog" in blk or "runIpcSaveDialog" in blk: io_.append("저장 대화상자→다운로드")
        if "runIpcOpenPath" in blk or "openPath" in blk: io_.append("경로 열기→경로 안내")
        if "getUserDataPath" in blk or 'getPath("userData")' in blk: io_.append("데이터 폴더")
        handlers[ch] = dict(file=os.path.basename(f), guards="·".join(guards) or "없음",
                            action=(act.group(1) if act else ""),
                            rec="예" if re.search(r'recordSuccessfulActivity|recordActivity', blk) else "",
                            io="·".join(io_))

rows = []
for n, params, ch in methods:
    p, r = sig(n); h = handlers.get(ch, {})
    rows.append((ch, n, p, r, h.get("guards", "?"), h.get("action", ""), h.get("rec", ""), h.get("io", ""), h.get("file", "?")))
rows.sort(key=lambda r: r[0])
non_bridge = [r for r in rows if not r[3].startswith("BridgeResult<")]
gc = collections.Counter(r[4] for r in rows); ioc = sum(1 for r in rows if r[7]); rec = sum(1 for r in rows if r[6])
pc = set(c for _, _, c in methods); hc = set(handlers)
assert len(rows) == 111 and not (pc - hc) and not (hc - pc), (len(rows), pc - hc, hc - pc)

out = ["# Phase 1-3 창구 계약표 111 — v0.1 (2026-09-07 22:10, 원본 0.5.4에서 스크립트 추출 · Codex 검증 전)", "",
"- 추출 원본(읽기만): `src/preload/index.ts`(메서드→채널) · `src/shared/bridge/contracts.ts`(인수 타입·반환형) · `src/main/ipc/register-*.ts`(가드·활동 기록·파일 대화상자). 추출 스크립트 = HANDOFF 부록 B(같은 스크립트를 다시 돌리면 같은 표가 나온다).",
f"- 행 수 {len(rows)} = preload invoke {len(methods)} = 핸들러 {len(handlers)}(preload에만/핸들러에만 있는 채널 0). 반환형이 `BridgeResult<…>`가 **아닌** 채널 {len(non_bridge)}개(★ = `app:get-version` → `string`, 원본 문자열 반환 유지).",
f"- 가드 분포: withAdmin {gc['withAdmin']} · withSession {gc['withSession']} · withActionPermission {gc['withActionPermission']} · withAccessHistory {gc['withAccessHistory']} · 없음 {gc['없음']} = 111 (`12-능력-매트릭스.md` §4.1 검산 7+6+35+22+40+1과 일치). 활동 기록 {rec}행 · 전송 특이 {ioc}행.",
"- 「가드」 = 핸들러 블록에 등장하는 가드 이름(중첩 포함). 「권한 동작」 = `withActionPermission`의 첫 문자열 인수. 「전송 특이」: 열기 대화상자 = 형태 ①에서 **multipart 업로드 → `<dataDir>/uploads/` 저장 → 경로 전달** · 저장 대화상자 = **다운로드(attachment) 또는 `<dataDir>/exports/` + 경로 응답** · 경로 열기 = 서버가 경로만 돌려주고 화면이 안내 · 데이터 폴더 = `SHIFTMGMT_USER_DATA_DIR`.",
"- 1-3 구현 규칙: 모든 채널은 `POST /api/<채널>`(인수 = JSON 배열, 선택 인수는 **생략**(뒤쪽 undefined는 배열에서 잘라냄)), 응답 = 계약 반환형 JSON 그대로. 화면 쪽 `window.appBridge`는 아래 111 메서드를 같은 이름·같은 반환형으로 제공한다.", "",
"| # | 채널 | 메서드 | 계약 인수(타입) | 계약 반환형 | 가드 | 권한 동작 | 활동 기록 | 전송 특이 | 핸들러 파일 |", "|---|---|---|---|---|---|---|---|---|---|"]
for i, r in enumerate(rows, 1):
    star = "★ " if not r[3].startswith("BridgeResult<") else ""
    out.append(f"| {i} | `{r[0]}` | `{r[1]}` | `{r[2]}` | {star}`{r[3]}` | {r[4]} | {r[5]} | {r[6]} | {r[7]} | `{r[8]}` |")
sys.stdout.reconfigure(encoding="utf-8")
print("\n".join(out))
