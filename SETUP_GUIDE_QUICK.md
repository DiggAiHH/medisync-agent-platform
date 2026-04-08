# 🚀 MediSync Agenten-Plattform - Schnellstart Setup Guide

> **Dauer:** ~10 Minuten | **Schwierigkeit:** Einfach

## ✅ Setup-Status

| Komponente | Status | Aktion |
|------------|--------|--------|
| Root .env | ✅ Erstellt | Konfiguration erforderlich |
| Backend .env | ✅ Erstellt | Konfiguration erforderlich |
| Discord Bot .env | ✅ Erstellt | Konfiguration erforderlich |
| Dashboard .env | ✅ Erstellt | Bereit für Development |

---

## 🔴 KRITISCHE Variablen (MÜSSEN geändert werden)

### 1. Discord Bot Token (für Bot-Funktionalität)
**Dateien:** `Root/.env`, `backend/.env`, `bot/discord/.env`

```env
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_application_id_here
DISCORD_APPLICATION_ID=your_discord_application_id_here
```

**Wo bekommt man das?**
1. Gehe zu https://discord.com/developers/applications
2. Klicke "New Application"
3. Gehe zu "Bot" → "Reset Token" (kopiere den Token!)
4. Die Application ID findest du unter "General Information"

---

### 2. GitHub Token (für AI-Modelle)
**Dateien:** `Root/.env`, `backend/.env`

```env
GITHUB_TOKEN=ghp_your_github_token_here
```

**Wo bekommt man das?**
1. Gehe zu https://github.com/settings/tokens
2. Klicke "Generate new token (classic)"
3. Scopes: Mindestens `read:packages`
4. Token kopieren und einfügen

> 💡 **Hinweis:** GitHub Models API ist kostenlos mit Rate-Limits

---

### 3. JWT & Session Secrets (Sicherheit)
**Dateien:** `Root/.env`, `backend/.env`

```env
# Root .env
JWT_SECRET=change_this_to_a_random_string
INTERNAL_API_KEY=change_this_to_a_secure_random_key

# Backend .env
SESSION_SECRET=change_this_to_a_random_32_char_string
JWT_SECRET=change_this_to_a_different_random_32_char_string
```

**Empfohlene Generierung:**
```bash
# Linux/macOS/Git Bash
openssl rand -base64 32

# PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 } | ForEach-Object { [byte]$_ }))
```

---

## 🟡 OPTIONALE Variablen (können Defaults behalten)

### Für Development (lokale Entwicklung)

| Variable | Default | Anpassen wenn... |
|----------|---------|-------------------|
| `NODE_ENV` | `development` | ✅ Passt für Dev |
| `PORT` | `3000` | ✅ Passt, außer Port belegt |
| `WS_PORT` | `8080` | ✅ Passt, außer Port belegt |
| `VITE_PORT` | `5173` | ✅ Passt für Dashboard |
| `REDIS_URL` | `redis://localhost:6379` | ✅ Passt für lokale Redis |

### Discord Test Server (optional)
```env
DISCORD_GUILD_ID=your_test_guild_id_here
```
**Nützlich für:** Schnelle Command-Updates ohne 1h Wartezeit

**Wo finde ich die Guild ID?**
1. Discord → Einstellungen → Erweitert → Entwicklermodus aktivieren
2. Rechtsklick auf Server → "Server-ID kopieren"

---

## 🟢 BEREITS KONFIGURIERT (keine Änderung nötig)

| Variable | Wert | Kommentar |
|----------|------|-----------|
| `API_BASE_URL` | `http://localhost:3000` | ✅ Development Standard |
| `VITE_API_URL` | `http://localhost:3000` | ✅ Development Standard |
| `WEBSOCKET_URL` | `ws://localhost:8080` | ✅ Development Standard |
| `LOG_LEVEL` | `info` | ✅ Gut für Development |
| `QUEUE_NAME` | `agent-jobs` | ✅ Standard Queue |

---

## 📋 Schnell-Checkliste

```
□ Discord Bot erstellt (https://discord.com/developers/applications)
□ Discord Token kopiert → Root/.env, backend/.env, bot/discord/.env
□ Discord Application ID kopiert
□ GitHub Token erstellt (https://github.com/settings/tokens)
□ GitHub Token kopiert → Root/.env, backend/.env
□ JWT Secrets generiert und eingefügt
□ Redis läuft lokal (oder URL angepasst)
□ Discord Bot zum Test-Server hinzugefügt
```

---

## 🏃‍♂️ Nach dem Konfigurieren

### 1. Dependencies installieren
```bash
# Root
npm install

# Backend
cd backend && npm install

# Discord Bot
cd bot/discord && npm install

# Dashboard
cd dashboard && npm install
```

### 2. Redis starten
```bash
# Mit Docker
docker run -d -p 6379:6379 --name redis redis:alpine

# Oder lokale Redis-Installation
redis-server
```

### 3. Development starten
```bash
# Backend (Terminal 1)
cd backend && npm run dev

# Discord Bot (Terminal 2)
cd bot/discord && npm start

# Dashboard (Terminal 3)
cd dashboard && npm run dev
```

---

## 🆘 Troubleshooting

### "DISCORD_TOKEN invalid"
- Bot Token neu generieren unter https://discord.com/developers/applications
- Achtung: Token wird nur einmal angezeigt!

### "GitHub Models API Error"
- Token auf Gültigkeit prüfen
- Scopes überprüfen (mindestens `read:packages`)
- Rate-Limits beachten (kostenlos: 60 req/min)

### "Connection refused" zu Redis
- Redis läuft? `docker ps` oder `redis-cli ping`
- Port 6379 frei? `lsof -i :6379`

### "CORS Error" im Dashboard
- `ALLOWED_ORIGINS` in backend/.env prüfen
- `http://localhost:5173` muss enthalten sein

---

## 📚 Weitere Dokumentation

- `README.md` - Hauptdokumentation
- `ARCHITECTURE.md` - Systemarchitektur
- `DEPLOYMENT.md` - Produktions-Deployment

---

**Letzte Aktualisierung:** 2026-04-08
