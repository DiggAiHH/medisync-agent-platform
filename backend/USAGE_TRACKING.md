# Usage Tracking & Monitoring System

## Übersicht

Das vollständige Nutzungs-Tracking und Monitoring System für die MediSync Agenten-Plattform.

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                     API Gateway                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Usage Middleware                         │  │
│  │  - Rate Limiting (60/min, 1000/hr, 10000/day)        │  │
│  │  - Budget Limits (Tokens, Kosten)                    │  │
│  │  - Request Tracking                                  │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                  Token Tracker                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Tracking pro:                                        │  │
│  │  • User (Daily/Weekly/Monthly)                       │  │
│  │  • Session (mit Recent Requests)                     │  │
│  │  • Model (Daily/Monthly)                             │  │
│  │  • Global (mit Unique Users/Sessions)                │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                  Billing Service                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  • GitHub Models Pricing                             │  │
│  │  • Model Multipliers (0.25x - 10x)                   │  │
│  │  • Cost Reports (Daily/Weekly/Monthly)               │  │
│  │  • Budget Alerts (60%, 80%, 100%)                    │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                  Metrics Collector                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  • Prometheus Metrics                                │  │
│  │  • Job Processing Times                              │  │
│  │  • Error Rates                                       │  │
│  │  • Custom Metrics                                    │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │
              ┌──────▼──────┐
              │    Redis    │
              │  (Storage)  │
              └─────────────┘
```

## Neue Endpunkte

### 1. Statistiken & Usage

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| GET | `/api/stats` | Gesamtstatistiken der Plattform |
| GET | `/api/stats/user/:userId` | User-spezifische Statistiken |
| GET | `/api/stats/usage` | Token Usage über Zeit |
| GET | `/api/stats/models` | Usage pro Modell |
| GET | `/api/stats/sessions` | Session-basierte Statistiken |
| GET | `/api/stats/session/:sessionId` | Details für eine Session |
| GET | `/api/stats/budget/:userId` | Budget Status |
| GET | `/api/stats/export?format=csv` | Export als CSV/JSON |

### 2. Budget Management

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| GET | `/api/budget/:userId` | Budget Status & History |
| PUT | `/api/budget/:userId` | Budget Limits aktualisieren |
| GET | `/api/budget/:userId/invoice` | Rechnung generieren |

### 3. Rate Limiting

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| GET | `/api/ratelimit/:userId` | Aktuelle Rate Limit Status |

### 4. Monitoring & Metriken

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| GET | `/api/metrics` | JSON Metriken |
| GET | `/api/metrics?format=prometheus` | Prometheus Format |
| GET | `/api/pricing` | Aktuelle Model-Preise |

### 5. Erweiterte Health Checks

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| GET | `/health` | Gesamter Gesundheitsstatus |
| GET | `/health/detailed` | Detaillierte Systeminfo |
| GET | `/health/models` | GitHub Models API Status |
| GET | `/health/redis` | Redis Verbindung |
| GET | `/health/queue` | Queue Status mit Processing Time |
| GET | `/health/metrics` | Prometheus Metriken |
| GET | `/health/ready` | Kubernetes Readiness |
| GET | `/health/live` | Kubernetes Liveness |

## Budget-Limit System

### Default Limits

```typescript
const DEFAULT_LIMITS = {
  requestsPerMinute: 60,    // 60 Requests pro Minute
  requestsPerHour: 1000,    // 1.000 Requests pro Stunde
  requestsPerDay: 10000,    // 10.000 Requests pro Tag
  tokensPerDay: 100000,     // 100.000 Tokens pro Tag
  costPerDay: 5.00,         // $5.00 pro Tag
};
```

### Model-Multiplier

| Modell | Multiplier | Relativer Preis |
|--------|------------|-----------------|
| gemini-2.0-flash | 0.25x | 25% |
| gpt-4o-mini | 0.3x | 30% |
| llama-4 | 0.5x | 50% |
| gpt-4.1 | 1.0x | 100% (Basis) |
| gpt-4o | 1.0x | 100% |
| gemini-2.5-pro | 1.25x | 125% |
| claude-3.5-sonnet | 1.5x | 150% |
| claude-3.7-sonnet | 1.5x | 150% |
| gpt-4.5 | 5.0x | 500% |
| claude-opus-4 | 10.0x | 1000% |

### Alert Thresholds

```typescript
{
  info: 60%,      // Info Notification
  warning: 80%,   // Warning Alert
  critical: 100%, // Critical Alert (Blockierung)
}
```

### Rate Limit Headers

Jede API Response enthält Rate Limit Headers:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1704067200
```

## Monitoring Dashboard Daten

### 1. Gesamtstatistiken (`/api/stats`)

