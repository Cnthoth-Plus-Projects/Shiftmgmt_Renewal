(()=>{function busy(ms){var t=Date.now();while(Date.now()-t<ms){}}function H(e){return e?Math.round(e.getBoundingClientRect().height):null}function vis(e){return !!e&&getComputedStyle(e).display!=='none'}
var o=document.getElementById('btn-open-e8');o.click();
var m=document.getElementById('modal-e8'),s=document.getElementById('btn-submit-e8'),ty=document.getElementById('e8-type'),cd=document.getElementById('e8-code'),cr=document.getElementById('e8-code-req'),hr=document.getElementById('e8-hire'),rt=document.getElementById('e8-rate'),rd=document.getElementById('e8-rate-desc'),ds=document.getElementById('e8-submit-desc'),nm=document.getElementById('e8-name');
var r=[];var box=m.querySelector('.modal-box');
r.push('열림='+vis(m)+' 포커스='+document.activeElement.id+' 모달 '+Math.round(box.getBoundingClientRect().width)+'x'+H(box)+' | 초기 aria-disabled='+s.getAttribute('aria-disabled')+' 사유표시='+vis(ds)+' 입사일='+hr.value+' min='+hr.min+' max='+hr.max+' 시급 disabled='+rt.disabled+' 필드='+[...m.querySelectorAll('label.form-label')].map(l=>l.textContent.trim().replace(/\s*\*$/,'')).join('/'));
ty.value='BP(외부인력)';ty.dispatchEvent(new Event('change',{bubbles:true}));
r.push('BP 선택 → 사원번호 * 표시='+vis(cr)+' placeholder="'+cd.placeholder+'" 시급 disabled='+rt.disabled+' 시급사유 표시='+vis(rd)+' "'+rd.textContent+'" aria-disabled='+s.getAttribute('aria-disabled'));
cd.value='';cd.dispatchEvent(new Event('input',{bubbles:true}));r.push('BP+사원번호 비움 → aria-disabled='+s.getAttribute('aria-disabled'));
hr.value='';hr.dispatchEvent(new Event('input',{bubbles:true}));r.push('BP+입사일 비움 → aria-disabled='+s.getAttribute('aria-disabled')+' 사유="'+ds.textContent+'"');
ty.value='정규직';ty.dispatchEvent(new Event('change',{bubbles:true}));r.push('정규직 복귀(사원번호 비움) → 사유="'+ds.textContent+'" 시급 disabled='+rt.disabled+' * 표시='+vis(cr));
cd.value='50015';cd.dispatchEvent(new Event('input',{bubbles:true}));hr.value='2030-01-01';hr.dispatchEvent(new Event('input',{bubbles:true}));
r.push('입사일 2030-01-01 → aria-disabled='+s.getAttribute('aria-disabled')+' 사유="'+ds.textContent+'"');
hr.value='1989-12-31';hr.dispatchEvent(new Event('input',{bubbles:true}));r.push('입사일 1989-12-31 → aria-disabled='+s.getAttribute('aria-disabled'));
hr.value='2025-06-01';hr.dispatchEvent(new Event('input',{bubbles:true}));rt.value='0';rt.dispatchEvent(new Event('input',{bubbles:true}));
r.push('시급 0 → aria-disabled='+s.getAttribute('aria-disabled')+' 사유="'+ds.textContent+'"');
rt.value='12,000';rt.dispatchEvent(new Event('input',{bubbles:true}));r.push('시급 복원 → aria-disabled='+s.getAttribute('aria-disabled')+' 사유표시='+vis(ds));
s.click();r.push('등록 클릭 직후 → 라벨='+s.textContent+' disabled='+s.disabled+' live="'+document.getElementById('live-e8').textContent+'"');
busy(1000);return r.join('\n');})()