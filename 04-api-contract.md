# 04. 화면 ↔ 내부 기능 계약 (현행 111개 · Phase 2.5 목표 107개)

> 새 화면이 붙을 **자리 목록**이다. §2는 Phase 2 종료 시점의 111개 계약, §4는 R-15에 따라 바뀌는 Phase 2.5 목표 계약이다.
> **「API 111개를 그대로 유지한다」는 원칙의 승인된 예외는 문서 양식과 JSON 백업·복원뿐**이다. 폐기하지 않는 100개는 이름을 유지하되 DB 4개는 JSON 전용으로 서명을 좁히며, 그 밖의 96개는 입출력까지 유지한다.
>
> 현행 원본: `src/shared/bridge/contracts.ts` · `src/shared/bridge/channel-contracts.ts` · `src/web/bridge/app-bridge.ts` · `src/main/http/routes/`

---

## 1. 구조

```
화면 (브라우저)
   ↓  appBridge.기능이름(입력)
web/bridge/app-bridge.ts  (채널 계약에 따라 fetch)
   ↓  POST /api/영역:동작
main/http/routes/*  (세션·권한 검사 → 서비스 호출)
   ↓
main/services/*-service.ts  →  shared/domain/*  →  SQLite
```

- 화면은 **Node API를 직접 쓰지 않는다.** 파일·DB·OS 접근은 로컬 서버의 이 창구를 통한다.
- 채널 이름 규칙: `영역:동작` (예: `employees:save`)
- 모든 함수는 **Promise를 반환**한다.
- 권한 검사는 **서버 쪽 라우트에서 강제**한다. 화면의 버튼 숨김은 편의일 뿐 보안이 아니다.

### 응답 형태
대부분 `{ ok: true, data }` 또는 `{ ok: false, errorCode, message }` 형태다. `message`는 **한국어**로 화면에 그대로 띄울 수 있게 돼 있다.

---

## 2. 영역별 API 목록

### 2.1 앱·업데이트 (7)
| 채널 | 역할 |
|---|---|
| `app:get-version` | 현재 버전 |
| `app:get-health` | 앱 상태(DB 연결, 폴더 설정 여부, 세션 정책) |
| `app:get-update-state` | 업데이트 상태 |
| `app:check-for-update` | 업데이트 확인 |
| `app:download-update` | 내려받기 |
| `app:install-update` | 설치·재시작 |
| `app:dismiss-update-notice` | 알림 닫기 |

### 2.2 로그인·계정 (6)
| 채널 | 역할 |
|---|---|
| `auth:sign-in` | 로그인 |
| `auth:sign-out` | 로그아웃 |
| `auth:get-session` | 현재 세션 |
| `auth:change-password` | 비밀번호 변경 (최초 로그인 시 강제) |
| `auth:get-account-recovery-availability` | 복구키 사용 가능 여부 |
| `auth:recover-admin-account` | 관리자 계정 복구 |

### 2.3 인력 관리 (12)
| 채널 | 역할 |
|---|---|
| `employees:list` | 목록 (근무지·상태·검색어 필터) |
| `employees:save` | 등록·수정 |
| `employees:delete` | 삭제(소프트) |
| `employees:list-wage-rates` | 시급 이력 |
| `employees:save-wage-rate` | 시급 등록 (**과거 날짜 소급 가능**) |
| `employees:close-wage-rate` | 시급 종료일 지정 |
| `employees:list-assignments` | 배정 이력 |
| `employees:save-assignment` | 근무지·조 배정 |
| `employees:close-assignment` | 배정 해지 |
| `employees:reorder-assignment` | **조 안 순서 이동 (위/아래)** — 배포 엑셀 줄 순서 |
| `employees:preview-wage-bulk-update` | 시급 엑셀 일괄 적용 **미리보기** |
| `employees:apply-wage-bulk-update` | 시급 일괄 적용 실행 |

