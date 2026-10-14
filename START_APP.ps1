Set-Location $PSScriptRoot
Write-Host "Generating random Amazon test orders and ICCIDs..."
node scripts/seed-test-data.js
Write-Host ""
if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
  Write-Host "App is already running on port 3000."
  Write-Host "Opening test data page..."
  Start-Process "http://localhost:3000/test-data.html"
  exit 0
}
Write-Host "Starting local eSIM activation app..."
Write-Host "Customer app: http://localhost:3000"
Write-Host "Test data:    http://localhost:3000/test-data.html"
Write-Host "Admin:        http://localhost:3000/admin.html"
Start-Job -ScriptBlock {
  Start-Sleep -Seconds 2
  Start-Process "http://localhost:3000/test-data.html"
} | Out-Null
node server.js
