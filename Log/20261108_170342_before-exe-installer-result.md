# HANDOFF — REL-EXE-01 실행

사용자 “아 오케이 무슨말인지 이해했어. 그럼 설치 파일로 만드는건? exe파일로”에 따라 새PC용 단일Setup.exe를 만든다. Sol 직접/Gemini 최초0·재시도0·누적0. 초기1~2h추정. 제품허용7경로/검문6그룹은TODO/장부와동일.

공식Inno Setup6.7.4 compiler를고정SHA/Authenticode검증후전용TEMP portable모드로사용한다. 기존1.0.3 ZIP 40274eeacf935f9bc2e99b6bde241ff60d26073c48148a837bad41ec65295f03와앱파일2683개를그대로설치하며, 앱sourceceb66933c1af03a9331e611d254384aa6452c9b4/tree5990bbc2c44a777a0ed677b71fe598d950dc7e9f는변경하지않는다. wrapper소스커밋과payload소스를별도로영수증에고정한다. 새빌드의존성은npm/runtime에추가하지않는다.

EXE는사용자권한설치·바탕화면바로가기·시작메뉴/Windows제거등록을제공한다. 기존프로그램/자료/바로가기/설치정보가있으면설치전거절한다. 제거정보는앱무결성검사대상폴더밖에두고제거는소유한프로그램파일/바로가기만처리,DB자료폴더/모르는사용자파일을보존한다. 프로그램실행중에는제거를거절한다.

실제EXE설치/중복/취소/한글경로·포함Node/Chrome/첫로그인/재실행·제거/DB보존과계산/A4출력을격리TEMP에서검증한다. GUI마법사는computer-use로확인한다. 기존앱시험1598/160은동일payload지문에묶어재사용하며앱시험을새실행했다하지않는다. EXE검증후1.0.3릴리즈에EXE/별도해시/빌드·설치검증을추가하며기존6첨부는덮어쓰지않는다. 실제대상PC설치는사용자가진행한다.

소스설치 도구문서: https://jrsoftware.org/ishelp/topic_setup_uninstallfilesdir.htm 및 공식license https://raw.githubusercontent.com/jrsoftware/issrc/is-6_7_4/license.txt. 증거C:\Users\hacke\AppData\Local\Temp\shiftmgmt-exe-8uhrjP. 수신HANDOFF Log/20261108_162628_before-exe-installer.md,3817bytes/SHA256 E696426E05758BC03B5B28AD5665010E1223DEF8CA56E84E36B493F775BDB7CD 바이트동일보존.
