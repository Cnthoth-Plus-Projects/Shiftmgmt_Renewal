#!/usr/bin/env bash
# 0-18e ④ 2차 ⑤ 시나리오 — Codex ⑥ 1차 Q1(홈 잡텍스트)·Q2/Q3(E9 패널 닫기·배치)·Q6(1차 64px 접힘 왕복) 실제 클릭/키 실측 + audit1b 10파일 + 문법·콘솔 34파일
B="$HOME/.claude/skills/gstack/browse/dist/browse"
R1="file:///C:/Projects/Active/교대근무관리 시스템/시안/2026-08-31-1차HTML"
R2="file:///C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차HTML"
OUT="시안/2026-09-06-최종정리/검증-0-18e2"
J() { "$B" js "$1" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'; }
K() { "$B" press "$1" >/dev/null 2>&1; }
C() { "$B" click "$1" >/dev/null 2>&1; }
G() { "$B" goto "$1" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1; }
"$B" viewport 1440x900 >/dev/null 2>&1
echo "### $(date +%H:%M:%S) Q1 03-home-1 body 잡텍스트 · 첫 상태 top"
G "$R1/03-home-1.html"
J "(()=>JSON.stringify({stray:[...document.body.childNodes].filter(n=>n.nodeType===3&&n.nodeValue.trim()).map(n=>n.nodeValue.trim().slice(0,30)),firstEl:document.body.firstElementChild.id,firstTop:Math.round(document.body.firstElementChild.getBoundingClientRect().top),styles:document.querySelectorAll('style').length,closeStyleText:document.body.innerText.indexOf('</style>'),cssText:document.body.innerText.indexOf('.skip-link{')}))()"

echo "### $(date +%H:%M:%S) Q6 1차 10파일 ☰ 접힘 왕복(실제 클릭, 전환 .15s 뒤 측정)"
SIDE="(id)=>{const w=document.getElementById(id);const s=w.querySelector('.sidebar');const b=w.querySelector('.btn-sidebar-toggle');const m=w.querySelector('.main-wrapper');const vis=e=>e.getClientRects().length>0;const bd=s.querySelector('.nav-badge');const r=bd?bd.getBoundingClientRect():null;return {id,w:Math.round(s.getBoundingClientRect().width),main:m?Math.round(m.getBoundingClientRect().width):0,exp:b.getAttribute('aria-expanded'),col:s.classList.contains('collapsed'),sHidden:s.getAttribute('aria-hidden'),names:[...s.querySelectorAll('.nav-item')].map(a=>[...a.querySelectorAll('span:not(.material-symbols-outlined)')].map(x=>x.textContent.trim()).join(' ')),titles:[...s.querySelectorAll('.nav-item')].filter(a=>a.title).length,cur:s.querySelectorAll('[aria-current=page]').length,gh:[...s.querySelectorAll('.nav-group-header')].filter(h=>h.getAttribute('aria-hidden')==='true').length,gVisText:[...s.querySelectorAll('.nav-group-header')].filter(h=>vis(h)&&parseFloat(getComputedStyle(h).fontSize)>0&&h.getBoundingClientRect().height>2).length,gDivider:[...s.querySelectorAll('.nav-group-header')].filter(h=>Math.round(h.getBoundingClientRect().height)===1).length,badge:bd?{t:bd.textContent.trim(),title:bd.title,vis:vis(bd)&&r.width>0,w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.left-s.getBoundingClientRect().left),y:Math.round(r.top-bd.closest('.nav-item').getBoundingClientRect().top)}:null,iconX:Math.round(s.querySelector('.nav-item .material-symbols-outlined').getBoundingClientRect().left-s.getBoundingClientRect().left),textVisible:[...s.querySelectorAll('.nav-item>span:not(.material-symbols-outlined):not(.nav-badge)')].filter(x=>x.getBoundingClientRect().width>2).length}}"
for f in 03-home-1 03-home-2 05-sites-wizard-1 05-sites-wizard-2 05-sites-wizard-3 05-sites-wizard-4 08-performance-1 08-performance-2 08-performance-3 08-performance-4; do
  G "$R1/$f.html"
  IDS=$(J "(()=>[...document.querySelectorAll('.state-wrapper')].filter(w=>w.querySelector('.btn-sidebar-toggle')&&!w.querySelector('.btn-sidebar-toggle').closest('[aria-hidden=true]')).map(w=>w.id).join(' '))()" | tr -d '"')
  for id in $IDS; do
    A=$(J "(()=>JSON.stringify(($SIDE)('$id')))()")
    C "#$id .btn-sidebar-toggle"; sleep 0.5
    Bc=$(J "(()=>JSON.stringify(($SIDE)('$id')))()")
    C "#$id .btn-sidebar-toggle"; sleep 0.5
    Cc=$(J "(()=>JSON.stringify(($SIDE)('$id')))()")
    echo "$f $id 전=$A"; echo "$f $id 접힘=$Bc"; echo "$f $id 복귀=$Cc"
  done
done
echo "### $(date +%H:%M:%S) Q6 캡처: wizard-1 W1 접힘 상태"
G "$R1/05-sites-wizard-1.html"; C "#state-w1 .btn-sidebar-toggle"; sleep 0.5; "$B" screenshot --viewport "$OUT/cap-w1-collapsed.png" >/dev/null 2>&1; echo "cap-w1-collapsed.png"
G "$R1/08-performance-3.html"; C "#state-p6 .btn-sidebar-toggle"; sleep 0.5; "$B" screenshot --viewport "$OUT/cap-p6-collapsed.png" >/dev/null 2>&1; echo "cap-p6-collapsed.png"
echo "### $(date +%H:%M:%S) Q6 P6 접힘 뒤 A-1 승인 → 배지 title 동기"
C "#state-p6 .btn-sidebar-toggle"; sleep 0.5
J "(()=>{document.getElementById('p6-row-2').focus();return 1})()" >/dev/null; K Enter; K Escape; C '#btn-approve-single'; C '#btn-single-confirm'
J "(()=>{const b=document.getElementById('p6-sidebar-badge');return JSON.stringify({text:b.textContent,title:b.title,chip:document.getElementById('p6-chip-pending').textContent.trim()})})()"

echo "### $(date +%H:%M:%S) Q2/Q3 06-employees-1 E9 패널 배치·닫기(클릭/Enter/Space 각각 새로 열기)"
PANEL="()=>{const q=(sel,root)=>root.querySelector(sel);const w2=document.getElementById('state-e2'),w9=document.getElementById('state-e9');const rows=t=>[...t.querySelectorAll('tbody tr')].map(r=>Math.round(r.getBoundingClientRect().height*10)/10);const rc=e=>{if(!e)return null;const r=e.getBoundingClientRect();return [Math.round(r.width*10)/10,Math.round(r.height*10)/10]};const btnByText=(root,t)=>[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===t);const vis=e=>e&&e.offsetParent!==null;return {e2rows:rows(q('#e2-wage-history',w2)),e9rows:rows(q('#e2-wage-history-e9',w9)),e2ws:getComputedStyle(q('#e2-wage-history td',w2)).whiteSpace,e9ws:getComputedStyle(q('#e2-wage-history-e9 td',w9)).whiteSpace,e2wage:rc(btnByText(w2,'시급 등록')),e9wage:rc(q('#btn-e9-wage',w9)),e2unassign:rc(btnByText(w2,'현재 배정 해지')),e9unassign:rc(q('#btn-e9-unassign',w9)),e2delete:rc(btnByText(w2,'인력 삭제')),e9delete:rc(q('#btn-e9-delete',w9)),e2new:rc(q('#btn-e2-new',w2)),e9new:rc(q('#btn-e2-new-e9',w9)),e9assign:rc(q('#btn-e9-assign',w9)),descs:['e9-lock-desc-1','e9-lock-desc-2','e9-lock-desc-3','e9-lock-desc-4'].map(id=>{const e=document.getElementById(id);return id+':'+(vis(e)?'보임':'숨김')+':'+Math.round(e.getBoundingClientRect().height)+'px:'+e.textContent.trim().slice(0,12)}),refs:[...w9.querySelectorAll('[aria-describedby]')].map(b=>b.id+'→'+(document.getElementById(b.getAttribute('aria-describedby'))?'ok':'없음')),btnLines:['btn-e9-wage','btn-e9-unassign','btn-e9-delete','btn-e2-new-e9'].map(id=>{const b=document.getElementById(id);return id+':'+Math.round(b.getBoundingClientRect().height)+'px'}),panelW:rc(q('#btn-e9-panel-close',w9).closest('aside')),panelOverflow:(()=>{const a=q('#btn-e9-panel-close',w9).closest('aside');return a.scrollHeight>a.clientHeight+1?a.scrollHeight+'>'+a.clientHeight:''})()}}"
G "$R2/06-employees-1.html"
echo "배치: $(J "(()=>JSON.stringify(($PANEL)()))()")"
CLOSE="()=>{const w9=document.getElementById('state-e9'),w2=document.getElementById('state-e2');const p9=document.getElementById('btn-e9-panel-close').closest('aside');const p2=[...w2.querySelectorAll('aside')].find(a=>!a.classList.contains('sidebar'));const a=document.activeElement;return {e9panel:getComputedStyle(p9).display,e2panel:getComputedStyle(p2).display,focus:(a.tagName+'#'+(a.id||a.dataset.id||''))+(a.closest('#state-e9')?'(E9)':''),role:w9.querySelector('.role-badge').textContent,account:w9.querySelector('.user-info-text span:last-child').textContent,e9visible:getComputedStyle(w9).display,listW:Math.round(w9.querySelector('table.table-data').getBoundingClientRect().width),e2role:w2.querySelector('.role-badge').textContent,e1e2Transition:document.querySelectorAll('.state-wrapper').length}}"
echo "닫기 전: $(J "(()=>JSON.stringify(($CLOSE)()))()")"
C '#btn-e9-panel-close'; echo "클릭 후: $(J "(()=>JSON.stringify(($CLOSE)()))()")"
G "$R2/06-employees-1.html"; J "(()=>{document.getElementById('btn-e9-panel-close').focus();return document.activeElement.id})()" >/dev/null; K Enter; echo "Enter 후: $(J "(()=>JSON.stringify(($CLOSE)()))()")"
G "$R2/06-employees-1.html"; J "(()=>{document.getElementById('btn-e9-panel-close').focus();return document.activeElement.id})()" >/dev/null; K Space; echo "Space 후: $(J "(()=>JSON.stringify(($CLOSE)()))()")"
echo "E2 원본 [패널 닫기](id 없음) 클릭 → E2 패널 유지 확인:"; J "(()=>{const w2=document.getElementById('state-e2');const b=[...w2.querySelectorAll('button[aria-label=\"패널 닫기\"]')][0];b.click();const p2=[...w2.querySelectorAll('aside')].find(a=>!a.classList.contains('sidebar'));return JSON.stringify({e2panel:getComputedStyle(p2).display,id:b.id||'(없음)'})})()"
"$B" screenshot --viewport "$OUT/cap-e9-panel.png" >/dev/null 2>&1
G "$R2/06-employees-1.html"; "$B" scroll '#state-e9' >/dev/null 2>&1; J "(()=>{document.getElementById('e2-detail-title-e9').scrollIntoView({block:'center'});return 1})()" >/dev/null; "$B" screenshot --viewport "$OUT/cap-e9-panel.png" >/dev/null 2>&1; echo "cap-e9-panel.png"

echo "### $(date +%H:%M:%S) audit1b 1차 10파일 → _audit1b.jsonl"
: > "$OUT/_audit1b.jsonl"
for f in 03-home-1 03-home-2 05-sites-wizard-1 05-sites-wizard-2 05-sites-wizard-3 05-sites-wizard-4 08-performance-1 08-performance-2 08-performance-3 08-performance-4; do
  G "$R1/$f.html"; "$B" eval "$OUT/audit1b.js" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$' >> "$OUT/_audit1b.jsonl"
  echo "$f: console=$("$B" console --errors 2>/dev/null | tr '\n' ' ' | cut -c1-80)"
done
echo "### $(date +%H:%M:%S) 34파일 스크립트 문법·콘솔·id 중복·깨진 참조"
for p in "$R1"/03-home-1 "$R1"/03-home-2 "$R1"/05-sites-wizard-1 "$R1"/05-sites-wizard-2 "$R1"/05-sites-wizard-3 "$R1"/05-sites-wizard-4 "$R1"/08-performance-1 "$R1"/08-performance-2 "$R1"/08-performance-3 "$R1"/08-performance-4 "$R2"/00-shell-1 "$R2"/00-shell-2 "$R2"/01-login-1 "$R2"/01-login-2 "$R2"/02-common-1 "$R2"/02-common-2 "$R2"/02-common-3 "$R2"/04-sites-1 "$R2"/04-sites-2 "$R2"/06-employees-1 "$R2"/06-employees-2 "$R2"/06-employees-3 "$R2"/07-schedule-1 "$R2"/07-schedule-2 "$R2"/07-schedule-3 "$R2"/09-allowance-1 "$R2"/09-allowance-2 "$R2"/09-allowance-3 "$R2"/10-dashboard-1 "$R2"/11-operations-1 "$R2"/11-operations-2 "$R2"/11-operations-3 "$R2"/11-operations-4 "$R2"/12-access-logs-1; do
  G "$p.html"
  echo "$(basename "$p"): $(J "(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);const dup=ids.filter((x,i)=>ids.indexOf(x)!==i);const broken=[...document.querySelectorAll('[aria-describedby],[aria-labelledby],label[for]')].filter(e=>{const v=e.getAttribute('aria-describedby')||e.getAttribute('aria-labelledby')||e.getAttribute('for');return v.split(/\\s+/).some(id=>!document.getElementById(id))}).length;const syn=[...document.scripts].map(s=>{try{new Function(s.textContent);return 0}catch(e){return e.message}}).filter(x=>x);return JSON.stringify({dup:dup.length,broken,syn,stray:[...document.body.childNodes].filter(n=>n.nodeType===3&&n.nodeValue.trim()).length})})()") console=$("$B" console --errors 2>/dev/null | tr '\n' ' ' | cut -c1-60)"
done
echo "### 끝 $(date +%H:%M:%S)"
