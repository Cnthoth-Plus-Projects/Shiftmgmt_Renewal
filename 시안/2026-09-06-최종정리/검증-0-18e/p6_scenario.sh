#!/usr/bin/env bash
# 0-18e ⑤ 검증 — 08-performance-3.html P6: A-1 선택 행 연동 2행 연속 승인(실제 키) · A-2 파일 승인 모달 2사이클(처리 중 실제 Tab/Shift+Tab/Esc는 chain으로 800ms 안에 입력)
B="$HOME/.claude/skills/gstack/browse/dist/browse"
F="file:///C:/Projects/Active/교대근무관리 시스템/시안/2026-08-31-1차HTML/08-performance-3.html"
J() { "$B" js "$1" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'; }
K() { "$B" press "$1" >/dev/null 2>&1; }
C() { "$B" click "$1" >/dev/null 2>&1; }
STATE="(()=>{const w=document.querySelector('#state-p6');const chip=document.getElementById('p6-chip-pending');const g=id=>{const e=document.getElementById(id);return e?e.textContent.trim():null};return JSON.stringify({sel:(w.querySelector('tr[aria-selected=true]')||{}).id||'?',focus:document.activeElement.id||document.activeElement.tagName,chip:(chip.textContent.match(/\\d+/)||[])[0],badge:g('p6-sidebar-badge'),live:g('p6-aria-live'),r2:document.querySelector('#p6-row-2 .status-col').textContent.trim(),r5:document.querySelector('#p6-row-5 .status-col').textContent.trim(),r7:document.querySelector('#p6-row-7 .status-col').textContent.trim(),lock:document.getElementById('btn-approve-single').getAttribute('aria-disabled'),lockDesc:getComputedStyle(document.getElementById('p6-approve-desc')).display,single:getComputedStyle(document.getElementById('modal-approve-single')).display,file:getComputedStyle(document.getElementById('modal-approve-file')).display,target:g('p6-single-target')})})()"
PANEL="(()=>{const g=id=>document.getElementById(id).textContent.trim();const row=document.querySelector('#state-p6 tr[aria-selected=true]');const c=n=>row.querySelector('td[data-col='+n+']')?row.querySelector('td[data-col='+n+']').textContent.trim():null;let r=row,site=null;while(r&&!site){const t=r.querySelector('td[data-col=site]');if(t)site=t.textContent.replace(/\\s*\\(\\d+\\)\\s*$/,'').trim();r=r.previousElementSibling;}const h=(c('hours')||'').match(/^([\\d.]+)\\s*=\\s*([\\d.]+)\\+([\\d.]+)\\+([\\d.]+)/);const exp={site,emp:c('emp'),name:c('name'),rank:c('rank'),date:c('date'),work:c('section')+' · '+c('code')+' · '+c('time')+' ('+h[1]+')',base:h[2],ot:h[3],night:h[4],wage:c('wage')+'원'};const got={site:g('p6-d-site'),emp:g('p6-d-emp'),name:g('p6-d-name'),rank:g('p6-d-rank'),date:g('p6-d-date'),work:g('p6-d-work'),base:g('p6-d-base'),ot:g('p6-d-ot'),night:g('p6-d-night'),wage:g('p6-d-wage')};const diff=Object.keys(exp).filter(k=>exp[k]!==got[k]);return JSON.stringify({panel:getComputedStyle(document.getElementById('p6-detail-panel')).display,row:row.id,match:10-diff.length,diff,got})})()"
BUSY="(()=>{const m=document.getElementById('modal-approve-file');const e=new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});m.dispatchEvent(e);const e2=new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true});m.dispatchEvent(e2);const e3=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});m.dispatchEvent(e3);return JSON.stringify({t:new Date().toISOString().slice(11,23),inModal:m.contains(document.activeElement),display:getComputedStyle(m).display,cancelDis:document.getElementById('btn-file-cancel').disabled,confirmDis:document.getElementById('btn-file-confirm').disabled,focus:document.activeElement.id,live:document.getElementById('p6-aria-live').textContent,synthPrevented:[e.defaultPrevented,e2.defaultPrevented,e3.defaultPrevented].join('/')})})()"
echo "### A-1 시작 $(date +%H:%M:%S) — 새로 열기 1회"
"$B" goto "$F" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1
echo "0 초기: $(J "$STATE")"
J "(()=>{document.getElementById('p6-row-2').focus();return document.activeElement.id})()" >/dev/null
K Enter; echo "1 row-2 Enter → 패널: $(J "$PANEL")"
K Escape; echo "2 Esc → focus: $(J "(()=>document.activeElement.id)()")"
C '#btn-approve-single'; echo "3 [승인] → $(J "$STATE")"
C '#btn-single-confirm'; echo "4 실행 → $(J "$STATE")"
K Enter; echo "5 (초기화 없이) 다음 대기 행 Enter → 패널: $(J "$PANEL")"
K Escape; C '#btn-approve-single'; echo "6 [승인] → $(J "$STATE")"
C '#btn-single-confirm'; echo "7 실행 → $(J "$STATE")"
J "(()=>{document.getElementById('p6-row-2').click();return document.activeElement.id})()" >/dev/null
echo "8 row-2 재선택 → $(J "$STATE")"
C '#btn-approve-single'; echo "9 잠긴 [승인] 클릭 → $(J "$STATE")"
J "(()=>{document.getElementById('btn-approve-single').focus();return 1})()" >/dev/null; K Enter; K Space; echo "10 잠긴 [승인] Enter/Space → $(J "$STATE")"
echo "### A-2 시작 $(date +%H:%M:%S) — 새로 열기 1회, 이후 외부 초기화 없음"
"$B" goto "$F" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1
for cyc in 1 2; do
  C '#btn-approve-file'; echo "$cyc-a 열기 → $(J "$STATE") / body=$(J "(()=>document.getElementById('modal-file-body').textContent.trim().slice(0,20))()")"
  echo "$cyc-b 실행 + 처리 중 실제 Tab/Shift+Tab/Esc (chain, $(date +%H:%M:%S.%N | cut -c1-12)):"
  echo '[["click","#btn-file-confirm"],["press","Tab"],["press","Shift+Tab"],["press","Escape"],["js","'"$BUSY"'"]]' | "$B" chain 2>&1 | grep "^\[js\]" | cut -c1-400
  sleep 1.2
  echo "$cyc-c 완료 후: $(J "(()=>{const d=document.getElementById('btn-file-done');return JSON.stringify({done:!!d,focus:document.activeElement.id,body:document.getElementById('modal-file-body').textContent.trim().slice(0,30),confirmLeft:!!document.getElementById('btn-file-confirm'),footerBtns:document.getElementById('modal-file-footer').querySelectorAll('button').length})})()")"
  C '#btn-file-done'; echo "$cyc-d 닫기 → $(J "$STATE")"
done
echo "### 끝 $(date +%H:%M:%S)"
