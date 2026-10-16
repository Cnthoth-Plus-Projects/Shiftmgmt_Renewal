# 0-18g 2차 E9 독립 감사

- 일시: 2026-09-07
- 범위: `시안/2026-09-02-2차검토/스냅샷16차/2차` → `시안/2026-09-02-2차HTML`의 24개 2차 HTML, E9/Q2/Q3 및 제한된 S1 확인.
- 도구: `C:/Program Files/nodejs/node.exe`, `C:/Projects/Active/ShiftMgmt_V3.4/node_modules/playwright`의 Chromium, 1440×900. 브라우저 스크립트: 이 Log 폴더의 `codex-0-18g2-e9-browser.js`.

## 판정

### Q2 — PASS

`06-employees-1.html:829`, `:964~972`의 `#btn-e9-panel-close`를 매번 새 페이지에서 실제 클릭, Enter, Space로 각각 실행했다. 3/3에서 E9 상세 `aside`는 `display:none`, 포커스는 E9 `tr.selected[data-id="50001"]`, 역할 칩은 `승인 담당`이었다. 원본 E2 `aside`는 `display:flex` 유지, E2/E9 wrapper 모두 `display:flex`, selected 행은 하나였다. 따라서 원본 상태 전이나 wrapper 전이는 관측되지 않았다.

### E9 잠금 — PASS (작동 차단)

`#btn-e2-new-e9`, `#btn-e9-wage`, `#btn-e9-assign`, `#btn-e9-unassign`, `#btn-e9-delete`를 패널이 열린 새 상태에서 클릭·Enter·Space로 각각 실행했다(15/15). 전부 역할은 `승인 담당`, E2/E9 wrapper는 유지, 보이는 dialog/modal은 0이었다.

패널을 닫은 뒤에도 `#btn-e2-new-e9`는 클릭·Enter·Space 3/3이 같은 방식으로 차단됐다. 나머지 네 버튼은 닫힌 `aside`의 자손이어서 0×0이고 실제 포인터/키 입력 대상이 될 수 없다. 이 네 요소의 `aria-disabled="true"`와 숨김 `aside`는 확인했다.

### Q3 — 부분 PASS, 명세 위반 1건

- 이력 행: E2 `[40,40]`, E9 `[40,40]`.
- `시급 등록`: E2/E9 모두 69×26px. `신규 인력 등록`: E2/E9 모두 약 139×32px.
- 5개 버튼의 `aria-describedby` 참조는 모두 존재·표시됨(사유 요소 4개).
- `:401`은 `#e2-wage-history-e9`에도 동일 padding/nowrap을 적용한다.
- `:835~837`, `:865~871`의 패널 안 사유는 버튼 줄 아래에 있다.

그러나 `#btn-e2-new-e9`와 `#e9-lock-desc-1`은 현재 `06-employees-1.html:768`의 같은 `display:flex` 컨테이너에 있다. 브라우저 좌표도 버튼 top 2078, 사유 top 2085로 같은 줄임을 보였다. v2.9 §C의 “잠금 사유 요소는 버튼과 같은 flex 줄에 두지 않고 버튼 줄 아래 별도 줄”과 충돌한다. 따라서 Q3 전체 PASS/AGREE는 불가하다.

## 16차 ↔ 현재 2차 소스 대조

- 변경 19: `06-employees-1.html` 7 hunk, 그 외 18개 헤더 파일은 각각 skip-link CSS 1 hunk.
- 불변 5: `01-login-1/2.html`, `02-common-1/2/3.html`.
- 2차 24파일의 script 본문을 파일별 비교하면 변경은 `06-employees-1.html` 1개뿐이며 E9 close handler(`:964~972`) 추가다. 나머지 23파일 script는 16차와 바이트상 동일하다. 그러므로 이전의 17-modal/A9/L 검증 결과는 이 대조만으로는 무효화되지 않는다.

## S1 제한 확인

`04-sites-1.html`, `06-employees-1.html`에서 평시 `elementFromPoint(8,8)`은 skip-link가 아니고, 첫 Tab은 skip-link를 표시(약 131.6×35.5px)했다. Enter는 각각 `#main-state-t1`, `#main-state-e1` hash 대상으로 이동했다. 이 검사는 평시 시각 노출과 focus 표시만 확인한 것이다. target이 `.app-body`라서 본문 우회가 되는지는 이 감사에서 PASS로 주장하지 않는다.

