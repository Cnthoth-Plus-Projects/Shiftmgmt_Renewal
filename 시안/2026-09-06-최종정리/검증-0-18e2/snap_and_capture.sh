#!/usr/bin/env bash
# 기준본(1차 승인본 10 · 2차 스냅샷15차 24) ↔ 결과본(현재 34) 을 같은 조건(1440×900, 전체 페이지)에서 스냅샷(JSON)·캡처(PNG)
B="$HOME/.claude/skills/gstack/browse/dist/browse"
P="file:///C:/Projects/Active/교대근무관리 시스템"
OUT="시안/2026-09-06-최종정리/검증-0-18e2"
mkdir -p "$OUT/cap-base" "$OUT/cap-now"
"$B" viewport 1440x900 >/dev/null 2>&1
: > "$OUT/_snap-base.jsonl"; : > "$OUT/_snap-now.jsonl"
run() { # $1 = url dir, $2 = file, $3 = base|now
  "$B" goto "$1/$2.html" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1
  "$B" eval "$OUT/snapdiff.js" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$' >> "$OUT/_snap-$3.jsonl"
  "$B" screenshot "$OUT/cap-$3/$2.png" >/dev/null 2>&1
}
F1="03-home-1 03-home-2 05-sites-wizard-1 05-sites-wizard-2 05-sites-wizard-3 05-sites-wizard-4 08-performance-1 08-performance-2 08-performance-3 08-performance-4"
F2="00-shell-1 00-shell-2 01-login-1 01-login-2 02-common-1 02-common-2 02-common-3 04-sites-1 04-sites-2 06-employees-1 06-employees-2 06-employees-3 07-schedule-1 07-schedule-2 07-schedule-3 09-allowance-1 09-allowance-2 09-allowance-3 10-dashboard-1 11-operations-1 11-operations-2 11-operations-3 11-operations-4 12-access-logs-1"
echo "### $(date +%H:%M:%S) 기준본"
for f in $F1; do run "$P/시안/2026-09-06-최종정리/스냅샷-1차-승인본" $f base; done
for f in $F2; do run "$P/시안/2026-09-02-2차검토/스냅샷15차" $f base; done
echo "### $(date +%H:%M:%S) 결과본"
for f in $F1; do run "$P/시안/2026-08-31-1차HTML" $f now; done
for f in $F2; do run "$P/시안/2026-09-02-2차HTML" $f now; done
echo "### $(date +%H:%M:%S) 끝 — base $(wc -l < "$OUT/_snap-base.jsonl") / now $(wc -l < "$OUT/_snap-now.jsonl") · png $(ls "$OUT/cap-base" | wc -l)/$(ls "$OUT/cap-now" | wc -l)"
