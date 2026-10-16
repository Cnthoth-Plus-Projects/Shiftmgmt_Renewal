#!/usr/bin/env bash
# ⑤ 10차 전용 — ④ 10차(R24~R28) 전/후 실측. 같은 스크립트를 스냅샷12차(전)와 2차HTML(후)에 돌린다.
# R24 L4 sr-only 동적 갱신 · R25 아이콘 낭독 누출(클래스 기준) · R26 C5~C7 elementFromPoint·마우스 클릭·live 리전·✕ 포커스 · R27 처리 중 닫기 차단 9모달(+E3·E4·E6·E8 회귀) · R28 탭 속성 0 · 콘솔
B="$HOME/.claude/skills/gstack/browse/dist/browse"
CUR="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차HTML"
OLD="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차검토/스냅샷12차"
J13="시안/2026-09-02-2차검토/dyn13"
JS() { "$B" js "$1" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'; }
EV() { "$B" eval "$1" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'; }
G() { "$B" console --clear >/dev/null 2>&1; "$B" goto "file:///$1/$2" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1; }
C() { echo "  콘솔: $("$B" console --errors 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$' | tr '\n' ' ')  파싱: $(JS "(()=>{let e=[];document.querySelectorAll('script').forEach((s,i)=>{if(s.src)return;try{new Function(s.textContent)}catch(x){e.push(i+':'+x.message)}});return e.length?e.join(' | '):'OK '+document.querySelectorAll('script').length+' scripts';})()")"; }
"$B" viewport 1440x900 >/dev/null 2>&1

# 처리 중 잠금 검사 — 인자: 모달id 실행버튼id 취소id ✕id [앞모달id]
LOCK='(()=>{const q=id=>document.getElementById(id);const m=q(M),s=q(S),c=q(CB),x=q(XB),p=P?q(P):null;const vis=e=>!!e&&getComputedStyle(e).display!=="none";s.click();const lbl=s.textContent;const r=["실행→"+lbl+" 모달="+vis(m)+" 취소dis="+(c&&c.disabled)+" ✕dis="+(x&&x.disabled)];m.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));r.push("Esc→"+vis(m)+(p?"/앞="+vis(p):""));if(c){c.click();r.push("취소→"+vis(m)+(p?"/앞="+vis(p):""));}if(x){x.click();r.push("✕→"+vis(m)+(p?"/앞="+vis(p):""));}return r.join(" | ");})()'
AFTER='(()=>{const q=id=>document.getElementById(id);const m=q(M),s=q(S),c=q(CB),x=q(XB),p=P?q(P):null;const vis=e=>!!e&&getComputedStyle(e).display!=="none";return "완료→ 모달="+vis(m)+(p?"/앞="+vis(p):"")+" 포커스="+document.activeElement.id+" 라벨="+s.textContent+" 취소dis="+(c&&c.disabled)+" ✕dis="+(x&&x.disabled)+" 실행dis="+s.disabled;})()'
L() { # 이름 파일 준비JS 모달 실행 취소 ✕ 앞모달
  local name="$1" file="$2" prep="$3" M="$4" S="$5" CB="$6" XB="$7" P="$8"
  G "$D" "$file"; [ -n "$prep" ] && JS "$prep" >/dev/null
  local pre="const M='$M',S='$S',CB='$CB',XB='$XB',P='$P';"
  echo "$name: $(JS "$pre$LOCK")"; sleep 1.3; echo "   $(JS "$pre$AFTER")"
}

for SIDE in ${SIDES:-OLD CUR}; do  # SIDES=CUR 로 후만 실행 가능(15차 회귀용)
  D="${!SIDE}"; echo "################ ${SIDE} = $D"
  echo "=== R24 01-login-2 L4 sr-only 동적 ==="; G "$D" 01-login-2.html
  JS "(()=>{const set=v=>{document.querySelectorAll('#l4-new-pw,#l4-confirm-pw,#l4-current-pw').forEach(i=>{i.value=v;i.dispatchEvent(new Event('input',{bubbles:true}));});return [...document.getElementById('l4-rule-list').children].map(li=>li.id.replace('rule-','')+'='+JSON.stringify(li.querySelector('.sr-only')?.textContent)+'/'+li.className.replace('rule-item ','')).join(' ');};return 'Password1! → '+set('Password1!')+'\nPassword → '+set('Password');})()"; C
  echo "=== R25 아이콘(클래스 기준) 24파일 ==="
  for p in "$D"/*.html; do f=$(basename "$p"); G "$D" "$f"; JS "(()=>{const all=[...document.querySelectorAll('.material-symbols-outlined')];const leak=all.filter(e=>e.getAttribute('aria-hidden')!=='true'&&!e.closest('[aria-hidden=\"true\"]')&&!e.closest('[aria-label]'));return '$f total='+all.length+' leak='+leak.length+(leak.length?' ['+leak.map(e=>e.tagName+':'+e.textContent.trim()).join(',')+']':'');})()"; done | awk '{t+=substr($2,7); l+=substr($3,6); if(substr($3,6)+0>0) print} END {print "총 "t"개 · 누출 "l"개"}'
  echo "=== R26 02-common-2 C5~C7 ==="; G "$D" 02-common-2.html
  JS "(()=>{const r=[];for(const n of ['c5','c6','c7']){const tr=document.getElementById('btn-show-'+n),to=document.getElementById('toast-'+n),lv=document.getElementById('live-'+n);const cb=to.querySelector('.btn-toast-close');tr.scrollIntoView({block:'center'});const b=tr.getBoundingClientRect();const el=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);cb.click();const d1=getComputedStyle(to).display;el.click();const d2=getComputedStyle(to).display;const f2=document.activeElement===cb;const lt=lv?lv.textContent:'(없음)';cb.click();const f3=document.activeElement===tr;r.push(n+': 중심='+el.tagName+'#'+el.id+' pos='+getComputedStyle(tr).position+' z='+getComputedStyle(tr).zIndex+' 트리거@'+Math.round(b.left)+','+Math.round(b.top)+' '+Math.round(b.width)+'x'+Math.round(b.height)+' | ✕→'+d1+' 중심클릭→'+d2+' 포커스=✕:'+f2+' live=\"'+lt+'\" role='+(lv&&lv.getAttribute('role'))+' aria-live='+(lv&&lv.getAttribute('aria-live'))+' 조상aria-hidden='+!!(lv&&lv.closest('[aria-hidden=\"true\"]'))+' | ✕→포커스=트리거:'+f3+' 토스트 role='+to.getAttribute('role'));}return r.join('\n');})()"
  echo "  마우스 실클릭:"; for n in c5 c6 c7; do "$B" js "(()=>{document.querySelector('#toast-$n .btn-toast-close').click();document.getElementById('btn-show-$n').scrollIntoView({block:'center'});return 'ok';})()" >/dev/null 2>&1; "$B" click "#btn-show-$n" >/dev/null 2>&1; echo "   $n: $(JS "(()=>{return '토스트='+getComputedStyle(document.getElementById('toast-$n')).display+' live=\"'+document.getElementById('live-$n')?.textContent+'\"';})()")"; done; C
  echo "=== R27 처리 중 잠금 — 9모달 + E3·E4·E6·E8 ==="
  for n in 1 2 3 4; do
    G "$D" 02-common-1.html; JS "(()=>{document.getElementById('btn-open-c$n').click();const m=document.getElementById('modal-c$n');const b=m.querySelector('.btn-modal-confirm');if(!b.id)b.id='tmp-confirm-c$n';const c=m.querySelector('.btn-modal-cancel');if(c&&!c.id)c.id='tmp-cancel-c$n';const x=m.querySelector('.btn-modal-close-x');if(x&&!x.id)x.id='tmp-x-c$n';const i=document.getElementById('c4-reason-input');if(i&&$n===4){i.value='사유';i.dispatchEvent(new Event('input',{bubbles:true}));}return 'ready';})()" >/dev/null
    pre="const M='modal-c$n',S='tmp-confirm-c$n',CB='tmp-cancel-c$n',XB='tmp-x-c$n',P='';"; echo "C$n: $(JS "$pre$LOCK")"; sleep 1.3; echo "   $(JS "$pre$AFTER")"
  done; C
  L "T4" 04-sites-2.html "document.getElementById('btn-open-t4').click()" modal-t4 btn-exec-t4 btn-cancel-t4 btn-close-t4-x ""; C
  L "R4" 07-schedule-3.html "document.getElementById('btn-open-r4').click()" modal-r4 btn-submit-r4 btn-cancel-r4 btn-close-r4-x ""; C
  L "A4" 09-allowance-2.html "document.getElementById('btn-open-a4').click()" modal-a4 btn-submit-a4 btn-cancel-a4 btn-close-a4-x ""
  L "A5" 09-allowance-2.html "document.getElementById('btn-open-a3').click();document.getElementById('btn-goto-a5').click()" modal-a5 btn-submit-a5 btn-cancel-a5 btn-close-a5-x modal-a3; C
  L "O10" 11-operations-4.html "document.getElementById('btn-open-o9').click();document.getElementById('btn-goto-o10').click();(()=>{const i=document.getElementById('o10-confirm-input');i.value='교체';i.dispatchEvent(new Event('input',{bubbles:true}));})()" modal-o10 btn-exec-o10 btn-cancel-o10 btn-close-o10-x modal-o9; C
  echo "--- 회귀 E3·E4·E6·E8(dyn13) ---"
  G "$D" 06-employees-2.html; EV "$J13/e3-d9a.js"; sleep 1.2; EV "$J13/e3-d9b.js"; G "$D" 06-employees-2.html; EV "$J13/e4-d9.js"
  G "$D" 06-employees-3.html; EV "$J13/e6-d9.js"; sleep 1.2; EV "$J13/e6-d9b.js"; G "$D" 06-employees-3.html; EV "$J13/e8-d9.js"; sleep 1.2; EV "$J13/e8-d9b.js"
  echo "=== R28 11-operations-1/2/3 ==="
  for f in 11-operations-1.html 11-operations-2.html 11-operations-3.html; do G "$D" $f; echo "$f: $(JS "(()=>{return 'role=tab '+document.querySelectorAll('[role=tab]').length+' tablist '+document.querySelectorAll('[role=tablist]').length+' aria-selected '+document.querySelectorAll('[aria-selected]').length+' 탭카드 tabindex '+[...document.querySelectorAll('[style*=\"grid-template-columns:repeat(7\"] > div')].filter(d=>d.hasAttribute('tabindex')).length+' / 카드수 '+document.querySelectorAll('[style*=\"grid-template-columns:repeat(7\"] > div').length;})()")"; C; done
done
echo DONE
