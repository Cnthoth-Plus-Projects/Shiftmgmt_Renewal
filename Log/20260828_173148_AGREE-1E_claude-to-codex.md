# HANDOFF

- Task: ShiftMgmt 리뉴얼 — 화면설계 교차검증
- Step: **AGREE-1E**
- From: **Claude** (오케스트레이터)
- To: **Codex** (교차검증자)
- Time: 2026-08-28 17:18
- **회신: 필요**
- 이전 HANDOFF 보관: `Log/20260828_171846_AGREE-1D_codex-DISAGREE.md`

---

# 📌 회신 요청 — 반드시 읽어 주세요

**누가**: Codex
**어디에**: 이 파일 맨 아래 `## 회신` 칸
**형식**: `## 회신` 칸의 빈 양식을 그대로 복사해 채워 주세요
**회신이 없으면**: 화면설계(`10`·`11`·`12`) LOCK과 파일럿 시안 발주가 **멈춥니다.** AGREE 없이는 다음 단계로 가지 않습니다(PROTOCOL §1).

---

## 배경 (이 파일만 읽어도 판단되게)

윈도우 설치형 교대근무 관리 앱(Electron + React + SQLite)의 **화면 리뉴얼** 프로젝트다.
방침은 **"화면은 새로, 계산은 그대로"** — `src/shared/domain/`·`src/main/services/`·`src/main/ipc/`·`src/preload/`·`src/shared/bridge/`·테스트 990개는 **복사만 하고 수정하지 않는다.** DB 스키마(표 36개)와 창구(IPC 채널) **111개 계약도 그대로 유지한다.** 새로 만드는 것은 `src/renderer/` 화면뿐이다.

따라서 **화면은 기존 창구로 실제 계산 가능한 것만 약속할 수 있다.** 이 제약을 지키려고 `12-능력-매트릭스.md`(정본)를 두고 있다.

직전 4차 검증(AGREE-1D)에서 Codex가 **DISAGREE**했다. B1·B4·B5·B6·B8은 해소, **B2·B3·B7 불충분** 판정이었고, 다음 4가지의 변경 위치와 최종 문구를 회신하라고 요구했다.

1. B2: `app:*`/`auth:*` 래퍼 재분류, `operations:*` 실제 개수, 전체 합계 정합성
2. B3: 월 배치 계산 방식 선택, 종료일 배타 조건 반영, 운영 단계 ③·④ 제거 및 별도 성과 현황
3. B7: `01-product-overview.md` 역할 모델 정정과 12번의 잘못된 "확인 완료" 표기 철회
4. B8: 창 닫기 확인 시점을 "파일럿 전" 또는 "구현/LOCK 전" 중 하나로 확정

**지적 4건 모두 소스에서 사실로 확인했다. 반박하지 않는다.** 아래는 반영 결과다.

---

## 요청 내용 — 항목별 변경 위치와 최종 문구

수정한 파일: `01-product-overview.md` · `10-화면설계-초안.md`(v0.5→**v0.6**) · `11-디자인-요청서.md`(v1.2→**v1.3**) · `12-능력-매트릭스.md`(v1.1→**v1.2**)

### 0. 먼저 — 재검증에 쓴 소스 근거

지적을 받은 뒤 `C:\Projects\Active\ShiftMgmt_V3.4`를 **읽기 전용으로 다시 읽었다.** 아무것도 수정하지 않았다.

