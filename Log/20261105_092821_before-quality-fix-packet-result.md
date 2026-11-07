# FINAL-QUALITY-FIX-01 — 계정 안전성·실적 수정 안내

사용자 승인: 2026-11-05 최종 품질 점검 결과에 “오케이 진행하자”. 이번 leaf는 Q01~Q04 구현·회귀·실제 화면 확인까지다. Q05 CSP/메뉴/내 계정, Q07 취소 전 이력, 양식·운영 준비는 후속 순서로 유지한다. Q07은 권장 보존 방향으로 준비하되 이번 파일 범위에서 승인/계산 삭제 예외를 바꾸지 않는다.

구현 담당 기본값은 2026-11-01 사용자 지시에 따른 Gemini 수동 전달이다. Sol UI-NAV 한정 직접 수정 예외를 새 백엔드 작업으로 확대하지 않는다. 사용자가 이번 Task의 Sol 직접 구현을 지정하면 같은 Task·범위·검문으로 Sol이 수행한다. Gemini 최초0/재시도0/누적0, 실제 제출만 횟수로 센다.

## 기준과 보호 범위

- 저장소: `C:/Projects/Active/교대근무시스템`, 제품 `ShiftMgmt_V4`, 현재 브랜치 main. 기존 dirty/untracked 작업은 보존한다. 새 작업 전 기준과 다른 변경은 먼저 판별한다.
- 기준518파일: `source-baseline.json`, 집계 SHA256 `3714B435AE5A4653153F167984F153E1CA8D7FD206CC2B676FB1511F99EF5714`.
- 기존 실제 전체 회귀: `.ai/reports/final-quality-20261105/unit-results.json`, 1476/1476·156파일 PASS, 384.26초. 새 구현의 성공으로 재사용하지 않는다.
- 승인·계산·근무일 요율/시급·정책 버전·실적 입력·문서·JSON 내용·API 채널 계약·DB 스키마·의존성 불변. V3.4·운영 PC·기존 확인용 서버/사용자 창을 조작하지 않는다.
- commit/push/배포·운영 적용 없음. 실행 fixture는 전용 TEMP 경로, 실제 실적은 기존 대기 폴더→인테이크→승인 경로만 사용한다.

## 제품 수정 허용 목록

기존 파일20개와 신규 통합 시험1개만 허용한다. 소스의 허용 목록 밖 변경은 Sol에게 필요한 이유를 보고하고 범위를 닫은 뒤 수행한다.

1. `src/main/services/auth-service.ts`
2. `src/main/services/auth-service.test.ts`
3. `src/main/services/operations-storage-service.ts`
4. `src/main/services/operations-storage-service.test.ts`
5. `src/main/http/session.ts`
6. `src/main/http/session.test.ts`
7. `src/main/http/routes/operations-routes.ts`
8. `src/main/http/routes/operations-routes.test.ts`
9. `src/web/screens/operations-users.ts`
10. `src/web/screens/operations-model.ts`
11. `src/web/screens/operations-model.test.ts`
12. `src/web/screens/operations-ui.ts`
13. `src/web/operations.css`
14. `src/web/screens/performance-detail.ts`
15. `src/web/screens/performance.ts`
16. `src/web/screens/performance-actions.ts`
17. `src/web/performance.css`
18. `scripts/ui-checks/performance.mjs`
19. `scripts/ui-checks/operations.mjs`
20. `docs/codebase-map.md`
21. 신규 `src/main/http/account-lifecycle.integration.test.ts`

Sol 제어 파일: TODO.md, HANDOFF.md, .ai/task-plan.json 및 이 보고 폴더. 기존 Log는 append-only. HANDOFF 교체 전 Log 원문·byte·SHA를 대조해 보존한다.

## 파일별 구현 전략

### Q01 — 계정 상태값 저장 왕복

- 서버 정본 `UserStatus = active | inactive | pending`에 UI 선택지·입력 검증·배지 표시를 맞춘다. 한국어는 활성/비활성/대기. 사용자/근무지 이외 상태 draft/retired/suspended 배지의 기존 쓰임은 유지한다.
- 운영 사용자 수정 창의 상태 선택지는 타입이 검사하는 `{value: UserRecord['status'], label: string}` 목록을 사용한다. 알 수 없는 상태를 임의 active로 대체하지 말고 오류 표시·저장 차단한다.
- inactive/pending 계정을 열어 이름만 수정한 뒤 실제 서버 저장→재조회해 원 상태가 유지되는지 확인한다. active/inactive/pending 저장, suspended/retired 등 미지원 상태 거절을 교차 검사한다. API/스키마 enum을 UI의 오타에 맞춰 바꾸지 않는다.

### Q02 — 실제 계정과 기존 로그인 동기화

