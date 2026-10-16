#!/usr/bin/env bash
# ⑤ 2차 재실측 phase B — 회귀: 0-18e 정규 도구 그대로 재실행(p6_scenario · v2_interact · audit2 24 · iconleak 34 · 콘솔 34) + e2_scenario(Q1/Q2/Q3/Q6) 재실행
B="$HOME/.claude/skills/gstack/browse/dist/browse"
P="file:///C:/Projects/Active/교대근무관리 시스템"
OUT="시안/2026-09-06-최종정리/검증-0-18e2"
E="시안/2026-09-06-최종정리/검증-0-18e"
echo "### $(date +%H:%M:%S) p6_scenario"; bash "$E/p6_scenario.sh" > "$OUT/_p6_scenario.log" 2>&1
echo "### $(date +%H:%M:%S) v2_interact"; bash "$E/v2_interact.sh" > "$OUT/_v2_interact.log" 2>&1
echo "### $(date +%H:%M:%S) audit2 24"; : > "$OUT/_audit2.jsonl"
for f in 00-shell-1 00-shell-2 01-login-1 01-login-2 02-common-1 02-common-2 02-common-3 04-sites-1 04-sites-2 06-employees-1 06-employees-2 06-employees-3 07-schedule-1 07-schedule-2 07-schedule-3 09-allowance-1 09-allowance-2 09-allowance-3 10-dashboard-1 11-operations-1 11-operations-2 11-operations-3 11-operations-4 12-access-logs-1; do
  "$B" goto "$P/시안/2026-09-02-2차HTML/$f.html" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1
  "$B" eval "$E/audit2.js" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$' >> "$OUT/_audit2.jsonl"
done
echo "### $(date +%H:%M:%S) iconleak 34 + 콘솔 34"; : > "$OUT/_iconleak.log"; : > "$OUT/_console.log"
for p in "$P/시안/2026-08-31-1차HTML"/03-home-1 "$P/시안/2026-08-31-1차HTML"/03-home-2 "$P/시안/2026-08-31-1차HTML"/05-sites-wizard-1 "$P/시안/2026-08-31-1차HTML"/05-sites-wizard-2 "$P/시안/2026-08-31-1차HTML"/05-sites-wizard-3 "$P/시안/2026-08-31-1차HTML"/05-sites-wizard-4 "$P/시안/2026-08-31-1차HTML"/08-performance-1 "$P/시안/2026-08-31-1차HTML"/08-performance-2 "$P/시안/2026-08-31-1차HTML"/08-performance-3 "$P/시안/2026-08-31-1차HTML"/08-performance-4 "$P/시안/2026-09-02-2차HTML"/00-shell-1 "$P/시안/2026-09-02-2차HTML"/00-shell-2 "$P/시안/2026-09-02-2차HTML"/01-login-1 "$P/시안/2026-09-02-2차HTML"/01-login-2 "$P/시안/2026-09-02-2차HTML"/02-common-1 "$P/시안/2026-09-02-2차HTML"/02-common-2 "$P/시안/2026-09-02-2차HTML"/02-common-3 "$P/시안/2026-09-02-2차HTML"/04-sites-1 "$P/시안/2026-09-02-2차HTML"/04-sites-2 "$P/시안/2026-09-02-2차HTML"/06-employees-1 "$P/시안/2026-09-02-2차HTML"/06-employees-2 "$P/시안/2026-09-02-2차HTML"/06-employees-3 "$P/시안/2026-09-02-2차HTML"/07-schedule-1 "$P/시안/2026-09-02-2차HTML"/07-schedule-2 "$P/시안/2026-09-02-2차HTML"/07-schedule-3 "$P/시안/2026-09-02-2차HTML"/09-allowance-1 "$P/시안/2026-09-02-2차HTML"/09-allowance-2 "$P/시안/2026-09-02-2차HTML"/09-allowance-3 "$P/시안/2026-09-02-2차HTML"/10-dashboard-1 "$P/시안/2026-09-02-2차HTML"/11-operations-1 "$P/시안/2026-09-02-2차HTML"/11-operations-2 "$P/시안/2026-09-02-2차HTML"/11-operations-3 "$P/시안/2026-09-02-2차HTML"/11-operations-4 "$P/시안/2026-09-02-2차HTML"/12-access-logs-1; do
  "$B" goto "$p.html" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1
  echo "$(basename "$p"): $("$B" console --errors 2>/dev/null | grep -c 'no console errors') $("$B" console --errors 2>/dev/null | grep -v 'BEGIN\|END\|no console errors' | grep -v '^\s*$' | head -3 | tr '\n' ' ' | cut -c1-200)" >> "$OUT/_console.log"
done
node "시안/2026-09-06-최종정리/iconleak.js" 시안/2026-08-31-1차HTML/*.html 시안/2026-09-02-2차HTML/*.html > "$OUT/_iconleak.log" 2>&1
echo "### $(date +%H:%M:%S) e2_scenario 재실행"; bash "$OUT/e2_scenario.sh" > "$OUT/_e2_scenario.log" 2>&1
echo "### $(date +%H:%M:%S) 끝"