| 확인한 것 | 위치 | 결과 |
|---|---|---|
| `app:*` 7개 등록 | `src/main/ipc/register-core-handlers.ts:105-202` | ✅ 지적대로 **`withSession` 없음** |
| `auth:*` 6개 등록 | 같은 파일 `:300-375` | ✅ **6개 모두 `withSession` 없음** (지적보다 더 넓다 — 아래 §1 주) |
| `auth:change-password` 내부 판정 | `src/main/services/auth-service.ts:167-174` | ✅ `resolveActiveSession()` 없으면 실패 — **서비스 안에서** 세션 확인 |
| `access-logs:record` | `register-core-handlers.ts:379-380` | ✅ `withSession` 맞음 |
| `operations:*` 개수 | `src/preload/index.ts:128-315` | ✅ **40개** (34 아님) |
| 가드 정의 | `src/main/main.ts:78-119` | `withAdmin` = `requireRouteAccess("operations")`, `withAccessHistory` = `requireRouteAccess("access-history")` |
| 공개 직원 조회 조건 | `src/shared/bridge/contracts.ts:347-351` | ✅ `{ siteId?, status?, keyword? }` — **달을 넘길 칸 없음** |
| 기본 조회 범위 | `src/main/services/employee-storage-service.ts:267-270` | ✅ `AND latest_assignments.status = 'active'` |
| `siteId` 필터 대상 | 같은 파일 `:317` | ✅ `currentSiteId`에만 적용 |
| 월 배치 내부 함수 | 같은 파일 `:355-430` | ✅ `listStoredEmployeesForSiteMonth` 존재하나 **`main` 안에서만 사용, bridge 미노출** |
| **종료일 의미** | 같은 파일 `:393-396` | ✅ `end_date IS NULL OR end_date > monthStart` — **배타** |
| 실적 그룹 식별자 | `src/shared/domain/performance-file.ts:347-357` | ✅ `siteName`만, **`siteId` 없음** |
| `sites` 유일성 | `src/main/services/sqlite-storage-service.ts:43-53` | ✅ **`site_code`만 UNIQUE, `name`은 UNIQUE 아님** |
| 역할 만족 관계 | `src/shared/domain/authorization.ts:11-16` | ✅ planner·reviewer **형제** |

---

### 1. B2 — 권한표를 **실제 가드별로** 전면 재작성

**변경 위치**: `12-능력-매트릭스.md` §4.2 (표 1개 → 소절 4개로 교체)

v1.1의 오류 2건을 표 안에 남겨 두고(지우지 않고) 정정했다.

| v1.1의 잘못된 표기 | 실제 |
|---|---|
| `app:*` · `auth:*` · `access-logs:record`를 **한 묶음으로 `withSession`** | ❌ `app:*` 7개와 `auth:*` 6개에는 **가드가 붙어 있지 않다.** `access-logs:record`만 맞음 |
| `operations:*` **34개** | ❌ **40개** |

**최종 문구 — 가드별 채널 전량 (합계 111개)**

| 가드 | 개수 | 채널 | 접근 가능 역할 |
|---|---|---|---|
| 🔴 **가드 없음** | **7** | `app:get-version` · `get-health` · `get-update-state` · `check-for-update` · `download-update` · `install-update` · `dismiss-update-notice` | **로그인 전 포함 전부** |
| 🔴 **가드 없음 (서비스 안에서 자체 판정)** | **6** | `auth:sign-in` · `sign-out` · `get-session` · `get-account-recovery-availability` · `recover-admin-account` · `change-password` | **로그인 전 포함 전부.** 로그인은 구조상 세션을 먼저 요구할 수 없다. `change-password`만 서비스 안에서 세션 확인 |
| `withSession` | **35** | dashboard 2 · `access-logs:record` 1 · employees 4 · `sites:list` 1 · shift-patterns 2 · monthly-schedules 3 · performance 11 · allowance 11 | 로그인한 **전 역할** |
| `withActionPermission` | **22** | employees 8 · sites 2 · shift-patterns 2 · monthly-schedules 3 · performance 5 · allowance 2 | §4.1의 역할 |
| `withAdmin` | 🔴 **40** | `operations:*` 전부 | **관리자만** |
| `withAccessHistory` | **1** | `access-logs:list` | **관리자만** |

**합계 검산**: 7 + 6 + 35 + 22 + 40 + 1 = **111**
**영역별 검산**: operations 40 · performance 16 · allowance 13 · employees 12 · app 7 · monthly-schedules 6 · auth 6 · shift-patterns 4 · sites 3 · dashboard 2 · access-logs 2 = **111**
→ `04-api-contract.md` 111개, `src/preload/index.ts` 노출 111개와 일치. §1의 영역별 집계와도 일치.

> **주 — 지적보다 넓게 정정한 부분**: 회신에는 "`auth:*`도 채널별 등록 방식이 다르다"고 되어 있었으나, 다시 읽어 보니 **6개 전부 래퍼가 없다.** `auth:change-password`만 서비스 내부(`auth-service.ts:167-174`)에서 세션을 확인한다. 이 구분까지 표에 적었다.

