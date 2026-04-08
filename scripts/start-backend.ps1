#requires -Version 5.1
<#
.SYNOPSIS
    Startet das MediSync Backend (API Server)
.DESCRIPTION
    Setzt Umgebungsvariablen und startet den Node.js API Server.
    Prüft Voraussetzungen wie Node.js und Redis.
.NOTES
    Dateiname: start-backend.ps1
    Autor: MediSync Team
    Version: 1.0.0
#>

[CmdletBinding()]
param(
    [string]$Port = "3000",
    [string]$WsPort = "8080",
    [string]$EnvFile = "..\backend\.env",
    [switch]$DevMode,
    [switch]$SkipRedisCheck
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

function Test-RedisRunning {
    param([int]$Port = 6379)
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect("localhost", $Port)
        $client.Close()
        return $true
    }
    catch {
        return $false
    }
}

function Import-EnvFile {
    param([string]$Path)
    
    if (-not (Test-Path $Path)) {
        Write-Status "Env-Datei nicht gefunden: $Path" 'Warning'
        return @{}
    }
    
    $envVars = @{}
    $content = Get-Content $Path -ErrorAction SilentlyContinue
    
    foreach ($line in $content) {
        $line = $line.Trim()
        # Überspringe Kommentare und leere Zeilen
        if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) {
            continue
        }
        
        # Parse KEY=VALUE
        if ($line -match '^([^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            
            # Entferne Anführungszeichen
            $value = $value -replace '^["\''](.*)["\'']$', '$1'
            
            $envVars[$key] = $value
            
            # Setze Umgebungsvariable
            [Environment]::SetEnvironmentVariable($key, $value, 'Process')
        }
    }
    
    return $envVars
}

# ============================================
# HAUPTPROGRAMM
# ============================================

Write-Title "MediSync Backend Starter"

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

# Prüke npm
if (-not (Test-CommandExists 'npm')) {
    Write-Status "npm wurde nicht gefunden!" 'Error'
    exit 1
}
$npmVersion = npm --version
Write-Status "npm gefunden: $npmVersion" 'Success'

# Prüfe Redis
if (-not $SkipRedisCheck) {
    Write-Status "Prüfe Redis-Verbindung..." 'Info'
    if (Test-RedisRunning -Port 6379) {
        Write-Status "Redis läuft auf Port 6379" 'Success'
    }
    else {
        Write-Status "Redis läuft nicht auf Port 6379!" 'Warning'
        Write-Status "Starten Sie zuerst Redis mit: .\start-redis.ps1" 'Warning'
        
        $response = Read-Host "Trotzdem fortfahren? (j/N)"
        if ($response -ne 'j' -and $response -ne 'J') {
            exit 1
        }
    }
}

# Wechsle ins Backend-Verzeichnis
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $scriptDir "..\backend"

if (-not (Test-Path $backendDir)) {
    Write-Status "Backend-Verzeichnis nicht gefunden: $backendDir" 'Error'
    exit 1
}

Set-Location $backendDir
Write-Status "Arbeitsverzeichnis: $(Get-Location)" 'Info'

# Lade .env Datei
$envFilePath = Join-Path $scriptDir $EnvFile
if (Test-Path $envFilePath) {
    Write-Status "Lade Umgebungsvariablen aus: $envFilePath" 'Info'
    $envVars = Import-EnvFile -Path $envFilePath
    Write-Status "$($envVars.Count) Variablen geladen" 'Success'
}
else {
    Write-Status "Keine .env Datei gefunden, verwende Standardwerte" 'Warning'
}

# Setze Standard-Umgebungsvariablen
$env:NODE_ENV = $env:NODE_ENV ?? 'development'
$env:PORT = $Port
$env:WS_PORT = $WsPort
$env:TZ = 'Europe/Berlin'

Write-Status "Umgebungsvariablen gesetzt:" 'Info'
Write-Host "  NODE_ENV: $env:NODE_ENV" -ForegroundColor Gray
Write-Host "  PORT: $env:PORT" -ForegroundColor Gray
Write-Host "  WS_PORT: $env:WS_PORT" -ForegroundColor Gray
Write-Host "  TZ: $env:TZ" -ForegroundColor Gray

# Prüfe node_modules
if (-not (Test-Path "node_modules")) {
    Write-Status "node_modules nicht gefunden, installiere Abhängigkeiten..." 'Warning'
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Status "Fehler bei npm install!" 'Error'
        exit 1
    }
}

# Prüfe dist-Verzeichnis (nur für Production)
if (-not $DevMode -and -not (Test-Path "dist\server.js")) {
    Write-Status "dist/server.js nicht gefunden, baue Projekt..." 'Warning'
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Status "Fehler beim Build!" 'Error'
        exit 1
    }
}

# Starte Server
Write-Title "Starte Backend Server"

if ($DevMode) {
    Write-Status "Starte im Development-Modus (ts-node)..." 'Info'
    Write-Status "Backend wird gestartet auf http://localhost:$Port" 'Success'
    Write-Status "WebSocket auf ws://localhost:$WsPort" 'Success'
    Write-Host "`nDrücken Sie STRG+C zum Beenden`n" -ForegroundColor $Colors.Warning
    npm run dev
}
else {
    Write-Status "Starte im Production-Modus (node)..." 'Info'
    Write-Status "Backend läuft auf http://localhost:$Port" 'Success'
    Write-Status "WebSocket auf ws://localhost:$WsPort" 'Success'
    Write-Host "`nDrücken Sie STRG+C zum Beenden`n" -ForegroundColor $Colors.Warning
    npm start
}
