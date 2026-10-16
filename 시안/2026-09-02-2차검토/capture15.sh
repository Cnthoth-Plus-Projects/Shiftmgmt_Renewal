#!/usr/bin/env bash
# 캡처15차 — ④ 11차(R29·R30) 편집 5파일 전/후 정적 캡처 + 픽셀 대조 (스냅샷14차 = 전, 2차HTML = 후)
B="$HOME/.claude/skills/gstack/browse/dist/browse"
CUR="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차HTML"
OLD="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차검토/스냅샷14차"
R="시안/2026-09-02-2차검토"
OUT="$R/캡처15차"
FILES="02-common-1 04-sites-2 07-schedule-3 09-allowance-2 11-operations-4"
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
