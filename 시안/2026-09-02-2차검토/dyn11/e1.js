(()=>{function H(e){return e?Math.round(e.getBoundingClientRect().height):null}function vis(e){return !!e&&getComputedStyle(e).display!=='none'}
var w=document.getElementById('state-e1');var ths=[...w.querySelectorAll('thead th')].map(t=>t.textContent.trim());
var rows=[...w.querySelectorAll('tbody tr')];var tds=rows.map(r=>r.children.length);var hs=rows.map(H);
var hires=rows.map(r=>r.children[5].textContent.trim());var last=rows.map(r=>r.children[8].textContent.trim());
var btn=[...w.querySelectorAll('button')].find(b=>b.textContent.trim()==='신규 인력 등록');
var th8=w.querySelectorAll('thead th')[8];
return 'E1 머리='+ths.join('/')+' | 행='+rows.length+' 셀수='+tds.join(',')+' 높이='+hs.join(',')+' | 입사일='+hires.join(',')+' | 최근등록시급='+last.join(',')+' | 신규버튼='+(btn?btn.id+' '+H(btn)+'px':'없음')+' | 8열 title='+(th8?th8.getAttribute('title'):'-')+' | 현재시급 머리='+ths.includes('현재 시급');})()