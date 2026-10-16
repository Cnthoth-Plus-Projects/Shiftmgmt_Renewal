#!/usr/bin/env bash
# 0-18i ④ 4차 ⑤ 시나리오 — Codex ⑥ 3차 잔여 1(셸 S1~S6 main aria-hidden 제거: 실제 키 · AX 노출 · 'Blocked aria-hidden' 경고 0 · 배치 동일) · 잔여 2(audit1d 상태 조건 검사기로 W7 닫기 3경로 재실행)
B="$HOME/.claude/skills/gstack/browse/dist/browse"
P="file:///C:/Projects/Active/교대근무관리 시스템"
R1="$P/시안/2026-08-31-1차HTML"; R2="$P/시안/2026-09-02-2차HTML"; S18="$P/시안/2026-09-02-2차검토/스냅샷18차/2차"
OUT="시안/2026-09-06-최종정리/검증-0-18e4"
J() { "$B" js "$1" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$'; }
K() { "$B" press "$1" >/dev/null 2>&1; }
G() { "$B" goto "$1" >/dev/null 2>&1; "$B" wait --load >/dev/null 2>&1; }
"$B" viewport 1440x900 >/dev/null 2>&1
AFTER="(()=>{const a=document.activeElement;const m=a.closest('main');return JSON.stringify({el:a.tagName+'#'+(a.id||''),inMain:m?m.id:null,inNav:!!a.closest('nav,.sidebar'),text:(a.getAttribute('aria-label')||a.textContent||'').trim().replace(/\s+/g,' ').slice(0,24)})})()"
RECT="(id)=>{const m=document.getElementById(id);const r=m.getBoundingClientRect();return JSON.stringify({id,hidden:m.getAttribute('aria-hidden'),tabindex:m.getAttribute('tabindex'),rect:[r.left,r.top,r.width,r.height].map(v=>Math.round(v*10)/10)})}"
echo "### $(date +%H:%M:%S) 잔여 1 — 셸 S1~S6: main 속성·배치(18차 ↔ 현재) · 실제 키(focus→Enter→Tab) · Enter 뒤 콘솔 'aria-hidden' 경고 · AX 트리 main 노출"
for spec in "00-shell-1:s1 s2 s3" "00-shell-2:s4 s5 s6"; do
  f=${spec%%:*}; ids=${spec#*:}
  G "$S18/$f.html"; for s in $ids; do echo "$f 18차 $(J "(()=>($RECT)('main-content-$s'))()")"; done
  G "$R2/$f.html"; for s in $ids; do echo "$f 현재 $(J "(()=>($RECT)('main-content-$s'))()")"; done
  for s in $ids; do
    G "$R2/$f.html"; "$B" console --clear >/dev/null 2>&1
    J "(()=>{const a=document.querySelector('a.skip-link[href=\"#main-content-$s\"]');a.focus();return document.activeElement===a})()" >/dev/null
    K Enter; e=$(J "$AFTER"); warn=$("$B" console 2>/dev/null | grep -ci 'aria-hidden'); K Tab; t=$(J "$AFTER")
    ax=$("$B" accessibility 2>/dev/null | grep -c '^\s*- main')
    echo "$f main-content-$s Enter=$e 경고(aria-hidden)=$warn Tab=$t AX-main노드수=$ax"
  done
done
echo "### $(date +%H:%M:%S) 잔여 1 — 18차(수정 전) 같은 단계의 경고 수(대조): 00-shell-1 s1"
G "$S18/00-shell-1.html"; "$B" console --clear >/dev/null 2>&1; J "(()=>{const a=document.querySelector('a.skip-link[href=\"#main-content-s1\"]');a.focus();return 1})()" >/dev/null; K Enter; echo "18차 s1 Enter 뒤 경고(aria-hidden)=$("$B" console 2>/dev/null | grep -ci 'aria-hidden') · 경고 원문: $("$B" console 2>/dev/null | grep -i 'aria-hidden' | head -1 | cut -c1-160)"
echo "### $(date +%H:%M:%S) 잔여 2 — audit1d(상태 조건) W7 닫기 3경로 뒤 #state-w7 (노출/배경 12px 미만 · b 예외 · b 범위 밖)"
W7SUM="(()=>{return 1})()"
run_w7() { # $1 = 라벨, $2 = 닫기 동작 js 또는 'Escape'
  G "$R1/05-sites-wizard-3.html"
  if [ "$2" = "Escape" ]; then K Escape; else J "$2" >/dev/null; fi; sleep 0.3
  r=$("$B" eval "$OUT/audit1d.js" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$')
  echo "$1: $(PYTHONUTF8=1 python -c "import json,sys; d=json.loads(sys.stdin.read()); w=[x for x in d['wrappers'] if x['id']=='state-w7'][0]; print(json.dumps({'bAllowed':w['bAllowed'],'small':w['small'],'hidden':w['smallHidden'],'mainHidden':w['mainHidden'],'mainOv':w['mainOv'],'w2':w.get('w2') and w['w2']['cell']}, ensure_ascii=False))" <<< "$r")"
}
run_w7 "열린 상태(초기)" "(()=>1)()"
run_w7 "Esc 뒤" "Escape"
run_w7 "[계속 편집] 뒤" "(()=>{const b=[...document.querySelectorAll('#modal-leave-w7 button')].find(b=>b.textContent.trim()==='계속 편집');b.click();return 1})()"
run_w7 "[변경 버리고 나가기] 뒤" "(()=>{const b=[...document.querySelectorAll('#modal-leave-w7 button')].find(b=>b.textContent.trim()==='변경 버리고 나가기');b.click();return 1})()"
echo "### $(date +%H:%M:%S) 잔여 2 — audit1d 범위 검증: wizard-1/2/3에서 b 예외가 상태 밖(bOut)에 적용된 곳 0인지 + 다른 상태의 .c-cell b 존재 여부"
for f in 05-sites-wizard-1 05-sites-wizard-2 05-sites-wizard-3; do
  G "$R1/$f.html"; r=$("$B" eval "$OUT/audit1d.js" 2>/dev/null | grep -v "BEGIN\|END" | grep -v '^\s*$')
  echo "$f $(PYTHONUTF8=1 python -c "import json,sys; d=json.loads(sys.stdin.read()); print(' | '.join('%s bAllowed=%s bEx=%d/%d bOut=%d/%d small=%d/%d' % (w['id'], w['bAllowed'], w['small']['bEx'], w['smallHidden']['bEx'], w['small']['bOut'], w['smallHidden']['bOut'], w['small']['n'], w['smallHidden']['n']) for w in d['wrappers']))" <<< "$r")"
done
echo "### 끝 $(date +%H:%M:%S)"
