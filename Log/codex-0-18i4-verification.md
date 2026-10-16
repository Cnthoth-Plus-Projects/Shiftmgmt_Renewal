# Codex 0-18i 품질 평가 4차 독립 검증

- 시각: 2026-09-07 19:50~19:56 KST
- 판정: AGREE
- 수신 HANDOFF: 13,324 B / SHA-256 d24865114938a427fe4b08531991d44e7c7d7227045d8ee3de03f0d4971d0364
- 보존본: Log/20260907_195043_0-18i-품질평가4차_원본.md
- 브라우저: Playwright MCP Chromium, 1440×900, local HTTP
- 상세 브라우저 자료: Log/codex-0-18i4-browser.json

## 정적 대조

- 스냅샷18차→19차: 변경 2 / 불변 32
- 현재 HTML = 스냅샷19차: 34/34
- 스냅샷19차 manifest = 실제 파일: 34/34
- HANDOFF 선언 HTML SHA = 현재 파일: 34/34
- 변경 줄: 00-shell-1 S1~S3, 00-shell-2 S4~S6 main의 aria-hidden="true" 제거 6쌍만
- 줄 수: 34/34 동일
- script 본문: 34/34 동일
- 지시서 및 검토 문서 6종의 SHA/바이트: HANDOFF §0과 일치
- 픽셀 표: 34행 전부 0.00%, 머리글 "공통 영역 차이율 %"

## 셸 S1~S6

- aria-hidden: 6/6 null, tabindex=-1 유지
- 수정 전/후 main x/y/width/height: 6/6 동일
- 실제 Tab으로 skip-link 도달: 6/6
- Enter 뒤 해당 main 포커스: 6/6
- 다음 Tab nav 진입: 0/6
- CDP partial AX: 포커스 전후 ignored=false, role=main 6/6
- CDP full AX: shell-1 main 3, shell-2 main 3
- Blocked aria-hidden 경고: 0/6

## audit1d / W7

- B_STATES: wizard-1 state-w2; wizard-2 state-w3/state-w4; wizard-3 state-w7
- 허용 상태 bEx: 92/92/92/7
- 비허용 W1/W5/W6 bEx: 0
- 전체 bOut: 0
- 범위 밖 10px 메모리 probe(W5): small=1, bOut=1
- W7 닫기 Esc/계속 편집/변경 버리고 나가기 3/3:
  - dialog none, body aria-hidden null, focus btn-prev-w7
  - small 0, bEx 7, bOut 0
  - cell 12px / b 10px / height 39
  - head 12px / height 22
  - main 1220/1220

## 정본

- 03 v1.11: AGREE
- 04 v2.11: AGREE
- 디자인 시스템 v1.3: 이전 AGREE 유지, 불변
- 합의표 v1.3: 이전 AGREE 유지, 불변

