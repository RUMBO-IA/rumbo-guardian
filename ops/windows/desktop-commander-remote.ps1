param(
  [string]$PackageVersion = '0.2.48',
  [switch]$RecoverExisting
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$stateDir = Join-Path $env:LOCALAPPDATA 'RUMBO\DesktopCommander'
$logDir = Join-Path $stateDir 'logs'
$stateFile = Join-Path $stateDir 'state.json'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logFile = Join-Path $logDir "remote-$stamp.log"

function Write-State {
  param([string]$Status, [hashtable]$Extra = @{})
  $payload = [ordered]@{
    schema = 'rumbo.desktop_commander.remote_state.v1'
    observed_at = (Get-Date).ToUniversalTime().ToString('o')
    status = $Status
    package_version = $PackageVersion
    host_name = $env:COMPUTERNAME
    log_file = $logFile
  }
  foreach ($key in $Extra.Keys) { $payload[$key] = $Extra[$key] }
  $payload | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $stateFile -Encoding UTF8
}

function Get-RemoteAgentProcesses {
  try {
    @(Get-CimInstance Win32_Process | Where-Object {
      $_.ProcessId -ne $PID -and
      $_.Name -in @('node.exe','cmd.exe') -and
      $_.CommandLine -and
      $_.CommandLine -match 'desktop-commander' -and
      $_.CommandLine -match '(^|\s)remote(\s|$)'
    })
  } catch {
    Write-Warning "Could not inspect existing remote-agent processes: $($_.Exception.Message)"
    @()
  }
}

$node = Get-Command node.exe -ErrorAction SilentlyContinue
$npx = Get-Command npx.cmd -ErrorAction SilentlyContinue
if (-not $node -or -not $npx) {
  Write-State 'dependency_missing' @{ node = [bool]$node; npx = [bool]$npx }
  throw 'Node.js and npx are required.'
}

$existing = Get-RemoteAgentProcesses
if ($existing.Count -gt 0) {
  if (-not $RecoverExisting) {
    Write-State 'already_running' @{ pids = @($existing.ProcessId) }
    Write-Host "Desktop Commander remote agent already appears to be running: $($existing.ProcessId -join ', ')"
    exit 0
  }

  foreach ($proc in $existing) {
    Write-Host "Stopping matched Desktop Commander remote process tree PID $($proc.ProcessId)..."
    & taskkill.exe /PID $proc.ProcessId /T /F | Out-Null
  }
  Start-Sleep -Seconds 2
}

$remaining = Get-RemoteAgentProcesses
if ($remaining.Count -gt 0) {
  Write-State 'recovery_failed_existing_process' @{ pids = @($remaining.ProcessId) }
  throw "Matched Desktop Commander remote process still running: $($remaining.ProcessId -join ', ')"
}

Write-State 'starting'
Write-Host "Starting @wonderwhy-er/desktop-commander@$PackageVersion remote"
Write-Host "Log: $logFile"

& $npx.Source --yes "@wonderwhy-er/desktop-commander@$PackageVersion" remote 2>&1 |
  Tee-Object -FilePath $logFile -Append
$exitCode = $LASTEXITCODE

Write-State 'exited' @{ exit_code = $exitCode }
exit $exitCode
