#!/usr/bin/env bash
# ⑤ 5차 텍스트 기반 실측 — R7(로그인 라벨 바 5상태 + 부제) · R8(E6/E7 nav) · R9/R10(19파일 42상태 상태줄 title 정본 대조) · R11(A1·O2·O3·O4·O5 표 전 행 높이 + th + 버튼/입력/배지 높이 + td padding) — 스냅샷4차와 전후 대조
B="$HOME/.claude/skills/gstack/browse/dist/browse"
W="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차HTML"
S="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차검토/스냅샷4차"
J() { "$B" js "$1" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'; }
G() { "$B" goto "file:///$1" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1; }
"$B" viewport 1440x900 >/dev/null 2>&1

JS_R7="(()=>{return [...document.querySelectorAll('.state-wrapper')].map(w=>{const b=w.querySelector('.status-label-bar');if(!b)return w.id+' 라벨바 없음';const cs=getComputedStyle(b);const r=b.getBoundingClientRect();const sub=[...w.querySelectorAll('*')].filter(e=>e.children.length===0&&/계정 정보를 입력하여/.test(e.textContent)).length;const l4=[...w.querySelectorAll('*')].filter(e=>e.children.length===0&&/비밀번호 변경이 필요합니다/.test(e.textContent)).map(e=>e.tagName.toLowerCase()+'.'+e.className+' vis='+(e.offsetParent!==null)).join(',');const card=w.querySelector('.login-card,[class*=card]');const cr=card?card.getBoundingClientRect():null;return w.id+' h='+Math.round(r.height)+' w='+Math.round(r.width)+' bg='+cs.backgroundColor+' color='+cs.color+' fs='+cs.fontSize+' fw='+cs.fontWeight+' display='+cs.display+' align='+cs.alignItems+' padL='+cs.paddingLeft+' padT='+cs.paddingTop+' padR='+cs.paddingRight+' radius='+cs.borderRadius+' borderB='+cs.borderBottomWidth+' '+cs.borderBottomStyle+' '+cs.borderBottomColor+' text=\"'+b.textContent.trim()+'\" | 창작부제='+sub+' | 정본부제(L4)='+(l4||'없음')+' | card='+(cr?Math.round(cr.width)+'x'+Math.round(cr.height)+'@'+Math.round(cr.left)+','+Math.round(cr.top):'-');}).join('\n');})()"

JS_R8="(()=>{return [...document.querySelectorAll('.state-wrapper')].map(w=>{const s=w.querySelector('.sidebar');if(!s)return w.id+' 셸없음';const heads=[...s.querySelectorAll('.nav-group-header')].map(e=>e.textContent.trim()+(e.offsetParent!==null?'':'(숨김)'));const items=[...s.querySelectorAll('.nav-item')].map(a=>[...a.querySelectorAll('span')].filter(x=>!x.classList.contains('material-symbols-outlined')&&!/badge/.test(x.className)).map(x=>x.textContent.trim()).join('')+(a.classList.contains('active')?'*':''));const chip=(w.querySelector('.role-badge')||{textContent:'?'}).textContent.trim();const user=(w.querySelector('.user-info-btn')||{textContent:'?'}).textContent.replace(/\s+/g,' ').trim();const ul=s.querySelector('ul');const blank=ul?[...ul.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()==='').length:0;return w.id+' chip='+chip+' user='+user+' heads('+heads.length+')='+heads.join('/')+' items('+items.length+')='+items.join(',')+' | ul 공백텍스트노드='+blank;}).join('\n');})()"

JS_TITLE="(()=>{const C5=['데이터 폴더 연결됨','마지막 처리 완료 시각','대기 폴더 파일 수','현재 버전 최신 여부','버전 정보'];const C6=['데이터 폴더 연결됨','마지막 처리 완료 시각','대기 폴더 파일 수','승인 대기 폴더 자동 감시','현재 버전 최신 여부','버전 정보'];return [...document.querySelectorAll('.state-wrapper')].map(w=>{const cells=[...w.querySelectorAll('.footer-statusbar .status-cell')];if(!cells.length)return w.id+' 상태줄 없음';const t=cells.map(c=>c.title);const ref=cells.length===6?C6:cells.length===5?C5:null;const ok=ref&&t.every((x,i)=>x===ref[i]);return w.id+'('+cells.length+') '+(ok?'OK':'NG')+' '+cells.map(c=>'['+c.innerText.replace(/\s+/g,' ').trim().slice(0,20)+'|'+c.title+']').join(' ');}).join('\n');})()"

JS_R11="(()=>{return [...document.querySelectorAll('.state-wrapper')].map(w=>{const tables=[...w.querySelectorAll('table')];if(!tables.length)return w.id+' 표 없음';return tables.map((t,ti)=>{const vis=t.offsetParent!==null;const ths=[...t.querySelectorAll('thead tr')].map(r=>Math.round(r.getBoundingClientRect().height));const rows=[...t.querySelectorAll('tbody tr')].map(r=>Math.round(r.getBoundingClientRect().height));const btns=[...t.querySelectorAll('tbody button')].map(b=>Math.round(b.getBoundingClientRect().height)+'/'+getComputedStyle(b).fontSize);const ins=[...t.querySelectorAll('tbody input,tbody select')].map(i=>Math.round(i.getBoundingClientRect().height));const badges=[...t.querySelectorAll('tbody [class*=badge]')].map(b=>Math.round(b.getBoundingClientRect().height));const td=t.querySelector('tbody td');const c=td?getComputedStyle(td):null;const th=t.querySelector('thead th');const hc=th?getComputedStyle(th):null;const wrap=[...t.querySelectorAll('tbody td')].filter(x=>x.getBoundingClientRect().height>40).length;return w.id+' 표'+(ti+1)+(vis?'':'(숨김)')+' th='+ths.join(',')+'(pad '+(hc?hc.paddingTop+'/'+hc.paddingBottom:'-')+') rows('+rows.length+')='+rows.join(',')+' | td pad='+(c?c.paddingTop+'/'+c.paddingBottom+' valign='+c.verticalAlign+' fs='+c.fontSize:'-')+' | btn h/fs='+[...new Set(btns)].join(',')+' | input h='+[...new Set(ins)].join(',')+' | badge h='+[...new Set(badges)].join(',')+' | td>40='+wrap;}).join('\n');}).join('\n');})()"

echo "=============== R7 로그인 라벨 바 5상태 (현재) ==============="
for f in 01-login-1 01-login-2; do G "$W/$f.html"; J "$JS_R7"; done
echo "=============== R7 스냅샷4차 (전) ==============="
for f in 01-login-1 01-login-2; do G "$S/$f.html"; J "$JS_R7"; done

echo "=============== R8 06-employees-3 E6/E7 nav (현재) ==============="
G "$W/06-employees-3.html"; J "$JS_R8"
echo "=============== R8 스냅샷4차 (전) ==============="
G "$S/06-employees-3.html"; J "$JS_R8"

echo "=============== R9·R10 상태줄 title 정본 대조 — 셸 19파일 42상태 (현재) ==============="
for f in 00-shell-1 00-shell-2 04-sites-1 04-sites-2 06-employees-1 06-employees-2 06-employees-3 07-schedule-1 07-schedule-2 07-schedule-3 09-allowance-1 09-allowance-2 09-allowance-3 10-dashboard-1 11-operations-1 11-operations-2 11-operations-3 11-operations-4 12-access-logs-1; do
  G "$W/$f.html"; echo "-- $f"; J "$JS_TITLE"
done

echo "=============== R11 표 행 높이 전수 (현재) ==============="
for f in 09-allowance-1 11-operations-1 11-operations-2; do G "$W/$f.html"; echo "-- $f"; J "$JS_R11"; done
echo "=============== R11 스냅샷4차 (전) ==============="
for f in 09-allowance-1 11-operations-1 11-operations-2; do G "$S/$f.html"; echo "-- $f"; J "$JS_R11"; done
echo DONE
