#!/usr/bin/env bash
# 0-18i ④ 3차 ⑤ 시나리오 — Codex ⑥ 2차 N1(접근성 트리 실제 name + P6 동적 갱신)·N2(skip-link Tab→Enter→Tab 71상태)·N3(W7 닫기 3경로 뒤 직접 텍스트) 실측
B="$HOME/.claude/skills/gstack/browse/dist/browse"
R1="file:///C:/Projects/Active/교대근무관리 시스템/시안/2026-08-31-1차HTML"
R2="file:///C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차HTML"
OUT="시안/2026-09-06-최종정리/검증-0-18e3"
J() { "$B" js "$1" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'; }
K() { "$B" press "$1" >/dev/null 2>&1; }
C() { "$B" click "$1" >/dev/null 2>&1; }
G() { "$B" goto "$1" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1; }
AX() { "$B" accessibility 2>/dev/null | grep -o 'link "실적 관리[^"]*"' | sort | uniq -c | sed 's/^ *//' | tr '\n' ';'; }
"$B" viewport 1440x900 >/dev/null 2>&1
F1="03-home-1 03-home-2 05-sites-wizard-1 05-sites-wizard-2 05-sites-wizard-3 05-sites-wizard-4 08-performance-1 08-performance-2 08-performance-3 08-performance-4"
F2="00-shell-1 00-shell-2 04-sites-1 04-sites-2 06-employees-1 06-employees-2 06-employees-3 07-schedule-1 07-schedule-2 07-schedule-3 09-allowance-1 09-allowance-2 09-allowance-3 10-dashboard-1 11-operations-1 11-operations-2 11-operations-3 11-operations-4 12-access-logs-1"

echo "### $(date +%H:%M:%S) N1 접근성 트리 — 29파일 배지 링크 실제 name(노출 사이드바만 트리에 있음)"
for f in $F1; do G "$R1/$f.html"; echo "$f AX=$(AX)"; done
for f in $F2; do G "$R2/$f.html"; echo "$f AX=$(AX)"; done

echo "### $(date +%H:%M:%S) N1 P6 동적 배지 — 초기 · 단건 승인 · 파일 승인 · 재열기 표본 복원 (name = aria-label = title 숫자 = 배지 숫자)"
BADGE="(()=>{const b=document.getElementById('p6-sidebar-badge');const a=b.closest('a');return JSON.stringify({text:b.textContent.trim(),title:b.title,label:a.getAttribute('aria-label'),chip:document.getElementById('p6-chip-pending').textContent.trim()})})()"
G "$R1/08-performance-3.html"
echo "초기: $(J "$BADGE") AX=$(AX)"
J "(()=>{document.getElementById('p6-row-2').focus();return 1})()" >/dev/null; K Enter; K Escape; C '#btn-approve-single'; C '#btn-single-confirm'
echo "단건 승인 뒤: $(J "$BADGE") AX=$(AX)"
C '#btn-approve-file'; C '#btn-file-confirm'; sleep 2.5; C '#btn-file-done'
echo "파일 승인 뒤: $(J "$BADGE") AX=$(AX)"
C '#btn-approve-file'
echo "재열기(표본 복원) 뒤: $(J "$BADGE") AX=$(AX)"
K Escape
echo "접힘 상태 name(☰ 클릭 뒤): "; C "#state-p6 .btn-sidebar-toggle"; sleep 0.5; echo "  $(J "$BADGE") AX=$(AX)"; C "#state-p6 .btn-sidebar-toggle"; sleep 0.5

echo "### $(date +%H:%M:%S) N2 skip-link 71상태 — 링크 포커스 → Enter(실제 키) → activeElement → Tab(실제 키) → activeElement 위치"
SK="(()=>[...document.querySelectorAll('a.skip-link')].map(a=>a.getAttribute('href').slice(1)).join(' '))()"
AFTER="(()=>{const a=document.activeElement;const m=a.closest('main');return JSON.stringify({el:a.tagName+'#'+(a.id||''),inMain:m?m.id:null,inNav:!!a.closest('nav,.sidebar'),text:(a.getAttribute('aria-label')||a.textContent||'').trim().replace(/\s+/g,' ').slice(0,24)})})()"
run_skip() { # $1 url, $2 file
  G "$1/$2.html"
  for id in $(J "$SK" | tr -d '"'); do
    G "$1/$2.html"
    st=$(J "(()=>{const a=document.querySelector('a.skip-link[href=\"#$id\"]');const body=a.nextElementSibling&&a.nextElementSibling.classList.contains('app-body')?a.nextElementSibling:a.parentElement.querySelector('.app-body');a.focus();return JSON.stringify({focused:document.activeElement===a,bodyHidden:body?body.getAttribute('aria-hidden'):'?',targetTag:document.getElementById('$id')?document.getElementById('$id').tagName:'없음',targetHidden:document.getElementById('$id')?!!document.getElementById('$id').closest('[aria-hidden=true]'):null})})()")
    K Enter; e=$(J "$AFTER"); K Tab; t=$(J "$AFTER")
    echo "$2 $id 전=$st Enter=$e Tab=$t"
  done
}
for f in $F1; do run_skip "$R1" $f; done
for f in $F2; do run_skip "$R2" $f; done
echo "### $(date +%H:%M:%S) N2 캡처: 03-home-1 H1 skip-link Enter 뒤(포커스 링 위치)"
G "$R1/03-home-1.html"; J "(()=>{document.querySelector('a.skip-link[href=\"#main-content-h1\"]').focus();return 1})()" >/dev/null; K Enter; K Tab; "$B" screenshot --viewport "$OUT/cap-skiplink-enter-tab-03-home-1.png" >/dev/null 2>&1; echo "cap-skiplink-enter-tab-03-home-1.png"

echo "### $(date +%H:%M:%S) N3 W7 닫기 3경로(Esc · [계속 편집] · [변경 버리고 나가기]) 뒤 #state-w7 노출 직접 텍스트(12px 미만, 예외 ② .pattern-day-box 하위 · ③ .c-cell b 10px 한정 제외)"
W7="(()=>{const w=document.getElementById('state-w7');const vis=e=>e.getClientRects().length>0;const dlg=document.getElementById('modal-leave-w7');const body=document.getElementById('main-state-w7');const res=[];let bEx=0,bBad=0;const walker=document.createTreeWalker(w,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode())){if(!n.nodeValue.trim())continue;const el=n.parentElement;if(!el||el.closest('script,style')||!vis(el))continue;if(el.closest('[aria-hidden=true]'))continue;if(el.closest('.pattern-day-box'))continue;const fs=parseFloat(getComputedStyle(el).fontSize);if(el.matches('.c-cell b')){if(fs===10){bEx++;continue}else{bBad++}}if(fs<12)res.push((el.className||el.tagName)+':'+n.nodeValue.trim().slice(0,6)+':'+fs)}const m=w.querySelector('main');const cell=w.querySelector('.c-cell');const head=w.querySelector('.c-head');const grid=w.querySelector('.c-grid');const panel=w.querySelector('.sim-scroll-panel');const ovs=[...w.querySelectorAll('*')].filter(e=>vis(e)&&!/auto|scroll/.test(getComputedStyle(e).overflowX+getComputedStyle(e).overflowY)&&(e.scrollWidth>e.clientWidth+2||e.scrollHeight>e.clientHeight+2)&&!e.matches('html,body,table,tbody,thead,tr,td,th,.sr-only,.skip-link')).map(e=>(e.className||e.tagName).toString().slice(0,20)+':'+e.scrollWidth+'/'+e.clientWidth+'x'+e.scrollHeight+'/'+e.clientHeight);return JSON.stringify({dialog:dlg?getComputedStyle(dlg).display:'없음',bodyHidden:body.getAttribute('aria-hidden'),small:res.length,sample:res.slice(0,8),bEx,bBad,cell:cell?{fs:getComputedStyle(cell).fontSize,bfs:getComputedStyle(cell.querySelector('b')).fontSize,h:Math.round(cell.getBoundingClientRect().height)}:null,head:head?{fs:getComputedStyle(head).fontSize,h:Math.round(head.getBoundingClientRect().height)}:null,gridH:grid?Math.round(grid.getBoundingClientRect().height):0,panel:panel?{h:Math.round(panel.getBoundingClientRect().height),sh:panel.scrollHeight,maxH:getComputedStyle(panel).maxHeight}:null,main:m.scrollWidth+'/'+m.clientWidth,overflowers:ovs.slice(0,6),wrapperH:Math.round(w.getBoundingClientRect().height),toast:[...document.querySelectorAll('.toast, [class*=toast]')].filter(vis).map(t=>t.textContent.trim().slice(0,20))})})()"
G "$R1/05-sites-wizard-3.html"; echo "열린 상태(초기): $(J "$W7")"
K Escape; sleep 0.3; echo "Esc 뒤: $(J "$W7")"
"$B" screenshot --viewport "$OUT/cap-w7-after-esc.png" >/dev/null 2>&1; echo "cap-w7-after-esc.png"
G "$R1/05-sites-wizard-3.html"; J "(()=>{const b=[...document.querySelectorAll('#modal-leave-w7 button')].find(b=>b.textContent.trim()==='계속 편집');b.click();return b?1:0})()" >/dev/null; sleep 0.3; echo "[계속 편집] 뒤: $(J "$W7")"
G "$R1/05-sites-wizard-3.html"; J "(()=>{const b=[...document.querySelectorAll('#modal-leave-w7 button')].find(b=>b.textContent.trim()==='변경 버리고 나가기');b.click();return b?1:0})()" >/dev/null; sleep 0.3; echo "[변경 버리고 나가기] 뒤: $(J "$W7")"
echo "### $(date +%H:%M:%S) N3 대조: wizard-1 W2 달력(같은 규칙이어야 함)"
G "$R1/05-sites-wizard-1.html"; J "(()=>{const w=document.getElementById('state-w2');const cell=w.querySelector('.c-cell');const head=w.querySelector('.c-head');const grid=w.querySelector('.c-grid');const panel=w.querySelector('.sim-scroll-panel');return JSON.stringify({cell:{fs:getComputedStyle(cell).fontSize,bfs:getComputedStyle(cell.querySelector('b')).fontSize,h:Math.round(cell.getBoundingClientRect().height),minH:getComputedStyle(cell).minHeight,pad:getComputedStyle(cell).padding},head:{fs:getComputedStyle(head).fontSize,h:Math.round(head.getBoundingClientRect().height)},gridH:Math.round(grid.getBoundingClientRect().height),panel:panel?{h:Math.round(panel.getBoundingClientRect().height),sh:panel.scrollHeight,maxH:getComputedStyle(panel).maxHeight}:null})})()"
echo "### 끝 $(date +%H:%M:%S)"
