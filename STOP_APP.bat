@echo off
cd /d "%~dp0"
echo Stopping Stayconnected local app on port 3000...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$connections = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue; if (-not $connections) { Write-Host 'No app is running on port 3000.'; exit 0 }; $connections | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force; Write-Host ('Stopped process ' + $_) }"
echo.
echo Done. You can close this window.
pause
