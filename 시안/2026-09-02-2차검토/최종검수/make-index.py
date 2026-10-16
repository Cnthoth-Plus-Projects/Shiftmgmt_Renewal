# -*- coding: utf-8 -*-
"""시안 34파일 검수용 index.html 생성기 (R-13, 2026-09-07)
실행: 시안/ 폴더에서  python3 2026-09-02-2차검토/최종검수/make-index.py
출력: 시안/index.html  (34파일의 state-wrapper id·라벨을 원본에서 직접 추출해 삽입)
"""
import re, json, glob, os, hashlib, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # 시안/
FOLDERS = [("2026-08-31-1차HTML", "1차"), ("2026-09-02-2차HTML", "2차")]
GUIDE = "2026-09-02-2차검토/최종검수/검수-안내-34파일.html"
CAPDIR = "2026-09-02-2차검토/최종검수/캡처-34"

# 파일별 「볼 것」 — 검수-안내-34파일.md §2(1차)·§4(2차) 요약
NOTES = {
 "03-home-1.html": "홈 카드(대기 실적·승인 대기 128건)와 [실적 관리에서 확인]. H2는 문제 카드 빨강 + 메뉴 배지 140. H3 처리 중 안내",
 "03-home-2.html": "H4 빈 상태 안내(다음에 뭘 하면 되는지). H5 회색 뼈대(스켈레톤)",
 "05-sites-wizard-1.html": "W2 3열 배치(팔레트 표·조별 패턴·시뮬레이션 달력). 달력 날짜 12px·셀 39px, 팔레트 표 줄 40px",
 "05-sites-wizard-2.html": "W3 조 패턴 상자 64×48, 그 줄만 높이 71(예외). W4 빨간 테두리 + 이유 문구",
 "05-sites-wizard-3.html": "W6 명단 칩 「박성진 · 사원」. W7은 열리자마자 「저장하지 않은 변경」 창 → Esc 또는 [계속 편집]으로 닫기, [변경 버리고 나가기]면 로그아웃 안내",
 "05-sites-wizard-4.html": "W9 저장 버튼 잠김 + 「근무지 등록 권한이 필요합니다 (현재 권한: 승인 담당)」. W10 처리 중 안내",
 "08-performance-1.html": "P1·P3 카드 2단 같은 폭. P3 오류 표는 가로 스크롤·줄 40px. P2 진행 안내",
 "08-performance-2.html": "P5 비교표 19열, 상자 안 가로 스크롤(끝까지 밀면 마지막 열, 잘림 없음), 줄 40px",
 "08-performance-3.html": "P6 승인 흐름을 직접: 줄 클릭 → [승인] → 확인창 [승인] → 배지 128→127 / [파일 전체 승인] → 처리 중(Esc·Tab 차단) → 배지 77. 상세 패널 360px",
 "08-performance-4.html": "P8 승인 버튼 5개 잠김 + 이유(사용자). P10 「승인 대기 실적이 없습니다」 + 다음 안내",
 "00-shell-1.html": "헤더 ①·②. S3 접힘 상태의 그룹 글자가 가는 구분선으로",
 "00-shell-2.html": "헤더 ①·②",
 "01-login-1.html": "변경 없음(헤더 없는 화면)",
 "01-login-2.html": "변경 없음(헤더 없는 화면)",
 "02-common-1.html": "변경 없음 — 단, C3 확인창 [삭제] 빨간 채움 유지 · C4 [반려] 기본형(⑧)",
 "02-common-2.html": "변경 없음",
 "02-common-3.html": "변경 없음",
 "04-sites-1.html": "헤더 ①·② · 목록의 [삭제]가 흰 바탕 빨간 테두리(⑧)",
 "04-sites-2.html": "헤더 ①·② · T4 확인창 [삭제]는 빨간 채움(⑧)",
 "06-employees-1.html": "E2 [시급 등록]·[배정]·[해지]·[삭제] ⑧ 적용. E9 신설 = 승인 담당이 본 E2: 5개 잠김 + 이유, [패널 닫기]는 되고 닫으면 커서가 목록 줄로",
 "06-employees-2.html": "헤더 ①·② · ⑧ · 모달 폭 통일(⑦)",
 "06-employees-3.html": "헤더 ①·② · ⑧ · E6 모달 폭 900(⑦)",
 "07-schedule-1.html": "헤더 ①·②",
 "07-schedule-2.html": "헤더 ①·②",
 "07-schedule-3.html": "R7 신설 = 승인 담당이 본 R1: [엑셀 생성]·[배포 폴더로 게시] 잠김 + 「근무표 배포 권한이 필요합니다 (현재 권한: 승인 담당)」, 미리보기·달력·경고 103건은 그대로",
 "09-allowance-1.html": "도넛·월별 추이 차트 2개 삭제, 결과표가 요약 카드 4개 바로 아래로",
 "09-allowance-2.html": "A9 신설 = 사용자가 본 품의 미리보기: [품의 승인] 잠김 + 이유, 미리보기·조기 지급일 지정 창은 열림",
 "09-allowance-3.html": "헤더 ①·②만",
 "10-dashboard-1.html": "헤더 ①·②만",
 "11-operations-1.html": "헤더 ①·② · ⑧ · O1에서 [로그아웃] → 이탈 확인창",
 "11-operations-2.html": "헤더 ①·② · ⑧(삭제·해지 테두리형)",
 "11-operations-3.html": "헤더 ①·② · ⑧ · O7에서 [로그아웃] → 이탈 확인창",
 "11-operations-4.html": "헤더 ①·② · O10 [교체 실행]만 빨간 채움(⑧)",
 "12-access-logs-1.html": "G1 사용자 칸이 「이름 · 계정」 한 줄(높이 40)",
}

