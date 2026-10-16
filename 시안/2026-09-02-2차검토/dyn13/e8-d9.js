(()=>{function vis(e){return !!e&&getComputedStyle(e).display!=='none'}
var q=function(id){return document.getElementById(id)};
q('btn-open-e8').click();var m=q('modal-e8'),s=q('btn-submit-e8'),c=q('btn-cancel-e8'),x=q('btn-close-e8-x');
s.click();var r=['E8 등록 클릭 → 라벨='+s.textContent+' 모달='+vis(m)+' 취소 disabled='+c.disabled+' ✕ disabled='+x.disabled+' live="'+q('live-e8').textContent+'"'];
m.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));r.push('처리 중 Esc → 모달='+vis(m));
c.click();r.push('처리 중 취소 → 모달='+vis(m));
x.click();r.push('처리 중 ✕ → 모달='+vis(m));
return r.join(' | ');})()
