# 🪟 MediSync Windows Setup Guide

> **Zielgruppe:** Windows-Entwickler (Windows 10/11)  
> **Dauer:** ~15 Minuten  
> **Schwierigkeit:** Anfänger

---

## 📋 Übersicht

Diese Anleitung führt Sie Schritt für Schritt durch die Installation der MediSync Agenten-Plattform auf Windows-Systemen.

---

## ✅ Voraussetzungen prüfen

### Unterstützte Windows-Versionen

| Version | Unterstützung | Hinweise |
|---------|--------------|----------|
| Windows 11 | ✅ Vollständig | Keine Einschränkungen |
| Windows 10 (21H2+) | ✅ Vollständig | PowerShell 5.1+ |
| Windows 10 (älter) | ⚠️ Eingeschränkt | PowerShell 7 empfohlen |

### Erforderliche Komponenten

```powershell
# PowerShell als Administrator öffnen

# Windows-Version prüfen
winver

# PowerShell-Version prüfen
$PSVersionTable.PSVersion
# → Major sollte 5 oder höher sein
```

---

## 🔧 Schritt 1: PowerShell Execution Policy

PowerShell-Scripts müssen ausgeführt werden dürfen:

```powershell
# PowerShell als Administrator ausführen!

# Aktuelle Policy prüfen
Get-ExecutionPolicy
# → Meist "Restricted"

# Für CurrentUser erlauben (Empfohlen)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Oder: Bypass für diesen Prozess
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
```

> ⚠️ **Sicherheit:** `RemoteSigned` ist sicherer als `Unrestricted`

---

## 📦 Schritt 2: Node.js Installation

### Option A: Offizieller Installer (Empfohlen)

1. **Download:** https://nodejs.org/en/download/
2. **LTS-Version** wählen (z.B. 20.x LTS)
3. **Installer ausführen** (`.msi` Datei)
4. **Standard-Einstellungen** beibehalten
5. **"Add to PATH"** muss aktiviert sein

### Option B: Chocolatey (für Power-User)

```powershell
# Chocolatey muss installiert sein
# https://chocolatey.org/install

# Node.js LTS installieren
choco install nodejs-lts

# Installation prüfen
node --version
npm --version
```

### Option C: NVM für Windows

```powershell
# NVM-Windows herunterladen
# https://github.com/coreybutler/nvm-windows/releases

# NVM installieren und neu starten

# Node.js installieren
nvm install 20.11.0
nvm use 20.11.0

# Prüfen
node --version
```

### Verifikation

```powershell
# Neuen PowerShell-Fenster öffnen (wichtig für PATH)

# Versionen prüfen
node --version    # → v20.x.x
npm --version     # → 10.x.x

# NPM Update
npm install -g npm@latest
```

---

## 🐳 Schritt 3: Docker Desktop Installation

### Download & Installation

1. **Docker Desktop** herunterladen:
   - https://www.docker.com/products/docker-desktop

2. **Installation ausführen**
   - WSL2-Installation bestätigen
   - Nach Installation **Neustart**

3. **WSL2 Kernel Update** (falls gefragt)
   ```powershell
   # PowerShell als Administrator
   wsl --install
   # → Neustart erforderlich
   ```

### Konfiguration

1. Docker Desktop starten
2. **Settings** → **General**
   - ✅ "Use the WSL 2 based engine" aktivieren
   - ✅ "Start Docker Desktop when you log in" (optional)

3. **Settings** → **Resources** → **WSL Integration**
   - ✅ "Enable integration with my default WSL distro"

### Verifikation

```powershell
# Docker prüfen
docker --version
# → Docker version 24.x.x

docker-compose --version
# → Docker Compose version 2.x.x

# Test-Container
docker run hello-world
```

---

## 🗄️ Schritt 4: Redis Installation (Windows)

Redis läuft am besten in Docker - keine native Installation nötig!

### Redis via Docker (Empfohlen)

```powershell
# Redis Container starten
docker run -d `
  --name redis `
  -p 6379:6379 `
  --restart unless-stopped `
  redis:7-alpine

# Verifikation
docker ps | findstr redis
docker exec redis redis-cli ping
# → PONG
```

### Alternative: Redis für Windows (nicht empfohlen)

```powershell
# Nur wenn Docker nicht verfügbar

# Microsoft Archive (veraltet)
# https://github.com/microsoftarchive/redis/releases

# Oder Memurai (kommerziell)
# https://www.memurai.com/
```

---

## 🛠️ Schritt 5: Git Installation

### Download & Installation

1. **Download:** https://git-scm.com/download/win
2. **Installation:** Standard-Einstellungen
3. **Wichtige Optionen:**
   - ✅ "Git from the command line and also from 3rd-party software"
   - ✅ "Use the OpenSSL library"
   - ✅ "Checkout Windows-style, commit Unix-style line endings"

### Verifikation

```powershell
git --version
# → git version 2.x.x
```

### Git Konfiguration

```powershell
# Optional: Git Konfiguration
git config --global user.name "Ihr Name"
git config --global user.email "ihre@email.de"

# Line Endings für Windows
git config --global core.autocrlf true
```

---

## 🚀 Schritt 6: MediSync Installation

### Repository klonen

```powershell
# In PowerShell (nicht Administrator)

# Ziel-Verzeichnis wählen
cd C:\Projekte

# Repository klonen
git clone https://github.com/yourusername/medisync.git
cd medisync
```

### Environment konfigurieren