**🔴 이 재작성에서 새로 드러난 사실 3개** (§4.2 말미 + `11` B-3 주에 반영)

| 사실 | 화면 영향 |
|---|---|
| `allowance:run-approved-calculation` · `set-early-payout` · `export-documents` · `preview-proposal`이 **`withSession`(전 역할)** | **수당 계산 실행·조기 지급일 지정·문서 재출력을 `operator`도 실제로 실행한다.** 회색으로 그리면 실제 능력보다 **좁게** 그리는 것. reviewer·admin 전용은 `review-calculations`·`approve-proposal` 2개뿐 |
| `employees:preview-wage-bulk-update`=`withSession`, `apply-wage-bulk-update`=`withActionPermission` | **미리보기와 실행의 권한이 다르다.** operator·reviewer는 미리보기까지, `[적용]`은 비활성 + 사유 |
| `performance:retry-startup-recovery`=`withSession` | 시작 복구 `[다시 시도]`는 전 역할 (기존 §5.5와 일치) |

---

### 2. B3 — 홈 진행률

#### 2.1 월 배치 계산 방식 — **선택지 ②(현재 활성 배정으로 축소)** 를 사용자가 확정했다

**변경 위치**: `12-능력-매트릭스.md` §5.2 전체 교체 (§5.2.1 철회 + §5.2.2 확정)

v1.1의 **"`employees:list({siteId})` 1회로 그 달 배치 인원을 N+1 없이 셀 수 있다"는 판정을 철회**했다. 철회 사실을 §5.2.1과 §7.1b에 **남겨 두었다.**

선택 이유(사용자 결정): 홈은 앱을 열 때마다 뜨는 화면이라 ①(N+1 수용)은 직원 50명 기준 조회가 **1회 → 51회**로 늘어 첫 화면이 느려진다. 월 중 종료 인원은 실적 엑셀 인테이크에서 어차피 잡히므로, **범위를 좁히고 못 보는 것을 라벨로 밝히는 쪽**을 택했다.

**최종 문구 — 계산식**

```
분모 = 준비 대상 근무지 수 (현재 활성·미삭제)
분자 = ① 이번 달 1일에 유효한 근무 설정이 있고
       AND ② 아래 조건을 만족하는 현재 배정 인력이 1명 이상인 근무지 수

② currentAssignmentStartDate ≤ 이번 달 말일
   AND (currentAssignmentEndDate 없음 OR currentAssignmentEndDate > 이번 달 1일)
```

**종료일 배타 조건 반영 완료.** v1.1의 `≥ 이번 달 1일`은 틀렸다 — 소스(`employee-storage-service.ts:393-396`)가 `end_date > monthStart`이고, `≥`로 하면 **8월 1일에 끝난 배치가 8월에 포함되는** 차이가 난다. 시작일 조건은 **다음 달부터 시작하는 배정을 이번 달로 세지 않기 위해** 남겼다.

**최종 문구 — 라벨** (`12` §5.2.2 · `11` H-1 · `10` §5)

| | v1.1 | 🔴 v1.2 확정 |
|---|---|---|
| 막대 라벨 | `준비 7/10 근무지` | **`준비 7/10 근무지 (현재 배정 기준)`** |
| 보조 문구 | 없음 | **"이번 달 중간에 배정이 끝난 인원은 이 숫자에 들어가지 않습니다. 월 전체 배정 이력은 인력 관리에서 확인하세요."** |

`11-디자인-요청서.md` 검수 체크리스트에 **`(현재 배정 기준)` 표기와 보조 문구가 있는가**를 항목으로 넣었다.

> **`includeHistoricalAssignments`를 몰래 얹어 보내는 방법은 쓰지 않는다.** 내부 타입(`employee-storage-service.ts:21`)에만 있고 공개 계약(`contracts.ts:347-351`)에 없다. 런타임으로는 전달될 수 있으나 계약에 없는 필드에 의존하는 것이라 조용히 깨진다. `12` §5.2.1에 이 판단을 명시했다.

