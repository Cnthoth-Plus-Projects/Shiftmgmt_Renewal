# HANDOFF — 운영 백업의 추가 4개 표·3개 컬럼 출처 및 보존 판정 요청

- Task: Phase 2 운영 백업 스키마 차이 조사
- Action: INVESTIGATE / DECIDE
- From: Sol(xhigh, Codex) — orchestrator
- To: Codex — 현재 운영 앱·데이터 담당 세션
- Time: 2026-09-17 19:48 KST
- 회신: **필요**
- 제품 코드 수정: **금지 — 이번 요청은 읽기 전용 조사와 판정만**
- V3 저장소: `C:\Projects\Active\ShiftMgmt_V3.4` — 읽기 전용
- V3 기준 commit: `112a4a9d6d090d6cf72c45dc6fd8942cd3b3f80e`
- V4 저장소: `C:\Projects\Active\ShiftMgmt_V4`
- V4 branch/HEAD: `main` / `e88cb92f4d711f6142e6efafea88938bc6a5a1a3`

---

# 회신 요청

**누가**: 현재 운영 앱·데이터의 변경 이력을 알고 있거나 조사할 수 있는 담당 Codex  
**어디에**: 이 파일 맨 아래 `## 회신`  
**언제**: 아래 질문 ①~⑦을 실제 소스·설치 산출물·DB 스키마 근거로 확인한 뒤  
**회신이 없으면**: V4가 운영 데이터 87행과 컬럼 3개를 버리는 상태라 Phase 2-2 이후 진행을 중단함

---

## 1. 요청 목적

현재 운영 앱이 만든 최신 JSON 백업에는 설계 문서와 이관 소스가 모르는 표 4개와 컬럼 3개가 있다.

V4의 실제 미리보기에서는 다음이 재현됐다.

- `employee_employment_periods` **87행 전체를 복원에서 제외**
- 기존 표의 컬럼 3개를 복원에서 제외
- 오류 없이 끝나는 것처럼 보이지만 경고만 남기므로, 그대로 반영하면 운영 데이터가 조용히 누락될 위험이 있음

담당 세션은 이 4개 표와 3개 컬럼이 **어느 버전·소스·요구사항에서 추가됐고 무엇을 보존하는 데이터인지**를 확인하고, V4에 반드시 이관해야 하는지 근거와 함께 판정해 달라.

## 2. 운영 백업 원본

- 파일:
  `C:\Users\pangyo\AppData\Roaming\shiftmgmt-v3-4\data\backups\json\shiftmgmt-backup-20260917-194251.json`
- 생성 시각(JSON): `2026-09-17T10:42:51.877Z` = 2026-09-17 19:42:51 KST
- 파일 시각: 2026-09-17 19:42:52 KST
- 크기: **3,217,906 bytes**
- SHA-256:
  `EFEC1F0EF364E6CA4D88DBBCF8D52E88FFDC2EAC452E258CA7D09B4BDDE28DB9`
- JSON `schemaVersion`: `1`
- JSON 구조: `createdAt`, `schemaVersion`, `tables`
- 실제 표 수: **40**
- 전체 행 수: **3,599**
- 배열이 아닌 표 값: 0
- 같은 폴더의 최신 JSON임을 확인함. 직전 파일은 2026-06-13 백업.

원본 파일은 읽기 전용으로만 열었고, 격리 미리보기 전후 SHA-256이 동일했다.

## 3. 정본과 실제의 충돌

### 3.1 정본 소스

다음 두 파일의 git blob은 동일하다.

- V3 `112a4a9:src/main/services/sqlite-storage-service.ts`
- V4 `HEAD:src/main/services/sqlite-storage-service.ts`
- blob: `5d09922bd188073fef2f7b0d6c5bdf421aec88cd`

두 파일의 `CREATE TABLE IF NOT EXISTS` 선언은 정확히 **36개**다.  
`03-data-model.md`, `CLAUDE.md`, `TODO.md`도 “표 36개”를 정본으로 기록한다.

### 3.2 운영 DB와 최신 JSON

운영 앱 데이터 경로의 현재 SQLite와 최신 JSON은 모두 정확히 **40개 표**이며, 표 이름 집합도 서로 같다.