- `auth-service.ts`의 공통 `resolveActiveSession`에서 만료뿐 아니라 DB 계정의 존재·활성 상태·역할·로그인 ID·비밀번호 변경 요구 등 인증 관련 정보를 대조한다. 삭제/비활성/대기/역할 변경/관리자 비밀번호 초기화 뒤에는 기존 세션을 무효화하고 재로그인을 요구한다. 이름/연락처 같은 일반 변경은 권한 확대나 불필요한 로그아웃을 만들지 않는다.
- 세션 재검증은 seed를 실행하지 않는 읽기 전용 신원 조회를 `operations-storage-service.ts` 안에 제공해 사용한다. 기존 `findStoredOperationAuthByUserId`는 `ensureOperationsSeed`를 실행하므로 그대로 매 요청에 재사용하지 않는다. 초기 사용자 생성은 기존 로그인/초기화 정책을 유지하며 삭제/빈 사용자 표를 조회만으로 재생성하지 않는다.
- 비밀번호 지문을 메모리에 유지할 필요가 있으면 로그인/본인 비밀번호 변경 시 함께 갱신하고 로그/증거/응답에 내보내지 않는다. 기존 비갱신 get-session과 업무 요청의 sliding expiry 차이는 보존한다. 활성 계정의 정상 조회가 만료 시간을 임의 연장하면 안 된다.
- 삭제된 기본 계정이 seed 재실행으로 다시 생성되지 않도록 현재 `ensureOperationsSeed`의 one-time 동작과 실제 조회 경로를 확인한다. 기존 기본 계정 생성 정책 자체를 확장하지 않는다.
- `operations:update-database-from-migration`의 action에서 복원 성공 직후 기존 세션을 정리한다. DB 연결을 유지하는 미리보기·취소·교체 전 검증 실패에는 세션이 남아야 한다. 성공 후 감시 재시작이 실패해도 복원 전 세션이 유지되면 안 된다. 기존 cleanup와 활동 이력의 의미를 보존한다.
- 기존 복원은 파일 교체 후 정리/재열기가 실패해도 실패 응답을 낼 수 있다. 로그인 시 실제 SQLite 연결 객체를 보유하고 공통 세션 조회에서 현재 연결과 동일한지 대조한다. 연결이 닫히거나 바뀐 경우에는 계정/암호가 동일해도 세션을 폐기한다. 따라서 부분 교체 후 실패·재열기·연결 상실도 막는다. DB 복원 서비스/파일교체 helper의 새 커밋 신호를 추가하지 않고 현재21경로 안에서 해결한다. 연결을 재열었던 실패에는 안전을 위해 다시 로그인하게 되며, 이를 '모든 실패에서 세션 유지'로 보고하지 않는다.
- `SessionManager`의 기존 clear/signOut 경로를 재사용하거나 생산용 invalidate 경로를 좁게 추가한다. 쿠키가 남더라도 실제 관리자 API는 AUTH_SESSION_REQUIRED로 거부돼야 한다. 단일 활성 세션 정책은 유지한다.

### Q03 — 활성 관리자 최소1명·본인 삭제 가드

- 저장에서 기존 행이 active/admin이고 다음 행이 active/admin이 아니게 될 때 활성 관리자 수를 확인한다. `role='admin' AND status='active'` 기준으로 0명이 되는 정지·대기 전환·역할 하향을 거절한다.
- 삭제도 같은 활성 관리자 수를 사용한다. 비활성 관리자가 여럿 있어도 마지막 활성 관리자를 강등/삭제할 수 없어야 한다. 비활성 관리자 정리와 정상 다중 관리자 변경은 막지 않는다.
- HTTP 삭제 route에서 요청자의 userId와 삭제 대상을 대조해 본인 삭제를 거절한다. 기존 UI의 “본인 계정 삭제 차단” 설명과 실제 동작을 맞춘다. 본인 역할 하향/정지는 다른 활성 관리자가 있는 경우 저장될 수 있지만 Q02에 따라 다음 요청은 재로그인으로 이어져야 한다.
- 실패 때 저장 값·계정 수·기존 로그인 상태가 바뀌지 않아야 한다. 비밀정보를 실패 메시지에 포함하지 않는다.

### Q04 — 원본 엑셀 수정·재가져오기

- 미승인 실적 상세에서 성공할 수 없는 반려 버튼과 호출 연결·“반려 가능” 안내를 정리한다. 삭제한 버튼 대신 한국어 안내로 원본 엑셀 수정·저장→상단 “다시 읽기”→금액 확인→승인 순서를 설명한다. 기존 원본 열기와 다시 읽기 동작을 재사용한다.
- 안내 열람·원본 열기만으로 실적을 쓰거나 다시 읽기를 자동 실행하지 않는다. 승인된 자료 변경은 기존 재승인/잠금 정책을 따른다. 수당 검토의 실제 반려 기능은 변경하지 않는다.
- 기존 반려 API는 보호된 미지원 계약을 유지한다. 새로운 rejected 상태·반려 저장·새 API·화면 직접 실적 입력을 만들지 않는다.
- `performance.mjs` S13을 사용자 확정 요구에 맞는 후속 검사로 갱신한다: 반려 버튼 없음, 수정 안내/원본 열기/다시 읽기 존재, 안내만으로 API 쓰기0, 직접 반려 API는 여전히 거절·이력/금액 불변. N03은 없어진 반려 사유 입력칸 대신 이 새 부정 조건을 실제로 확인한다. 원 S13이 확인하던 서비스의 거절 계약은 별도 실행으로 계속 보존한다.
- S16의 계산 이력 연결 행 숨김 차단은 그대로 남긴다. 전체 실적20개/음성12개 분모는 유지한다. S13은 정상 UI검사가 되어 기존 BLOCKED2→S16 하나로 바뀔 수 있으며 변경 사유·결과를 명시한다. 원 RC2를 몰래 RC0으로 바꾸지 않는다.

