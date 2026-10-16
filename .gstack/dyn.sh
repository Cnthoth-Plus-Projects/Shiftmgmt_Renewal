#!/usr/bin/env bash
# ⑤ 동적 실측 — S6 모달 왕복(opener 2곳) · ☰ · T2/T4 왕복 · E1/G1 키보드 · L4 게이트 · C4 게이트 · O9→O10 연쇄
B="$HOME/.claude/skills/gstack/browse/dist/browse"
W="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차HTML"
J() { "$B" js "$1" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'; }
G() { "$B" goto "file:///$W/$1" >/dev/null 2>&1; }

echo "=== 00-shell-2 S6 모달 왕복 ==="
G 00-shell-2.html
J "(()=>{const w=document.getElementById('state-s6');const ops=[...w.querySelectorAll('button,a')].filter(b=>b.textContent.trim()==='자세히 보기');window.__ops=ops;return 'opener 수='+ops.length+' / 밴드='+(ops[0]&&ops[0].closest('.update-band, .banner, [class*=band], [class*=banner]')?'Y':'?')+' / 상태줄='+(ops[1]&&ops[1].closest('.footer-statusbar')?'Y':'?');})()"
for i in 0 1; do
  echo "-- opener[$i]"
  J "(()=>{const o=window.__ops[$i];o.focus();o.click();const m=document.querySelector('#state-s6 .modal-overlay');const cs=getComputedStyle(m);const t=m.querySelector('h2,[id*=title],.modal-title');return 'open:'+(cs.display!=='none')+' role='+m.getAttribute('role')+' modal='+m.getAttribute('aria-modal')+' title='+(t?t.textContent.trim():'?')+' w='+Math.round(m.querySelector('.modal-box').getBoundingClientRect().width)+' focusIn='+(m.contains(document.activeElement))+' bgAriaHidden='+(document.querySelector('#state-s6 .app-window')?.getAttribute('aria-hidden'));})()"
  "$B" press Tab >/dev/null 2>&1; "$B" press Tab >/dev/null 2>&1; "$B" press Tab >/dev/null 2>&1; "$B" press Tab >/dev/null 2>&1; "$B" press Tab >/dev/null 2>&1; "$B" press Tab >/dev/null 2>&1
  J "(()=>{const m=document.querySelector('#state-s6 .modal-overlay');return 'trap(6 Tab 후 포커스가 모달 안):'+m.contains(document.activeElement)+' active='+(document.activeElement.textContent||'').trim().slice(0,12);})()"
  "$B" press Escape >/dev/null 2>&1
  J "(()=>{const m=document.querySelector('#state-s6 .modal-overlay');const o=window.__ops[$i];return 'afterEsc closed:'+(getComputedStyle(m).display==='none')+' focusBack:'+(document.activeElement===o)+' bgRestored:'+(document.querySelector('#state-s6 .app-window')?.getAttribute('aria-hidden')===null);})()"
done
echo "-- 모달 본문 문구·버튼"
J "(()=>{window.__ops[0].click();const m=document.querySelector('#state-s6 .modal-overlay');const txt=m.innerText.replace(/\s+/g,' ');const btns=[...m.querySelectorAll('button')].map(b=>b.textContent.trim()).join('|');return btns+' || '+txt.slice(0,420);})()"
"$B" press Escape >/dev/null 2>&1
echo "-- [나중에] 클릭 닫기"
J "(()=>{window.__ops[1].click();const m=document.querySelector('#state-s6 .modal-overlay');const b=[...m.querySelectorAll('button')].find(b=>b.textContent.trim()==='나중에');b.click();return 'closed:'+(getComputedStyle(m).display==='none')+' focusBack(statusbar):'+(document.activeElement===window.__ops[1]);})()"
echo "-- S5 [다시 시작] · S6 [업데이트] 클릭 반응"
J "(()=>{const b=[...document.querySelectorAll('#state-s5 button')].find(b=>b.textContent.trim()==='다시 시작');b.click();return 'S5 after click label='+b.textContent.trim()+' disabled='+b.disabled;})()"
J "(()=>{const b=[...document.querySelectorAll('#state-s6 button')].find(b=>b.textContent.trim()==='업데이트');b.click();return 'S6 after click label='+b.textContent.trim()+' disabled='+b.disabled;})()"

echo "=== 00-shell-1 ☰ ==="
G 00-shell-1.html
J "(()=>{const t=document.querySelector('#state-s1 .btn-sidebar-toggle');const s=document.querySelector('#state-s1 .sidebar');const b=Math.round(s.getBoundingClientRect().width);t.click();const a=Math.round(s.getBoundingClientRect().width);const ex=t.getAttribute('aria-expanded');t.click();return 'before='+b+' after='+a+' aria-expanded(after)='+ex+' restored='+Math.round(s.getBoundingClientRect().width);})()"

echo "=== 04-sites-1 T2 왕복 ==="
G 04-sites-1.html
J "(()=>{const o=[...document.querySelectorAll('#state-t1 button')].find(b=>b.textContent.trim()==='상세');window.__o=o;o.focus();o.click();const m=document.querySelector('#state-t1 .modal-overlay');return 'open:'+(getComputedStyle(m).display!=='none')+' role='+m.getAttribute('role')+' w='+Math.round(m.querySelector('.modal-box').getBoundingClientRect().width)+' focusIn='+m.contains(document.activeElement)+' btns='+[...m.querySelectorAll('button')].map(b=>b.textContent.trim()).join('|');})()"
"$B" press Escape >/dev/null 2>&1
J "(()=>{const m=document.querySelector('#state-t1 .modal-overlay');return 'afterEsc closed:'+(getComputedStyle(m).display==='none')+' focusBack:'+(document.activeElement===window.__o);})()"

echo "=== 04-sites-2 T4 왕복 ==="
G 04-sites-2.html
J "(()=>{const o=[...document.querySelectorAll('#state-t4 button')].find(b=>b.textContent.includes('열어 보기'));window.__o=o;o.focus();o.click();const m=document.querySelector('#state-t4 .modal-overlay');const d=[...m.querySelectorAll('button')].find(b=>b.textContent.trim()==='삭제');window.__d=d;return 'open:'+(getComputedStyle(m).display!=='none')+' role='+m.getAttribute('role')+' w='+Math.round(m.querySelector('.modal-box').getBoundingClientRect().width)+' focusIn='+m.contains(document.activeElement)+' btns='+[...m.querySelectorAll('button')].map(b=>b.textContent.trim()).join('|');})()"
J "(()=>{window.__d.click();return '삭제 클릭 후 label='+window.__d.textContent.trim()+' disabled='+window.__d.disabled;})()"
"$B" press Escape >/dev/null 2>&1
J "(()=>{const m=document.querySelector('#state-t4 .modal-overlay');return 'afterEsc closed:'+(getComputedStyle(m).display==='none')+' focusBack:'+(document.activeElement===window.__o);})()"

echo "=== 06-employees-1 E1 표 키보드 ==="
G 06-employees-1.html
J "(()=>{const tb=document.querySelector('#state-e1 table tbody');const r=tb.querySelector('tr');r.focus();window.__r=r;return 'row tabindex='+r.getAttribute('tabindex')+' focused='+(document.activeElement===r)+' keydownHandlers(inline)='+(r.getAttribute('onkeydown')?'Y':'N');})()"
"$B" press ArrowDown >/dev/null 2>&1
J "(()=>{const a=document.activeElement;return 'afterDown active='+a.tagName+' row#='+([...a.parentElement.children].indexOf(a)+1)+' text='+(a.textContent||'').trim().slice(0,20);})()"
"$B" press Space >/dev/null 2>&1
J "(()=>{const a=document.activeElement;return 'afterSpace aria-selected='+a.getAttribute('aria-selected')+' class='+a.className+' bg='+getComputedStyle(a).backgroundColor;})()"

echo "=== 12-access-logs-1 G1 표 키보드 ==="
G 12-access-logs-1.html
J "(()=>{const r=document.querySelector('#state-g1 table tbody tr');r.focus();return 'tabindex='+r.getAttribute('tabindex')+' focused='+(document.activeElement===r);})()"
"$B" press ArrowDown >/dev/null 2>&1
J "(()=>{const a=document.activeElement;return 'afterDown row#='+([...a.parentElement.children].indexOf(a)+1)+' tag='+a.tagName;})()"

echo "=== 01-login-2 L4 게이트 ==="
G 01-login-2.html
J "(()=>{const w=document.getElementById('state-l4');const ins=[...w.querySelectorAll('input')].map(i=>i.type+':'+i.value.slice(0,3));const b=[...w.querySelectorAll('button')].find(b=>b.textContent.trim()==='비밀번호 변경');const rules=[...w.querySelectorAll('li,.rule,[class*=rule]')].filter(e=>e.children.length<3).map(e=>e.textContent.trim().slice(0,14)+'('+(e.className||'')+')').slice(0,6);return 'inputs='+ins.join(',')+' | btn aria-disabled='+b.getAttribute('aria-disabled')+' disabled='+b.disabled+' desc='+b.getAttribute('aria-describedby')+' | rules='+rules.join(' / ');})()"

echo "=== 02-common-1 C4 게이트 ==="
G 02-common-1.html
J "(()=>{const w=document.getElementById('state-c4');const ta=w.querySelector('textarea');const b=[...w.querySelectorAll('button')].find(b=>b.textContent.trim()==='반려');const d=b.getAttribute('aria-describedby');const before=b.getAttribute('aria-disabled');ta.value='근거 자료 누락';ta.dispatchEvent(new Event('input',{bubbles:true}));return 'before='+before+' descText='+(d&&document.getElementById(d)?document.getElementById(d).textContent.trim():'?')+' after input aria-disabled='+b.getAttribute('aria-disabled');})()"

echo "=== 11-operations-4 O9→O10 · 게이트 ==="
G 11-operations-4.html
J "(()=>{const n=[...document.querySelectorAll('#state-o9 button')].find(b=>b.textContent.includes('다음'));n.click();const o10=document.querySelector('#state-o10 .modal-box');return 'O9[다음] 클릭 → O10 상태 wrapper 별도('+(!!o10)+') ; O9 wrapper 안에 overlay='+(!!document.querySelector('#state-o9 .modal-overlay'))+' ; O9 modal-box role='+document.querySelector('#state-o9 .modal-box').getAttribute('role');})()"
J "(()=>{const w=document.getElementById('state-o10');const i=w.querySelector('input');const b=[...w.querySelectorAll('button')].find(b=>b.textContent.includes('교체 실행'));i.value='교체';i.dispatchEvent(new Event('input',{bubbles:true}));const a=b.getAttribute('aria-disabled');b.click();return 'after 교체 입력 aria-disabled='+a+' ; click 후 label='+b.textContent.trim()+' disabled='+b.disabled;})()"

echo "=== 정적 모달 role/overlay 점검 ==="
for f in 02-common-1 06-employees-2 06-employees-3 07-schedule-3 09-allowance-2 11-operations-4; do
  G "$f.html"
  echo "-- $f: $(J "[...document.querySelectorAll('.state-wrapper')].map(w=>w.id+':overlay='+!!w.querySelector('.modal-overlay')+',dialogRole='+!!w.querySelector('[role=dialog]')+',trigger='+[...w.querySelectorAll('button')].filter(b=>b.textContent.includes('열어 보기')).length).join(' ')")"
done
