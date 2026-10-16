$ErrorActionPreference = 'Stop'
$installPath = 'C:/Users/pangyo/AppData/Local/AI-Harness'
$oldSha = 'a5638b3d4c87849fc87a7eedadec2f817ad6561e'
$targetSha = '8ebab0087b228c0203a202bead8fb56853d9cb27'
$planSha = '7875B50DD9785138FD389A1E44CD4B60146119CCD24457A5DF3A1E524706E51C'
function Invoke-CheckedGit([string[]]$Arguments) {
    $output = @(& git @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) { throw ('Git failed: ' + ($output -join "`n")) }
    return ($output | ForEach-Object { $_.ToString() })
}
function Get-TreeManifest([string]$Root) {
    $resolvedRoot = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\','/')
    $result = foreach ($file in Get-ChildItem -LiteralPath $resolvedRoot -Force -File -Recurse) {
        [pscustomobject]@{ path = $file.FullName.Substring($resolvedRoot.Length + 1).Replace('\','/'); bytes = $file.Length; sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash }
    }
    return @($result | Sort-Object path)
}
$head = (Invoke-CheckedGit @('-C',$installPath,'rev-parse','HEAD') -join '').Trim()
$status = @(Invoke-CheckedGit @('-C',$installPath,'status','--short'))
if ($head -ne $oldSha -or $status.Count -ne 1 -or $status[0] -ne '?? plan.json') { throw 'Installed baseline differs' }
$planPath = Join-Path $installPath 'plan.json'
if ((Get-Item -LiteralPath $planPath).Length -ne 22047 -or (Get-FileHash -LiteralPath $planPath).Hash -ne $planSha) { throw 'Plan baseline differs' }
if ((Invoke-CheckedGit @('-C',$installPath,'remote','get-url','origin') -join '').Trim() -ne 'https://github.com/hacker943410-debug/ai-harness.git') { throw 'Unexpected remote' }
$backupParent = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../harness-v5.1-20260930'))
[IO.Directory]::CreateDirectory($backupParent) | Out-Null
$backupPath = Join-Path $backupParent ('installed-v3-backup-' + (Get-Date -Format yyyyMMdd_HHmmss))
if (Test-Path -LiteralPath $backupPath) { throw 'Backup path already exists' }
$before = Get-TreeManifest $installPath
Copy-Item -LiteralPath $installPath -Destination $backupPath -Recurse -Force
$copied = Get-TreeManifest $backupPath
if (($before | ConvertTo-Json -Depth 4 -Compress) -ne ($copied | ConvertTo-Json -Depth 4 -Compress)) { throw 'Full installation backup mismatch' }
$backupHead = (Invoke-CheckedGit @('-c',('safe.directory=' + $backupPath.Replace('\','/')),'-C',$backupPath,'rev-parse','HEAD') -join '').Trim()
if ($backupHead -ne $oldSha -or (Get-FileHash -LiteralPath (Join-Path $backupPath 'plan.json')).Hash -ne $planSha) { throw 'Backup HEAD or plan mismatch' }
$before | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $backupParent 'installed-v3-backup-manifest.json') -Encoding utf8
Write-Output ('BACKUP_VERIFIED files=' + $before.Count + ' path=' + $backupPath)
Invoke-CheckedGit @('-C',$installPath,'fetch','--tags','--prune','origin') | Out-Null
if ((Invoke-CheckedGit @('-C',$installPath,'cat-file','-t',$targetSha) -join '').Trim() -ne 'commit') { throw 'Pinned commit missing' }
if ((Invoke-CheckedGit @('-C',$installPath,'rev-parse','refs/tags/v5.1.0^{commit}') -join '').Trim() -ne $targetSha) { throw 'Remote release tag mismatch' }
if (@(Invoke-CheckedGit @('-C',$installPath,'ls-tree','-r','--name-only',$targetSha,'--','plan.json')).Count -ne 0) { throw 'Target tree would overlap local plan' }
Invoke-CheckedGit @('-C',$installPath,'checkout','--detach',$targetSha) | Out-Null
$afterHead = (Invoke-CheckedGit @('-C',$installPath,'rev-parse','HEAD') -join '').Trim()
$afterStatus = @(Invoke-CheckedGit @('-C',$installPath,'status','--short'))
if ($afterHead -ne $targetSha -or $afterStatus.Count -ne 1 -or $afterStatus[0] -ne '?? plan.json') { throw 'Installed final state mismatch' }
if ((Get-FileHash -LiteralPath $planPath).Hash -ne $planSha -or (Get-Item -LiteralPath $planPath).Length -ne 22047) { throw 'Local plan changed' }
if ((Invoke-CheckedGit @('-C',$installPath,'config','--get','core.hooksPath') -join '').Trim() -ne '.githooks') { throw 'Hooks mismatch' }
$log = Join-Path $backupParent 'installed-v5.1-check.log'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $installPath 'scripts/Test-HarnessRepo.ps1') -HarnessRoot $installPath *> $log
$checkExit = $LASTEXITCODE
if ($checkExit -ne 0) { Get-Content -LiteralPath $log -Tail 30; throw ('Installed harness checker failed: '+$checkExit) }
$evidence = [pscustomobject]@{ time=(Get-Date -Format o); beforeHEAD=$oldSha; targetHEAD=$afterHead; backupPath=$backupPath; backupFileCount=$before.Count; backupVerified=$true; planBytes=22047; planSHA256=$planSha; planUnchanged=$true; status=$afterStatus; hooks='.githooks'; checkExit=$checkExit; checkerLog=$log }
$evidence | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $backupParent 'installed-update-evidence.json') -Encoding utf8
$evidence | ConvertTo-Json -Depth 4
Get-Content -LiteralPath $log -Tail 10
