# -*- coding: utf-8 -*-
"""0-18h — TODO.md·.ai/current-state.md 같은 턴 갱신(⑥ 2차 HANDOFF 발송 상태). 치환 기대 횟수 검사."""
import io, re, os
os.chdir(r"C:\Projects\Active\교대근무관리 시스템")
SHA = '51a1ab31fe1f36a46ec8271215e35f67fb32981a54ef2d03f08e834541dc436d'
RECV = '`Log/20260907_135416_0-18g-품질평가_codex-DISAGREE_수신원본.md` `ee199a6bccc7b99b717a1122d5c9a46f0515740a9d530a2dda4b9bf8223ead01`(29,165 B)'
def rep(t, old, new, tag, n=1):
    c = t.count(old)
    if c != n: raise SystemExit('❌ %s: 기대 %d ≠ %d' % (tag, n, c))
    return t.replace(old, new)
# ---------- TODO.md ----------
p = 'TODO.md'; t = io.open(p, encoding='utf-8').read()
t = rep(t, '> 최종 갱신: 2026-09-05 ·', '> 최종 갱신: 2026-09-07 ·', 'TODO 최종 갱신')
t = rep(t, "12:27, `4372e90f…`) → 사용자 전달 대기** — 24파일 검수는 0-18g 34파일 일괄로 통합 |",
       "12:27, `4372e90f…`) → **Codex ⑥ 1차 회신 DISAGREE(12:58, Q1~Q6·충돌 판정 7·LOCK 해시 정정, `ee199a6b…`) → 전건 원본 재현(Codex 인용 오류 0) → ④ 2차 재수정(Claude 13:54~14:30 — Q1~Q6 + 자체 발견 S1~S4·R1, 29파일 변경·5 불변, `스냅샷17차/`) → ⑤ 2차 통과(겸직·독립성 없음, `07-0-18e2-재수정-자체검토.md`) → 정본 v1.9·v2.9 🔓 → 0-18h ⑥ 2차 HANDOFF 발송(To: Codex, 14:52, `51a1ab31…`) → 사용자 전달 대기** — 24파일 검수는 0-18g 34파일 일괄로 통합 |", 'TODO 지금 위치')
m = re.search(r"\*\*① 지금: 사용자가 현 `HANDOFF\.md`\(0-18g ⑥ 품질 평가 To: Codex — 34파일 구현 결과.*?→ 0-13·0-14·0-17·0-18 ✅\. \(참고\) 0-18e ④는", t)
assert m and t.count(m.group(0)) == 1, 'TODO 다음 행동 앵커'
t = t.replace(m.group(0), "**① 지금: 사용자가 현 `HANDOFF.md`(0-18g ⑥ 품질 평가 **2차** To: Codex — ④ 2차 재수정 결과 Q1~Q6·자체 발견 5건·정본 v1.9/v2.9 독립 검증, 09-07 14:52 발송본 `Log/20260907_145207_0-18g-품질평가2차_발송본.md` `" + SHA + "`)를 Codex에 전달 → 회신 대기.** 회신이 오면 `## 회신` 칸부터 → `Log/…_0-18g-품질평가2차_codex-<AGREE|DISAGREE>_수신원본.md` 보존(+64자 SHA) → 지적을 원본에서 재현 → DISAGREE면 ④ 3차 재수정(Claude, `스냅샷17차/` 기준 diff · v1.9/v2.9 §G 허용 hunk) → 재요청 / AGREE면 정본 v1.9·v2.9 🔒 LOCK(해시 기록) → **사용자 34파일(+3상태) 일괄 검수 안내** → 0-13·0-14·0-17·0-18 ✅. (참고) 0-18e ④는")
t = rep(t, "독립 검증 요청: 전/후 SHA 34+34 · 항목 10 · 충돌 7건. **사용자 → Codex 전달 대기** |",
       "독립 검증 요청: 전/후 SHA 34+34 · 항목 10 · 충돌 7건 → **Codex ⑥ 1차 회신 DISAGREE(12:58 — Q1 홈 `</style>` 밖 CSS 노출·Q2 E9 [패널 닫기] 미동작·Q3 E9 복제 배치(이력 59px·버튼 30×106)·Q4 달력 날짜 9px·Q5 행 40 미달(P3 43·P5 43·W7 30)·Q6 1차 접힘 `display:none` + 충돌 판정 7 + LOCK 해시 정정)** 수신원본 " + RECV + " → 전건 원본 재현(Codex 인용 오류 0) → **0-18h** |", 'TODO 0-18g 행')
