@echo off
setlocal
chcp 65001 >nul

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "PROJECT_ROOT=%%~fI"

echo ==========================================
echo   Study Tracker - Stopping...
echo ==========================================

powershell -NoProfile -ExecutionPolicy Bypass -Command "$root = (Resolve-Path '%PROJECT_ROOT%').Path; $targets = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.Contains('local-preview-server.js') -and $_.CommandLine.Contains($root) }; if ($targets) { $count = @($targets).Count; $targets | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Write-Host ('[OK] Closed ' + $count + ' process(es).') } else { Write-Host '[INFO] No running server found.' }"

set "LOCAL_PREVIEW_PORT=8091"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$conn = Get-NetTCPConnection -LocalPort %LOCAL_PREVIEW_PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if (-not $conn) { Write-Host '[OK] Port %LOCAL_PREVIEW_PORT% released.'; exit 0 }; $proc = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $conn.OwningProcess) -ErrorAction SilentlyContinue; if ($proc -and $proc.Name -eq 'node.exe' -and $proc.CommandLine -and $proc.CommandLine.Contains('local-preview-server.js')) { Stop-Process -Id $conn.OwningProcess -Force; Write-Host '[OK] Killed process on port %LOCAL_PREVIEW_PORT%'; exit 0 }; Write-Host ('[WARN] Port still in use, PID=' + $conn.OwningProcess); exit 1"

echo.
pause
endlocal
