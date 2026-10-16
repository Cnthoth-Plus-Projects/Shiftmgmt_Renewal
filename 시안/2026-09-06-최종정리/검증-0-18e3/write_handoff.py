# -*- coding: utf-8 -*-
"""0-18i ⑥ 3차 HANDOFF(To: Codex) 작성 — 스냅샷18차 SHA·정본 SHA를 파일에서 읽어 박는다. 직전 HANDOFF(526779d5…)는 Log/20260907_160702_…_수신원본.md 로 보존됨(쓰기 전 SHA 재확인)."""
import io, os, hashlib, datetime, sys
ROOT = r"C:\Projects\Active\교대근무관리 시스템"
D = os.path.join(ROOT, r"시안\2026-09-06-최종정리")
S18 = os.path.join(ROOT, r"시안\2026-09-02-2차검토\스냅샷18차")
def sha(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()
cur = sha(os.path.join(ROOT, 'HANDOFF.md'))
assert cur == '526779d5e8fd48bb09646bc497f003b17e06d43334e7a24b93b2b629e992e65b', '직전 HANDOFF가 보존본과 다름: ' + cur
docs = ['03-1차-소급-지시서-v1.10.md', '04-2차-지시서-v2.10.md', '05-디자인-시스템-확정본-v1.3.md', '02-합의표-v1.3.md', '09-0-18e3-재수정-자체검토.md', '08-0-18g2-Codex회신-재검증.md']
H = {n: (sha(os.path.join(D, n)), os.path.getsize(os.path.join(D, n))) for n in docs}
s1 = io.open(os.path.join(S18, '1차', '_sha256.txt'), encoding='utf-8').read().strip()
s2 = io.open(os.path.join(S18, '2차', '_sha256.txt'), encoding='utf-8').read().strip()
now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
T = """# HANDOFF

- Task: ShiftMgmt 리뉴얼 — **0-18i ⑥ 품질 평가 3차 — ⑥ 2차 DISAGREE(N1~N4) 재수정 결과(④ 3차 Claude 대행 · ⑤ 3차 자체 검토 · 정본 v1.10/v2.10 + 확정본 v1.3·합의표 v1.3 동기화, 사용자 결정 R-12) 독립 검증 요청**
- Step: **⑥ 품질 평가 3차 (PROTOCOL §4.1 파이프라인)** — AGREE면 정본 4종 🔒 LOCK → 사용자 34파일 일괄 검수 → 0-13·0-14·0-17·0-18 ✅ / DISAGREE면 ④ 4차 재수정(Claude)
- From: **Claude**(오케스트레이터 · ④ 대행 · ⑤ 검토 — **겸직, 독립성 없음**) → **To: Codex**(교차검증자 — 유일한 독립 검증자)
- Time: %(now)s
- **회신: 필요** (항목별 PASS / FAIL(+재현) · 정본 4종 AGREE/DISAGREE · 판정 항목 2 · 종합)
- 직전 기록: ⑥ 2차 회신 DISAGREE(15:18, 수신원본 `Log/20260907_153225_0-18g-품질평가2차_codex-DISAGREE_수신원본.md` `216a877d…` 36,362 B) → 재현 전건(`08-0-18g2-Codex회신-재검증.md`, Codex 인용 오류 0) → 추가 확인 회신(15:55, DISAGREE 유지 · §3 계획 N1·N2·N4 동의 · N3 조건부, 수신원본 `Log/20260907_160702_0-18g-품질평가2차_codex-추가확인-DISAGREE유지_수신원본.md` `526779d5…` 39,230 B) → **사용자 결정 R-12 「허용 · ④ 3차 바로 착수」(16:12)** → ④ 3차(16:12~16:25) → ⑤ 3차(16:25~16:45) → 이 HANDOFF

---

# 📌 회신 요청 — 반드시 읽어 주세요

**누가**: Codex
**어디에**: 이 파일 맨 아래 `## 회신` 칸(§7 양식)
**무엇을**: ① **N1·N2·N3 재수정**이 v1.10·v2.10 완료 기준을 충족하는가 — 정적(스냅샷17차↔18차 diff · §G 허용 hunk) + 브라우저 실측(**접근성 트리 실제 name** 29파일 + P6 초기·단건·파일·재열기 4시점 · **Tab→Enter→Tab 실제 키** 71상태 · **W7 닫기 3경로** 뒤 노출 글자) ② **N4** = HTML 불변 + v2.10 §C ②-1 문구 한정이 귀 회신 §4 대안과 일치하는가 ③ **정본 4종**(v1.10 · v2.10 · 확정본 v1.3 · 합의표 v1.3) AGREE/DISAGREE + **판정 항목 2**(§4) ④ 종합: **사용자 34파일 일괄 검수로 넘겨도 되는가.**
**회신이 없으면**: 사용자 검수에 들어갈 수 없다.
**전달·수행 규칙**(PROTOCOL §2-3): 사용자가 직접 전달한다. Codex는 평가·제안만 하고 34파일·정본·`TODO.md`를 수정하지 않는다. 수신본을 `Log/`에 보존하고 64자 SHA를 회신에 적는다. 재현 근거는 원본 HTML·정본 줄 번호·도구·시각. **HTML 줄 번호는 스냅샷17차 = 스냅샷18차 동일**(이번 변경은 전부 줄 안 속성·`:1` 값 치환이라 줄 수 불변 — `_전후.txt`).

> **배경 한 줄**: ⑥ 2차 N1~N4는 전부 사실이었고 N1·N2는 내 지시 결함(v1.9 :77·:72), N3는 예외 ⑤ 전제 오류 + 검사기 결함, N4는 문구 범위 결함이었다. 귀 최소 대안대로 고쳤다(N1 링크 `aria-label` · N2 `<main>` id+`tabindex="-1"` · N3 W7 = W2 값 + `b` 10px 예외를 `#state-w7`로 한정 · N4 문구). 귀 §5 요구대로 🔒 확정본·합의표도 v1.3으로 동기화했다(사용자 결정 R-12). 귀 §6 요구(AX name · Enter 뒤 Tab 순서 · 상태 전이 후 검사 · 공통 영역 차이율 표기)를 ⑤에 넣었다. 자체 검토 전문: `시안/2026-09-06-최종정리/09-0-18e3-재수정-자체검토.md`.

---

## 0. 정본 SHA-256 (마지막 저장 뒤 계산)

| 정본 | 상태 | SHA-256 | 바이트 |
|---|---|---|---|
| `03-1차-소급-지시서-v1.10.md` | 🔓 재검증 중(이번 판정) | `%(v110)s` | %(v110b)s |
| `04-2차-지시서-v2.10.md` | 🔓 재검증 중(이번 판정) | `%(v210)s` | %(v210b)s |
| `05-디자인-시스템-확정본-v1.3.md` | 🔓 재검증 중(이번 판정 · R-12) | `%(ds)s` | %(dsb)s |
| `02-합의표-v1.3.md` | 🔓 재검증 중(이번 판정 · R-12) | `%(ag)s` | %(agb)s |
| `09-0-18e3-재수정-자체검토.md` | ⑤ 3차 자체 검토(겸직) | `%(r9)s` | %(r9b)s |
| `08-0-18g2-Codex회신-재검증.md` | ⑥ 2차 회신 재현(귀 15:55 확인 `a4c8d531…` 뒤 §3 N3·§4 갱신) | `%(r8)s` | %(r8b)s |
| `11-디자인-요청서.md` v1.9b · `12-능력-매트릭스.md` v1.5 · `10` v0.8 · `09` | 🔒(불변) | `b683dc2c…` · `aaf40e35…` · `df99af07…` · `87d0b724…` | 93,598 · 77,752 · 38,129 · 8,537 |

옛 판본은 폴더에 그대로: `diff` 짝 `-v1.9.md`↔`-v1.10.md` · `-v2.9.md`↔`-v2.10.md` · `확정본-v1.2.md`↔`-v1.3.md` · `합의표-v1.2.md`↔`-v1.3.md`(v1.2 두 문서의 🔒 SHA `cd0debd0…`·`fe9225c1…`는 불변). 정정 = `검증-0-18e3/amend-v1.10-v2.10.py`(치환 37 전건 기대 1회 일치).

## 1. 출발점 · 결과본 · 전/후

| 항목 | 값 |
|---|---|
| 출발점 | `시안/2026-09-02-2차검토/스냅샷17차/{1차,2차}/`(⑥ 2차가 검증한 결과본 — `fix-0-18e3.py` 선행 검사 34/34 SHA 일치) |
| 결과본 | `시안/2026-08-31-1차HTML/` 10 · `시안/2026-09-02-2차HTML/` 24 — 제자리 수정 · 새 파일 0 · 2차 script 변경 0 |
| 결과 스냅샷 | **`시안/2026-09-02-2차검토/스냅샷18차/{1차,2차}/` + `_sha256.txt`**(결과본과 `cmp` 34/34 동일) |
| 17차 → 18차 | **변경 29 · 불변 5**(`01-login-1/2`·`02-common-1/2/3`). 파일별 바이트·hunk·SHA = `검증-0-18e3/_전후.txt` · `diff -U0` + 줄 전수 = 4종(`aria-label` · skip `href` · `<main id tabindex>` · wizard-3 `:1`)뿐 · wizard-3 `:1`은 `}` 단위 diff로 규칙 4개만 |
| 수정 방식 | `검증-0-18e3/fix-0-18e3.py` — 치환마다 기대 횟수, 불일치면 아무 파일도 안 씀: 배지 링크 `aria-label` **65**(1차 19 · 2차 45 · S3 접힘 점 배지 1) · skip-link `href` **71** + `<main>` `id`·`tabindex="-1"` **71** · P6 JS 2줄 · wizard-3 규칙 4 — 전건 일치 |

**결과본 SHA-256 34행(`sha256sum` 원문 = `스냅샷18차/*/_sha256.txt`)**

```
%(s1)s
%(s2)s
```

## 2. N1~N4 처리 (원인 → 수정 → ⑤ 실측; 상세 `09` §2·§2-1)

| # | 수정(줄 번호 = 17차 = 18차) | ⑤ 실측(원문 `검증-0-18e3/_e3_scenario.log` · 판정 `analyze_e3.py`) |
|---|---|---|
| **N1** | 배지를 품은 메뉴 링크 `<a class="nav-item" … aria-label="실적 관리, 승인 대기 실적 N건">`(28파일 65링크, `title` 툴팁 유지 — 귀 부모 링크 방식). P6 `setPending`·`restoreFileModal`(`08-performance-3.html:271`·`:360`)에서 부모 링크 `aria-label` 동시 갱신 | `browse accessibility` 29파일: 노출 사이드바 link **70** = 「실적 관리, 승인 대기 실적 128건」 61 · 「…140건」 2(H2·H3) · 「실적 관리」 7(배지 없는 사이드바 home-2 2·wizard-4 1·perf-4 2, 수정 전과 동일) — **배지 있는 링크에 건수 없는 이름 0**. **P6 4시점** 초기 128 → 단건 127 → 파일 77 → 재열기 복원 128: 각 시점 AX name = `aria-label` = `title` 숫자 = 배지 숫자 · ☰ 접힘 뒤 name 유지 |
| **N2** | skip-link `href="#main-content-<상태>"` → 그 상태 `<main class="page-content" id="main-content-<상태>" tabindex="-1">`(71). `.app-body` `main-state-*` id 보존 | **71상태 각각 실제 키**(링크 `focus()` → `press Enter` → `press Tab`): Enter 뒤 activeElement = `MAIN#main-content-<상태>` **71/71** · 다음 Tab이 nav 안 **0/71** · Tab이 그 `main` 안 조작 요소 **63** · 나머지 8 = `main` 안 조작 요소 0인 상태(`n2_focusable.sh`: 2차 셸 데모 S1~S6 = `<main aria-hidden>` 자리표시 6 · R5 이력 목록 1 → 다음 요소(다음 상태 skip-link·상태줄 버튼) · W7 1 = 모달 트랩 [계속 편집]). 캡처 `cap-skiplink-enter-tab-03-home-1.png` |
| **N3** | `05-sites-wizard-3.html:1` W7 달력 = W2(wizard-1) 규칙: `.c-grid` 9→12 · `.c-head` padding 1→2 · `.c-cell` 8→12(padding 2·min-height 26) · `.c-cell b` 9→**10**(예외 ③을 **`#state-w7 .c-cell b` 10px**로 한정 확대 — 귀 15:55 조건: v1.10 :53 · 확정본 v1.3 §2 · `audit1c.js` 제외 조건 같은 문구) | 닫기 3경로(Esc · [계속 편집] · [변경 버리고 나가기]) 각각 새로 열어 실행: dialog `none` · `#main-state-w7` `aria-hidden` 제거 · **노출 직접 텍스트 12px 미만 0** · `b` 10px 예외 7 · `b` 위반 0 · 셀 12/10 높이 39 = W2 39 · 요일 12 높이 22 = W2 22 · `main` 1220/1220 · 넘침 요소 0. 같은 검사기 `audit1c.js`로 **17차 = 배경 21 → 18차 0**. 캡처 `cap-w7-after-esc.png` · 달력 전/후 `cap-w7-calendar-17차-vs-now.png` |
| **N4** | **HTML 불변.** v2.10 §C ②-1: 「패널 안 시급(`:835`)/하단(`:864~867`) 사유 = 별도 줄」 + 「상단 도구 막대 `#btn-e2-new-e9` 사유 같은 줄 허용(139.2×32 = 원본)」 | `06-employees-1` 17차↔18차 hunk = N1 3 + N2 3뿐 · E9 배치·닫기·잠금 = 0-18e2와 전건 동일(§3 회귀) |

## 3. ⑤ 3차 실측 요약 (전문 `09` §3·§5·§6)

- **12px 미만(`audit1c.js`, 예외를 파일·선택자·값으로 한정)** 10파일 25상태: 노출 0 · 배경 0(17차 W7 21 → 0) · 표 전 행 40/32 위반 0(예외 ④ 제외) · skip 대상 25/25 `MAIN/tabindex=-1` · 배지 링크 `aria-label` = 숫자 25/25 · 문법 오류·잡텍스트 0.
- **기준본(17차)↔결과본 구조 대조** `snapdiff.js` 88 wrapper: 보이는 글자 +0/−0 · 높이·요소 수·넘침·표·카드 **전부 동일**(상세 줄 0). **픽셀(공통 영역 차이율)**: 32파일 0.00%% · `05-sites-wizard-3` 0.01%%(블록 18 = 딤 아래 W7 달력 확대) · `02-common-3` 0.01%%(블록 2 = 회전 스피너 각도, 파일은 17차와 바이트 동일).
- **회귀(0-18e2 로그 대조)**: `p6_scenario` 시각 외 차이 0 · `v2_interact` 차이 1줄(O1 토스트 읽기 null → 3회 재실행 즉시/+0.3s 6/6 표시·+1.8s 소멸, 17차 원본도 동일 = 1.5s 토스트 읽기 시각 편차) · `audit2` 24파일 차이 0 · 아이콘 985 누출 0 · `e2_scenario3` Q6 접힘 왕복 72/72 · E9 배치 동일·닫기 3/3 · 34파일 id/aria/문법/잡텍스트 0 · **콘솔 오류 34/34 없음**(`_console.log` 직접 재실측).

## 4. 판정 항목 2

1. **2차 셸 데모 S1~S6의 `<main>`이 원래 `aria-hidden="true"` 자리표시**(2차 승인본 그대로, 글자·조작 요소 0) — skip-link Enter 뒤 포커스는 `main`으로 가지만 낭독 대상이 없다. 셸 전용 데모 상태라 그대로 두었다. 타당한가(대안: 이 6상태 `main`의 `aria-hidden` 제거 — 승인본 배치 변경).
2. **`b` 10px 예외의 `#state-w7` 한정 확대** — v1.10 :53 · 확정본 v1.3 §2 · 합의표 v1.3 B-1 · `audit1c.js:19~20`이 같은 파일·선택자·값 문구. 요일·날짜는 12. 타당한가.

## 5. 제약 (PROTOCOL §6)

- Codex는 평가·제안만. 34파일·정본·`TODO.md` 수정 금지. 회신은 `## 회신` 칸에만. 수신본 보존 `Log/YYYYMMDD_HHMMSS_0-18i-품질평가3차_원본.md` + 64자 SHA.
- 이관 코드 수정 금지 · 새 능력·채널 없음(`aria-label`·`id`·`tabindex`·CSS 값뿐, 2차 script 변경 0, 1차 JS 변경 = P6 2줄) · `auth:sign-out` 미호출.
- 재현 도구 전부 `시안/2026-09-06-최종정리/검증-0-18e3/`(재실행 가능) · 0-18e/0-18e2 도구 그대로.

## 6. 회신 양식

```
판정: AGREE / DISAGREE   ("사용자 34파일 일괄 검수로 넘겨도 되는가")
수신본: Log/... · SHA-256(64자) · 바이트
검증 방식: 정적(17차↔18차 diff·허용 hunk) / 브라우저 실측(도구·시각·뷰포트)
1. 17차↔18차 SHA 34+34 · 변경 29/불변 5 · 허용 hunk 밖 변경(있으면 파일·줄)
2. N1(AX name 29파일 + P6 4시점) · N2(Tab→Enter→Tab 71) · N3(W7 닫기 3경로) 각각 PASS / FAIL(+재현 값) · N4 문구
3. 정본 4종(v1.10·v2.10·확정본 v1.3·합의표 v1.3) — AGREE / DISAGREE(항목·대안) · 판정 항목 ①②
4. ⑤ 방법(AX name·실제 키 순서·상태 전이 후·공통 영역 차이율) — 충족 / 미충족(+요구)
5. 추가 발견 (파일·줄·실측값·제안)
```

## 회신

""" % dict(now=now, v110=H[docs[0]][0], v110b=format(H[docs[0]][1], ','), v210=H[docs[1]][0], v210b=format(H[docs[1]][1], ','),
           ds=H[docs[2]][0], dsb=format(H[docs[2]][1], ','), ag=H[docs[3]][0], agb=format(H[docs[3]][1], ','),
           r9=H[docs[4]][0], r9b=format(H[docs[4]][1], ','), r8=H[docs[5]][0], r8b=format(H[docs[5]][1], ','), s1=s1, s2=s2)
io.open(os.path.join(ROOT, 'HANDOFF.md'), 'w', encoding='utf-8', newline='\n').write(T)
ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
dst = os.path.join(ROOT, 'Log', ts + '_0-18i-품질평가3차_발송본.md')
open(dst, 'wb').write(T.encode('utf-8'))
print('HANDOFF', sha(os.path.join(ROOT, 'HANDOFF.md')), len(T.encode('utf-8')), 'B')
print('발송본', dst, sha(dst), os.path.getsize(dst))
