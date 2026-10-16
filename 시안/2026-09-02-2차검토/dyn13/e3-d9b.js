(()=>{function vis(e){return !!e&&getComputedStyle(e).display!=='none'}
var m=document.getElementById('modal-e3'),s=document.getElementById('btn-submit-e3'),c=document.getElementById('btn-cancel-e3'),x=document.getElementById('btn-close-e3-x'),t=document.getElementById('toast-e3'),g=document.getElementById('btn-e3-goto-perf');
var r=['완료 후 → 모달='+vis(m)+' 포커스='+document.activeElement.id+' 등록 라벨='+s.textContent+' 취소 disabled='+c.disabled+' ✕ disabled='+x.disabled+' 토스트='+vis(t)];
document.getElementById('btn-open-e3').click();m.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));r.push('재열기 후(처리 아님) Esc → 모달='+vis(m)+' 포커스='+document.activeElement.id);
r.push('이동 버튼 '+g.tagName+' id='+g.id+' 글="'+g.textContent.trim()+'"');
return r.join(' | ');})()
