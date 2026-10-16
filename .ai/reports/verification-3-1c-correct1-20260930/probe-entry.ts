import { HomeScreen } from "C:/Projects/Active/ShiftMgmt_V4/src/web/screens/home";
import { installBrowserAppBridge } from "C:/Projects/Active/ShiftMgmt_V4/src/web/bridge/app-bridge";
installBrowserAppBridge();
(window as any).expiredCalls=0;
(window as any).reviewHome=new HomeScreen({container:document.getElementById("main-content")!,session:{role:"admin",userId:"fixture-admin",displayName:"검증용 관리자"} as any,onSessionExpired:()=>{(window as any).expiredCalls++;}});
(window as any).reviewHome.render();
