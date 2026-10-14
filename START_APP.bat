@echo off
cd /d "%~dp0"
echo Generating random Amazon test orders and ICCIDs...
node scripts\seed-test-data.js
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { exit 10 }"
if %errorlevel%==10 (
  echo App is already running on port 3000.
  echo Opening test data page...
  start "" "http://localhost:3000/test-data.html"
  goto :eof
)
echo Starting local eSIM activation app...
echo Customer app: http://localhost:3000
echo Test data:    http://localhost:3000/test-data.html
echo Admin:        http://localhost:3000/admin.html
start "" powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3000/test-data.html'"
node server.js
