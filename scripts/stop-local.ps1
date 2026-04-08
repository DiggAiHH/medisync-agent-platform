#requires -Version 5.1
<#
.SYNOPSIS
    Stoppt alle lokalen MediSync Services

.DESCRIPTION
    Beendet alle Node.js Prozesse, die zu MediSync gehören.

.EXAMPLE
    .\scripts\stop-local.ps1
#>

[CmdletBinding()]
param(
    [switch]$Force
)

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

Write-Host "`n╔══════════════════════════════════════════════════════════╗" -ForegroundColor $Blue
Write-Host "║          MediSync - Stoppe lokale Services               ║" -ForegroundColor $Blue
Write-Host "╚══════════════════════════════════════════════════════════╝`n" -ForegroundColor $Blue

# Methode 1: Über PID-Datei
$pidFile = "$RootPath\.local-pids.json"
$stoppedCount = 0

if (Test-Path $pidFile) {
    Write-Status "Lese Prozess-IDs aus PID-Datei..." "INFO"
    try {
        $pids = Get-Content $pidFile | ConvertFrom-Json
        
        foreach ($procType in @('api', 'worker', 'dashboard')) {
            $pid = $pids.$procType
            if ($pid) {
                try {
                    $process = Get-Process -Id $pid -ErrorAction Stop
                    Write-Status "Beende $procType (PID: $pid)..." "INFO"
                    Stop-Process -Id $pid -Force:$Force -ErrorAction Stop
                    Write-Status "$procType beendet" "SUCCESS"
                    $stoppedCount++
                } catch {
                    Write-Status "$procType läuft nicht mehr (PID: $pid)" "WARN"
                }
            }
        }
        
        Remove-Item $pidFile -Force
    } catch {
        Write-Status "Konnte PID-Datei nicht lesen: $_" "WARN"
    }
}

# Methode 2: Suche nach Node-Prozessen in MediSync-Verzeichnissen
Write-Status "Suche nach MediSync Node.js Prozessen..." "INFO"

try {
    $nodeProcesses = Get-Process node -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -like "*$RootPath*"
    }
    
    foreach ($proc in $nodeProcesses) {
        try {
            Write-Status "Beende Node-Prozess (PID: $($proc.Id))..." "INFO"
            Stop-Process -Id $proc.Id -Force:$Force -ErrorAction Stop
            Write-Status "Prozess beendet" "SUCCESS"
            $stoppedCount++
        } catch {
            Write-Status "Konnte Prozess $($proc.Id) nicht beenden: $_" "ERROR"
        }
    }
} catch {
    Write-Status "Keine Node.js Prozesse gefunden" "INFO"
}

# Methode 3: Ports freigeben (falls Prozesse hängen)
Write-Status "Prüfe belegte Ports..." "INFO"
$ports = @(3000, 8080, 4173)

foreach ($port in $ports) {
    try {
        $connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($connection) {
            $proc = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Status "Port $port beendet durch Prozess $($proc.Id)" "INFO"
                Stop-Process -Id $proc.Id -Force:$Force
                $stoppedCount++
            }
        }
    } catch {
        # Port ist nicht belegt - OK
    }
}

# Zusammenfassung
Write-Host "`n╔══════════════════════════════════════════════════════════╗" -ForegroundColor $Green
if ($stoppedCount -gt 0) {
    Write-Host "║  $stoppedCount Prozess(e) beendet" -ForegroundColor $Green
} else {
    Write-Host "║  Keine laufenden Prozesse gefunden" -ForegroundColor $Yellow
}
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor $Green

Write-Host ""
