import type { AuthSession } from "../../shared/domain/model";
import type { SitePatternImportAnalysis } from "../../shared/bridge/contracts";
import type { PatternDraft } from "./sites-pattern-model";
import { WorkforceDialog } from "./workforce-dialog";
export interface SitesImportOptions {
 session:AuthSession;draft:PatternDraft;onApplyAnalysis:(analysis:SitePatternImportAnalysis)=>boolean;onClose:()=>void;
 onBusyChange?:(busy:boolean)=>void;onSessionExpired?:()=>void;isAlive?:()=>boolean;
}
export class SitesImportModal {
 private dialog=new WorkforceDialog();private body=document.createElement("div");private result:SitePatternImportAnalysis|null=null;
 private opened=false;private busy=false;private generation=0;private error="";private overlay:HTMLElement|null=null;
 constructor(private options:SitesImportOptions){}
 private alive(id=this.generation):boolean{return this.opened&&id===this.generation&&(this.options.isAlive?.()??true);}
 public open():void{
  this.opened=true;this.generation++;this.overlay=this.dialog.open({id:"sites-import-modal",title:"기존 근무표에서 패턴 가져오기",width:"760px",content:this.body,initialFocusSelector:"#btn-import-cancel",buttons:[
   {id:"btn-select-excel",label:"엑셀 파일 선택·분석",onClick:()=>this.analyze(),disabled:this.options.session.role!=="admin"},
   {id:"btn-apply-import",label:"초안에 반영하기",disabled:true,onClick:()=>this.apply()},
   {id:"btn-import-cancel",label:"닫기",onClick:()=>this.close()}],
   onClose:()=>{this.opened=false;this.generation++;this.result=null;this.options.onClose();}});this.render();
 }
 public close():void{if(!this.busy)this.dialog.close();}
 public destroy():void{this.generation++;this.opened=false;this.result=null;this.busy=false;this.dialog.setProcessing(false);this.dialog.close();}
 private render():void{
  if(!this.alive())return;this.body.replaceChildren();const message=document.createElement("p");
  message.textContent=this.options.session.role==="admin"?"근무표 엑셀을 분석한 뒤 제안과 제외 내용을 검토해 주세요. 반영 전까지 기존 초안은 바뀌지 않습니다.":"엑셀 파일 선택은 관리자 권한이 필요합니다. 직접 패턴을 작성하거나 기존 근무지 설정을 복사할 수 있습니다.";this.body.append(message);
  if(this.busy){const p=document.createElement("p");p.textContent="분석 중입니다. 완료될 때까지 이 화면을 유지해 주세요.";this.body.append(p);}
  if(this.error){const p=document.createElement("p");p.className="banner-warning";p.textContent=this.error;this.body.append(p);}
  if(this.result){const h=document.createElement("h3");h.textContent=this.result.suggestion.teamCount+"개 조 · "+this.result.suggestion.cycles.length+"개 묶음 추출";this.body.append(h);
   const report=document.createElement("pre");report.style.whiteSpace="pre-wrap";report.style.maxHeight="300px";report.style.overflow="auto";report.textContent=this.result.analysisReport;this.body.append(report);
   for(const warning of this.result.warningMessages){const p=document.createElement("p");p.className="banner-warning";p.textContent=warning;this.body.append(p);}
   for(const skipped of this.result.skippedWorkers){const p=document.createElement("p");p.textContent="제외 내용: "+JSON.stringify(skipped);this.body.append(p);}}
  const apply=this.overlay?.querySelector<HTMLButtonElement>("#btn-apply-import");if(apply)apply.disabled=!this.result||this.busy;
 }
 private apply():void{if(!this.alive()||this.busy||!this.result)return;try{if(this.options.onApplyAnalysis(this.result))this.close();else{this.error="제안을 반영하지 못했습니다. 초안을 확인해 주세요.";this.render();}}catch(error){this.error=error instanceof Error?error.message:String(error);this.render();}}
 private async analyze():Promise<void>{
  if(!this.alive()||this.busy||this.options.session.role!=="admin")return;const id=++this.generation;
  this.result=null;this.error="";this.busy=true;this.options.onBusyChange?.(true);this.render();this.dialog.setProcessing(true);
  try{const selected=await window.appBridge!.selectSpreadsheetFile();if(!this.alive(id))return;
   if(!selected.ok){if(/SESSION|AUTH_SESSION/.test(selected.errorCode))this.options.onSessionExpired?.();throw Error(selected.message);}if(!selected.data)return;
   const response=await window.appBridge!.analyzeSitePatternImport({filePath:selected.data.filePath});if(!this.alive(id))return;
   if(!response.ok){if(/SESSION|AUTH_SESSION/.test(response.errorCode))this.options.onSessionExpired?.();throw Error(response.message);}this.result=response.data;
  }catch(error){if(this.alive(id))this.error=error instanceof Error?error.message:String(error);}
  finally{if(this.alive(id)){this.busy=false;this.dialog.setProcessing(false);this.options.onBusyChange?.(false);this.render();}}
 }
}
