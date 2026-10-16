#!/usr/bin/env bash
# ⑤ 2차 재실측 phase A — (b) 수정 뒤: e2b 추가 결함 검사 → audit1b 10파일 → 결과본 스냅샷·캡처 34 → 구조 대조·픽셀 대조
B="$HOME/.claude/skills/gstack/browse/dist/browse"
P="file:///C:/Projects/Active/교대근무관리 시스템"
OUT="시안/2026-09-06-최종정리/검증-0-18e2"
R1="$P/시안/2026-08-31-1차HTML"
bash "$OUT/e2b_checks.sh" > "$OUT/_e2b_checks.log" 2>&1
echo "### $(date +%H:%M:%S) audit1b 10파일"
: > "$OUT/_audit1b.jsonl"
for f in 03-home-1 03-home-2 05-sites-wizard-1 05-sites-wizard-2 05-sites-wizard-3 05-sites-wizard-4 08-performance-1 08-performance-2 08-performance-3 08-performance-4; do
  "$B" goto "$R1/$f.html" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1
  "$B" eval "$OUT/audit1b.js" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$' >> "$OUT/_audit1b.jsonl"
done
echo "### $(date +%H:%M:%S) 결과본 스냅샷·캡처 34"
mkdir -p "$OUT/cap-now"; : > "$OUT/_snap-now.jsonl"
run() { "$B" goto "$1/$2.html" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1; "$B" eval "$OUT/snapdiff.js" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$' >> "$OUT/_snap-now.jsonl"; "$B" screenshot "$OUT/cap-now/$2.png" >/dev/null 2>&1; }
for f in 03-home-1 03-home-2 05-sites-wizard-1 05-sites-wizard-2 05-sites-wizard-3 05-sites-wizard-4 08-performance-1 08-performance-2 08-performance-3 08-performance-4; do run "$R1" $f; done
for f in 00-shell-1 00-shell-2 01-login-1 01-login-2 02-common-1 02-common-2 02-common-3 04-sites-1 04-sites-2 06-employees-1 06-employees-2 06-employees-3 07-schedule-1 07-schedule-2 07-schedule-3 09-allowance-1 09-allowance-2 09-allowance-3 10-dashboard-1 11-operations-1 11-operations-2 11-operations-3 11-operations-4 12-access-logs-1; do run "$P/시안/2026-09-02-2차HTML" $f; done
echo "### $(date +%H:%M:%S) 대조"
PYTHONUTF8=1 python "$OUT/compare_snap.py" "$OUT"
PYTHONUTF8=1 python "$OUT/imgdiff2.py" "$OUT" > /dev/null
echo "### $(date +%H:%M:%S) 끝 — now $(wc -l < "$OUT/_snap-now.jsonl") · png $(ls "$OUT/cap-now" | wc -l)"
