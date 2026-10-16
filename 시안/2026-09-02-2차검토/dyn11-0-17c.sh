#!/usr/bin/env bash
# 0-17c 클릭 자동 검증 — 06-employees 3파일 (E1·E2 구조 / E3 소급·토스트 / E6 무효·확인 / E8 검증·BP)
B="$HOME/.claude/skills/gstack/browse/dist/browse"
W="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차HTML"
J="시안/2026-09-02-2차검토/dyn11"
E() { "$B" eval "$J/$1" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'; }
G() { "$B" console --clear >/dev/null 2>&1; "$B" goto "file:///$W/$1" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1; }
C() { echo "  콘솔: $("$B" console --errors 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$' | tr '\n' ' ')"; echo "  파싱: $("$B" js "(()=>{let e=[];document.querySelectorAll('script').forEach((s,i)=>{if(s.src)return;try{new Function(s.textContent)}catch(x){e.push(i+':'+x.message)}});return e.length?e.join(' | '):'OK '+document.querySelectorAll('script').length+' scripts';})()" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$')"; }
"$B" viewport 1440x900 >/dev/null 2>&1
echo "=========== 06-employees-1 (E1·E2)"; G 06-employees-1.html; E e1.js; E e2.js; C
echo "=========== 06-employees-2 (E3)"; G 06-employees-2.html; E e3-1.js; E e3-2.js; C
echo "=========== 06-employees-3 (E6·E8)"; G 06-employees-3.html; E e6-1.js; E e6-2.js; E e6-3.js; E e8-1.js; E e8-2.js; C
echo DONE
