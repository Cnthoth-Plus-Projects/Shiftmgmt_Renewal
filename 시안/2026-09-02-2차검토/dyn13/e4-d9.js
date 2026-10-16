(()=>{function vis(e){return !!e&&getComputedStyle(e).display!=='none'}
var o=document.getElementById('btn-open-e4'),m=document.getElementById('modal-e4'),s=document.getElementById('btn-submit-e4'),c=document.getElementById('btn-cancel-e4'),x=document.getElementById('btn-close-e4-x');
if(!o||!m||!s)return 'E4 요소 없음 '+[!!o,!!m,!!s];
o.click();var r=['E4 열림='+vis(m)+' 실행 aria-disabled='+s.getAttribute('aria-disabled')];
s.click();r.push('실행 클릭 → 라벨='+s.textContent+' 모달='+vis(m)+' 취소 disabled='+(c&&c.disabled)+' ✕ disabled='+(x&&x.disabled));
m.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));r.push('처리 중 Esc → 모달='+vis(m));
if(c){c.click();r.push('처리 중 취소 → 모달='+vis(m));}
return r.join(' | ');})()
