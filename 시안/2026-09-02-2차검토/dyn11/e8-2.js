(()=>{function H(e){return e?Math.round(e.getBoundingClientRect().height):null}function vis(e){return !!e&&getComputedStyle(e).display!=='none'}
var m=document.getElementById('modal-e8'),s=document.getElementById('btn-submit-e8'),o=document.getElementById('btn-open-e8');
var r=[];r.push('등록 후 → 모달='+vis(m)+' 포커스='+document.activeElement.id+' 라벨='+s.textContent+' disabled='+s.disabled+' app-body aria-hidden='+document.querySelector('#e8-app-window .app-body').getAttribute('aria-hidden'));
o.click();m.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));r.push('재열기 후 Esc → 모달='+vis(m)+' 포커스='+document.activeElement.id);
return r.join('\n');})()