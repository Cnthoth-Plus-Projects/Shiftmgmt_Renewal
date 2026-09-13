# Windows Dialog Runner for ShiftMgmt
# Protocol: UTF-8 JSON stdin -> exactly one line UTF-8 JSON stdout

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

try {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $stdinReader = New-Object System.IO.StreamReader([System.Console]::OpenStandardInput(), $utf8NoBom)
    $rawJson = $stdinReader.ReadToEnd()
    $stdinReader.Close()

    if ([string]::IsNullOrWhiteSpace($rawJson)) {
        [System.Console]::Error.WriteLine("Empty request payload")
        exit 1
    }

    $request = $rawJson | ConvertFrom-Json
    if (-not $request -or -not $request.operation) {
        [System.Console]::Error.WriteLine("Invalid request payload: missing operation")
        exit 1
    }

    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $result = $null

    if ($request.operation -eq "openPath") {
        if (-not $request.path) {
            [System.Console]::Error.WriteLine("Missing path for openPath operation")
            exit 1
        }
        Start-Process -FilePath $request.path -ErrorAction Stop
        $result = @{
            ok = $true
            cancelled = $false
            path = [string]$request.path
        }
    }
    elseif ($request.operation -in @("openFile", "openFolder", "saveFile")) {
        $owner = New-Object System.Windows.Forms.Form
        $owner.TopMost = $true
        $owner.ShowInTaskbar = $false
        $owner.WindowState = [System.Windows.Forms.FormWindowState]::Minimized
        $owner.Visible = $false

        try {
            if ($request.operation -eq "openFolder") {
                $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
                try {
                    if ($request.title) {
                        $dialog.Description = [string]$request.title
                    }
                    $dialog.ShowNewFolderButton = $true
                    if ($request.defaultPath -and (Test-Path -Path $request.defaultPath -PathType Container)) {
                        $dialog.SelectedPath = [string]$request.defaultPath
                    }

                    $dr = $dialog.ShowDialog($owner)
                    if ($dr -eq [System.Windows.Forms.DialogResult]::OK -and -not [string]::IsNullOrWhiteSpace($dialog.SelectedPath)) {
                        $result = @{
                            ok = $true
                            cancelled = $false
                            path = $dialog.SelectedPath
                        }
                    } else {
                        $result = @{
                            ok = $true
                            cancelled = $true
                        }
                    }
                } finally {
                    $dialog.Dispose()
                }
            }
            elseif ($request.operation -eq "openFile") {
                $dialog = New-Object System.Windows.Forms.OpenFileDialog
                try {
                    if ($request.title) { $dialog.Title = [string]$request.title }
                    if ($request.defaultPath) {
                        if (Test-Path -Path $request.defaultPath -PathType Container) {
                            $dialog.InitialDirectory = [string]$request.defaultPath
                        } elseif (Test-Path -Path $request.defaultPath -PathType Leaf) {
                            $dialog.InitialDirectory = [System.IO.Path]::GetDirectoryName($request.defaultPath)
                            $dialog.FileName = [System.IO.Path]::GetFileName($request.defaultPath)
                        } else {
                            $parent = [System.IO.Path]::GetDirectoryName($request.defaultPath)
                            if ($parent -and (Test-Path -Path $parent -PathType Container)) {
                                $dialog.InitialDirectory = $parent
                            }
                            $dialog.FileName = [System.IO.Path]::GetFileName($request.defaultPath)
                        }
                    }

                    if ($request.filters -and $request.filters.Count -gt 0) {
                        $filterParts = @()
                        foreach ($f in $request.filters) {
                            $exts = @()
                            foreach ($ext in $f.extensions) {
                                $exts += "*.$ext"
                            }
                            $extPattern = $exts -join ";"
                            $filterParts += "$($f.name) ($extPattern)|$extPattern"
                        }
                        $dialog.Filter = $filterParts -join "|"
                    }

                    $dr = $dialog.ShowDialog($owner)
                    if ($dr -eq [System.Windows.Forms.DialogResult]::OK -and -not [string]::IsNullOrWhiteSpace($dialog.FileName)) {
                        $result = @{
                            ok = $true
                            cancelled = $false
                            path = $dialog.FileName
                        }
                    } else {
                        $result = @{
                            ok = $true
                            cancelled = $true
                        }
                    }
                } finally {
                    $dialog.Dispose()
                }
            }
            elseif ($request.operation -eq "saveFile") {
                $dialog = New-Object System.Windows.Forms.SaveFileDialog
                try {
                    if ($request.title) { $dialog.Title = [string]$request.title }
                    if ($null -ne $request.showOverwriteConfirmation) {
                        $dialog.OverwritePrompt = [bool]$request.showOverwriteConfirmation
                    } else {
                        $dialog.OverwritePrompt = $true
                    }

                    if ($request.defaultPath) {
                        $parent = [System.IO.Path]::GetDirectoryName($request.defaultPath)
                        if ($parent -and (Test-Path -Path $parent -PathType Container)) {
                            $dialog.InitialDirectory = $parent
                        }
                        $dialog.FileName = [System.IO.Path]::GetFileName($request.defaultPath)
                    }

                    if ($request.filters -and $request.filters.Count -gt 0) {
                        $filterParts = @()
                        foreach ($f in $request.filters) {
                            $exts = @()
                            foreach ($ext in $f.extensions) {
                                $exts += "*.$ext"
                            }
                            $extPattern = $exts -join ";"
                            $filterParts += "$($f.name) ($extPattern)|$extPattern"
                        }
                        $dialog.Filter = $filterParts -join "|"
                    }

                    $dr = $dialog.ShowDialog($owner)
                    if ($dr -eq [System.Windows.Forms.DialogResult]::OK -and -not [string]::IsNullOrWhiteSpace($dialog.FileName)) {
                        $result = @{
                            ok = $true
                            cancelled = $false
                            path = $dialog.FileName
                        }
                    } else {
                        $result = @{
                            ok = $true
                            cancelled = $true
                        }
                    }
                } finally {
                    $dialog.Dispose()
                }
            }
        } finally {
            $owner.Dispose()
        }
    } else {
        [System.Console]::Error.WriteLine("Unsupported operation: $($request.operation)")
        exit 1
    }

    $jsonOutput = $result | ConvertTo-Json -Compress
    [System.Console]::OutputEncoding = $utf8NoBom
    $stdoutWriter = New-Object System.IO.StreamWriter([System.Console]::OpenStandardOutput(), $utf8NoBom)
    $stdoutWriter.WriteLine($jsonOutput)
    $stdoutWriter.Flush()
    $stdoutWriter.Close()
    exit 0
}
catch {
    [System.Console]::Error.WriteLine($_)
    exit 1
}
