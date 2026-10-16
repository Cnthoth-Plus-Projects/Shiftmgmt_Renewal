#!/usr/bin/env bash
# ⑤ 4차 재검토 — 24파일 measure.js 계측 + 전체 페이지 캡처 + 콘솔 오류 + 스크립트 파싱
B="$HOME/.claude/skills/gstack/browse/dist/browse"
W="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차HTML"
OUT="시안/2026-09-02-2차검토/캡처4차"
"$B" viewport 1440x900 >/dev/null 2>&1
for p in "시안/2026-09-02-2차HTML"/*.html; do
  f=$(basename "$p" .html)
  "$B" console --clear >/dev/null 2>&1
  "$B" goto "file:///$W/$f.html" >/dev/null 2>&1
  "$B" wait --load >/dev/null 2>&1
  "$B" eval "시안/2026-09-02-2차검토/measure.js" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$' > "$OUT/$f.json"
  echo "$f console: $("$B" console --errors 2>/dev/null | tr '\n' ' ' | cut -c1-200)"
  echo "$f parse: $("$B" js "(()=>{let e=[];document.querySelectorAll('script').forEach((s,i)=>{if(s.src)return;try{new Function(s.textContent)}catch(x){e.push(i+':'+x.message)}});return e.length?e.join(' | '):'OK '+document.querySelectorAll('script').length+' scripts';})()" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$')"
  "$B" screenshot "$OUT/$f.png" >/dev/null 2>&1
  echo "$f json=$(stat -c %s "$OUT/$f.json")B png=$(stat -c %s "$OUT/$f.png" 2>/dev/null)B"
done
echo DONE