## 필수 시나리오와 검증 순서

구현 전: 기존 결함 재현 JSON/원 소스 지문과 시험 명령/결과 판독을 대조한다. 새 미구현 코드의 성공을 사전 조건으로 요구하지 않는다. 현재 격리 재현의 서비스 입력·쿠키·Chrome 선택자·실제 응답 근거는 `.ai/reports/final-quality-20261105/{auth-probe,users-browser-probe,performance-reject-probe}.json`에 있다.

1. F01 active/inactive/pending의 수정→서버 저장→재조회, 원상태 유지. 미지원 값은 화면/서버 모두 거절.
2. F02 정상 로그인·비밀번호 변경·비갱신 세션 조회·만료/sliding renewal 유지. 삭제된 기본 계정/빈 사용자 표를 조회했을 때 사용자·휴일·요율·양식 표가 seed/수정되지 않고 거절되는지 확인.
3. F03 역할 하향·inactive/pending·삭제·비밀번호 초기화 뒤 기존 쿠키의 관리자/업무 API 거절. 새 로그인은 현재 역할/상태 기준.
4. F04 실제 JSON 복원 성공 뒤 쿠키 무효. DB 연결을 유지한 미리보기·교체 전 검증 실패는 정상 세션 유지. 같은 계정/동일 역할의 복원, 교체/재열기 후 실패, DB 연결이 바뀌거나 사라진 경우에는 기존 쿠키를 재사용하지 않음. 성공 후 cleanup 실패도 포함.
5. F05 유일한 활성 관리자 정지/대기/강등/삭제 거절. 비활성 관리자 존재 여부를 각각 포함하고 DB 불변 검사.
6. F06 관리자가2명 이상이면 다른 계정 정리 허용, 본인 삭제 route 거절. UI 오류가 다음 행동을 설명.
7. F07 실제 Chrome에서 상태 변경 저장/재조회, 권한 변경 뒤 로그인 화면, 막힌 마지막 관리자 저장, 실적 안내/기존 원본 열기·다시 읽기 및 키보드 확인.
8. F08 수당 반려/승인·계산·정책·JSON 계약 보존. 이번 코드 범위 밖 source byte 불변.

집중 실행→관련 시험→소스 고정→최종 전체1회. 같은 입력의 전체 반복은 금지, 새 실패/변경이 있을 때만 사유와 원 실패를 남기고 재실행한다.

```text
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --minWorkers=1 src/main/services/auth-service.test.ts src/main/services/operations-storage-service.test.ts src/main/http/session.test.ts src/main/http/routes/operations-routes.test.ts src/main/http/account-lifecycle.integration.test.ts src/web/screens/operations-model.test.ts
npm run typecheck
npm run lint
npm run build
npm run validate:map
npm test -- --reporter=json --outputFile=<dedicated-evidence>/unit-results.json
node scripts/ui-checks/operations.mjs --out=<dedicated-TEMP>
node scripts/ui-checks/performance.mjs --out=<dedicated-TEMP>
git diff --check
```

실제 UI CLI 인수는 기존 `--help`/입력 파싱을 읽어 정확한 포트·출력·bootstrap fixture를 먼저 확인한다. 위 `<...>`는 그대로 실행할 인수가 아니다. 기존 운영20/N12, 실적20/N12(19 PASS+S16 BLOCKED 예상)와 새 F01~08을 기존 도구로 묶어 검증한다. 예상 시간은 집중/정적/빌드 5~10분, 최종 단위 약6~7분(직전 실측384초), UI는 fixture 시작비용 포함 추가 추정10~20분이며 납기 약속이 아니다.

## 회신/완료 기준

실제 diff·수정 파일 byte/SHA, 기준 밖 변경0, 명령 argv·시작/끝·RC·실제 결과·소스 전후, F01~08별 실행 근거와 캡처, 실패/미실행/의도된 차단을 구분한다. 실제 테스트를 돌리지 않고 PASS 결과 파일만 쓰지 않는다. 비밀정보·쿠키·비밀번호 해시를 로그/캡처/문서에 남기지 않는다.

기술검수와 사용자 화면 확인은 별도다. 새 격리 Chrome을 수정된 사용자 관리/실적 안내 화면으로 열어 주소를 제공하고 기존 확인 창/DB는 유지한다. Q01~04를 수용한 뒤 다음 승인된 leaf로 이동한다. 다른 개선이나 배포를 자동 완료로 표시하지 않는다.
