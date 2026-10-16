#!/usr/bin/env bash
# ⑤ 8차 전용 — R19(낭독 이름) · R20(규칙 5줄 DOM·sr-only·낭독 글) · R21(트리거→토스트→✕ 3쌍 클릭·포커스·rect·겹침) · R22(svg aria-hidden) · 콘솔 오류 24파일. 같은 스크립트를 스냅샷7차(전)와 2차HTML(후)에 돌린다.
B="$HOME/.claude/skills/gstack/browse/dist/browse"
CUR="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차HTML"
OLD="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차검토/스냅샷7차"
J() { "$B" js "$1" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'; }
G() { "$B" goto "file:///$1/$2" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1; }
"$B" viewport 1440x900 >/dev/null 2>&1

AT="const AT=(e)=>{let s='';const walk=(n)=>{if(n.nodeType===3){s+=n.textContent;return;}if(n.nodeType!==1)return;if(n.getAttribute('aria-hidden')==='true')return;for(const c of n.childNodes)walk(c);};walk(e);return s.replace(/\s+/g,' ').trim();};"

R19="(()=>{${AT}const out=[];for(const w of document.querySelectorAll('.state-wrapper')){const b=w.querySelector('.user-info-btn');if(b)out.push(w.id+' 계정버튼 낭독='+JSON.stringify(AT(b))+' aria-label='+b.getAttribute('aria-label'));}return out.join(' | ');})()"
R19B="(()=>{${AT}const out=[];const q=(sel,label)=>{for(const e of document.querySelectorAll(sel)){out.push(label+' 낭독='+JSON.stringify(AT(e)).slice(0,60));}};q('.state-wrapper button.badge-warn, .state-wrapper .btn-warn, [id^=btn-warn]','경고버튼');for(const s of document.querySelectorAll('span.material-symbols-outlined:not([aria-hidden])')){let p=s.closest('button,a');out.push('aria-hidden 없는 아이콘 '+s.textContent.trim()+' → 담긴 곳='+(p?p.tagName+' aria-label='+p.getAttribute('aria-label'):'없음'));}return out.join(' | ');})()"
R20="(()=>{${AT}const ul=document.getElementById('l4-rule-list');if(!ul)return 'l4-rule-list 없음';const li=[...ul.children];return 'li 수='+li.length+' 전부 ul 직계 LI='+li.every(e=>e.parentElement===ul&&e.tagName==='LI')+' ul 자손 li 총수='+ul.querySelectorAll('li').length+' 중첩 li='+ul.querySelectorAll('li li').length+'\n'+li.map(e=>{const sr=e.querySelector('.sr-only');const cs=sr?getComputedStyle(sr):null;const r=e.getBoundingClientRect();return '  '+e.id+' ['+e.className+'] 보이는 글='+JSON.stringify(e.innerText.trim())+' 낭독 글='+JSON.stringify(AT(e))+' li='+Math.round(r.width)+'x'+Math.round(r.height)+'@'+Math.round(r.left)+','+Math.round(r.top)+(sr?' sr-only:'+cs.position+' '+cs.width+'x'+cs.height+' clip='+cs.clip+' 보이는크기='+Math.round(sr.getBoundingClientRect().width)+'x'+Math.round(sr.getBoundingClientRect().height):' sr-only:없음');}).join('\n');})()"
R21="(()=>{const r=[];const T=(id)=>document.getElementById(id);const rect=(e)=>{const b=e.getBoundingClientRect();return {l:b.left,t:b.top,w:b.width,h:b.height,s:Math.round(b.left)+','+Math.round(b.top)+' '+Math.round(b.width*10)/10+'x'+Math.round(b.height*10)/10};};for(const n of ['c5','c6','c7']){const tr=T('btn-show-'+n),to=T('toast-'+n);if(!tr||!to){r.push(n+': 트리거/토스트 없음 ('+!!tr+'/'+!!to+')');continue;}const cb=to.querySelector('.btn-toast-close');if(!cb){r.push(n+': .btn-toast-close 없음');continue;}const d0=getComputedStyle(to).display,rt0=rect(to),rtr=rect(tr);const ov=!(rtr.l+rtr.w<=rt0.l||rt0.l+rt0.w<=rtr.l||rtr.t+rtr.h<=rt0.t||rt0.t+rt0.h<=rtr.t);cb.click();const d1=getComputedStyle(to).display,f1=document.activeElement===tr;tr.click();const d2=getComputedStyle(to).display,f2=document.activeElement===cb,rt2=rect(to);cb.click();const d3=getComputedStyle(to).display,f3=document.activeElement===tr;tr.click();const d4=getComputedStyle(to).display;const stage=tr.parentElement;r.push(n+': 초기 '+d0+' 토스트@'+rt0.s+' 트리거@'+rtr.s+' 트리거부모='+stage.className+' pos='+getComputedStyle(stage).position+' 트리거첫자식='+(stage.firstElementChild===tr)+' 겹침='+ov+' | ✕클릭→'+d1+' 포커스=트리거:'+f1+' | 트리거클릭→'+d2+' 포커스=✕:'+f2+' 토스트@'+rt2.s+' 위치동일='+(rt0.s===rt2.s)+' | ✕재클릭→'+d3+' 포커스=트리거:'+f3+' | 복원→'+d4+' | ✕ aria-label='+cb.getAttribute('aria-label')+' class='+cb.className+' | 트리거 문구='+JSON.stringify(tr.textContent)+' class='+tr.className+' type='+tr.getAttribute('type'));}return r.join('\n');})()"
R22="(()=>{return [...document.querySelectorAll('svg')].map(s=>'svg '+s.getAttribute('width')+'x'+s.getAttribute('height')+' aria-hidden='+s.getAttribute('aria-hidden')+' role='+s.getAttribute('role')+' 다음글='+JSON.stringify((s.parentElement.innerText||'').replace(/\s+/g,' ').trim().slice(0,50))).join(' | ');})()"
CONSOLE="(()=>{return 'scripts='+document.querySelectorAll('script').length;})()"

for SIDE in OLD CUR; do
  D="${!SIDE}"; echo "################ ${SIDE} = $D"
  echo "=== R19 계정 버튼 낭독 이름 (00-shell-1 · 00-shell-2 · 10-dashboard-1) ==="
  for f in 00-shell-1.html 00-shell-2.html 10-dashboard-1.html; do G "$D" $f; echo "$f: $(J "$R19")"; done
  echo "=== R19 표본 — 07-schedule-1 (warning 버튼) · 01-login-1 (error 문구) · 02-common-2 (토스트) ==="
  for f in 07-schedule-1.html 01-login-1.html 02-common-2.html; do G "$D" $f; echo "$f: $(J "$R19B")"; done
  echo "=== R20 01-login-2 규칙 5줄 ==="
  G "$D" 01-login-2.html; J "$R20"
  echo "=== R21 02-common-2 트리거→토스트→✕ ==="
  G "$D" 02-common-2.html; J "$R21"
  echo "=== R22 svg ==="
  for f in 09-allowance-1.html 10-dashboard-1.html; do G "$D" $f; echo "$f: $(J "$R22")"; done
done

echo "################ 콘솔 오류 24파일 (현재본) ################"
for p in "$CUR"/*.html; do f=$(basename "$p"); "$B" console --clear >/dev/null 2>&1; G "$CUR" "$f"; e=$("$B" console --errors 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$' | tr '\n' ' '); echo "$f: 오류=[${e}]"; done
echo DONE
