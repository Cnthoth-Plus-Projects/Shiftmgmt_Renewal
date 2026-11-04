export function appendDevelopmentLoginBanner(form: HTMLFormElement, submitBtn: HTMLButtonElement): void {
    let developmentPreview=false;
    if(["localhost","127.0.0.1","[::1]"].includes(window.location.hostname)){
      const enabled=new URLSearchParams(window.location.search).get("developmentPreview");
      try{if(enabled==="1")localStorage.setItem("shiftmgmt.developmentPreview","1");if(enabled==="0")localStorage.removeItem("shiftmgmt.developmentPreview");developmentPreview=enabled!=="0"&&localStorage.getItem("shiftmgmt.developmentPreview")==="1";}catch{developmentPreview=enabled==="1";}
    }
    if(developmentPreview){
      const banner=document.createElement("button");banner.type="button";banner.className="login-development-banner";banner.id="btn-development-autofill";
      banner.innerHTML='<span class="material-symbols-outlined" aria-hidden="true">science</span><span><strong>테스트 계정 자동입력</strong><small>개발 확인용 · 클릭 후 로그인 버튼을 누르세요</small></span><span class="material-symbols-outlined" aria-hidden="true">input</span>';
      const status=document.createElement("span");status.className="login-development-status";status.setAttribute("role","status");
      banner.addEventListener("click",()=>{
        const id=form.querySelector<HTMLInputElement>("#login-id")!,password=form.querySelector<HTMLInputElement>("#login-password")!;id.value="admin";password.value="ShiftTest1234!";
        for(const input of [id,password]){input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));}
        status.textContent="테스트 계정을 입력했습니다. 로그인 버튼을 눌러주세요.";submitBtn.focus();
      });form.append(banner,status);
    }

}
