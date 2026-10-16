# -*- coding: utf-8 -*-
"""정본 정정 — 0-18i ⑥ 3차 회신(17:12, 잔여 1·2) 반영. v1.10 → v1.11(검사기 상태 조건 문구) · v2.10 → v2.11(셸 6 main aria-hidden 제거 허용 hunk + B-4 대상 규칙). 확정본 v1.3·합의표 v1.3은 AGREE — 불변.
치환마다 기대 1회, 하나라도 다르면 아무 파일도 쓰지 않는다."""
import io, os, hashlib
D = r"C:\Projects\Active\교대근무관리 시스템\시안\2026-09-06-최종정리"
def rd(n): return io.open(os.path.join(D, n), encoding='utf-8', newline='').read()
def sha(n): return hashlib.sha256(open(os.path.join(D, n), 'rb').read()).hexdigest()
out = {}; log = []
def rep(t, old, new, tag):
    c = t.count(old)
    if c != 1: raise SystemExit('❌ %s: 기대 1 ≠ 실제 %d\n  %s' % (tag, c, old[:90]))
    log.append(tag); return t.replace(old, new)
RX = '수신원본 `Log/20260907_192535_0-18i-품질평가3차_codex-DISAGREE_수신원본.md` SHA `74afc8ee60d012bfcf424e7e62c4bb9af382fea372689004fd7754777b39ac46`(25,892 B)'

# ========== 1차 v1.10 → v1.11 ==========
t = rd('03-1차-소급-지시서-v1.10.md')
t = rep(t, '# 1차 HTML 소급 지시서 v1.10 — 화면별 최종 정리 (0-18c · 합의표 v1.3 반영 · 0-18d ③ 회신 F4~F6·F9·F10 + R-9·R-10 + 0-18g ⑥ 1차 회신 Q1·Q4·Q5·Q6·충돌 1·3·5 + ⑤ 2차 자체 발견 S1~S4·R1 + **⑥ 2차 회신 N1·N2·N3 + 사용자 결정 R-12 반영**)',
           '# 1차 HTML 소급 지시서 v1.11 — 화면별 최종 정리 (0-18c · 합의표 v1.3 반영 · 0-18d ③ 회신 F4~F6·F9·F10 + R-9·R-10 + 0-18g ⑥ 1차 회신 Q1·Q4·Q5·Q6·충돌 1·3·5 + ⑤ 2차 자체 발견 S1~S4·R1 + ⑥ 2차 회신 N1·N2·N3 + 사용자 결정 R-12 + **⑥ 3차 회신 잔여 2(검사기 상태 조건) 반영**)', 'v1.11 제목')
t = rep(t, '> 작성: Fable 5 (디자인 담당) / 2026-09-06 · v1.7·v1.8·v1.9·**v1.10** 2026-09-07 · 상태: 🔓 **재검증 중 (v1.10 — 0-18g ⑥ 3차 판정 대기)**',
           '> 작성: Fable 5 (디자인 담당) / 2026-09-06 · v1.7·v1.8·v1.9·v1.10·**v1.11** 2026-09-07 · 상태: 🔓 **재검증 중 (v1.11 — 0-18i ⑥ 4차 판정 대기)**', 'v1.11 상태')
t = rep(t, '> **이번 변경 근거(v1.10)**: 0-18g ⑥ 2차 회신 DISAGREE',
           '> **이번 변경 근거(v1.11)**: 0-18i ⑥ 3차 회신 DISAGREE(2026-09-07 17:12, ' + RX + ') — **잔여 2**: v1.10 :54의 「`audit1c.js` 제외 조건과 같은 문구」가 성립하지 않았다(검사기는 파일명 `05-sites-wizard-[123]`만 보고 wrapper 상태를 보지 않았다) → 검사기를 `audit1d.js`(파일 + wrapper 상태 + 선택자 + computed 10px, wrapper 루프 안)로 바꾸고 문구를 그에 맞춘다. **1차 HTML 변경 없음**(W7 12/10px·달력값 유지 — Codex 「다시 바꿀 필요 없음」). v1.10 → v1.11 diff = `03-1차-소급-지시서-v1.10.md` ↔ 이 파일.\n> **이전 변경 근거(v1.10)**: 0-18g ⑥ 2차 회신 DISAGREE', 'v1.11 근거')
