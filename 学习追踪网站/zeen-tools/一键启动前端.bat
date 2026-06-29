@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
mode con: cols=120 lines=30 >nul 2>nul

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "PROJECT_ROOT=%%~fI"
cd /d "%PROJECT_ROOT%"

echo ==========================================
echo   Study Tracker - Starting...
echo ==========================================

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js first.
  pause
  exit /b 1
)

set "LOCAL_PREVIEW_PORT=8091"
set "SERVER_SCRIPT=%PROJECT_ROOT%\local-preview-server.js"
set "HOME_URL=http://127.0.0.1:%LOCAL_PREVIEW_PORT%/"
set "CHECK_URL=http://127.0.0.1:%LOCAL_PREVIEW_PORT%/api/progress"

if not exist "%SERVER_SCRIPT%" (
  echo [ERROR] Server script not found: %SERVER_SCRIPT%
  pause
  exit /b 1
)

echo [1/2] Starting preview server on port %LOCAL_PREVIEW_PORT% ...
start "Study Tracker Server" "%SCRIPT_DIR%run-server.bat"

echo [2/2] Waiting for server health check before opening browser...
call :wait_ready
if errorlevel 1 exit /b 1

cmd /c start "" "%HOME_URL%"
echo.
echo Done! Browser opened.
echo Closing this window will NOT stop the server.
echo To stop: close the "Study Tracker Server" window, or run the stop bat.
echo.
pause
exit /b 0

:wait_ready
setlocal
set "READY=0"
for /l %%i in (1,1,25) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%CHECK_URL%' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 (
    set "READY=1"
    goto :done
  )
  timeout /t 1 /nobreak >nul
)
:done
if "!READY!"=="1" (
  echo [OK] Server is ready.
  endlocal
  exit /b 0
)
endlocal
echo [ERROR] Server did not start in time. Check the server window for errors.
pause
exit /b 1