row = ("| 0-18h | ⑥ 1차 DISAGREE 처리 — ④ 2차 재수정(Claude 대행, R-11) → ⑤ 2차 → 정본 v1.9·v2.9 🔓 → ⑥ 2차 재요청(To: Codex) | 🔄 **⑥ 2차 HANDOFF 작성·발송본 보존(14:52)** `Log/20260907_145207_0-18g-품질평가2차_발송본.md` SHA `" + SHA + "`(17,976 B) — ④ 2차(13:54~14:30, `검증-0-18e2/fix-0-18e2.py`·`fix-0-18e2b.py` 110 치환 전건 기대 횟수 일치): Q1~Q6 + **자체 발견 5건**(S1 skip-link가 평소에도 라벨 바 위에 노출 — 71상태·34파일 공통 / S2 P5 상자 `overflow:hidden` 22px 잘림 / S3 P6·P8·P10 도구 막대 T-4/T-6로 12px 넘침 / S4 P3 nowrap 표가 카드 588/578로 벌림 / R1 0-18e ④가 `.pattern-day-box`를 12→11로 낮춘 회귀) → **29파일 변경·5 불변**, 결과 `스냅샷17차/`(34+SHA, `cmp` 동일) · ⑤ 2차(~14:45, `시안/2026-09-06-최종정리/07-0-18e2-재수정-자체검토.md`): `audit1b.js`(직접 텍스트 12px 미만 0/24상태 · 보이는 표 전 행 40 위반 0, 예외 ④ 71만) · Q6 접힘 왕복 24상태×3 = 72/72 · E9 닫기 클릭/Enter/Space 3/3 · skip-link 평소 숨김 71/71·첫 Tab 표시 · 기준본↔결과본 구조 대조 `snapdiff.js`(85상태 — 글자 변경 분류 안 됨 0·`main` 넘침 0/85) · 픽셀 블록 `cap-diff/` · 회귀(p6·v2 시나리오 0-18e와 시각 외 0 · audit2 차이 = 해소분·기록 차이 2뿐 · iconleak 419/566 누출 0 · 콘솔·문법·id·aria 34파일 0) · 12px 승격 선언 단위 재집계 48→16(승격 32, \"41\" 폐기) · **정본 v1.9(13곳)·v2.9(10곳) 🔓** SHA `cc197ed4…`·`eb615089…` · 판정 항목 3(배지 이름 `title` 방식 · 2차 skip-link 19파일 사후 허용 · 예외 ④⑤). **사용자 → Codex 전달 대기** |")
lines = t.split('\n'); idx = [i for i, l in enumerate(lines) if l.startswith('| 0-18g |')]
assert len(idx) == 1, '0-18g 행 수'; lines.insert(idx[0] + 1, row); t = '\n'.join(lines)
io.open(p, 'w', encoding='utf-8', newline='\n').write(t); print('TODO.md ✓')
# ---------- current-state ----------
p = '.ai/current-state.md'; t = io.open(p, encoding='utf-8').read()
old_h = "# ▶ 이어서 시작할 지점 (2026-09-07 12:27 기준 — Gemini 착수 전 중단 → R-11 Claude 대행 구현 34/34 → ⑤ 자체 검토 통과 → **0-18g ⑥ HANDOFF(To: Codex) 발송 · 사용자 전달 대기**)"
t = rep(t, old_h, "# ▶ 이어서 시작할 지점 (2026-09-07 14:52 기준 — ⑥ 1차 DISAGREE(Q1~Q6) → ④ 2차 재수정(Claude) + 자체 발견 5건 → ⑤ 2차 통과 → 정본 v1.9·v2.9 🔓 → **0-18h ⑥ 2차 HANDOFF(To: Codex) 발송 · 사용자 전달 대기**)", 'cs 헤더')
m = re.search(r"^1\. \*\*Codex 0-18g ⑥ 회신이 오면\*\*:.*$", t, flags=re.M); assert m, 'cs 다음 행동 1'
t = t.replace(m.group(0), "1. **Codex 0-18g ⑥ 2차 회신이 오면**: `## 회신` 칸부터 → `Log/YYYYMMDD_HHMMSS_0-18g-품질평가2차_codex-<AGREE|DISAGREE>_수신원본.md` 보존(+64자 SHA, 발송본 `51a1ab31…` 17,976 B 대조) → 지적을 원본 HTML·로그에서 재현(관례: Codex 인용 오류 0 — ⑥ 1차도 Q1~Q6 전건 실제 결함) → **DISAGREE면 ④ 3차 재수정(Claude, `스냅샷17차/` 기준 diff · v1.9/v2.9 §G 허용 hunk 밖 = 반려 · 스크립트 치환 횟수 검사 · 스냅샷18차)** → ⑤ 3차(`검증-0-18e2/` 도구 재실행: `e2_scenario.sh`·`e2b_checks.sh`·audit1b·`chainAB.sh`=snapdiff/캡처/phaseB·`analyzeB.sh`) → ⑥ 3차 / **AGREE면 v1.9·v2.9 🔒 LOCK(판본 유지·해시 기록) → 사용자 34파일(+A9·E9·R7) 일괄 검수 안내(`최종검수/검수-안내.md` 갱신) → 0-13·0-14·0-17·0-18 ✅**. ⑥ 1차 회신(DISAGREE, 12:58) 처리 기록: 수신원본 `Log/20260907_135416_…` `ee199a6b…` · ④ 2차 `검증-0-18e2/fix-0-18e2.py`(Q1~Q6·R1)·`fix-0-18e2b.py`(S1~S4) · ⑤ 2차 보고서 `시안/2026-09-06-최종정리/07-0-18e2-재수정-자체검토.md` · 정본 `03-1차-소급-지시서-v1.9.md`·`04-2차-지시서-v2.9.md`(옛 v1.8·v2.8 보존).")
t = rep(t, "## 지금 상태 한 줄\n\n", "## 지금 상태 한 줄\n\n**(2026-09-07 14:52) 0-18g ⑥ 1차 = DISAGREE(Q1~Q6 전건 실제 결함·Codex 인용 오류 0) → Claude가 ④ 2차 재수정(29파일)·⑤ 2차·정본 v1.9/v2.9 정정까지 마치고 ⑥ 2차 HANDOFF를 발송 상태로 두었다.** ⑤ 2차에서 기준본↔결과본 구조 대조(`snapdiff.js`)로 Codex도 놓친 5건(skip-link 평소 노출 34파일·P5 22px 잘림·P6/P8/P10 도구 막대 넘침·P3 카드 폭·`.pattern-day-box` 회귀)을 추가로 잡아 고쳤다. 남은 판정 항목 3(배지 이름 `title` 방식·2차 skip-link 사후 허용·예외 ④⑤). 아래 옛 「지금 상태」 문단은 0-18b 기록.\n\n", 'cs 지금 상태')
io.open(p, 'w', encoding='utf-8', newline='\n').write(t); print('current-state.md ✓')
