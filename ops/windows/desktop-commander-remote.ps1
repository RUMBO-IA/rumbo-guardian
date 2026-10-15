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
    @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
      $_.ProcessId -ne $PID -and
      $_.Name -eq 'node.exe' -and
      $_.CommandLine -and
      $_.CommandLine -match 'desktop-commander' -and
      $_.CommandLine -match '(^|\s)remote(\s|$)'
    })
  } catch {
    Write-State 'process_enumeration_failed'
    throw "Refusing remote-agent startup: process enumeration failed: $($_.Exception.Message)"
  }
}

# -RecoverExisting must not terminate a PID based only on a stale WMI snapshot.
# Require a fresh, exact process identity read immediately before any termination.
function Assert-RemoteAgentIdentity {
  param([object]$Candidate)
  try {
    $current = @(Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $Candidate.ProcessId) -ErrorAction Stop)
  } catch {
    Write-State 'process_identity_recheck_failed'
    throw "Refusing process termination: identity recheck failed: $($_.Exception.Message)"
  }
  if ($current.Count -ne 1 -or
      $current[0].ProcessId -ne $Candidate.ProcessId -or
      $current[0].CreationDate -ne $Candidate.CreationDate -or
      $current[0].Name -ne $Candidate.Name -or
      $current[0].CommandLine -ne $Candidate.CommandLine) {
    Write-State 'process_identity_drift'
    throw 'Refusing process termination: target process identity changed'
  }
}

# The scheduled task's IgnoreNew setting does not cover separate manual launches.
# Keep this lock open for the whole npx remote process lifetime. Windows releases
# the exclusive file handle after any process crash; a leftover file is harmless.
# Scope: one current Windows user profile, shared by task and manual launcher.
$supervisorLockPath = Join-Path $stateDir 'remote-supervisor.lock'
$supervisorLock = $null
try {
  $supervisorLock = [System.IO.File]::Open(
    $supervisorLockPath,
    [System.IO.FileMode]::OpenOrCreate,
    [System.IO.FileAccess]::ReadWrite,
    [System.IO.FileShare]::None
  )
} catch [System.IO.IOException] {
  # ERROR_SHARING_VIOLATION is 32. Other I/O failures must not look like a live supervisor.
  if (($_.Exception.HResult -band 0xFFFF) -ne 32) { throw }
  # Do not overwrite the active supervisor's state.json on contention.
  Write-Host 'Another supervisor holds the Desktop Commander current-user lock; no launch attempted.'
  exit 0
} catch {
  Write-State 'supervisor_lock_error'
  throw
}

try {
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
      Assert-RemoteAgentIdentity -Candidate $proc
      Write-Host "Stopping matched Desktop Commander remote process tree PID $($proc.ProcessId)..."
      & taskkill.exe /PID $proc.ProcessId /T /F | Out-Null
      if ($LASTEXITCODE -ne 0) {
        Write-State 'process_termination_failed' @{ pid = $proc.ProcessId; exit_code = $LASTEXITCODE }
        throw "Refusing agent restart: taskkill failed for PID $($proc.ProcessId)"
      }
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
} finally {
  if ($null -ne $supervisorLock) {
    $supervisorLock.Dispose()
  }
}
