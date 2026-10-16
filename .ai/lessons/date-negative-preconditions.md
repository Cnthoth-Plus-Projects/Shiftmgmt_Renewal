# 날짜 음성 시험의 전제조건을 먼저 검증

- Date: 2026-09-30 · Phase3-2 Sol control probe
- Failure: default start09-01에서 end09-01만 설정하고 invalid라고 잘못 판단했다. 첫 invalid/keyboard 결과는 제외하고 원본을 `.first-pass`로 보존했다.
- Root cause: 운영일의 default start와 입력한 end의 실제 관계를 시험이 확인하지 않았다.
- Fix: 두 경계를 모두 명시(start09-30/end09-01), DOM값과 validation 사유를 확인하고 동일 조작 재실행. 잘못된 시험 결과를 제품 결함으로 기록하지 않는다.
- Recall: 날짜 범위/금액 한도/역할 거절 시험은 부정 조건이 실제로 성립하는지 동작 전에 assertion한다. 요청0·pending·focus는 각 독립 측정으로 확인한다.