### 2.4 근무지·근무패턴 (6)
| 채널 | 역할 |
|---|---|
| `sites:list` / `sites:save` / `sites:delete` | 근무지 |
| `shift-patterns:list` | 근무 설정 목록 (**버전들이 함께 온다**) |
| `shift-patterns:save` | 설정 저장 (묶음·조·근무유형 전체를 한 트랜잭션으로) |
| `shift-patterns:deactivate` | 설정 중지 |
| `shift-patterns:analyze-import` | **기존 근무표 엑셀에서 패턴 역추출** (조 구성·주기·시작위치 자동 감지) |

### 2.5 근무표 배포 (6)
| 채널 | 역할 |
|---|---|
| `monthly-schedules:list` | 근무표 목록 |
| `monthly-schedules:save` | 근무표 저장 |
| `monthly-schedules:preview-plan` | 배포 엑셀 미리보기 |
| `monthly-schedules:export-plan` | 배포 엑셀 생성 |
| `monthly-schedules:publish-export` | 배포 폴더로 게시 |
| `monthly-schedules:list-exports` | 배포 이력 |

### 2.6 실적 관리 (16)
| 채널 | 역할 |
|---|---|
| `performance:list-files` | 들어온 파일 목록 |
| `performance:list-pending-files` | 승인대기 파일 |
| `performance:get-file-detail` | 파일 상세(행·경고·승인이력) |
| `performance:get-pending-file-detail` | 대기 파일 상세 |
| `performance:list-overview` | **근무지별 실적 전체 현황** (화면의 주력 API) |
| `performance:get-sync-state` | 인테이크 진행 상태 (스캔·해석 중) |
| `performance:get-startup-recovery-status` | 시작 시 자동 복구 결과 |
| `performance:retry-startup-recovery` | 복구 재시도 |
| `performance:approve` | **승인 (수당 계산이 같은 트랜잭션에서 실행됨)** |
| `performance:reject` | 반려 (사유 필수) |
| `performance:return-to-pending` | 승인대기로 되돌리기 |
| `performance:finalize-reapproved-file` | 재승인본 확정 |
| `performance:get-comparison` | 현재 행 ↔ 승인된 행 비교 |
| `performance:hide-approved-row` | 승인행 숨김 |
| `performance:list-approval-history` | 승인 이력 |
| `performance:open-source-file` | 원본 엑셀 열기 |

### 2.7 수당 관리 (13)
| 채널 | 역할 |
|---|---|
| `allowance:list-results` | 계산 결과 목록 |
| `allowance:list-history` | 이력 (상태 필터) |
| `allowance:preview-calculation` | 계산 미리보기 |
| `allowance:run-approved-calculation` | 승인건 계산 실행 |
| `allowance:review-calculations` | **수당 승인/반려 (여러 건 한 번에)** |
| `allowance:list-approval-history` | 수당 승인 이력 |
| `allowance:list-approved-targets` | 품의 대상 목록 |
| `allowance:set-early-payout` | 조기 지급일 지정 |
| `allowance:preview-proposal` | **품의 미리보기** (근무지별 요약·정규/조기 분리) |
| `allowance:approve-proposal` | **품의 승인 → 문서 3종 출력 + 백업** |
| `allowance:export-documents` | 문서 재출력 |
| `allowance:list-document-exports` | 출력 이력 |
| `allowance:list-proposal-approvals` | 품의 승인 이력 |

### 2.8 대시보드 (2)
| 채널 | 역할 |
|---|---|
| `dashboard:export-chart-data` | 차트 데이터 내보내기 |
| `dashboard:export-report` | 보고서 내보내기 |

### 2.9 운영 관리 — 관리자 전용 (현행 40)

**설정·폴더**
`operations:get-app-settings`, `operations:save-app-settings`, `operations:select-directory`, `operations:select-spreadsheet-file`, `operations:select-document-template-file`, `operations:select-migration-file`

**폴더 감시**
`operations:get-file-watch-status`, `operations:restart-file-watch`, `operations:stop-file-watch`

**공휴일**
`operations:list-holiday-calendars`, `operations:fetch-holiday-api-items`, `operations:replace-holiday-calendar`, `operations:add-holiday-item`, `operations:rename-holiday-item`, `operations:delete-holiday-item`

