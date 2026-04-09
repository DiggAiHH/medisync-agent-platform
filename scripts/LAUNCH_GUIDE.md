# MediSync Agenten-Plattform - Windows Launch Guide

Diese Anleitung beschreibt die Schritt-für-Schritt Einrichtung und den Start der MediSync Agenten-Plattform unter Windows.

## 📋 Voraussetzungen

### Erforderliche Software

| Software | Version | Download |
|----------|---------|----------|
| Node.js | ≥ 18.0.0 | https://nodejs.org/ |
| npm | ≥ 9.0.0 | Mit Node.js |
| Redis | ≥ 6.0 | Siehe unten |
| Git | Latest | https://git-scm.com/ |

### Redis Installation (Windows)

Wähle eine der folgenden Optionen:

#### Option 1: Docker (Empfohlen)
```powershell
# Docker Desktop installieren: https://www.docker.com/products/docker-desktop
docker run -d --name redis -p 6379:6379 redis:latest
```

#### Option 2: MSYS2/MinGW
1. Installiere MSYS2: https://www.msys2.org/
2. Öffne MSYS2 Terminal:
```bash
pacman -S mingw-w64-x86_64-redis
```
3. Füge `C:\msys64\mingw64\bin` zum PATH hinzu

#### Option 3: Memurai (Redis für Windows)
1. Lade Memurai herunter: https://www.memurai.com/
2. Installiere und der Dienst startet automatisch

#### Option 4: WSL (Windows Subsystem for Linux)
```powershell
# WSL installieren
wsl --install

# In Ubuntu Terminal:
sudo apt update
sudo apt install redis-server
sudo service redis-server start
```

---

## 🚀 Schnellstart

### 1. PowerShell Execution Policy einstellen

Öffne PowerShell als Administrator:

```powershell
# Aktuelle Policy prüfen
Get-ExecutionPolicy

# Für CurrentUser auf RemoteSigned setzen (empfohlen)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Oder für diesen Prozess nur
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
```

### 2. Projekt klonen (falls noch nicht geschehen)

```powershell
cd "d:\Klaproth Projekte\Stupi"
git clone <repository-url> agents-platform
cd agents-platform
```

### 3. Umgebungsvariablen konfigurieren

Kopiere die Beispieldateien:

```powershell
# Backend
copy backend\.env.example backend\.env

# Discord Bot
copy bot\discord\.env.example bot\discord\.env
```

Bearbeite die `.env` Dateien und setze:

**Backend (`backend\.env`):**
- `GITHUB_TOKEN` - Dein GitHub Personal Access Token
- `JWT_SECRET` - Ein zufälliger String für JWT
- `INTERNAL_API_KEY` - Ein sicherer API Key

**Discord Bot (`bot\discord\.env`):**
- `DISCORD_TOKEN` - Dein Discord Bot Token
- `DISCORD_CLIENT_ID` - Discord Application ID
- `DISCORD_APPLICATION_ID` - Discord Application ID

> 💡 **Hinweis:** Siehe Abschnitt "Discord Bot Einrichtung" für Details.

### 4. Abhängigkeiten installieren

```powershell
# Wechsle in das scripts-Verzeichnis
cd scripts

# Alternativ manuell:
cd ..\backend && npm install
cd ..\dashboard && npm install
cd ..\bot\discord && npm install
```

---

## 🏃 Starten der Komponenten

### Schritt 1: Redis starten

```powershell
.\start-redis.ps1

# Im Hintergrund starten (neues Fenster):
Start-Process powershell -ArgumentList "-File .\start-redis.ps1 -Background"
```

**Erfolgsausgabe:**
```
[Success] Redis gefunden: C:\...
[Success] Redis erfolgreich gestartet!

Verbindungsdetails:
  Host: localhost
  Port: 6379
  URL:  redis://localhost:6379
```

### Schritt 2: Backend starten

In einem **neuen** PowerShell-Fenster:

