# 12차 — ⑥ Codex 2차 회신 D8·D9 반영 (Claude 담당 06-employees-2/3 두 파일만)
# D9: 실행 시작 후 Esc·취소·✕ 차단(요청서 §K 792행) — E3·E4(공용 헬퍼)·E6 [적용]·E8 [등록]
# D8: E3 토스트 [실적 관리로 이동]에 실제 항해(1차 승인 실적 시안 P1) 연결
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
 # D9 — 공용 모달 헬퍼(E3·E4)
 ("""    function closeModal() {
      modal.style.display = 'none';
      var appBody = appWin.querySelector('.app-body');
      var headerBar = appWin.querySelector('.header-bar');
      if (appBody) appBody.removeAttribute('aria-hidden');
      if (headerBar) headerBar.removeAttribute('aria-hidden');
      if (opener) { opener.focus(); opener = null; }
    }

    if (trigger) trigger.addEventListener('click', openModal);
    var btnX = document.getElementById(closeXId);
    if (btnX) btnX.addEventListener('click', closeModal);
    var btnC = document.getElementById(cancelBtnId);
    if (btnC) btnC.addEventListener('click', closeModal);

    var btnS = document.getElementById(submitBtnId);
    if (btnS) {
      btnS.addEventListener('click', function() {
        btnS.disabled = true;
        btnS.textContent = '처리 중...';
        setTimeout(closeModal, 600);
      });
    }

    modal.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { closeModal(); return; }
""",
  """    var processing = false;
    function closeModal() {
      if (processing) return;
      modal.style.display = 'none';
      var appBody = appWin.querySelector('.app-body');
      var headerBar = appWin.querySelector('.header-bar');
      if (appBody) appBody.removeAttribute('aria-hidden');
      if (headerBar) headerBar.removeAttribute('aria-hidden');
      if (opener) { opener.focus(); opener = null; }
    }

    if (trigger) trigger.addEventListener('click', openModal);
    var btnX = document.getElementById(closeXId);
    if (btnX) btnX.addEventListener('click', closeModal);
    var btnC = document.getElementById(cancelBtnId);
    if (btnC) btnC.addEventListener('click', closeModal);

    var btnS = document.getElementById(submitBtnId);
    if (btnS) {
      btnS.addEventListener('click', function() {
        processing = true;
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
      });
    }

    modal.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { e.preventDefault(); if (!processing) closeModal(); return; }
""", 1),
 # D8 — [실적 관리로 이동] 실제 항해
 ("""  if (toastClose) toastClose.addEventListener('click', function() {
    toast.style.display = 'none';
    if (opener) opener.focus();
  });
  validate();
""",
  """  if (toastClose) toastClose.addEventListener('click', function() {
    toast.style.display = 'none';
    if (opener) opener.focus();
  });
  var gotoPerf = document.getElementById('btn-e3-goto-perf');
  if (gotoPerf) gotoPerf.addEventListener('click', function() {
    window.location.href = '../2026-08-31-1차HTML/08-performance-1.html';
  });
  validate();
""", 1),
])

patch(E3, [
 # D9 — E6 확인 모달 [적용]
 ("""  function closeAll() {
    hide(modal); hide(confirmModal); lockBackground(false);
    if (opener) { opener.focus(); opener = null; }
  }
""",
  """  var processing = false;
  function closeAll() {
    if (processing) return;
    hide(modal); hide(confirmModal); lockBackground(false);
    if (opener) { opener.focus(); opener = null; }
  }
""", 1),
 ("  function backToPreview() { hide(confirmModal); show(modal, btnSubmit); }\n",
  "  function backToPreview() { if (processing) return; hide(confirmModal); show(modal, btnSubmit); }\n", 1),
 ("""  if (btnApply) btnApply.addEventListener('click', function() {
    btnApply.disabled = true;
    btnApply.textContent = '업데이트 중...';
    if (liveE6) liveE6.textContent = '처리 중: 업데이트 중...';
    setTimeout(function() { closeAll(); btnApply.disabled = false; btnApply.textContent = '적용'; }, 800);
  });
""",
  """  if (btnApply) btnApply.addEventListener('click', function() {
    processing = true;
    if (btnConfirmX) btnConfirmX.disabled = true;
    if (btnBack) btnBack.disabled = true;
    btnApply.disabled = true;
    btnApply.textContent = '업데이트 중...';
    if (liveE6) liveE6.textContent = '처리 중: 업데이트 중...';
    setTimeout(function() {
      processing = false;
      if (btnConfirmX) btnConfirmX.disabled = false;
      if (btnBack) btnBack.disabled = false;
      closeAll(); btnApply.disabled = false; btnApply.textContent = '적용';
    }, 800);
  });
""", 1),
 ("      if (e.key === 'Escape') { onEscape(); return; }\n",
  "      if (e.key === 'Escape') { e.preventDefault(); if (!processing) onEscape(); return; }\n", 1),
 # D9 — E8 [등록]
 ("""  function closeModal() {
    modal.style.display = 'none';
    var appBody = appWin.querySelector('.app-body');
    var headerBar = appWin.querySelector('.header-bar');
    if (appBody) appBody.removeAttribute('aria-hidden');
    if (headerBar) headerBar.removeAttribute('aria-hidden');
    if (opener) { opener.focus(); opener = null; }
  }
  if (btnOpen) btnOpen.addEventListener('click', openModal);
  if (btnCloseX) btnCloseX.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);
  if (btnSubmit) btnSubmit.addEventListener('click', function(e) {
    if (btnSubmit.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
    btnSubmit.disabled = true;
    btnSubmit.textContent = '등록 중...';
    if (liveE8) liveE8.textContent = '처리 중: 등록 중...';
    setTimeout(function() { closeModal(); btnSubmit.disabled = false; btnSubmit.textContent = '등록'; }, 800);
  });
  modal.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closeModal(); return; }
""",
  """  var processing = false;
  function closeModal() {
    if (processing) return;
    modal.style.display = 'none';
    var appBody = appWin.querySelector('.app-body');
    var headerBar = appWin.querySelector('.header-bar');
    if (appBody) appBody.removeAttribute('aria-hidden');
    if (headerBar) headerBar.removeAttribute('aria-hidden');
    if (opener) { opener.focus(); opener = null; }
  }
  if (btnOpen) btnOpen.addEventListener('click', openModal);
  if (btnCloseX) btnCloseX.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);
  if (btnSubmit) btnSubmit.addEventListener('click', function(e) {
    if (btnSubmit.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
    processing = true;
    if (btnCloseX) btnCloseX.disabled = true;
    if (btnCancel) btnCancel.disabled = true;
    btnSubmit.disabled = true;
    btnSubmit.textContent = '등록 중...';
    if (liveE8) liveE8.textContent = '처리 중: 등록 중...';
    setTimeout(function() {
      processing = false;
      if (btnCloseX) btnCloseX.disabled = false;
      if (btnCancel) btnCancel.disabled = false;
      closeModal(); btnSubmit.disabled = false; btnSubmit.textContent = '등록';
    }, 800);
  });
  modal.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { e.preventDefault(); if (!processing) closeModal(); return; }
""", 1),
])
print("APPLIED 12차")