**수당 요율**
`operations:list-allowance-rate-versions`, `operations:save-allowance-rate-version`, `operations:delete-allowance-rate-version`, `operations:list-allowance-rate-history`

**사용자**
`operations:list-users`, `operations:save-user`, `operations:delete-user`, `operations:rotate-account-recovery-key`

**문서 양식**
`operations:list-document-template-versions`, `operations:save-document-template-version`, `operations:approve-document-template-version`, `operations:delete-document-template-version`, `operations:set-default-document-template-version`, `operations:update-document-template-output-file-name`, `operations:inspect-document-template`, `operations:preview-document-template`, `operations:list-document-template-history`

**데이터베이스**
`operations:check-database-migration-requirements`, `operations:preview-database-migration-update`, `operations:update-database-from-migration`, `operations:run-database-backup-now`

**기타**
`operations:list-site-name-options`, `operations:save-site-name-option`, `operations:delete-site-name-option`, `operations:list-release-history`

### 2.10 활동 이력 (2)
`access-logs:list`, `access-logs:record`

---

## 3. 새 화면을 만들 때 주의할 API

### 3.1 되돌릴 수 없는 것 — 반드시 확인 단계를 둘 것
| API | 결과 |
|---|---|
| `performance:approve` | 승인 + 수당 계산이 확정된다 |
| `allowance:approve-proposal` | 품의 확정 + 문서 파일 생성 + 백업 |
| `monthly-schedules:publish-export` | 배포 폴더에 게시 |
| `employees:delete` / `sites:delete` | 소프트 삭제이지만 화면에서 사라짐 |
| `operations:update-database-from-migration` | **데이터베이스 교체** |

### 3.2 오래 걸리는 것 — 진행 표시가 필요
| API | 특징 |
|---|---|
| `performance:list-overview` | 한 달 수천 행 집계 |
| `allowance:approve-proposal` | 엑셀 3개 생성 + 백업 |
| `shift-patterns:analyze-import` | 엑셀 전체 스캔·패턴 감지 |
| `operations:update-database-from-migration` | 전체 이관 |
| `performance:get-sync-state` | **인테이크 진행률을 폴링해 보여주는 용도** |

### 3.3 미리보기 → 실행 짝
아래는 반드시 **미리보기를 먼저 보여주고 사용자가 확인한 뒤** 실행해야 한다(현재 설계가 그렇게 돼 있다).
```
employees:preview-wage-bulk-update   →  employees:apply-wage-bulk-update
allowance:preview-proposal           →  allowance:approve-proposal
monthly-schedules:preview-plan       →  monthly-schedules:export-plan
operations:preview-database-migration-update → operations:update-database-from-migration
```

---

## 4. Phase 2.5 목표 계약 — R-15 승인 예외

### 4.1 채널 교체와 개수

현행 111개에서 아래 11개를 폐기하고 7개를 추가한다. 따라서 목표는 **107개**, 운영 관리 영역은 **40개 → 36개**다. 이 변화는 Phase 2.5 구현이 끝난 뒤에만 실제 계약 수로 승격한다.

**폐기 11개**

- 파일 등록·검사: `operations:select-document-template-file`, `operations:inspect-document-template`
- 파일 기반 양식 버전 관리: `operations:list-document-template-versions`, `operations:save-document-template-version`, `operations:approve-document-template-version`, `operations:delete-document-template-version`, `operations:set-default-document-template-version`, `operations:update-document-template-output-file-name`, `operations:preview-document-template`, `operations:list-document-template-history`
- Access·JSON 공용 선택: `operations:select-migration-file`

**추가 7개**