```json
{
  "period": { "days": 30 },
  "totals": {
    "requests": 15000,
    "tokens": 2500000,
    "cost": 45.50,
    "uniqueUsers": 25
  },
  "averages": {
    "requestsPerDay": 500,
    "tokensPerDay": 83333,
    "costPerDay": 1.52,
    "tokensPerRequest": 167,
    "costPerRequest": 0.003
  },
  "models": {
    "total": 5,
    "top": { "model": "gpt-4.1", "requests": 8000 },
    "breakdown": { ... }
  }
}
```

### 2. User Stats (`/api/stats/user/:userId`)

```json
{
  "userId": "user-123",
  "periods": {
    "today": { "totalRequests": 50, "totalTokens": 5000, ... },
    "thisWeek": { "totalRequests": 350, ... },
    "thisMonth": { "totalRequests": 1500, ... },
    "history": { "daily": [...], "total": {...} }
  },
  "models": {
    "used": 3,
    "top": [{ "model": "gpt-4.1", "requests": 100 }]
  }
}
```

### 3. Budget Status (`/api/budget/:userId`)

```json
{
  "userId": "user-123",
  "limits": {
    "requestsPerMinute": 60,
    "requestsPerHour": 1000,
    "requestsPerDay": 10000,
    "tokensPerDay": 100000,
    "costPerDay": 5.00
  },
  "currentUsage": {
    "requests": { "minute": 12, "hour": 150, "day": 800 },
    "tokens": 15000,
    "cost": 0.75
  },
  "percentages": {
    "requests": { "minute": 20, "hour": 15, "day": 8 },
    "tokens": 15,
    "cost": 15
  },
  "status": {
    "requests": "ok",
    "tokens": "ok",
    "cost": "ok"
  }
}
```

### 4. Prometheus Metriken (`/health/metrics`)

```
# HELP app_uptime_seconds Application uptime in seconds
# TYPE app_uptime_seconds gauge
app_uptime_seconds 86400

# HELP queue_jobs_total Total number of jobs
# TYPE queue_jobs_total gauge
queue_jobs_total{state="waiting"} 5
queue_jobs_total{state="active"} 2
queue_jobs_total{state="completed"} 1000
queue_jobs_total{state="failed"} 10

# HELP queue_processing_time_ms Average processing time
# TYPE queue_processing_time_ms gauge
queue_processing_time_ms 1500

# HELP jobs_processed_total Total jobs processed
# TYPE jobs_processed_total counter
jobs_processed_total{status="completed",model="gpt-4.1"} 500
jobs_processed_total{status="failed",model="gpt-4.1"} 5

# HELP jobs_duration_seconds Job processing duration
# TYPE jobs_duration_seconds histogram
jobs_duration_seconds_bucket{le="0.1"} 50
jobs_duration_seconds_bucket{le="0.5"} 200
jobs_duration_seconds_bucket{le="+Inf"} 505
jobs_duration_seconds_sum 1250.5
jobs_duration_seconds_count 505

# HELP errors_total Total number of errors
# TYPE errors_total counter
errors_total{type="ValidationError",endpoint="/api/jobs"} 5
```

### 5. Queue Status (`/health/queue`)

```json
{
  "healthy": true,
  "queue": {
    "waiting": 5,
    "active": 2,
    "completed": 1000,
    "failed": 10,
    "delayed": 0,
    "paused": 0,
    "total": 1017,
    "processingTime": {
      "average": 1500,
      "min": 500,
      "max": 5000
    }
  }
}
```

### 6. GitHub Models Status (`/health/models`)

```json
{
  "available": true,
  "latency": 250,
  "models": [
    "gpt-4o",
    "gpt-4.1",
    "claude-3.5-sonnet",
    "gemini-2.0-flash"
  ]
}
```

## Redis Storage Schema

### Token Tracking

```
tokens:user:{userId}:daily:{YYYY-MM-DD}     - Tägliche Usage
tokens:user:{userId}:weekly:{YYYY-WW}       - Wöchentliche Usage
tokens:user:{userId}:monthly:{YYYY-MM}      - Monatliche Usage
tokens:session:{sessionId}                  - Session Usage
tokens:global:daily:{YYYY-MM-DD}            - Globale Daily Stats
tokens:model:{model}:daily:{YYYY-MM-DD}     - Modell Daily Stats
timeline:user:{userId}                      - Usage Timeline (ZSET)
```

### Rate Limiting

```
ratelimit:{userId}:minute                   - Requests pro Minute
ratelimit:{userId}:hour                     - Requests pro Stunde
ratelimit:{userId}:day                      - Requests pro Tag
```

### Budget

```
budget:{userId}:tokens:{YYYY-MM-DD}         - Daily Token Usage
budget:{userId}:cost:{YYYY-MM-DD}           - Daily Cost Usage
budget:{userId}:alerts                      - Budget Alerts (ZSET)
budget:{userId}:limits                      - User Limits (JSON)
```

### Billing

