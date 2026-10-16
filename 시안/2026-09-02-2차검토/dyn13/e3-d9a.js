(()=>{function vis(e){return !!e&&getComputedStyle(e).display!=='none'}
var o=document.getElementById('btn-open-e3'),m=document.getElementById('modal-e3'),s=document.getElementById('btn-submit-e3'),d=document.getElementById('e3-date'),c=document.getElementById('btn-cancel-e3'),x=document.getElementById('btn-close-e3-x');
o.click();d.value='2025-07-01';d.dispatchEvent(new Event('input',{bubbles:true}));
s.click();var r=['E3 실행 클릭 → 라벨='+s.textContent+' 모달='+vis(m)+' 취소 disabled='+c.disabled+' ✕ disabled='+x.disabled];
m.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));r.push('처리 중 Esc → 모달='+vis(m));
c.click();r.push('처리 중 취소 클릭 → 모달='+vis(m));
x.click();r.push('처리 중 ✕ 클릭 → 모달='+vis(m));
return r.join(' | ');})()