| 채널 | 입력·결과의 핵심 | 규칙 |
|---|---|---|
| `operations:list-document-layouts` | 6개 문서 종류와 근무표 변형별 활성 판·프로그램 내 기본 레이아웃 사용 여부 | 저장된 기본 버전 플래그나 파일 경로를 반환하지 않는다 |
| `operations:get-document-layout` | `{ documentKind, variant? }` → 저장본 또는 프로그램 내 기본 레이아웃, 판 식별자, 편집 가능 범위 | 저장본이 없으면 기본 레이아웃을 해석해 반환 |
| `operations:save-document-layout` | 레이아웃 정의 + `expectedRevisionId` → 검증 후 새 활성 판 저장 | 성공한 저장은 즉시 활성화하며 기존 판은 이력으로 보존 |
| `operations:reset-document-layout` | 문서 종류·변형 → 프로그램 내 기본 레이아웃으로 새 판 생성 | 삭제가 아니라 되돌리기 이력을 남긴다 |
| `operations:preview-document-layout` | 저장 전 레이아웃 초안 + 시험 데이터 → 실제 생성기로 만든 미리보기와 검증 결과 | 별도 가짜 렌더러 금지, 저장하지 않는다 |
| `operations:list-document-layout-history` | 문서 종류·변형별 판 이력 | 과거 판 삭제·덮어쓰기 없음 |
| `operations:select-json-backup-file` | OS 선택창 → `.json` 경로 또는 취소 | `.accdb`·`.xlsx` 선택 금지 |

문서 레이아웃 6종은 `schedule-xlsx`(변형 `template1`·`template2`), `proposal-xlsx`, `attachment1-xlsx`, `attachment2-xlsx`, `proposal-pdf`, `dashboard-report-pdf`다. `outputFileNamePattern`은 레이아웃 정의에 포함하므로 별도 파일명 변경 채널을 두지 않는다.

#### 4.1.1 신규 7개 채널의 정확한 타입

모든 결과는 기존과 같은 `BridgeResult<T>`로 감싼다. 취소는 성공 응답의 `data: null`이며 오류로 만들지 않는다.

```ts
type DocumentKind =
  | "schedule-xlsx"
  | "proposal-xlsx"
  | "attachment1-xlsx"
  | "attachment2-xlsx"
  | "proposal-pdf"
  | "dashboard-report-pdf";

type DocumentLayoutKey =
  | { documentKind: "schedule-xlsx"; variant: "template1" | "template2" }
  | {
      documentKind: Exclude<DocumentKind, "schedule-xlsx">;
      variant?: never;
    };

interface DocumentLayoutBlock {
  id: string;
  kind: "title" | "header" | "field" | "summary" | "table" |
    "signature" | "week" | "note" | "logo" | "footer";
  page?: number;
  layoutMode?: "absolute" | "flow";
  flowOrder?: number;
  autoHeight?: boolean;
  repeatHeaderOnPageBreak?: boolean;
  pageBreakBefore?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  text?: string;
  logoAssetId?: string | null;
  columnWidths?: Record<string, number>;
  font?: {
    family: string;
    sizePt: number;
    bold?: boolean;
    italic?: boolean;
    color?: string;
  };
  bindingKey?: string;
}

type DocumentLayoutMemberId = "main" | "proposal" | "attachment1" | "attachment2";

interface DocumentLayoutCanvas {
  unit: "cell" | "mm";
  width: number;
  height: number;
  paperSize?: "A4";
  orientation?: "portrait" | "landscape";
  marginsMm?: { top: number; right: number; bottom: number; left: number };
}

interface DocumentLayoutOutputMember {
  memberId: DocumentLayoutMemberId;
  canvas: DocumentLayoutCanvas;
  outputFileNamePattern: string;
  blocks: DocumentLayoutBlock[];
}

type DocumentLayoutDefinition = DocumentLayoutKey & {
  schemaVersion: string;
  generatorCompatibilityVersion: string;
  outputs: [DocumentLayoutOutputMember, ...DocumentLayoutOutputMember[]];
};

type DocumentLayoutEditableProperty =
  | "position" | "size" | "visibility" | "text" | "logo"
  | "column-width" | "font";

type DocumentLayoutProtectedProperty =
  | "row-order" | "value" | "binding" | "row-height" | "merge";

interface DocumentLayoutBlockCapability {
  blockId: string;
  editableProperties: DocumentLayoutEditableProperty[];
  protectedProperties: Array<
    DocumentLayoutProtectedProperty | DocumentLayoutEditableProperty
  >;
}

interface DocumentLayoutCapabilities {
  editableProperties: DocumentLayoutEditableProperty[];
  protectedBlockIds: string[];
  protectedProperties: DocumentLayoutProtectedProperty[];
  blockCapabilities: DocumentLayoutBlockCapability[];
}

type DocumentLayoutSummary = DocumentLayoutKey & {
  activeRevisionId: string | null;
  usingBuiltInDefault: boolean;
  updatedAt: string | null;
};

type DocumentLayoutSnapshot = DocumentLayoutSummary & {
  definition: DocumentLayoutDefinition;
  capabilities: DocumentLayoutCapabilities;
};

interface DocumentLayoutSaveInput {
  definition: DocumentLayoutDefinition;
  expectedRevisionId: string | null;
  changeReason?: string;
}

type DocumentLayoutResetInput = DocumentLayoutKey & {
  expectedRevisionId: string | null;
  changeReason?: string;
};

interface DocumentLayoutPreviewInput {
  definition: DocumentLayoutDefinition;
  basedOnRevisionId: string | null;
}

interface DocumentLayoutValidationIssue {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string; // 사용자 표시용 한국어
}

interface DocumentLayoutPreviewOutput {
  memberId: DocumentLayoutMemberId;
  mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" |
    "application/pdf";
  previewUrl: string;
  expiresAt: string;
}

interface DocumentLayoutPreview {
  previewId: string;
  outputs: [DocumentLayoutPreviewOutput, ...DocumentLayoutPreviewOutput[]];
  validationIssues: DocumentLayoutValidationIssue[];
}

type DocumentLayoutHistoryRecord = DocumentLayoutKey & {
  revisionId: string;
  versionLabel: string;
  changeReason?: string;
  createdAt: string;
  isActive: boolean;
};

interface JsonBackupFileSelectionInput {
  defaultPath?: string;
}

interface JsonBackupFileSelection {
  fileName: string;
  filePath: string;
}
```

