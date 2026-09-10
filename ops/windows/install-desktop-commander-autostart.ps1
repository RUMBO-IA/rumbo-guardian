param(
  [string]$TaskName = 'RUMBO Desktop Commander Remote'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$source = Join-Path $PSScriptRoot 'desktop-commander-remote.ps1'
if (-not (Test-Path -LiteralPath $source)) {
  throw "Supervisor script not found: $source"
}

$installDir = Join-Path $env:LOCALAPPDATA 'RUMBO\DesktopCommander'
$installedScript = Join-Path $installDir 'desktop-commander-remote.ps1'
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Copy-Item -LiteralPath $source -Destination $installedScript -Force

$userId = if ($env:USERDOMAIN) {
  "$env:USERDOMAIN\$env:USERNAME"
} else {
  $env:USERNAME
}

$quotedScript = '"' + $installedScript + '"'
$action = New-ScheduledTaskAction \
  -Execute 'powershell.exe' \
  -Argument "-NoProfile -ExecutionPolicy Bypass -File $quotedScript"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal \
  -UserId $userId \
  -LogonType Interactive \
  -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet \
  -StartWhenAvailable \
  -RestartCount 5 \
  -RestartInterval (New-TimeSpan -Minutes 1) \
  -ExecutionTimeLimit ([TimeSpan]::Zero) \
  -MultipleInstances IgnoreNew

Register-ScheduledTask \
  -TaskName $TaskName \
  -Action $action \
  -Trigger $trigger \
  -Principal $principal \
  -Settings $settings \
  -Force | Out-Null

$task = Get-ScheduledTask -TaskName $TaskName
[pscustomobject]@{
  TaskName = $task.TaskName
  State = [string]$task.State
  Script = $installedScript
  User = $userId
  RunLevel = 'Limited'
} | ConvertTo-Json -Compress
