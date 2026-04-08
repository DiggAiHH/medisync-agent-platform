#!/usr/bin/env pwsh
# MediSync Service Health Checker

Write-Host "🔍 Checking MediSync services..." -ForegroundColor Cyan

$services = @(
    @{ Name = "API"; Port = 3000; Endpoint = "/health" },
    @{ Name = "Dashboard"; Port = 4173; Endpoint = $null }
)

$healthy = 0

foreach ($svc in $services) {
    Write-Host "`n$($svc.Name):" -ForegroundColor White
    
    # Port Check
    $portTest = Test-NetConnection -ComputerName localhost -Port $svc.Port -WarningAction SilentlyContinue
    if ($portTest.TcpTestSucceeded) {
        Write-Host "   ✅ Port $($svc.Port) open" -ForegroundColor Green
        
        # Health Check (wenn Endpoint vorhanden)
        if ($svc.Endpoint) {
            try {
                $response = Invoke-RestMethod -Uri "http://localhost:$($svc.Port)$($svc.Endpoint)" -TimeoutSec 5
                Write-Host "   ✅ Health: $($response.status)" -ForegroundColor Green
                Write-Host "   📊 Uptime: $($response.uptime)s" -ForegroundColor Gray
                $healthy++
            } catch {
                Write-Host "   ⚠️ Health check failed" -ForegroundColor Yellow
            }
        } else {
            $healthy++
        }
    } else {
        Write-Host "   ❌ Port $($svc.Port) closed" -ForegroundColor Red
    }
}

Write-Host "`n╔══════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "║  Result: $healthy/$($services.Count) services healthy ║" -ForegroundColor $(if ($healthy -eq $services.Count) { "Green" } else { "Yellow" })
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Blue
