(()=>{function busy(ms){var t=Date.now();while(Date.now()-t<ms){}}function H(e){return e?Math.round(e.getBoundingClientRect().height):null}function vis(e){return !!e&&getComputedStyle(e).display!=='none'}
var o=document.getElementById('btn-open-e6');o.click();
var m=document.getElementById('modal-e6'),c=document.getElementById('modal-e6-confirm'),s=document.getElementById('btn-submit-e6'),p=document.getElementById('btn-e6-preview'),bn=document.getElementById('e6-stale-banner'),ds=document.getElementById('e6-submit-desc'),dt=document.getElementById('e6-date');
var areas=['e6-preview-cards','e6-preview-ready','e6-preview-skipped'].map(i=>document.getElementById(i));
var r=[];r.push('열림='+vis(m)+' 포커스='+document.activeElement.id+' 배너='+vis(bn)+' 적용 aria-disabled='+s.getAttribute('aria-disabled')+' 투명도='+areas.map(e=>getComputedStyle(e).opacity).join(','));
dt.value='2025-07-01';dt.dispatchEvent(new Event('change',{bubbles:true}));
r.push('적용일 변경 → 배너='+vis(bn)+' 글="'+bn.textContent+'" aria-disabled='+s.getAttribute('aria-disabled')+' describedby='+s.getAttribute('aria-describedby')+' 사유표시='+vis(ds)+' 사유="'+ds.textContent+'" 투명도='+areas.map(e=>getComputedStyle(e).opacity).join(','));
s.click();r.push('비활성 적용 클릭 → 확인모달='+vis(c)+' E6='+vis(m));
p.click();r.push('미리보기 클릭 직후 → 라벨='+p.textContent+' disabled='+p.disabled);
busy(800);return r.join('\n');})()