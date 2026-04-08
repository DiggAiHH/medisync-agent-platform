# MediSync Agenten-Plattform - Projektstruktur

## 📁 Verzeichnisstruktur

```
medisync/
├── 📁 backend/                      # Express API + WebSocket Server
│   ├── 📁 src/
│   │   ├── 📁 ai/                   # GitHub Models Integration
│   │   │   ├── githubModelsClient.ts
│   │   │   ├── modelRouter.ts
│   │   │   ├── streamingHandler.ts
│   │   │   ├── tokenTracker.ts
│   │   │   └── types.ts
│   │   ├── 📁 middleware/           # Express Middleware
│   │   │   └── usageMiddleware.ts
│   │   ├── 📁 queue/                # BullMQ Queue
│   │   │   └── agentQueue.ts
│   │   ├── 📁 routes/               # API Endpoints
│   │   │   ├── health.ts
│   │   │   ├── jobs.ts
│   │   │   └── stats.ts
│   │   ├── 📁 services/             # Business Logic
│   │   │   └── billingService.ts
│   │   ├── 📁 types/                # TypeScript Types
│   │   │   └── index.ts
│   │   ├── 📁 utils/                # Utilities
│   │   │   └── metrics.ts
│   │   ├── 📁 websocket/            # WebSocket Server
│   │   │   └── streaming.ts
│   │   ├── 📁 worker/               # Job Worker
│   │   │   ├── agentWorker.ts
│   │   │   ├── dlqHandler.ts
│   │   │   └── index.ts
│   │   └── server.ts                # Main Entry Point
│   ├── 📄 .env.example
│   ├── 📄 Dockerfile
│   ├── 📄 Dockerfile.worker
│   ├── 📄 Dockerfile.dlq
│   ├── 📄 package.json
│   └── 📄 tsconfig.json
│
├── 📁 bot/                          # Bot Services
│   └── 📁 discord/                  # Discord Bot
│       ├── 📁 src/
│       │   ├── 📁 commands/         # Slash Commands
│       │   │   └── agentCommand.ts
│       │   ├── 📁 handlers/         # Event Handlers
│       │   │   └── messageHandler.ts
│       │   ├── 📁 types/            # TypeScript Types
│       │   │   └── index.ts
│       │   ├── 📁 utils/            # Utilities
│       │   │   ├── apiClient.ts
│       │   │   ├── apiClientWithRetry.ts  # Mit Circuit Breaker
│       │   │   ├── rateLimiter.ts
│       │   │   └── sessionManager.ts
│       │   ├── bot.ts               # Bot Entry
│       │   ├── deployCommands.ts    # Command Deployment
│       │   └── index.ts             # Main Entry
│       ├── 📄 .env.example
│       ├── 📄 Dockerfile
│       ├── 📄 package.json
│       └── 📄 tsconfig.json
│
├── 📁 dashboard/                    # React Dashboard
│   ├── 📁 src/
│   │   ├── 📁 api/                  # API Clients
│   │   │   └── jobs.ts
│   │   ├── 📁 components/           # React Components
│   │   │   ├── CreateJobModal.tsx
│   │   │   ├── JobDetail.tsx
│   │   │   ├── JobList.tsx
│   │   │   ├── LoadingSpinner.tsx   # Loading States
│   │   │   ├── LoadingSpinner.css
│   │   │   ├── StatsPanel.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   └── StreamingView.tsx
│   │   ├── 📁 hooks/                # Custom Hooks
│   │   │   ├── useJobs.ts
│   │   │   └── useWebSocket.ts
│   │   ├── 📁 types/                # TypeScript Types
│   │   │   └── index.ts
│   │   ├── App.tsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.tsx
│   ├── 📄 .env.example
│   ├── 📄 Dockerfile
│   ├── 📄 index.html
│   ├── 📄 nginx.conf
│   ├── 📄 package.json
│   ├── 📄 tsconfig.json
│   └── 📄 vite.config.ts
│
├── 📁 scripts/                      # Automation Scripts
│   ├── 📄 install.sh               # One-Command Installation
│   ├── 📄 deploy.sh                # Deployment Script
│   └── 📄 health-check.sh          # Health Check
│
├── 📁 .devcontainer/               # GitHub Codespaces
│   ├── 📁 cloudflared/
│   ├── 📁 code-server/
│   ├── 📄 devcontainer.json
│   ├── 📄 docker-compose.yml
│   ├── 📄 postCreateCommand.sh
│   └── 📄 setup.sh
│
├── 📁 shared/                      # Shared Resources
│
├── 📁 tests/                       # Test Suite
│
├── 📁 docs/                        # Dokumentation
│
├── 📄 .env.example                 # Root Environment Template
├── 📄 .env.cloudflare.example      # Cloudflare Template
├── 📄 docker-compose.yml           # All Services
├── 📄 docker-compose.prod.yml      # Production Override
├── 📄 Makefile                     # Build Commands
├── 📄 package.json                 # Workspace Root
├── 📄 README.md                    # Hauptdokumentation
├── 📄 PROJECT_STRUCTURE.md         # Diese Datei
├── 📄 LICENSE                      # MIT License
├── 📄 CHANGELOG.md                 # Version History
├── 📄 CONTRIBUTING.md              # Contribution Guide
└── 📄 SECURITY.md                  # Security Policy
```

## 🎯 Komponentenbeschreibung

### Backend
- **Express API** - RESTful API für Job-Management
- **WebSocket Server** - Echtzeit-Streaming
- **BullMQ Queue** - Redis-basierte Job Queue
- **Worker** - Job-Verarbeitung mit AI Integration
- **DLQ Handler** - Dead Letter Queue Management

### Discord Bot
- **Slash Commands** - `/agent` für Agent-Anfragen
- **Circuit Breaker** - Error Recovery
- **Rate Limiting** - API Protection
- **WebSocket Client** - Echtzeit-Updates

### Dashboard
- **React + TypeScript** - Moderne UI
- **Loading States** - Skeleton Loaders
- **Real-time Updates** - WebSocket Integration
- **Responsive Design** - Mobile Ready

### Infrastruktur
- **Docker** - Containerisierung
- **Docker Compose** - Multi-Service Orchestration
- **Redis** - Queue & Caching
- **Prometheus** - Metriken
- **Grafana** - Visualisierung

## 🚀 One-Line Commands

```bash
# Installation
make install

# Development
make dev-all

# Production
make start

# Health Check
make health

# Deployment
make deploy
```

## 📊 Services

| Service | Port | Description |
|---------|------|-------------|
| API | 3000 | REST API |
| WebSocket | 8080 | Real-time |
| Dashboard | 5173 | Web UI |
| Redis | 6379 | Queue/Cache |
| Prometheus | 9090 | Metrics |
| Grafana | 3001 | Monitoring |

## 🛡️ Security Features

- Non-root Container
- Environment-based Secrets
- CORS Protection
- Rate Limiting
- Circuit Breaker
- Health Checks

## 📝 License

MIT License - See LICENSE file