COMMON9 = [
 ("① 머리줄(헤더) 통일", "왼쪽부터 ☰ · 구분선 · 화면 제목 · 역할 칩 · 계정 이름 · [로그아웃]. 로고·[도움말] 없음, 계정 이름은 글자"),
 ("② [로그아웃] 동작(시안용)", "누르면 「로그인 화면으로 이동합니다」 1.5초. 편집 중(W1~W6·W10·O1·O7)엔 「저장하지 않은 변경」 확인창"),
 ("③ 왼쪽 메뉴 접기(☰)", "1차도 아이콘만 남는 64px로 접힘. 접힌 상태에서 마우스 올리면 이름, 실적 배지(128)는 유지. 다시 누르면 220px"),
 ("④ 본문 바로가기", "파일 열자마자 Tab 1번 → 「본문으로 바로가기」 → Enter면 본문으로, 다음 Tab이 메뉴로 안 돌아감. ※ 키보드 확인은 이 뷰어 안이 아니라 「새 탭에서 열기」로 연 창에서"),
 ("⑤ 글자 크기 최소 12px", "12px 미만 없음(표 본문 14·머리 12). 예외: 달력 셀 13, 패턴 상자, 시뮬레이션 근무 유형 10px 굵게"),
 ("⑥ 표 한 줄 40px", "전부 40px(좁은 표 32px). 줄바꿈 대신 가로 스크롤"),
 ("⑦ 버튼·모달 통일", "버튼 모서리 6·글자 13·패딩 3종. 모달 모서리 10·폭 400/600/900"),
 ("⑧ 위험 버튼 4형", "행 단위 삭제·해지 = 흰 바탕 빨간 테두리. 진짜 실행([삭제]·[교체 실행] 등)만 빨간 채움. [반려]는 기본형"),
 ("⑨ 역할 사례 3상태", "A9 · E9 · R7 — 잠긴 버튼 회색 + 「…권한이 필요합니다 (현재 권한: …)」, 눌러도(마우스·Enter·Space) 아무 일 없음"),
]

def extract():
    files = []
    for folder, phase in FOLDERS:
        for f in sorted(glob.glob(os.path.join(ROOT, folder, "*.html"))):
            s = open(f, encoding="utf-8").read()
            states = []
            for m in re.finditer(r'class="state-wrapper" id="(state-[a-z0-9-]+)"', s):
                seg = s[m.end():m.end() + 400]
                lm = re.search(r'status-label-bar">\s*(.*?)\s*</div>', seg, re.S)
                label = re.sub(r"\s+", " ", lm.group(1)).strip() if lm else "?"
                label = label.strip("─ ").strip()
                states.append({"id": m.group(1), "label": label})
            name = os.path.basename(f)
            files.append({
                "phase": phase, "folder": folder, "name": name,
                "path": folder + "/" + name, "cap": CAPDIR + "/" + name[:-5] + ".png",
                "size": os.path.getsize(f),
                "sha": hashlib.sha256(open(f, "rb").read()).hexdigest(),
                "states": states, "note": NOTES.get(name, ""),
            })
    return files

