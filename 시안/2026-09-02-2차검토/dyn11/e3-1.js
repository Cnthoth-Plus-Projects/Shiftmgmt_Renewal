(()=>{function busy(ms){var t=Date.now();while(Date.now()-t<ms){}}function H(e){return e?Math.round(e.getBoundingClientRect().height):null}function vis(e){return !!e&&getComputedStyle(e).display!=='none'}
var o=document.getElementById('btn-open-e3');o.click();
var m=document.getElementById('modal-e3'),b=document.getElementById('btn-submit-e3'),d=document.getElementById('e3-date'),a=document.getElementById('e3-amt'),wn=document.getElementById('e3-retro-warn'),ds=document.getElementById('e3-submit-desc');
var r=[];r.push('열림='+vis(m)+' 포커스='+document.activeElement.id+' 금액='+a.value+' 날짜="'+d.value+'" 등록 aria-disabled='+b.getAttribute('aria-disabled')+' describedby='+b.getAttribute('aria-describedby')+' 사유="'+ds.textContent+'" 사유표시='+vis(ds)+' 경고표시='+vis(wn));
b.click();r.push('비활성 상태 클릭 → 라벨='+b.textContent+' 열림유지='+vis(m));
d.value='2025-04-01';d.dispatchEvent(new Event('input',{bubbles:true}));
r.push('2025-04-01 → 경고표시='+vis(wn)+' 경고글="'+wn.textContent+'" aria-disabled='+b.getAttribute('aria-disabled')+' 사유표시='+vis(ds));
d.value='2025-07-01';d.dispatchEvent(new Event('input',{bubbles:true}));
r.push('2025-07-01 → 경고표시='+vis(wn)+' aria-disabled='+b.getAttribute('aria-disabled'));
a.value='';a.dispatchEvent(new Event('input',{bubbles:true}));
r.push('금액 비움 → aria-disabled='+b.getAttribute('aria-disabled')+' 사유="'+ds.textContent+'"');
a.value='12,500';a.dispatchEvent(new Event('input',{bubbles:true}));
r.push('금액 복원 → aria-disabled='+b.getAttribute('aria-disabled'));
b.click();r.push('등록 클릭 직후 → 라벨='+b.textContent+' disabled='+b.disabled);
busy(900);return r.join('\n');})()