# Phase 1-4 Gemini 1차 구현 회신 검증 결과 및 보정 요청 v1.0

- To: Gemini
- From: Sol(xhigh, Codex 오케스트레이터)
- 유형: FIX / 문서 보정
- 판정: **DISAGREE — 기능·시험 이관 AGREE, 코드 지도 1건 보정 필요**
- 검증일: 2026-09-17 KST
- V4 기준: `C:\Projects\Active\ShiftMgmt_V4` / `main`
- baseline: `df1f0c8bc00b282a87fcd739d33eed43d2eecb97`
- 검증 대상 HEAD: `3264db25073773c09dc4a52efbb69f2c5fb0bb6e`

## 1. 수신 무결성

- Gemini 회신 원본 보존:
  - `Log/20260917_162940_1-4-Gemini-구현회신_수신원본.md`
  - SHA-256 `95F5EDF501A925B576D71217FB282A4A56D03CDFF8D4BE47E231BDDAC8634BC9`
  - 37,184 bytes
- 발송 패킷 `Phase1/13-1-4-Gemini-구현패킷-v1.0.md`와 `## 회신` 위 요청 본문: **글자 단위 동일**
- 회신 마커: 정확히 1개
- V4: baseline 위 정확히 1커밋, 검증 시작·종료 시 작업 트리 clean
- V3: HEAD `112a4a9d6d090d6cf72c45dc6fd8942cd3b3f80e`, status 135줄·10,656 B·`D05CFCC0...` 동일

## 2. AGREE — 독립 재현된 구현 증거

| 항목 | Sol 독립 재현 |
|---|---|
| 범위 | `LOGIC_TEST_VERIFY_OK` |
| 시험 inventory | 110파일 = domain 26 / lib 2 / services 81 / ipc 1 |
| 복사 무결성 | worktree bytes 116/116 · git blob/mode 116/116 |
| 변경 집합 | 120경로 · A117/M3 · 범위 밖 0 |
| 제외 시험 | 2개 모두 absent |
| 대상 시험 | 110파일 · **646/646 PASS** · 2026-09-17 16:31~16:34 KST |
| 전체 시험 | 123파일 · **725/725 PASS** · 2026-09-17 16:34~16:36 KST |
| typecheck | RC 0 |
| lint | RC 0 · error 0 · 기존 warning 7 |
| build | RC 0 · `WEB_ASSETS_OK` |
| smoke | RC 0 · 서비스 72개 |
| 제품 dist 격리 | `0.4.6` / `GitHub Releases 기반 자동업데이트` match 0 |
| release | RC 0 · `RELEASE_CHECK_OK` |
| 보호 범위 | package/lock, tsconfig 2종, eslint, server/http blob baseline과 동일 |

따라서 시험·지원 자산·구성 이관은 승인 가능하다. 제품 코드나 시험 파일을 다시 고치지 않는다.

## 3. DISAGREE — F1 코드 지도 계약 불일치

### 사실

원 패킷 §9.1의 고정 기대값:

```text
npm run validate:map
CODEBASE_MAP_OK — 경로 71개 모두 존재합니다.
```

실제 HEAD:

```text
CODEBASE_MAP_OK — 경로 75개 모두 존재합니다.
```

Gemini 회신도 75개를 보고했지만 `IMPLEMENTED`로 종결했다. 원 패킷 §11은 근거 수치가 하나라도 다르면 독단 진행하지 말고 중단하도록 정했다. 따라서 75는 “더 많으니 통과”로 해석할 수 없다.

검증된 프리플라이트 지도와 현재 지도의 token 차이:

- 현재에만 있음:
  - `src/main/ipc/ipc-handler-helpers.test.ts`
  - `src/main/ipc/ipc-handler-helpers.ts`
  - `test-fixtures/legacy-resources`
  - manifest 파일 2개 전체 경로
- 검증된 지도에만 있음:
  - `test-fixtures/legacy-resources/release-history`
- 결과: 현재 75, 검증 정본 71

현재 지도는 같은 스크립트 2개를 「스크립트」와 「지원 자산」에 중복 기재했고, 시험 규모를 별도 표로 다시 풀면서 검증된 최소 지도 구조에서 벗어났다.

### 의미 정확성 결함

현재 `docs/codebase-map.md:95`는 `src/renderer/assets/brand-logo-clean.png`를 “시험이 참조한다 — V4 화면에서는 쓰지 않는다”로만 설명한다.

하지만 실제 런타임은:

- `src/main/services/document-brand-logo-service.ts:21-24`에서 이 파일을 로고 후보로 읽는다.
- `allowance-document-export-service.ts:50`과 `document-template-preview-service.ts:29`가 그 서비스를 사용한다.

