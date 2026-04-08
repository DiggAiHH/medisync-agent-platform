#!/usr/bin/env pwsh
# MediSync Service Stopper

Write-Host "🛑 Stopping all MediSync services..." -ForegroundColor Yellow

$processes = Get-Process node -ErrorAction SilentlyContinue
if ($processes) {
    $count = $processes.Count
    $processes | Stop-Process -Force
    Write-Host "   ✅ Stopped $count Node processes" -ForegroundColor Green
} else {
    Write-Host "   ℹ️ No Node processes found" -ForegroundColor Gray
}

# Dashboard (npm/vite) auch prüfen
$npm = Get-Process npm -ErrorAction SilentlyContinue
if ($npm) {
    $npm | Stop-Process -Force
    Write-Host "   ✅ Stopped npm processes" -ForegroundColor Green
}

Write-Host "`n👋 All services stopped" -ForegroundColor Green
