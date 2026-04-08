# =============================================================================
# MediSync Agenten-Plattform - Environment Setup Script (PowerShell)
# =============================================================================
# Dieses Skript kopiert alle .env.example Dateien zu .env
# =============================================================================

# Farben für Output
$Red = "`e[0;31m"
$Green = "`e[0;32m"
$Yellow = "`e[1;33m"
$Blue = "`e[0;34m"
$NC = "`e[0m"

# Basis-Verzeichnis
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Set-Location $ProjectRoot

Write-Host "$Blue╔══════════════════════════════════════════════════════════════╗$NC"
Write-Host "$Blue║     MediSync Agenten-Plattform - Environment Setup           ║$NC"
Write-Host "$Blue╚══════════════════════════════════════════════════════════════╝$NC"
Write-Host ""

# Funktion zum Kopieren mit Status
function Copy-EnvFile {
    param(
        [string]$Source,
        [string]$Target,
        [string]$Name
    )
    
    if (Test-Path $Target) {
        Write-Host "$Yellow⚠️  $Name/.env existiert bereits$NC"
        $reply = Read-Host "   Überschreiben? (j/N)"
        if ($reply -match '^[Jj]$') {
            Copy-Item $Source $Target -Force
            Write-Host "$Green✅ $Name/.env überschrieben$NC"
        } else {
            Write-Host "$Yellow   Übersprungen$NC"
        }
    } else {
        Copy-Item $Source $Target
        Write-Host "$Green✅ $Name/.env erstellt$NC"
    }
}

# Root .env
Write-Host "$Blue📁 Root-Verzeichnis...$NC"
Copy-EnvFile -Source ".env.example" -Target ".env" -Name "Root"

# Backend .env
Write-Host "$Blue📁 Backend...$NC"
if (Test-Path "backend") {
    Copy-EnvFile -Source "backend/.env.example" -Target "backend/.env" -Name "Backend"
} else {
    Write-Host "$Red❌ Backend-Verzeichnis nicht gefunden$NC"
}

# Discord Bot .env
Write-Host "$Blue📁 Discord Bot...$NC"
if (Test-Path "bot/discord") {
    Copy-EnvFile -Source "bot/discord/.env.example" -Target "bot/discord/.env" -Name "Discord Bot"
} else {
    Write-Host "$Red❌ Discord Bot-Verzeichnis nicht gefunden$NC"
}

# Dashboard .env
Write-Host "$Blue📁 Dashboard...$NC"
if (Test-Path "dashboard") {
    Copy-EnvFile -Source "dashboard/.env.example" -Target "dashboard/.env" -Name "Dashboard"
} else {
    Write-Host "$Red❌ Dashboard-Verzeichnis nicht gefunden$NC"
}

Write-Host ""
Write-Host "$Blue╔══════════════════════════════════════════════════════════════╗$NC"
Write-Host "$Blue║                     Setup Abgeschlossen!                     ║$NC"
Write-Host "$Blue╚══════════════════════════════════════════════════════════════╝$NC"
Write-Host ""
Write-Host "$Yellow⚠️  WICHTIGE NÄCHSTE SCHRITTE:$NC"
Write-Host ""
Write-Host "$Green1. Discord Bot Token konfigurieren:$NC"
Write-Host "   → https://discord.com/developers/applications"
Write-Host "   → Token in alle .env Dateien eintragen: DISCORD_TOKEN"
Write-Host ""
Write-Host "$Green2. GitHub Token erstellen:$NC"
Write-Host "   → https://github.com/settings/tokens"
Write-Host "   → Scopes: read:packages"
Write-Host "   → Token in .env eintragen: GITHUB_TOKEN"
Write-Host ""
Write-Host "$Green3. Secrets generieren:$NC"
Write-Host "   → [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 } | ForEach-Object { [byte]`$_ }))"
Write-Host "   → JWT_SECRET und SESSION_SECRET aktualisieren"
Write-Host ""
Write-Host "$Blue📖 Detaillierte Anleitung:$NC SETUP_GUIDE_QUICK.md"
Write-Host ""

Pause