t = rep(t, '(v1.10 N3 확대, W7 = W2 값; Codex 15:55 조건 — 확정본 v1.3 §2·`audit1c.js` 제외 조건과 같은 문구)** ④',
           '(v1.10 N3 확대, W7 = W2 값; Codex 15:55 조건 — 확정본 v1.3 §2와 같은 문구 · **검사기 `audit1d.js`(v1.11, Codex ⑥ 3차 잔여 2)는 파일 + wrapper 상태(wizard-1 `#state-w2` / wizard-2 `#state-w3`·`#state-w4` / wizard-3 `#state-w7`) + 선택자 `.c-cell b` + computed 10px을 wrapper 루프 안에서 함께 검사해야 제외한다** — `audit1c.js`는 파일명만 보았다)** ④', 'v1.11 예외 ③ 검사기')
t = rep(t, '제외는 예외 ②·③(파일·선택자·값 한정)과 `aria-hidden` 조상뿐 — `audit1c.js`; `audit1b.js`는 `.c-cell b`를 파일·값 무관하게 제외해 W7 9px을 놓쳤다)',
           '제외는 예외 ②·③(파일·**wrapper 상태**·선택자·값 한정)과 `aria-hidden` 조상뿐 — `audit1d.js`(v1.11); `audit1c.js`는 파일명만 보았고(Codex ⑥ 3차 잔여 2), `audit1b.js`는 `.c-cell b`를 파일·값 무관하게 제외해 W7 9px을 놓쳤다)', 'v1.11 완료 기준')
t = rep(t, "· `.c-cell b` 9→10)(N3). **이 밖은 반려.**",
           "· `.c-cell b` 9→10)(N3). **이 밖은 반려.**\n- **v1.11 추가 허용 hunk**: **없음**(1차 10파일 불변 = `스냅샷18차/1차` — 검사기·문구 정정만).", 'v1.11 §G')
out['03-1차-소급-지시서-v1.11.md'] = t

# ========== 2차 v2.10 → v2.11 ==========
t = rd('04-2차-지시서-v2.10.md')
t = rep(t, '# 2차 HTML 지시서 v2.10 — 화면별 최종 정리 (0-18c · 합의표 v1.3 반영 · v2.4+v2.5에 덧붙이는 증분 · 0-18d ③ 회신 F7·F8·F11·판정 ①③④ + R-9·R-10 + 0-18g ⑥ 1차 회신 Q2·Q3·충돌 4·6·7 + ⑤ 2차 자체 발견 S1 + **⑥ 2차 회신 N1·N2·N4 + 사용자 결정 R-12 반영**)',
           '# 2차 HTML 지시서 v2.11 — 화면별 최종 정리 (0-18c · 합의표 v1.3 반영 · v2.4+v2.5에 덧붙이는 증분 · 0-18d ③ 회신 F7·F8·F11·판정 ①③④ + R-9·R-10 + 0-18g ⑥ 1차 회신 Q2·Q3·충돌 4·6·7 + ⑤ 2차 자체 발견 S1 + ⑥ 2차 회신 N1·N2·N4 + 사용자 결정 R-12 + **⑥ 3차 회신 잔여 1(셸 S1~S6 `<main>` `aria-hidden` 제거) 반영**)', 'v2.11 제목')
