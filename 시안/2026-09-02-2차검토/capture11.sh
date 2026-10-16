#!/usr/bin/env bash
# 캡처11차 — 11차(E8 필드 순서 정정) 3파일 재실측 — capture10.sh와 동일, 출력만 캡처11차: 정적 캡처(+measure json) · 상호작용 상태 캡처 · phrases5 · 회귀(dyn2·dyn6) · imgdiff
B="$HOME/.claude/skills/gstack/browse/dist/browse"
W="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차HTML"
R="시안/2026-09-02-2차검토"
OUT="$R/캡처11차"
J="$R/dyn11"
E() { "$B" eval "$1" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'; }
G() { "$B" console --clear >/dev/null 2>&1; "$B" goto "file:///$W/$1" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1; }
"$B" viewport 1440x900 >/dev/null 2>&1
echo "=== E1/E2 신규 버튼 재확인 ==="; G 06-employees-1.html; E "$J/e1-btn.js"
echo "=== 정적 캡처 3파일 ==="
for f in 06-employees-1 06-employees-2 06-employees-3; do
  G "$f.html"
  "$B" eval "$R/measure.js" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$' > "$OUT/$f.json"
  "$B" screenshot "$OUT/$f.png" >/dev/null 2>&1
  echo "$f json=$(stat -c %s "$OUT/$f.json")B png=$(stat -c %s "$OUT/$f.png")B"
done
echo "=== 상호작용 상태 캡처 ==="
G 06-employees-2.html; E "$J/cap-e3-warn.js" >/dev/null; "$B" screenshot "$OUT/e3-warn.png" >/dev/null 2>&1; echo "e3-warn $(stat -c %s "$OUT/e3-warn.png")B"
E "$J/cap-e3-toast.js" >/dev/null; E "$J/cap-e3-toast2.js"; "$B" screenshot "$OUT/e3-toast.png" >/dev/null 2>&1; echo "e3-toast $(stat -c %s "$OUT/e3-toast.png")B"
G 06-employees-3.html; E "$J/cap-e6-stale.js" >/dev/null; "$B" screenshot "$OUT/e6-stale.png" >/dev/null 2>&1; echo "e6-stale $(stat -c %s "$OUT/e6-stale.png")B"
E "$J/cap-e6-confirm.js" >/dev/null; E "$J/cap-e6-confirm2.js"; "$B" screenshot "$OUT/e6-confirm.png" >/dev/null 2>&1; echo "e6-confirm $(stat -c %s "$OUT/e6-confirm.png")B"
G 06-employees-3.html; E "$J/cap-e8-open.js" >/dev/null; "$B" screenshot "$OUT/e8-open.png" >/dev/null 2>&1; echo "e8-open $(stat -c %s "$OUT/e8-open.png")B"
E "$J/cap-e8-bp.js" >/dev/null; "$B" screenshot "$OUT/e8-bp.png" >/dev/null 2>&1; echo "e8-bp $(stat -c %s "$OUT/e8-bp.png")B"
E "$J/cap-e8-range.js" >/dev/null; "$B" screenshot "$OUT/e8-range.png" >/dev/null 2>&1; echo "e8-range $(stat -c %s "$OUT/e8-range.png")B"
echo "=== phrases5 (3파일) ==="
for f in 06-employees-1 06-employees-2 06-employees-3; do G "$f.html"; E "$R/phrases5.js"; done | tee "$OUT/_phrases5.log"
echo "=== phrases5 (나머지 21파일 — phrases4와 같은 목록) ==="
for p in "$W"/*.html; do f=$(basename "$p"); case "$f" in 06-employees-*) continue;; esac; G "$f"; E "$R/phrases5.js"; done | tee -a "$OUT/_phrases5.log" | grep -v '전부 ✓' ; echo "(위에 줄이 없으면 21파일 전부 ✓)"
echo DONE
