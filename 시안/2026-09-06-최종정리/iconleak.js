// 아이콘 낭독 누출: material-symbols span 자신 또는 조상에 aria-hidden="true" 또는 aria-label 이 없는 것
const fs=require('fs');
const VOID=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
function attrs(s){const o={};const re=/([a-zA-Z-:]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g;let m;while((m=re.exec(s))){o[m[1].toLowerCase()]=m[3]??m[4]??m[5]??'';}return o;}
for(const f of process.argv.slice(2)){
  let html=fs.readFileSync(f,'utf8');
  html=html.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
  const re=/<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;let m;const stack=[];let total=0,leak=0;const names={};
  while((m=re.exec(html))){
    const tag=m[1].toLowerCase();
    if(m[0][1]==='/'){for(let i=stack.length-1;i>=0;i--){if(stack[i].tag===tag){stack.length=i;break;}}continue;}
    const a=attrs(m[2]);const self=m[2].trim().endsWith('/')||VOID.has(tag);
    const hidden=(a['aria-hidden']==='true')||('aria-label' in a);
    const el={tag,hidden};
    if(/\bmaterial-symbols/.test(a['class']||'')){
      total++;
      const covered=hidden||stack.some(e=>e.hidden);
      if(!covered){leak++;const txt=html.slice(re.lastIndex,re.lastIndex+40).replace(/<.*$/,'').trim();names[txt]=(names[txt]||0)+1;}
    }
    if(!self)stack.push(el);
  }
  console.log(f.split('/').pop(), 'total='+total, 'leak='+leak, JSON.stringify(names));
}
