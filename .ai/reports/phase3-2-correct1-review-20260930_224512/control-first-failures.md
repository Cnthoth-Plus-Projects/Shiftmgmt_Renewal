# Sol 검수 도구의 첫 실행 실패

- Native probe 첫 실행의 users-retry 그룹: 수정된 버튼은 실제 disabled라 두 번째 Playwright click이 actionability timeout을 냈다. 이는 제품 실패가 아니다. 첫 source/result/server info/cleanup을 .first-pass에 보존했다. 두 번째 동작을 native el.click()과 강제 DOM click event로 나눠 요청수0 및 handler guard를 검증하도록 고친 뒤 fresh 서버에서 전체 그룹을 재실행한다.
- Synthetic verifier-fault 첫 실행: Windows 절대경로를 node --import에 직접 전달해 ESM URL scheme 오류로 제품 실행 전에 중단했다. pathlib.as_uri()의 file URI를 subprocess structured argv로 전달해 해결했다. 제품 코드를 바꾸지 않았고 원 실패를 제품 판정에 사용하지 않는다.