| 채널 | 메서드 계약 |
|---|---|
| `operations:list-document-layouts` | `() => Promise<BridgeResult<DocumentLayoutSummary[]>>` |
| `operations:get-document-layout` | `(input: DocumentLayoutKey) => Promise<BridgeResult<DocumentLayoutSnapshot>>` |
| `operations:save-document-layout` | `(input: DocumentLayoutSaveInput) => Promise<BridgeResult<DocumentLayoutSnapshot>>` |
| `operations:reset-document-layout` | `(input: DocumentLayoutResetInput) => Promise<BridgeResult<DocumentLayoutSnapshot>>` |
| `operations:preview-document-layout` | `(input: DocumentLayoutPreviewInput) => Promise<BridgeResult<DocumentLayoutPreview>>` |
| `operations:list-document-layout-history` | `(input: DocumentLayoutKey) => Promise<BridgeResult<DocumentLayoutHistoryRecord[]>>` |
| `operations:select-json-backup-file` | `(input?: JsonBackupFileSelectionInput) => Promise<BridgeResult<JsonBackupFileSelection | null>>` |

`expectedRevisionId`/`basedOnRevisionId`는 저장본이 없으면 `null`이다. 저장·되돌리기는 값이 현재 활성 판과 다르면 충돌로 거부한다. 미리보기는 레이아웃 편집용 **프로그램 내 결정적 시험 데이터**를 실제 생성기에 넣으며 업무 데이터나 사용자가 임의로 넘긴 값을 저장하지 않는다. 각 `outputs[]`의 `previewUrl`은 로컬 서버의 만료 URL이고 해당 `expiresAt` 뒤 접근할 수 없다.

### 4.2 레이아웃 정의의 최소 계약

레이아웃 정의는 JSON이며 최소한 다음 정보를 가진다.

- `schemaVersion`, `generatorCompatibilityVersion`, `documentKind`, 선택적 `variant`
- 물리 출력 멤버별 캔버스·출력 파일명 규칙과, 그 멤버에 속한 블록의 식별자·종류·페이지·고정/흐름 배치·위치·크기·자동 높이·반복 머리글·표시 여부·문구·로고·열 너비·글꼴
- 변경할 수 없는 블록/필드와 근무표 회수 해석에 필요한 구조 표시

