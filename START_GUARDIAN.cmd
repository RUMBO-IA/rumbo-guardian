@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js no esta disponible en este equipo.
  pause
  exit /b 1
)
start "RUMBO Guardian Server" /min node server.js
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:8766/"
endlocal