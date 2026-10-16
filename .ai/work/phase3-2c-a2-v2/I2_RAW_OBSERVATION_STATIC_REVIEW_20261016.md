# A2 v2 I2 — 원 HTTP 관측 보존과 검증기 바이트 여유 복구

- Date: 2026-10-16 KST
- Implementer/reviewer: Sol (GPT-6)
- Branch: `work/phase3-2c-a2-v2-implementation`
- Starting HEAD: `de5134999cc37de4be9a97a16301c0509ed6b3d8`
- Status: **STATIC_SOURCE_CHECKED / NODE_SYNTAX_NOT_YET_RUN / UI_RUNTIME_UNVERIFIED / A2_NOT_ACCEPTED**
- Scope: A2V1-02 (incomplete request/status fabrication) + A2V1-06 (response association by Request identity), **partial**. Also byte budget preflight for negative.mjs.
- `main`, original A2 v1 failed branch, original Windows dirty12, old A1/contract, shared frozen, owner are unchanged.

## 1. 실제 변경 — 과도한 일반 리팩터링을 피함

### I2-BUDGET (negative.mjs)

- `installNormalObserver` 본문과 `// CLI 진입점: errors / session-expired 실행` 이하 **두 구간의 줄 선행 공백만 절반으로 조절**. 의미 있는 코드, 문자열 내용, 표현식, 전체 줄 순서는 불변.
- GitHub 원본문의 모든 줄에서 **선행 스페이스를 제거한 결과가 이전/이후 byte-for-byte 동일**임을 도구가 검산.
- 기준 29,979B → 형식만 변경 후 28,840B; **1,139B 확보**. 일부 들여쓰기 시각적 밀도가 변하며 원본 가독성 트레이드오프가 있다. 배포 전 `node --check`와 A1 회귀 테스트는 필수.
- 이 변경은 코딩 로직이 아니라 형식만 변경. 30KB 제한은 유지.

### I2-R04A (negative.mjs) : Node fetch의 status 단정 금지

- 실제 `res.status`를 읽은 후 `errorCode === 'AUTH_FORBIDDEN'`만을 근거로 `status=403`을 가공하던 별도 분기를 제거. 실제 HTTP 200 + 비즈니스 실패는 HTTP 200으로 보존한다.
- `publishNormalEvidence`에서 `r.status===0`인 pending 요청을 200/현재 시간으로 바꾸던 루프 제거. 미완료 요청은 관측한 원 상태를 유지한다.
- 이 부분만으로 Node fetch 응답 파서의 무음 오류처리, 실패 종료 시간, 전체 출판 스키마 불변성이 해결됐다고 주장하지 않음.

### I2-R04B (positive.mjs) : Playwright Request identity

- `page.on('request')`에서 status=0, `endedAtMs=null`, `ok=false`로 시작. 응답을 실제 수신하기 전에는 완료 시각/성공을 생성하지 않음.
- `WeakMap<Playwright Request, raw record>`에서 원 요청 객체를 보존하고 `response.request()`로 동일 요청 레코드에 응답을 귀속. 기존 같은 URL + status0으로 `Array.find`하는 방식 제거. 다수 같은 URL의 겹친 요청도 객체 기준으로 귀속.
- UI 시나리오 마지막 drain timeout에서 여전히 status0인 요청을 status200/now로 위조하는 루프 제거.
- 응답 body 비동기 파서의 실패 기록/finish drain, strict `postDataJSON`, requestfailed 이벤트, protected screenshot/close 타임스탬프 문제는 남아 있음. **A2V1-02, A2V1-06 전체 해결로 판정 불가**.

## 2. 코드 원본 크기 및 실제 GitHub SHA-256

| 파일 | UTF-8 Bytes | SHA-256 | 추가 가능 바이트 |
|---|---:|---|---:|
| `access-history.mjs` | 29,351 | `2490A4DC38D65E6FDDD571C64D9903882334F243239D2F697A807BDA481DC9E7` | 649 |
| `access-history-shared.mjs` | 29,973 | `C0AB887F045AB3C71DC5878B195658668DAA8F7A47E95242E903DF565BB53EE4` | 27 |
| `access-history-positive.mjs` | 23,830 | `E9D668F40D11EB5597B018A67BB9A07BE40251E63AE7CCFCF549A72AAFE39DB0` | 6,170 |
| `access-history-negative.mjs` | 28,602 | `1A3D8F576A23E5AB1F23721E393954D626275D5073F8FFC043D87F80480BFEE1` | 1,398 |

위 원격 파일을 readback하고 UTF-8 bytes 기준 실제 SHA-256을 재계산했으며 SHA-256 시험 문자열 `abc`의 공개 정답값과 대조했다. `owner/shared` 원본 소스 SHA 완전 동일.

## 3. 실제 실행 전 검증 장벽

1. 별도 Windows GitHub clone clean·remote exact SHA·`core.autocrlf=false`.
2. product negative/positive 두 파일 `node --check` 실제 RC0, `git diff --check`, tracked diff/경로 잠금.
3. negative의 `publishNormalEvidence` 실제 export 함수를 사용한 **운영 데이터를 포함하지 않은 own runDir 격리 helper probe**: status0/endedAtMs:null 요청은 출판 뒤에도 0/null; status403/endedAtMs:진짜값은 그대로. 작성된 raw JSON과 rawSha를 확인. 원 계약 CRLF mismatch가 있으면 BLOCKED, contract 편집 금지.
4. positive의 Request identity 동적 시험은 현재 이 모듈의 `page.on('request')` 구현이 함수 내부에 있어 owner IPC/Chrome 없이 직접 실행 불가. 따라서 본 단계에서는 **STATIC_ONLY**, 독립적인 실제 Playwright 동시 URL 요청 테스트가 추후 필요한 것으로 유지.
5. 이전 I1 정상/음성 T1~T9는 이미 로컬 실행 *보고*됐으나, Sol 후속 routeError 한 줄 보완과 I2 변경은 실제 Windows 재검증 전. 기존 legacy 제품 파일 overlay, 18741 포트 서버 시험/Chrome 실행, 기존 12파일 변경 **불허**.
6. 원 A1 acceptance/8 normal/112 negative는 **UNVERIFIED**. I2를 partial progress로만 추적; 확정 수용 상태는 변경하지 않음.

## 4. 다음 논리적 구현 (Sol 소유)

- **I2 후속 범위:** 실제 `page.viewportSize()` 관측, context/browser 실제 acquired/closed event 및 첫 error tracking, response body Promise completion/drain, `requestfailed` 관측, `parseNormalBridgeQuery` strict `postDataJSON` 호출/unknown keys reject.
- A2V1-03 reader를 별도 I3로 두어 raw SHA/case/runId/PID/exit/coverage/child receipt의 독립 검문을 구현. I2에서 reader를 억지로 포함하지 않음.
- 용량 한도와 source-change provenance를 각각 기록하고 `node --check`만을 기능 PASS로 간주하지 않는다.

**결론:** 코드 수정과 GitHub 정적 SHA/경로 검사 완료. 제품 통합 실행·독립 수용 미실시.