```powershell
cd "d:\Klaproth Projekte\Stupi\agents-platform\scripts"

# Development-Modus (mit ts-node)
.\start-backend.ps1 -DevMode

# Oder Production-Modus
.\start-backend.ps1
```

**Erfolgsausgabe:**
```
[Success] Backend läuft auf http://localhost:3000
[Success] WebSocket auf ws://localhost:8080

Drücken Sie STRG+C zum Beenden
```

### Schritt 3: Dashboard starten

In einem **neuen** PowerShell-Fenster:

```powershell
cd "d:\Klaproth Projekte\Stupi\agents-platform\scripts"
.\start-dashboard.ps1
```

**Erfolgsausgabe:**
```
[Success] Lokale URL:    http://localhost:5173
[Success] Netzwerk-URL:  http://192.168.x.x:5173
[Success] Browser geöffnet

Drücken Sie STRG+C zum Beenden
```

Der Browser öffnet sich automatisch. Falls nicht:
- Öffne: http://localhost:5173

### Schritt 4: Discord Bot starten (optional)

In einem **neuen** PowerShell-Fenster:

```powershell
cd "d:\Klaproth Projekte\Stupi\agents-platform\scripts"

# Mit Slash Commands deployment
.\start-bot.ps1 -DevMode -DeployCommands

# Oder ohne Deployment
.\start-bot.ps1 -DevMode
```

**Erfolgsausgabe:**
```
[Success] DISCORD_TOKEN gefunden: MTAxMjM0...
[Success] DISCORD_CLIENT_ID: 1234567890

========================================
  BOT EINLADUNGS-URL
========================================

+----------------------------------+
| Bot noch nicht im Server?        |
|                                  |
| Einladungs-URL:                  |
+----------------------------------+

https://discord.com/api/oauth2/authorize?client_id=...&permissions=...&scope=bot%20applications.commands

(Klicken oder kopieren und im Browser öffnen)
```

---

## 🤖 Discord Bot Einrichtung

### 1. Discord Application erstellen

1. Öffne: https://discord.com/developers/applications
2. Klicke **"New Application"**
3. Gib einen Namen ein (z.B. "MediSync Bot")
4. Akzeptiere die Nutzungsbedingungen

### 2. Bot Token generieren

1. Gehe zu **"Bot"** im linken Menü
2. Klicke **"Add Bot"** → **"Yes, do it!"**
3. Unter **"TOKEN"** klicke **"Reset Token"**
4. **Kopiere den Token sofort!** (wird nur einmal angezeigt)
5. Füge ihn in `bot\discord\.env` ein:
   ```
   DISCORD_TOKEN=paste-your-discord-bot-token-here
   ```

### 3. Berechtigungen aktivieren

Unter **"Privileged Gateway Intents"**:
- ☑ **SERVER MEMBERS INTENT**
- ☑ **MESSAGE CONTENT INTENT**

### 4. Bot in Server einladen

1. Gehe zu **"OAuth2"** → **"URL Generator"**
2. Unter **SCOPES** wähle:
   - ☑ `bot`
   - ☑ `applications.commands`
3. Unter **BOT PERMISSIONS** wähle:
   - ☑ Send Messages
   - ☑ Read Message History
   - ☑ Use Slash Commands
   - ☑ Embed Links
   - ☑ Attach Files
4. Kopiere die generierte URL
5. Öffne sie im Browser und wähle deinen Server

### 5. Application ID

1. Gehe zu **"General Information"**
2. Kopiere **"APPLICATION ID"**
3. Füge ihn in `bot\discord\.env` ein:
   ```
   DISCORD_CLIENT_ID=1234567890123456789
   DISCORD_APPLICATION_ID=1234567890123456789
   ```

---

## 🔧 Skript-Parameter

### start-redis.ps1

```powershell
.\start-redis.ps1 [-Port <Port>] [-Config <Path>] [-Background]
```

