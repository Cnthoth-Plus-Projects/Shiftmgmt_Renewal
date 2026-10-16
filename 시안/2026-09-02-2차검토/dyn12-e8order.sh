#!/usr/bin/env bash
# 11차 전용 — E8 필드 순서 = 소스 검사. 같은 스크립트를 스냅샷10차(전)와 2차HTML(후)에 돌린다.
B="$HOME/.claude/skills/gstack/browse/dist/browse"
CUR="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차HTML"
OLD="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차검토/스냅샷10차"
J="시안/2026-09-02-2차검토/dyn11"
"$B" viewport 1440x900 >/dev/null 2>&1
for SIDE in OLD CUR; do D="${!SIDE}"; echo "######## $SIDE"; "$B" goto "file:///$D/06-employees-3.html" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1; "$B" eval "$J/e8-order.js" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'; done
echo DONE
