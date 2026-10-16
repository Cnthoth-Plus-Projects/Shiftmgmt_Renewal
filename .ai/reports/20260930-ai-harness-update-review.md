# AI-Harness 업데이트 검토 및 적용안 — 2026-09-30

판정: **v5 기능 도입을 권고하되, 조사한 원격 커밋의 실제 적용은 검사 오류 해소 후 진행한다.** 현재는 조사·원문 비교·분리된 분석본 검증·적용 계획까지 완료했다. Gemini의 Phase 3-1c 구현과 수용 기준을 보존한다.

## 1. 확인한 설치본과 원격

| 항목 | 확인 결과 |
|---|---|
| GitHub 정본 | [hacker943410-debug/ai-harness](https://github.com/hacker943410-debug/ai-harness) |
| 로컬 설치 경로 | `C:/Users/pangyo/AppData/Local/AI-Harness` |
| 로컬 전역 하네스 | v3.0.0, detached HEAD |
| 로컬 전체 커밋 | `a5638b3d4c87849fc87a7eedadec2f817ad6561e` |
| 로컬 추가 파일 | `?? plan.json`, 22,047바이트 |
| plan.json SHA-256 | `7875B50DD9785138FD389A1E44CD4B60146119CCD24457A5DF3A1E524706E51C` |
| 프로젝트 운영 지침 | 별도 v4.0.0: Sol(xhigh) 오케스트레이터 / Gemini 제품 구현 / 내부 보조 읽기 전용 |
| 조사한 원격 main | v5.0, `6ae9320773d52a58b9a57f2ad12928395f44ecdd` |
| v5 커밋 시각 | 2026-09-29 18:24:12 KST |
| 원격 최신 태그 | v3.1.0, `1bb03fd8226603ec18e1af91d11968c502d2b799` |
| GitHub Releases | 조회 시 0개; v5.0 태그도 없음 |
| v3.0.0 → 조사한 main | 4커밋, 38파일: 추가 18 / 수정 20 |
| 기존 전문 정책 | P01~P26 전부 바이트 동일, 변경 0개 |

전역 v3, 프로젝트 운영 v4, 원격 v5는 서로 다른 대상을 가리킨다. 프로젝트 v4 역할을 원격 v5의 일반 초기화 예제로 덮어쓰면 안 된다. 실제 버전 정본은 각 저장소의 `POLICY_INDEX.yaml`과 프로젝트의 운영 지침이다.

출처: [고정 커밋 비교](https://github.com/hacker943410-debug/ai-harness/compare/v3.0.0...6ae9320773d52a58b9a57f2ad12928395f44ecdd), [태그](https://github.com/hacker943410-debug/ai-harness/tags), [v5 커밋](https://github.com/hacker943410-debug/ai-harness/commit/6ae9320773d52a58b9a57f2ad12928395f44ecdd).

## 2. 들어오는 변경과 이 프로젝트에서의 처리

| 변경 | 실제 내용 | 적용안 |
|---|---|---|
| 설치·갱신 진입점 | `install.ps1` 추가. 설치 위치 검사, clone/fetch, hooks, 저장소 검사 | 현재 설치기에는 아래 문제가 있어 검증된 전체 커밋을 명시하는 수동 갱신을 사용 |
| v3.1 Jev 판단 보조 | 정해진 후보를 고르는 선택형 advisor, shadow, 실패 시 기존 Router 복귀 | 파일·계약은 받아도 `enabled: false` 유지. 별도 선택 전 외부 호출·인증·라우팅 적용 없음 |
| v5 Skill 계층 | `skills/`와 `use_jit_skill_loading: true`; 번들 Skill 먼저 확인 | Global Runtime에 도입하고 프로젝트 연결 문서에 필요한 계약만 병합 |
| dashboard-builder | 업무 데이터 분석 → KPI/차트 기획 → 디자인 → 구현 → QA | 향후 설계·검증 참고용. 현재 Gemini 3-1c 지시서에 소급 적용하지 않음 |
| CLI별 Skill 어댑터 | client descriptor가 설치 위치를 정의. Codex/Claude/AGY 지원 | Codex 경로 확인·보정 전 native 설치는 보류하고 Global `SKILL.md` 직접 읽기를 우선 |
| 검사 보강 | 번들 경로, Skill 중복 ID, client descriptor, lock 상대경로 검사 | 기존 게이트를 그대로 실행. 오류·실패를 생략하거나 완화하지 않음 |
| 기본 갱신 대상 | 최신 태그에서 GitHub main으로 변경 | main을 조사하되 설치는 검사에 통과한 전체 커밋으로 고정 |

필요한 Skill만 읽는 구조가 추가됐다. 실제 토큰 절감률은 측정하지 않았다. Jev 가격·Canary 결과를 전체 프로젝트 비용 절감 보장으로 사용하지 않는다.

출처: [v5 CLI 패치노트](https://github.com/hacker943410-debug/ai-harness/blob/6ae9320773d52a58b9a57f2ad12928395f44ecdd/CLI_PATCH_NOTES_V5.md), [누적 패치노트](https://github.com/hacker943410-debug/ai-harness/blob/6ae9320773d52a58b9a57f2ad12928395f44ecdd/PATCH_NOTES.md), [Decision Engine](https://github.com/hacker943410-debug/ai-harness/blob/6ae9320773d52a58b9a57f2ad12928395f44ecdd/workflows/DECISION_ENGINE.md).

## 3. 적용 전에 해소하거나 피해야 하는 항목

### A. 실제 저장소 검사 실패 — 적용 게이트

조사한 커밋과 Git blob SHA가 일치하는 111개 파일 분석본에 임시 Git index와 `.githooks` 설정을 만들고 Windows PowerShell 5.1로 `Test-HarnessRepo.ps1 -Json`을 실행했다.

- v3 분석본: 종료 코드 0, `PASS_WITH_WARNING`.
- v5 분석본: 종료 코드 1, `FAIL`.
- 새 실패: `JOIN_PATH_LITERAL`, `scripts/Install-ProjectSkill.ps1:39`.
- 두 버전에 공통인 경고: MCP 카탈로그의 `markitdown 0.0.1a4` prerelease 고정. 이번 v5 실패의 원인은 아님.

문제 줄은 `Join-Path`와 `'/'` 변환을 한 줄에서 사용한다. 기존 검사는 이를 경로 규칙 위반으로 차단한다. 이 결과만으로 Windows에서 Skill 설치가 반드시 실패한다고 단정하지는 않는다. **원격 커밋이 자체 검사에 통과하지 못한다는 사실**이 적용 차단 근거다.

권고 수정: `Join-HarnessPath (Resolve-Path -LiteralPath $HarnessRoot).Path $entry.bundled_path`처럼 기존 공용 경로 함수를 사용한다. 검사에서 이 오류를 제외하는 방식은 채택하지 않는다. 수정한 정본 커밋의 전체 검사를 다시 통과해야 한다.

출처: [Skill 설치기 39행](https://github.com/hacker943410-debug/ai-harness/blob/6ae9320773d52a58b9a57f2ad12928395f44ecdd/scripts/Install-ProjectSkill.ps1#L39), [검사 규칙](https://github.com/hacker943410-debug/ai-harness/blob/6ae9320773d52a58b9a57f2ad12928395f44ecdd/scripts/Test-HarnessRepo.ps1#L84). 실행 결과는 근거 폴더의 `repo-validation.json`, `baseline-repo-validation.json`.

### B. 현재 plan.json 때문에 표준 설치기가 중단됨

`install.ps1:173-178`은 `git status --porcelain`에 어떤 변경이든 있으면 fetch 전에 반환한다. 현재 `?? plan.json`도 포함된다. 한 줄 업데이트 명령을 실행해도 현재 상태에서는 갱신되지 않는다.

권고: 설치본·커밋·hooks·plan.json을 먼저 백업한다. 원격 트리에 plan.json이 없는 것을 재확인하고, 추적 파일 변경이 0개인 조건에서 기존 plan.json을 그대로 보존하는 수동 갱신을 수행한다. 임의 커밋·삭제·숨김으로 검사를 우회하지 않는다. 백업과 적용 후 파일의 SHA-256·바이트를 대조한다.

### C. 설치기의 main 처리와 실패 판정

정적 원문 근거:

- 181행의 fetch, 195행의 merge가 각각 종료 코드를 확인하지 않는다.
- detached 경로의 201행은 `origin/main`의 확인된 커밋 대신 `checkout main`을 수행한다.
- 기존 로컬 main이 오래된 경우 최신 원격에 도달하지 못할 수 있다. fetch/merge 실패 뒤에도 성공 문구가 나올 수 있다.
- `workflows/HARNESS_INSTALL.md:94-117`에는 기본값이 여전히 최신 태그/detached라고 적혀 실제 코드의 main 기본값과 다르다.

이 Git 상태 전이는 실제 설치본에서 실행하지 않았다. 현재 적용안에서는 각 명령의 종료 코드와 전체 HEAD를 확인하고, 검증된 전체 커밋으로 detached 설치를 유지해 이 경로를 피한다. upstream 설치기를 정비할 때는 fetch/merge 오류 반환, 원격 목표 커밋 해석, 문서 동기화를 묶는다.

출처: [설치기](https://github.com/hacker943410-debug/ai-harness/blob/6ae9320773d52a58b9a57f2ad12928395f44ecdd/install.ps1#L166), [설치 문서](https://github.com/hacker943410-debug/ai-harness/blob/6ae9320773d52a58b9a57f2ad12928395f44ecdd/workflows/HARNESS_INSTALL.md#L94).

### D. Codex Skill 경로가 현재 공식 문서와 다름

원격 Codex descriptor의 `project_path_template`은 `.codex/skills/{skill_id}`다. 현재 공식 OpenAI 문서는 저장소의 `.agents/skills`를 탐색 대상으로 안내한다. 이 하네스가 선언한 경로를 Codex가 자동 발견한다고 확정할 수 없다.

권고: 당장은 Global 번들 원문을 JIT로 읽는다. native 설치가 필요한 후속 작업에서 descriptor·관련 문서를 현재 공식 경로와 맞추고, 실제 새 세션의 Skill 목록에서 발견되는지 확인한다. 디렉터리 생성이나 설치 메시지만으로 통합 성공을 판정하지 않는다.

출처: [Codex descriptor](https://github.com/hacker943410-debug/ai-harness/blob/6ae9320773d52a58b9a57f2ad12928395f44ecdd/settings/clients/codex.client.json#L110), [OpenAI: Where Codex loads local skills](https://learn.chatgpt.com/docs/build-skills#where-to-save-skills).

### E. Skill 덮어쓰기와 현재 Gemini 작업

Skill 설치기는 기존 대상 디렉터리를 삭제한 뒤 복사한다. lock은 원본 `SKILL.md`만 해시하고, capability 검사기는 설치된 전체 references/scripts의 존재와 실제 해시 일치까지 확인하지 않는다. 이미 수정한 Skill에 재실행할 때 보존 공백이 있다. 이번 전역 업데이트에서는 native Skill 설치가 필수 작업이 아니므로 수행하지 않는다.

현재 `HANDOFF.md`는 Phase 3-1c IMPLEMENT 발송본이고 SHA-256은 `3842F282F3FD8B09C780D2DA897FE55EDC8934244C48EBECBA46960494D4A0A1`이다. `TODO.md`는 그 단계와 수용 기준을 유지한다. dashboard-builder의 새 KPI·차트 기본 구성을 진행 중인 홈 화면 명세에 추가하지 않는다. 제품 계산·API·DB 규칙과 Sol/Gemini 권한은 상위 정본을 따른다.

## 4. 권고 적용 순서

1. **현재 완료: 원문·검증 근거 확보.** 조사 커밋, 태그, 38파일 diff, 로컬 커밋/상태, 후보 111파일 SHA, 보호 문서 SHA와 실행 결과를 보존한다.
2. **정본 수정 커밋 준비.** A의 경로 검사 실패를 공용 함수 사용으로 해소한다. Codex native 기능을 함께 열려면 D의 descriptor·문서도 보정한다. 설치기를 사용할 계획이면 C의 실패 처리도 보정한다. 이 보고에서는 원격 수정·게시를 실행하지 않았다.
3. **수정 커밋을 별도 경로에서 검증.** YAML 파싱, 26정책 매핑·바이트 불변, 번들 Skill·catalog·schema, 저장소 검사, Jev 오프라인 22건을 확인한다. 저장소 검사 종료 코드 0이 적용 조건이다. 기존 prerelease 경고만 별도로 남긴다.
4. **Gemini 3-1c 회신을 기존 계약으로 수용/종결.** 현재 작업의 검증 기준은 그 작업을 보낸 시점의 계약을 따른다. 새 하네스 연결은 다음 Gemini 지시서를 보내기 전 별도 변경으로 적용한다. 그동안 원문 분석·정본 수정 준비는 병행 가능하다.
5. **전역 설치본 백업 및 고정 커밋 적용.** 작업 폴더의 추적 변경 0, 기존 HEAD, 계획 파일, hooks, 새 목표 전체 SHA를 확인한다. 설치 폴더의 실제 바이트 백업에 `.git`과 plan.json을 포함한다. fetch 종료 코드 확인 → 검증된 전체 SHA로 detached 이동 → HEAD/버전/plan 해시 확인 → 설치 경로에서 저장소 검사 순으로 수행한다. 기존 인증·MCP·PC별 Runtime 설치 단계는 이 업데이트의 실행 범위에 넣지 않는다.
6. **프로젝트 연결 문서 최소 병합.** `.ai/harness.yaml`의 Global 버전은 5.0, 초기 연결 이력 `initialized_with: 3.0`은 보존한다. 프로젝트 운영 overlay는 별도 v4.0.0으로 명시한다. `use_jit_skill_loading: true`, skills 경로, Jev 비활성/fallback 계약만 더하고 기존 schema_version 2.0·orchestration·handoff·project 설정은 보존한다. `.ai/HARNESS.md`는 운영 v4 절을 보존하고 Runtime 연결 절만 보정한다. `.ai/current-state.md`는 실제 확인한 Harness Runtime 부분만 갱신한다.
7. **새 세션에서 확인.** CORE→ROUTER→INDEX→필요한 Policy/Skill 동작, Sol/Gemini 권한, Jev 비활성, 현재 단계, MCP 노출을 확인한다. native Skill을 설치하지 않은 경우에도 번들 원문을 직접 읽을 수 있어야 한다.

프로젝트 기본 allowlist는 `.ai/harness.yaml`, `.ai/HARNESS.md`, `.ai/current-state.md`의 Harness Runtime 구간이다. `AGENTS.md`, `GEMINI.md`, `PROTOCOL.md`, `CLAUDE.md`는 실제로 필요한 관리 marker가 확인된 경우만 별도 diff로 포함한다. `TODO.md`의 수정은 진행 중 handoff 종결 및 사용자 승인 상태와 함께 별도로 판단한다. 새 Skill 원문이나 일반 초기화 예제로 제품·역할 규칙을 일괄 재생성하지 않는다.

## 5. 실패 시 복귀

- 전역 갱신 후 검사 실패: 새 작업을 보내지 않고, 기록한 v3.0.0 전체 커밋으로 돌아가거나 설치본 백업을 복원한다. plan.json·hooks가 백업 당시 SHA/설정과 같은지 확인한다.
- 프로젝트 연결 문서 검사 실패: 업데이트 직전 보존본으로 허용한 문서만 복원한다. 기존 Log는 수정·삭제하지 않는다.
- Gemini 회신 검증과 충돌: 해당 회신의 기존 기준을 우선한다. 진행 중 작업 중간에 새 하네스 기준으로 수용 조건을 바꾸지 않는다.

## 6. 검증 범위와 근거

| 검증 | 결과 |
|---|---|
| 원격 후보 111개 파일 Git blob SHA | 111/111 일치 |
| Index YAML 파싱·정책 파일 매핑 | PASS, 26/26 |
| 기존 정책 바이트 비교 | 26/26 동일 |
| v3 저장소 검사 / 종료 코드 | PASS_WITH_WARNING / 0 |
| v5 저장소 검사 / 종료 코드 | FAIL / 1, JOIN_PATH_LITERAL 1건 |
| Jev 오프라인 검사 / 종료 코드 | 22/22 PASS / 0, 실제 외부 호출 0건 |
| 설치기 갱신 상태 전이 | 정적 원문 검토; 설치본에서 미실행 |
| Codex native Skill 자동 발견 | 공식 문서와 경로 불일치 확인; 설치·새 세션 검증 미실행 |
| 실제 전역 업그레이드·프로젝트 재연결 | 이 보고 단계에서는 미실행 |

검사 명령은 분석본을 대상으로 실행했다. 분석본의 Git index는 원격 커밋을 새로 커밋한 것이 아니라 검사기의 tracked-file/secret-guard 검증을 위한 임시 index다. 실제 설치본의 hooks·등록 상태를 대신 검증했다고 주장하지 않는다.

작업 폴더 루트에서 재현 가능한 실제 검사 명령:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".ai/reports/harness-update-20260930/baseline-check/scripts/Test-HarnessRepo.ps1" -HarnessRoot ".ai/reports/harness-update-20260930/baseline-check" -Json
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".ai/reports/harness-update-20260930/candidate/scripts/Test-HarnessRepo.ps1" -HarnessRoot ".ai/reports/harness-update-20260930/candidate" -Json
node ".ai/reports/harness-update-20260930/candidate/scripts/test-jev-scenarios.mjs"
```

근거 폴더: `.ai/reports/harness-update-20260930/`.

- `local-metadata.json`, `local-v3.0.0.zip`: 설치본 좌표 및 추적 소스 아카이브. ZIP에는 untracked plan.json이 포함되지 않아 실제 업데이트용 전체 백업으로 사용할 수 없다.
- `compare.json`, `tags.json`, `releases.json`, `tree.json`: GitHub 조회 원문.
- `candidate-integrity.json`, `candidate-manifest.json`: 원격 전체 blob/SHA-256 확인.
- `baseline-repo-validation.json`, `repo-validation.json`, `jev-offline-tests.txt`: 실제 검사 결과.
- `archive-byte-normalizations.json`: Git archive의 CRLF 차이가 있던 4개 파일을 원격 blob SHA와 일치하는 LF 바이트로 복구한 이력. 기존 설치본 변경 아님.
- `protected-documents-after.json`: 현재 handoff와 운영 문서의 완료 시점 해시.

웹 fetch의 cache miss 이후 GitHub CLI API로 원문을 확보했다. 후속 원문 조회 중 API 403 사용량 제한이 발생했으며, 남은 4개 기존 파일은 줄바꿈 복구 후 이미 확보한 원격 tree의 blob SHA와 전부 일치함을 확인했다. 미확보 원문이나 확인하지 않은 내용을 추정으로 채우지 않았다.

라우팅: frontier Sol이 범위·판단·통합을 담당했다. Terra 이름의 모델이 현재 런타임 목록에 없어 가장 가까운 가용 balanced 모델 GPT-6 Sol에 설치기 정적 원문 검토만 위임했다. 위임 결과의 핵심 줄과 검사 결과를 Sol이 직접 확인했다.
