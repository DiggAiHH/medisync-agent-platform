#requires -Version 5.1
<#
.SYNOPSIS
    Startet das MediSync Dashboard (Vite Dev Server)
.DESCRIPTION
    Startet den Vite Development Server und öffnet automatisch den Browser.
    Prüft Voraussetzungen wie Node.js und npm.
.NOTES
    Dateiname: start-dashboard.ps1
    Autor: MediSync Team
    Version: 1.0.0
#>

[CmdletBinding()]
param(
    [string]$Port = "5173",
    [string]$ApiUrl = "http://localhost:3000",
    [string]$WsUrl = "ws://localhost:8080",
    [switch]$SkipBrowser,
    [switch]$SkipBackendCheck
)

# Farbdefinitionen
$Colors = @{
    Success = 'Green'
    Error = 'Red'
    Warning = 'Yellow'
    Info = 'Cyan'
    Title = 'Magenta'
}

# Helper-Funktionen
function Write-Status {
    param([string]$Message, [string]$Type = 'Info')
    $color = $Colors[$Type]
    Write-Host "[$Type] $Message" -ForegroundColor $color
}

function Write-Title {
    param([string]$Title)
    Write-Host "`n========================================" -ForegroundColor $Colors.Title
    Write-Host "  $Title" -ForegroundColor $Colors.Title
    Write-Host "========================================`n" -ForegroundColor $Colors.Title
}

function Test-CommandExists {
    param([string]$Command)
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Test-BackendRunning {
    param([string]$Url = "http://localhost:3000")
    try {
        $response = Invoke-WebRequest -Uri "$Url/health" -Method GET -TimeoutSec 5 -ErrorAction SilentlyContinue
        return ($response.StatusCode -eq 200)
    }
    catch {
        return $false
    }
}

function Open-Browser {
    param([string]$Url)
    
    try {
        # Versuche verschiedene Browser-Methoden
        if (Get-Command "Start-Process" -ErrorAction SilentlyContinue) {
            Start-Process $Url
            return $true
        }
    }
    catch {
        # Fallback zu cmd
        try {
            cmd /c start $Url
            return $true
        }
        catch {
            return $false
        }
    }
}

function Get-LocalIP {
    try {
        $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
            $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' 
        } | Select-Object -First 1).IPAddress
        return $ip
    }
    catch {
        return $null
    }
}

# ============================================
# HAUPTPROGRAMM
# ============================================

Write-Title "MediSync Dashboard Starter"

# Prüfe Node.js
Write-Status "Prüfe Node.js Installation..." 'Info'
if (-not (Test-CommandExists 'node')) {
    Write-Status "Node.js wurde nicht gefunden!" 'Error'
    Write-Host @"

Bitte installieren Sie Node.js:
https://nodejs.org/ (Version 18 oder höher empfohlen)

"@ -ForegroundColor $Colors.Warning
    exit 1
}
$nodeVersion = node --version
Write-Status "Node.js gefunden: $nodeVersion" 'Success'

# Prüfe Backend
if (-not $SkipBackendCheck) {
    Write-Status "Prüfe Backend-Verfügbarkeit..." 'Info'
    if (Test-BackendRunning -Url $ApiUrl) {
        Write-Status "Backend erreichbar unter $ApiUrl" 'Success'
    }
    else {
        Write-Status "Backend nicht erreichbar unter $ApiUrl!" 'Warning'
        Write-Status "Starten Sie zuerst das Backend mit: .\start-backend.ps1" 'Warning'
        
        $response = Read-Host "Trotzdem fortfahren? (j/N)"
        if ($response -ne 'j' -and $response -ne 'J') {
            exit 1
        }
    }
}

# Wechsle ins Dashboard-Verzeichnis
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dashboardDir = Join-Path $scriptDir "..\dashboard"

if (-not (Test-Path $dashboardDir)) {
    Write-Status "Dashboard-Verzeichnis nicht gefunden: $dashboardDir" 'Error'
    exit 1
}

Set-Location $dashboardDir
Write-Status "Arbeitsverzeichnis: $(Get-Location)" 'Info'

# Setze Umgebungsvariablen
$env:VITE_API_URL = $ApiUrl
$env:VITE_WS_URL = $WsUrl
$env:NODE_ENV = 'development'

Write-Status "Umgebungsvariablen gesetzt:" 'Info'
Write-Host "  VITE_API_URL: $env:VITE_API_URL" -ForegroundColor Gray
Write-Host "  VITE_WS_URL: $env:VITE_WS_URL" -ForegroundColor Gray
Write-Host "  NODE_ENV: $env:NODE_ENV" -ForegroundColor Gray

# Prüfe node_modules
if (-not (Test-Path "node_modules")) {
    Write-Status "node_modules nicht gefunden, installiere Abhängigkeiten..." 'Warning'
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Status "Fehler bei npm install!" 'Error'
        exit 1
    }
}

# Starte Dashboard
Write-Title "Starte Dashboard"

$dashboardUrl = "http://localhost:$Port"
$localIP = Get-LocalIP

Write-Status "Dashboard wird gestartet..." 'Info'
Write-Status "Lokale URL:    $dashboardUrl" 'Success'
if ($localIP) {
    Write-Status "Netzwerk-URL:  http://$localIP`:$Port" 'Success'
}

# Öffne Browser
if (-not $SkipBrowser) {
    Write-Status "Öffne Browser..." 'Info'
    Start-Sleep -Seconds 2
    
    if (Open-Browser -Url $dashboardUrl) {
        Write-Status "Browser geöffnet" 'Success'
    }
    else {
        Write-Status "Konnte Browser nicht automatisch öffnen" 'Warning'
        Write-Status "Bitte öffnen Sie manuell: $dashboardUrl" 'Info'
    }
}

Write-Host "`nDrücken Sie STRG+C zum Beenden`n" -ForegroundColor $Colors.Warning

# Starte Vite Dev Server
try {
    npm run dev -- --port $Port --host
}
catch {
    Write-Status "Fehler beim Starten des Dashboards: $_" 'Error'
    exit 1
}
