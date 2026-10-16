// 34파일 × wrapper별 버튼 목록: id · 라벨 · aria-disabled · describedby 문구 · 위험/주 클래스
const fs=require("fs"),path=require("path");
const files=[...fs.readdirSync("2026-08-31-1차HTML").filter(f=>f.endsWith(".html")).map(f=>"2026-08-31-1차HTML/"+f),
             ...fs.readdirSync("2026-09-02-2차HTML").filter(f=>f.endsWith(".html")).map(f=>"2026-09-02-2차HTML/"+f)];
const attr=(s,n)=>{const m=s.match(new RegExp(n+'="([^"]*)"'));return m?m[1]:"";};
for(const f of files){
  const h=fs.readFileSync(f,"utf8").replace(/<script[\s\S]*?<\/script>/g,"").replace(/<style[\s\S]*?<\/style>/g,"");
  const wraps=[...h.matchAll(/<div class="state-wrapper"[^>]*id="([^"]*)"[^>]*>/g)];
  const descs={};for(const m of h.matchAll(/<[^>]*id="([^"]*)"[^>]*>([^<]{0,160})/g)) descs[m[1]]=m[2].trim();
  for(let i=0;i<wraps.length;i++){
    const start=wraps[i].index, end=i+1<wraps.length?wraps[i+1].index:h.length;
    const seg=h.slice(start,end);
    const label=(seg.match(/<div class="state-label"[^>]*>([^<]*)/)||[])[1]||(seg.match(/──\s*([^─<]{3,80})/)||[])[1]||"";
    const btns=[...seg.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map(m=>{
      const a=m[1],txt=m[2].replace(/<span class="material-symbols-outlined[^>]*>[^<]*<\/span>/g,"").replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim();
      const id=attr(a,"id"),cls=attr(a,"class"),ad=attr(a,"aria-disabled"),db=attr(a,"aria-describedby"),al=attr(a,"aria-label");
      return {id,txt:txt||("["+al+"]"),cls:cls.replace(/btn-?/g,"").trim(),ad,desc:db?(descs[db]||"(desc id 없음:"+db+")"):""};
    }).filter(b=>!/sidebar-toggle|user-info-btn|tab-btn/.test(b.cls+" "+b.id));
    console.log(`\n## ${path.basename(f)} :: ${wraps[i][1]} :: ${label.trim().slice(0,70)}`);
    for(const b of btns) console.log(`- ${b.id||"(no id)"} | ${b.txt} | ${b.cls}${b.ad?" | aria-disabled="+b.ad+" → "+b.desc:""}`);
  }
}
