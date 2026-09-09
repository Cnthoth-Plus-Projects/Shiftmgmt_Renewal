# 교대근무관리 시스템 (판 0.1.0)

한 대의 PC에 두고 쓰는 작은 프로그램이다. 프로그램을 켜면 **이 PC 안에서만** 서버가 돌고, 화면은 **크롬**으로 열린다.
지금은 뼈대만 있는 단계다 — 화면은 Phase 3에서, 업무 로직·데이터는 Phase 1-2 이후에 들어온다.

## 실행하는 법 (3줄)

```
npm ci          (처음 한 번. PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 로 브라우저를 내려받지 않는다)
npm run dev     (빌드 → 서버 시작 → 크롬이 자동으로 열린다)
Ctrl+C          (끝낼 때. 크롬 창만 닫으면 서버는 계속 돈다)
```

- Windows PowerShell에서 처음 설치할 때: `$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1"; npm ci`
- **크롬이 설치되어 있어야 한다.** 없으면 어디를 찾아봤는지 알려 주고 멈춘다(프로그램이 브라우저를 내려받지 않는다).
  다른 곳에 설치했다면 환경변수 `SHIFTMGMT_CHROME_PATH` 에 `chrome.exe` 경로를 넣어 준다.
- 빌드본만 실행하려면 `npm run build` 뒤 `npm start` — 그 다음 크롬 주소창에 `http://127.0.0.1:8734/` 를 넣는다.

## 어디에 무엇이 있나

| | |
|---|---|
| 주소 | `http://127.0.0.1:8734/` (이 PC 밖에서는 열리지 않는다. 포트를 바꾸려면 환경변수 `SHIFTMGMT_PORT`) |
| 판 번호 | `0.1.0` — 루트 `VERSION` 파일과 `package.json` 이 같은 값을 갖는다(`npm run release:check` 가 확인한다) |
| 데이터 폴더 | `%LOCALAPPDATA%\ShiftMgmt_V4\` (환경변수 `SHIFTMGMT_USER_DATA_DIR` 로 바꿀 수 있다). 설정·DB가 여기 쌓인다 |
| 창구 규약 | `docs/api-convention.md` — 화면과 서버가 주고받는 규칙과 계약표 111행 |
| 코드 지도 | `docs/codebase-map.md` — 어떤 파일이 무슨 일을 하는지 |

## 자주 쓰는 명령

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 실행(빌드 → 서버 → 크롬) |
| `npm run build` | 서버·화면 빌드(`dist/`) |
| `npm run typecheck` | 타입 검사(서버·화면 두 갈래) |
| `npm run lint` | 코드 규칙 검사 |
| `npm test` | 테스트 |
| `npm run validate:map` | 코드 지도가 가리키는 파일이 실제로 있는지 확인 |
| `npm run release:check` | 내보내기 전 점검(판 번호·작업 트리·태그·검사 3종·빌드 산출물) |
| `npm run capture -- http://127.0.0.1:8734/ artifacts/captures/home.png` | 실제 크롬으로 화면을 찍는다 |

## 알아 둘 것

- **크롬 창(탭)을 닫아도 서버는 남는다.** 완전히 끝내려면 `npm run dev` 를 띄운 터미널에서 `Ctrl+C` 를 누른다.
- 서버는 `127.0.0.1` 에만 귀를 연다. 다른 PC에서는 접속할 수 없다(그렇게 설계했다).
- 프로그램이 스스로 인터넷에서 새 판을 내려받지 않는다. 새 판 적용은 「적용」 스크립트로 사람이 한다.
