#!/usr/bin/env bash
# ⑤ 4차 — 지시서 정본 문구 전수 대조 (phrases.js + 3차 추가분 phrases3-extra.json)
B="$HOME/.claude/skills/gstack/browse/dist/browse"
W="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차HTML"
"$B" viewport 1440x900 >/dev/null 2>&1
for p in "시안/2026-09-02-2차HTML"/*.html; do
  f=$(basename "$p")
  "$B" goto "file:///$W/$f" >/dev/null 2>&1
  "$B" wait --load >/dev/null 2>&1
  "$B" eval "시안/2026-09-02-2차검토/phrases4.js" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'
done
echo DONE