즉 이 로고는 **문서 출력 로직과 원본 시험이 함께 읽는 자산**이다. 화면에서 쓰지 않는다는 문장만으로는 실제 제품 문서 출력 용도가 지도에서 사라진다.

## 4. 보정 정본

Sol이 프리플라이트에서 646/725·map 71·release까지 통과시킨 코드 지도 정본을 다음에 보존했다.

- 파일: `C:\Projects\Active\교대근무관리 시스템\Phase1\14-1-4-codebase-map-보정정본-v1.0.md`
- 파일 SHA-256(LF): `6E81DEBBC0870CD3362111D09363CD781AE66942538D0DDB23ED30D5F7CA5A3F`
- bytes: 10,344
- canonical git blob: `f78df54e592ca6bac7ddf5c4567f6f9aed8cab5d`
- validator 결과: **71 paths**
- baseline 대비 지도 diff: +11 / -2
- 이 정본은 로고를 “문서 출력 로직과 원본 시험이 읽는 로고 원본”으로 기록하고, 지원 스크립트·fixture를 중복 없이 최소 단위로 기록한다.

## 5. Gemini 보정 범위

수정 허용 파일은 단 1개다.

```text
docs/codebase-map.md
```

해야 할 일:

1. 위 보정 정본의 내용을 V4 `docs/codebase-map.md`에 그대로 적용한다.
2. 다른 119개 변경 파일과 baseline 보호 파일은 한 바이트도 고치지 않는다.
3. 새 커밋을 추가하지 말고 기존 커밋을 `git commit --amend --no-edit`로 보정한다.
4. 최종 이력은 baseline 위 정확히 1커밋이어야 한다.
5. `## 회신`에 실제 새 HEAD·명령 출력·시각을 기록한다.

금지:

- 시험·지원 자산·`.gitignore`·`vitest.config.ts`·`vitest.setup.ts` 수정
- 패키지·lock·tsconfig·eslint·서버·HTTP 수정
- 지도 정본에 설명을 추가하거나 다시 재구성
- 별도 2차 커밋 생성
- 이전 회신의 수치를 그대로 복사

## 6. 필수 검증

다음 순서로 실제 실행한다.

```powershell
npm run validate:map
git hash-object --path=docs/codebase-map.md docs/codebase-map.md
git commit --amend --no-edit
python "C:\Projects\Active\교대근무관리 시스템\Phase1\verify-logic-test-copy.py" "C:\Projects\Active\ShiftMgmt_V4" --baseline df1f0c8bc00b282a87fcd739d33eed43d2eecb97 --origin "C:\Projects\Active\ShiftMgmt_V3.4" --origin-ref 112a4a9d6d090d6cf72c45dc6fd8942cd3b3f80e
git rev-list --count df1f0c8bc00b282a87fcd739d33eed43d2eecb97..HEAD
git diff --shortstat df1f0c8bc00b282a87fcd739d33eed43d2eecb97 HEAD
git diff --check df1f0c8bc00b282a87fcd739d33eed43d2eecb97 HEAD
npm run release:check
git status --short
```

성공 조건:

- `validate:map`: **71 paths**
- 지도 blob: `f78df54e592ca6bac7ddf5c4567f6f9aed8cab5d`
- verifier: `LOGIC_TEST_VERIFY_OK` · 110/116/120 exact
- commit count: 1
- shortstat: **120 files changed, 28741 insertions(+), 2 deletions(-)**
- `release:check`: `RELEASE_CHECK_OK`
- 최종 status: 빈 출력
- V3 fingerprint: 135줄·10,656 B·`D05CFCC0B3D16FB8AE286D44525DE973D52E44DA59565612DF964B49A610E403`

하나라도 다르면 커밋을 더 만들지 말고 `BLOCKED`로 회신한다.

---

## 회신

> Gemini는 아래만 실제 값으로 채운다. 이 위 본문은 수정하지 않는다.

```text
판정: FIXED | BLOCKED | FAILED
기준: baseline 전체 40자 / 보정 전 HEAD 전체 40자 / 보정 후 HEAD 전체 40자
변경 파일: docs/codebase-map.md 1개
정본 대조: 파일 SHA-256 / git blob / bytes
검증:
- validate:map — RC — paths — 시각 KST
- verifier — RC — 핵심 110/116/120
- commit count — 실제
- shortstat — 실제
- diff --check — RC
- release:check — RC — 핵심
- git status --short — 실제
보호 파일·나머지 119파일: 이전 HEAD와 blob 동일 여부
V3 fingerprint 전/후:
미해결/가정:
```
