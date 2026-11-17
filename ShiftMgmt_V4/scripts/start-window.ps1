param([switch]$NoBrowser, [switch]$KeepWindow)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Windows.Forms, System.Drawing
$installRoot = Split-Path -Parent $PSScriptRoot
$sessionDir = Join-Path ([IO.Path]::GetTempPath()) ('shiftmgmt-start-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($sessionDir) | Out-Null
$progressPath = Join-Path $sessionDir 'progress.jsonl'
$controlPath = Join-Path $sessionDir 'stop.request'
$stdoutPath = Join-Path $sessionDir 'startup.log'
$stderrPath = Join-Path $sessionDir 'error.log'
[xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" Title="교대근무관리 시스템 · 시작" Width="570" Height="448" WindowStartupLocation="CenterScreen" ResizeMode="NoResize" Background="#F4F7FB" FontFamily="Malgun Gothic" Foreground="#24354B">
  <Window.Resources>
    <Style TargetType="Button">
      <Setter Property="Background" Value="#F3F6FC"/><Setter Property="Foreground" Value="#34518B"/><Setter Property="BorderBrush" Value="#D9E3F3"/><Setter Property="BorderThickness" Value="1"/><Setter Property="FontSize" Value="12"/><Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Template"><Setter.Value><ControlTemplate TargetType="Button"><Border x:Name="ButtonBorder" Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}" BorderThickness="{TemplateBinding BorderThickness}" CornerRadius="7" Padding="{TemplateBinding Padding}"><ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/></Border><ControlTemplate.Triggers><Trigger Property="IsMouseOver" Value="True"><Setter TargetName="ButtonBorder" Property="Background" Value="#E5EDFC"/></Trigger><Trigger Property="IsEnabled" Value="False"><Setter TargetName="ButtonBorder" Property="Opacity" Value="0.5"/></Trigger><Trigger Property="IsKeyboardFocused" Value="True"><Setter TargetName="ButtonBorder" Property="BorderBrush" Value="#4264CC"/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter>
    </Style>
  </Window.Resources>
  <Border Margin="18" Padding="26" Background="White" BorderBrush="#E0E7F0" BorderThickness="1" CornerRadius="16">
    <Grid><Grid.RowDefinitions><RowDefinition Height="60"/><RowDefinition Height="54"/><RowDefinition Height="38"/><RowDefinition Height="28"/><RowDefinition Height="54"/><RowDefinition Height="*"/></Grid.RowDefinitions>
      <Grid><Image x:Name="Logo" Width="205" Height="60" HorizontalAlignment="Left" Stretch="Uniform"/><TextBlock x:Name="Version" HorizontalAlignment="Right" VerticalAlignment="Center" Foreground="#73839A" FontSize="12"/></Grid>
      <StackPanel Grid.Row="1" VerticalAlignment="Center"><TextBlock Text="교대근무관리 시스템" FontSize="22" FontWeight="Bold"/><TextBlock Text="업무를 시작할 준비를 하고 있습니다" Foreground="#73839A" FontSize="12" Margin="0,4,0,0"/></StackPanel>
      <Grid Grid.Row="2" VerticalAlignment="Bottom" Margin="0,0,0,8"><TextBlock x:Name="Stage" Text="시작 준비" FontWeight="SemiBold" FontSize="14"/><TextBlock x:Name="Percent" Text="0%" HorizontalAlignment="Right" FontWeight="Bold" FontSize="18" Foreground="#3E56B6"/></Grid>
      <ProgressBar x:Name="Progress" Grid.Row="3" Minimum="0" Maximum="100" Height="9" VerticalAlignment="Center" BorderThickness="0" Background="#E9EEF6" Foreground="#3E56B6"/>
      <TextBlock x:Name="Message" Grid.Row="4" Text="실행 환경을 준비합니다." TextWrapping="Wrap" FontSize="12" Foreground="#61748C" Margin="0,10,0,0"/>
      <Grid Grid.Row="5" Margin="0,10,0,0"><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="*"/></Grid.RowDefinitions><TextBlock x:Name="Hint" Text="준비 단계가 완료될 때 진행률이 올라갑니다." FontSize="11" Foreground="#73839A" TextWrapping="Wrap"/><StackPanel Grid.Row="1" Orientation="Horizontal" HorizontalAlignment="Right" VerticalAlignment="Bottom"><Button x:Name="OpenLog" Content="안내 보기" Visibility="Collapsed" Padding="12,7" Margin="0,0,8,0"/><Button x:Name="Exit" Content="닫기" Padding="14,7"/></StackPanel></Grid>
    </Grid>
  </Border>
</Window>
'@
$window = [Windows.Markup.XamlReader]::Load((New-Object Xml.XmlNodeReader $xaml))
$ui = @{}
foreach ($name in 'Logo','Version','Stage','Percent','Progress','Message','Hint','OpenLog','Exit') { $ui[$name] = $window.FindName($name) }
$logoPath = Join-Path $installRoot 'dist\browser\web\assets\brand-logo-transparent.png'
if (Test-Path -LiteralPath $logoPath) { $ui.Logo.Source = New-Object Windows.Media.Imaging.BitmapImage ([Uri]$logoPath) }
$iconPath = Join-Path $installRoot 'dist\browser\web\assets\brand-app.ico'
$brandTrayIcon = $null
if (Test-Path -LiteralPath $iconPath) {
  $window.Icon = [Windows.Media.Imaging.BitmapFrame]::Create([Uri]$iconPath)
  $brandTrayIcon = New-Object Drawing.Icon $iconPath,32,32
}
$state = @{ process=$null; ready=$false; closing=$false; failed=$false; url=$null; hideAt=$null; infoPath=$null }
$tray = New-Object Windows.Forms.NotifyIcon
if ($brandTrayIcon) { $tray.Icon = $brandTrayIcon } else { $tray.Icon = [Drawing.SystemIcons]::Application }
$tray.Text = '교대근무관리 시스템'
$menu = New-Object Windows.Forms.ContextMenuStrip
$openItem = $menu.Items.Add('프로그램 열기')
$statusItem = $menu.Items.Add('실행 상태 보기')
$exitItem = $menu.Items.Add('프로그램 종료')
$tray.ContextMenuStrip = $menu
$openProgram = { if ($state.url) { Start-Process -FilePath $state.url } else { $window.Show(); $window.Activate() | Out-Null } }
$openItem.Add_Click($openProgram)
$tray.Add_DoubleClick($openProgram)
$statusItem.Add_Click({ $window.Show(); $window.Activate() | Out-Null })
$stopProgram = {
  if ($state.closing) { return }
  $state.closing = $true
  if ($state.process -and -not $state.process.HasExited) {
    [IO.File]::WriteAllText($controlPath, 'stop')
    $ui.Stage.Text = '프로그램 종료 중'
    $ui.Message.Text = '자료 연결과 실행 중인 서비스를 안전하게 정리합니다.'
    $ui.Exit.IsEnabled = $false
    $window.Show()
  } else { $window.Close() }
}
$exitItem.Add_Click($stopProgram)
$ui.Exit.Add_Click($stopProgram)
$ui.OpenLog.Add_Click({ if ($state.infoPath) { Start-Process -FilePath $state.infoPath } else { Start-Process -FilePath $sessionDir } })
$window.Add_Closing({ param($sender,$event) if ($state.process -and -not $state.process.HasExited) { $event.Cancel=$true; if ($state.ready -and -not $state.closing) { $window.Hide() } else { & $stopProgram } } })
$window.Add_Closed({ $tray.Visible=$false; $tray.Dispose(); if ($brandTrayIcon) { $brandTrayIcon.Dispose() }; [Windows.Threading.Dispatcher]::ExitAllFrames() })
$timer = New-Object Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(150)
$timer.Add_Tick({
  try {
    if ((Test-Path -LiteralPath $progressPath) -and -not $state.closing -and -not $state.failed) {
      $progressStream = New-Object IO.FileStream $progressPath,([IO.FileMode]::Open),([IO.FileAccess]::Read),([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete)
      $progressReader = New-Object IO.StreamReader $progressStream,([Text.Encoding]::UTF8)
      try { $progressText = $progressReader.ReadToEnd() } finally { $progressReader.Dispose() }
      $progressLines = $progressText.TrimEnd() -split "`n"
      $packet = $progressLines[-1] | ConvertFrom-Json
      $ui.Progress.Value = [Math]::Max($ui.Progress.Value, [double]$packet.percent)
      $ui.Percent.Text = ([int]$ui.Progress.Value).ToString() + '%'
      $ui.Stage.Text = $packet.stage
      $ui.Message.Text = $packet.message
      if ($packet.version) { $ui.Version.Text = 'v' + $packet.version }
      if ($packet.url) { $state.url=$packet.url }
      if ($packet.status -eq 'error') { $state.failed=$true; $ui.Progress.Foreground=[Windows.Media.Brushes]::IndianRed; $ui.OpenLog.Visibility='Visible'; $ui.Hint.Text='안내 보기에서 실행 기록을 확인할 수 있습니다.' }
      if ($packet.status -eq 'existing') { $state.closing=$true; if ($state.process.HasExited) { $timer.Stop(); $window.Close() }; return }
      if ($packet.status -eq 'ready' -and -not $state.ready) {
        $state.ready=$true; $state.hideAt=[DateTime]::UtcNow.AddMilliseconds(900); $tray.Visible=$true
        $ui.Exit.Content='프로그램 종료'
        $ui.Hint.Text='알림 영역 아이콘에서 프로그램을 열거나 종료할 수 있습니다.'
        if ($packet.bootstrapPath) { $state.infoPath=$packet.bootstrapPath; $ui.OpenLog.Content='최초 로그인 안내'; $ui.OpenLog.Visibility='Visible'; $state.hideAt=$null }
      }
    }
  } catch { } # A partial final JSONL record is retried on the next timer tick.
  if ($state.process -and $state.process.HasExited) {
    if ($state.closing) { $timer.Stop(); $window.Close(); return }
    if (-not $state.failed) { $state.failed=$true; $state.hideAt=$null; $tray.Visible=$false; $ui.Stage.Text='실행이 종료되었습니다'; $ui.Message.Text='안내 보기에서 실행 기록을 확인한 뒤 다시 실행해 주세요.'; $ui.OpenLog.Visibility='Visible'; $window.Show() }
  }
  if ($state.ready -and -not $KeepWindow -and $state.hideAt -and [DateTime]::UtcNow -ge $state.hideAt) { $state.hideAt=$null; $window.Hide() }
})
$window.Add_ContentRendered({
  if ($state.process -or $state.failed) { return }
  try {
    $nodePath = Join-Path $installRoot 'runtime\node.exe'
    $launcherPath = Join-Path $PSScriptRoot 'start-installed.mjs'
    $launchArgs = @(('"{0}"' -f $launcherPath),'--progress-file',('"{0}"' -f $progressPath),'--control-file',('"{0}"' -f $controlPath))
    if ($NoBrowser) { $launchArgs += '--no-browser' }
    $state.process = Start-Process -FilePath $nodePath -ArgumentList $launchArgs -WorkingDirectory $installRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
  } catch { $state.failed=$true; $ui.Stage.Text='실행할 수 없습니다'; $ui.Message.Text='설치 파일 또는 실행 권한을 확인해 주세요. ' + $_.Exception.Message; $ui.OpenLog.Visibility='Visible' }
})
$window.Show()
$timer.Start()
[Windows.Threading.Dispatcher]::Run()
