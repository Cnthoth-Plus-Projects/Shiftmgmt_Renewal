#!/usr/bin/env bash
# N2 보조 — Tab이 main 안에 머물지 않은 상태의 main 안 조작 요소 수(0이면 건너뛸 본문 요소가 없는 것 = 셸 자리표시·목록 전용)
B="$HOME/.claude/skills/gstack/browse/dist/browse"
P="file:///C:/Projects/Active/교대근무관리 시스템"
J() { "$B" js "$1" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'; }
G() { "$B" goto "$1" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1; }
Q="(id)=>{const m=document.getElementById(id);const f=[...m.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')].filter(e=>!e.hasAttribute('disabled')&&e.getAttribute('tabindex')!=='-1'&&e.getClientRects().length>0);return JSON.stringify({id,mainHidden:m.getAttribute('aria-hidden'),focusable:f.length,first:f[0]?(f[0].tagName+'#'+f[0].id+':'+(f[0].textContent||'').trim().slice(0,16)):null,text:m.textContent.trim().replace(/\s+/g,' ').slice(0,40)})}"
for spec in "2차HTML/00-shell-1:main-content-s1 main-content-s2 main-content-s3" "2차HTML/00-shell-2:main-content-s4 main-content-s5 main-content-s6" "2차HTML/07-schedule-3:main-content-r5" "1차HTML/05-sites-wizard-3:main-content-w7"; do
  f=${spec%%:*}; ids=${spec#*:}; d=$([ "${f%%/*}" = 1차HTML ] && echo "2026-08-31-1차HTML" || echo "2026-09-02-2차HTML")
  G "$P/시안/$d/${f#*/}.html"
  for id in $ids; do echo "${f#*/} $(J "(()=>($Q)('$id'))()")"; done
done
