#!/usr/bin/env bash
# ⑤ 15차 — R30 부속: aria-disabled 게이트가 있는 C4(btn-c4-reject)·O10(btn-exec-o10)에서 ① 입력 비운 상태 aria-disabled ② 입력 후 실행→완료 ③ 재열기 후 입력 비움 → aria-disabled 유지 여부. 현재(2차HTML)만.
B="$HOME/.claude/skills/gstack/browse/dist/browse"
W="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차HTML"
JS() { "$B" js "$1" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'; }
G() { "$B" console --clear >/dev/null 2>&1; "$B" goto "file:///$W/$1" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1; }
C() { echo "  콘솔: $("$B" console --errors 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$' | tr '\n' ' ')"; }
"$B" viewport 1440x900 >/dev/null 2>&1
ST='const st=(s,i)=>"라벨="+s.textContent+" disabled="+s.disabled+" aria-disabled="+s.getAttribute("aria-disabled")+" describedby="+s.getAttribute("aria-describedby")+" 입력=\""+i.value+"\"";'
echo "=== C4 (02-common-1) ==="; G 02-common-1.html
JS "(()=>{${ST}document.getElementById('btn-open-c4').click();const s=document.getElementById('btn-c4-reject'),i=document.getElementById('c4-reason-input');const a='① 열기(입력 비움): '+st(s,i);i.value='사유';i.dispatchEvent(new Event('input',{bubbles:true}));const b='② 입력 후: '+st(s,i);s.click();const c='③ 실행 직후: '+st(s,i)+' activeElement='+document.activeElement.id;return a+'\n'+b+'\n'+c;})()"
sleep 1.3
JS "(()=>{${ST}const m=document.getElementById('modal-c4');const s=document.getElementById('btn-c4-reject'),i=document.getElementById('c4-reason-input');const vis=getComputedStyle(m).display!=='none';const a='④ 완료 후: 모달='+vis+' '+st(s,i);document.getElementById('btn-open-c4').click();const b='⑤ 재열기: 모달='+(getComputedStyle(m).display!=='none')+' '+st(s,i);i.value='';i.dispatchEvent(new Event('input',{bubbles:true}));const c='⑥ 재열기+입력 비움: '+st(s,i)+(s.getAttribute('aria-disabled')==='true'?' ✓게이트 유지':' ★게이트 소실');return a+'\n'+b+'\n'+c;})()"; C
echo "=== O10 (11-operations-4) ==="; G 11-operations-4.html
JS "(()=>{${ST}document.getElementById('btn-open-o9').click();document.getElementById('btn-goto-o10').click();const s=document.getElementById('btn-exec-o10'),i=document.getElementById('o10-confirm-input');const a='① 열기(입력 비움): '+st(s,i);i.value='교체';i.dispatchEvent(new Event('input',{bubbles:true}));const b='② 입력 후: '+st(s,i);s.click();const c='③ 실행 직후: '+st(s,i)+' activeElement='+document.activeElement.id;return a+'\n'+b+'\n'+c;})()"
sleep 1.3
JS "(()=>{${ST}const m=document.getElementById('modal-o10');const s=document.getElementById('btn-exec-o10'),i=document.getElementById('o10-confirm-input');const vis=getComputedStyle(m).display!=='none';const a='④ 완료 후: 모달='+vis+' '+st(s,i);document.getElementById('btn-open-o9').click();document.getElementById('btn-goto-o10').click();const b='⑤ 재열기: 모달='+(getComputedStyle(m).display!=='none')+' '+st(s,i);i.value='';i.dispatchEvent(new Event('input',{bubbles:true}));const c='⑥ 재열기+입력 비움: '+st(s,i)+(s.getAttribute('aria-disabled')==='true'?' ✓게이트 유지':' ★게이트 소실');return a+'\n'+b+'\n'+c;})()"; C
echo DONE