`outputs`는 논리 레이아웃을 실제 파일 단위로 직렬화한다. `proposal-pdf` 이외의 레이아웃은 `memberId="main"`인 멤버를 정확히 1개 둔다. `proposal-pdf`는 순서대로 `proposal`, `attachment1`, `attachment2`를 정확히 3개 두며, 각 멤버가 독립 `canvas`·`outputFileNamePattern`·`blocks`를 가진다. 따라서 품의서/별첨2의 A4 세로와 별첨1의 A4 가로, 서로 다른 세 파일명을 한 저장본에서 손실 없이 표현한다. 멤버 ID 중복, 정해진 개수·순서 위반, 블록 ID 중복은 저장과 미리보기에서 오류로 거부한다.

사용자가 바꿀 수 있는 속성의 전체 합집합은 **위치·크기·표시 여부·문구·로고·열 너비·글꼴**이다. 실제 허용 범위는 `blockCapabilities`를 우선하며, 문서 전체 합집합만 보고 모든 블록을 편집 가능하다고 판정하면 안 된다. **행 순서, 계산값, 필드 값·바인딩, 행 높이, 병합 범위, 근무표 회수 해석에 필요한 표 내부 구조**는 저장과 미리보기 양쪽에서 거부한다. 2.5-1 v1.0은 행 높이·병합 편집 예외를 두지 않는다. 상세 좌표와 블록별 보호 목록은 `Phase2.5/01-기본-레이아웃-6종-명세-v1.0.md`가 소유한다.

저장소는 기존 `document_template_versions`를 재사용한다. `profile_json`에 레이아웃 정의를 넣고 `source_path`는 빈 문자열로 둔다. 새 테이블을 만들지 않는다. 저장 키는 `template_type`의 문자열 `schedule-xlsx/template1`, `schedule-xlsx/template2`, 또는 나머지 `DocumentKind` 값이다. `profile_json`의 `documentKind`·`variant`는 이 키와 반드시 일치해야 한다.

저장·되돌리기는 한 트랜잭션에서 새 행을 `status='approved'`, `is_default=1`로 넣고 같은 저장 키의 이전 행을 `is_default=0`으로 바꾼다. `is_default=1`인 행이 활성 판이며 2개 이상이면 데이터 오류로 거부한다. 행이 없으면 프로그램 내 기본 레이아웃이 활성이다. 이 두 열은 저장 제약과 활성 판 조회에만 쓰며 사용자 승인·기본 파일 선택 능력으로 노출하지 않는다. 기존 `schedule`/`proposal`/`attachment1`/`attachment2` 행 또는 `source_path`가 비어 있지 않은 행은 역사 데이터로만 남기고 신규 레이아웃 조회·생성에서 제외한다. 삭제는 없다.

### 4.3 JSON 전용 백업·복원 서명

기존 데이터베이스 채널 이름 4개는 유지하되 입력·출력을 JSON 전용으로 좁힌다.

| 채널 | Phase 2.5 목표 |
|---|---|
| `operations:check-database-migration-requirements` | `JsonDatabaseRestoreInput → JsonDatabaseRestoreRequirementCheck`; JSON 형식·스키마 판·체크섬·필수 표를 검사한다. Access 공급자·선택 표 입력은 없다 |
| `operations:preview-database-migration-update` | `JsonDatabaseRestoreInput → JsonDatabaseRestorePreview`; 표별 이전/이후 행 수, 경고, 토큰, SHA를 반환한다 |
| `operations:update-database-from-migration` | `JsonDatabaseRestoreExecuteInput → JsonDatabaseRestoreSummary`; 같은 경로·토큰·SHA·확인 문구를 대조한 뒤 교체한다 |
| `operations:run-database-backup-now` | `void → JsonDatabaseBackupSummary`; JSON 백업 경로·SHA·표/행 수만 반환한다 |

