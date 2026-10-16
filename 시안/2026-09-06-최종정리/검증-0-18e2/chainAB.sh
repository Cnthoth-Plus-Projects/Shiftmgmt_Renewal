#!/usr/bin/env bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
P="file:///C:/Projects/Active/교대근무관리 시스템"
OUT="시안/2026-09-06-최종정리/검증-0-18e2"
echo "### $(date +%H:%M:%S) snap-now 재수집(overflowers 보정)"
: > "$OUT/_snap-now.jsonl"
run() { "$B" goto "$1/$2.html" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1; "$B" eval "$OUT/snapdiff.js" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$' >> "$OUT/_snap-now.jsonl"; }
for f in 03-home-1 03-home-2 05-sites-wizard-1 05-sites-wizard-2 05-sites-wizard-3 05-sites-wizard-4 08-performance-1 08-performance-2 08-performance-3 08-performance-4; do run "$P/시안/2026-08-31-1차HTML" $f; done
for f in 00-shell-1 00-shell-2 01-login-1 01-login-2 02-common-1 02-common-2 02-common-3 04-sites-1 04-sites-2 06-employees-1 06-employees-2 06-employees-3 07-schedule-1 07-schedule-2 07-schedule-3 09-allowance-1 09-allowance-2 09-allowance-3 10-dashboard-1 11-operations-1 11-operations-2 11-operations-3 11-operations-4 12-access-logs-1; do run "$P/시안/2026-09-02-2차HTML" $f; done
PYTHONUTF8=1 python "$OUT/compare_snap.py" "$OUT"
echo "### $(date +%H:%M:%S) E9 패널 하단 캡처"
"$B" goto "$P/시안/2026-09-02-2차HTML/06-employees-1.html" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1
"$B" js "(()=>{document.getElementById('btn-e9-delete').scrollIntoView({block:'center'});return 1})()" >/dev/null 2>&1
"$B" screenshot --viewport "$OUT/cap-e9-bottom.png" >/dev/null 2>&1
bash "$OUT/phaseB.sh"
