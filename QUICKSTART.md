# ⚡ Quick Start Guide

## 1-Minute Setup (GitHub Codespaces)

```bash
# 1. Öffne in Codespaces
# GitHub → Repository → <> Code → Codespaces → Create

# 2. Warte 2-3 Minuten (automatischer Build)

# 3. Starte Services
make start

# 4. Fertig! 🎉
```

## 5-Minute Setup (Lokal)

### Voraussetzungen
- Node.js 18+
- npm 9+

### Installation

```bash
# 1. Repository klonen
git clone https://github.com/USERNAME/medisync-agent-platform.git
cd medisync-agent-platform

# 2. Alle Dependencies installieren
make install

# 3. Build
make build

# 4. Starte (ohne Redis - verwendet In-Memory)
USE_MEMORY_QUEUE=true make start

# 5. Öffne Dashboard
open http://localhost:5173
```

## Verfügbare URLs

| Service | URL | Beschreibung |
|---------|-----|--------------|
| API | http://localhost:3000 | REST API |
| Health | http://localhost:3000/health | Status Check |
| Dashboard | http://localhost:5173 | Web UI |
| WebSocket | ws://localhost:8080 | Real-time |

## Discord Bot Setup

```bash
# 1. Token in .env eintragen
cd bot/discord
cp .env.example .env
# DISCORD_TOKEN=dein_token_hier

# 2. Commands deployen
npm run deploy

# 3. Bot starten
npm start
```

## Schnelltest

```bash
# Health Check
curl http://localhost:3000/health

# Job erstellen
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hallo","userId":"test"}'
```

## Hilfe

```bash
make help        # Alle Befehle anzeigen
make status      # Status aller Services
make test        # Tests ausführen
make logs        # Logs anzeigen
make stop        # Alle Services stoppen
```

## Troubleshooting

| Problem | Lösung |
|---------|--------|
| Port belegt | `make stop` dann `make start` |
| Build fehler | `make clean && make build` |
| Redis nicht verbunden | `USE_MEMORY_QUEUE=true` verwenden |
