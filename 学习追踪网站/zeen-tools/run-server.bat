@echo off
chcp 65001 >nul
set "LOCAL_PREVIEW_PORT=8091"
cd /d "%~dp0.."
echo Study tracker server running. Close this window to stop.
echo.
node local-preview-server.js
pause
