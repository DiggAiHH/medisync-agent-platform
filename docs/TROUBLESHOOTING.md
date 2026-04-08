# 🔧 MediSync Troubleshooting-Guide

> Häufige Probleme, Lösungen und Debugging-Techniken für die MediSync Agenten-Plattform.

---

## 📋 Inhaltsverzeichnis

- [Schnelle Lösungen](#-schnelle-lösungen)
- [Backend-Probleme](#-backend-probleme)
- [Discord Bot](#-discord-bot)
- [Dashboard](#-dashboard)
- [Redis & Queue](#-redis--queue)
- [WebSocket](#-websocket)
- [Cloudflare Tunnel](#-cloudflare-tunnel)
- [Debug-Techniken](#-debug-techniken)
- [Support](#-support)

---

## ⚡ Schnelle Lösungen

| Problem | Schnelllösung |
|---------|--------------|
| Service startet nicht | `docker-compose restart` |
| Port bereits belegt | `lsof -ti:3000 \| xargs kill -9` |
| Redis Connection Error | `docker run -d -p 6379:6379 redis:7-alpine` |
| Discord Bot offline | Token prüfen, Intents überprüfen |
| API 401 Unauthorized | GitHub Token prüfen |
| WebSocket trennt | Cloudflare WebSockets ON prüfen |

---

## 🔙 Backend-Probleme

### Server startet nicht

#### Symptom
```
Error: listen EADDRINUSE: address already in use :::3000
```

#### Lösung
```bash
# Prozess finden und beenden
lsof -ti:3000 | xargs kill -9

# Oder alternativen Port verwenden
PORT=3001 npm run dev
```

### Redis Connection Error

#### Symptom
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

#### Lösung
```bash
# Redis mit Docker starten
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Oder Redis-Status prüfen
docker ps | grep redis

# Redis-Logs
docker logs redis

# Redis-Verbindung testen
docker exec -it redis redis-cli ping
# Erwartet: PONG
```

### GitHub Models API Error

#### Symptom
```
Error: 401 Unauthorized - Invalid GitHub token
```

#### Lösung
```bash
# 1. Token prüfen
echo $GITHUB_TOKEN

# 2. Token testen
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://models.github.ai/inference/models

# 3. Token neu setzen
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxx

# 4. In .env speichern
echo "GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxx" >> backend/.env
```

### Rate Limit überschritten

#### Symptom
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "retryAfter": 60
}
```

#### Lösung
```bash
# Rate Limit Status prüfen
curl http://localhost:3000/api/ratelimit/user-123

# Warten oder Limits erhöhen (in Redis)
docker exec -it redis redis-cli
DEL ratelimit:user-123:minute
DEL ratelimit:user-123:hour
```

### Budget überschritten

#### Symptom
```json
{
  "success": false,
  "error": "Daily budget exceeded",
  "code": "BUDGET_EXCEEDED"
}
```

#### Lösung
```bash
# Budget erhöhen
curl -X PUT http://localhost:3000/api/budget/user-123 \
  -H "Content-Type: application/json" \
  -d '{"dailyLimit": 10.00, "currency": "USD"}'

# Oder Budget-Tracking reset (Entwicklung)
docker exec -it redis redis-cli DEL budget:user-123:daily
```

---

## 🤖 Discord Bot

### Bot antwortet nicht

#### Checkliste
```bash
# 1. Token prüfen
cd bot/discord && cat .env | grep DISCORD_TOKEN

# 2. Intents überprüfen
# Discord Developer Portal -> Bot -> Privileged Gateway Intents
# - MESSAGE CONTENT INTENT muss aktiviert sein

# 3. Commands deployen
npm run deploy-commands

# 4. Logs prüfen
npm run dev
```

### Commands werden nicht angezeigt

#### Lösung
```bash
# Commands neu deployen
cd bot/discord
npm run build
npm run deploy-commands

# Global Commands können bis zu 1 Stunde dauern
# Für sofortige Updates (Guild-Only):
# In deployCommands.ts: 
# .setDefaultMemberPermissions(...) verwenden
```

### WebSocket-Verbindung zum Backend fehlgeschlagen

#### Symptom
```
[Bot] WebSocket connection failed: Error: connect ECONNREFUSED
```

#### Lösung
```bash
# API-URL prüfen
cat bot/discord/.env | grep API_URL

# Backend erreichbar?
curl http://localhost:3000/health

# In .env korrigieren:
# API_URL=http://localhost:3000  # Lokal
# API_URL=https://api.ihrefirma.de  # Mit Tunnel
```

---

## 🖥️ Dashboard

### Leere Seite / White Screen

#### Lösung
```bash
# 1. Build-Fehler prüfen
cd dashboard && npm run build

# 2. API-URL prüfen
cat dashboard/.env | grep VITE_API_URL

# 3. Browser-Konsole öffnen (F12)
# Fehlermeldungen prüfen

# 4. CORS prüfen
# backend/.env: ALLOWED_ORIGINS muss Dashboard-URL enthalten
```

### API-Requests schlagen fehl

#### Lösung
```bash
# Netzwerk-Tab im Browser prüfen

# CORS-Headers prüfen
curl -I -X OPTIONS http://localhost:3000/api/jobs \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST"

# In backend/.env (Entwicklung):
# NODE_ENV=development  # Erlaubt alle Origins
```

---

## 🗄️ Redis & Queue

### Jobs bleiben in pending

#### Symptom
Jobs werden erstellt aber nicht verarbeitet.

#### Lösung
```bash
# Worker läuft?
ps aux | grep agentWorker

# Queue-Status prüfen
docker exec -it redis redis-cli
LLEN bull:agent-jobs:wait

# Worker manuell starten
cd backend && npm run worker

# Oder mit Docker
docker-compose up -d worker
```

### Jobs failed wiederholt

#### Lösung
```bash
# Job-Details prüfen
curl http://localhost:3000/api/jobs/[job-id]

# Failed Jobs anzeigen
curl "http://localhost:3000/api/jobs?status=failed"

# Job retry
curl -X POST http://localhost:3000/api/jobs/[job-id]/retry
```

### Redis-Speicher voll

#### Lösung
```bash
# Speicher-Usage prüfen
docker exec -it redis redis-cli INFO memory

# Alte Jobs bereinigen
docker exec -it redis redis-cli
# Alle Keys anzeigen
KEYS bull:agent-jobs:*

# Alte completed Jobs löschen (Vorsicht!)
DEL bull:agent-jobs:completed
```

---

## 🔌 WebSocket

### Verbindung wird sofort getrennt

#### Symptom
```javascript
WebSocket connection to 'ws://localhost:8080/' failed
```

#### Lösung
```bash
# WebSocket-Server läuft?
curl http://localhost:3000/health
# Sollte WS-Info enthalten

# Port prüfen
lsof -i :8080

# Firewall (Server)
sudo ufw allow 8080

# Cloudflare Tunnel: WebSockets ON
# Dashboard -> Network -> WebSockets
```

### Keine Echtzeit-Updates

#### Lösung
```bash
# Browser-Konsole prüfen
# Network -> WS Tab

# Server-Logs prüfen
docker-compose logs -f backend | grep WebSocket

# Test mit websocat
websocat ws://localhost:8080
# Dann: {"type":"ping"}
```

---

## 🌥️ Cloudflare Tunnel

### Tunnel startet nicht

#### Symptom
```
ERR Tunnel token not found
```

#### Lösung
```bash
# Token prüfen
echo $CF_TUNNEL_TOKEN

# GitHub Secret prüfen (Codespaces)
# Settings -> Codespaces -> Secrets

# Manuell starten
cloudflared tunnel run --token $CF_TUNNEL_TOKEN
```

### DNS nicht auflösbar

#### Symptom
```
ERR_NAME_NOT_RESOLVED for api.ihrefirma.de
```

#### Lösung
```bash
# DNS-Propagation prüfen
dig api.ihrefirma.de

# 5-10 Minuten warten nach DNS-Änderung

# Cloudflare Dashboard prüfen
# DNS -> CNAME Einträge müssen orange sein (Proxied)
```

### HTTPS-Fehler

#### Lösung
```bash
# SSL/TLS Mode prüfen
# Cloudflare Dashboard -> SSL/TLS -> Overview
# Muss "Full (strict)" sein

# Always Use HTTPS: ON
# Automatic HTTPS Rewrites: ON
```

---

## 🐛 Debug-Techniken

### Log-Level erhöhen

```bash
# Backend
LOG_LEVEL=debug npm run dev

# Discord Bot
DEBUG=* npm run dev

# Dashboard
# Browser-Konsole: localStorage.debug = '*'
```

### Netzwerk-Debugging

```bash
# API-Requests sniffen
curl -v http://localhost:3000/api/jobs

# Mit httpie (bessere Ausgabe)
http :3000/api/jobs

# WebSocket-Test
websocat ws://localhost:8080
wscat -c ws://localhost:8080
```

### Redis-Debugging

```bash
# Redis CLI
docker exec -it redis redis-cli

# Nützliche Commands:
MONITOR                 # Alle Operationen anzeigen
KEYS *                  # Alle Keys
GET bull:agent-jobs:id  # Spezifischen Job
INFO                    # Server-Info
SLOWLOG GET             # Langsame Queries
```

### Container-Debugging

```bash
# In Container einsteigen
docker-compose exec backend /bin/sh

# Prozesse anzeigen
docker-compose exec backend ps aux

# Netzwerk-Tests
docker-compose exec backend ping redis
docker-compose exec backend wget -O- http://localhost:3000/health
```

---

## 📞 Support

### Selbsthilfe-Ressourcen

| Ressource | URL |
|-----------|-----|
| Dokumentation | [docs/](./) |
| API Docs | [docs/API.md](./API.md) |
| Architektur | [docs/ARCHITECTURE.md](./ARCHITECTURE.md) |
| Setup Guide | [docs/SETUP.md](./SETUP.md) |

### Fehler melden

```bash
# System-Info sammeln
bash scripts/status.sh > debug-info.txt
docker-compose logs >> debug-info.txt
cat backend/.env | grep -v TOKEN >> debug-info.txt

# GitHub Issue erstellen mit:
# - Beschreibung des Problems
# - Schritte zur Reproduktion
# - Erwartetes vs. tatsächliches Verhalten
# - debug-info.txt (sensible Daten entfernen!)
```

### Kontakt

| Kanal | Details |
|-------|---------|
| 📧 Email | support@medisync.example |
| 💬 Discord | [Discord Server](https://discord.gg/medisync) |
| 🐛 Issues | [GitHub Issues](https://github.com/ihr-username/medisync-agents/issues) |

---

## 📝 Checkliste: Vor dem Fragen

- [ ] Alle Services laufen (`bash scripts/status.sh`)
- [ ] Logs auf Fehler geprüft
- [ ] Environment-Variablen korrekt gesetzt
- [ ] Ports nicht blockiert
- [ ] Token gültig und nicht abgelaufen
- [ ] README und Docs gelesen
- [ ] GitHub Issues nach ähnlichen Problemen durchsucht

---

<div align="center">

**[⬆️ Nach oben](#-medisync-troubleshooting-guide)**

</div>
