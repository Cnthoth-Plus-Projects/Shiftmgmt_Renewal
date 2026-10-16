# 검증기는 실제 값으로 판정하고 출력 위치를 격리한다

- Date: 2026-10-01 · Phase3-2 CORRECT2 → verifier REPLAN
- Trigger: 실측·시나리오 실행 여부·정리 성공을 검사하는 검증기 작성/수용.
- Failure: 날짜90×24와 잘못된 table 이름을 측정하고도 hardcoded pass:true 때문에 RC0/PASS. 인자 배열을 객체로 읽어 held 요청이 실제 시작되지 않아도 stale 시험이 통과했다. 재사용한 fault preload가 이전 Control report를 덮었다.
- Root cause: 호출자가 성공 여부를 제공; 비교/필수 coverage/요청 생명주기가 강제되지 않음; 시험 helper의 출력 경로를 실행 전에 격리하지 않음.
- Rule: 비교 API가 expected와 실제 measurement를 받아 판정한다. caller pass 인자 금지. 누락/NaN/중복 coverage는 실패. 날짜/권한/held 전제조건은 동작 전에 assert한다. 요청은 실제 bridge 인자 배열 계약으로 디코딩하고 held start/release/complete를 모두 유한 시간에 확인한다.
- Verification: 크기/accessible name/행수·순서 변조, console/page/HTTP/requestfailed 및 초기화·정리 실패 주입은 RC 비0여야 한다. 원출력·첫 실패·부분 결과·최종 owner cleanup을 보존하고, owner 최종 PASS는 모든 종료·삭제 검증 뒤에만 기록한다.
- Output boundary: 재사용 preload는 자기 소유 ignored artifact에 복사하고 출력도 그 안으로 설정한다. `.ai` 원본 실행으로 이전 report를 덮지 않는다. 과거 report 손상 발견 시 관찰 바이트를 append-only Log에 보존하고 저장 증거 기반 복원임을 명시한다.
- Evidence: `.ai/reports/phase3-2-correct2-review-20261001_085101/bad-measurements-assertion-evidence.json`, `historical-artifact-drift.json`; 제품 파일 변화 없이 재현.
- Promotion: 새로운 Phase3-2c 패킷의 V32-01~06 및 필수 음성 검증에 포함. 제품 수정 권한·기존 역할은 유지.
