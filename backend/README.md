# 🖥️ MediSync Backend

## Übersicht
Express.js Backend mit TypeScript, Redis Queue und GitHub Models Integration.

## Schnellstart

```bash
npm install
npm run build
npm start
```

## Entwicklung

```bash
# Mit Redis
npm run dev

# Ohne Redis (In-Memory)
USE_MEMORY_QUEUE=true npm run dev
```

## API Endpunkte

| Endpoint | Beschreibung |
|----------|-------------|
| `POST /api/jobs` | Job erstellen |
| `GET /api/jobs/:id` | Job-Status |
| `GET /health` | Health Check |
| `GET /api/stats` | Statistiken |

## Umgebungsvariablen

```env
PORT=3000
REDIS_URL=redis://localhost:6379
GITHUB_TOKEN=ghp_xxx
USE_MEMORY_QUEUE=false
```

## Architektur

```
src/
├── ai/              # GitHub Models Client
├── middleware/      # Auth, Validation, CORS
├── queue/           # BullMQ Queue
├── routes/          # API Routes
├── services/        # Business Logic
├── utils/           # Logger, Metrics
├── websocket/       # WebSocket Server
└── worker/          # Background Worker
```

## Tests

```bash
npm test
```

## Docker

```bash
docker build -t medisync-backend .
docker run -p 3000:3000 medisync-backend
```
