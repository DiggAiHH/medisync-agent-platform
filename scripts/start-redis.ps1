#requires -Version 5.1
<#
.SYNOPSIS
    Startet den Redis-Server für die MediSync Agenten-Plattform
.DESCRIPTION
    Prüft ob Redis installiert ist und startet den Redis-Server.
    Zeigt Installationsanleitung falls Redis nicht gefunden wird.
.NOTES
    Dateiname: start-redis.ps1
    Autor: MediSync Team
    Version: 1.0.0
#>

[CmdletBinding()]
param(
    [string]$RedisPort = "6379",
    [string]$RedisConfig = "",
    [switch]$Background
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

function Show-RedisInstallHelp {
    Write-Title "REDIS INSTALLATION BENÖTIGT"
    
    Write-Host @"

Redis wurde nicht auf Ihrem System gefunden.

INSTALLATIONSANLEITUNG FÜR WINDOWS:
====================================

Option 1: Redis über MSYS2/MinGW (Empfohlen)
----------------------------------------------
1. Installiere MSYS2 von: https://www.msys2.org/
2. Öffne MSYS2 Terminal und führe aus:
   pacman -S mingw-w64-x86_64-redis
3. Füge Redis zum PATH hinzu:
   C:\msys64\mingw64\bin

Option 2: Redis über Docker
-----------------------------
1. Installiere Docker Desktop: https://www.docker.com/products/docker-desktop
2. Führe aus:
   docker run -d --name redis -p 6379:6379 redis:latest

Option 3: Memurai (Redis für Windows)
---------------------------------------
1. Lade Memurai herunter: https://www.memurai.com/
2. Installiere und starte den Dienst

Option 4: WSL (Windows Subsystem for Linux)
---------------------------------------------
1. Installiere WSL: wsl --install
2. Starte Ubuntu und führe aus:
   sudo apt update
   sudo apt install redis-server
   sudo service redis-server start

WEITERE INFORMATIONEN:
======================
Redis Downloads: https://redis.io/download
Redis Dokumentation: https://redis.io/documentation

"@ -ForegroundColor $Colors.Warning
}

function Test-RedisInstalled {
    $redisPaths = @(
        'redis-server'
        'C:\Program Files\Redis\redis-server.exe'
        'C:\msys64\mingw64\bin\redis-server.exe'
        'C:\tools\redis\redis-server.exe'
        'C:\redis\redis-server.exe'
    )
    
    # Prüfe PATH
    foreach ($path in $redisPaths) {
        try {
            $result = Get-Command $path -ErrorAction SilentlyContinue
            if ($result) {
                return $result.Source
            }
        }
        catch {
            continue
        }
    }
    
    # Prüfe häufige Installationspfade
    $commonPaths = @(
        'C:\Program Files\Redis\redis-server.exe'
        'C:\Program Files (x86)\Redis\redis-server.exe'
        'C:\tools\redis\redis-server.exe'
        'C:\redis\redis-server.exe'
        'C:\msys64\mingw64\bin\redis-server.exe'
    )
    
    foreach ($path in $commonPaths) {
        if (Test-Path $path) {
            return $path
        }
    }
    
    return $null
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

function Start-RedisServer {
    param(
        [string]$RedisPath,
        [string]$ConfigPath,
        [switch]$RunInBackground
    )
    
    $arguments = @()
    if ($ConfigPath -and (Test-Path $ConfigPath)) {
        $arguments += $ConfigPath
    }
    
    Write-Status "Starte Redis-Server..." 'Info'
    Write-Status "Pfad: $RedisPath" 'Info'
    
    if ($RunInBackground) {
        $process = Start-Process -FilePath $RedisPath -ArgumentList $arguments -WindowStyle Hidden -PassThru
        Write-Status "Redis läuft im Hintergrund (PID: $($process.Id))" 'Success'
        return $process
    }
    else {
        Write-Status "Redis wird im Vordergrund gestartet..." 'Info'
        Write-Status "Drücken Sie STRG+C zum Beenden`n" 'Warning'
        & $RedisPath $arguments
    }
}

# ============================================
# HAUPTPROGRAMM
# ============================================

Write-Title "MediSync Redis Starter"

# Prüfe ob Redis bereits läuft
Write-Status "Prüfe ob Redis bereits läuft auf Port $RedisPort..." 'Info'
if (Test-RedisRunning -Port $RedisPort) {
    Write-Status "Redis läuft bereits auf Port $RedisPort!" 'Success'
    Write-Host "`nVerbindungsdetails:" -ForegroundColor $Colors.Info
    Write-Host "  Host: localhost" -ForegroundColor White
    Write-Host "  Port: $RedisPort" -ForegroundColor White
    Write-Host "  URL:  redis://localhost:$RedisPort" -ForegroundColor White
    exit 0
}

# Suche Redis Installation
Write-Status "Suche Redis Installation..." 'Info'
$redisPath = Test-RedisInstalled

if (-not $redisPath) {
    Write-Status "Redis wurde nicht gefunden!" 'Error'
    Show-RedisInstallHelp
    exit 1
}

Write-Status "Redis gefunden: $redisPath" 'Success'

# Starte Redis
Write-Status "Port: $RedisPort" 'Info'

if ($Background) {
    $process = Start-RedisServer -RedisPath $redisPath -ConfigPath $RedisConfig -RunInBackground
    
    # Warte kurz und prüfe ob gestartet
    Start-Sleep -Seconds 2
    if (Test-RedisRunning -Port $RedisPort) {
        Write-Status "Redis erfolgreich gestartet!" 'Success'
        Write-Host "`nVerbindungsdetails:" -ForegroundColor $Colors.Info
        Write-Host "  Host: localhost" -ForegroundColor White
        Write-Host "  Port: $RedisPort" -ForegroundColor White
        Write-Host "  URL:  redis://localhost:$RedisPort" -ForegroundColor White
        Write-Host "  PID:  $($process.Id)" -ForegroundColor White
    }
    else {
        Write-Status "Redis konnte nicht gestartet werden!" 'Error'
        exit 1
    }
}
else {
    Start-RedisServer -RedisPath $redisPath -ConfigPath $RedisConfig
}
