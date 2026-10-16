#!/usr/bin/env bash
# ⑤ 2차 재검토 동적 실측 (2026-09-06 15차: O1 탭 배지 추출 선택자 [role=tab] → 카드 grid 직계 div — D10 ⓑ로 role 제거된 뒤 갱신, Codex ⑥ 3차 요청) — Q1~Q7 모달 왕복 · Q15 ☰ · Q16 L4 · Q17 R3 · 고정 항목 회귀 · §D 검산
B="$HOME/.claude/skills/gstack/browse/dist/browse"
W="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차HTML"
J() { "$B" js "$1" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'; }
G() { "$B" goto "file:///$W/$1" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1; }
P() { "$B" press "$1" >/dev/null 2>&1; }
CON() { echo "   console: $("$B" console --errors 2>/dev/null | grep -c 'no console errors') (1=오류 없음)"; }
# 모달 왕복: $1=트리거id $2=모달id $3=라벨
MOD() {
  echo "-- [$3] 열기(트리거 $1 → $2)"
  J "(()=>{const t=document.getElementById('$1');const m=document.getElementById('$2');if(!t||!m)return 'MISSING t='+!!t+' m='+!!m;t.scrollIntoView({block:'center'});t.focus();t.click();const cs=getComputedStyle(m);const w=m.closest('.state-wrapper');const aw=w.querySelector('.app-window');const box=m.querySelector('.modal-box');const r=aw.getBoundingClientRect();const pt=document.elementFromPoint(Math.min(r.left+6,1430),Math.max(0,Math.min(r.top+r.height-6,890)));window.__t=t;window.__m=m;window.__aw=aw;return 'open='+(cs.display!=='none')+' dim='+cs.backgroundColor+' role='+m.getAttribute('role')+' aria-modal='+m.getAttribute('aria-modal')+' boxW='+Math.round(box.getBoundingClientRect().width)+' focusIn='+m.contains(document.activeElement)+' bgAriaHidden='+aw.getAttribute('aria-hidden')+' modalInsideHidden='+!!m.closest('[aria-hidden=true]')+' overlayCoversBg='+(pt?m.contains(pt):'?')+' title='+(m.querySelector('.modal-title')||{textContent:'?'}).textContent.trim().slice(0,30)+' btns='+[...m.querySelectorAll('button')].map(b=>b.textContent.trim()||b.getAttribute('aria-label')).join('|');})()"
  P Tab; P Tab; P Tab; P Tab; P Tab; P Tab
  J "(()=>{const m=window.__m;return '   trap(6 Tab):'+m.contains(document.activeElement)+' active='+(document.activeElement.textContent||document.activeElement.getAttribute('aria-label')||document.activeElement.tagName).trim().slice(0,14);})()"
  P Escape
  J "(()=>{const m=window.__m,t=window.__t,aw=window.__aw;return '   Esc→ closed='+(getComputedStyle(m).display==='none')+' focusBack='+(document.activeElement===t)+' bgRestored='+(aw.getAttribute('aria-hidden')===null);})()"
  J "(()=>{const m=window.__m,t=window.__t;t.click();const c=[...m.querySelectorAll('button')].find(b=>['취소','닫기','나중에'].includes(b.textContent.trim()));if(!c)return '   [취소/닫기/나중에] 없음';c.click();return '   ['+c.textContent.trim()+']→ closed='+(getComputedStyle(m).display==='none')+' focusBack='+(document.activeElement===t);})()"
  J "(()=>{const m=window.__m,t=window.__t;t.click();const x=m.querySelector('.btn-modal-close-x,[aria-label*=닫기]');if(!x)return '   ✕ 없음';x.click();return '   ✕→ closed='+(getComputedStyle(m).display==='none')+' focusBack='+(document.activeElement===t);})()"
}
# ☰: $1=파일 $2=상태id
SB() {
  J "(()=>{const w=document.getElementById('$2');const t=w.querySelector('.btn-sidebar-toggle');const s=w.querySelector('.sidebar');const main=w.querySelector('.app-body>main,.main-content,.app-main,.content');const W=e=>e?Math.round(e.getBoundingClientRect().width):null;const hid=()=>s.querySelectorAll('.nav-item [aria-hidden=true]').length;const b=W(s),bm=W(main),bh=hid();t.click();const a=W(s),am=W(main),ah=hid(),ex=t.getAttribute('aria-expanded');t.click();return '$2 ☰ side '+b+'→'+a+'→'+W(s)+' main '+bm+'→'+am+'→'+W(main)+' aria-expanded(after)='+ex+' navTextHidden '+bh+'→'+ah+'→'+hid();})()"
}

echo "=============== 02-common-1 C1~C4 (Q1) ==============="
G 02-common-1.html
MOD btn-open-c1 modal-c1 C1
MOD btn-open-c2 modal-c2 C2
MOD btn-open-c3 modal-c3 C3
MOD btn-open-c4 modal-c4 C4
echo "-- C4 게이트(지시서: 빈 값이면 aria-disabled, 값 있으면 해제)"
J "(()=>{document.getElementById('btn-open-c4').click();const ta=document.getElementById('c4-reason-input');const b=document.getElementById('btn-c4-reject');const d=document.getElementById(b.getAttribute('aria-describedby'));const st=()=>'aria-disabled='+b.getAttribute('aria-disabled')+' 사유표시='+(d&&d.offsetParent!==null)+' fs='+(d&&getComputedStyle(d).fontSize);const r0=st();ta.value='누락';ta.dispatchEvent(new Event('input',{bubbles:true}));const r1=st();ta.value='근거 자료 누락';ta.dispatchEvent(new Event('input',{bubbles:true}));const r2=st();ta.value='';ta.dispatchEvent(new Event('input',{bubbles:true}));return '빈값: '+r0+' | 2자(누락): '+r1+' | 7자: '+r2+' | descText='+(d?d.textContent.trim():'?');})()"
P Escape
echo "-- C1 [확인] 클릭 반응"
J "(()=>{document.getElementById('btn-open-c1').click();const m=document.getElementById('modal-c1');const ok=[...m.querySelectorAll('button')].find(b=>b.textContent.trim()==='확인');ok.click();return 'C1 [확인] 클릭 직후 label='+ok.textContent.trim()+' disabled='+ok.disabled;})()"
CON

echo "=============== 06-employees-2 E3·E4 (Q2) · E5 ↑↓ ==============="
G 06-employees-2.html
MOD btn-open-e3 modal-e3 E3
MOD btn-open-e4 modal-e4 E4
echo "-- E4 B조 정원 초과"
J "(()=>{document.getElementById('btn-open-e4').click();const m=document.getElementById('modal-e4');const els=[...m.querySelectorAll('[aria-disabled=true]')].map(e=>(e.textContent||e.value||'').trim().slice(0,20)+' desc='+(e.getAttribute('aria-describedby')?document.getElementById(e.getAttribute('aria-describedby'))?.textContent.trim():'없음'));return 'aria-disabled 요소: '+els.join(' | ');})()"
P Escape
echo "-- E5 ↑↓ 이동"
J "(()=>{const w=document.getElementById('state-e5');const names=()=>[...w.querySelectorAll('.e5-team-item')].map(li=>li.textContent.replace(/\s+/g,' ').trim().slice(0,12)).join(',');const ups=[...w.querySelectorAll('button')].filter(b=>b.textContent.trim()==='↑');const downs=[...w.querySelectorAll('button')].filter(b=>b.textContent.trim()==='↓');const st=()=>'첫↑='+ups[0].getAttribute('aria-disabled')+' 끝↓='+downs[downs.length-1].getAttribute('aria-disabled');const b0=names(),s0=st();ups[1].click();const b1=names(),s1=st();return 'before: '+b0+' ['+s0+'] | 2행↑ 후: '+b1+' ['+s1+'] | 초기화/순서저장 버튼='+[...w.querySelectorAll('button')].filter(b=>/초기화|순서 저장/.test(b.textContent)).length;})()"
CON

echo "=============== 06-employees-3 E6 (Q6) ==============="
G 06-employees-3.html
MOD btn-open-e6 modal-e6 E6
J "(()=>{document.getElementById('btn-open-e6').click();const m=document.getElementById('modal-e6');const cards=[...m.querySelectorAll('[class*=card],[class*=summary]')].filter(e=>/파일 행 수|적용 가능|제외 대상/.test(e.textContent)&&e.children.length<6).length;const tables=[...m.querySelectorAll('table')].map(t=>t.tBodies[0]?t.tBodies[0].rows.length:0);const s=document.getElementById('btn-submit-e6');const before=s.textContent.trim();s.click();return '요약카드≈'+cards+' 표 행='+JSON.stringify(tables)+' [시급 일괄 업데이트] '+before+' → '+s.textContent.trim()+' disabled='+s.disabled;})()"
CON

echo "=============== 07-schedule-3 R4 (Q3) ==============="
G 07-schedule-3.html
MOD btn-open-r4 modal-r4 R4
J "(()=>{document.getElementById('btn-open-r4').click();const s=document.getElementById('btn-submit-r4');const b=s.textContent.trim();s.click();const a=s.textContent.trim(),d=s.disabled;s.click();return '[배포] '+b+' → '+a+' disabled='+d+' 재클릭 후='+s.textContent.trim()+' | 본문='+document.getElementById('modal-r4').innerText.replace(/\s+/g,' ').slice(0,160);})()"
CON

echo "=============== 09-allowance-2 A3→A5·A4 (Q4) ==============="
G 09-allowance-2.html
MOD btn-open-a3 modal-a3 A3
MOD btn-open-a4 modal-a4 A4
echo "-- A3 [품의 승인] → A5 → [취소] → A3 → Esc"
J "(()=>{const t=document.getElementById('btn-open-a3');t.focus();t.click();const a3=document.getElementById('modal-a3'),a5=document.getElementById('modal-a5');document.getElementById('btn-goto-a5').click();const r1='A5 open='+(getComputedStyle(a5).display!=='none')+' A3 hidden='+(getComputedStyle(a3).display==='none')+' role='+a5.getAttribute('role')+' boxW='+Math.round(a5.querySelector('.modal-box').getBoundingClientRect().width)+' focusIn='+a5.contains(document.activeElement)+' title='+a5.querySelector('.modal-title').textContent.trim();document.getElementById('btn-cancel-a5').click();const r2=' | A5[취소]→ A5 closed='+(getComputedStyle(a5).display==='none')+' A3 back='+(getComputedStyle(a3).display!=='none');return r1+r2;})()"
P Escape
J "(()=>{const a3=document.getElementById('modal-a3');return '   A3 Esc→ closed='+(getComputedStyle(a3).display==='none')+' focusBack='+(document.activeElement===document.getElementById('btn-open-a3'));})()"
echo "-- A5 Esc → A3로 · A5 [승인] 처리 중"
J "(()=>{document.getElementById('btn-open-a3').click();document.getElementById('btn-goto-a5').click();const a5=document.getElementById('modal-a5');window.__a5=a5;return 'A5 open='+(getComputedStyle(a5).display!=='none')+' focusIn='+a5.contains(document.activeElement);})()"
P Escape
J "(()=>{const a3=document.getElementById('modal-a3'),a5=window.__a5;return '   A5 Esc→ A5 closed='+(getComputedStyle(a5).display==='none')+' A3 back='+(getComputedStyle(a3).display!=='none');})()"
P Escape
J "(()=>{document.getElementById('btn-open-a3').click();document.getElementById('btn-goto-a5').click();const s=document.getElementById('btn-submit-a5');const b=s.textContent.trim();s.click();return '[승인] '+b+' → '+s.textContent.trim()+' disabled='+s.disabled+' | A5 본문='+window.__a5.innerText.replace(/\s+/g,' ').slice(0,150);})()"
J "(()=>{const a4=document.getElementById('modal-a4');return 'A4 본문='+a4.innerText.replace(/\s+/g,' ').slice(0,200);})()"
CON

echo "=============== 11-operations-4 O9→O10 (Q5) ==============="
G 11-operations-4.html
MOD btn-open-o9 modal-o9 O9
J "(()=>{const t=document.getElementById('btn-open-o9');t.focus();t.click();const o9=document.getElementById('modal-o9'),o10=document.getElementById('modal-o10');document.getElementById('btn-goto-o10').click();const r1='O10 open='+(getComputedStyle(o10).display!=='none')+' O9 hidden='+(getComputedStyle(o9).display==='none')+' role='+o10.getAttribute('role')+' boxW='+Math.round(o10.querySelector('.modal-box').getBoundingClientRect().width)+' focusIn='+o10.contains(document.activeElement)+' title='+o10.querySelector('.modal-title').textContent.trim();document.getElementById('btn-cancel-o10').click();return r1+' | O10[취소]→ O10 closed='+(getComputedStyle(o10).display==='none')+' O9 back='+(getComputedStyle(o9).display!=='none');})()"
J "(()=>{document.getElementById('btn-goto-o10').click();return 'O10 재열림='+(getComputedStyle(document.getElementById('modal-o10')).display!=='none');})()"
P Escape
J "(()=>{const o9=document.getElementById('modal-o9'),o10=document.getElementById('modal-o10');return '   O10 Esc→ O10 closed='+(getComputedStyle(o10).display==='none')+' O9 back='+(getComputedStyle(o9).display!=='none');})()"
echo "-- O10 게이트"
J "(()=>{document.getElementById('btn-goto-o10').click();const o10=document.getElementById('modal-o10');const i=o10.querySelector('input');const b=document.getElementById('btn-exec-o10');const st=()=>b.getAttribute('aria-disabled');const r0=st();i.value='교';i.dispatchEvent(new Event('input',{bubbles:true}));const r1=st();i.value='교체';i.dispatchEvent(new Event('input',{bubbles:true}));const r2=st();const lb=b.textContent.trim();b.click();return '빈값='+r0+' 교='+r1+' 교체='+r2+' | [교체 실행] '+lb+' → '+b.textContent.trim()+' disabled='+b.disabled;})()"
echo "-- O9 현황 표"
J "(()=>{const o9=document.getElementById('modal-o9');const t=o9.querySelector('table');return 'O9 표 행='+t.tBodies[0].rows.length+' 첫행h='+Math.round(t.tBodies[0].rows[0].getBoundingClientRect().height)+' td fs='+getComputedStyle(t.tBodies[0].rows[0].cells[0]).fontSize+' 요약='+([...o9.querySelectorAll('*')].find(e=>/18개 항목 중 4개 감소/.test(e.textContent)&&e.children.length===0)?'있음':'없음')+' 감소강조='+[...t.querySelectorAll('td')].filter(td=>getComputedStyle(td).color==='rgb(192, 57, 43)').length+'셀';})()"
CON

echo "=============== 00-shell-2 S6 (Q7·고정) · S5 ==============="
G 00-shell-2.html
MOD btn-open-s6-banner modal-s6-update "S6 밴드"
MOD btn-open-s6-status modal-s6-update "S6 상태줄"
J "(()=>{document.getElementById('btn-open-s6-banner').click();const m=document.getElementById('modal-s6-update');const txt=m.innerText.replace(/\s+/g,' ');return 'S6 본문: '+txt.slice(0,380);})()"
P Escape
J "(()=>{const b=document.getElementById('btn-s5-restart');const l=b.textContent.trim();b.click();return 'S5 [다시 시작] '+l+' → '+b.textContent.trim()+' disabled='+b.disabled;})()"
J "(()=>{const b=[...document.querySelectorAll('#state-s6 button')].find(b=>b.textContent.trim()==='업데이트');const l=b.textContent.trim();b.click();return 'S6 밴드 [업데이트] '+l+' → '+b.textContent.trim()+' disabled='+b.disabled;})()"
J "(()=>{document.getElementById('btn-open-s6-status').click();const b=document.getElementById('btn-exec-s6-update');const l=b.textContent.trim();b.click();return 'S6 모달 [다운로드] '+l+' → '+b.textContent.trim()+' disabled='+b.disabled;})()"
CON

echo "=============== 04-sites-1 T2 · 04-sites-2 T4 (Q7·고정) ==============="
G 04-sites-1.html
MOD btn-open-t2 modal-t2 T2
J "(()=>{document.getElementById('btn-open-t2').click();const m=document.getElementById('modal-t2');const rows=[...m.querySelectorAll('table tbody tr')].map(r=>[...r.cells].map(c=>c.textContent.trim()).join('/'));return 'T2 조별 현황: '+rows.join(' | ')+' | 캡션='+(/맨 위가 조장/.test(m.innerText)?'있음':'없음')+' 행h='+Math.round(m.querySelector('table tbody tr').getBoundingClientRect().height)+' td fs='+getComputedStyle(m.querySelector('table tbody td')).fontSize;})()"
CON
G 04-sites-2.html
MOD btn-open-t4 modal-t4 T4
J "(()=>{document.getElementById('btn-open-t4').click();const s=document.getElementById('btn-exec-t4');const l=s.textContent.trim();s.click();return 'T4 [삭제] '+l+' → '+s.textContent.trim()+' disabled='+s.disabled+' | 본문='+document.getElementById('modal-t4').innerText.replace(/\s+/g,' ').slice(0,140);})()"
CON

echo "=============== 00-shell-1 ☰ (Q15) ==============="
G 00-shell-1.html
SB 00-shell-1 state-s1
SB 00-shell-1 state-s2
SB 00-shell-1 state-s3
J "(()=>{const w=document.getElementById('state-s3');const t=w.querySelector('.btn-sidebar-toggle');const s=w.querySelector('.sidebar');const heads=[...s.querySelectorAll('.nav-group-head,[class*=group]')].filter(e=>e.children.length===0).map(e=>e.textContent.trim()+':'+getComputedStyle(e).fontSize+':'+(e.offsetParent!==null?'표시':'숨김'));return 'S3 그룹 머리: '+heads.slice(0,4).join(' | ')+' | 초기 aria-expanded='+t.getAttribute('aria-expanded');})()"
CON
echo "-- 다른 파일의 ☰ (전 파일 공통 확인)"
for pair in "06-employees-1.html state-e1" "07-schedule-1.html state-r1" "09-allowance-1.html state-a1" "10-dashboard-1.html state-d1" "11-operations-1.html state-o1" "12-access-logs-1.html state-g1" "02-common-3.html state-c9"; do
  set -- $pair; G "$1"; echo -n "$1 "; SB "$1" "$2"
done

echo "=============== 01-login-2 L4 (Q16) · 01-login-1 눈 토글 ==============="
G 01-login-2.html
J "(()=>{const b=document.getElementById('l4-btn-submit');const d=document.getElementById(b.getAttribute('aria-describedby')||'');const rules=[...document.querySelectorAll('#l4-rule-card *')].filter(e=>e.children.length<=2&&/8자|대문자|소문자|숫자|특수문자/.test(e.textContent)&&e.textContent.trim().length<20).map(e=>e.textContent.trim()+'['+(e.className||e.parentElement.className).toString().slice(0,30)+' 아이콘='+(e.querySelector('.material-symbols-outlined')||e.parentElement.querySelector('.material-symbols-outlined')||{textContent:'?'}).textContent.trim()+' 색='+getComputedStyle(e.querySelector('.material-symbols-outlined')||e.parentElement.querySelector('.material-symbols-outlined')||e).color+']');const n=document.getElementById('l4-new-pw'),c=document.getElementById('l4-confirm-pw');return 'init aria-disabled='+b.getAttribute('aria-disabled')+' describedby='+b.getAttribute('aria-describedby')+' desc='+(d?d.textContent.trim():'없음')+' visible='+(d&&d.offsetParent!==null)+' fs='+(d&&getComputedStyle(d).fontSize)+' | 새='+JSON.stringify(n.value)+' 확인='+JSON.stringify(c.value)+' | 규칙: '+rules.join(' / ');})()"
J "(()=>{const b=document.getElementById('l4-btn-submit');const d=()=>{const x=document.getElementById(b.getAttribute('aria-describedby')||'');return x?(x.offsetParent!==null?x.textContent.trim():'(숨김)'):'없음';};const n=document.getElementById('l4-new-pw'),c=document.getElementById('l4-confirm-pw');const set=(a,bb)=>{n.value=a;n.dispatchEvent(new Event('input',{bubbles:true}));c.value=bb;c.dispatchEvent(new Event('input',{bubbles:true}));};set('Password123!','Password123!');const r1='전부충족+일치: aria-disabled='+b.getAttribute('aria-disabled')+' 사유='+d();set('Password123!','Password123');const r2=' | 불일치: aria-disabled='+b.getAttribute('aria-disabled')+' 사유='+d();set('password','password');const r3=' | 규칙미충족: aria-disabled='+b.getAttribute('aria-disabled')+' 사유='+d();const ok=[...document.querySelectorAll('#l4-rule-card .material-symbols-outlined')].map(i=>i.textContent.trim()).join(',');return r1+r2+r3+' | 아이콘(password 입력 후)='+ok;})()"
J "(()=>{const b=document.getElementById('l4-btn-submit');b.click();return 'aria-disabled 상태 클릭 → label='+b.textContent.trim()+' disabled='+b.disabled;})()"
CON
G 01-login-1.html
J "(()=>{const w=document.getElementById('state-l1');const i=w.querySelector('input[type=password],input[type=text][id*=pw]');const e=w.querySelector('.btn-toggle-eye');const t0=i.type,a0=e.getAttribute('aria-label');e.click();const t1=i.type,a1=e.getAttribute('aria-label'),ic1=e.textContent.trim();e.click();return 'L1 눈 토글: '+t0+'('+a0+') → '+t1+'('+a1+','+ic1+') → '+i.type+' | 아이디 저장 체크박스='+w.querySelectorAll('input[type=checkbox]').length;})()"
CON

echo "=============== 07-schedule-2 R2·R3 (Q14·Q17) · §D R2 검산 ==============="
G 07-schedule-2.html
J "(()=>{const w=document.getElementById('state-r3');const bs=[...w.querySelectorAll('[aria-disabled=true]')].map(b=>b.textContent.trim()+'→'+b.getAttribute('aria-describedby'));const d=document.getElementById('r3-disabled-desc');return 'R3 aria-disabled: '+bs.join(' | ')+' | descText='+d.textContent.trim()+' visible='+(d.offsetParent!==null)+' fs='+getComputedStyle(d).fontSize+' | 차단 문구='+[...w.querySelectorAll('*')].filter(e=>e.children.length===0&&/최대 3개 근무 코드|재직 인력이 없습니다/.test(e.textContent)).map(e=>e.textContent.trim()).join(' / ');})()"
J "(()=>{const w=document.getElementById('state-r2');const cards=[...w.querySelectorAll('*')].filter(e=>e.children.length>=1&&e.children.length<=3&&/휴식시간|주간 총시간|연속 야간|주휴/.test(e.textContent)&&e.textContent.trim().length<32&&!e.querySelector('table')).map(e=>e.innerText.replace(/\s+/g,' ').trim());const warns=[...w.querySelectorAll('li,tr,[class*=warn] p,[class*=alert]')].map(e=>e.textContent.replace(/\s+/g,' ').trim()).filter(t=>/휴식이 7시간/.test(t));const marks=[...w.querySelectorAll('td')].filter(td=>/⚠/.test(td.textContent)).map(td=>td.parentElement.cells[0].textContent.trim().slice(0,4)+'@'+([...td.parentElement.cells].indexOf(td)));return 'R2 요약카드: '+[...new Set(cards)].join(' | ')+' || 경고: '+warns.join(' / ')+' || ⚠셀: '+marks.join(',')+' || 발췌='+(/전체 103건 중 3건/.test(w.innerText)?'전체 103건 중 3건 ✓':'✗');})()"
CON

echo "=============== §D 검산 회귀 — A1·A7·D1·R1·E1·E2·R5·O2·G1 ==============="
G 09-allowance-1.html
J "(()=>{const w=document.getElementById('state-a1');const rows=[...w.querySelectorAll('table tbody tr')].map(r=>[...r.cells].map(c=>c.textContent.trim()));const amt=rows.map(r=>parseInt((r.find(c=>/^\d{1,3}(,\d{3})+$/.test(c))||'0').replace(/,/g,'')));return 'A1 행='+rows.length+' '+rows.map(r=>r[2]+' '+r[r.length-2]).join(' · ')+' 합='+amt.reduce((a,b)=>a+b,0)+' | 카드='+[...w.querySelectorAll('*')].filter(e=>e.children.length===0&&/369,000|19\.0h|4명|4건|225,000|144,000/.test(e.textContent)).map(e=>e.textContent.trim()).slice(0,8).join(',')+' | 버튼='+[...w.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(t=>/품의 미리보기|조기 지급/.test(t)).join(',');})()"
G 09-allowance-3.html
J "(()=>{const w=document.getElementById('state-a7');const chips=[...w.querySelectorAll('*')].filter(e=>e.children.length<=1&&/승인|대기|반려/.test(e.textContent)&&e.textContent.trim().length<10).map(e=>e.textContent.replace(/\s+/g,' ').trim());return 'A7 칩: '+[...new Set(chips)].slice(0,6).join(',')+' | 캡션='+(/아래 표는 승인 필터 적용 상태입니다/.test(w.innerText)?'✓':'✗')+' | 표 행='+w.querySelectorAll('table tbody tr').length+' | A6 경로='+(/품의서_2025-05\.xlsx/.test(document.body.innerText)?'✓':'✗')+' 폴더열기='+document.body.innerText.includes('폴더 열기');})()"
G 10-dashboard-1.html
J "(()=>{const w=document.getElementById('state-d1');const rows=[...w.querySelectorAll('table tbody tr')].map(r=>[...r.cells].map(c=>c.textContent.trim()).join('/'));return 'D1 순위: '+rows.join(' · ')+' | +2건='+(/\+2건/.test(w.innerText)?'✓':'✗')+' | D3='+(/2025년 3월에는 계산된 수당이 없습니다/.test(document.getElementById('state-d3').innerText)?'✓':'✗');})()"
G 07-schedule-1.html
J "(()=>{const w=document.getElementById('state-r1');const rows=[...w.querySelectorAll('table tbody tr')];const names=rows.map(r=>r.cells[0].textContent.replace(/\s+/g,' ').trim().slice(0,10)+':'+(r.cells[1]?r.cells[1].textContent.trim().slice(0,2):''));const teams=rows.map(r=>r.getAttribute('data-team-label')||r.cells[0].getAttribute('data-team-label')||(r.querySelector('[data-team-label]')||{getAttribute:()=>'?'}).getAttribute('data-team-label'));return 'R1 행='+rows.length+' | '+names.join(' ')+' | team='+teams.join(',')+' | 머리='+(/6\/1~6\/10 표시 · 전체 30일/.test(w.innerText)?'✓':'✗')+' 92일='+(/92일/.test(w.innerText)?'✓':'✗')+' 경고103='+(/경고 103건/.test(w.innerText)?'✓':'✗')+' | 직급 셀 fs='+[...w.querySelectorAll('tbody td:first-child *')].filter(e=>e.children.length===0&&/사원|대리|과장/.test(e.textContent)).slice(0,1).map(e=>getComputedStyle(e).fontSize);})()"
G 06-employees-1.html
J "(()=>{const w=document.getElementById('state-e1');const r=w.querySelector('table tbody tr');r.focus();window.__r=r;return 'E1 발췌='+(/전체 14명 중 8명/.test(w.innerText)?'✓':'✗')+' 행='+w.querySelectorAll('table tbody tr').length+' 직급='+[...w.querySelectorAll('table tbody tr')].map(r=>r.cells[2].textContent.trim()).join(',')+' | E2 패널 표: '+[...document.querySelectorAll('#state-e2 table')].map(t=>t.tBodies[0].rows.length+'행/h'+Math.round(t.tBodies[0].rows[0].getBoundingClientRect().height)+'/fs'+getComputedStyle(t.tBodies[0].rows[0].cells[0]).fontSize+'/th'+getComputedStyle(t.querySelector('th')).backgroundColor).join(' ; ')+' | E2 버튼='+[...document.querySelectorAll('#state-e2 button')].map(b=>b.textContent.trim()).filter(t=>/시급 등록|배정|해지|삭제/.test(t)).join(',');})()"
P ArrowDown
J "(()=>{const a=document.activeElement;return '   E1 ↓ 후 row#='+([...a.parentElement.children].indexOf(a)+1)+' '+a.cells[1].textContent.trim();})()"
P Space
J "(()=>{const a=document.activeElement;return '   E1 Space 후 aria-selected='+a.getAttribute('aria-selected')+' bg='+getComputedStyle(a).backgroundColor;})()"
CON
G 07-schedule-3.html
J "(()=>{const w=document.getElementById('state-r5');const t=w.querySelector('table');return 'R5 발췌='+(/전체 12건 중 6건/.test(w.innerText)?'✓':'✗')+' 행='+t.tBodies[0].rows.length+' 첫행h='+Math.round(t.tBodies[0].rows[0].getBoundingClientRect().height)+' td fs='+getComputedStyle(t.tBodies[0].rows[0].cells[0]).fontSize+' th='+getComputedStyle(t.querySelector('th')).backgroundColor+'/'+getComputedStyle(t.querySelector('th')).fontWeight+' | 파일명='+[...t.querySelectorAll('td')].filter(td=>/\.xlsx/.test(td.textContent)).map(td=>td.textContent.trim()).slice(0,2).join(',')+' | 원본열기/폴더열기='+[...w.querySelectorAll('button')].filter(b=>/원본 열기|폴더 열기/.test(b.textContent)).length+' | R6 버튼='+[...document.querySelectorAll('#state-r6 button')].map(b=>b.textContent.trim()).join(',');})()"
G 11-operations-1.html
J "(()=>{const w=document.getElementById('state-o2');return 'O2 발췌='+(/전체 18건 중 8건/.test(w.innerText)?'✓':'✗')+' 행='+w.querySelectorAll('table tbody tr').length+' | 탭 배지='+[...document.querySelectorAll('#state-o1 [style*=\"grid-template-columns:repeat(7\"] > div')].map(t=>t.textContent.replace(/\s+/g,' ').trim().slice(0,22)).join(' | ')+' | O1 파일 선택='+[...document.querySelectorAll('#state-o1 button')].filter(b=>b.textContent.trim()==='파일 선택').length+' 폴더 선택='+[...document.querySelectorAll('#state-o1 button')].filter(b=>b.textContent.trim()==='폴더 선택').length;})()"
G 11-operations-2.html
J "(()=>{const w=document.getElementById('state-o3');const tables=[...w.querySelectorAll('table')].map(t=>t.tBodies[0].rows.length+'행');const card=[...w.querySelectorAll('*')].find(e=>e.children.length>0&&/요율 영향 미리보기/.test(e.textContent)&&/저장 전에 영향 미리보기/.test(e.textContent)&&e.textContent.length<400);const btnIn=card&&[...card.querySelectorAll('button')].some(b=>b.textContent.trim()==='영향 미리보기');return 'O3 표='+tables.join(',')+' 버전행='+(/2025 기본/.test(w.innerText)?'✓':'✗')+' 행작업='+[...w.querySelectorAll('table button')].map(b=>b.textContent.trim()).slice(0,4).join(',')+' 카드안버튼='+btnIn+' 이력='+(/변경 이력/.test(w.innerText)?'✓':'✗')+' 상태선택='+[...w.querySelectorAll('select option')].map(o=>o.textContent.trim()).join('/')+' forward문구='+(/이미 승인된 계산은 바뀌지 않습니다/.test(w.innerText)?'✓':'✗');})()"
G 11-operations-3.html
J "(()=>{const w=document.getElementById('state-o6');const cards=[...w.querySelectorAll('*')].filter(e=>/xlsx/.test(e.textContent)&&e.querySelectorAll('button').length===5).length;return 'O6 5버튼 카드='+cards+' 양식등록='+[...w.querySelectorAll('button')].filter(b=>b.textContent.trim()==='양식등록').length+' 이력 표 행='+[...w.querySelectorAll('table')].map(t=>t.tBodies[0].rows.length).join(',')+' | O7 저장되지않음 fs='+[...document.querySelectorAll('#state-o7 *')].filter(e=>e.children.length===0&&/저장되지 않음/.test(e.textContent)).map(e=>getComputedStyle(e).fontSize).join(',')+' | O8 검색='+document.querySelectorAll('#state-o8 input[type=search],#state-o8 input[placeholder*=검색]').length+' 표행='+document.querySelectorAll('#state-o8 table tbody tr').length;})()"
G 12-access-logs-1.html
J "(()=>{const w=document.getElementById('state-g1');const f=[...w.querySelectorAll('input,select')].map(i=>(i.type||i.tagName)+':'+(i.id||i.placeholder||'')).join(',');const r=w.querySelector('table tbody tr');r.focus();window.__r=r;return 'G1 필터='+f+' | 버튼='+[...w.querySelectorAll('button')].map(b=>b.textContent.trim()).join(',')+' | 128='+(/전체 128건 중 8건 표시/.test(w.innerText)?'✓':'✗')+' 248='+/248/.test(w.innerText)+' 행='+w.querySelectorAll('table tbody tr').length+' | G2 버튼='+[...document.querySelectorAll('#state-g2 button')].map(b=>b.textContent.trim()).join(',');})()"
P ArrowDown
J "(()=>{const a=document.activeElement;return '   G1 ↓ 후 row#='+([...a.parentElement.children].indexOf(a)+1);})()"
CON
G 06-employees-3.html
J "(()=>{document.getElementById('btn-open-e6').click();const m=document.getElementById('modal-e6');const last=[...m.querySelectorAll('table')].pop();return 'E6 제외 표='+last.tBodies[0].rows.length+'행 '+[...last.querySelectorAll('td')].filter(td=>/시급 형식 오류|일치 인력 없음|기존 시급과 동일/.test(td.textContent)).map(td=>td.textContent.trim()).join(',')+' | 요약='+[...m.querySelectorAll('*')].filter(e=>e.children.length===0&&/8건|5건|3건/.test(e.textContent)).map(e=>e.textContent.trim()).slice(0,3).join(',')+' | 열 입력='+[...m.querySelectorAll('input')].map(i=>i.value).slice(0,4).join(',');})()"

echo "=============== 콘솔 오류 — 나머지 파일 ==============="
for f in 02-common-2 02-common-3 09-allowance-3 10-dashboard-1 11-operations-1 11-operations-2 11-operations-3 07-schedule-1 09-allowance-1; do
  G "$f.html"; echo -n "$f"; CON
done
echo DONE
