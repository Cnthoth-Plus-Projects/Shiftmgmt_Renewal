# 교대근무관리 시스템 (ShiftMgmt) 1.0.4

Windows PC 한 대에서 사용하는 교대근무·실적·수당 관리 프로그램입니다. 로컬 Node 서버와 설치된 Google Chrome으로 동작합니다.

인력·근무지 등록 → 근무표 Excel 생성 → 원본 Excel 실적 가져오기 → 실적 검토/승인·수당 계산 → 품의서·별첨1·별첨2 A4 출력 흐름을 제공합니다. 운영 관리에서 계정·요율·양식·폴더·백업 등을 관리하며 시스템/다크 테마를 지원합니다. 실적은 Excel로만 가져오고 승인된 계산은 저장 시점의 정책·금액을 보존합니다.

일반 사용자는 릴리즈의 **ShiftMgmt-1.0.4-Setup-x64.exe**를 받아 설치 안내를 따르면 됩니다. Windows x64 ZIP을 풀고 INSTALL.cmd를 실행하는 방식도 계속 지원합니다. Node가 포함되어 있고 Chrome만 별도로 필요합니다. [새 PC 설치 안내](docs/fresh-install.md), [1.0.4 릴리즈 설명](docs/release-1.0.4.md)을 확인해 주세요. 기존 설치/자료는 덮어쓰지 않으며 1.0.4부터 바로가기로 실행할 때 호환되는 새 정식 버전을 자동 확인·다운로드·검증해 사용합니다. 기존 ShiftMS 0.5.8 자료는 JSON 복원으로 가져옵니다.

EXE 설치 마법사는 [Inno Setup](https://jrsoftware.org/)으로 만듭니다. 고정한 공식 compiler와 검증된 기존 ZIP을 사용하며 앱 파일은 변경하지 않습니다. 설치자가 Windows 프로그램 제거를 제공하고 DB·업무 자료는 유지합니다.

개발에는 Windows x64, Node24와 npm, Google Chrome이 필요합니다.

```powershell
npm ci
npm run dev
```

개발 실행은 빌드·서버·Chrome을 시작합니다. 테스트 계정 자동입력은 개발 빌드와 명시적 developmentPreview=1 환경에서만 제공하며, 정식 빌드에는 표시하지 않습니다. 운영 데이터로 개발 검증을 하지 마세요.

```powershell
npm run build
npm run typecheck
npm run lint
npm test
npm run validate:map
npm run smoke
```

배포 담당자는 소스를 커밋하고 같은 버전 태그를 만들기 전에 npm run release:check를 실행합니다. npm run release:package -- [새 출력 경로]로 Node 포함 ZIP·SHA256·매니페스트·빌드 기록을 만듭니다. npm run release:smoke -- [ZIP 절대 경로]는 격리된 TEMP에서 실제 설치와 Chrome 첫 로그인·종료/재시작 및 거절 검문을 수행합니다. 이 검문은 실제 사용자의 데이터 폴더나 바탕 화면을 사용하지 않습니다.

기본 접속 주소는 http://127.0.0.1:8734 이며 외부 네트워크에 공개하지 않습니다. 정식 설치 자료는 %LOCALAPPDATA%\ShiftMgmt_V4 에 별도 보관됩니다. 운영 관리의 백업 기능으로 백업하고 별도 저장소에도 보관해 주세요. JSON3 백업은 구판 프로그램에서 복원할 수 없습니다.

실행 의존성은 ExcelJS·Chokidar·Playwright이며 정확한 버전은 package-lock.json에 고정합니다. 브라우저는 자동 다운로드하지 않습니다. 배포 ZIP에는 Node·글꼴 라이선스 및 실행 의존성의 원래 라이선스를 포함합니다. ZIP 설치 도구는 Windows 코드서명된 설치 프로그램이 아닙니다.
