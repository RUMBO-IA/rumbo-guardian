$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$brave = 'C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe'
if (-not (Test-Path $brave)) { throw 'Brave executable not found' }
$probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$probe.Start()
$port = $probe.LocalEndpoint.Port
$probe.Stop()
$profile = Join-Path $env:TEMP "rumbo-guardian-integration-$port"
if (Test-Path $profile) { Remove-Item -Recurse -Force $profile }
$args = @(
  "--remote-debugging-port=$port",
  "--user-data-dir=$profile",
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank'
)
$browser = Start-Process -FilePath $brave -ArgumentList $args -PassThru
try {
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
finally {  Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'brave.exe' -and $_.CommandLine -like "*$profile*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 300
  if (Test-Path $profile) { Remove-Item -Recurse -Force $profile -ErrorAction SilentlyContinue }
}