```powershell
# .env Datei erstellen
Copy-Item .env.example .env

# Mit Notepad öffnen
notepad .env

# Oder mit VS Code
# code .env
```

### Wichtige Windows-spezifische Änderungen in `.env`:

```env
# Windows-Pfade verwenden (mit Forward Slashes)
BACKUP_DIR=C:/Projekte/medisync/backups

# Oder mit escaped Backslashes
BACKUP_DIR=C:\\Projekte\\medisync\\backups
```

### Dependencies installieren

```powershell
# Root Dependencies
npm install

# Service-Dependencies
npm run install:services
```

---

## ▶️ Schritt 7: MediSync Starten

### Option A: Docker (Empfohlen)

```powershell
# Alle Services starten
docker-compose up -d

# Status prüfen
docker-compose ps

# Logs anzeigen
docker-compose logs -f
```

### Option B: Manuelle Entwicklung

```powershell
# Terminal 1: Redis (falls nicht via Docker)
docker run -d -p 6379:6379 --name redis redis:7-alpine

# Terminal 2: Backend
cd backend
npm run dev

# Terminal 3: Bot
cd bot/discord
npm start

# Terminal 4: Dashboard
cd dashboard
npm run dev
```

### Option C: Mit Make (WSL oder Git Bash)

```powershell
# Git Bash öffnen
# Rechtsklick im Ordner → "Git Bash Here"

make start
# oder
make dev-all
```

---

## 🌐 Verifikation

### Services testen

```powershell
# API Status
Invoke-RestMethod -Uri "http://localhost:3000/health" | ConvertTo-Json

# Dashboard öffnen
Start-Process "http://localhost:5173"

# Redis prüfen
docker exec redis redis-cli ping
```

### PowerShell Aliase (optional)

```powershell
# In $PROFILE hinzufügen

function medisync-start { docker-compose up -d }
function medisync-stop { docker-compose down }
function medisync-logs { docker-compose logs -f }
function medisync-status { docker-compose ps }

# Profile speichern
New-Item -ItemType File -Path $PROFILE -Force
notepad $PROFILE
```

---

## 🐛 Troubleshooting

### Problem: "Execution of scripts is disabled"

```powershell
# Lösung: Execution Policy ändern
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Problem: "docker-compose not found"

```powershell
# Neuere Docker-Versionen nutzen:
docker compose up -d

# Oder: Docker Desktop neu installieren
```

### Problem: "Port already in use"

```powershell
# Port belegt prüfen
Get-NetTCPConnection -LocalPort 3000

# Prozess beenden
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess
```

### Problem: "Node modules not found"

```powershell
# Bereinigen und neu installieren
Remove-Item -Recurse -Force node_modules
npm install
```

### Problem: "Redis connection refused"

```powershell
# Redis Container prüfen
docker ps | findstr redis

# Neu starten
docker restart redis

# Oder neu erstellen
docker rm -f redis
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

### Problem: "EPERM: operation not permitted"

```powershell
# PowerShell als Administrator ausführen
# Oder: Berechtigungen korrigieren
# Rechtsklick auf Ordner → Eigenschaften → Sicherheit
```

---

## 📝 Nützliche PowerShell-Befehle

### Docker Management

```powershell
# Alle Container anzeigen
docker ps -a

# Container stoppen
docker-compose down

# Container + Volumes entfernen
docker-compose down -v

# Logs eines Services
docker-compose logs -f backend
```

### Entwicklung

```powershell
# Alle Node-Prozesse anzeigen
Get-Process node

# Alle Node-Prozesse beenden
Get-Process node | Stop-Process

# Ports prüfen
Get-NetTCPConnection -LocalPort 3000,5173,6379,8080
```

### Environment Variablen

```powershell
# Env-Datei laden
Get-Content .env | ForEach-Object {
    if ($_ -match '^([^#][^=]*)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2])
    }
}
```

---

## 🎓 Empfohlene Tools für Windows

| Tool | Zweck | Download |
|------|-------|----------|
| **Windows Terminal** | Moderne Konsole | Microsoft Store |
| **VS Code** | IDE | https://code.visualstudio.com/ |
| **GitHub Desktop** | Git GUI | https://desktop.github.com/ |
| **Postman** | API Testing | https://www.postman.com/ |
| **RedisInsight** | Redis GUI | https://redis.io/insight/ |

---

## ✅ Setup-Checkliste

```
□ PowerShell Execution Policy konfiguriert
□ Node.js 18+ installiert (node --version)
□ npm 9+ installiert (npm --version)
□ Docker Desktop installiert und gestartet
□ WSL2 aktiviert (wsl --status)
□ Git installiert (git --version)
□ Repository geklont
□ .env Datei erstellt und konfiguriert
□ Dependencies installiert (npm install)
□ Redis läuft (docker ps)
□ Backend erreichbar (http://localhost:3000)
□ Dashboard erreichbar (http://localhost:5173)
```

---

## 🚀 Schnellstart nach Setup

```powershell
# Einmalig: Zum Projektordner navigigieren
cd C:\Projekte\medisync

# Starten
docker-compose up -d

# Im Browser öffnen
Start-Process "http://localhost:5173"

# Stoppen
docker-compose down
```

---

**Haben Sie Probleme?**  
Siehe [SETUP_GUIDE_QUICK.md](SETUP_GUIDE_QUICK.md) oder [README.md](README.md)

**Letzte Aktualisierung:** 2026-04-08