```ts
interface JsonDatabaseRestoreInput {
  backupFilePath: string;
}

type JsonDatabaseRestoreRequirementStatus =
  | "ready"
  | "invalid-json"
  | "unsupported-schema"
  | "missing-table"
  | "check-failed";

interface JsonDatabaseRestoreRequirementCheck {
  sourceType: "json";
  isReady: boolean;
  status: JsonDatabaseRestoreRequirementStatus;
  checkedAt: string;
  backupSha256?: string;
  schemaVersion?: string;
  tableCount?: number;
  headline: string;
  details: string[];
  recommendedActions: string[];
}

interface JsonDatabaseTableImpact {
  tableName: string;
  currentRowCount: number;
  nextRowCount: number;
}

interface JsonDatabaseRestorePreview {
  sourceType: "json";
  backupFilePath: string;
  backupSha256: string;
  schemaVersion: string;
  previewToken: string;
  expiresAt: string;
  tableImpacts: JsonDatabaseTableImpact[]; // 40표 전부
  warningMessages: string[];
  previewedAt: string;
}

interface JsonDatabaseRestoreExecuteInput extends JsonDatabaseRestoreInput {
  backupSha256: string;
  previewToken: string;
  confirmationText: "교체";
}

interface JsonDatabaseBackupSummary {
  createdAt: string;
  jsonBackupPath: string;
  backupSha256: string;
  schemaVersion: string;
  tableCount: number;
  rowCount: number;
  warningMessages: string[];
}

interface JsonDatabaseRestoreSummary {
  sourceType: "json";
  backupFilePath: string;
  sourceBackupSha256: string;
  databasePath: string;
  tableResults: JsonDatabaseTableImpact[];
  backupBeforeRestore: JsonDatabaseBackupSummary;
  warningMessages: string[];
  completedAt: string;
}
```

메서드 서명은 각각 `(input: JsonDatabaseRestoreInput)`, `(input: JsonDatabaseRestoreInput)`, `(input: JsonDatabaseRestoreExecuteInput)`, `()`이며 모두 `Promise<BridgeResult<...>>`를 반환한다. `previewToken`은 서버가 백업 SHA·현재 DB 상태·만료 시각에 묶어 발급하는 불투명한 일회용 값이다. 만료·재사용·SHA 불일치·미리보기 뒤 DB 상태 변경은 실행을 거부한다.

복원 범위는 Phase 2의 **40표 스키마 / 일반 표 39개 데이터**가 기준이다. `app_setting_entries` 변환은 **2026-09-27 사용자 승인**에 따라 복원 대상 기기의 폴더 경로·백업 주기/시각·공휴일 API 주소·기기별 상태를 유지하고, 근무표 경고 기준 4개와 수당 정책 시작일 2개는 선택한 JSON 값으로 복원한다. `migration_file_path`는 이번에 선택한 JSON 경로로 설정한다. 설치 파일에 개발 PC 데이터를 자동 포함하지 않는다. 키별 목록·누락/중복·재해석 표지와 검증 기준은 `Phase2.5/05-2.5-6-JSON-단일화-설계-v1.0.md` §3이 소유한다. 기존 `schemaVersion: 1` JSON에는 내장 체크섬이 없으므로 §4.3의 체크섬 검사는 원본 바이트 SHA-256을 산출해 미리보기·실행 사이의 동일성을 대조하는 뜻이며, 독립적인 원본 진위 인증을 뜻하지 않는다.

### 4.4 구현 동기화 규칙

1. 위 목표 계약은 Phase 2.5 설계 정본이며 **현재 소스에 이미 구현됐다는 뜻이 아니다**.
2. 구현할 때 `contracts.ts` · `channel-contracts.ts` · 웹 브리지 · HTTP 라우트 · 서비스 · 계약 수 테스트를 한 변경으로 맞춘다.
3. DB 4개를 뺀 96개 불변 채널은 이름·메서드·입출력·권한 가드를 바꾸지 않는다. DB 4개는 이름·권한은 유지하고 §4.3의 서명만 적용한다.
4. 새 7개와 서명이 좁아지는 DB 4개는 모두 관리자 전용이다.
5. 화면에서 버튼을 숨겨도 권한 검사는 서버 쪽에 남긴다.
