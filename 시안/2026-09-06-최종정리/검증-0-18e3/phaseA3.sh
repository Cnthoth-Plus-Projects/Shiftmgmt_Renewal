#!/usr/bin/env bash
# ⑤ 3차 phase A — audit1c 10파일(직접 텍스트 12px 미만, 예외 파일·선택자·값 한정) → 기준본(스냅샷17차 34) · 결과본(현재 34) 같은 조건 스냅샷·캡처 → 구조 대조·픽셀 대조
B="$HOME/.claude/skills/gstack/browse/dist/browse"
P="file:///C:/Projects/Active/교대근무관리 시스템"
OUT="시안/2026-09-06-최종정리/검증-0-18e3"
R1="$P/시안/2026-08-31-1차HTML"; R2="$P/시안/2026-09-02-2차HTML"
S1="$P/시안/2026-09-02-2차검토/스냅샷17차/1차"; S2="$P/시안/2026-09-02-2차검토/스냅샷17차/2차"
F1="03-home-1 03-home-2 05-sites-wizard-1 05-sites-wizard-2 05-sites-wizard-3 05-sites-wizard-4 08-performance-1 08-performance-2 08-performance-3 08-performance-4"
F2="00-shell-1 00-shell-2 01-login-1 01-login-2 02-common-1 02-common-2 02-common-3 04-sites-1 04-sites-2 06-employees-1 06-employees-2 06-employees-3 07-schedule-1 07-schedule-2 07-schedule-3 09-allowance-1 09-allowance-2 09-allowance-3 10-dashboard-1 11-operations-1 11-operations-2 11-operations-3 11-operations-4 12-access-logs-1"
"$B" viewport 1440x900 >/dev/null 2>&1
echo "### $(date +%H:%M:%S) audit1c 10파일 (결과본)"
: > "$OUT/_audit1c.jsonl"
for f in $F1; do "$B" goto "$R1/$f.html" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1; "$B" eval "$OUT/audit1c.js" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$' >> "$OUT/_audit1c.jsonl"; done
echo "### $(date +%H:%M:%S) audit1c 10파일 (기준본 스냅샷17차 — 같은 검사기로 전/후)"
: > "$OUT/_audit1c-base.jsonl"
for f in $F1; do "$B" goto "$S1/$f.html" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1; "$B" eval "$OUT/audit1c.js" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$' >> "$OUT/_audit1c-base.jsonl"; done
mkdir -p "$OUT/cap-base" "$OUT/cap-now"; : > "$OUT/_snap-base.jsonl"; : > "$OUT/_snap-now.jsonl"
run() { "$B" goto "$1/$2.html" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1; "$B" eval "$OUT/snapdiff.js" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$' >> "$OUT/_snap-$3.jsonl"; "$B" screenshot "$OUT/cap-$3/$2.png" >/dev/null 2>&1; }
echo "### $(date +%H:%M:%S) 기준본(스냅샷17차) 34"
for f in $F1; do run "$S1" $f base; done
for f in $F2; do run "$S2" $f base; done
echo "### $(date +%H:%M:%S) 결과본 34"
for f in $F1; do run "$R1" $f now; done
for f in $F2; do run "$R2" $f now; done
echo "### $(date +%H:%M:%S) 대조"
PYTHONUTF8=1 python "$OUT/compare_snap.py" "$OUT"
PYTHONUTF8=1 python "$OUT/imgdiff2.py" "$OUT" > /dev/null
echo "### $(date +%H:%M:%S) 끝 — base $(wc -l < "$OUT/_snap-base.jsonl") / now $(wc -l < "$OUT/_snap-now.jsonl") · png $(ls "$OUT/cap-base" | wc -l)/$(ls "$OUT/cap-now" | wc -l)"
