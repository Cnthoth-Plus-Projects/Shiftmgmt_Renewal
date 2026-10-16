# A2 v2 — GitHub LF / Windows CRLF 해시 차이 최종 판정

**판정:** `RESOLVED_EOL_ONLY` — GitHub 원본과 Windows 로컬 체크아웃 사이에 **내용/버전 차이가 없음**. 기존 A1/A2 v1 계약·검증기의 잠금값 불변.

**근거 단계**
1. 사용자 로컬 AI의 `MEASURE_ONLY` 실측: 기존 `C:\Projects\Active\교대근무관리 시스템\.ai\contracts\phase3-2c-a2-v1\`와 GitHub Clone `C:\Projects\Active\ShftMgmt_Renewal\.ai\contracts\phase3-2c-a2-v1\` 각 JSON이 완전히 같은 CRLF bytes/SHA. 불일치 첫 바이트 없음. 원본 파일은 미변경.
2. Sol이 GitHub `execution.json`, `baseline.json` blob의 줄바꿈을 **문자열 메모리에서만** LF→CRLF로 정확히 치환하고 UTF-8 SHA-256을 직접 계산; 고정 상수와 둘 다 일치.
3. GitHub blob은 줄바꿈 정규화 LF로 저장되어 있는 상태. 비 Windows/다른 Git 설정에서 raw checkout이 LF인 경우 **파일을 직접 읽는 원 v1 SHA lock은 거부할 수 있음**. 이는 기획/계약 drift가 아니라 실행 환경의 EOL 의존성.

| 파일 | Git blob LF bytes | LF 수 | Windows 작업 트리 CRLF bytes | CRLF 수 | Git blob SHA-256 | 메모리 CRLF 전환 SHA-256 |
|---|---:|---:|---:|---:|---|---|
| `execution.json` | 9753 | 362 | 10115 | 362 | `848E50007B38AAC6E8CDE87D81354EA22CD50BDFEEC65DB8135480C90F05917A` | `FDBBC4B9A93E58B1AE50AEE2925BC1CA676AE34503EB7BA6147F0C523C09619D` |
| `baseline.json` | 196296 | 3677 | 199973 | 3677 | `A91F1A71A01ADC22F153DC1FB5ED282FA2219EA28EA57A9138DB4F951A7E62B0` | `D305FE700885F4F3BD640FC021E6F545B684E46E2630CDB993A4A8173E7C1A03` |

두 파일의 바이트 차이 `362B`, `3,677B`는 각각 줄바꿈 수와 같음. **Sol 재계산 결과: 두 고정 SHA와 64자리 전체 동일.**

## 실행 정책 — 과거 계약을 절대 고치지 않음

- **필요 없음:** 새 v2 계약 파일 복제, 기존 파일을 Git blob SHA로 재봉인, 원 historical `.ai/contracts/`/로그 수정, `git config core.autocrlf` 무차별 변경.
- 기존 로컬 Windows 경로에서 관찰된 CRLF 계약은 byte exact lock 충족. 제품 실행 시 검증기가 참조하는 로컬 전체 절대경로에서 **동일 byte SHA를 사용한다는 점**은 계속 preflight 검사.
- 다른 clone/OS에서 v2를 실행하려면 명시적인 체크아웃 EOL 정책을 먼저 설정하고 lock/hash 검증 후 진행; LF 상태에서 원 gate 오류를 A2 기능 결함으로 집계하면 안 됨.
- Repo 루트에는 `.gitattributes`가 없음 (설계 브랜치 조회). 새 파일 추가를 통한 EOL 고정은 *별도 변경 승인 없이* 수행하지 않음.
- 로컬 `C:\Projects\Active\ShiftMgmt_V4`는 여전히 A2 미수용 작업 12개가 있는 기존 제품 repo. GitHub 단일 clone의 `ShiftMgmt_V4/`와 물리경로가 다르므로, **구현 출처/테스트 실행 경로/마지막 Push 위치를 별도로 명시**.
- Chrome: 역사적 `environment-policy.json`의 .40은 `INSPECTED_REAL_CHROME_RECON_NOT_A2_IMPLEMENTATION` 메타. 현재 활성 `gate-evidence.py`는 `environment-policy.json`을 직접 읽거나 .40을 hardcode하지 않으며, 실행 중 설치된 Chrome을 `findChrome()`으로 조회해 raw 관측 버전과 일치하는지만 요구 (원 gate 265–273행). **현재 .41이라는 사실 자체만으로 v1 gate 필수 실패라고 할 수 없음**. 실제 A1 회귀는 별도 Windows 실행 증거 필요.
- **검증되지 않은 것:** A2 v2 코드 실행, 실제 Chrome UI, 112 음성 벡터 실측, 빌드/실행 통과, A2 수용.

## 결정

- `PATH_SHA_AUDIT.md`의 `REMOTE_LOCK_MISMATCH`는 **'GitHub raw LF blob 자체를 곧바로 입력했을 때'라는 관측**으로만 남기고, **로컬 Windows Git checkout에서 실행 차단이라는 결론은 철회**.
- 구현 지시서의 사전조건은 `MEASURED_LOCAL_CRLF_SHA_LOCK_PASS`로 분류하며, 다른 checkout에서는 동일 실측을 요구.
- `main`, 제품 코드, 기존 A1/A2 v1 계약 및 종결 로그 수정 없음.