| Parameter | Standard | Beschreibung |
|-----------|----------|--------------|
| `-Port` | 6379 | Redis Port |
| `-Config` | - | Pfad zur Redis-Konfiguration |
| `-Background` | - | Im Hintergrund starten |

### start-backend.ps1

```powershell
.\start-backend.ps1 [-Port <Port>] [-WsPort <Port>] [-DevMode] [-SkipRedisCheck]
```

| Parameter | Standard | Beschreibung |
|-----------|----------|--------------|
| `-Port` | 3000 | API Server Port |
| `-WsPort` | 8080 | WebSocket Port |
| `-DevMode` | - | TypeScript direkt ausführen |
| `-SkipRedisCheck` | - | Redis-Prüfung überspringen |

### start-dashboard.ps1

```powershell
.\start-dashboard.ps1 [-Port <Port>] [-ApiUrl <URL>] [-SkipBrowser] [-SkipBackendCheck]
```

| Parameter | Standard | Beschreibung |
|-----------|----------|--------------|
| `-Port` | 5173 | Vite Dev Server Port |
| `-ApiUrl` | http://localhost:3000 | Backend API URL |
| `-WsUrl` | ws://localhost:8080 | WebSocket URL |
| `-SkipBrowser` | - | Browser nicht öffnen |
| `-SkipBackendCheck` | - | Backend-Prüfung überspringen |

### start-bot.ps1

```powershell
.\start-bot.ps1 [-DevMode] [-DeployCommands] [-SkipTokenCheck]
```

| Parameter | Standard | Beschreibung |
|-----------|----------|--------------|
| `-DevMode` | - | TypeScript direkt ausführen |
| `-DeployCommands` | - | Slash Commands deployen |
| `-SkipTokenCheck` | - | Token-Validierung überspringen |

---

## 🐛 Troubleshooting

### "Execution Policy" Fehler

**Fehlermeldung:**
```
cannot be loaded because running scripts is disabled on this system
```

**Lösung:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### "Redis nicht gefunden"

**Fehlermeldung:**
```
[Error] Redis wurde nicht gefunden!
```

**Lösung:**
1. Redis installieren (siehe Abschnitt "Redis Installation")
2. Redis zum PATH hinzufügen
3. Oder Docker verwenden:
   ```powershell
   docker run -d --name redis -p 6379:6379 redis:latest
   ```

### "Backend nicht erreichbar"

**Fehlermeldung:**
```
[Warning] Backend nicht erreichbar unter http://localhost:3000!
```

**Lösung:**
1. Prüfe ob das Backend läuft:
   ```powershell
   Invoke-WebRequest -Uri "http://localhost:3000/health"
   ```
2. Starte das Backend:
   ```powershell
   .\start-backend.ps1
   ```

### "DISCORD_TOKEN nicht gesetzt"

**Fehlermeldung:**
```
[Error] DISCORD_TOKEN nicht gesetzt oder ungültig!
```

**Lösung:**
1. `.env` Datei prüfen: `bot\discord\.env`
2. Token aus Discord Developer Portal kopieren
3. Token format:
   ```
   DISCORD_TOKEN=paste-your-discord-bot-token-here
   ```

### Port bereits belegt

**Fehlermeldung:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Lösung:**
```powershell
# Finde den Prozess
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess

# Beende den Prozess
Stop-Process -Id <PID>

# Oder verwende einen anderen Port
.\start-backend.ps1 -Port 3001
```

### Node.js/npm nicht gefunden

**Fehlermeldung:**
```
[Error] Node.js wurde nicht gefunden!
```

**Lösung:**
1. Node.js installieren: https://nodejs.org/
2. Neues PowerShell-Fenster öffnen
3. Prüfen:
   ```powershell
   node --version
   npm --version
   ```

### npm install schlägt fehl

