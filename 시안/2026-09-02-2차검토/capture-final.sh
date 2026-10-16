#!/usr/bin/env bash
# 최종검수 — ⑥ Codex AGREE(2026-09-06 13:08) 뒤 사용자 최종 검수용: 승인본(=스냅샷15차) 24파일 전체 정적 캡처 + 상태 라벨 바 텍스트 목록
B="$HOME/.claude/skills/gstack/browse/dist/browse"
W="C:/Projects/Active/교대근무관리 시스템/시안/2026-09-02-2차HTML"
OUT="시안/2026-09-02-2차검토/최종검수/캡처"
"$B" viewport 1440x900 >/dev/null 2>&1
for p in "시안/2026-09-02-2차HTML"/*.html; do
  f=$(basename "$p" .html)
  "$B" goto "file:///$W/$f.html" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1
  "$B" screenshot "$OUT/$f.png" >/dev/null 2>&1
  echo "## $f.html  ($(stat -c %s "$OUT/$f.png")B)"
  "$B" js "(()=>{return [...document.querySelectorAll('.status-label-bar')].map(l=>'  '+l.textContent.trim().replace(/\s+/g,' ')).join('\n')||'  (상태 라벨 바 없음)';})()" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'
done
echo DONE