- SQLite `PRAGMA quick_check`: `ok`
- SQLite 표: 40
- JSON 표: 40
- SQLite에만 있는 표: 0
- JSON에만 있는 표: 0

즉 JSON 파일이 임의로 표를 추가한 것이 아니라, 현재 SQLite 자체가 40개 표를 가진다.

## 4. 소스에 없는 추가 4개 표

| 표 | 현재 행 수 | 관측된 주요 컬럼 | 관측된 제약·인덱스 |
|---|---:|---|---|
| `employee_employment_periods` | **87** | `id`, `employee_id`, `start_date`, `end_date`, `closure_provenance_complete`, `created_at`, `updated_at` | `end_date >= start_date` CHECK, 직원별 열린 기간 1개 UNIQUE partial index |
| `employee_employment_period_events` | 0 | `id`, `employee_id`, `employment_period_id`, `event_type`, `event_date`, `previous_event_date`, `reason`, `created_at` | 직원·생성시각 인덱스 |
| `employee_retirement_history_closures` | 0 | `id`, `employment_period_id`, `history_kind`, `history_id`, 이전 상태·종료일, `created_at` | 기간·종류·이력 ID UNIQUE |
| `wage_rate_history` | 0 | 시급 ID·직원·재직기간·변경 종류·금액·적용기간·사유·처리자·처리시각 | 직원별·시급별 발생시각 인덱스 |

현재 V3/V4 `src/**` 전수 검색에서는 위 네 표 이름이 나오지 않는다. 따라서 현재 저장소 commit만 보고 이 의미를 추측하면 안 된다.

## 5. 기존 표에만 존재하는 추가 3개 컬럼

| 표.컬럼 | SQLite 선언 | V4 미리보기 결과 |
|---|---|---|
| `employee_site_assignments.employment_period_id` | `TEXT NULL` | 현재 구조에 없어 제외 |
| `wage_rates.employment_period_id` | `TEXT NULL` | 현재 구조에 없어 제외 |
| `performance_files.reparse_marker_snapshot_json` | `TEXT NULL` | 현재 구조에 없어 제외 |

첫 두 컬럼은 재직기간과 배정·시급 이력을 연결하는 키처럼 보이지만, 이것은 이름에 근거한 **추정**일 뿐이다. 담당 세션이 실제 요구사항과 생성 코드를 찾아 확정해야 한다.

## 6. V4 격리 미리보기 재현

V4 빌드 산출물의 기존 `previewDatabaseMigrationUpdate`를 빈 임시 데이터 폴더에서 실행했다. 실제 반영은 하지 않았고 임시 SQLite만 만들었다.

결과:

```text
sourceType=json
requirementStatus=not-required
restoredTableCount=31

[제외 컬럼]
employee_site_assignments.employment_period_id
wage_rates.employment_period_id
performance_files.reparse_marker_snapshot_json

[경고]
백업의 다음 표는 현재 버전 구조에 없어 복원에서 제외했습니다:
employee_employment_periods
```

추가 표 4개 중 빈 표 3개는 행이 없어서 경고 목록에 나타나지 않았을 뿐, V4 스키마에는 네 표 모두 없다.

주요 미리보기 건수는 사이트 14, 직원 87, 배정 89(활성 81·종료 8), 시급 87, 패턴 11, 실적 파일 37, 실적 행 350, 승인 263, 수당 계산 263이다. 그러나 재직기간 87행과 컬럼 3개는 보존되지 않는다.

## 7. 반드시 답할 질문

### ① 출처

표 4개와 컬럼 3개를 추가한 실제 소스·브랜치·commit·패치·설치 산출물은 무엇인가?

- commit 해시 또는 파일 경로와 행
- 설치 앱 내부 산출물에서 찾았다면 파일 경로와 SHA-256
- 운영 DB에 적용된 마이그레이션 함수·실행 시점

“아마도”나 이름에 따른 추정은 답으로 인정하지 않는다.

### ② 제품 의미

각 표와 컬럼이 어떤 사용자 동작과 업무 규칙을 보존하는지 설명해 달라.

- 재입사·퇴사·복직 같은 재직기간 관리와의 관계
- 배정·시급의 `employment_period_id` 연결 의미
- `closure_provenance_complete`의 판정 의미
- `performance_files.reparse_marker_snapshot_json`의 생성·사용·복구 의미
- 이 데이터를 잃으면 실제로 어떤 화면·계산·재승인·감사 이력이 틀어지는지

