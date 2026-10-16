#!/usr/bin/env bash
# ⑤ 13차 전용 — 잠금 직후 합성 Tab keydown이 모달 리스너에서 preventDefault되는지(결정적) + 실제 Tab 키(CLI 지연 ~0.6s라 600ms 데모는 완료 후 측정될 수 있음 — 참고용) · ⑥ 3차 회신 D11(처리 중 실제 Tab 키로 포커스가 모달 밖으로 나가는가)·D12(완료 후 재열기 시 실행 버튼 라벨/disabled 복원) 전/후 실측.
# 같은 스크립트를 스냅샷13차(전)와 2차HTML(후)에 돌린다. 13모달: C1~C4·T4·R4·A4·A5·O10·E3·E4·E6·E8
B="$HOME/.claude/skills/gstack/browse/dist/browse"
CUR="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차HTML"
OLD="${OLD_DIR:-C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차검토/스냅샷13차}"  # 15차: OLD_DIR 환경변수로 기준 스냅샷 지정 가능
JS() { "$B" js "$1" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'; }
G() { "$B" console --clear >/dev/null 2>&1; "$B" goto "file:///$1/$2" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1; }
C() { echo "  콘솔: $("$B" console --errors 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$' | tr '\n' ' ')"; }
"$B" viewport 1440x900 >/dev/null 2>&1
# 인자: 이름 파일 열기JS 모달id 실행버튼 selector(JS식) [앞모달id]
T() {
  local name="$1" file="$2" open="$3" M="$4" S="$5" P="$6"
  G "$D" "$file"; JS "(()=>{$open;return 1})()" >/dev/null
  JS "(()=>{const m=document.getElementById('$M');const s=$S;s.click();const ae=document.activeElement;const ev=new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});const blocked=!ae.dispatchEvent(ev);return '$name 잠금 직후: 라벨='+s.textContent+' activeElement='+(ae.id||ae.tagName+'.'+ae.className)+' 모달안='+m.contains(ae)+' | 합성 Tab keydown 차단(defaultPrevented)='+blocked;})()"
  "$B" press Tab >/dev/null 2>&1
  JS "(()=>{const m=document.getElementById('$M');const ae=document.activeElement;return '   Tab 1회 후: activeElement='+(ae.id||ae.tagName+'.'+ae.className)+' 모달안='+m.contains(ae)+(m.contains(ae)?'':' ★이탈');})()"
  "$B" press Tab >/dev/null 2>&1
  JS "(()=>{const m=document.getElementById('$M');const ae=document.activeElement;return '   Tab 2회 후: activeElement='+(ae.id||ae.tagName+'.'+ae.className)+' 모달안='+m.contains(ae);})()"
  sleep 1.3
  JS "(()=>{const m=document.getElementById('$M');const vis=e=>!!e&&getComputedStyle(e).display!=='none';return '   완료 후: 모달='+vis(m)+' 포커스='+document.activeElement.id;})()"
  JS "(()=>{$open;const m=document.getElementById('$M');const s=$S;const vis=e=>!!e&&getComputedStyle(e).display!=='none';return '   재열기: 모달='+vis(m)+' 실행 라벨='+s.textContent+' disabled='+s.disabled+' aria-disabled='+s.getAttribute('aria-disabled')+(s.disabled?' ★D12':'');})()"
}
for SIDE in OLD CUR; do
  D="${!SIDE}"; echo "################ ${SIDE} = $D"
  for n in 1 2 3; do T "C$n" 02-common-1.html "document.getElementById('btn-open-c$n').click()" modal-c$n "document.querySelector('#modal-c$n .btn-modal-confirm')"; done
  T "C4" 02-common-1.html "document.getElementById('btn-open-c4').click();const i=document.getElementById('c4-reason-input');i.value='사유';i.dispatchEvent(new Event('input',{bubbles:true}))" modal-c4 "document.getElementById('btn-c4-reject')"; C
  T "T4" 04-sites-2.html "document.getElementById('btn-open-t4').click()" modal-t4 "document.getElementById('btn-exec-t4')"; C
  T "R4" 07-schedule-3.html "document.getElementById('btn-open-r4').click()" modal-r4 "document.getElementById('btn-submit-r4')"; C
  T "A4" 09-allowance-2.html "document.getElementById('btn-open-a4').click()" modal-a4 "document.getElementById('btn-submit-a4')"
  T "A5" 09-allowance-2.html "document.getElementById('btn-open-a3').click();document.getElementById('btn-goto-a5').click()" modal-a5 "document.getElementById('btn-submit-a5')"; C
  T "O10" 11-operations-4.html "document.getElementById('btn-open-o9').click();document.getElementById('btn-goto-o10').click();const i=document.getElementById('o10-confirm-input');i.value='교체';i.dispatchEvent(new Event('input',{bubbles:true}))" modal-o10 "document.getElementById('btn-exec-o10')"; C
  T "E3" 06-employees-2.html "document.getElementById('btn-open-e3').click();const d=document.getElementById('e3-date');d.value='2025-07-01';d.dispatchEvent(new Event('input',{bubbles:true}))" modal-e3 "document.getElementById('btn-submit-e3')"
  T "E4" 06-employees-2.html "document.getElementById('btn-open-e4').click()" modal-e4 "document.getElementById('btn-submit-e4')"; C
  T "E6" 06-employees-3.html "document.getElementById('btn-open-e6').click();document.getElementById('btn-submit-e6').click()" modal-e6-confirm "document.getElementById('btn-apply-e6-confirm')"
  T "E8" 06-employees-3.html "document.getElementById('btn-open-e8').click()" modal-e8 "document.getElementById('btn-submit-e8')"; C
done
echo DONE
