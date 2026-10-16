# A2 v2 I1 CORRECT1 — Sol 독립 재검토 및 최소 보완

- 날짜: 2026-10-16 KST
- Gemini 제출: `96a8cb2fa298f47da9f8ef7b7e7c1dc5c774cee9`
- 제출 부모: `c532716031c600660dedda88e98e16eaac547417`
- **판정: I1_STATIC_REVIEW_PASS / ISOLATED_RUNTIME_RECHECK_REQUIRED / NOT_A2_ACCEPTED**
- 범위: I1-07 held route lifecycle, I1-09 Windows junction direct CLI guard. 원 A1/8 normal/negative112/전체 A/B87 수용 아님.

## 1. 제출물 확인

제출 96a8...은 HANDOFF 회신과 positive/negative 두 검증기만 변경하였다. GitHub 실제 본문 검토로 `NormalHeldRouteController.handle`의 정상 completed/실패 routeError/settled, `waitForComplete` 재throw, timer finally clear 및 scenario error handling 개선을 확인했다.
Junction guard는 fs.realpathSync 양쪽 비교. 보고된 direct/junction RC1의 '[IPC] not connected' 진입점은 shared.mjs 219행에 존재함을 직접 확인. Windows 원 stderr와 selftest stdout은 현 클라우드 세션에서 직접 재실행·열람하지 않았으므로 LOCAL_AGENT_REPORTED이다.

## 2. Sol 추가 보완 — 이미 settled된 오류 누락

제출된 handle은 route.fulfill/abort 오류를 catch하고 `routeError`에 저장하되 Playwright route callback 자체를 reject하지 않는다. 시나리오의 다른 단계에서 primary Error가 먼저 발생했고 route 오류가 이미 `settled=true`, `completed=false`이면 기존 finally의 `if(started&&!settled)`는 통과하지 않아 `state.errors.cleanup`에서 routeError가 누락될 수 있다.

**Sol이 구현 브랜치에서 제품파일에 각각 한 줄씩만 추가**:

- negative `errors`: `held.routeError`가 cleanupErrors에 없는 경우 수집
- positive `stale-response`: `heldController.routeError`가 cleanupErrors에 없는 경우 수집
- 이미 존재하는 primary Error를 최종 throw하는 기존 조건 불변. 이미 수집한 동일 Error 중복 방지.
- 원본 HANDOFF의 Gemini ## 회신을 소급 수정하지 않음. 두 파일 외 제품·계약·역사적 A1·V3.4·main 무변경.

## 3. 직접 계산한 GitHub 최종 전체 SHA-256

| 제품파일 | bytes | SHA-256 | 잔여 한도 |
|---|---:|---|---:|
| access-history.mjs | 29,351 | `2490A4DC38D65E6FDDD571C64D9903882334F243239D2F697A807BDA481DC9E7` | 649 |
| access-history-shared.mjs | 29,973 | `C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4` | 27 |
| access-history-positive.mjs | 23,900 | `1D4C16AEF622DEDB61BDF26D4032D1477AEE51B9EEE95EE566F86D96069E143E` | 6,100 |
| access-history-negative.mjs | 29,979 | `8631F100546898B0444ECC6FCB9BC3EACD30F2FAEA1A6A4ED8D01CAD5E48AEE0` | 21 |

원본 owner/shared의 Git blob은 불변. Shared frozen 구간 6,575B 및 역사적 A1 계약은 그대로다. 해시 계산은 UTF-8 실제 bytes와 SHA256-known-answer 'abc' 검산 후 수행. **negative 파일 21B 잔여 한도는 추가 구현의 즉시 중단 위험.**

## 4. 다음 최소 재시험

별도 GitHub clone만 fast-forward 갱신한 뒤 head/branch/status/4개 SHA, 두 검증기 node --check, 기존 T1~T9 실제 exported-class 자가시험, direct/junction 4가지 실제 오류 원인 확인.

**신규 T10:** 실제 route.fulfill이 throw되어 settled=true/completed=false/routeError 존재한 후 별도 scenario primary Error가 발생한 상태에서, 기존 primary Error가 최종 던져지고 routeError가 state.errors.cleanup에 별도 기록되는지 확인. 테스트 대상은 실제 positive/negative 시나리오 finally 흐름. 외부 scratch가 해당 코드를 복사해 만든 가상 함수라면 STATIC_SIMULATION_ONLY로 표시하고 시나리오 실동작 PASS로 주장 금지.

Windows 기존 제품 root에 candidate 4파일 overlay 금지. 18741 서버/Chrome UI/A1/8 normal/negative112는 아직 UNVERIFIED. 전체 I1 수용 전 실제 runtime evidence 분리 필요.

판정: **코드 정적 검토 및 조건부 개선 확인, 실행 시험 이전에는 I1_ACCEPTED 아님.**
