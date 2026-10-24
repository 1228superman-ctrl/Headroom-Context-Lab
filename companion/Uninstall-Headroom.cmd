@echo off
setlocal
echo This removes the Headroom summary helper and its local encrypted credentials.
echo It does NOT uninstall the Chrome extension.
choice /C YN /M "Continue"
if errorlevel 2 exit /b 0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Uninstall-Headroom.ps1"
set RESULT=%ERRORLEVEL%
echo.
pause
exit /b %RESULT%
