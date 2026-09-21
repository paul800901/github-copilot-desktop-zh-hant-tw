@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto no_node

node localization_engine.js
if errorlevel 1 goto failed

exit /b 0

:no_node
echo ERROR: Node.js 22 or newer is required.
pause
exit /b 1

:failed
echo.
echo Startup failed. See the error above.
pause
exit /b 1
