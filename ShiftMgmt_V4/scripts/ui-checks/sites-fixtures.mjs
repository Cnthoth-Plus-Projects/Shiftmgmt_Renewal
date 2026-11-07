// 근무지 관리 UI 검증용 TEMP 격리 55곳/55명/55버전 픽스처 생성기 (HANDOFF §6)
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

export async function seedSitesFixtures({ page, resourcesDir }) {
  // 1. 브라우저 컨텍스트에서 window.appBridge를 통해 55곳/55명/55버전/배정이력 생성
  const browserResults = await page.evaluate(async () => {
    const b=window.appBridge, take=(r,label)=>{if(!r.ok)throw Error(label+": "+r.message);return r.data;};
    const clients=["(주)알파시큐리티","베타테크솔루션","감마글로벌물류","델타통신네트웍스","엡실론화학에너지","제타인프라건설"];
    const initialSites=take(await b.listSites(),"initial sites"),initialPeople=take(await b.listEmployees(),"initial employees");
    const ids=[];let sitesCount=0,employeesCreated=0,patternsCount=0,assignmentsCount=0;
    for(let i=0;i<55-initialSites.length;i++){
      const name=["중앙관제센터","제2통합데이터센터","영남물류허브터미널"][i] || (i===41?"수도권서남부초광역복합환승센터 및 특수물류관제사업소 "+String(i).padStart(2,"0"):"시연사업장 "+String(i+1).padStart(2,"0"));
      const site=take(await b.saveSite({name,customerName:clients[i%clients.length],status:i>2&&i%7===0?"inactive":"active",timezone:"Asia/Seoul"}),"seed site "+i);ids.push(site.id);sitesCount++;
    }
    for(let i=initialPeople.length;i<65;i++){
      const status=i>18&&i%11===0?"leave":i>18&&i%13===0?"retired":"active";
      take(await b.saveEmployee({employeeCode:"DEMO-"+String(i+1).padStart(3,"0"),name:i===14||i===15?"홍길동":"시연직원 "+String(i+1).padStart(3,"0"),rank:["팀장","부팀장","반장","선임기사","관제사","조원"][i%6],status,hireDate:"2024-01-01",retireDate:status==="retired"?"2026-01-01":undefined,employmentType:i%5===0?"BP":"정규",contact:"010-0000-"+String(i+1).padStart(4,"0"),email:"staff"+(i+1)+"@example.invalid"}),"seed employee "+i);employeesCreated++;
    }
    const teams=["A조","B조","C조","D조"];
    const make=(siteId,name,date,version,three=true)=>{
      const labels=three?teams:teams.slice(0,2),steps=three?[{stepIndex:0,dutyCode:"D",startTime:"07:00",endTime:"15:00",breakMinutes:60,holidayStartTime:"08:00",holidayEndTime:"16:00",holidayBreakMinutes:60},{stepIndex:1,dutyCode:"E",startTime:"15:00",endTime:"23:00",breakMinutes:60},{stepIndex:2,dutyCode:"N",startTime:"23:00",endTime:"07:00",breakMinutes:60},{stepIndex:3,dutyCode:"O",breakMinutes:0}]:[{stepIndex:0,dutyCode:"D",startTime:"08:00",endTime:"20:00",breakMinutes:120},{stepIndex:1,dutyCode:"N",startTime:"20:00",endTime:"08:00",breakMinutes:120},{stepIndex:2,dutyCode:"O",breakMinutes:0},{stepIndex:3,dutyCode:"O",breakMinutes:0}];
      const indexes=labels.map((teamLabel,index)=>({teamLabel,index}));
      return {siteId,name,teamCount:labels.length,patternCode:steps.map(s=>s.dutyCode).join("-"),startIndexRule:"manual",patternStartDate:"2025-01-01",effectiveFrom:date,status:version>1&&version%13===0?"inactive":"active",steps,teamIndexes:indexes,cycles:[{cycleKey:"cycle-main",name:"기본 순환",order:0,shiftCount:three?3:2,patternCode:steps.map(s=>s.dutyCode).join("-"),patternStartDate:"2025-01-01",steps,teamIndexes:indexes,holidayTimeMode:"split",weekdayPublicHolidayAsHoliday:true}],teamCycleAssignments:labels.map(teamLabel=>({teamLabel,cycleKey:"cycle-main"})),teamCapacities:labels.map((teamLabel,i)=>({teamLabel,maxHeadcount:three?[3,4,4,3][i]:5})),teamSettings:labels.map((teamLabel,sortOrder)=>({teamLabel,displayName:(sortOrder+1)+"조",workType:"ROTATING",isActive:true,sortOrder})),dutyTypes:steps.filter(s=>s.dutyCode!=="O").map((s,sortOrder)=>({id:"duty-"+s.dutyCode,label:{D:"주간",E:"석간",N:"야간"}[s.dutyCode],kind:"work",sortOrder,startTime:s.startTime,endTime:s.endTime,breakMinutes:s.breakMinutes,holidayStartTime:s.holidayStartTime,holidayEndTime:s.holidayEndTime,holidayBreakMinutes:s.holidayBreakMinutes})).concat([{id:"duty-O",label:"휴무",kind:"off",sortOrder:10}])};
    };
    for(let i=0;i<55;i++){const date=new Date(Date.UTC(2025,0,1+i*16)).toISOString().slice(0,10);take(await b.saveShiftPattern(make(ids[0],"4조3교대 설정 v"+(i+1),date,i+1)),"seed main version "+i);patternsCount++;}
    for(let site=1;site<=2;site++)for(let i=0;i<3;i++){const p=make(ids[site],(site===1?"2조2교대":"Pool 지원")+" 설정 v"+(i+1),["2025-01-01","2026-01-01","2027-01-01"][i],i+1,false);if(site===2){p.poolEnabled=true;p.poolStartTime="09:00";p.poolEndTime="18:00";p.poolBreakMinutes=60;p.teamSettings.push({teamLabel:"Pool",displayName:"지원 인력",workType:"POOL",isActive:true,sortOrder:2});}take(await b.saveShiftPattern(p),"seed secondary version");patternsCount++;}
    const people=take(await b.listEmployees(),"people"),target=people.filter(e=>e.status==="active"&&!e.currentSiteId).slice(0,12);
    if(target.length<12)throw Error("Not enough unassigned active history employees");
    for(let round=0;round<3;round++)for(let i=0;i<target.length;i++){
      const shiftGroup=teams[Math.floor(i/3)];take(await b.saveEmployeeAssignment({employeeId:target[i].id,siteId:ids[0],shiftGroup,startDate:["2025-01-01","2025-06-01","2026-01-01"][round]}),"seed assignment "+round+"/"+i);assignmentsCount++;
    }
    const finalSites=take(await b.listSites(),"final sites"),finalEmps=take(await b.listEmployees(),"final people"),finalPats=take(await b.listShiftPatterns(),"final patterns");
    const histories=[];for(const e of target){const rows=take(await b.listEmployeeAssignments(e.id),"history");histories.push({employeeId:e.id,count:rows.length});if(rows.length<3)throw Error("History fixture incomplete");}
    if(finalSites.length!==55||finalEmps.length<55||finalPats.filter(p=>p.siteId===ids[0]).length!==55||[ids[1],ids[2]].some(id=>finalPats.filter(p=>p.siteId===id).length<3)||new Set(finalSites.map(s=>s.customerName).filter(Boolean)).size<6)throw Error("Fixture post-query contract failed");
    return {sitesCount,employeesCount:finalEmps.length,employeesCreated,patternsCount,assignmentsCount,mainSiteId:ids[0],mainSiteCode:finalSites.find(s=>s.id===ids[0]).siteCode,secondarySiteId:ids[1],tertiarySiteId:ids[2],employeeIds:finalEmps.map(e=>e.id),targetEmployeeIdsForHistory:target.map(e=>e.id),historyCounts:histories,initialCounts:{sites:initialSites.length,employees:initialPeople.length},finalDbCounts:{sites:finalSites.length,employees:finalEmps.length,patterns:finalPats.length},postQueryVerified:true};
  });

  // 2. Node.js 환경에서 XLSX 패턴 역추출 픽스처 파일 생성 (TEMP resourcesDir)
  if (resourcesDir) {
    const xlsxDir = path.join(resourcesDir, "fixtures");
    fs.mkdirSync(xlsxDir, { recursive: true });
    const xlsxFilePath = path.join(xlsxDir, "site-pattern-import-sample.xlsx");

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("표준근무표");
    
    // 날짜 헤더 생성 (14일간)
    const totalDays = 14;
    const dates = Array.from({ length: totalDays }, (_, idx) => new Date(Date.UTC(2026, 0, idx + 1)));
    const formatDate = (date) =>
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
        date.getUTCDate()
      ).padStart(2, "0")}`;

    worksheet.getCell("A1").value = "날짜";
    worksheet.getCell("A2").value = "요일";
    worksheet.getCell("A3").value = "공휴일";

    dates.forEach((date, idx) => {
      const col = idx + 2;
      worksheet.getCell(1, col).value = formatDate(date);
      worksheet.getCell(2, col).value = ["일", "월", "화", "수", "목", "금", "토"][date.getUTCDay()];
      worksheet.getCell(3, col).value = idx === 0 ? "신정" : "";
    });

    const sampleRows = [
      ["김현중", "D", "D", "O", "O", "N", "N", "N", "D", "D", "O", "O", "N", "N", "N"],
      ["이은동", "O", "N", "N", "N", "D", "D", "O", "O", "N", "N", "N", "D", "D", "O"],
      ["송민재", "N", "N", "N", "D", "D", "O", "O", "N", "N", "N", "D", "D", "O", "O"],
      ["박서준", "D", "O", "O", "N", "N", "N", "D", "D", "O", "O", "N", "N", "N", "D"]
    ];

    sampleRows.forEach((row, rIdx) => {
      const rowNum = rIdx + 4;
      worksheet.getCell(rowNum, 1).value = row[0];
      row.slice(1).forEach((code, cIdx) => {
        worksheet.getCell(rowNum, cIdx + 2).value = code;
      });
    });

    await workbook.xlsx.writeFile(xlsxFilePath);
    browserResults.importXlsxPath = xlsxFilePath;
  }

  return browserResults;
}
