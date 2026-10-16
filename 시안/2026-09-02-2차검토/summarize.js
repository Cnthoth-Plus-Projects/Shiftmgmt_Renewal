// 24파일 measure.js JSON 집계 — 셸 정본·표 규격·12px 미만·모달·aria-disabled
const fs=require('fs'),path=require('path');
const dir=process.argv[2];const prev=process.argv[3];
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort();
const flags=[];
for(const f of files){
  let j;try{j=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));}catch(e){console.log(f,'JSON 파싱 실패',e.message);continue;}
  let pj=null;if(prev){try{pj=JSON.parse(fs.readFileSync(path.join(prev,f),'utf8'));}catch(e){}}
  console.log(`\n=== ${f.replace('.json','')} scripts=${j.scripts} bodyW=${j.bodyW} tokens: ${j.tokens}`);
  for(const w of j.wrappers){
    const pw=pj&&pj.wrappers.find(x=>x.id===w.id);
    const shell=w.hdrH!==null;
    const line=`${w.id.padEnd(10)} label=${w.labelH} hdr=${w.hdrH} title=${w.titleFs} ☰=${w.toggle} side=${w.sideW} foot=${w.footH} rows=${JSON.stringify(w.rows)} th=${w.th?w.th.bg+'/'+w.th.fw+'/'+w.th.fs:'-'} small=${w.smallN} tdSmall=${w.tdSmall} adis=${w.adis} modals=${w.modals.length}`;
    console.log(line);
    if(w.smallN)console.log('   small:',w.small.map(s=>`${s.fs}px "${s.t}"(${s.c})`).join(' · '));
    if(w.modals.length)console.log('   modals:',w.modals.map(m=>`${m.c} vis=${m.vis} role=${m.role} w=${m.w}`).join(' · '));
    console.log('   btns:',w.btns.join(' | ').slice(0,400));
    // flags
    if(w.labelH!==36)flags.push(`${w.id} 라벨바 ${w.labelH}≠36`);
    if(shell){
      if(w.hdrH!==56)flags.push(`${w.id} 헤더 ${w.hdrH}≠56`);
      if(w.titleFs!=='20px/600')flags.push(`${w.id} 제목 ${w.titleFs}≠20px/600`);
      if(w.toggle!=='40x40')flags.push(`${w.id} ☰ ${w.toggle}≠40x40`);
      if(![220,64].includes(w.sideW))flags.push(`${w.id} 사이드바 ${w.sideW}`);
      if(w.footH!==32)flags.push(`${w.id} 상태줄 ${w.footH}≠32`);
    }
    for(const r of w.rows)if(r!==40)flags.push(`${w.id} 행 높이 ${r}≠40 (rows ${JSON.stringify(w.rows)})`);
    if(w.th&&(w.th.bg!=='rgb(248, 249, 250)'||w.th.fw!=='600'))flags.push(`${w.id} 표머리 ${w.th.bg}/${w.th.fw}≠#F8F9FA/600`);
    if(w.tdSmall>0)flags.push(`${w.id} 표 본문 14px 미만 td ${w.tdSmall}개`);
    if(w.smallN>0)flags.push(`${w.id} 12px 미만 텍스트 ${w.smallN}개: ${w.small.map(s=>s.fs+'px "'+s.t+'"').join(' · ')}`);
    for(const b of w.btns)if(b.includes('[desc✗]'))flags.push(`${w.id} describedby 대상 없음: ${b}`);
    if(pw){
      const diff=[];
      if(pw.rows.join()!==w.rows.join())diff.push(`rows ${JSON.stringify(pw.rows)}→${JSON.stringify(w.rows)}`);
      if(pw.btns.join('|')!==w.btns.join('|'))diff.push(`btns 변경 (1차 ${pw.btns.length}개→${w.btns.length}개)`);
      if(pw.sideW!==w.sideW)diff.push(`side ${pw.sideW}→${w.sideW}`);
      if(diff.length)console.log('   Δ1차:',diff.join(' · '));
    }
  }
}
console.log('\n\n##### 플래그 #####');flags.forEach(x=>console.log('- '+x));console.log('총',flags.length,'건');
