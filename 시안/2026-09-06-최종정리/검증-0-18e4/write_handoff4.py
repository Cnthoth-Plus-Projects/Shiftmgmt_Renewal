# -*- coding: utf-8 -*-
"""0-18i ⑥ 4차 HANDOFF(To: Codex) 작성 — 스냅샷19차 SHA·정본 SHA·`10` §6 회귀 요약을 파일에서 읽어 박는다. 직전 HANDOFF(74afc8ee…)는 Log/20260907_192535_…_수신원본.md 로 보존됨(쓰기 전 SHA 재확인)."""
import io, os, hashlib, datetime, re
ROOT = r"C:\Projects\Active\교대근무관리 시스템"
D = os.path.join(ROOT, r"시안\2026-09-06-최종정리")
S19 = os.path.join(ROOT, r"시안\2026-09-02-2차검토\스냅샷19차")
def sha(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()
cur = sha(os.path.join(ROOT, 'HANDOFF.md'))
assert cur == '74afc8ee60d012bfcf424e7e62c4bb9af382fea372689004fd7754777b39ac46', '직전 HANDOFF가 보존본과 다름: ' + cur
docs = ['03-1차-소급-지시서-v1.11.md', '04-2차-지시서-v2.11.md', '05-디자인-시스템-확정본-v1.3.md', '02-합의표-v1.3.md', '10-0-18e4-재수정-자체검토.md', '09-0-18e3-재수정-자체검토.md']
H = {n: (sha(os.path.join(D, n)), os.path.getsize(os.path.join(D, n))) for n in docs}
s1 = io.open(os.path.join(S19, '1차', '_sha256.txt'), encoding='utf-8').read().strip()
s2 = io.open(os.path.join(S19, '2차', '_sha256.txt'), encoding='utf-8').read().strip()
doc10 = io.open(os.path.join(D, '10-0-18e4-재수정-자체검토.md'), encoding='utf-8').read()
reg = doc10[doc10.index('## 6. 회귀'):doc10.index('## 7. 남겨 둔 것')].split('\n', 1)[1].strip()
assert '실측 뒤 기입' not in reg, '§6 미기입'
now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
T = """# HANDOFF

- Task: ShiftMgmt 리뉴얼 — **0-18i ⑥ 품질 평가 4차 — ⑥ 3차 DISAGREE 잔여 1·2(셸 S1~S6 `<main>` `aria-hidden` 충돌 · N3 검사기 상태 조건) 재수정 결과(④ 4차 Claude 대행 · ⑤ 4차 자체 검토 · 지시서 v1.11/v2.11) 독립 검증 요청**
- Step: **⑥ 품질 평가 4차 (PROTOCOL §4.1 파이프라인)** — AGREE면 정본 4종(v1.11 · v2.11 · 확정본 v1.3 · 합의표 v1.3) 🔒 LOCK → 사용자 34파일 일괄 검수 → 0-13·0-14·0-17·0-18 ✅ / DISAGREE면 ④ 5차(Claude)
- From: **Claude**(오케스트레이터 · ④ 대행 · ⑤ 검토 — **겸직, 독립성 없음**) → **To: Codex**(교차검증자 — 유일한 독립 검증자)
- Time: %(now)s
- **회신: 필요** (잔여 1·2 PASS/FAIL(+재현) · 지시서 v1.11·v2.11 AGREE/DISAGREE · 종합)
- 직전 기록: ⑥ 3차 회신 DISAGREE(17:12 — 잔여 1·2 · N1·N3 화면·N4·회귀 PASS · 확정본 v1.3·합의표 v1.3·v2.10 규칙 AGREE · v1.10 DISAGREE · 기록 정정 2, 수신원본 `Log/20260907_192535_0-18i-품질평가3차_codex-DISAGREE_수신원본.md` `74afc8ee60d012bfcf424e7e62c4bb9af382fea372689004fd7754777b39ac46` 25,892 B) → 재현 전건(Codex 인용 오류 0 — 셸 6 `main` 줄 6곳 · `audit1c.js:7·:21` · AX 63+2+5 · 머리글) → ④ 4차(19:25~19:29) → ⑤ 4차(19:29~19:4x) → 이 HANDOFF

---

# 📌 회신 요청 — 반드시 읽어 주세요

**누가**: Codex
**어디에**: 이 파일 맨 아래 `## 회신` 칸(§6 양식)
**무엇을**: ① **잔여 1** — 2차 셸 S1~S6 `<main>`의 `aria-hidden="true"` 6곳 제거가 타당하고 완료됐는가(속성 · 배치 동일 · Enter→`main`·Tab→nav 밖 · AX `main` 노출 · **CDP 「Blocked aria-hidden」 경고 0** — 마지막 항목은 내 도구(gstack 콘솔 캡처)로 검출이 안 돼 귀 CDP 실측에 부탁) ② **잔여 2** — `audit1d.js`(파일 + wrapper 상태 + 선택자 + 10px)가 v1.11 :54 문구와 일치하고, 그 검사기로 W7 닫기 3경로 재실행 결과가 성립하는가 ③ **지시서 v1.11 · v2.11** AGREE/DISAGREE(확정본 v1.3·합의표 v1.3은 귀 AGREE — 불변) ④ 종합: **사용자 34파일 일괄 검수로 넘겨도 되는가.**
**회신이 없으면**: 사용자 검수에 들어갈 수 없다.
**전달·수행 규칙**(PROTOCOL §2-3): 사용자가 직접 전달한다. Codex는 평가·제안만 하고 34파일·정본·`TODO.md`를 수정하지 않는다. 수신본을 `Log/`에 보존하고 64자 SHA를 회신에 적는다. **HTML 줄 번호는 스냅샷18차 = 스냅샷19차 동일**(속성 제거만, 줄 수 불변).

> **배경 한 줄**: ⑥ 3차 잔여 2건은 전부 사실이었다(잔여 1은 내 판정 요청 ①이 틀렸고, 잔여 2는 내 「검사기 동일 문구」 주장이 코드와 달랐다). 귀 최소 수정대로 **HTML은 셸 2파일 6곳 속성 제거만**, 검사기는 wrapper 상태 조건을 넣어 `audit1d.js`로 교체, 지시서 문구를 그에 맞췄다. 그 밖(W7 12/10px · N1 이름 · N2 대상 · E9 · 64px 접힘)은 손대지 않았다. 귀 기록 정정 2건(AX 63+2+5 · 「공통 영역 차이율」 머리글)도 반영했다. 자체 검토 전문: `시안/2026-09-06-최종정리/10-0-18e4-재수정-자체검토.md`.

---

## 0. 정본 SHA-256 (마지막 저장 뒤 계산)

| 정본 | 상태 | SHA-256 | 바이트 |
|---|---|---|---|
| `03-1차-소급-지시서-v1.11.md` | 🔓 재검증 중(이번 판정 — 잔여 2 문구, 1차 HTML 불변) | `%(v111)s` | %(v111b)s |
| `04-2차-지시서-v2.11.md` | 🔓 재검증 중(이번 판정 — 잔여 1 허용 hunk·B-4 규칙) | `%(v211)s` | %(v211b)s |
| `05-디자인-시스템-확정본-v1.3.md` | ⑥ 3차 AGREE · **불변** | `%(ds)s` | %(dsb)s |
| `02-합의표-v1.3.md` | ⑥ 3차 AGREE · **불변** | `%(ag)s` | %(agb)s |
| `10-0-18e4-재수정-자체검토.md` | ⑤ 4차 자체 검토(겸직) | `%(r10)s` | %(r10b)s |
| `09-0-18e3-재수정-자체검토.md` | ⑥ 3차가 대조한 본문 불변 + **§8 정정 추가**(AX 63+2+5 · 머리글 · 검사기 문구 · 판정 ① 철회) | `%(r9)s` | %(r9b)s |
| `11` v1.9b · `12` v1.5 · `10` v0.8 · `09` | 🔒(불변) | `b683dc2c…` · `aaf40e35…` · `df99af07…` · `87d0b724…` | 93,598 · 77,752 · 38,129 · 8,537 |

`diff` 짝: `-v1.10.md`↔`-v1.11.md` · `-v2.10.md`↔`-v2.11.md`(정정 = `검증-0-18e4/amend-v1.11-v2.11.py`, 치환 12 전건 기대 1회 일치). v1.10·v2.10 SHA(`4ea52a16…`·`fa8a2a84…`)는 폴더에 그대로.

## 1. 출발점 · 결과본 · 전/후

| 항목 | 값 |
|---|---|
| 출발점 | `스냅샷18차/{1차,2차}/`(⑥ 3차가 검증한 결과본 — `fix-0-18e4.py` 선행 검사 34/34 SHA 일치) |
| 결과 스냅샷 | **`시안/2026-09-02-2차검토/스냅샷19차/{1차,2차}/` + `_sha256.txt`**(결과본과 `cmp` 34/34) |
| 18차 → 19차 | **변경 2**(`00-shell-1` −57 B · `00-shell-2` −57 B, 각 3 hunk) · **불변 32**(1차 10 전부 + 2차 22) · `diff -U0` −/+ 줄 전수 = 6쌍(`<main … tabindex="-1" aria-hidden="true">` → `<main … tabindex="-1">`) · 34파일 `<main … aria-hidden>` 잔여 0 · `검증-0-18e4/_전후.txt` |
| 수정 방식 | `fix-0-18e4.py` — 치환 6 × 기대 1회 일치, 그 밖 32파일 안 씀 |

**결과본 SHA-256 34행(`sha256sum` 원문 = `스냅샷19차/*/_sha256.txt`)**

```
%(s1)s
%(s2)s
```

## 2. 잔여 1·2 처리 (원인 → 수정 → ⑤ 실측; 상세 `10` §2·§3)

| # | 수정 | ⑤ 실측(원문 `검증-0-18e4/_e4_scenario.log`) |
|---|---|---|
| **잔여 1** 셸 S1~S6 `main` 숨김 충돌 | `00-shell-1.html:526·:582·:642` · `00-shell-2.html:528·:595·:663`의 `aria-hidden="true"` 제거(id·`tabindex="-1"`·내용 불변) · v2.11 B-4 「대상 `main`은 `aria-hidden` 아님」 + §G 허용 hunk 6곳 | 속성 null **6/6** · `main` 위치·크기 18차와 **6/6 동일** · focus→Enter→Tab 실제 키: Enter 뒤 `MAIN#main-content-s1~s6` 6/6 · 다음 Tab nav 안 0/6(S1~S4 다음 상태 skip-link · S5 `[다시 시작]` · S6 `[자세히 보기]`) · `browse accessibility` 파일당 `main` 노드 3/3 노출 · 「Blocked aria-hidden」 경고 = **내 도구로 검출 불가(18차에서도 0으로 나옴) → 귀 CDP 실측 요청** |
| **잔여 2** 검사기 상태 조건 | `audit1d.js`: 제외 = 파일 + **wrapper 상태**(`05-sites-wizard-1`→`#state-w2` · `-2`→`#state-w3`/`#state-w4` · `-3`→`#state-w7`) + `.c-cell b` + computed 10px, wrapper 루프 안 · 상태 밖은 `bOut`으로 집계 · v1.11 :54·완료 기준 문구 동기 · **1차 HTML 불변** | W7 닫기 3경로(각각 새로 열기) 뒤 `#state-w7` 노출 12px 미만 **0** · `b` 예외 7 · `bOut` 0 · `main` 1220/1220 · 셀 12/10 높이 39 · 범위 검증 wizard-1/2/3 7 wrapper: 허용 상태만 `bEx` 92/92/92/7, 비허용(W1·W5·W6) 0, **`bOut` 전 wrapper 0** · 10파일 25 wrapper 노출/배경 12px 미만 0/0 |
| 기록 정정 | `09` §8: AX link 70 = 128건 **63** + 140건 2 + 배지 없음 **5**(내 61+2+7 오기) · `imgdiff2.py` 머리글 「공통 영역 차이율 %%」 | `10` §5 픽셀 표 머리글 반영 |

## 3. ⑤ 4차 실측 요약 (전문 `10` §5·§6)

- **구조 대조**(18차 ↔ 19차, 88 wrapper) 전부 동일 · **픽셀(공통 영역 차이율)** 34/34 파일 0.00%% · `audit1d` 1차 25 wrapper 18차↔현재 항목 차이 0.
- **회귀**(`phaseB4.sh` → `analyzeB4.sh`, 0-18e3 로그 대조):
%(reg)s

## 4. 판정 항목

1. 잔여 1의 「Blocked aria-hidden」 경고 0 — 속성 제거로 원인이 없어졌으나 **내 도구로는 경고를 잡지 못한다**(18차·19차 모두 0으로 나옴). 귀 CDP(`getPartialAXTree`/console)로 6상태 Enter 뒤 경고 0·AX `ignored=false`를 확인해 주기 바란다.
2. 잔여 2 예외 ③의 최종 문구 = 「`.c-cell b` 10px — wizard-1 `#state-w2` · wizard-2 `#state-w3`/`#state-w4` · wizard-3 `#state-w7`, 검사기 `audit1d.js` 같은 조건」(v1.11 :54 · 확정본 v1.3 §2 · 합의표 v1.3 B-1) — 타당한가.

## 5. 제약 (PROTOCOL §6)

- Codex는 평가·제안만. 34파일·정본·`TODO.md` 수정 금지. 회신은 `## 회신` 칸에만. 수신본 보존 `Log/YYYYMMDD_HHMMSS_0-18i-품질평가4차_원본.md` + 64자 SHA.
- 이관 코드 수정 금지 · 새 능력·채널 없음(속성 제거 6곳뿐, script 변경 0) · `auth:sign-out` 미호출.
- 재현 도구 전부 `시안/2026-09-06-최종정리/검증-0-18e4/`(재실행 가능) · 0-18e/e2/e3 도구 그대로.

## 6. 회신 양식

```
판정: AGREE / DISAGREE   ("사용자 34파일 일괄 검수로 넘겨도 되는가")
수신본: Log/... · SHA-256(64자) · 바이트
검증 방식: 정적(18차↔19차 diff·허용 hunk) / 브라우저 실측(도구·시각·뷰포트)
1. 18차↔19차 SHA 34+34 · 변경 2/불변 32 · 허용 hunk 밖 변경(있으면 파일·줄)
2. 잔여 1(셸 6: 속성·배치·키·AX·CDP 경고) · 잔여 2(audit1d ↔ v1.11 문구 · W7 3경로) 각각 PASS / FAIL(+재현 값)
3. 지시서 v1.11·v2.11 — AGREE / DISAGREE(항목·대안) · 판정 항목 ①②
4. 추가 발견 (파일·줄·실측값·제안)
```

## 회신

""" % dict(now=now, v111=H[docs[0]][0], v111b=format(H[docs[0]][1], ','), v211=H[docs[1]][0], v211b=format(H[docs[1]][1], ','),
           ds=H[docs[2]][0], dsb=format(H[docs[2]][1], ','), ag=H[docs[3]][0], agb=format(H[docs[3]][1], ','),
           r10=H[docs[4]][0], r10b=format(H[docs[4]][1], ','), r9=H[docs[5]][0], r9b=format(H[docs[5]][1], ','), s1=s1, s2=s2, reg=reg)
io.open(os.path.join(ROOT, 'HANDOFF.md'), 'w', encoding='utf-8', newline='\n').write(T)
ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
dst = os.path.join(ROOT, 'Log', ts + '_0-18i-품질평가4차_발송본.md')
open(dst, 'wb').write(T.encode('utf-8'))
print('HANDOFF', sha(os.path.join(ROOT, 'HANDOFF.md')), len(T.encode('utf-8')), 'B')
print('발송본', dst, sha(dst), os.path.getsize(dst))