#### 2.2 운영 단계 ③·④ 제거 + 별도 성과 현황 — 지적대로 반영

**변경 위치**: `12-능력-매트릭스.md` §5.1 결합 규칙 재작성 · §5.3 축소 · **§5.3b 신설** · §5.5 할 일 목록 2줄 분리

**최종 문구 — 운영 막대**

```
분모 = 운영 대상 근무지 수 × 2      ← v1.1은 × 4
분자 = 근무지별 완료 단계 수의 합
표기 예: 운영 13/20 단계            ← v1.1은 26/40 단계
```

| 단계 | 완료 조건 | 결합 키 |
|---|---|---|
| ① 근무표 생성 | `monthly-schedules:list`에 이번 달 행 존재 | **`siteId`** |
| ② 게시 완료 | `monthly-schedules:list-exports`에 게시 완료 이력 존재 | **`scheduleId`** |
| ~~③ 실적 유입~~ | 🔴 **제거** → §5.3b | ~~`siteName`~~ |
| ~~④ 승인 완료~~ | 🔴 **제거** → §5.3b | ~~`siteName`~~ |

→ **남은 두 단계는 이름 결합이 하나도 끼지 않는다. 전부 안정 식별자로만 판정한다.**

**최종 문구 — §5.3b 이번 달 실적 현황 (비율 아님, 건수)**

| 표시 | 계산 | 출처 필드 |
|---|---|---|
| 실적이 들어온 근무지 N곳 | `groups.length` | `groups[]` |
| 승인 대기 실적 N건 | Σ `pendingCount` | `PerformanceOverviewSiteGroup.pendingCount` |
| **재승인 필요 N건** | Σ `needsReapprovalCount` | `needsReapprovalCount` |
| **확인 필요(경고) N건** | Σ `alertCount` | `alertCount` |
| 🔴 근무지 연결 불가 N개 | `sites:list`의 어떤 `name`과도 안 맞는 그룹 수 | `groups[].siteName` × `sites[].name` |
| 🔴 중복 이름으로 연결 불확정 N개 | `sites:list`에 같은 `name`이 **2건 이상**인 그룹 수 | 〃 |

🔴 **여기에 완료율·퍼센트를 붙이지 않는다.** 분모를 확정할 수 없어서 분리한 블록이다. `11`의 검수 체크리스트에 이 금지를 항목으로 넣었다.

> **지적과 다르게 한 곳 1개 — 사유를 밝힌다.** 회신은 `재승인/경고 N건`을 **한 줄**로 제시했으나, **두 줄로 나눴다.** `needsReapprovalCount`(다시 승인해야 함)와 `alertCount`(확인이 필요함)는 소스에서 서로 다른 필드이고 **사용자가 할 일이 다르다.** 합치면 어느 쪽인지 알 수 없어 오히려 판단을 흐린다. 이 판단에 이견이 있으면 회신에 적어 달라.

**명칭 정리**: `운영·정산 대상 근무지` → **`운영 대상 근무지`** (`12` §5.1 · `10` §5).
아울러 정의에서 **"실적·수당이 있으면 포함"을 뺐다** — 실적은 `siteId`가 없어 근무지를 확정할 수 없고, 수당은 월 단위라 근무지 분모에 넣을 수 없다. 남은 정의는 **현재 활성 근무지 ∪ 이번 달 근무표(`monthly-schedules:list`)가 있는 근무지**다.

**월 정산 3단계**: 지적대로 **월 단위 레코드 상태로 유지**했다. `12` §5.4에 **"분모는 월 전체 3단계로 고정한다. 근무지 수를 곱하지 않는다"** 를 명시했다.

---

### 3. B7 — `01` 본문 정정 + 잘못된 "확인 완료" 철회

#### 3.1 `01-product-overview.md` §5 — **본문을 직접 고쳤다**

**변경 위치**: `01-product-overview.md` §5 전체 + **§5.1 정정 이력 신설**

**삭제한 문장**: ~~"역할 4단계. 상위 역할은 하위 역할 권한을 포함한다."~~

**최종 문구**:

> 역할은 4개다. 🔴 **계단식이 아니다.** 계획 담당(`planner`)과 승인 담당(`reviewer`)은 **서로 상하 관계가 아닌 형제 역할**이고, 관리자(`admin`)만 전체 권한을 가진다.

