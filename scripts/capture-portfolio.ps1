$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'portfolio\dashboard-v031.png'
$browser = @(
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
  'C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { throw 'Chrome o Brave no encontrado' }
New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
$startedServer = $null
try {
  try { Invoke-WebRequest 'http://127.0.0.1:8766/' -UseBasicParsing -TimeoutSec 2 | Out-Null }
  catch {
    $startedServer = Start-Process node -ArgumentList 'server.js' -WorkingDirectory $root -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 1
    Invoke-WebRequest 'http://127.0.0.1:8766/' -UseBasicParsing -TimeoutSec 5 | Out-Null
  }
  $sample = 'URGENTE: verificá tu cuenta ahora en http://203.0.113.10:8080/login/verify. Ingresá tu contraseña y código de acceso para evitar el bloqueo. Pago pendiente.'
  $url = 'http://127.0.0.1:8766/?scan=' + [Uri]::EscapeDataString($sample)
  $profile = Join-Path $env:TEMP 'rumbo-guardian-portfolio-v031'
  Remove-Item $profile -Recurse -Force -ErrorAction SilentlyContinue
  $args = @('--headless=new','--disable-gpu','--disable-background-mode','--no-first-run','--hide-scrollbars','--window-size=1440,1100','--virtual-time-budget=1500',"--user-data-dir=$profile","--screenshot=$out",$url)
  $p = Start-Process $browser -ArgumentList $args -PassThru
  if (-not $p.WaitForExit(20000)) { Stop-Process -Id $p.Id -Force; throw 'Timeout capturando dashboard' }
  if ($p.ExitCode -ne 0 -or -not (Test-Path $out)) { throw 'Falló la captura de dashboard' }
} finally {
  if ($startedServer -and -not $startedServer.HasExited) { Stop-Process -Id $startedServer.Id -Force }
  if ($profile) { Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*$profile*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Remove-Item $profile -Recurse -Force -ErrorAction SilentlyContinue }
}
Write-Output "SCREENSHOT=$out"
Write-Output "SHA256=$((Get-FileHash $out -Algorithm SHA256).Hash)"