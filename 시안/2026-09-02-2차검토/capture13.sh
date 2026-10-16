#!/usr/bin/env bash
# 캡처13차 — ④ 10차 편집 11파일 전/후 정적 캡처 + 픽셀 대조 (스냅샷12차 = 전, 2차HTML = 후)
B="$HOME/.claude/skills/gstack/browse/dist/browse"
CUR="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차HTML"
OLD="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차검토/스냅샷12차"
R="시안/2026-09-02-2차검토"
OUT="$R/캡처13차"
FILES="01-login-2 02-common-1 02-common-2 02-common-3 04-sites-2 07-schedule-3 09-allowance-2 11-operations-1 11-operations-2 11-operations-3 11-operations-4"
mkdir -p "$OUT/old" "$OUT/new"
"$B" viewport 1440x900 >/dev/null 2>&1
for SIDE in OLD CUR; do
  D="${!SIDE}"; DIR="old"; [ "$SIDE" = "CUR" ] && DIR="new"
  for f in $FILES; do
    "$B" goto "file:///$D/$f.html" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1
    "$B" screenshot "$OUT/$DIR/$f.png" >/dev/null 2>&1
    echo "$SIDE $f $(stat -c %s "$OUT/$DIR/$f.png")B"
  done
done
echo "=== imgdiff old → new ==="
python3 "$R/imgdiff.py" "$OUT/old" "$OUT/new" 2>/dev/null | tee "$OUT/_imgdiff.log"
echo DONE