### ③ 정확한 DDL

네 표의 정식 `CREATE TABLE`·인덱스와 세 컬럼의 추가 방식(`ensureColumn` 포함)을 제공해 달라. 현재 DB에서 관측한 DDL과 생성 소스가 일치하는지도 판정한다.

### ④ V4 보존 여부

다음 중 하나를 명시적으로 선택하고 근거를 제시해 달라.

- **PRESERVE_ALL**: 4개 표와 3개 컬럼을 V4에 그대로 추가·복원해야 함
- **TRANSFORM**: 다른 구조로 무손실 변환해야 함 — 정확한 매핑 필요
- **INTENTIONALLY_DROP**: 버려도 됨 — 87행과 연결 컬럼을 버려도 되는 승인된 제품 근거 필요

절대 규칙은 기존 데이터 100% 이어받기, 스키마 이름·타입 유지, 데이터를 조용히 버리지 않기다. 따라서 근거가 없으면 기본 판정은 **PRESERVE_ALL**이다.

### ⑤ “36개” 정본 정정

현재 계획의 “표 36개”를 어떻게 바로잡아야 하는가?

- 실제 정본이 40개인지
- 36개 기본 표 + 4개 런타임 확장 표로 구분해야 하는지
- Phase 2-3 완료 기준을 40/40으로 바꿔야 하는지

### ⑥ 현재 운영 앱의 정체

현재 데이터 경로는 설치본 문서 경로 `%APPDATA%\ShiftMgmt`가 아니라 개발 실행 경로 `%APPDATA%\shiftmgmt-v3-4`다.

담당 세션은 사용 중인 앱이 어느 소스/빌드에서 만들어졌는지 확인하고, `112a4a9`보다 앞선 스키마가 들어간 이유를 밝혀 달라.

### ⑦ 다음 구현 패킷 입력

`PRESERVE_ALL` 또는 `TRANSFORM`이면 Gemini 구현 패킷에 들어갈 다음 정보를 닫힌 목록으로 제안해 달라.

- 수정/생성 파일
- 추가할 DDL·마이그레이션 순서
- JSON 복원 순서
- 기존 36개와 새 4개의 행 수 대조 방식
- 3개 컬럼 손실을 잡는 음성 시험
- 현재 운영 JSON으로 미리보기 시 제외 표·컬럼 0을 증명하는 명령
- 롤백·격리 검증 방법

이번 회신에서 제품 코드를 수정하지 않는다.

## 8. 조사 경계

허용:

- V3/V4 저장소, git 이력, 운영 DB 스키마, 최신 JSON의 스키마·행 수를 읽기 전용 조사
- 현재 사용 중인 앱의 설치/빌드 산출물을 읽기 전용 조사
- SHA-256, byte count, 정적 검색, 격리된 임시 복사본 분석

금지:

- 운영 SQLite 또는 JSON 수정
- V3/V4 제품 코드·테스트·설정 수정
- DB 마이그레이션 실제 적용
- `TODO.md`, `.ai/**`, `Log/**` 수정
- 이 파일의 `## 회신` 위 본문 수정
- 행 값·개인정보를 회신에 노출

---

## 회신

