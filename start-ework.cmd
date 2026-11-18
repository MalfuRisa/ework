@echo off
setlocal
title EWork - Windows Local
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1" %*
set "launch_result=%errorlevel%"
if not "%launch_result%"=="0" (
  echo.
  echo Startup failed. Read the message above.
  pause
)
exit /b %launch_result%
