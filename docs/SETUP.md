# ⚙️ MediSync Setup-Guide

> Schritt-für-Schritt Anleitung zur Installation und Konfiguration der MediSync Agenten-Plattform.

---

## 📋 Inhaltsverzeichnis

- [Voraussetzungen](#-voraussetzungen)
- [Schnellstart](#-schnellstart)
- [GitHub Codespaces](#-github-codespaces)
- [Lokale Installation](#-lokale-installation)
- [Docker Deployment](#-docker-deployment)
- [Environment-Variablen](#-environment-variablen)
- [Discord Bot Setup](#-discord-bot-setup)
- [GitHub Models Token](#-github-models-token)
- [Cloudflare Tunnel](#-cloudflare-tunnel)
- [VS Code Extension](#-vs-code-extension)

---

## ✅ Voraussetzungen

### Minimalanforderungen

| Komponente | Version | Bemerkung |
|------------|---------|-----------|
| Node.js | 18.x+ | Empfohlen: 20.x LTS |
| npm | 9.x+ | Oder yarn 1.22+ |
| Redis | 6.x+ | Für Queue und Cache |
| Git | 2.x+ | Für Repository |

### Für GitHub Codespaces

- GitHub Account (kostenlos)
- Optional: GitHub Pro für erweiterte Features

### Für lokale Entwicklung

| Komponente | Zweck |
|------------|-------|
| VS Code | IDE mit Extensions |
| Docker Desktop | Für Container-Entwicklung |
| GitHub CLI | Für GitHub Models Auth |

---

## 🚀 Schnellstart

### Option 1: GitHub Codespaces (Empfohlen ⭐)

```bash
# 1. Klicken Sie auf den Badge:
# [![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)]

# 2. Warten Sie auf das Setup (ca. 2-3 Minuten)

# 3. Services starten
npm run dev

# 4. Status prüfen
bash scripts/status.sh
```

**Vorteile:**
- ✅ Keine lokale Installation
- ✅ Konsistente Umgebung
- ✅ Automatisches Setup
- ✅ Persistente URLs verfügbar

---

## 🐙 GitHub Codespaces

### Einrichtung

#### Schritt 1: Repository öffnen

1. Gehen Sie zu Ihrem GitHub Repository
2. Klicken Sie auf **Code** → **Codespaces** → **Create codespace**

#### Schritt 2: Secrets konfigurieren

```bash
# In der Codespace-Konsole:
# Secrets werden automatisch aus Ihren GitHub Secrets geladen

# Prüfen:
echo $GITHUB_TOKEN
echo $DISCORD_TOKEN
```

#### Schritt 3: Manuelles Setup (falls nötig)

```bash
# Setup-Script ausführen
bash .devcontainer/postCreateCommand.sh

# Services starten
npm run dev:all
```

### Port-Weiterleitung

| Port | Service | Öffentlicher Zugriff |
|------|---------|---------------------|
| 3000 | API | Via Cloudflare Tunnel |
| 8080 | WebSocket | Via Cloudflare Tunnel |
| 5173 | Dashboard | Via Cloudflare Tunnel |
| 8443 | code-server | Via Cloudflare Tunnel |
| 6379 | Redis | Nur lokal |

---

## 💻 Lokale Installation

### Schritt 1: Repository klonen

```bash
# Mit HTTPS
git clone https://github.com/ihr-username/medisync-agents.git

# Mit SSH
git clone git@github.com:ihr-username/medisync-agents.git

cd medisync-agents
```

### Schritt 2: Dependencies installieren

```bash
# Alle Services
npm run install:all

# Oder einzeln:
cd backend && npm install
cd ../bot/discord && npm install
cd ../dashboard && npm install
```

### Schritt 3: Environment-Dateien kopieren

```bash
# Backend
cp backend/.env.example backend/.env

# Discord Bot
cp bot/discord/.env.example bot/discord/.env

# Dashboard
cp dashboard/.env.example dashboard/.env
```

### Schritt 4: Environment konfigurieren

```bash
# Editor öffnen
nano backend/.env
```

Siehe [Environment-Variablen](#-environment-variablen) für Details.

### Schritt 5: Redis starten

```bash
# Mit Docker
docker run -d -p 6379:6379 --name redis redis:7-alpine

# Oder lokal installiert
redis-server
```

### Schritt 6: Services starten

```bash
# Alle Services
npm run dev:all

# Oder einzeln in separaten Terminals:
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Discord Bot
cd bot/discord && npm run dev

# Terminal 3: Dashboard
cd dashboard && npm run dev
```

---

## 🐳 Docker Deployment

### Mit Docker Compose

```bash
# Alle Services starten
docker-compose up -d

# Logs anzeigen
docker-compose logs -f

# Services stoppen
docker-compose down
```

### Einzelne Services

```bash
# Nur Backend und Redis
docker-compose up -d backend redis

# Discord Bot hinzufügen
docker-compose up -d discord-bot

# Dashboard hinzufügen
docker-compose up -d dashboard
```

### Produktions-Deployment

```bash
# Build
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

# Start
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## 🔧 Environment-Variablen

### Backend (`backend/.env`)

```env
# ============================================
# Server Konfiguration
# ============================================
PORT=3000
WS_PORT=8080
NODE_ENV=development

# ============================================
# Redis Konfiguration
# ============================================
REDIS_URL=redis://localhost:6379

# Optional: Mit Authentifizierung
# REDIS_URL=redis://username:password@localhost:6379

# ============================================
# Queue Konfiguration
# ============================================
QUEUE_NAME=agent-jobs

# ============================================
# Logging
# ============================================
LOG_LEVEL=info

# ============================================
# CORS (Produktion)
# ============================================
# ALLOWED_ORIGINS=https://ihrefirma.de,https://app.ihrefirma.de
```

### Discord Bot (`bot/discord/.env`)

```env
# ============================================
# Discord Bot Token
# ============================================
# Holen Sie sich den Token vom Discord Developer Portal:
# https://discord.com/developers/applications
DISCORD_TOKEN=ihr-discord-bot-token-hier

# ============================================
# API Verbindung
# ============================================
# Lokal
API_URL=http://localhost:3000
WS_URL=ws://localhost:8080

# Mit Cloudflare Tunnel
# API_URL=https://api.ihrefirma.de
# WS_URL=wss://ws.ihrefirma.de

# ============================================
# Bot Konfiguration
# ============================================
COMMAND_PREFIX=!
DEFAULT_MODEL=gpt-4o
MAX_PROMPT_LENGTH=4000

# ============================================
# Rate Limiting
# ============================================
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=10
```

### Dashboard (`dashboard/.env`)

```env
# ============================================
# API URLs
# ============================================
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:8080

# Mit Cloudflare Tunnel
# VITE_API_URL=https://api.ihrefirma.de
# VITE_WS_URL=wss://ws.ihrefirma.de

# ============================================
# Feature Flags
# ============================================
VITE_ENABLE_STREAMING=true
VITE_ENABLE_ANALYTICS=false
```

---

## 🤖 Discord Bot Setup

### Schritt 1: Application erstellen

1. Gehen Sie zum [Discord Developer Portal](https://discord.com/developers/applications)
2. Klicken Sie **New Application**
3. Geben Sie einen Namen ein (z.B. "MediSync Agent")
4. Akzeptieren Sie die Terms of Service

### Schritt 2: Bot konfigurieren

1. Klicken Sie im Menü auf **Bot**
2. Klicken Sie **Add Bot**
3. Konfigurieren Sie:
   - **Username**: MediSync Agent
   - **Icon**: Ihr Logo hochladen
   - **Public Bot**: Deaktivieren (nur für Ihren Server)
   - **Presence**: Online

### Schritt 3: Intents aktivieren

Aktivieren Sie folgende Privileged Gateway Intents:

- ✅ **MESSAGE CONTENT INTENT** (für Nachrichteninhalte)

### Schritt 4: Token kopieren

1. Klicken Sie **Reset Token**
2. Kopieren Sie den neuen Token
3. Fügen Sie ihn in `bot/discord/.env` ein:

```env
DISCORD_TOKEN=paste-your-discord-bot-token-here
```

⚠️ **Wichtig**: Teilen Sie den Token niemals öffentlich!

### Schritt 5: Bot einladen

1. Gehen Sie zu **OAuth2** → **URL Generator**
2. Wählen Sie folgende Scopes:
   - ✅ `bot`
   - ✅ `applications.commands`
3. Wählen Sie folgende Bot Permissions:
   - ✅ Send Messages
   - ✅ Read Message History
   - ✅ Use Slash Commands
   - ✅ Embed Links
   - ✅ Attach Files
4. Kopieren Sie die generierte URL
5. Öffnen Sie die URL im Browser
6. Wählen Sie Ihren Server aus

### Schritt 6: Commands deployen

```bash
cd bot/discord
npm run build
npm run deploy-commands
```

---

## 🔑 GitHub Models Token

### Option 1: GitHub Personal Access Token

1. Gehen Sie zu [GitHub Settings](https://github.com/settings/tokens)
2. Klicken Sie **Generate new token (classic)**
3. Wählen Sie folgende Scopes:
   - ✅ `read:packages` (für GitHub Models)
   - ✅ `models:read` (für Model Access)
4. Klicken Sie **Generate token**
5. Kopieren Sie den Token

### Option 2: GitHub CLI (Empfohlen)

```bash
# GitHub CLI installieren (falls nicht vorhanden)
# https://cli.github.com/

# Einloggen
gh auth login

# Token anzeigen
gh auth token
```

### Token konfigurieren

```bash
# Als Environment Variable
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# Oder in .env Datei
echo "GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx" >> backend/.env
```

### Token testen

```bash
# Mit curl
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://models.github.ai/inference/chat/completions \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'
```

---

## 🌥️ Cloudflare Tunnel

### Option 1: Temporäre URLs (Schnell)

```bash
# Alle Services tunneln
bash scripts/temp-tunnel.sh --all

# Ausgabe:
# ✓ API: https://abc123.trycloudflare.com
# ✓ WebSocket: https://def456.trycloudflare.com
# ✓ Dashboard: https://ghi789.trycloudflare.com
```

### Option 2: Persistente URLs

#### Schritt 1: Domain einrichten

1. Registrieren Sie eine Domain bei [Cloudflare](https://dash.cloudflare.com)
2. Fügen Sie Ihre Domain hinzu
3. Ändern Sie die Nameserver bei Ihrem Registrar

#### Schritt 2: Tunnel erstellen

```bash
bash scripts/setup-tunnel.sh
```

Folgen Sie den interaktiven Eingaben:
- Tunnel-Name: `medisync-agents`
- Domain: `ihrefirma.de`

#### Schritt 3: Token speichern

1. Gehen Sie zum [Cloudflare Dashboard](https://dash.cloudflare.com)
2. **Zero Trust** → **Access** → **Tunnels**
3. Wählen Sie Ihren Tunnel
4. Kopieren Sie das Token (beginnt mit `eyJ...`)
5. Speichern Sie es als GitHub Secret:
   - Name: `CF_TUNNEL_TOKEN`
   - Wert: Ihr Token

#### Schritt 4: Tunnel starten

```bash
# In GitHub Codespaces (automatisch)
bash .devcontainer/cloudflared/start.sh

# Oder manuell
cloudflared tunnel run --token $CF_TUNNEL_TOKEN
```

### DNS-Konfiguration

| Subdomain | Service | Port |
|-----------|---------|------|
| `api.ihrefirma.de` | Backend API | 3000 |
| `ws.ihrefirma.de` | WebSocket | 8080 |
| `dashboard.ihrefirma.de` | Dashboard | 5173 |
| `code.ihrefirma.de` | code-server | 8443 |

---

## 📝 VS Code Extension

### Installation

```bash
# Im code-server
cd code-server/extensions/medical-ai-extension
npm install
npm run compile
```

### Konfiguration

```bash
# Extension Settings in VS Code
# Öffnen Sie die Settings (Ctrl+,)
# Suchen Sie nach "medicalAi"
```

### Wichtige Einstellungen

```json
{
  "medicalAi.ollamaEndpoint": "http://localhost:11434",
  "medicalAi.modelName": "llama3.2",
  "medicalAi.enableStreaming": true
}
```

---

## ✅ Verifizierung

### Health Checks

```bash
# API Status
curl http://localhost:3000/health

# Detaillierter Status
curl http://localhost:3000/health/detailed

# Redis Verbindung
curl http://localhost:3000/health/redis

# Queue Status
curl http://localhost:3000/health/queue
```

### Test-Job erstellen

```bash
# API Test
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Testanfrage",
    "userId": "test-user",
    "sessionId": "test-session"
  }'
```

### Discord Test

```
# In Discord eingeben:
/agent prompt:Test
```

---

## 🐛 Häufige Probleme

Siehe [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) für detaillierte Lösungen.

| Problem | Schnelle Lösung |
|---------|----------------|
| Redis Connection Error | `docker run -d -p 6379:6379 redis:7-alpine` |
| Port already in use | `lsof -ti:3000 \| xargs kill -9` |
| Discord Bot offline | Token prüfen, Intents überprüfen |
| API 401 Unauthorized | GitHub Token prüfen |

---

<div align="center">

**[⬆️ Nach oben](#-medisync-setup-guide)**

</div>
