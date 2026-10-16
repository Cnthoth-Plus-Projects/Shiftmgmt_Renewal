# Phase3-2b CORRECT1 — Sol 독립 검증 종결 / CORRECT2

- From: Sol · frontier · Date: 2026-09-30 23:05:10 KST
- Verdict: **CORRECT2 — 수용 보류, 두 번째/마지막 통합 수정 요청**
- Repository: `C:\Projects\Active\ShiftMgmt_V4` · main · `160940f9aaeb6696538447f83b44658073e382f0` · HEAD/status9/전체338파일 불변
- 수신원본: `C:\Projects\Active\교대근무관리 시스템\Log\20260930_224512_3-2b-CORRECT1-Gemini_수신원본.md` · 44538bytes · SHA-256 `35C5D75650FEE1E99FFEC731CB7921B8B096E93AF7BAE5763D2CCDD7C8E97E8C`
- 전환 보존: `C:\Projects\Active\교대근무관리 시스템\Log\20260930_230510_3-2b-CORRECT1-Gemini_CORRECT2전환보존.md` — 수신 byte-for-byte 동일
- 독립 증거: `C:\Projects\Active\교대근무관리 시스템\.ai\reports\phase3-2-correct1-review-20260930_224512`
- 제품 소스 변경·commit/push/배포 by Sol: 0

## 통과한 검증

본문 불변, 수정 exact5, 보호333/정본14/제출9hash·크기 전부 일치. 각5파일30,000bytes 이하. 독립 typecheck/syntax/lint(기존5경고)/map87/관련3파일11시험/diffcheck/build 전부 RC0. 전체133파일919시험은 Gemini 자기보고이며 구체적인 반려 결함 확인 후 Sol이 full suite를 재실행하지 않았다.

설치 Chrome154.0.8037.58/1440×900/fonts.ready 최종9그룹 **8PASS/1FAIL**. 자연 실행의 예상외 console/pageerror/requestfailed/HTTP오류0. 실제 operator/planner/reviewer 세션은 각각 menu0/자동list·users0/direct cookie API AUTH_FORBIDDEN/data없음 PASS다. UI stale 시험의 성공/권한응답은 fixture이며 실제 인증 만료 검증으로 주장하지 않는다.

## stable 결함별 판정

| ID | 판정 | 독립 근거 / 남은 조건 |
|---|---|---|
| R32C-01 | PARTIAL | old success/auth의250ms 내잘못된반영0,keyword→즉시refresh list1회로개선. 다만 screen240–255는count만검색입력중으로바꾸고본문을렌더링하지않아 **settled old row1/loading0**을새keyword와함께보여준다. query변경순간rows/count는현재query를가리켜야하는원계약과CORRECT1 §6.1 미충족. |
| R32C-02 | RESOLVED | held요청→두날짜역전→oldrelease전후loading0,오류사유,native조건잠금유지. |
| R32C-03 | RESOLVED | usersretry1회뒤 native disabled=true. native추가click+강제DOMevent 모두 handlerguard로차단해 users1/logs1. |
| R32C-04 | RESOLVED | hide-approved red실측,model신규정본시험PASS,publishinfo/approval배타분류원문확인. |
| R32C-05 | RESOLVED | normal/1216자긴row40px,날짜132×34,열130/140/100/160/rest640,표aria-label,원문text/title각1216자보존. |
| R32C-06 | PARTIAL / BLOCKER | publicCLI7음성RC1거부개선. 하지만 rawErrors수집만하고판정/manifest에사용0,requestfailed/HTTP/font검사0,commonhelper재사용0. **제품파일을바꾸지않고시험용console1/pageexception2를runtime주입한list-fixture가실제RC0/PASS**. 해당합성오류는제품결함이아니라검증기실패검사다. |

R32C-06 정적 확정 근거: runner236–240 수집→558–560에서무평가PASS;catch567 process.exit(1)가finally568–571실행을막는다.204/223/560 PASS/tempCleaned는실제정리전이다. start74는소유확인전에타PID일수있는포트로health요청하며99–107도spawn의포트소유증명없이로그인시도할수있다. kill125listener는경합·상한없음. 공통runScreenCheck/validateTargetUrl/waitForFontsReady import/call0. 이후CORRECT2는자기소유프로세스·정확한오류검문·최종상태기록을한번에닫아야한다.

실제 제출action-assertions도검사했다(`provided-action-evidence.json`). role-guard는operator/planner **5조건뿐**(reviewer0/plannerusers0/자동호출/data없음0),stale-response1조건(oldsuccess만),errors2메시지조건(retrycount/nativeguard실측0),session-expired2조건중redirect는literal true/true/true이며got401은수집후assert0. 필수10case가실제로요구행동을검사했다는회신서술은입증되지않는다. session signOut자체는별도nativefetch에실제cookie를보내는서버무효화로개선됐으며그부분을가짜라고주장하지않는다.

## 검수 도구 첫 실패 및 정리

첫 native probe에서두번째Playwrightclick은수정된disabled버튼에막혀도구timeout이었다. 제품실패로판정하지않고source/result/serverinfo/cleanup을.first-pass보존했다. 두번째동작을native el.click() 및강제DOMclick event로분리하고fresh격리서버에서재실행해users1/logs1을확인했다. Windows node --import의첫absolute-path입력은URLscheme오류로제품실행전중단;fileURI/structuredargv로고쳐합성오류시험을성공적으로실행했다. 자세한기록 `control-first-failures.md`.

Sol의두Chrome/probe컨텍스트와MCPbrowser종료,격리서버2회ownPIDexit/temp삭제,합성오류runner의ownedtemp삭제/port18741닫힘확인. 과거temp는건드리지않았다. Gemini의역사10실행전체cleanup독립확인주장0.

## 다음 경계

현재CORRECT1검증대상은이판정으로닫는다. TODO/current-state의승인된사실상태만갱신하고수정허용을 **screen/runner 2파일**로줄인다. model/modeltest/CSS와기존4통합파일은새baseline에서보호,총336파일/정본14불변. 원요구/필수10case/full시험게이트유지. R32C-02~05는해소됐지만전체3-2는수용·커밋보류다. CORRECT2재제출도실패하면같은지시서를반복하지않고Sol이전략/범위를재설계한다.3-1e사용자직접화면확인대기도유지한다.
