# A2 v2 — 원 소스 문자열 리터럴 및 GitHub SHA-256 직접 감사

- **판정: REMOTE_LOCK_MISMATCH / BLOCKED_REMOTE_RUNTIME_REPRODUCTION** — 4개 중 2개의 GitHub 현재 파일 해시가 v1 검증기 상수와 다름.
- 방법: 검증기 원문에서 Windows 전체 문자열 리터럴을 파싱하고, GitHub 원파일 UTF-8 bytes를 **SHA-256 직접 계산** (기본 SHA-256 'abc' 테스트 벡터 통과). GitHub blob SHA-1만 비교한 게 아님.
- 로컬 Windows Test-Path/해시는 현 세션에서 실행 불가. 로컬 CLI 보고서는 “4개 모두 일치”라고 말하지만, 이는 두 폴더의 서로 다른 물리 파일일 가능성이 있으므로 GitHub 파일과 동일성 보장 없음.
- 과거 `referenced_paths.json`은 경로 추출 정규식 오류 때문에 절단·false를 출력함; 사용 금지.

| 소스 상수 | 소스 줄 | 하드코딩된 전체 Windows 경로 | 해당 GitHub 파일 | 소스가 요구하는 SHA-256 | GitHub 파일의 실제 SHA-256 | 일치 |
|---|---:|---|---|---|---|:---:|
| `CONTRACT_PATH` | 13 | `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-v1\contract.json` | `.ai/contracts/phase3-2c-v1/contract.json` | `014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE` | `014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE` | **YES** |
| `EXECUTION_PATH` | 15 | `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-a2-v1\execution.json` | `.ai/contracts/phase3-2c-a2-v1/execution.json` | `FDBBC4B9A93E58B1AE50AEE2925BC1CA676AE34503EB7BA6147F0C523C09619D` | `848E50007B38AAC6E8CDE87D81354EA22CD50BDFEEC65DB8135480C90F05917A` | **NO** |
| `BASELINE_PATH` | 16 | `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-a2-v1\baseline.json` | `.ai/contracts/phase3-2c-a2-v1/baseline.json` | `D305FE700885F4F3BD640FC021E6F545B684E46E2630CDB993A4A8173E7C1A03` | `A91F1A71A01ADC22F153DC1FB5ED282FA2219EA28EA57A9138DB4F951A7E62B0` | **NO** |
| `GATE_PATH` | 18 | `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-a2-v1\gate-evidence.py` | `.ai/contracts/phase3-2c-a2-v1/gate-evidence.py` | `0BD49A425F026D37EF861E4EB70EAC237733EC7D847E7164933B7BEA01F2E622` | `0BD49A425F026D37EF861E4EB70EAC237733EC7D847E7164933B7BEA01F2E622` | **YES** |

## 반드시 구분할 사항

1. GitHub **원 계약을 덮어쓰거나 SHA 상수를 무조건 현재 파일 SHA로 변경하면 안 된다**. baseline과 execution은 역사적 A1/A2 검증 기준; 그 의미/정본을 비교하지 않은 재해시는 lock 완화다.
2. 기존 구분된 `C:\Projects\Active\교대근무관리 시스템` 내 실제 로컬 파일이 원하는 SHA와 일치한다면 **과거 물리 경로에서** 해당 구판 v1은 preflight가 통과할 수 있다. 이는 새 GitHub clone 내 계약 복제와는 별개.
3. v2용 **새 계약 스냅샷**을 필요로 한다면 `.ai/contracts/phase3-2c-a2-v2/`에 명시적 version/owner/base/byte/checksum/currentChrome 정책을 새로 설계하고 GitHub에서 추적한다. v1 원본은 수정하지 않는다. 해당 새 통제파일 생성은 Sol의 별도 설계 승인 후이며 이를 v1 결과 PASS로 해석 금지.
4. 기존 환경정책 Chrome 잠금은 `155.0.8059.40`, 로컬 보고 설치값은 `155.0.8059.41`. 둘의 차이를 새 v2 정책에서 심사해야 하고 이전 로그를 소급 교정하지 않는다.
5. GitHub 단일 저장소의 `ShiftMgmt_V4/` 하위 경로와 과거 절대 제품 루트는 다르다. 기존 owner가 `process.cwd()` 및 코드 realpath를 검문함. 새 clone에서 자동 실행 가능이라는 주장을 금지.
6. 다음 **BLOCKING 근거**: ① GitHub 파일 2개 mismatch의 변동 시점·의미 파악 ② 로컬 원본이 갖는 정확한 bytes 확보 또는 새 v2 계약을 별도 발행 ③ 환경/경로 재구성 전략. 제품 코드·기존 계약/Log/루트 HANDOFF/main 무변경.

## 원격 검증 값 (기계 판독 요약)

```json
{
  "counts": {
    "checked": 4,
    "matching": 2,
    "mismatching": 2
  },
  "files": [
    {
      "name": "CONTRACT_PATH",
      "repoFile": ".ai/contracts/phase3-2c-v1/contract.json",
      "expectedSha256": "014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE",
      "remoteFileActualSha256": "014FE49BA87154716ED82CC5BC584AD3080B8000AEEAC34ABDD4D7BCFF7104BE",
      "sha256Matches": true,
      "remoteBytes": 29515
    },
    {
      "name": "EXECUTION_PATH",
      "repoFile": ".ai/contracts/phase3-2c-a2-v1/execution.json",
      "expectedSha256": "FDBBC4B9A93E58B1AE50AEE2925BC1CA676AE34503EB7BA6147F0C523C09619D",
      "remoteFileActualSha256": "848E50007B38AAC6E8CDE87D81354EA22CD50BDFEEC65DB8135480C90F05917A",
      "sha256Matches": false,
      "remoteBytes": 9753
    },
    {
      "name": "BASELINE_PATH",
      "repoFile": ".ai/contracts/phase3-2c-a2-v1/baseline.json",
      "expectedSha256": "D305FE700885F4F3BD640FC021E6F545B684E46E2630CDB993A4A8173E7C1A03",
      "remoteFileActualSha256": "A91F1A71A01ADC22F153DC1FB5ED282FA2219EA28EA57A9138DB4F951A7E62B0",
      "sha256Matches": false,
      "remoteBytes": 196296
    },
    {
      "name": "GATE_PATH",
      "repoFile": ".ai/contracts/phase3-2c-a2-v1/gate-evidence.py",
      "expectedSha256": "0BD49A425F026D37EF861E4EB70EAC237733EC7D847E7164933B7BEA01F2E622",
      "remoteFileActualSha256": "0BD49A425F026D37EF861E4EB70EAC237733EC7D847E7164933B7BEA01F2E622",
      "sha256Matches": true,
      "remoteBytes": 27279
    }
  ]
}
```