```text
판정: PRESERVE_ALL

1. 출처:
- 표/컬럼:
  - 표 4개: employee_employment_periods, employee_employment_period_events,
    employee_retirement_history_closures, wage_rate_history
  - 컬럼 3개: employee_site_assignments.employment_period_id,
    wage_rates.employment_period_id, performance_files.reparse_marker_snapshot_json
- 실제 소스·commit·파일·행:
  - commit e390e4ca741b767e871cd10e397132b3eb441933
    (2026-09-16 12:30:30 KST, "릴리즈.0.5.8 데이터 안전성 보강")
  - tag v0.5.8, branch fix/wage-ui-batch-1
  - C:\Users\pangyo\orca\workspaces\ShiftMgmt_V3.4\tropicbird\src\main\services\sqlite-storage-service.ts
    :76-120 네 표 중 3개와 인덱스, :125/:142 employment_period_id,
    :440-464 wage_rate_history와 인덱스, :530 reparse_marker_snapshot_json,
    :733-758 legacy 고용기간 백필, :783-786 ensureColumn 3개,
    :921-947 배정·시급 연결키 백필과 연결 인덱스
  - 같은 저장소 src/main/services/database-migration-service.ts:74-82
    JSON 복원 순서에 네 표를 포함
  - 제품 의미 구현은 employee-storage-service.ts:123-335/:1159-1365,
    employee-history-service.ts:843-947,
    app-settings-storage-service.ts:365-518,
    performance-file-storage-service.ts:490-546/:681-698,
    performance-approval-flow-service.ts:513-546에서 확인
  - 위 관련 파일의 e390e4c blob과 현재 HEAD blob은 모두 동일함
- 설치 산출물 근거와 SHA-256:
  - 실제 백업 생성에 사용한 실행본:
    C:\Users\pangyo\orca\workspaces\ShiftMgmt_V3.4\tropicbird\release\publish-output\win-unpacked\ShiftMgmt.exe
    SHA-256 2A7A5949B312421C2C1C5431869726997E3F3C70B51E333538617F9A3CF1B446
  - resources\app.asar
    SHA-256 608DDD986E6D7D2B5A30E6F5D2883142664926C2CBD647ECBA91F6300F02C2E7
  - app.asar 내부 dist-electron\main\services\sqlite-storage-service.js
    SHA-256 237CCC5BB0ABCCE5B6F2056E7850ADEA2186628F214D2DBCB88C917B98EA1BC1
    위 컴파일 파일에서 표 4개와 컬럼 3개를 모두 확인함
  - 게시용 ShiftMgmt-Setup-0.5.8-x64.exe
    SHA-256 70855260EFBCE1F8F8973EF121F2F291499C8D2B2CDE95909551286317E2D727
- DB 적용 시점:
  - main.ts:237-246에서 앱 시작 시 initializeSqliteStorage를 실행하고,
    sqlite-storage-service.ts:951 이후 initializeSqliteStorage가 migrateDatabase를 실행함
  - 실제 v0.5.8 실행본을 2026-09-17 19:42 백업 직전에 시작했으므로 늦어도
    shiftmgmt-backup-20260917-194251.json 생성 전에는 4표·3컬럼·백필이 적용됨
  - SQLite에는 별도 migration journal이 없어 DDL 실행의 정확한 밀리초는 남지 않음
  - DB 파일 LastWriteTime은 2026-09-17 19:42:52, 백업 createdAt은
    2026-09-17T10:42:51.877Z임

2. 제품 의미:
- employee_employment_periods:
  - 동일 employees.id/사번을 사람의 영구 식별자로 유지하면서 입사·퇴사·재입사 기간을
    [start_date, end_date)로 보존함
  - 고용기간 사이 공백은 근무표 편성·실적·시급 적용에서 제외됨
  - employees.hire_date/retire_date/status는 최근 고용기간의 호환용 요약값임
  - 현재 87행이며 closure_provenance_complete=1 85행, 0인 legacy 퇴사행 2개임
- employee_employment_period_events:
  - retired/rehired/retirement-corrected 동작의 날짜, 이전 날짜, 사유를 기록하는 감사 이력
  - 현재 0행이어도 이후 재입사·퇴사일 정정 시 생성되는 제품 표임
- employee_retirement_history_closures:
  - 퇴사 처리로 자동 종료된 배정·시급의 이전 status/end_date를 보관함
  - 퇴사일 정정 시 이전 상태를 복원한 뒤 새 퇴사일로 다시 닫는 데 사용함
  - 잃으면 퇴사일을 뒤로 정정할 때 과거 배정·시급을 안전하게 다시 열 수 없음
- wage_rate_history:
  - 시급 삭제 전 행 전체, 삭제 사유, 작업자·역할·시각을 영구 보존함
  - 이력 INSERT, wage_rates DELETE, 재분석 마커 기록은 한 SQLite 트랜잭션임
  - 현재 0행이어도 시급 삭제 감사의 필수 저장소임
- employment_period_id 2곳:
  - employee_site_assignments는 배정을, wage_rates는 시급을 특정 고용기간에 귀속시킴
  - 이전 고용기간의 미래 예약 시급이나 배정이 재입사 기간으로 자동 승계되는 것을 막음
  - 현재 배정 89행 중 87행, 시급 87행 중 84행에 연결값이 있음. 나머지 NULL도 그대로 보존해야 함
- closure_provenance_complete:
  - 퇴사로 닫힌 배정·시급을 원래 값으로 복구할 근거가 완전한지를 뜻함
  - 0인 legacy 퇴사행은 안전한 복원 근거가 없으므로 퇴사일을 뒤로 미루는 정정을 차단함
- reparse_marker_snapshot_json:
  - 실적을 파싱할 당시 substitute-policy/employee-master/team-work-type/
    monthly-schedule/wage-rate 다섯 토큰을 파일별로 저장함
  - 승인 직전 현재 토큰과 비교하여 오래된 인력·근무표·정책·시급으로 분석된 행의 승인을
    PERFORMANCE_APPROVAL_BLOCKED로 차단함
  - 현재 performance_files 37행의 populated 값은 0이지만 v0.5.8 승인 안전성에 필요한 컬럼임
  - 잃으면 재분석 실패 뒤 옛 시급·옛 인력 기준의 실적이 최신처럼 승인될 수 있음

3. DDL 대조:
- 4개 표:
  - employee_employment_periods(
      id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, start_date TEXT NOT NULL,
      end_date TEXT, closure_provenance_complete INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT,
      CHECK (end_date IS NULL OR end_date >= start_date))
    INDEX idx_employee_employment_periods_employee(employee_id, start_date ASC)
    UNIQUE PARTIAL INDEX idx_employee_employment_periods_open(employee_id)
      WHERE end_date IS NULL
  - employee_retirement_history_closures(
      id TEXT PRIMARY KEY, employment_period_id TEXT NOT NULL,
      history_kind TEXT NOT NULL, history_id TEXT NOT NULL,
      previous_status TEXT, previous_end_date TEXT, created_at TEXT NOT NULL,
      UNIQUE(employment_period_id, history_kind, history_id))
    INDEX idx_employee_retirement_closures_period(employment_period_id, history_kind)
  - employee_employment_period_events(
      id TEXT PRIMARY KEY, employee_id TEXT NOT NULL,
      employment_period_id TEXT NOT NULL, event_type TEXT NOT NULL,
      event_date TEXT NOT NULL, previous_event_date TEXT, reason TEXT,
      created_at TEXT NOT NULL)
    INDEX idx_employee_employment_events_employee(employee_id, created_at DESC)
  - wage_rate_history(
      id TEXT PRIMARY KEY, wage_rate_id TEXT NOT NULL, employee_id TEXT NOT NULL,
      employment_period_id TEXT, employee_code TEXT, employee_name TEXT,
      action_type TEXT NOT NULL, hourly_rate REAL NOT NULL,
      effective_from TEXT NOT NULL, effective_to TEXT, wage_reason TEXT,
      change_reason TEXT NOT NULL, actor_user_id TEXT NOT NULL,
      actor_login_id TEXT NOT NULL, actor_display_name TEXT NOT NULL,
      actor_role TEXT NOT NULL, occurred_at TEXT NOT NULL)
    INDEX idx_wage_rate_history_wage_rate_id(wage_rate_id, occurred_at DESC)
    INDEX idx_wage_rate_history_employee_id(employee_id, occurred_at DESC)
- 3개 컬럼:
  - ensureColumn(database, "employee_site_assignments", "employment_period_id", "TEXT")
  - ensureColumn(database, "wage_rates", "employment_period_id", "TEXT")
  - ensureColumn(database, "performance_files", "reparse_marker_snapshot_json", "TEXT")
  - 모두 TEXT NULL이며 기존 테이블 생성 DDL에도 같은 위치·타입으로 포함됨
  - 연결 인덱스:
    idx_employee_assignments_employment_period(employment_period_id, start_date ASC)
    idx_wage_rates_employment_period(employment_period_id, effective_from ASC)
- 현재 DB와 생성 소스 일치 여부:
  - 일치. 운영 DB sqlite_master와 e390e4c 소스의 컬럼·CHECK·UNIQUE·partial index·일반 index를 대조함
  - SQLite가 sqlite_master에 저장할 때 IF NOT EXISTS를 제거한 표기 차이만 있음
  - PRAGMA quick_check=ok

4. 보존 판정:
- 선택: PRESERVE_ALL
- 87행 처리: ID와 모든 컬럼 값을 그대로 복원하고 직원 87행과의 연결 및 열린 기간 UNIQUE를 검증
- 빈 표 3개 처리: 스키마와 인덱스를 생성하고 0행을 정상 상태로 보존. 빈 표라는 이유로 제외하지 않음
- 컬럼 3개 처리: 이름과 TEXT NULL 타입을 그대로 추가하고 NULL/비NULL 값을 모두 무손실 복원
- 근거:
  - 4개 표와 3개 컬럼은 임시 DB 잔재가 아니라 v0.5.8에 커밋·시험·패키징·공개된 제품 계약임
  - 기존 데이터 100% 승계와 이름·타입 유지 규칙상 drop 승인 근거가 없음
  - TRANSFORM이 필요한 새 모델도 승인되지 않았으므로 현재 구조 그대로 보존해야 함

5. 정본 숫자:
- 36 vs 40:
  - V4 현재 소스는 36표이고 shift_pattern_duty_types를 포함함
  - v0.5.8 e390e4c 소스는 39표이며 이번 4표를 포함하지만 shift_pattern_duty_types는 없음
  - 운영 DB/JSON은 이전 shift_pattern_duty_types를 유지한 채 v0.5.8의 4표가 더해진 합집합 40표임
  - V4 기준 정본은 "기존 36표 + v0.5.8 추가 4표 = 운영 정본 40표"임
  - 네 표는 runtime-only 표가 아니라 배포된 정식 제품 표임
- TODO/03-data-model/CLAUDE 수정 제안:
  - 03-data-model.md 제목·영역표·상세·검증 절차의 36을 40으로 고치고 네 표 및 3컬럼 의미/DDL 추가
  - CLAUDE.md의 "SQLite 표 36개"와 "36개 행 수 일치"를 40개로 변경
  - TODO.md의 Phase 2-3/2.5-6/2.5-7 및 완료 기준에서 36을 40으로 변경
  - app_setting_entries처럼 현재 환경 설정을 유지하는 기존 변환은 행 수 예외를 조용히 두지 말고
    별도 승인된 매핑으로 명시
- Phase 2-3 새 완료 기준:
  - source/target sqlite_master 사용자 표 이름 집합 40/40
  - 40표 각각 행 수와 내용 해시 일치 또는 명시적으로 승인된 변환 결과 일치
  - 새 4표 행 수 87/0/0/0
  - 배정 연결 비NULL 87, 시급 연결 비NULL 84, 재분석 스냅샷 populated 0을 포함해
    3컬럼의 NULL/비NULL 분포와 실제 값 해시 일치
  - 제외 표 0, 제외 컬럼 0, PRAGMA integrity_check=ok, 원본 JSON SHA 불변

6. 운영 앱 식별:
- 앱 버전: 0.5.8
- 소스/빌드:
  - v0.5.8 태그 e390e4ca741b767e871cd10e397132b3eb441933의 공개 패키지 산출물
  - 이번 JSON은 Start Menu 설치본이 아니라 위 release\publish-output\win-unpacked\ShiftMgmt.exe를
    직접 실행해 생성함
  - C:\Projects\Active\ShiftMgmt_V3.4의 112a4a9는 e390e4c의 단순 이전 커밋이 아님
  - 두 계열은 456bbdb18f48bc6f559df9d6985c2996789c1aeb에서 갈라졌고,
    V4가 112a4a9 계열 36표 소스를 가져온 뒤 별도 릴리즈 계열의 v0.5.8 변경을 놓친 상태임
- 데이터 경로가 개발 경로인 이유:
  - app.asar/package.json의 name은 shiftmgmt-v3-4, version은 0.5.8임
  - main.ts는 SHIFTMGMT_USER_DATA_DIR가 있을 때만 app.setPath("userData")로 덮어씀
  - 이번 실행에는 override가 없어서 packaged 앱도
    C:\Users\pangyo\AppData\Roaming\shiftmgmt-v3-4를 기본 userData로 사용함
  - 따라서 이 경로는 이번 패키지에서 개발 전용이 아니라 실제 packaged 기본 경로이며,
    %APPDATA%\ShiftMgmt라고 적은 문서가 현재 패키지와 불일치함

7. Gemini 구현 패킷 입력:
- allowlist:
  - C:\Projects\Active\ShiftMgmt_V4\src\main\services\sqlite-storage-service.ts
  - C:\Projects\Active\ShiftMgmt_V4\src\main\services\sqlite-storage-service.test.ts
  - C:\Projects\Active\ShiftMgmt_V4\src\main\services\database-migration-service.ts
  - C:\Projects\Active\ShiftMgmt_V4\src\main\services\database-migration-service.test.ts
  - C:\Projects\Active\ShiftMgmt_V4\scripts\verify-v3-json-migration.mjs
  - 정본 03-data-model.md/CLAUDE.md/TODO.md는 코드 검증 후 Sol이 별도 문서 allowlist로 갱신
- 구현 순서:
  1) migrateDatabase의 employees 다음에 고용기간/closure/event 표와 인덱스 추가
  2) access_logs 다음에 wage_rate_history와 인덱스 추가
  3) 기존 employees에서 legacy 고용기간 백필
     id='legacy:'||employees.id, start=hire_date, end=retire_date,
     retired이면 closure_provenance_complete=0, 아니면 1
  4) 3컬럼을 ensureColumn(TEXT)으로 추가
  5) 배정 시작일/시급 적용일에 맞는 가장 최근 고용기간으로 employment_period_id 백필
  6) 연결 인덱스 2개 추가
  7) JSON_IMPORT_TABLE_ORDER를 sites → employees → employee_employment_periods →
     employee_site_assignments → wage_rates → wage_rate_history →
     employee_retirement_history_closures → employee_employment_period_events → 기존 나머지로 변경
  8) e390e4c의 sqlite-storage-service.test.ts:15-188 및
     database-migration-service.test.ts:158-381 관련 회귀를 V4에 맞게 포팅
  9) 실제 운영 JSON은 temp userData/temp SQLite에만 preview와 restore 실행
- 검증 명령:
  - npx vitest run src/main/services/sqlite-storage-service.test.ts src/main/services/database-migration-service.test.ts --maxWorkers=1 --minWorkers=1
  - npm run typecheck
  - npm run build
  - node scripts/verify-v3-json-migration.mjs --input "C:\Users\pangyo\AppData\Roaming\shiftmgmt-v3-4\data\backups\json\shiftmgmt-backup-20260917-194251.json" --expected-sha EFEC1F0EF364E6CA4D88DBBCF8D52E88FFDC2EAC452E258CA7D09B4BDDE28DB9 --expected-tables 40 --expected-rows 3599
- 음성 시험:
  - fixture에 4표 행과 3컬럼 sentinel 값을 넣고 preview/실복원 후 제외 표 0·제외 컬럼 0 및
    값 동일을 확인. 표/컬럼 중 하나를 구현에서 빼면 반드시 실패해야 함
  - 기존 "unknown backup columns는 skip" 시험과 별도로, 이번 3컬럼은 known required columns라서
    skip 경고가 한 줄이라도 발생하면 실패하도록 함
  - 실제 JSON 검증은 표 집합 40/40, 새 4표 87/0/0/0, 전체 3599행 대조,
    source SHA unchanged, PRAGMA integrity_check=ok를 요구
- 롤백:
  - 운영 SQLite에는 preview/update를 실행하지 않음
  - mkdtemp로 만든 V4 전용 userData·SQLite만 사용하고 성공/실패 모두 정리
  - 검증 전후 원본 JSON SHA-256을 재확인
  - 실제 반영 단계에서는 기존 temp DB 원자 교체와 복원 직전 백업을 유지
  - 스키마 보존만으로 v0.5.8 기능 동등성이 완성되는 것은 아님. Phase 2-3에서 무손실 보존을
    먼저 닫고, 이후 재입사·퇴사일 정정·재분석 승인 차단 서비스 로직도 별도 포팅해야 함

미해결:
- 없음. DDL 적용의 정확한 밀리초는 migration journal 부재로 특정할 수 없지만,
  적용 소스·산출물·시작 경로와 백업 전 적용 사실은 확정됨
```
