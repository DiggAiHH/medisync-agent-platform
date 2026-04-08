# MediSync Tests

Dieses Verzeichnis enthält alle Tests für die MediSync Agenten-Plattform.

## 📁 Struktur

```
tests/
├── integration/           # Integration Tests
│   └── full-flow.test.ts  # Vollständiger Flow-Test
├── load/                  # Lasttests
│   ├── load-test.yml      # Artillery Konfiguration
│   ├── load-test-k6.js    # k6 JavaScript Test
│   └── test-data.csv      # Testdaten
├── manual/                # Manuelle Tests
│   └── test-checklist.md  # Schritt-für-Schritt Checkliste
└── README.md             # Diese Datei
```

## 🚀 Schnellstart

### Integration Tests

```bash
# Alle Services starten
./scripts/start-all.sh

# Tests ausführen
cd backend
npm test -- --testPathPattern="integration"
```

### E2E Tests

```bash
# Automatisierte E2E Tests
./scripts/test-e2e.sh

# Mit detaillierter Ausgabe
./scripts/test-e2e.sh --verbose

# Ohne Cleanup (für Debugging)
./scripts/test-e2e.sh --skip-cleanup
```

### Load Tests (k6)

```bash
# Installation
winget install k6          # Windows
brew install k6            # macOS
sudo apt-get install k6    # Linux

# Ausführen
k6 run tests/load/load-test-k6.js

# Mit mehr VUs
k6 run --vus 20 --duration 5m tests/load/load-test-k6.js
```

### Load Tests (Artillery)

```bash
# Installation
npm install -g artillery

# Ausführen
artillery run tests/load/load-test.yml

# Mit Report
artillery run tests/load/load-test.yml --output report.json
artillery report report.json
```

## 🧪 Test-Szenarien

### 1. `/agent Hallo` → Ergebnis in <10 Sekunden

**Beschreibung**: Einfacher Agent-Aufruf mit schneller Antwortzeit

**Test**: `full-flow.test.ts` → "should complete in less than 10 seconds"

### 2. Lange Antwort (>2000 Zeichen) → Thread wird erstellt

**Beschreibung**: Automatische Thread-Erstellung für lange Antworten

**Test**: `full-flow.test.ts` → "should handle long responses"

### 3. Rate Limiting → 1 msg/sec enforced

**Beschreibung**: Ein Nutzer kann max. 1 Nachricht pro Sekunde senden

**Test**: `full-flow.test.ts` → "should enforce rate limiting"

### 4. API Down → Graceful Error Message

**Beschreibung**: Verständliche Fehlermeldung bei API-Ausfall

**Test**: `full-flow.test.ts` → "should handle API down gracefully"

### 5. Worker Retry → Failed Job wird wiederholt

**Beschreibung**: Automatischer Retry bei Fehlern (max. 3 Versuche)

**Test**: `full-flow.test.ts` → "should process job with retry on failure"

### 6. WebSocket Reconnect → Auto-Reconnect funktioniert

**Beschreibung**: Automatische Wiederverbindung bei Verbindungsabbruch

**Test**: `full-flow.test.ts` → "should auto-reconnect after connection loss"

## 📊 Erwartete Ergebnisse

### Integration Tests

```
✅ Discord Bot Command
✅ API Job Submission
✅ Queue Processing
✅ Worker Processing
✅ WebSocket Communication
✅ Full End-to-End Flow
```

### Load Tests (k6)

```
http_req_duration..............: avg=2.5s   min=100ms  med=2s   max=10s
http_req_failed................: 0.00%   ✓ 0        ✗ 1000
job_completion_time............: avg=8s     min=2s     med=7s   max=15s
job_success_rate...............: 100.00% ✓ 1000     ✗ 0
```

### Manuelle Tests

| Szenario | Erwartet | Status |
|----------|----------|--------|
| Einfacher Aufruf | <10s | ⬜ |
| Lange Antwort | Thread erstellt | ⬜ |
| Rate Limiting | Blockiert | ⬜ |
| API Down | Error Message | ⬜ |
| Worker Retry | Automatisch | ⬜ |
| WebSocket Reconnect | Funktioniert | ⬜ |

## 🔧 Test-Daten

### Umgebungsvariablen

```bash
# API
API_BASE_URL=http://localhost:3000
PORT=3000

# WebSocket
WEBSOCKET_URL=ws://localhost:8080
WS_PORT=8080

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PORT=6379

# Discord
DISCORD_TOKEN=your_token_here
DISCORD_APPLICATION_ID=your_app_id
```

### Test-User

```
User ID: test_user_<uuid>
Channel ID: test_channel_<uuid>
Session ID: sess_<timestamp>_<random>
```

## 🐛 Debugging

### Tests fehlschlagen

```bash
# Detaillierte Ausgabe
npm test -- --verbose

# Spezifischen Test ausführen
npm test -- --testNamePattern="should complete full flow"

# Mit Coverage
npm test -- --coverage
```

### Logs ansehen

```bash
# API Logs
tail -f logs/api.log

# Bot Logs
tail -f logs/bot.log

# Worker Logs
tail -f logs/worker.log
```

### Redis debuggen

```bash
# Redis CLI
docker exec -it medisync-redis redis-cli

# Alle Keys anzeigen
KEYS *

# Job-Status prüfen
GET job:<job-id>

# Queue-Status
LLEN bull:agent-jobs:wait
```

## 📝 Test-Plan

### Vor jedem Release

- [ ] Integration Tests ausführen
- [ ] E2E Tests ausführen
- [ ] Load Tests mit 10 VUs
- [ ] Manuelle Checkliste durchgehen
- [ ] Alle Szenarien bestanden

### Tägliche Entwicklung

- [ ] Integration Tests nach Änderungen
- [ ] Schnelle Smoke Tests
- [ ] Logs auf Fehler prüfen

### Wöchentlich

- [ ] Vollständige E2E Tests
- [ ] Load Tests mit 50 VUs
- [ ] Manuelle Tests in Staging

## 🔗 Weitere Dokumentation

- [API Dokumentation](../backend/README.md)
- [Discord Bot](../bot/discord/README.md)
- [Architektur](../docs/ARCHITECTURE.md)