**Lösung:**
```powershell
# Cache leeren
npm cache clean --force

# Mit Administratorrechten
Start-Process powershell -Verb RunAs -ArgumentList "-Command cd '$PWD'; npm install"
```

### TypeScript Kompilierungsfehler

**Lösung:**
```powershell
# Im jeweiligen Verzeichnis
cd backend  # oder dashboard, bot/discord
npm run build

# Bei Fehlern:
npm install
npm run build
```

---

## 📊 Überblick: Laufende Prozesse

| Komponente | URL | Log-Datei |
|------------|-----|-----------|
| Redis | localhost:6379 | - |
| Backend API | http://localhost:3000 | Konsole |
| WebSocket | ws://localhost:8080 | Konsole |
| Dashboard | http://localhost:5173 | Konsole |
| Discord Bot | Discord Gateway | Konsole |

---

## 🛑 Alles stoppen

Drücke in jedem PowerShell-Fenster: **STRG+C**

Oder beende alle Node-Prozesse:
```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process
```

Redis stoppen (Docker):
```powershell
docker stop redis
docker rm redis
```

---

## 📝 Nützliche Befehle

### Status prüfen
```powershell
# Redis läuft?
Test-NetConnection localhost -Port 6379

# Backend läuft?
Invoke-WebRequest -Uri "http://localhost:3000/health"

# Dashboard läuft?
Invoke-WebRequest -Uri "http://localhost:5173"
```

### Logs anzeigen
```powershell
# In Echtzeit (neues Fenster)
Start-Process powershell -ArgumentList "-Command Get-Content backend\logs\app.log -Wait"
```

### Alles neu bauen
```powershell
cd backend && npm run build
cd ..\dashboard && npm run build
cd ..\bot\discord && npm run build
```

---

## 🔒 Sicherheitshinweise

1. **.env Dateien niemals committen!**
   ```gitignore
   .env
   *.env
   ```

2. **DISCORD_TOKEN niemals teilen!**
   - Bei Verdacht auf Leck: Token sofort resetten

3. **JWT_SECRET muss lang und zufällig sein**
   ```powershell
   # Zufälligen String generieren
   -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
   ```

4. **CORS Origins korrekt setzen**
   ```
   ALLOWED_ORIGINS=http://localhost:5173
   ```

---

## 💡 Tipps & Tricks

### VS Code Integration

Füge zu `.vscode/tasks.json` hinzu:
```json
{
  "label": "Start All",
  "dependsOn": ["Start Redis", "Start Backend", "Start Dashboard"],
  "group": {
    "kind": "build",
    "isDefault": true
  }
}
```

### Windows Terminal Profile

Füge zu Windows Terminal `settings.json` hinzu:
```json
{
  "name": "MediSync Backend",
  "commandline": "powershell.exe -Command cd 'D:\\Klaproth Projekte\\Stupi\\agents-platform\\scripts'; .\\start-backend.ps1 -DevMode",
  "startingDirectory": "D:\\Klaproth Projekte\\Stupi\\agents-platform\\scripts"
}
```

### Autostart-Skript

Erstelle `start-all.ps1`:
```powershell
# Starte alle Komponenten
$redis = Start-Process powershell -ArgumentList "-File .\start-redis.ps1" -PassThru
Start-Sleep 2
$backend = Start-Process powershell -ArgumentList "-File .\start-backend.ps1 -DevMode" -PassThru
Start-Sleep 5
$dashboard = Start-Process powershell -ArgumentList "-File .\start-dashboard.ps1" -PassThru

Write-Host "Alle Prozesse gestartet. IDs: $($redis.Id), $($backend.Id), $($dashboard.Id)"
```

---

## 📞 Support

Bei Problemen:
1. README.md im jeweiligen Verzeichnis prüfen
2. Logs in der Konsole lesen
3. GitHub Issues erstellen

---

**Version:** 1.0.0  
**Letzte Aktualisierung:** 08.04.2026  
**Autor:** MediSync Team
