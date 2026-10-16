# aria-disabled와 native disabled를 분리해서 검수한다

- Trigger: 포커스 가능한 입력 조건/권한 잠금과 native 처리 중 잠금을 구분하는 UI 검수.
- Failure: Sol 검수기가 Playwright locator.isDisabled()를 native 버튼 disabled와 동일시해 올바른 aria-disabled 버튼을 실패로 집계했다. 같은 메서드로 키보드 음성 검사를 건너뛴 문제도 있었다.
- Cause: Playwright disabled 판정에는 aria-disabled가 포함된다. 이것은 브라우저의 HTMLButtonElement.disabled/Tab 포커스 가능 여부와 다른 조건이다.
- Prevention: native 상태는 el.disabled로 읽고 실제 Tab→document.activeElement와 2px 포커스 링을 확인한다. aria-disabled·aria-describedby·보이는 사유를 별도로 검사한다. 클릭/Space/Enter/폼Enter의 API 호출0,처리 중 native disabled/중복0도 확인한다. 지연 응답 fixture는 route 처리 완료 뒤 unroute한다.
- Evidence: [Playwright Enabled](https://playwright.dev/docs/actionability#enabled), `.ai/reports/phase3-1d-review-20260930_165922/final-evidence.json`(83/83 PASS).