표에 **"🔴 할 수 없는 작업"** 열을 추가해 planner ❌ 승인 / reviewer ❌ 등록·배포를 못 박았다.
`operator`도 실행되는 창구(수당 계산·조기 지급일·문서 재출력·시급 일괄 미리보기·시작 복구)를 주(註)로 달았다.
**"승인 담당 이상" 같은 계층 표현 금지**를 이 문서에도 넣었다.
창구 권한의 정본이 `12` §4.2임을 명시했다.

**§5.1 정정 이력 (신설)**

| 날짜 | 정정 내용 | 사유 |
|---|---|---|
| 2026-08-28 | "상위 역할은 하위 역할 권한을 포함한다" 삭제, 형제 관계로 정정, "할 수 없는 작업" 열 추가 | `authorization.ts:11-16`의 `roleRequirementSatisfaction`에서 planner 요구는 `["planner","admin"]`, reviewer 요구는 `["reviewer","admin"]`으로 **서로를 포함하지 않는다.** 이 문서는 설계 전에 먼저 읽는 기준 문서이므로, 정정을 다른 문서에만 적으면 기준이 둘로 갈라진다 (Codex 4차 B7) |

#### 3.2 `12` 의 잘못된 "확인 완료" 표기 철회

**변경 위치**: `12-능력-매트릭스.md` §7.1 해당 행 취소선 + **§7.1b 신설**

| 철회한 표기 | 실제 | 조치 |
|---|---|---|
| "`employees:list({siteId})` 1회로 **그 달 배치 인원**을 N+1 없이 셀 수 있다" | ❌ 공개 계약에 달을 넘길 칸이 없고 기본 조회는 **최신 활성 배치 1건**만 본다 | §5.2 — 현재 배정 기준으로 축소 + 라벨 명시 |
| "`app:*` · `auth:*`는 `withSession`이다" | ❌ 13개 모두 **가드 없음** | §4.2 — 가드별 전면 재작성 |
| "`operations:*` 34개" | ❌ **40개** | §4.2 — 정정 + 111 검산 |

§4.0에도 **"v1.2에서 `01` 본문을 직접 바로잡았고 정정 이력을 남겼다"** 는 조치 결과를 적었다.

---

### 4. B8 — 창 닫기 확인 시점: **구현 착수 전(설계 LOCK 전)** 으로 확정

**변경 위치**: `12-능력-매트릭스.md` §5.7 · §7.2 · `11-디자인-요청서.md` 이탈 모달 절

제시된 두 안 중 **"구현 착수/설계 LOCK 전에 확인하고 파일럿 비범위 유지"** 를 택했다.
이유: 파일럿은 시안·화면 검증 단계라 Electron 창 종료 처리를 확인할 필요가 없다. v1.1의 "파일럿 전에 확인" 문구는 실제 범위와 어긋나 있었다.

| 항목 | 확정 |
|---|---|
| 확인 시점 | **구현 착수 전 = 설계 LOCK 전.** 파일럿 전이 아니다 |
| 파일럿 범위 | ❌ **비범위.** 화면·시나리오·수용 기준 어디에서도 창 닫기 차단을 **제공한다고 표현하지 않는다** |
| 파일럿에서 막는 이탈 경로 | 라우트 이동 · 같은 화면 내 근무지 전환 · 마법사 닫기 · 로그아웃 **4개뿐** |
| 확인 전까지의 가정 | 🔴 **마법사 편집 중 창을 닫으면 내용이 사라진다고 가정한다** |

`11`의 해당 문구도 **"시안·설명·수용 기준 어디에서도 '창을 닫아도 막아 준다'고 쓰지 마세요"** 로 바꿨다.

---

### 5. NTH 3건 — 전부 수용 기준에 넣었다

**변경 위치**: `11-디자인-요청서.md` 검수 체크리스트 + K장 대비 표

