(()=>{function H(e){return e?Math.round(e.getBoundingClientRect().height):null}function vis(e){return !!e&&getComputedStyle(e).display!=='none'}
var w=document.getElementById('state-e2');var ths=[...w.querySelectorAll('table.table-data thead th')].map(t=>t.textContent.trim());
var rows=[...w.querySelectorAll('table.table-data tbody tr')];var tds=rows.map(r=>r.children.length);var hs=rows.map(H);
var sub=w.querySelector('#e2-detail-title').nextElementSibling.textContent.trim();
var cur=w.querySelector('#e2-current-rate').textContent.trim();var sch=w.querySelector('#e2-scheduled-rate').textContent.trim();
var hist=[...w.querySelectorAll('table.table-custom tbody tr')].map(r=>[...r.children].map(c=>c.textContent.trim()).join('|'));
var hths=[...w.querySelectorAll('table.table-custom thead th')].map(t=>t.textContent.trim());
var panel=w.querySelector('aside[style*="width:380px"]');
return 'E2 좌측머리='+ths.join('/')+' | 행='+rows.length+' 셀수='+tds.join(',')+' 높이='+hs.join(',')+' | 보조줄='+sub+' | 현재='+cur+' | 예정='+sch+' | 이력머리='+hths.join('/')+' | 이력='+hist.join(' ; ')+' | 패널폭='+Math.round(panel.getBoundingClientRect().width)+' 패널높이='+H(panel)+' 스크롤='+panel.scrollHeight;})()