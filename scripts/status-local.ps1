#requires -Version 5.1
<#
.SYNOPSIS
    Zeigt den Status aller lokalen MediSync Services an

.DESCRIPTION
    Prüft ob Ports belegt sind, zeigt laufende Node.js Prozesse
    und testet den API Health Endpoint.

.EXAMPLE
    .\scripts\status-local.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"
$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootPath = Split-Path -Parent $ScriptPath

# Farben
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

function Test-Port {
    param([int]$Port, [string]$Name)
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect("localhost", $Port)
        $client.Close()
        return $true
    } catch {
        return $false
    }
}

function Format-TableRow {
    param(
        [string]$Service,
        [string]$Status,
        [string]$Port = "",
        [string]$Url = ""
    )
    $statusColor = if ($Status -eq "✅ Läuft") { $Green } else { $Red }
    Write-Host "  $($Service.PadRight(12)) " -NoNewline
    Write-Host $Status -ForegroundColor $statusColor -NoNewline
    if ($Port) {
        Write-Host " (Port $Port)".PadRight(12) -NoNewline
    } else {
        Write-Host "" -NoNewline
    }
    if ($Url) {
        Write-Host " → $Url" -ForegroundColor $Blue
    } else {
        Write-Host ""
    }
}

# Header
Write-Host "`n╔══════════════════════════════════════════════════════════╗" -ForegroundColor $Blue
Write-Host "║          MediSync - Service Status                       ║" -ForegroundColor $Blue
Write-Host "╚══════════════════════════════════════════════════════════╝`n" -ForegroundColor $Blue

# ============================================
# 1. Port-Status
# ============================================
Write-Host "--- Port-Status ---" -ForegroundColor $Yellow

$services = @(
    @{ Name = "API"; Port = 3000; Url = "http://localhost:3000" },
    @{ Name = "WebSocket"; Port = 8080; Url = "ws://localhost:8080" },
    @{ Name = "Dashboard"; Port = 4173; Url = "http://localhost:4173" }
)

$allRunning = $true
foreach ($svc in $services) {
    $isRunning = Test-Port -Port $svc.Port -Name $svc.Name
    $status = if ($isRunning) { "✅ Läuft" } else { "❌ Offline" }
    if (-not $isRunning) { $allRunning = $false }
    Format-TableRow -Service $svc.Name -Status $status -Port $svc.Port -Url $svc.Url
}

Write-Host ""

# ============================================
# 2. Node.js Prozesse
# ============================================
Write-Host "--- Laufende Node.js Prozesse ---" -ForegroundColor $Yellow

try {
    $nodeProcesses = Get-Process node -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, Path, WorkingSet
    
    if ($nodeProcesses) {
        Write-Status "Gefundene Node.js Prozesse:" "INFO"
        $nodeProcesses | Format-Table -AutoSize | Out-String | Write-Host
    } else {
        Write-Status "Keine Node.js Prozesse gefunden" "WARN"
    }
} catch {
    Write-Status "Konnte Prozesse nicht abrufen: $_" "ERROR"
}

# ============================================
# 3. API Health Check
# ============================================
Write-Host "--- API Health Check ---" -ForegroundColor $Yellow

$healthUrl = "http://localhost:3000/health"
try {
    $response = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 5 -ErrorAction Stop
    $content = $response.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
    
    Write-Status "Health Endpoint erreichbar" "SUCCESS"
    Write-Host "  Status Code: $($response.StatusCode)" -ForegroundColor $Blue
    
    if ($content) {
        Write-Host "  Response:" -ForegroundColor $Blue
        $content | ConvertTo-Json -Depth 2 | ForEach-Object { Write-Host "    $_" -ForegroundColor $Blue }
    }
} catch {
    Write-Status "Health Endpoint nicht erreichbar" "ERROR"
    Write-Host "  Fehler: $_" -ForegroundColor $Red
}

# ============================================
# 4. Queue-Status (falls API läuft)
# ============================================
Write-Host "`n--- Queue-Status ---" -ForegroundColor $Yellow

try {
    $queueUrl = "http://localhost:3000/jobs"
    $response = Invoke-WebRequest -Uri $queueUrl -TimeoutSec 5 -ErrorAction Stop
    $jobs = $response.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
    
    if ($jobs -and $jobs.jobs) {
        $total = $jobs.jobs.Count
        $pending = ($jobs.jobs | Where-Object { $_.status -eq 'pending' }).Count
        $processing = ($jobs.jobs | Where-Object { $_.status -eq 'processing' }).Count
        $completed = ($jobs.jobs | Where-Object { $_.status -eq 'completed' }).Count
        $failed = ($jobs.jobs | Where-Object { $_.status -eq 'failed' }).Count
        
        Write-Status "Jobs Übersicht:" "INFO"
        Write-Host "  Gesamt: $total | Pending: $pending | Processing: $processing | Completed: $completed | Failed: $failed" -ForegroundColor $Blue
    } else {
        Write-Status "Keine Jobs in der Queue" "INFO"
    }
} catch {
    Write-Status "Queue-Status nicht abrufbar" "WARN"
}

# ============================================
# 5. Speicherte Status-Dateien
# ============================================
Write-Host "`n--- Persistente Status ---" -ForegroundColor $Yellow

$pidFile = "$RootPath\.local-pids.json"
if (Test-Path $pidFile) {
    try {
        $pids = Get-Content $pidFile | ConvertFrom-Json
        Write-Status "Gespeicherte Prozesse vom $($pids.timestamp):" "INFO"
        Write-Host "  API: $($pids.api)" -ForegroundColor $Blue
        Write-Host "  Worker: $($pids.worker)" -ForegroundColor $Blue
        Write-Host "  Dashboard: $($pids.dashboard)" -ForegroundColor $Blue
        
        # Prüfe ob Prozesse noch laufen
        $runningCount = 0
        foreach ($proc in @($pids.api, $pids.worker, $pids.dashboard)) {
            if (Get-Process -Id $proc -ErrorAction SilentlyContinue) {
                $runningCount++
            }
        }
        Write-Host "  Laufen noch: $runningCount von 3" -ForegroundColor $(if ($runningCount -eq 3) { $Green } elseif ($runningCount -gt 0) { $Yellow } else { $Red })
    } catch {
        Write-Status "PID-Datei konnte nicht gelesen werden" "WARN"
    }
} else {
    Write-Status "Keine PID-Datei gefunden" "INFO"
}

# ============================================
# Zusammenfassung
# ============================================
Write-Host "`n╔══════════════════════════════════════════════════════════╗" -ForegroundColor $(if ($allRunning) { $Green } else { $Yellow })
Write-Host "║                    Zusammenfassung                       ║" -ForegroundColor $(if ($allRunning) { $Green } else { $Yellow })
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor $(if ($allRunning) { $Green } else { $Yellow })

if ($allRunning) {
    Write-Status "Alle Services laufen!" "SUCCESS"
    Write-Host "`nDashboard öffnen: http://localhost:4173" -ForegroundColor $Green
} else {
    Write-Status "Einige Services laufen nicht" "WARN"
    Write-Host "`nStarten Sie mit: .\scripts\start-local.ps1" -ForegroundColor $Yellow
}

Write-Host ""
