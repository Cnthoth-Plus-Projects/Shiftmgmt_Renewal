(()=>{function vis(e){return !!e&&getComputedStyle(e).display!=='none'}
var q=function(id){return document.getElementById(id)};var cm=q('modal-e6-confirm'),m=q('modal-e6'),ap=q('btn-apply-e6-confirm'),bk=q('btn-back-e6-confirm'),cx=q('btn-close-e6-confirm-x');
var r=['완료 후 → 확인모달='+vis(cm)+' E6='+vis(m)+' 포커스='+document.activeElement.id+' 적용 라벨='+ap.textContent+' 돌아가기 disabled='+bk.disabled+' ✕ disabled='+cx.disabled+' app-body aria-hidden='+document.querySelector('#e6-app-window .app-body').getAttribute('aria-hidden')];
q('btn-open-e6').click();q('btn-submit-e6').click();cm.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));r.push('재열기 후(처리 아님) 확인모달 Esc → 확인모달='+vis(cm)+' E6='+vis(m)+' 포커스='+document.activeElement.id);
m.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));r.push('E6 Esc → E6='+vis(m)+' 포커스='+document.activeElement.id);
return r.join(' | ');})()
