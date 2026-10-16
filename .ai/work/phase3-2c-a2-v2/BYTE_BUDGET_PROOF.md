# A2 v2 — 4검증기 30KB 제약 실측 예산 분석 (원 소스 변경 없음)

**출처:** A2 v1 GitHub 보존 기준 `2f51c11710f46c75a49f5715cc68d4752b53f8ca`의 정확한 4개 source를 다운로드 도구 아닌 GitHub 원문으로 읽어 UTF-8 byte 수를 계산함.

**기준 규칙:** 파일별 ≤30,000 bytes. `shared` 동결 영역은 `export const CANONICAL_8_ACTIONS =`부터 `export async function performWorkerIpcHandshake` 직전의 6,575 bytes로 byte-exact SHA 유지. **수용된 A1 검증을 변경/완화/삭제하지 않음**.

## 1. 정량 결과

| 파일 | 기준 실제 bytes | 현재 여유 | 동결 이후 들여쓰기만 제거한 분석상 절감량 | 그 가정의 예상 크기/여유 |
|---|---:|---:|---:|---:|
| `access-history.mjs` | 29351 | 649 | 1002 | 28349 / 1651 |
| `access-history-shared.mjs` | 29973 | 27 | 1562 | 28411 / 1589 |
| `access-history-positive.mjs` | 22530 | 7470 | 3310 | 19220 / 10780 |
| `access-history-negative.mjs` | 27848 | 2152 | 2728 | 25120 / 4880 |

**주의:** 위 예상은 실제 코드 수정/빌드/테스트 결과가 아니라 **동결 경계 밖 라인 선행 공백**에 대한 비제품 문자열 연산으로 산출한 **최대치 예시**다. 해당 편집이 안전하고 유지보수 가능한 최선의 방법이라는 뜻은 아니다. 4개 파일 전체 무차별 포맷 변경을 권장하지 않는다.

- `shared`의 기준 29,973 bytes 중 frozen=6,575, frozen 이전 prefix=1,676, frozen 이후=21,722.
- frozen 이후의 선행 공백만 모두 제거하는 가상 시뮬레이션: **1,562 bytes** 감소, 전체 **28,411 bytes**, 예상 여유 **1,589 bytes**. frozen 구간 문자열은 완전히 동일. 해당 구간에는 줄바꿈을 건너는 backtick template line 쌍이 관측되지 않았음.
- 다음 세 함수 구간을 **각각** 시뮬레이션하면:

| 비동결 실제 함수(시작 anchor) | 함수 주변 구간 크기 | 선행 공백만 제거했을 때 감소 |
|---|---:|---:|
| `performWorkerIpcHandshake` | 6278 bytes | 692 bytes |
| `collectCoreChecks` | 5170 bytes | 188 bytes |
| `runContractCore` | 5534 bytes | 370 bytes |

따라서 이전 로컬 보고서의 **“`collectCoreChecks`에서 `this.seenIds.add/this.checks.push`를 합쳐 800~1,100B 절감”**은 실제 코드 위치가 잘못되어 **기각**된다. 해당 두 문장은 동결된 `AssertionCollector` 안에 있고, 비동결 `collectCoreChecks`에는 없다. **그 패턴을 변경하면 frozen SHA가 깨진다.**

## 2. 구현 시 실제 권고 순서

1. **변경 목적별로 국소화**: owner IPC/env/first-error, shared handshake ACK, positive request+protected capture, negative reader+timer+redaction. A1 full source/contract 변경 금지.
2. frozen 바이트를 먼저 고정·해시 검증하고 **수정 대상 비동결 함수만** 편집; 의미 있는 중복을 찾으면 기존 동일 호출·오류 처리와 완전 동일함을 소규모 정적/동적 테스트로 증명한다. 새 헬퍼를 다른 파일로 빼서 순환 import/side effect를 만드는 방식은 금지.
3. shared의 파일별 마지막 30KB와 byte-exact frozen SHA를 구현 도중 매번 기록. 최종 최소 0B 여유라도 상한 통과는 가능하나 부수 변경에 취약.
4. 국소 코드로 여유 부족이면 위 **선행 공백 최소 압축**을 마지막 수단으로 제한적으로 적용할 수 있다. 자동 전체 minify, 오류 문구 단축/검사 삭제로 byte 확보하지 말 것.
5. A1 original acceptance tests, contract/core/regression, negative 112 real fault, 8 normal, process/teardown evidence, Chrome gate를 모두 실제 실행해야 함. `node --check`는 문법만 증명.
6. **아직 구현 바이트 증명은 완료가 아니다**: v2 최종 코드가 없으므로 추가 코드 byte 규모/실제 수정 결과를 확정할 수 없다. 현 자료는 **budget feasibility candidate / RUNTIME UNPROVEN**.
