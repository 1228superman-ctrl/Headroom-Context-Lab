@echo off
setlocal
cd /d "%~dp0"
echo.
echo Publishing Headroom Context Lab from the sanitized release repository.
echo GitHub target: https://github.com/1228superman-ctrl/Headroom-Context-Lab
echo.
git status --short
git push -u origin main
set RESULT=%ERRORLEVEL%
echo.
if "%RESULT%"=="0" (
  echo SUCCESS - Main branch pushed. Check GitHub Actions and README.
) else (
  echo Push failed. First create the empty public repository from PUBLISH-GITHUB.md.
  echo Existing repository and local commits have not been deleted.
)
echo.
pause
exit /b %RESULT%
