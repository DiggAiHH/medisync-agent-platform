#!/usr/bin/env pwsh
# MediSync Unified Service Starter
# Startet alle Services mit einem Befehl

param(
    [switch]$Memory,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

# Konfiguration
$root = "d:\Klaproth Projekte\Stupi\agents-platform"
$services = @{
    API = @{
        Path = "$root\backend"
        Command = "node dist/server.js"
        Port = 3000
        Env = @{ USE_MEMORY_QUEUE = if ($Memory) { "true" } else { "false" } }
    }
    Worker = @{
        Path = "$root\backend"
        Command = "node dist/worker/index.js"
        Port = $null
        Env = @{ USE_MEMORY_QUEUE = if ($Memory) { "true" } else { "false" } }
    }
    Dashboard = @{
        Path = "$root\dashboard"
        Command = "npx vite preview --port 4173"
        Port = 4173
        Env = @{ }
    }
}

function Start-ServiceProcess {
    param($Name, $Config)
    
    Write-Host "🚀 Starting $Name..." -ForegroundColor Cyan
    
    Push-Location $Config.Path
    
    # Environment setzen
    foreach ($key in $Config.Env.Keys) {
        [Environment]::SetEnvironmentVariable($key, $Config.Env[$key], "Process")
    }
    
    try {
        $process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c $(${Config.Command})" -WindowStyle Hidden -PassThru
        
        # Warte auf Port
        if ($Config.Port) {
            $maxWait = 10
            $waited = 0
            $ready = $false
            
            while ($waited -lt $maxWait -and -not $ready) {
                Start-Sleep 1
                $waited++
                try {
                    $conn = Test-NetConnection -ComputerName localhost -Port $Config.Port -WarningAction SilentlyContinue
                    if ($conn.TcpTestSucceeded) {
                        $ready = $true
                    }
                } catch {}
            }
            
            if ($ready) {
                Write-Host "   ✅ $Name ready (Port $($Config.Port))" -ForegroundColor Green
                return @{ Status = "OK"; PID = $process.Id }
            } else {
                Write-Host "   ⚠️ $Name start timeout" -ForegroundColor Yellow
                return @{ Status = "TIMEOUT"; PID = $process.Id }
            }
        } else {
            Start-Sleep 2
            Write-Host "   ✅ $Name started (PID: $($process.Id))" -ForegroundColor Green
            return @{ Status = "OK"; PID = $process.Id }
        }
    }
    catch {
        Write-Host "   ❌ $Name failed: $_" -ForegroundColor Red
        return @{ Status = "FAIL"; Error = $_ }
    }
    finally {
        Pop-Location
    }
}

# Header
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "║    MediSync Service Starter         ║" -ForegroundColor Blue
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Blue

if ($Memory) {
    Write-Host "Mode: In-Memory Queue (no Redis required)" -ForegroundColor Yellow
}

# Services starten
$results = @{}
foreach ($svc in $services.GetEnumerator()) {
    $results[$svc.Key] = Start-ServiceProcess -Name $svc.Key -Config $svc.Value
}

# Summary
Write-Host "`n╔══════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "║           Summary                    ║" -ForegroundColor Blue
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Blue

$success = ($results.Values | Where-Object { $_.Status -eq "OK" }).Count
$total = $results.Count

foreach ($r in $results.GetEnumerator()) {
    $status = $r.Value.Status
    $color = switch ($status) {
        "OK" { "Green" }
        "TIMEOUT" { "Yellow" }
        default { "Red" }
    }
    Write-Host "$($r.Key): $status" -ForegroundColor $color
}

Write-Host "`nTotal: $success/$total services ready" -ForegroundColor $(if ($success -eq $total) { "Green" } else { "Yellow" })

if ($success -eq $total) {
    Write-Host "`n🎉 All services started successfully!" -ForegroundColor Green
    Write-Host "   API:       http://localhost:3000" -ForegroundColor Gray
    Write-Host "   Dashboard: http://localhost:4173" -ForegroundColor Gray
}

exit $(if ($success -eq $total) { 0 } else { 1 })
