#requires -Version 5.1
<#
.SYNOPSIS
    Startet alle MediSync Services lokal ohne Docker/Redis

.DESCRIPTION
    Startet Backend API, Worker und Dashboard für lokale Entwicklung.
    Verwendet In-Memory Queue statt Redis.

.EXAMPLE
    .\scripts\start-local.ps1

.NOTES
    - Stellt sicher, dass node und npm installiert sind
    - Baut das Backend automatisch, falls nötig
    - Ports: API=3000, WebSocket=8080, Dashboard=4173
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootPath = Split-Path -Parent $ScriptPath

# Farben für Konsolenausgabe
$Green = "Green"
$Yellow = "Yellow"
$Blue = "Cyan"
$Red = "Red"

function Write-Status {
    param([string]$Message, [string]$Status = "INFO")
    $color = switch ($Status) {
        "SUCCESS" { $Green }
        "WARN" { $Yellow }
        "ERROR" { $Red }
        default { $Blue }
    }
    Write-Host "[$Status] $Message" -ForegroundColor $color
}

function Test-Command {
    param([string]$Command)
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Test-Port {
    param([int]$Port)
    try {
        $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
        $listener.Start()
        $listener.Stop()
        return $false
    } catch {
        return $true
    }
}

# ============================================
# Vorab-Checks
# ============================================
Write-Host "`n╔══════════════════════════════════════════════════════════╗" -ForegroundColor $Blue
Write-Host "║          MediSync - Lokaler Start (No Docker)            ║" -ForegroundColor $Blue
Write-Host "╚══════════════════════════════════════════════════════════╝`n" -ForegroundColor $Blue

# Node.js prüfen
if (-not (Test-Command "node")) {
    Write-Status "Node.js ist nicht installiert. Bitte installieren Sie Node.js 18+" "ERROR"
    exit 1
}

$nodeVersion = node --version
Write-Status "Node.js gefunden: $nodeVersion" "SUCCESS"

# Ports prüfen
$ports = @(3000, 8080, 4173)
foreach ($port in $ports) {
    if (Test-Port $port) {
        Write-Status "Port $port ist bereits belegt!" "WARN"
    } else {
        Write-Status "Port $port ist verfügbar" "SUCCESS"
    }
}

# Environment setzen
Write-Status "Konfiguriere In-Memory Queue..." "INFO"
$env:USE_MEMORY_QUEUE = "true"
$env:NODE_ENV = "development"
$env:PORT = "3000"
$env:WS_PORT = "8080"

# ============================================
# Backend bauen (falls nötig)
# ============================================
Write-Host "`n--- Backend ---" -ForegroundColor $Yellow
Set-Location $RootPath\backend

# Prüfe ob dist existiert und aktuell ist
$needsBuild = $false
if (-not (Test-Path "dist\server.js")) {
    $needsBuild = $true
    Write-Status "dist/server.js nicht gefunden - Build erforderlich" "WARN"
} elseif ((Get-Item "src\server.ts").LastWriteTime -gt (Get-Item "dist\server.js").LastWriteTime) {
    $needsBuild = $true
    Write-Status "Quellcode wurde geändert - Build erforderlich" "WARN"
}

if ($needsBuild) {
    Write-Status "Baue Backend..." "INFO"
    try {
        npm run build 2>&1 | Out-String | ForEach-Object { Write-Host $_ }
        Write-Status "Build erfolgreich" "SUCCESS"
    } catch {
        Write-Status "Build fehlgeschlagen: $_" "ERROR"
        exit 1
    }
} else {
    Write-Status "Backend ist bereits gebaut" "SUCCESS"
}

# ============================================
# Services starten
# ============================================
Write-Host "`n--- Starte Services ---" -ForegroundColor $Yellow

# 1. Backend API
Write-Status "Starte Backend API auf Port 3000..." "INFO"
$apiProcess = Start-Process -FilePath "node" -ArgumentList "dist/server.js" `
    -WorkingDirectory "$RootPath\backend" `
    -WindowStyle Normal `
    -PassThru
Write-Status "Backend API gestartet (PID: $($apiProcess.Id))" "SUCCESS"

# Kurze Pause für API-Start
Start-Sleep -Seconds 2

# 2. Worker
Write-Status "Starte Worker..." "INFO"
$workerProcess = Start-Process -FilePath "node" -ArgumentList "dist/worker/index.js" `
    -WorkingDirectory "$RootPath\backend" `
    -WindowStyle Normal `
    -PassThru
Write-Status "Worker gestartet (PID: $($workerProcess.Id))" "SUCCESS"

# 3. Dashboard
Write-Host "`n--- Dashboard ---" -ForegroundColor $Yellow
Set-Location $RootPath\dashboard

# Prüfe ob Dashboard gebaut ist
if (-not (Test-Path "dist")) {
    Write-Status "Dashboard muss erst gebaut werden..." "WARN"
    Write-Status "Baue Dashboard..." "INFO"
    try {
        npm run build 2>&1 | Out-String | ForEach-Object { Write-Host $_ }
        Write-Status "Dashboard Build erfolgreich" "SUCCESS"
    } catch {
        Write-Status "Dashboard Build fehlgeschlagen: $_" "ERROR"
        exit 1
    }
} else {
    Write-Status "Dashboard ist bereits gebaut" "SUCCESS"
}

Write-Status "Starte Dashboard Preview auf Port 4173..." "INFO"
$dashboardProcess = Start-Process -FilePath "npm" -ArgumentList "run", "preview" `
    -WorkingDirectory "$RootPath\dashboard" `
    -WindowStyle Normal `
    -PassThru
Write-Status "Dashboard gestartet (PID: $($dashboardProcess.Id))" "SUCCESS"

# ============================================
# Abschluss
# ============================================
Start-Sleep -Seconds 2

Write-Host "`n╔══════════════════════════════════════════════════════════╗" -ForegroundColor $Green
Write-Host "║              Alle Services gestartet!                    ║" -ForegroundColor $Green
Write-Host "╠══════════════════════════════════════════════════════════╣" -ForegroundColor $Green
Write-Host "║                                                          ║" -ForegroundColor $Green
Write-Host "║  🚀 API Server:    http://localhost:3000                 ║" -ForegroundColor $Green
Write-Host "║  📊 Health Check:  http://localhost:3000/health          ║" -ForegroundColor $Green
Write-Host "║  🔌 WebSocket:     ws://localhost:8080                   ║" -ForegroundColor $Green
Write-Host "║  📈 Dashboard:     http://localhost:4173                 ║" -ForegroundColor $Green
Write-Host "║                                                          ║" -ForegroundColor $Green
Write-Host "╠══════════════════════════════════════════════════════════╣" -ForegroundColor $Green
Write-Host "║  Konfiguration:                                          ║" -ForegroundColor $Green
Write-Host "║  • In-Memory Queue: Aktiviert (kein Redis)               ║" -ForegroundColor $Green
Write-Host "║  • Discord Bot:     Nicht gestartet                      ║" -ForegroundColor $Green
Write-Host "║                                                          ║" -ForegroundColor $Green
Write-Host "╠══════════════════════════════════════════════════════════╣" -ForegroundColor $Green
Write-Host "║  Prozesse:                                               ║" -ForegroundColor $Green
Write-Host "║  • API:    PID $($apiProcess.Id.ToString().PadRight(38))  ║" -ForegroundColor $Green
Write-Host "║  • Worker: PID $($workerProcess.Id.ToString().PadRight(38))  ║" -ForegroundColor $Green
Write-Host "║  • Dashboard: PID $($dashboardProcess.Id.ToString().PadRight(35))  ║" -ForegroundColor $Green
Write-Host "║                                                          ║" -ForegroundColor $Green
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor $Green

Write-Host "`nDrücken Sie [Strg+C] um alle Prozesse zu beenden..." -ForegroundColor $Yellow
Write-Host "Oder führen Sie aus: .\scripts\stop-local.ps1" -ForegroundColor $Yellow

# Speichere PIDs für späteres Stoppen
$pidInfo = @{
    api = $apiProcess.Id
    worker = $workerProcess.Id
    dashboard = $dashboardProcess.Id
    timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
} | ConvertTo-Json

$pidInfo | Out-File -FilePath "$RootPath\.local-pids.json" -Encoding UTF8

# Warte auf Benutzerabbruch
try {
    while ($true) {
        Start-Sleep -Seconds 5
        
        # Prüfe ob Prozesse noch laufen
        $apiRunning = Get-Process -Id $apiProcess.Id -ErrorAction SilentlyContinue
        $workerRunning = Get-Process -Id $workerProcess.Id -ErrorAction SilentlyContinue
        $dashboardRunning = Get-Process -Id $dashboardProcess.Id -ErrorAction SilentlyContinue
        
        if (-not $apiRunning) { Write-Status "API Prozess wurde beendet" "WARN" }
        if (-not $workerRunning) { Write-Status "Worker Prozess wurde beendet" "WARN" }
        if (-not $dashboardRunning) { Write-Status "Dashboard Prozess wurde beendet" "WARN" }
        
        if (-not ($apiRunning -or $workerRunning -or $dashboardRunning)) {
            Write-Status "Alle Prozesse wurden beendet" "WARN"
            break
        }
    }
} finally {
    # Cleanup
    if (Test-Path "$RootPath\.local-pids.json") {
        Remove-Item "$RootPath\.local-pids.json" -Force
    }
    Write-Status "Aufgeräumt" "SUCCESS"
}
