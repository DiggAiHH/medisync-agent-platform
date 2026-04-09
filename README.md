# MediSync Agenten-Plattform 🏥🤖

Eine vollständige Multi-Agent Platform für medizinische KI-Anwendungen mit Discord Bot, Dashboard und API.

Live-Demo: https://diggaihh.github.io/medisync-agent-platform/
Repository: https://github.com/DiggAiHH/medisync-agent-platform

Hinweis: Die öffentliche GitHub-Pages-Bereitstellung zeigt das Dashboard im Demo-Modus mit Beispieldaten.

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Redis](https://img.shields.io/badge/Redis-7+-red.svg)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-ready-blue.svg)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## ✨ Features

- **🎮 Discord Bot** - Interagiere mit KI-Agenten direkt in Discord
- **📊 Dashboard** - Web-Interface zur Verwaltung und Überwachung
- **⚡ REST API** - Vollständige API für Integrationen
- **🔌 WebSocket** - Echtzeit-Streaming von Agent-Antworten
- **📦 Queue System** - BullMQ mit Redis für zuverlässige Job-Verarbeitung
- **📈 Monitoring** - Prometheus-Metriken und Grafana-Dashboards
- **🔄 Dead Letter Queue** - Automatische Fehlerbehandlung
- **🛡️ Circuit Breaker** - Error Recovery im Bot
- **🐳 Docker Ready** - One-Command Deployment

---

## 🚀 Schnellstart

### One-Line Installation

```bash
curl -fsSL https://raw.githubusercontent.com/DiggAiHH/medisync-agent-platform/master/scripts/install.sh | bash
```

Oder manuell:

```bash
# Repository klonen
git clone https://github.com/DiggAiHH/medisync-agent-platform.git
cd medisync-agent-platform

# Installation
make install

# Konfiguration anpassen
cp .env.example .env
nano .env

# Starten
make start
```

### ⚡ 5-Minuten Quickstart

Neu hier? Starte mit unserem **[5-Minuten Quickstart](QUICKSTART.md)** für sofortige Ergebnisse!

---

## 🪟 Quick Start für Windows

### Voraussetzungen

- Windows 10 (21H2+) oder Windows 11
- PowerShell 5.1 oder höher (7.x empfohlen)
- [Node.js 18+](https://nodejs.org/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop)

### PowerShell Installation

```powershell
# 1. Repository klonen
git clone https://github.com/DiggAiHH/medisync-agent-platform.git
cd medisync-agent-platform

# 2. Environment kopieren
Copy-Item .env.example .env

# 3. Dependencies installieren
npm run install:all

# 4. Mit Docker starten
docker-compose up -d

# 5. Status prüfen
Invoke-RestMethod -Uri "http://localhost:3000/health" | ConvertTo-Json
```

### PowerShell Beispiele

```powershell
# Services starten
docker-compose up -d

# Logs anzeigen
docker-compose logs -f

# API testen
Invoke-RestMethod -Uri "http://localhost:3000/health"

# Dashboard öffnen
Start-Process "http://localhost:5173"

# Services stoppen
docker-compose down

# Mit Make (Git Bash erforderlich)
make start
make stop
make logs
```

**Detaillierte Windows-Anleitung:** [WINDOWS_SETUP.md](WINDOWS_SETUP.md)

---

## 📸 Screenshots

<!-- TODO: Screenshots einfügen -->

| Dashboard | Job-Übersicht | Echtzeit-Logs |
|-----------|---------------|---------------|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Jobs](docs/screenshots/jobs.png) | ![Logs](docs/screenshots/logs.png) |

*Screenshots werden vor dem Launch hinzugefügt*

---

## 📁 Projektstruktur

```
medisync/
├── backend/              # Express API + WebSocket
│   ├── src/
│   │   ├── ai/          # GitHub Models Integration
│   │   ├── queue/       # BullMQ Queue
│   │   ├── routes/      # API Endpoints
│   │   ├── worker/      # Job Worker
│   │   └── websocket/   # WebSocket Server
│   ├── package.json
│   └── Dockerfile
├── bot/
│   └── discord/         # Discord Bot
│       ├── src/
│       │   ├── commands/
│       │   └── handlers/
│       ├── package.json
│       └── Dockerfile
├── dashboard/           # React Dashboard
│   ├── src/
│   ├── package.json
│   └── Dockerfile
├── scripts/            # Hilfsscripts
│   ├── install.sh
│   ├── deploy.sh
│   └── health-check.sh
├── docker-compose.yml  # Alle Services
├── Makefile           # Kurzbefehle
└── README.md
```

---

## 📚 Dokumentation

| Dokument | Beschreibung | Zielgruppe |
|----------|--------------|------------|
| **[QUICKSTART.md](QUICKSTART.md)** | 5-Minuten Setup | Erstbenutzer |
| **[WINDOWS_SETUP.md](WINDOWS_SETUP.md)** | Windows-spezifische Anleitung | Windows-User |
| **[SETUP_GUIDE_QUICK.md](SETUP_GUIDE_QUICK.md)** | Detailliertes Setup | Alle Entwickler |
| **[LAUNCH_READINESS.md](LAUNCH_READINESS.md)** | Launch-Status & Checklisten | DevOps |
| **[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)** | Architektur-Doku | Entwickler |

---

## 🛠️ Entwicklung

### Lokale Entwicklung

```bash
# Alle Services im Dev Modus starten
make dev-all

# Oder einzeln:
make dev-backend   # Backend (Port 3000)
make dev-bot       # Bot
make dev-dashboard # Dashboard (Port 5173)
```

### Docker Entwicklung

```bash
# Bauen und starten
docker-compose up --build

# Mit Monitoring Stack
docker-compose --profile monitoring up
```

---

## 🌐 Endpunkte

| Service | URL | Beschreibung |
|---------|-----|--------------|
| API | http://localhost:3000 | REST API |
| WebSocket | ws://localhost:8080 | Realtime Streaming |
| Dashboard | http://localhost:5173 | Web Interface |
| Redis | redis://localhost:6379 | Message Queue |
| Prometheus | http://localhost:9090 | Metriken |
| Grafana | http://localhost:3001 | Dashboards |

### Health Endpoints

```bash
GET /health           # Basis Health Check
GET /health/detailed  # Detaillierter Status
GET /health/ready     # Kubernetes Ready
GET /health/live      # Kubernetes Live
```

---

## 📦 API Dokumentation

### Jobs API

```bash
# Job erstellen
POST /api/jobs
{
  "userId": "user-123",
  "sessionId": "session-456",
  "prompt": "Analysiere diesen Text..."
}

# Job Status abrufen
GET /api/jobs/:id

# Alle Jobs abrufen
GET /api/jobs

# Statistiken
GET /api/stats
```

---

## 🤖 Discord Bot Commands

| Command | Beschreibung |
|---------|--------------|
| `/agent <prompt>` | Starte einen Agent-Job |
| `/status <jobId>` | Zeige Job-Status |
| `/help` | Hilfe anzeigen |

---

## 🧪 Tests

```bash
# Alle Tests ausführen
make test

# Mit Coverage
npm run test:coverage
```

---

## 📦 Deployment

### GitHub Codespaces

```bash
# Automatisches Deployment
./scripts/deploy.sh codespaces
```

URLs werden automatisch konfiguriert.

### Production

```bash
# Production Build
make build

# Production Deployment
make deploy

# Oder mit Docker:
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## 📊 Monitoring

### Prometheus Metriken

- `http_requests_total` - HTTP Requests
- `http_request_duration_seconds` - Response Zeit
- `queue_jobs_total` - Jobs pro Status
- `worker_jobs_processed` - Verarbeitete Jobs

### Health Checks

```bash
# Alle Services prüfen
make health

# Oder:
./scripts/health-check.sh
```

---

## ⚙️ Konfiguration

### Umgebungsvariablen

Siehe `.env.example` für alle verfügbaren Optionen.

**Wichtigste Variablen:**

| Variable | Beschreibung | Default |
|----------|--------------|---------|
| `DISCORD_TOKEN` | Discord Bot Token | - |
| `REDIS_URL` | Redis Verbindung | `redis://localhost:6379` |
| `API_BASE_URL` | Backend URL | `http://localhost:3000` |
| `WORKER_CONCURRENCY` | Parallele Jobs | `5` |

---

## 🐳 Docker Services

```bash
# Starten
make start

# Stoppen
make stop

# Logs anzeigen
make logs

# Neustarten
make restart

# Vollständig bereinigen
make clean
```

---

## 🛡️ Sicherheit

- Non-root Container
- Secrets via Environment Variables
- CORS konfigurierbar
- Rate Limiting
- Circuit Breaker für API Calls

Siehe [SECURITY.md](SECURITY.md) und [LAUNCH_READINESS.md](LAUNCH_READINESS.md) für Details.

---

## 🤝 Contributing

1. Fork erstellen
2. Feature Branch: `git checkout -b feature/xyz`
3. Commits: `git commit -m 'Add xyz'`
4. Push: `git push origin feature/xyz`
5. Pull Request erstellen

Siehe [CONTRIBUTING.md](CONTRIBUTING.md) für Details.

---

## 📝 Lizenz

MIT License - siehe [LICENSE](LICENSE)

---

## 🙏 Credits

- [BullMQ](https://bullmq.io/) - Queue System
- [Discord.js](https://discord.js.org/) - Discord Integration
- [Express](https://expressjs.com/) - Web Framework
- [Redis](https://redis.io/) - Data Store

---

## 📞 Support

| Ressource | Link |
|-----------|------|
| 📖 Dokumentation | `./docs/` |
| 🚀 Quickstart | [QUICKSTART.md](QUICKSTART.md) |
| 🪟 Windows Hilfe | [WINDOWS_SETUP.md](WINDOWS_SETUP.md) |
| 📋 Launch Status | [LAUNCH_READINESS.md](LAUNCH_READINESS.md) |
| 🌐 Live Demo | https://diggaihh.github.io/medisync-agent-platform/ |
| 🐙 Öffentliches Repository | https://github.com/DiggAiHH/medisync-agent-platform |

---

**One-Line Start:**
```bash
curl -fsSL https://raw.githubusercontent.com/DiggAiHH/medisync-agent-platform/master/scripts/install.sh | bash && make start
```

**Windows PowerShell:**
```powershell
git clone https://github.com/DiggAiHH/medisync-agent-platform.git; cd medisync-agent-platform; Copy-Item .env.example .env; npm run install:all; docker-compose up -d
```

**Project bereit für Launch! 🚀**
