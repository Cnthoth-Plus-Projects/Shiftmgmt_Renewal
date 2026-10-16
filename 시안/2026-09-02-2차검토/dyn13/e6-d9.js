(()=>{function vis(e){return !!e&&getComputedStyle(e).display!=='none'}
var q=function(id){return document.getElementById(id)};
q('btn-open-e6').click();q('btn-submit-e6').click();
var cm=q('modal-e6-confirm'),m=q('modal-e6'),ap=q('btn-apply-e6-confirm'),bk=q('btn-back-e6-confirm'),cx=q('btn-close-e6-confirm-x');
var r=['E6 확인 모달='+vis(cm)+' E6='+vis(m)];
ap.click();r.push('적용 클릭 → 라벨='+ap.textContent+' 확인모달='+vis(cm)+' 돌아가기 disabled='+bk.disabled+' ✕ disabled='+cx.disabled+' live="'+q('live-e6').textContent+'"');
cm.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));r.push('처리 중 Esc → 확인모달='+vis(cm)+' E6='+vis(m));
bk.click();r.push('처리 중 돌아가기 클릭 → 확인모달='+vis(cm)+' E6='+vis(m));
cx.click();r.push('처리 중 ✕ 클릭 → 확인모달='+vis(cm)+' E6='+vis(m));
return r.join(' | ');})()
