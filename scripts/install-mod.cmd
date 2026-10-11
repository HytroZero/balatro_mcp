@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-mod.ps1" %*
set "install_result=%errorlevel%"
echo.
if not "%install_result%"=="0" echo Installation failed. See the error above.
pause
exit /b %install_result%
