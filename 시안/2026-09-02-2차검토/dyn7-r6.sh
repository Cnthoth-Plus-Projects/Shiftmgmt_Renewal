#!/usr/bin/env bash
# ⑤ 6차 전용 — R13-b ☰ 접힘 후 nav title · R14-a E1/A1 Enter → activeElement.id · R14-c status div 7 구조 + S5/S6 데모 낭독 텍스트 · R14-d E5/O10 describedby 동기화 · R15 로그인/readonly/btn-secondary 계산값
B="$HOME/.claude/skills/gstack/browse/dist/browse"
W="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차HTML"
J() { "$B" js "$1" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'; }
G() { "$B" goto "file:///$W/$1" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1; }
"$B" viewport 1440x900 >/dev/null 2>&1

JS_TOGGLE="(()=>{return [...document.querySelectorAll('.state-wrapper')].map(w=>{const b=w.querySelector('.btn-sidebar-toggle');const s=w.querySelector('.sidebar');if(!b||!s)return w.id+' 셸없음';const t0=[...s.querySelectorAll('.nav-item')].map(a=>a.getAttribute('title')).filter(Boolean).length;const c0=s.classList.contains('collapsed');b.click();const t1=[...s.querySelectorAll('.nav-item')].map(a=>a.getAttribute('title')||'∅');const c1=s.classList.contains('collapsed');b.click();const t2=[...s.querySelectorAll('.nav-item')].map(a=>a.getAttribute('title')).filter(Boolean).length;const c2=s.classList.contains('collapsed');return w.id+' 초기(collapsed='+c0+') title='+t0+' → 토글1(collapsed='+c1+') title='+t1.join('/')+' → 토글2(collapsed='+c2+') title='+t2;}).join('\n');})()"

JS_ENTER="(()=>{return ['e1','a1'].map(id=>{const w=document.getElementById('state-'+id);if(!w)return id+' 없음';const rows=[...w.querySelectorAll('table tbody tr')];const tr=rows[0];const ti=rows.map(r=>r.getAttribute('tabindex')).join(',');tr.focus();tr.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));const ae=document.activeElement;const tgt=document.getElementById(id==='e1'?'e2-detail-title':'a2-detail-title');return id.toUpperCase()+' 행 tabindex='+ti+' | Enter → activeElement id='+(ae.id||ae.tagName)+' text=\"'+(ae.textContent||'').replace(/\s+/g,' ').trim().slice(0,30)+'\" | 대상 존재='+!!tgt+' tabindex='+(tgt?tgt.getAttribute('tabindex'):'-')+' | 상태 밖 위치='+(tgt?tgt.closest('.state-wrapper').id:'-');}).join('\n');})()"

JS_ARROWS="(()=>{const w=document.getElementById('state-a1');if(!w)return 'A1 없음';const rows=[...w.querySelectorAll('table tbody tr')];rows[0].focus();rows[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));const d=document.activeElement===rows[1];document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));const sel=rows[1].classList.contains('selected');return 'A1 ↓ → 2행 포커스='+d+' · Space → selected='+sel;})()"

JS_LIVE="(()=>{const out=[];document.querySelectorAll('[role=status],[aria-live]').forEach(e=>{const w=e.closest('.state-wrapper');const main=e.closest('.page-content');const first=main&&main.firstElementChild===e;const cs=getComputedStyle(e);const ref=[...document.scripts].some(s=>s.textContent.includes(e.id));out.push((w?w.id:'?')+':#'+e.id+' role='+e.getAttribute('role')+' live='+e.getAttribute('aria-live')+' sr-only='+(cs.position==='absolute'&&cs.width==='1px')+' main첫자식='+first+' JS참조='+ref+' text=\"'+e.textContent+'\"');});return out.join('\n')||'status 없음';})()"

JS_S5S6="(()=>{const s5=document.getElementById('state-s5');const b=[...s5.querySelectorAll('button')].find(x=>x.textContent.trim()==='다시 시작');b.click();const l5=document.getElementById('live-s5');const s6=document.getElementById('state-s6');const u=[...s6.querySelectorAll('button')].find(x=>x.textContent.trim()==='업데이트');u.click();const l6=document.getElementById('live-s6');return 'S5 [다시 시작] → live-s5=\"'+(l5?l5.textContent:'없음')+'\" 버튼='+b.textContent.trim()+' | S6 밴드 [업데이트] → live-s6=\"'+(l6?l6.textContent:'없음')+'\" 버튼='+u.textContent.trim();})()"

JS_E5="(()=>{const w=document.getElementById('state-e5');const ups=[...w.querySelectorAll('.btn-up')],downs=[...w.querySelectorAll('.btn-down')];const st=()=>ups.map((u,i)=>'↑'+(u.getAttribute('aria-disabled')||'-')+'/'+(u.getAttribute('aria-describedby')||'-')+' ↓'+(downs[i].getAttribute('aria-disabled')||'-')+'/'+(downs[i].getAttribute('aria-describedby')||'-')).join(' | ');const s0=st();downs[0].click();const s1=st();const ids=['e5-desc-top','e5-desc-bottom'].map(i=>{const e=document.getElementById(i);return i+'='+(e?'\"'+e.textContent+'\" sr='+(getComputedStyle(e).position==='absolute'):'없음');});return '초기: '+s0+'\n1행 ↓ 후: '+s1+'\n'+ids.join(' · ');})()"

JS_O10="(()=>{const b=document.getElementById('btn-exec-o10');const i=document.getElementById('o10-confirm-input');const d=document.getElementById('o10-exec-desc');const st=()=>'aria-disabled='+(b.getAttribute('aria-disabled')||'-')+' describedby='+(b.getAttribute('aria-describedby')||'-')+' desc.display='+(d?getComputedStyle(d).display:'없음')+' fs='+(d?getComputedStyle(d).fontSize:'-');const s0=st();i.value='교체';i.dispatchEvent(new Event('input',{bubbles:true}));const s1=st();i.value='';i.dispatchEvent(new Event('input',{bubbles:true}));const s2=st();return 'O10 초기 '+s0+'\n  교체 입력 → '+s1+'\n  비움 → '+s2+'\n  desc text=\"'+(d?d.textContent.trim():'')+'\"';})()"

JS_R15="(()=>{const lum=c=>{const m=c.match(/\d+(\.\d+)?/g).map(Number);const [r,g,b]=m.slice(0,3).map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return 0.2126*r+0.7152*g+0.0722*b;};const cr=(a,b)=>((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)).toFixed(2);const white=lum('rgb(255,255,255)');const root=getComputedStyle(document.documentElement);const out=['--line-strong='+root.getPropertyValue('--line-strong').trim()];const probe=(sel,label)=>{const e=document.querySelector(sel);if(!e){out.push(label+': 없음');return;}const c0=getComputedStyle(e);const b0=c0.borderColor;e.focus();const c=getComputedStyle(e);out.push(label+' 테두리='+b0+' 대비='+cr(lum(b0),white)+' | focus outline='+c.outlineStyle+' '+c.outlineWidth+' '+c.outlineColor+' offset='+c.outlineOffset+' 대비='+(c.outlineStyle!=='none'?cr(lum(c.outlineColor),white):'-')+' | 활성='+(document.activeElement===e));e.blur();};probe('.form-input:not([readonly])','input');probe('.form-input[readonly]','readonly');probe('select.form-select','select');probe('button.btn-secondary','btn-secondary');probe('button.btn-primary','btn-primary');probe('[role=tab]','tab');return out.join('\n');})()"

echo "=============== R13-b ☰ 접기 → nav title (셸 19파일 42상태) ==============="
for f in 00-shell-1 00-shell-2 04-sites-1 04-sites-2 06-employees-1 06-employees-2 06-employees-3 07-schedule-1 07-schedule-2 07-schedule-3 09-allowance-1 09-allowance-2 09-allowance-3 10-dashboard-1 11-operations-1 11-operations-2 11-operations-3 11-operations-4 12-access-logs-1; do G "$f.html"; echo "-- $f"; J "$JS_TOGGLE"; done
echo "=============== R14-a E1·A1 Enter → activeElement ==============="
G 06-employees-1.html; J "$JS_ENTER"
G 09-allowance-1.html; J "$JS_ENTER"; J "$JS_ARROWS"
echo "=============== R14-c status div 구조 (7파일) ==============="
for f in 00-shell-2 04-sites-2 06-employees-3 07-schedule-3 09-allowance-2 11-operations-4; do G "$f.html"; echo "-- $f"; J "$JS_LIVE"; done
G 00-shell-2.html; J "$JS_S5S6"
echo "=============== R14-d E5 · O10 describedby ==============="
G 06-employees-2.html; J "$JS_E5"
G 11-operations-4.html; J "$JS_O10"
echo "=============== R15 계산값 (11-operations-1 / 01-login-1 / 01-login-2 / 02-common-1) ==============="
for f in 11-operations-1 01-login-1 01-login-2 02-common-1; do G "$f.html"; echo "-- $f"; J "$JS_R15"; done
echo DONE
