(()=>{var o=document.getElementById('btn-open-e8');o.click();var m=document.getElementById('modal-e8');
var src=['사원번호','고용형태','직급','이름','연락처','입사일','근무지','조','통상시급'];
var got=[...m.querySelectorAll('label.form-label')].map(l=>l.textContent.trim().replace(/\s*\*$/,'').replace(/\s*\((선택|원)\)$/,''));
var ids=[...m.querySelectorAll('label.form-label')].map(l=>l.getAttribute('for'));
var tab=[...m.querySelectorAll('input,select')].filter(e=>e.id.startsWith('e8-')).map(e=>e.id);
var ok=JSON.stringify(got)===JSON.stringify(src);
document.getElementById('btn-cancel-e8').click();
return 'E8 라벨 순서='+got.join('/')+'\n소스 순서(WorkforceManagementScreen.tsx 2130-2266, 읽기전용 상태 제외)='+src.join('/')+'\n일치='+ok+'\nfor='+ids.join('/')+'\n탭 순서(input/select id)='+tab.join('/');})()
