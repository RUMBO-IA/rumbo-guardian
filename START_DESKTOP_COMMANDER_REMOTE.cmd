@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ops\windows\desktop-commander-remote.ps1" -RecoverExisting
set EXITCODE=%ERRORLEVEL%
echo.
echo Desktop Commander remote exited with code %EXITCODE%.
exit /b %EXITCODE%
