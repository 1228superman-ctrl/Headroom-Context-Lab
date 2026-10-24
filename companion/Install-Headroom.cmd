@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Headroom.ps1" %*
set RESULT=%ERRORLEVEL%
echo.
if not "%RESULT%"=="0" echo Installation failed with exit code %RESULT%.
if /I not "%HEADROOM_NONINTERACTIVE%"=="1" pause
exit /b %RESULT%
