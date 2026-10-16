#!/usr/bin/env bash
# ⑤ 7차 전용 — R16 상태 알림(role=status) 7곳: 정적 위치(.app-window 직계·.app-body 앞·aria-hidden 조상 없음) + 확인 모달을 열고 처리 중 버튼을 누른 뒤(배경 app-body aria-hidden 상태)에도 조상 aria-hidden 없음 + textContent · R18 S3 펼침→재접힘 title 7/7
B="$HOME/.claude/skills/gstack/browse/dist/browse"
W="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차HTML"
J() { "$B" js "$1" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'; }
G() { "$B" goto "file:///$W/$1" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1; }
"$B" viewport 1440x900 >/dev/null 2>&1

# 인자: live id · 단계 배열(JSON) — 각 단계 {click:id} | {type:[id,text]}
CHK="(id,steps)=>{const e=document.getElementById(id);if(!e)return id+' 없음';const w=e.closest('.state-wrapper');const st0='정적: 부모='+e.parentElement.className.split(' ')[0]+' 다음형제='+(e.nextElementSibling?e.nextElementSibling.className.split(' ')[0]:'-')+' aria-hidden조상='+(e.closest('[aria-hidden=\"true\"]')?e.closest('[aria-hidden=\"true\"]').className.split(' ')[0]:'없음')+' role='+e.getAttribute('role')+' live='+e.getAttribute('aria-live')+' text=\"'+e.textContent+'\"';for(const s of steps){if(s.click){const b=document.getElementById(s.click);if(!b)return st0+' | 단계 실패: '+s.click+' 없음';b.click();}if(s.type){const i=document.getElementById(s.type[0]);i.value=s.type[1];i.dispatchEvent(new Event('input',{bubbles:true}));}}const body=w.querySelector('.app-body');const modalOpen=[...w.querySelectorAll('.modal-overlay')].some(m=>getComputedStyle(m).display!=='none');return (w?w.id:'?')+' #'+id+' '+st0+' | 실행 후: 모달열림='+modalOpen+' app-body aria-hidden='+(body?body.getAttribute('aria-hidden'):'-')+' live aria-hidden조상='+(e.closest('[aria-hidden=\"true\"]')?'있음('+e.closest('[aria-hidden=\"true\"]').className.split(' ')[0]+')':'없음')+' text=\"'+e.textContent+'\"';}"

echo "=============== R16 status div 7곳 — 정적 + 모달 열고 처리 중 실행 후 ==============="
G 00-shell-2.html
J "(${CHK})('live-s5',[{click:'btn-s5-restart'}])"
G 00-shell-2.html
J "(()=>{const f=${CHK};document.getElementById('btn-open-s6-status').click();const m=document.getElementById('modal-s6-update');const dl=[...m.querySelectorAll('button')].find(b=>b.textContent.trim()==='다운로드');dl.id=dl.id||'__dl';return f('live-s6',[{click:dl.id}]);})()"
G 04-sites-2.html
J "(${CHK})('live-t4',[{click:'btn-open-t4'},{click:'btn-exec-t4'}])"
G 06-employees-3.html
J "(${CHK})('live-e6',[{click:'btn-open-e6'},{click:'btn-submit-e6'}])"
G 07-schedule-3.html
J "(${CHK})('live-r4',[{click:'btn-open-r4'},{click:'btn-submit-r4'}])"
G 09-allowance-2.html
J "(${CHK})('live-a5',[{click:'btn-open-a3'},{click:'btn-goto-a5'},{click:'btn-submit-a5'}])"
G 11-operations-4.html
J "(${CHK})('live-o10',[{click:'btn-open-o9'},{click:'btn-goto-o10'},{type:['o10-confirm-input','교체']},{click:'btn-exec-o10'}])"

echo "=============== R18 S3 펼침 → 재접힘 title ==============="
G 00-shell-1.html
J "(()=>{const w=document.getElementById('state-s3');const b=w.querySelector('.btn-sidebar-toggle');const s=w.querySelector('.sidebar');const t=()=>[...s.querySelectorAll('.nav-item')].map(a=>a.getAttribute('title')||'∅');const t0=t();b.click();const t1=t();b.click();const t2=t();return 'S3 초기='+t0.join('/')+' | 펼침='+t1.join('/')+' | 재접힘='+t2.join('/')+' | 재접힘 title 수='+t2.filter(x=>x!=='∅').length+'/'+t2.length+' collapsed='+s.classList.contains('collapsed');})()"
echo DONE