TEMPLATE = r'''<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>시안 34파일 검수</title>
<style>
:root{--bg:#F4F5F7;--panel:#FFFFFF;--line:#DDE1E6;--text:#1F2937;--sub:#5B6470;--accent:#2F6FED;--accent-bg:#EEF3FF;--ok:#1E8E3E;--ok-bg:#E6F4EA;--warn-bg:#FFF4E5;--focus:#2F6FED;}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{font-family:"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif;font-size:13px;color:var(--text);background:var(--bg);display:flex;flex-direction:column}
button,input{font:inherit;color:inherit}
button{cursor:pointer;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:5px 10px;line-height:1.3}
button:hover{background:#F0F2F5}
button:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid var(--focus);outline-offset:1px}
button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
a{color:var(--accent)}
header.top{height:48px;flex:0 0 48px;display:flex;align-items:center;gap:12px;padding:0 14px;background:var(--panel);border-bottom:1px solid var(--line)}
header.top h1{font-size:15px;margin:0 8px 0 0;white-space:nowrap}
header.top .meta{color:var(--sub);white-space:nowrap}
.progress{padding:3px 10px;border-radius:12px;background:var(--ok-bg);color:var(--ok);font-weight:700;white-space:nowrap}
.spacer{flex:1}
.mode{display:flex;gap:0}
.mode button{border-radius:0}
.mode button:first-child{border-radius:6px 0 0 6px}
.mode button:last-child{border-radius:0 6px 6px 0;margin-left:-1px}
.wrap{flex:1;display:flex;min-height:0}
aside{width:340px;flex:0 0 340px;background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0}
aside .search{padding:10px 12px;border-bottom:1px solid var(--line)}
aside .search input{width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:6px}
aside .list{flex:1;overflow:auto;padding:6px 0 20px}
details.common{border-bottom:1px solid var(--line);padding:6px 12px}
details.common summary{cursor:pointer;font-weight:700;color:var(--sub)}
details.common ol{margin:6px 0 4px;padding-left:18px;color:var(--sub);font-size:12px;line-height:1.5}
details.common ol b{color:var(--text)}
.group{padding:10px 12px 4px;font-weight:700;color:var(--sub);font-size:12px;letter-spacing:.02em}
.file{padding:8px 12px 8px 10px;border-left:3px solid transparent;border-bottom:1px solid #F0F2F5}
.file.current{border-left-color:var(--accent);background:var(--accent-bg)}
.file .row1{display:flex;align-items:center;gap:8px}
.file .row1 input{margin:0}
.file .name{flex:1;text-align:left;background:none;border:0;padding:2px 0;font-weight:700;font-size:13px}
.file .name:hover{text-decoration:underline;background:none}
.file .idx{color:var(--sub);font-size:12px;width:22px;text-align:right}
.states{display:flex;flex-wrap:wrap;gap:4px;margin:5px 0 0 30px}
.states button{padding:1px 7px;font-size:12px;border-radius:10px;background:#F7F8FA}
.states button.cur{background:var(--accent);color:#fff;border-color:var(--accent)}
.note{margin:5px 0 0 30px;color:var(--sub);font-size:12px;line-height:1.45}
.file.done .name{color:var(--ok)}
.file.done .name::after{content:" ✓";color:var(--ok)}
.empty{padding:24px 16px;color:var(--sub);line-height:1.6}
main{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
.toolbar{height:44px;flex:0 0 44px;display:flex;align-items:center;gap:8px;padding:0 12px;background:var(--panel);border-bottom:1px solid var(--line)}
.toolbar .cur{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.toolbar .lbl{color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}
.toolbar label{display:flex;align-items:center;gap:5px;white-space:nowrap;padding:5px 10px;border:1px solid var(--line);border-radius:6px;background:var(--panel)}
.toolbar a.btn{display:inline-block;padding:5px 10px;border:1px solid var(--line);border-radius:6px;background:var(--panel);text-decoration:none;color:var(--text);white-space:nowrap}
.toolbar a.btn:hover{background:#F0F2F5}
.tip{flex:0 0 auto;padding:5px 12px;font-size:12px;color:var(--sub);background:var(--warn-bg);border-bottom:1px solid var(--line)}
.frame{flex:1;min-height:0;background:#fff;overflow:auto}
.frame iframe{width:100%;min-width:1440px;height:100%;border:0;display:block}
body.list-hidden aside{display:none}
.stack{flex:1;overflow:auto;padding:12px}
.stack section{margin-bottom:16px;border:1px solid var(--line);border-radius:8px;background:var(--panel);overflow:hidden}
.stack section h2{font-size:14px;margin:0;padding:8px 12px;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:center}
.stack section h2 .n{color:var(--sub);font-weight:400}
.stack section h2 a{margin-left:auto;font-weight:400;font-size:12px}
.stack section .fw{overflow:auto}
.stack section iframe{width:100%;min-width:1440px;height:900px;border:0;display:block}
.stack .hint{padding:12px;color:var(--sub);background:var(--warn-bg);border-radius:8px;margin-bottom:12px;line-height:1.5}
kbd{font-family:inherit;border:1px solid var(--line);border-bottom-width:2px;border-radius:4px;padding:0 5px;background:#fff}
</style>
</head>
<body>
<header class="top">
  <h1>시안 34파일 검수</h1>
  <span class="meta">승인본 스냅샷19차 · Codex ⑥ 4차 AGREE 2026-09-07 19:56 · 상태 88개</span>
  <span class="progress" id="progress" role="status" aria-live="polite">확인 0 / 34</span>
  <span class="spacer"></span>
  <div class="mode" role="group" aria-label="보기 방식">
    <button type="button" id="mode-single" aria-pressed="true">한 파일씩</button>
    <button type="button" id="mode-stack" aria-pressed="false">34개 이어 보기</button>
  </div>
  <a href="__GUIDE__" target="_blank" rel="noopener">검수 안내 열기 ↗</a>
</header>
<div class="wrap">
  <aside aria-label="파일 목록">
    <div class="search"><input type="search" id="q" placeholder="파일 이름·상태 번호로 찾기 (예: W7, 실적, 로그인)" aria-label="파일·상태 검색"></div>
    <div class="list" id="list">
      <details class="common"><summary>34파일 공통으로 바뀐 것 9가지 (어느 파일이든 하나만 열어도 확인)</summary><ol id="common9"></ol></details>
      <div id="groups"></div>
      <div class="empty" id="empty" hidden>검색 결과가 없습니다. 파일 이름(예: 실적, 로그인)이나 상태 번호(예: W7, P6)로 찾아 보세요.</div>
    </div>
  </aside>
  <main>
    <div class="toolbar" id="toolbar">
      <button type="button" id="toggle-list" aria-pressed="false" aria-label="목록 접기/펼치기" title="목록을 접으면 화면이 1440px 폭으로 넓어집니다">목록 접기</button>
      <button type="button" id="prev" aria-label="이전 파일">◀ 이전</button>
      <button type="button" id="next" aria-label="다음 파일">다음 ▶</button>
      <span class="cur" id="cur-name">파일을 고르세요</span>
      <span class="lbl" id="cur-label"></span>
      <a class="btn" id="open-new" href="#" target="_blank" rel="noopener" hidden>새 탭에서 열기 ↗</a>
      <a class="btn" id="open-cap" href="#" target="_blank" rel="noopener" hidden>캡처 보기 ↗</a>
      <label id="done-wrap" hidden><input type="checkbox" id="done"> 이 파일 확인함</label>
    </div>
    <div class="tip" id="tip">화면은 시안 기준 폭 1440px로 보입니다(창이 좁으면 화면 아래 가로 스크롤 또는 「목록 접기」). 화면을 클릭한 뒤 조작하세요. <b>키보드 확인</b>(Tab 바로가기 ④ · W7 Esc 닫기)은 이 창 안에서는 안 되니 <b>「새 탭에서 열기」</b>로 연 창에서 해 주세요. 모달은 「데모용」 버튼으로 엽니다.</div>
    <div class="frame" id="frame"><iframe id="viewer" title="시안 화면" src="about:blank"></iframe></div>
    <div class="stack" id="stack" hidden></div>
  </main>
</div>
<script>
var FILES = __FILES__;
var COMMON9 = __COMMON9__;
var KEY_DONE = "sian34-done", KEY_LAST = "sian34-last";
var state = {cur: -1, stateId: "", done: {}, mode: "single"};
function load(k){ try{ var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }catch(e){ return null; } }
function save(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function $(id){ return document.getElementById(id); }

function render(){
  var q = $("q").value.trim().toLowerCase();
  var html = "", shown = 0, lastPhase = "";
  FILES.forEach(function(f, i){
    var hay = (f.name + " " + f.states.map(function(s){ return s.label; }).join(" ") + " " + f.note).toLowerCase();
    if (q && hay.indexOf(q) < 0) return;
    shown++;
    if (f.phase !== lastPhase){
      lastPhase = f.phase;
      html += '<div class="group">' + (f.phase === "1차" ? "1차 10파일 — 처음 검수 (§2 전체를 보세요)" : "2차 24파일 — 09-06 검수본에서 바뀐 곳만 (§4)") + '</div>';
    }
    var cls = "file" + (i === state.cur ? " current" : "") + (state.done[f.name] ? " done" : "");
    html += '<div class="' + cls + '" data-i="' + i + '">';
    html += '<div class="row1"><span class="idx">' + (i + 1) + '</span><input type="checkbox" data-done="' + i + '" aria-label="' + esc(f.name) + ' 확인함"' + (state.done[f.name] ? " checked" : "") + '>';
    html += '<button type="button" class="name" data-open="' + i + '">' + esc(f.name.replace(".html", "")) + '</button></div>';
    html += '<div class="states">' + f.states.map(function(s){
      var short = s.label.split(".")[0];
      var cur = (i === state.cur && s.id === state.stateId) ? " cur" : "";
      return '<button type="button" class="' + cur.trim() + '" data-open="' + i + '" data-state="' + s.id + '" title="' + esc(s.label) + '">' + esc(short) + '</button>';
    }).join("") + '</div>';
    if (f.note) html += '<div class="note">' + esc(f.note) + '</div>';
    html += '</div>';
  });
  $("groups").innerHTML = html;
  $("empty").hidden = shown > 0;
  var n = FILES.filter(function(f){ return state.done[f.name]; }).length;
  $("progress").textContent = "확인 " + n + " / " + FILES.length;
}

function open(i, stateId){
  if (i < 0 || i >= FILES.length) return;
  var f = FILES[i];
  state.cur = i; state.stateId = stateId || "";
  save(KEY_LAST, {i: i, s: state.stateId});
  var url = f.path + (state.stateId ? "#" + state.stateId : "");
  if (state.mode === "single"){
    var v = $("viewer");
    if (v.getAttribute("data-path") === f.path && state.stateId){
      // 같은 파일 안의 다른 상태: 다시 읽지 않고 그 위치로 이동
      v.src = url;
    } else {
      v.setAttribute("data-path", f.path);
      v.src = url;
    }
  }
  $("cur-name").textContent = (i + 1) + ". " + f.name;
  var st = f.states.filter(function(s){ return s.id === state.stateId; })[0];
  $("cur-label").textContent = st ? st.label : (f.states.length + "개 상태 · " + f.note);
  $("open-new").href = url; $("open-new").hidden = false;
  $("open-cap").href = f.cap; $("open-cap").hidden = false;
  $("done-wrap").hidden = false; $("done").checked = !!state.done[f.name];
  $("prev").disabled = i === 0; $("next").disabled = i === FILES.length - 1;
  render();
  var el = document.querySelector('.file[data-i="' + i + '"]');
  if (el && el.scrollIntoView) el.scrollIntoView({block: "nearest"});
}

function setMode(m){
  state.mode = m;
  $("mode-single").setAttribute("aria-pressed", m === "single");
  $("mode-stack").setAttribute("aria-pressed", m === "stack");
  $("frame").hidden = m !== "single";
  $("toolbar").hidden = m !== "single";
  $("tip").hidden = m !== "single";
  $("stack").hidden = m !== "stack";
  if (m === "stack" && !$("stack").innerHTML){
    var h = '<div class="hint">34파일을 위에서 아래로 이어 붙였습니다(파일마다 높이 900px, 안에서 따로 스크롤). 파일 하나를 크게 보려면 「한 파일씩」으로 돌아가거나 오른쪽 「새 탭에서 열기」를 누르세요. 처음 한 번은 34개를 모두 읽느라 몇 초 걸립니다.</div>';
    FILES.forEach(function(f, i){
      h += '<section id="sec-' + i + '"><h2><span class="n">' + (i + 1) + '</span>' + esc(f.name) + '<span class="n">' + esc(f.states.map(function(s){ return s.label.split(".")[0]; }).join(" · ")) + '</span><a href="' + f.path + '" target="_blank" rel="noopener">새 탭에서 열기 ↗</a></h2>';
      h += '<div class="fw"><iframe loading="lazy" title="' + esc(f.name) + '" src="' + f.path + '"></iframe></div></section>';
    });
    $("stack").innerHTML = h;
  }
  if (m === "stack" && state.cur >= 0){
    var sec = $("sec-" + state.cur); if (sec) sec.scrollIntoView();
  } else if (m === "single" && state.cur >= 0){
    open(state.cur, state.stateId);
  }
}

document.addEventListener("click", function(e){
  var t = e.target.closest("[data-open]");
  if (t){ if (state.mode === "stack") setMode("single"); open(+t.getAttribute("data-open"), t.getAttribute("data-state") || ""); return; }
});
document.addEventListener("change", function(e){
  var t = e.target;
  if (t.hasAttribute("data-done")){
    var f = FILES[+t.getAttribute("data-done")];
    if (t.checked) state.done[f.name] = true; else delete state.done[f.name];
    save(KEY_DONE, state.done); render();
    if (state.cur >= 0) $("done").checked = !!state.done[FILES[state.cur].name];
  }
});
$("done").addEventListener("change", function(){
  if (state.cur < 0) return;
  var f = FILES[state.cur];
  if (this.checked) state.done[f.name] = true; else delete state.done[f.name];
  save(KEY_DONE, state.done); render();
});
$("prev").addEventListener("click", function(){ open(state.cur - 1, ""); });
$("next").addEventListener("click", function(){ open(state.cur + 1, ""); });
$("q").addEventListener("input", render);
$("toggle-list").addEventListener("click", function(){
  var hidden = document.body.classList.toggle("list-hidden");
  this.setAttribute("aria-pressed", hidden); this.textContent = hidden ? "목록 펼치기" : "목록 접기";
});
$("mode-single").addEventListener("click", function(){ setMode("single"); });
$("mode-stack").addEventListener("click", function(){ setMode("stack"); });

$("common9").innerHTML = COMMON9.map(function(c){ return "<li><b>" + esc(c[0]) + "</b> — " + esc(c[1]) + "</li>"; }).join("");
state.done = load(KEY_DONE) || {};
render();
var last = load(KEY_LAST);
if (last && typeof last.i === "number" && last.i >= 0 && last.i < FILES.length) open(last.i, last.s || ""); else open(0, "");
</script>
</body>
</html>
'''

def main():
    files = extract()
    n_states = sum(len(f["states"]) for f in files)
    data = [{k: f[k] for k in ("phase", "name", "path", "cap", "states", "note")} for f in files]
    html = (TEMPLATE
            .replace("__GUIDE__", GUIDE)
            .replace("__FILES__", json.dumps(data, ensure_ascii=False))
            .replace("__COMMON9__", json.dumps(COMMON9, ensure_ascii=False)))
    out = os.path.join(ROOT, "index.html")
    with open(out, "w", encoding="utf-8", newline="\n") as fp:
        fp.write(html)
    sha = hashlib.sha256(open(out, "rb").read()).hexdigest()
    print(f"files={len(files)} states={n_states} -> {out} {os.path.getsize(out)} B sha256={sha}")
    missing = [f["name"] for f in files if not f["note"]]
    if missing:
        print("NOTE MISSING:", missing)
    for f in files:
        print(f'{f["name"]:26} {len(f["states"]):2} {f["sha"][:16]}')

if __name__ == "__main__":
    main()
