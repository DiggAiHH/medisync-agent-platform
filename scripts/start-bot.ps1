#requires -Version 5.1
<#
.SYNOPSIS
    Startet den MediSync Discord Bot
.DESCRIPTION
    Prüft DISCORD_TOKEN, lädt Umgebungsvariablen und startet den Discord Bot.
    Zeigt die Einladungs-URL für den Bot an.
.NOTES
    Dateiname: start-bot.ps1
    Autor: MediSync Team
    Version: 1.0.0
#>

[CmdletBinding()]
param(
    [string]$EnvFile = "..\bot\discord\.env",
    [switch]$DevMode,
    [switch]$SkipTokenCheck,
    [switch]$DeployCommands
)

# Farbdefinitionen
$Colors = @{
    Success = 'Green'
    Error = 'Red'
    Warning = 'Yellow'
    Info = 'Cyan'
    Title = 'Magenta'
    Highlight = 'White'
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

function Write-Box {
    param([string[]]$Lines)
    $maxLength = ($Lines | ForEach-Object { $_.Length } | Measure-Object -Maximum).Maximum
    $border = "+" + ("-" * ($maxLength + 2)) + "+"
    
    Write-Host $border -ForegroundColor $Colors.Highlight
    foreach ($line in $Lines) {
        $padded = $line.PadRight($maxLength)
        Write-Host "| $padded |" -ForegroundColor $Colors.Highlight
    }
    Write-Host $border -ForegroundColor $Colors.Highlight
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

function Import-EnvFile {
    param([string]$Path)
    
    if (-not (Test-Path $Path)) {
        return @{}
    }
    
    $envVars = @{}
    $content = Get-Content $Path -ErrorAction SilentlyContinue
    
    foreach ($line in $content) {
        $line = $line.Trim()
        if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) {
            continue
        }
        
        if ($line -match '^([^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            $value = $value -replace '^["\''](.*)["\'']$', '$1'
            
            $envVars[$key] = $value
            [Environment]::SetEnvironmentVariable($key, $value, 'Process')
        }
    }
    
    return $envVars
}

function Show-DiscordSetupHelp {
    Write-Title "DISCORD BOT EINRICHTUNG"
    
    Write-Host @"

SCHRITT 1: Discord Application Erstellen
==========================================
1. Öffne: https://discord.com/developers/applications
2. Klicke auf "New Application"
3. Gib deinem Bot einen Namen (z.B. "MediSync Bot")
4. Akzeptiere die Nutzungsbedingungen

SCHRITT 2: Bot Token Generieren
=================================
1. Gehe zu "Bot" im linken Menü
2. Klicke "Add Bot" -> "Yes, do it!"
3. Unter "TOKEN" klicke "Reset Token"
4. Kopiere den Token (wird nur einmal angezeigt!)
5. Füge ihn in die .env Datei ein:
   DISCORD_TOKEN=dein_token_hier

SCHRITT 3: Bot Berechtigungen Setzen
======================================
1. Scroll runter zu "Privileged Gateway Intents"
2. Aktiviere:
   ☑ SERVER MEMBERS INTENT
   ☑ MESSAGE CONTENT INTENT
3. Speichere die Änderungen

SCHRITT 4: OAuth2 URL Generator
=================================
1. Gehe zu "OAuth2" -> "URL Generator"
2. Wähle unter "SCOPES":
   ☑ bot
   ☑ applications.commands
3. Wähle unter "BOT PERMISSIONS":
   ☑ Send Messages
   ☑ Read Message History
   ☑ Use Slash Commands
   ☑ Manage Messages (optional)
   ☑ Embed Links
   ☑ Attach Files
4. Kopiere die generierte URL
5. Öffne sie im Browser und lade den Bot ein

SCHRITT 5: Application ID
===========================
1. Gehe zu "General Information"
2. Kopiere "APPLICATION ID"
3. Füge ihn in die .env Datei ein:
   DISCORD_CLIENT_ID=deine_application_id
   DISCORD_APPLICATION_ID=deine_application_id

"@ -ForegroundColor $Colors.Warning
}

function Get-BotInviteUrl {
    param([string]$ClientId)
    
    if ([string]::IsNullOrEmpty($ClientId) -or $ClientId -eq 'your_discord_application_id_here') {
        return $null
    }
    
    $permissions = '2147483648' # Use Application Commands
    $scope = 'bot%20applications.commands'
    return "https://discord.com/api/oauth2/authorize?client_id=$ClientId&permissions=$permissions&scope=$scope"
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

# ============================================
# HAUPTPROGRAMM
# ============================================

Write-Title "MediSync Discord Bot Starter"

# Prüfe Node.js
Write-Status "Prüfe Node.js Installation..." 'Info'
if (-not (Test-CommandExists 'node')) {
    Write-Status "Node.js wurde nicht gefunden!" 'Error'
    Write-Host "`nBitte installieren Sie Node.js: https://nodejs.org/`n" -ForegroundColor $Colors.Warning
    exit 1
}
$nodeVersion = node --version
Write-Status "Node.js gefunden: $nodeVersion" 'Success'

# Lade .env Datei
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFilePath = Join-Path $scriptDir $EnvFile

Write-Status "Lade Konfiguration aus: $envFilePath" 'Info'
$envVars = Import-EnvFile -Path $envFilePath

# Prüfe DISCORD_TOKEN
$discordToken = $env:DISCORD_TOKEN
if (-not $SkipTokenCheck) {
    if ([string]::IsNullOrEmpty($discordToken) -or $discordToken -eq 'your_discord_bot_token_here') {
        Write-Status "DISCORD_TOKEN nicht gesetzt oder ungültig!" 'Error'
        Write-Status "Bitte konfigurieren Sie den Bot:" 'Info'
        Show-DiscordSetupHelp
        exit 1
    }
    
    # Maskiere Token für Anzeige
    $maskedToken = $discordToken.Substring(0, [Math]::Min(10, $discordToken.Length)) + "..."
    Write-Status "DISCORD_TOKEN gefunden: $maskedToken" 'Success'
}

# Prüfe Client ID
$clientId = $env:DISCORD_CLIENT_ID
if ([string]::IsNullOrEmpty($clientId) -or $clientId -eq 'your_discord_application_id_here') {
    Write-Status "DISCORD_CLIENT_ID nicht gesetzt!" 'Warning'
    Write-Status "Einige Features (wie Einladungs-URL) sind nicht verfügbar" 'Warning'
}
else {
    Write-Status "DISCORD_CLIENT_ID: $clientId" 'Success'
}

# Zeige Einladungs-URL
$inviteUrl = Get-BotInviteUrl -ClientId $clientId
if ($inviteUrl) {
    Write-Title "BOT EINLADUNGS-URL"
    Write-Box -Lines @(
        "Bot noch nicht im Server?",
        "",
        "Einladungs-URL:"
    )
    Write-Host "`n$inviteUrl`n" -ForegroundColor $Colors.Success
    Write-Host "(Klicken oder kopieren und im Browser öffnen)`n" -ForegroundColor $Colors.Info
}

# Prüfe Backend
Write-Status "Prüfe Backend-Verfügbarkeit..." 'Info'
$apiUrl = $env:API_BASE_URL ?? 'http://localhost:3000'
if (Test-BackendRunning -Url $apiUrl) {
    Write-Status "Backend erreichbar unter $apiUrl" 'Success'
}
else {
    Write-Status "Backend nicht erreichbar unter $apiUrl!" 'Warning'
    Write-Status "Der Bot funktioniert möglicherweise nicht korrekt" 'Warning'
}

# Wechsle ins Bot-Verzeichnis
$botDir = Join-Path $scriptDir "..\bot\discord"

if (-not (Test-Path $botDir)) {
    Write-Status "Bot-Verzeichnis nicht gefunden: $botDir" 'Error'
    exit 1
}

Set-Location $botDir
Write-Status "Arbeitsverzeichnis: $(Get-Location)" 'Info'

# Prüfe node_modules
if (-not (Test-Path "node_modules")) {
    Write-Status "node_modules nicht gefunden, installiere Abhängigkeiten..." 'Warning'
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Status "Fehler bei npm install!" 'Error'
        exit 1
    }
}

# Deploy Commands falls gewünscht
if ($DeployCommands) {
    Write-Title "Deploy Slash Commands"
    Write-Status "Deploye Discord Slash Commands..." 'Info'
    npm run deploy-commands
    if ($LASTEXITCODE -ne 0) {
        Write-Status "Fehler beim Deployen der Commands!" 'Warning'
    }
    else {
        Write-Status "Commands erfolgreich deployed!" 'Success'
    }
}

# Starte Bot
Write-Title "Starte Discord Bot"

if ($DevMode) {
    Write-Status "Starte im Development-Modus (ts-node)..." 'Info'
}
else {
    Write-Status "Starte im Production-Modus (node)..." 'Info'
    
    # Prüfe dist/bot.js
    if (-not (Test-Path "dist\bot.js")) {
        Write-Status "dist/bot.js nicht gefunden, baue Projekt..." 'Warning'
        npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Status "Fehler beim Build!" 'Error'
            exit 1
        }
    }
}

Write-Host "`nBot ist bereit und verbindet mit Discord..." -ForegroundColor $Colors.Success
Write-Host "Drücken Sie STRG+C zum Beenden`n" -ForegroundColor $Colors.Warning

if ($DevMode) {
    npm run dev
}
else {
    npm start
}
