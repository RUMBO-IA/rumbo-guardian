$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$brave = 'C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe'
if (-not (Test-Path $brave)) { throw 'Brave executable not found' }
$serverStarted = $false
$server = $null
try {
  try {
    $probePage = Invoke-WebRequest 'http://127.0.0.1:8766/' -UseBasicParsing -TimeoutSec 1
    if ($probePage.Content -notmatch 'RUMBO Guardian') { throw 'port 8766 is occupied by another service' }
  } catch {
    if ($_.Exception.Message -like '*occupied by another service*') { throw }
    $server = Start-Process -FilePath 'node' -ArgumentList (Join-Path $project 'server.js') -WorkingDirectory $project -PassThru -WindowStyle Hidden
    $serverStarted = $true
    $ready = $false
    for ($i=0; $i -lt 20 -and -not $ready; $i++) {
      Start-Sleep -Milliseconds 150
      try { $r=Invoke-WebRequest 'http://127.0.0.1:8766/' -UseBasicParsing -TimeoutSec 1; $ready=$r.Content -match 'RUMBO Guardian' } catch {}
    }
    if (-not $ready) { throw 'RUMBO Guardian local test server did not become ready' }
  }
  $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $probe.Start(); $port = $probe.LocalEndpoint.Port; $probe.Stop()
  $profile = Join-Path $env:TEMP "rumbo-guardian-integration-$port"
  if (Test-Path $profile) { Remove-Item -Recurse -Force $profile }
  $args = @("--remote-debugging-port=$port","--user-data-dir=$profile",'--no-first-run','--no-default-browser-check','about:blank')
  $browser = Start-Process -FilePath $brave -ArgumentList $args -PassThru
  Start-Sleep -Seconds 2
  $base = "http://127.0.0.1:$port"
  $version = Invoke-RestMethod "$base/json/version" -TimeoutSec 5
  Write-Output "BRAVE_TEST_READY $($version.Browser) port=$port"
  $previous = $env:GUARDIAN_CDP_URL
  $env:GUARDIAN_CDP_URL = $base
  Push-Location $project
  try { node .\tests\extension-integration.js }
  finally { Pop-Location; $env:GUARDIAN_CDP_URL = $previous }
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
  if ($profile) {
    Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'brave.exe' -and $_.CommandLine -like "*$profile*" } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 300
    if (Test-Path $profile) { Remove-Item -Recurse -Force $profile -ErrorAction SilentlyContinue }
  }
  if ($serverStarted -and $server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  }
}