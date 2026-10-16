(()=>{function vis(e){return !!e&&getComputedStyle(e).display!=='none'}
var q=function(id){return document.getElementById(id)};var m=q('modal-e8'),s=q('btn-submit-e8'),c=q('btn-cancel-e8'),x=q('btn-close-e8-x');
var r=['완료 후 → 모달='+vis(m)+' 포커스='+document.activeElement.id+' 등록 라벨='+s.textContent+' 취소 disabled='+c.disabled+' ✕ disabled='+x.disabled+' app-body aria-hidden='+document.querySelector('#e8-app-window .app-body').getAttribute('aria-hidden')];
q('btn-open-e8').click();m.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));r.push('재열기 후(처리 아님) Esc → 모달='+vis(m)+' 포커스='+document.activeElement.id);
return r.join(' | ');})()
