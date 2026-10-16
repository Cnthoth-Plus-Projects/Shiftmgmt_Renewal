#!/usr/bin/env bash
# 12차 전용 — ⑥ 2차 회신 D8(E3 항해)·D9(처리 중 닫기 차단: E3·E4·E6·E8) 실측. 같은 스크립트를 스냅샷11차(전)와 2차HTML(후)에 돌린다.
B="$HOME/.claude/skills/gstack/browse/dist/browse"
CUR="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차HTML"
OLD="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차검토/스냅샷11차"
J="시안/2026-09-02-2차검토/dyn13"
E() { "$B" eval "$J/$1" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'; }
G() { "$B" console --clear >/dev/null 2>&1; "$B" goto "file:///$1/$2" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1; }
C() { echo "  콘솔: $("$B" console --errors 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$' | tr '\n' ' ')"; }
"$B" viewport 1440x900 >/dev/null 2>&1
for SIDE in ${SIDES:-OLD CUR}; do  # SIDES=CUR 로 후만 실행 가능(15차 회귀용)
  D="${!SIDE}"; echo "################ ${SIDE} = $D"
  echo "=== D9 E3 (06-employees-2) ==="; G "$D" 06-employees-2.html; E e3-d9a.js; sleep 1.2; E e3-d9b.js; C
  echo "=== D9 E4 (06-employees-2) ==="; G "$D" 06-employees-2.html; E e4-d9.js; C
  echo "=== D9 E6 (06-employees-3) ==="; G "$D" 06-employees-3.html; E e6-d9.js; sleep 1.2; E e6-d9b.js; C
  echo "=== D9 E8 (06-employees-3) ==="; G "$D" 06-employees-3.html; E e8-d9.js; sleep 1.2; E e8-d9b.js; C
  echo "=== D8 E3 [실적 관리로 이동] 항해 ==="; G "$D" 06-employees-2.html
  "$B" js "(()=>{document.getElementById('btn-open-e3').click();var d=document.getElementById('e3-date');d.value='2025-07-01';d.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('btn-submit-e3').click();return 'ok';})()" >/dev/null 2>&1
  sleep 1.2
  "$B" js "(()=>{var g=document.getElementById('btn-e3-goto-perf');var before=location.pathname.split('/').slice(-2).join('/');g.click();return '클릭 전 위치='+decodeURIComponent(before);})()" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'
  sleep 1.5
  "$B" js "(()=>{var lb=document.querySelector('.status-label-bar');return '클릭 후 위치='+decodeURIComponent(location.pathname.split('/').slice(-2).join('/'))+' 첫 상태 라벨=\"'+(lb?lb.textContent.trim():'없음')+'\"';})()" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'
done
echo DONE