t = rep(t, '> 작성: Fable 5 (디자인 담당) / 2026-09-06 · v2.7·v2.8·v2.9·**v2.10** 2026-09-07 · 상태: 🔓 **재검증 중 (v2.10 — 0-18g ⑥ 3차 판정 대기)**',
           '> 작성: Fable 5 (디자인 담당) / 2026-09-06 · v2.7·v2.8·v2.9·v2.10·**v2.11** 2026-09-07 · 상태: 🔓 **재검증 중 (v2.11 — 0-18i ⑥ 4차 판정 대기; v2.10 문서 규칙은 ⑥ 3차 AGREE)**', 'v2.11 상태')
t = rep(t, '> **이번 변경 근거(v2.10)**: 0-18g ⑥ 2차 회신 DISAGREE',
           '> **이번 변경 근거(v2.11)**: 0-18i ⑥ 3차 회신 DISAGREE(2026-09-07 17:12, ' + RX + ') — **잔여 1**: 2차 셸 데모 S1~S6의 `<main>`이 `aria-hidden="true"` 자리표시였는데 v2.10 N2가 그 `main`을 포커스 대상(`tabindex="-1"`)으로 만들어 숨김 속성과 충돌(ARIA in HTML §4.2 — focusable 요소는 `aria-hidden` 대상이 아님; Chromium이 Enter 뒤 「Blocked aria-hidden」 경고를 내며 보정) → **6곳의 `aria-hidden="true"`만 제거**(id·tabindex·내용·배치 불변, Codex 메모리 DOM 실측 x/y/폭/높이 동일). v2.10 → v2.11 diff = `04-2차-지시서-v2.10.md` ↔ 이 파일.\n> **이전 변경 근거(v2.10)**: 0-18g ⑥ 2차 회신 DISAGREE', 'v2.11 근거')
t = rep(t, '검사 = Tab→Enter→Tab 실제 키: Enter 뒤 activeElement = 그 상태 `main`, 다음 Tab = 본문 첫 조작 요소(nav 밖)**',
           '검사 = Tab→Enter→Tab 실제 키: Enter 뒤 activeElement = 그 상태 `main`, 다음 Tab = 본문 첫 조작 요소(nav 밖; `main`에 조작 요소가 없는 상태(S1~S6·R5)는 다음 요소로) · **대상 `main`은 `aria-hidden`이 아니어야 한다**(v2.11 — 셸 S1~S6 자리표시 `<main>`의 `aria-hidden="true"` 제거, Enter 뒤 콘솔 「Blocked aria-hidden」 경고 0)**', 'v2.11 B-4 낭독')
t = rep(t, '2차 script 변경 0. **헤더 없는 5파일 불변.** N4는 HTML 불변(문구만). 이 밖은 반려.',
           '2차 script 변경 0. **헤더 없는 5파일 불변.** N4는 HTML 불변(문구만). 이 밖은 반려.\n- **v2.11 추가 허용 hunk(0-18i ④ 4차, 출발점 = `스냅샷18차/`)**: `00-shell-1` S1~S3(`:526`·`:582`·`:642`) · `00-shell-2` S4~S6(`:528`·`:595`·`:663`) `<main class="page-content" id="main-content-s?" tabindex="-1">`의 **`aria-hidden="true"` 제거 6곳**(잔여 1). 그 밖 22파일 불변. 이 밖은 반려.', 'v2.11 §G')
t = rep(t, '1차 소급 지시서 **v1.10**(`03-1차-소급-지시서-v1.10.md`, 같은 규칙의 1차판)', '1차 소급 지시서 **v1.11**(`03-1차-소급-지시서-v1.11.md`, 같은 규칙의 1차판)', 'v2.11 정본 참조')
out['04-2차-지시서-v2.11.md'] = t

for n, t in out.items(): io.open(os.path.join(D, n), 'w', encoding='utf-8', newline='').write(t)
print('\n'.join(log)); print('쓴 파일 %d' % len(out))
for n in out: print(sha(n), os.path.getsize(os.path.join(D, n)), n)