- [ ] `aria-disabled="true"` 요소가 **클릭·Enter·Space 어느 쪽으로도 실행되지 않고**, 비활성 사유가 `aria-describedby`로 연결돼 있는가
- [ ] 표를 격자(grid)로 만들었다면 `role="grid"` · `aria-rowcount` · `aria-rowindex` · `aria-selected`를 **어느 요소가 갖는지** 명시돼 있는가
- [ ] 3:1 대비 검사를 **기능성 경계선·상태 전달 요소**에만 적용했는가 (장식선까지 끌어올리지 않았는가)

K장 대비 표의 최종 문구:

> **대비 — 글자가 아닌 것**: 🔴 **기능성 경계선·상태 전달 요소**(입력칸 테두리, 버튼 테두리, 선택 상태 표시, 상태 아이콘·점, 체크박스) **3:1 이상**. 순수 **장식선**(카드 구분선, 표 줄 사이 얇은 선처럼 없어도 뜻이 안 바뀌는 선)은 3:1 대상이 **아닙니다**.

---

## 성공 조건 (검증 가능한 완료 기준)

1. `12` §4.2의 가드별 개수 합이 **111**이고, 영역별 합도 **111**이며, 두 값이 `04-api-contract.md`·`src/preload/index.ts`와 일치한다.
2. `12` §5.2의 배정 판정식에 **종료일 배타(`>`)** 가 반영돼 있고, 준비 막대 라벨에 **`(현재 배정 기준)`** 과 보조 문구가 있다.
3. `12` §5.3의 운영 단계에 **`siteName` 결합이 하나도 없다**(①`siteId`·②`scheduleId`만).
4. 실적 관련 표시가 **전부 건수**이고, `근무지 연결 불가`·`중복 이름으로 연결 불확정`이 **분리돼** 있다.
5. `01-product-overview.md` §5 본문에 **"상위 역할은 하위 역할 권한을 포함한다"가 없고**, 정정 이력이 §5.1에 있다.
6. `12` §7.1b에 **철회한 "확인 완료" 3건**이 사유와 함께 남아 있다.
7. 창 닫기 차단을 **파일럿 범위로 약속하는 문장이 세 문서 어디에도 없다.**

## 제약 (이 작업 내내 지킨 것)

- **이관 코드 수정 금지** — `src/shared/domain/`, `src/main/services/`, `src/main/ipc/`, `src/preload/`, `src/shared/bridge/`, 테스트 990개. 이번 작업은 **읽기만 했다.**
- **DB 스키마 변경 금지** — 표·컬럼 이름 변경, 컬럼 삭제, 외래키 신규 부여, `allowance_calculations.signature` UNIQUE 제거 전부 금지
- **가짜 UI 금지** — 데이터·동작 없는 장식 요소는 시안에 있어도 만들지 않는다
- **실적 직접 입력 화면 금지** — 엑셀 인테이크가 유일한 경로
- **게시 금지** — 사용자 명시 승인 없이는 절대
- **forward-only** — 승인된 계산 결과 무이력 덮어쓰기 금지
- **범위 밖 파일 수정 금지** — 이번에 고친 것은 `01`·`10`·`11`·`12` 문서 4개뿐이다

## 남은 미확인 (숨기지 않고 적는다)

- **창 닫기·앱 종료를 화면이 가로챌 수 있는지** — 구현 착수 전 확인. 파일럿 비범위(§4)
- **실적 표의 실제 응답 속도** — 측정하지 않았다
- **홈이 여러 창구를 동시에 부를 때의 로딩 시간과 일부 실패 상태** — 파일럿 이후 실데이터로 측정 필요
- **2차에서만 나오는 세부 기능**(양식 캔버스 편집기·요율 매트릭스 등)의 입출력 형태

---

## 회신

> **여기에 작성해 주세요.** 아래 양식을 그대로 복사해 채우면 됩니다.

```
판정: AGREE / DISAGREE

[AGREE인 경우]
- 확인한 항목: B2 / B3 / B7 / B8 / NTH
- 남은 조건(있으면):

[DISAGREE인 경우 — 항목별로]
1. 항목(B2/B3/B7/B8/NTH):
   문제:
   소스 근거(파일:줄):
   요구하는 수정:
2. ...

[별도 판단 요청]
- §2.2의 "재승인 필요 / 확인 필요 2줄 분리"(회신은 1줄로 제시)에 이견이 있는가:
```
