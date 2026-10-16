# 13차 — ⑥ 3차 회신 D11·D12 반영 (Claude 담당 06-employees-2/3 두 파일만)
# D11: 처리 잠금 직후 포커스를 처리 모달 컨테이너(tabindex=-1)로 옮기고, processing 동안 Tab을 preventDefault로 붙잡는다.
# D12: 공용 헬퍼(E3·E4) 완료 콜백에서 실행 버튼 native disabled 해제 + 원래 라벨 복원(aria-disabled 게이트는 건드리지 않는다).
#      E6 [적용]·E8 [등록]은 12차에 이미 복원됨 → D11만 적용.
# 규칙: 치환 횟수가 기대와 다르면 저장하지 않는다.
import io, os
os.chdir(r"C:\Projects\Active\교대근무관리 시스템")

def patch(path, pairs):
    with io.open(path, 'r', encoding='utf-8', newline='') as f:
        s = f.read()
    for old, new, n in pairs:
        c = s.count(old)
        assert c == n, f"{path}: [{old[:60]!r}] 기대 {n}회 실제 {c}회 — 저장 안 함"
        s = s.replace(old, new)
    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(s)
    print("OK", path)

E2 = "시안/2026-09-02-2차HTML/06-employees-2.html"
E3 = "시안/2026-09-02-2차HTML/06-employees-3.html"

patch(E2, [
 # 공용 헬퍼(E3·E4): 잠금 시 라벨 보존 + 모달로 포커스 / 완료 시 실행 버튼 복원
 ("""        processing = true;
        if (btnX) btnX.disabled = true;
        if (btnC) btnC.disabled = true;
        btnS.disabled = true;
        btnS.textContent = '처리 중...';
        setTimeout(function() {
          processing = false;
          if (btnX) btnX.disabled = false;
          if (btnC) btnC.disabled = false;
          closeModal();
        }, 600);
""",
  """        processing = true;
        var origLabel = btnS.textContent;
        if (btnX) btnX.disabled = true;
        if (btnC) btnC.disabled = true;
        btnS.disabled = true;
        btnS.textContent = '처리 중...';
        modal.focus();
        setTimeout(function() {
          processing = false;
          if (btnX) btnX.disabled = false;
          if (btnC) btnC.disabled = false;
          btnS.disabled = false;
          btnS.textContent = origLabel;
          closeModal();
        }, 600);
""", 1),
 ("""    modal.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { e.preventDefault(); if (!processing) closeModal(); return; }
""",
  """    modal.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { e.preventDefault(); if (!processing) closeModal(); return; }
      if (processing && e.key === 'Tab') { e.preventDefault(); return; }
""", 1),
])

patch(E3, [
 # E6 확인 모달 [적용]: 잠금 시 확인 모달로 포커스
 ("""    processing = true;
    if (btnConfirmX) btnConfirmX.disabled = true;
    if (btnBack) btnBack.disabled = true;
    btnApply.disabled = true;
    btnApply.textContent = '업데이트 중...';
""",
  """    processing = true;
    if (btnConfirmX) btnConfirmX.disabled = true;
    if (btnBack) btnBack.disabled = true;
    btnApply.disabled = true;
    btnApply.textContent = '업데이트 중...';
    confirmModal.focus();
""", 1),
 ("""      if (e.key === 'Escape') { e.preventDefault(); if (!processing) onEscape(); return; }
""",
  """      if (e.key === 'Escape') { e.preventDefault(); if (!processing) onEscape(); return; }
      if (processing && e.key === 'Tab') { e.preventDefault(); return; }
""", 1),
 # E8 [등록]: 잠금 시 모달로 포커스
 ("""    processing = true;
    if (btnCloseX) btnCloseX.disabled = true;
    if (btnCancel) btnCancel.disabled = true;
    btnSubmit.disabled = true;
    btnSubmit.textContent = '등록 중...';
""",
  """    processing = true;
    if (btnCloseX) btnCloseX.disabled = true;
    if (btnCancel) btnCancel.disabled = true;
    btnSubmit.disabled = true;
    btnSubmit.textContent = '등록 중...';
    modal.focus();
""", 1),
 ("""  modal.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { e.preventDefault(); if (!processing) closeModal(); return; }
""",
  """  modal.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { e.preventDefault(); if (!processing) closeModal(); return; }
    if (processing && e.key === 'Tab') { e.preventDefault(); return; }
""", 1),
])
print("APPLIED 13차")