```
billing:daily:{YYYY-MM-DD}                  - Global Daily Cost
billing:user:{userId}:daily:{YYYY-MM-DD}    - User Daily Cost
billing:user:{userId}:monthly:{YYYY-MM}     - User Monthly Cost
billing:history:{userId}                    - Cost History (ZSET)
billing:alerts:{userId}                     - Billing Alerts (ZSET)
```

### Metrics

```
metrics:jobs:total                          - Job Counter
metrics:jobs:histogram                      - Processing Time Histogram
metrics:errors:total                        - Error Counter
metrics:processing:time:{key}               - Processing Time (ZSET)
metrics:custom                              - Custom Metrics (HASH)
```

## TTL (Time To Live)

| Datentyp | TTL | Begründung |
|----------|-----|------------|
| Session Data | 90 Tage | Aktive Sessions |
| Daily Usage | 2 Jahre | Langfristige Analyse |
| Weekly Usage | 3 Jahre | Trend-Analyse |
| Monthly Usage | 5 Jahre | Reporting |
| Rate Limits | 1-24h | Temporäre Limits |
| Budget Alerts | 30 Tage | Alert History |
| Cost History | 1 Jahr | Rechnungsstellung |
| Processing Time | 90 Tage | Performance Analyse |

## Beispiel: API Usage

### 1. User Stats abrufen

```bash
curl http://localhost:3000/api/stats/user/user-123 \
  -H "X-User-Id: user-123" \
  -H "X-Session-Id: session-456"
```

### 2. Budget aktualisieren

```bash
curl -X PUT http://localhost:3000/api/budget/user-123 \
  -H "Content-Type: application/json" \
  -d '{
    "dailyLimit": 10.00,
    "weeklyLimit": 50.00,
    "monthlyLimit": 200.00
  }'
```

### 3. Rechnung generieren

```bash
curl "http://localhost:3000/api/budget/user-123/invoice?startDate=2026-01-01&endDate=2026-01-31&currency=EUR"
```

### 4. Metriken im Prometheus Format

```bash
curl http://localhost:3000/api/metrics?format=prometheus
```

### 5. Export als CSV

```bash
curl http://localhost:3000/api/stats/export?format=csv > stats.csv
```

## Integration

### Middleware Usage

```typescript
import { createUsageMiddleware } from './middleware/usageMiddleware';

const usageMiddleware = createUsageMiddleware(redis, tokenTracker);

// Global
app.use(usageMiddleware.middleware());

// Per Route mit Model
app.post('/api/chat', usageMiddleware.trackAIUsage('gpt-4.1'), handler);
```

### Token Tracking

```typescript
import { createTokenUsageEntry } from './ai/tokenTracker';

const entry = createTokenUsageEntry(
  userId,
  sessionId,
  'gpt-4.1',
  { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  requestId,
  '/api/chat'
);

await tokenTracker.trackUsage(entry);
```

### Billing

```typescript
import { createBillingService } from './services/billingService';

const billing = createBillingService(redis);

// Track cost
const { baseCost, multiplier, finalCost } = await billing.trackCost(
  userId,
  'gpt-4.1',
  tokenUsage,
  requestId
);

// Check budget
const status = await billing.checkBudgetStatus(userId, 'daily');
```

### Metrics

```typescript
import { createMetricsCollector } from './utils/metrics';

const metrics = createMetricsCollector(redis);

// Track job
metrics.trackJobStart(jobId, 'gpt-4.1');
metrics.trackJobEnd(jobId, 'completed', 150);

// Track error
metrics.trackError('ValidationError', 'Invalid input', { endpoint: '/api/jobs' });

// Track request
metrics.trackRequestDuration('POST', '/api/jobs', 200, 1500);
```

## Alert System

Budget Alerts werden automatisch bei folgenden Thresholds ausgelöst:

- **60% (Info)**: Notification, keine Blockierung
- **80% (Warning)**: Warning Alert, keine Blockierung
- **100% (Critical)**: Critical Alert, Requests werden blockiert

### Alert Callback registrieren

```typescript
usageMiddleware.onBudgetAlert((alert) => {
  console.log(`Alert: ${alert.type} - ${alert.threshold}%`);
  // Send Email, Slack, etc.
});

billingService.onAlert((alert) => {
  console.log(`Billing Alert: ${alert.type}`);
  // Handle billing-specific alerts
});
```

## Docker Compose Integration

Für vollständiges Monitoring mit Prometheus und Grafana:

```yaml
version: '3.8'
services:
  api:
    build: .
    environment:
      - REDIS_URL=redis://redis:6379
      - GITHUB_TOKEN=${GITHUB_TOKEN}
  
  redis:
    image: redis:7-alpine
  
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
  
  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
```

## Prometheus Config

```yaml
scrape_configs:
  - job_name: 'medisync-api'
    static_configs:
      - targets: ['api:3000']
    metrics_path: '/health/metrics'
    scrape_interval: 15s
```
