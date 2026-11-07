param(
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'Programs\ShiftMgmt_V4'),
    [string]$DataRoot = (Join-Path $env:LOCALAPPDATA 'ShiftMgmt_V4'),
    [string]$DesktopDirectory = [Environment]::GetFolderPath('Desktop')
)
$ErrorActionPreference = 'Stop'
$stage = $null
$committed = $false
try {
    $packageRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
    $DataRoot = [IO.Path]::GetFullPath($DataRoot)
    $DesktopDirectory = [IO.Path]::GetFullPath($DesktopDirectory)
    if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64' -and $env:PROCESSOR_ARCHITEW6432 -ne 'AMD64') { throw 'Windows 64비트 PC에서 설치해 주세요.' }
    if ((Test-Path -LiteralPath $InstallRoot) -or (Test-Path -LiteralPath $DataRoot)) { throw '기존 설치 또는 자료 폴더가 있습니다. 덮어쓰지 않았습니다. 기존 프로그램과 자료를 먼저 확인해 주세요.' }
    if ($InstallRoot.StartsWith($packageRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or $packageRoot.StartsWith($InstallRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or $InstallRoot -eq $packageRoot) { throw '압축을 푼 폴더와 설치 폴더는 서로 다른 위치여야 합니다.' }
    if ($DataRoot -eq $InstallRoot -or $DataRoot.StartsWith($InstallRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or $InstallRoot.StartsWith($DataRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw '프로그램과 자료 폴더는 분리해 주세요.' }
    if (!(Test-Path -LiteralPath $DesktopDirectory -PathType Container)) { throw '바로가기를 만들 바탕 화면 폴더가 없습니다.' }
    $shortcutPath = Join-Path $DesktopDirectory '교대근무관리 시스템.lnk'
    if (Test-Path -LiteralPath $shortcutPath) { throw '같은 이름의 바로가기가 있습니다. 기존 바로가기를 먼저 확인해 주세요.' }
    $node = Join-Path $packageRoot 'runtime\node.exe'
    $manifest = Get-Content -LiteralPath (Join-Path $packageRoot 'PACKAGE_MANIFEST.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $nodeEntries = @($manifest.files | Where-Object { $_.path -ceq 'runtime/node.exe' })
    if ($nodeEntries.Count -ne 1 -or (Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -ine $nodeEntries[0].sha256) { throw '포함된 실행 파일이 손상되었습니다. ZIP을 다시 받아 주세요.' }
    & $node (Join-Path $packageRoot 'scripts\verify-windows-package.mjs') $packageRoot
    if ($LASTEXITCODE -ne 0) { throw '설치 파일 검사에 실패했습니다. ZIP을 다시 받아 주세요.' }
    New-Item -ItemType Directory -Path (Split-Path -Parent $InstallRoot) -Force | Out-Null
    $stage = $InstallRoot + '.installing-' + [Guid]::NewGuid().ToString('N')
    New-Item -ItemType Directory -Path $stage | Out-Null
    Get-ChildItem -LiteralPath $packageRoot -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $stage -Recurse }
    & (Join-Path $stage 'runtime\node.exe') (Join-Path $stage 'scripts\verify-windows-package.mjs') $stage
    if ($LASTEXITCODE -ne 0) { throw '복사한 설치 파일 검사에 실패했습니다.' }
    @{ version = $manifest.version; dataRoot = $DataRoot } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stage 'installation.json') -Encoding UTF8
    # Node JSON.parse는 BOM을 허용하지 않으므로 UTF8(BOM 없음)으로 저장한다.
    $configPath = Join-Path $stage 'installation.json'
    [IO.File]::WriteAllText($configPath, [IO.File]::ReadAllText($configPath), (New-Object Text.UTF8Encoding($false)))
    if ((Test-Path -LiteralPath $InstallRoot) -or (Test-Path -LiteralPath $DataRoot)) { throw '설치 중 기존 설치 또는 자료 폴더가 생겼습니다. 덮어쓰지 않았습니다.' }
    Move-Item -LiteralPath $stage -Destination $InstallRoot
    $committed = $true
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = Join-Path $InstallRoot 'START.cmd'
    $shortcut.WorkingDirectory = $InstallRoot
    $shortcut.Description = '교대근무관리 시스템 ' + $manifest.version
    $shortcut.Save()
    Write-Host ('설치 완료: ' + $InstallRoot)
    Write-Host '바탕 화면의 교대근무관리 시스템 바로가기를 실행해 주세요.'
    Write-Host '첫 아이디와 임시 비밀번호는 실행 창에 표시됩니다. 로그인 후 비밀번호를 변경해 주세요.'
    Write-Host ('자료는 처음 실행할 때 생성됩니다: ' + $DataRoot)
    exit 0
} catch {
    Write-Host ('설치하지 못했습니다. ' + $_.Exception.Message)
    if ($committed) { Write-Host ('프로그램 파일은 복사되었습니다. START.cmd로 실행할 수 있습니다: ' + $InstallRoot) }
    exit 1
} finally {
    # 이번 실행이 만든 임시 폴더만 삭제한다. 기존 프로그램/자료는 삭제하지 않는다.
    if ($stage -and (Test-Path -LiteralPath $stage)) {
        $expectedParent = [IO.Path]::GetFullPath((Split-Path -Parent $InstallRoot))
        $actual = [IO.Path]::GetFullPath($stage)
        if ((Split-Path -Parent $actual) -eq $expectedParent -and $actual.StartsWith($InstallRoot + '.installing-', [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $actual -Recurse -Force }
    }
}
