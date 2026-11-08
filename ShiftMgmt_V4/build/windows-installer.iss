; Setup wrapper only. Application files come from the already verified release ZIP.
#ifndef PayloadDir
  #error PayloadDir is required
#endif
#ifndef AppVersion
  #error AppVersion is required
#endif

[Setup]
AppId={{9C321097-0511-4AF6-9E41-AE16F519C703}
AppName=교대근무관리 시스템
AppVersion={#AppVersion}
AppPublisher=ShiftMgmt
AppPublisherURL=https://github.com/Cnthoth-Plus-Projects/Shiftmgmt_Renewal
DefaultDirName={localappdata}\Programs\ShiftMgmt_V4
DefaultGroupName=교대근무관리 시스템
DisableProgramGroupPage=yes
UsePreviousAppDir=no
UsePreviousTasks=no
CreateAppDir=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os
MinVersion=10.0
WizardStyle=modern dynamic
DisableWelcomePage=no
UninstallFilesDir={code:GetMetadataDir}
UninstallDisplayName=교대근무관리 시스템 {#AppVersion}
UninstallDisplayIcon={app}\runtime\node.exe
CloseApplications=no
RestartApplications=no
SetupLogging=yes
SetupMutex=ShiftMgmt_V4_Setup_9C321097_0511_4AF6_9E41_AE16F519C703
Compression=lzma2/fast
SolidCompression=yes
OutputBaseFilename=ShiftMgmt-{#AppVersion}-Setup-x64
VersionInfoVersion={#AppVersion}.0
InfoBeforeFile={#GuideFile}

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"

[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{tmp}\installation.json"; DestDir: "{app}"; Flags: external

[Icons]
Name: "{code:GetDesktopDir}\교대근무관리 시스템"; Filename: "{app}\START.cmd"; WorkingDir: "{app}"
Name: "{code:GetStartMenuDir}\교대근무관리 시스템"; Filename: "{app}\START.cmd"; WorkingDir: "{app}"

[Registry]
Root: HKCU64; Subkey: "Software\ShiftMgmt\Installer\9C321097-0511-4AF6-9E41-AE16F519C703"; ValueType: string; ValueName: "DataRoot"; ValueData: "{code:GetDataRoot}"; Flags: uninsdeletevalue uninsdeletekeyifempty

[Messages]
korean.FinishedHeadingLabel=교대근무관리 시스템 설치 완료
korean.FinishedLabel=설치가 완료되었습니다.%n%n바탕 화면의 교대근무관리 시스템 바로가기를 실행하세요.%n첫 로그인 후 비밀번호를 변경하고 공휴일·요율·자료 폴더를 확인해 주세요.
korean.ConfirmUninstall=교대근무관리 시스템 프로그램을 제거하시겠습니까?%n%nDB와 업무 자료 폴더는 유지됩니다. 실행 중인 프로그램은 먼저 종료해 주세요.

[Code]
const
  OwnerKey = 'Software\ShiftMgmt\Installer\9C321097-0511-4AF6-9E41-AE16F519C703';
  HexDigits = '0123456789abcdef';

function GetDataRoot(Param: String): String;
begin
  Result := RemoveBackslashUnlessRoot(ExpandFileName(ExpandConstant('{param:DATAROOT|{localappdata}\ShiftMgmt_V4}')));
end;

function GetDesktopDir(Param: String): String;
begin
  Result := ExpandFileName(ExpandConstant('{param:DESKTOPDIR|{userdesktop}}'));
end;

function GetMetadataDir(Param: String): String;
begin
  Result := RemoveBackslashUnlessRoot(ExpandFileName(ExpandConstant('{param:METADIR|{localappdata}\Programs\ShiftMgmt_V4-Setup}')));
end;

function GetStartMenuDir(Param: String): String;
begin
  Result := ExpandFileName(ExpandConstant('{param:STARTMENUDIR|{userprograms}\교대근무관리 시스템}'));
end;

function Overlaps(const A, B: String): Boolean;
begin
  Result := (CompareText(A, B) = 0) or
    (Pos(Lowercase(AddBackslash(A)), Lowercase(AddBackslash(B))) = 1) or
    (Pos(Lowercase(AddBackslash(B)), Lowercase(AddBackslash(A))) = 1);
end;

function Hex4(Value: Integer): AnsiString;
begin
  Result := '';
  Result := Result + HexDigits[(Value div 4096) mod 16 + 1];
  Result := Result + HexDigits[(Value div 256) mod 16 + 1];
  Result := Result + HexDigits[(Value div 16) mod 16 + 1];
  Result := Result + HexDigits[Value mod 16 + 1];
end;

function JsonString(const Value: String): AnsiString;
var I: Integer; C: Integer;
begin
  Result := '"';
  for I := 1 to Length(Value) do begin
    C := Ord(Value[I]);
    if (C < 32) or (C > 126) then Result := Result + '\u' + Hex4(C)
    else if (Value[I] = '\') or (Value[I] = '"') then Result := Result + '\' + Value[I]
    else Result := Result + Value[I];
  end;
  Result := Result + '"';
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var AppDir, DataDir, MetaDir, DesktopDir, StartMenuDir: String;
begin
  Result := '';
  AppDir := RemoveBackslashUnlessRoot(ExpandFileName(ExpandConstant('{app}')));
  DataDir := GetDataRoot(''); MetaDir := GetMetadataDir(''); DesktopDir := GetDesktopDir('');
  StartMenuDir := GetStartMenuDir('');
  if DirExists(AppDir) or FileExists(AppDir) or DirExists(DataDir) or FileExists(DataDir) then
    Result := '기존 설치 또는 자료 폴더가 있습니다. 덮어쓰지 않았습니다. 기존 프로그램과 자료를 확인해 주세요.'
  else if DirExists(MetaDir) or FileExists(MetaDir) or RegKeyExists(HKCU64, OwnerKey) then
    Result := '기존 EXE 설치 정보가 있습니다. Windows 프로그램 제거에서 기존 설치를 먼저 확인해 주세요.'
  else if Overlaps(AppDir, DataDir) or Overlaps(AppDir, MetaDir) or Overlaps(DataDir, MetaDir) then
    Result := '프로그램·자료·제거 정보 폴더는 서로 다른 위치여야 합니다.'
  else if Overlaps(StartMenuDir, AppDir) or Overlaps(StartMenuDir, DataDir) or Overlaps(StartMenuDir, MetaDir) or
    Overlaps(DesktopDir, AppDir) or Overlaps(DesktopDir, DataDir) or Overlaps(DesktopDir, MetaDir) then
    Result := '바로가기 폴더는 프로그램·자료·제거 정보 폴더와 분리해 주세요.'
  else if not DirExists(DesktopDir) then Result := '바로가기를 만들 바탕 화면 폴더가 없습니다.'
  else if FileExists(AddBackslash(DesktopDir) + '교대근무관리 시스템.lnk') then
    Result := '같은 이름의 바로가기가 있습니다. 기존 바로가기를 먼저 확인해 주세요.'
  else if FileExists(StartMenuDir) or FileExists(AddBackslash(StartMenuDir) + '교대근무관리 시스템.lnk') or
    DirExists(AddBackslash(StartMenuDir) + '교대근무관리 시스템.lnk') then
    Result := '같은 이름의 시작 메뉴 항목이 있습니다. 기존 항목을 먼저 확인해 주세요.'
  else if not SaveStringToFile(ExpandConstant('{tmp}\installation.json'),
    '{"version":"{#AppVersion}","dataRoot":' + JsonString(DataDir) + '}', False) then
    Result := '설치 정보를 준비하지 못했습니다. 설치를 취소하고 다시 실행해 주세요.';
end;

function OpenProcess(Access: Cardinal; InheritHandle: Boolean; ProcessId: Cardinal): THandle;
  external 'OpenProcess@kernel32.dll stdcall';
function GetExitCodeProcess(Process: THandle; var ExitCode: Cardinal): Boolean;
  external 'GetExitCodeProcess@kernel32.dll stdcall';
function CloseHandle(Handle: THandle): Boolean;
  external 'CloseHandle@kernel32.dll stdcall';
function ProcessQueryError(): Cardinal;
  external 'GetLastError@kernel32.dll stdcall';

function ProcessStillRunning(Pid: Integer): Boolean;
var Handle: THandle; ExitCode: Cardinal;
begin
  Result := True;
  Handle := OpenProcess($1000, False, Pid);
  if Handle = 0 then begin
    // Only a nonexistent PID is safe. Access denied/unknown errors block removal.
    Result := ProcessQueryError() <> 87;
  end else begin
    if GetExitCodeProcess(Handle, ExitCode) then Result := ExitCode = 259
    else Result := True;
    CloseHandle(Handle);
  end;
end;

function InitializeUninstall(): Boolean;
var DataDir, LockPath, Digits: String; Text: AnsiString; P, I, Pid: Integer;
begin
  Result := True;
  if not RegQueryStringValue(HKCU64, OwnerKey, 'DataRoot', DataDir) then begin
    if not UninstallSilent then MsgBox('설치된 자료 폴더 정보를 확인하지 못했습니다. 프로그램과 자료를 확인한 뒤 제거해 주세요.', mbError, MB_OK);
    Result := False; Exit;
  end;
  LockPath := AddBackslash(DataDir) + 'launcher.lock';
  if not FileExists(LockPath) then Exit;
  Result := False;
  if LoadStringFromFile(LockPath, Text) then begin
    P := Pos('"pid":', String(Text)); Digits := '';
    if P > 0 then begin
      I := P + 6;
      while (I <= Length(Text)) and (Text[I] = ' ') do I := I + 1;
      while (I <= Length(Text)) and (Text[I] >= '0') and (Text[I] <= '9') do begin
        Digits := Digits + Text[I]; I := I + 1;
      end;
      Pid := StrToIntDef(Digits, 0);
      if Pid > 0 then Result := not ProcessStillRunning(Pid);
    end;
  end;
  if (not Result) and (not UninstallSilent) then MsgBox('프로그램 실행 창에서 Q를 입력해 종료한 뒤 제거해 주세요. 업무 자료는 유지됩니다.', mbError, MB_OK);
end;
