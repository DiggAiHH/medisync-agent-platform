# 🔌 MediSync API-Dokumentation

> Vollständige Dokumentation aller API-Endpunkte, WebSocket Events und Fehlercodes.

---

## 📋 Inhaltsverzeichnis

- [Base URL](#-base-url)
- [Authentifizierung](#-authentifizierung)
- [Headers](#-headers)
- [Jobs API](#-jobs-api)
- [Stats API](#-stats-api)
- [Budget API](#-budget-api)
- [Health API](#-health-api)
- [WebSocket](#-websocket)
- [Fehlercodes](#-fehlercodes)
- [Beispiele](#-beispiele)

---

## 🌐 Base URL

| Umgebung | Base URL |
|----------|----------|
| **Lokal** | `http://localhost:3000` |
| **Codespaces** | `https://[codespace-name]-3000.github.dev` |
| **Cloudflare Tunnel** | `https://api.ihrefirma.de` |

---

## 🔐 Authentifizierung

Die API verwendet Header-basierte Authentifizierung:

```http
X-User-Id: user-123
X-Session-Id: session-456
```

### Rate Limits

| Window | Limit |
|--------|-------|
| Per Minute | 60 |
| Per Hour | 1000 |
| Per Day | 10000 |

Headers in jeder Antwort:

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 1640995200
```

---

## 📨 Headers

### Required Headers

| Header | Beschreibung | Beispiel |
|--------|-------------|----------|
| `Content-Type` | MIME-Type | `application/json` |
| `X-User-Id` | Eindeutige User-ID | `discord-user-123` |
| `X-Session-Id` | Session Identifier | `session-abc-456` |

### Optional Headers

| Header | Beschreibung | Standard |
|--------|-------------|----------|
| `Authorization` | GitHub Token (für interne Services) | - |
| `Accept` | Response Format | `application/json` |

---

## 📦 Jobs API

### POST `/api/jobs`

Erstellt einen neuen Agent-Job.

#### Request

```http
POST /api/jobs
Content-Type: application/json
X-User-Id: user-123
X-Session-Id: session-456

{
  "prompt": "Analysiere diesen medizinischen Text...",
  "userId": "user-123",
  "sessionId": "session-456",
  "model": "gpt-4o",
  "options": {
    "temperature": 0.7,
    "maxTokens": 1000
  }
}
```

#### Response (201 Created)

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "user-123",
    "sessionId": "session-456",
    "prompt": "Analysiere diesen medizinischen Text...",
    "status": "pending",
    "model": "gpt-4o",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z",
    "retryCount": 0
  }
}
```

#### Validation Errors (400 Bad Request)

```json
{
  "success": false,
  "error": "Validierungsfehler",
  "details": [
    {
      "msg": "Prompt ist erforderlich",
      "param": "prompt",
      "location": "body"
    }
  ]
}
```

---

### GET `/api/jobs/:id`

Ruft den Status eines Jobs ab.

#### Request

```http
GET /api/jobs/550e8400-e29b-41d4-a716-446655440000
X-User-Id: user-123
X-Session-Id: session-456
```

#### Response (200 OK) - Completed Job

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "user-123",
    "sessionId": "session-456",
    "prompt": "Analysiere diesen medizinischen Text...",
    "status": "completed",
    "result": "## Analyse-Ergebnis\n\nDer Text beschreibt...",
    "model": "gpt-4o",
    "tokensUsed": 1245,
    "cost": 0.0024,
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:05Z",
    "completedAt": "2024-01-15T10:30:05Z",
    "retryCount": 0
  }
}
```

#### Response (404 Not Found)

```json
{
  "success": false,
  "error": "Job mit ID 550e8400-e29b-41d4-a716-446655440000 nicht gefunden"
}
```

---

### GET `/api/jobs`

Listet alle Jobs auf.

#### Query Parameters

| Parameter | Typ | Beschreibung | Standard |
|-----------|-----|-------------|----------|
| `limit` | number | Maximale Anzahl | 100 |
| `status` | string | Filter nach Status | - |
| `userId` | string | Filter nach User | - |

#### Request

```http
GET /api/jobs?limit=50&status=completed
X-User-Id: user-123
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "completed",
      "prompt": "Analyse 1...",
      "createdAt": "2024-01-15T10:30:00Z"
    },
    {
      "id": "660f9511-f30c-52e5-b827-557766551111",
      "status": "completed",
      "prompt": "Analyse 2...",
      "createdAt": "2024-01-15T10:25:00Z"
    }
  ],
  "count": 2
}
```

---

### DELETE `/api/jobs/:id`

Löscht einen Job (nur `pending` oder `failed`).

#### Request

```http
DELETE /api/jobs/550e8400-e29b-41d4-a716-446655440000
X-User-Id: user-123
```

#### Response (200 OK)

```json
{
  "success": true,
  "message": "Job 550e8400-e29b-41d4-a716-446655440000 wurde gelöscht"
}
```

#### Response (400 Bad Request)

```json
{
  "success": false,
  "error": "Nur pending oder failed Jobs können gelöscht werden"
}
```

---

### POST `/api/jobs/:id/retry`

Wiederholt einen fehlgeschlagenen Job.

#### Request

```http
POST /api/jobs/550e8400-e29b-41d4-a716-446655440000/retry
X-User-Id: user-123
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "770a0622-g41d-63f6-c938-668877662222",
    "status": "pending",
    "prompt": "Analysiere diesen medizinischen Text...",
    "createdAt": "2024-01-15T10:35:00Z"
  },
  "message": "Job wurde als 770a0622-g41d-63f6-c938-668877662222 neu erstellt"
}
```

---

## 📊 Stats API

### GET `/api/stats`

Globale Statistiken.

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "jobs": {
      "total": 1250,
      "pending": 3,
      "active": 2,
      "completed": 1200,
      "failed": 45,
      "cancelled": 0
    },
    "usage": {
      "totalTokens": 1250000,
      "totalCost": 2.50,
      "currency": "USD"
    },
    "models": {
      "gpt-4o": { "requests": 800, "tokens": 800000, "cost": 2.00 },
      "claude-3-5-sonnet": { "requests": 450, "tokens": 450000, "cost": 0.50 }
    },
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

---

### GET `/api/stats/user/:userId`

Statistiken für einen spezifischen User.

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "userId": "user-123",
    "jobs": {
      "total": 50,
      "completed": 48,
      "failed": 2
    },
    "usage": {
      "totalTokens": 50000,
      "totalCost": 0.10,
      "currency": "USD"
    },
    "sessions": ["session-456", "session-789"],
    "firstActivity": "2024-01-01T00:00:00Z",
    "lastActivity": "2024-01-15T10:30:00Z"
  }
}
```

---

### GET `/api/stats/usage`

Detaillierte Usage-Statistiken mit Zeitbereich.

#### Query Parameters

| Parameter | Typ | Beschreibung | Beispiel |
|-----------|-----|-------------|----------|
| `startDate` | string | Startdatum | `2024-01-01` |
| `endDate` | string | Enddatum | `2024-01-31` |
| `groupBy` | string | Gruppierung | `day`, `week`, `month` |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "period": {
      "start": "2024-01-01",
      "end": "2024-01-31"
    },
    "summary": {
      "totalRequests": 1000,
      "totalTokens": 1000000,
      "totalCost": 2.00
    },
    "daily": [
      {
        "date": "2024-01-15",
        "requests": 50,
        "tokens": 50000,
        "cost": 0.10
      }
    ]
  }
}
```

---

### GET `/api/stats/models`

Modell-Nutzungsstatistiken.

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "models": [
      {
        "model": "gpt-4o",
        "requests": 800,
        "inputTokens": 400000,
        "outputTokens": 400000,
        "cost": 2.00,
        "avgLatency": 2500
      },
      {
        "model": "claude-3-5-sonnet",
        "requests": 450,
        "inputTokens": 225000,
        "outputTokens": 225000,
        "cost": 0.50,
        "avgLatency": 1800
      }
    ]
  }
}
```

---

## 💰 Budget API

### GET `/api/budget/:userId`

Budget-Status für einen User.

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "userId": "user-123",
    "budget": {
      "dailyLimit": 5.00,
      "weeklyLimit": 25.00,
      "monthlyLimit": 100.00,
      "currency": "USD"
    },
    "status": {
      "daily": { "used": 2.50, "limit": 5.00, "percentage": 50 },
      "weekly": { "used": 10.00, "limit": 25.00, "percentage": 40 },
      "monthly": { "used": 35.00, "limit": 100.00, "percentage": 35 }
    },
    "alerts": [
      {
        "type": "daily",
        "threshold": 80,
        "triggered": false
      }
    ]
  }
}
```

---

### PUT `/api/budget/:userId`

Budget konfigurieren.

#### Request

```http
PUT /api/budget/user-123
Content-Type: application/json

{
  "dailyLimit": 10.00,
  "weeklyLimit": 50.00,
  "monthlyLimit": 200.00,
  "currency": "USD"
}
```

#### Response (200 OK)

```json
{
  "success": true,
  "message": "Budget configuration updated"
}
```

---

### GET `/api/budget/:userId/invoice`

Rechnung für einen Zeitraum generieren.

#### Query Parameters

| Parameter | Beschreibung | Beispiel |
|-----------|-------------|----------|
| `startDate` | Startdatum | `2024-01-01` |
| `endDate` | Enddatum | `2024-01-31` |
| `currency` | Währung | `USD`, `EUR` |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "invoiceId": "INV-20240115-001",
    "period": {
      "start": "2024-01-01",
      "end": "2024-01-31"
    },
    "userId": "user-123",
    "items": [
      {
        "model": "gpt-4o",
        "requests": 800,
        "tokens": 800000,
        "cost": 2.00
      }
    ],
    "summary": {
      "subtotal": 2.00,
      "tax": 0.00,
      "total": 2.00,
      "currency": "USD"
    },
    "generatedAt": "2024-01-15T10:30:00Z"
  }
}
```

---

## 🏥 Health API

### GET `/health`

Basis Health Check.

#### Response (200 OK)

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0.0"
}
```

---

### GET `/health/detailed`

Detaillierter System-Status.

#### Response (200 OK)

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "checks": {
    "api": { "status": "healthy", "responseTime": 5 },
    "redis": { "status": "healthy", "responseTime": 2 },
    "queue": { "status": "healthy", "pendingJobs": 3 },
    "models": { "status": "healthy", "available": ["gpt-4o", "claude-3-5-sonnet"] }
  }
}
```

---

### GET `/health/ready`

Kubernetes-style Readiness Probe.

#### Response (200 OK)

```text
ready
```

### GET `/health/live`

Kubernetes-style Liveness Probe.

#### Response (200 OK)

```text
alive
```

---

## 🔌 WebSocket

### Verbindung

```javascript
const ws = new WebSocket('ws://localhost:8080');

ws.onopen = () => {
  console.log('Connected to MediSync WebSocket');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};
```

### Events

#### Client → Server

| Event | Beschreibung | Payload |
|-------|-------------|---------|
| `subscribe` | Job-Updates abonnieren | `{ jobId: string }` |
| `unsubscribe` | Abonnement beenden | `{ jobId: string }` |
| `ping` | Keep-alive | `{}` |

#### Server → Client

| Event | Beschreibung | Payload |
|-------|-------------|---------|
| `job:created` | Neuer Job erstellt | `Job` |
| `job:updated` | Job-Status geändert | `Job` |
| `job:completed` | Job abgeschlossen | `Job` |
| `stream:start` | Streaming beginnt | `{ jobId }` |
| `stream:chunk` | Stream-Chunk | `{ jobId, chunk }` |
| `stream:end` | Streaming beendet | `{ jobId }` |
| `error` | Fehler aufgetreten | `{ message, code }` |

### Beispiel: Job-Updates

```javascript
// Verbindung herstellen
const ws = new WebSocket('ws://localhost:8080');

// Job erstellen
const response = await fetch('http://localhost:3000/api/jobs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'Analyse...',
    userId: 'user-123',
    sessionId: 'session-456'
  })
});
const { data: job } = await response.json();

// Auf Updates warten
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'job:updated':
      console.log(`Job ${data.data.id} is now ${data.data.status}`);
      break;
    case 'job:completed':
      console.log('Result:', data.data.result);
      break;
    case 'stream:chunk':
      process.stdout.write(data.data.chunk);
      break;
  }
};
```

---

## ❌ Fehlercodes

### HTTP Status Codes

| Code | Bedeutung | Beschreibung |
|------|-----------|--------------|
| `200` | OK | Anfrage erfolgreich |
| `201` | Created | Ressource erstellt |
| `400` | Bad Request | Ungültige Anfrage |
| `401` | Unauthorized | Authentifizierung fehlt |
| `403` | Forbidden | Zugriff verweigert |
| `404` | Not Found | Ressource nicht gefunden |
| `409` | Conflict | Konflikt mit aktuellem Zustand |
| `429` | Too Many Requests | Rate Limit überschritten |
| `500` | Internal Server Error | Serverfehler |
| `503` | Service Unavailable | Service vorübergehend nicht verfügbar |

### API Error Codes

| Code | Beschreibung | Lösung |
|------|-------------|--------|
| `JOB_NOT_FOUND` | Job existiert nicht | Job-ID überprüfen |
| `JOB_CANNOT_DELETE` | Job kann nicht gelöscht werden | Nur pending/failed Jobs |
| `JOB_CANNOT_RETRY` | Job kann nicht wiederholt werden | Nur failed Jobs |
| `VALIDATION_ERROR` | Ungültige Eingabe | Request-Body prüfen |
| `RATE_LIMIT_EXCEEDED` | Rate Limit erreicht | Später erneut versuchen |
| `BUDGET_EXCEEDED` | Budget überschritten | Budget erhöhen oder warten |
| `AI_SERVICE_ERROR` | AI Service Fehler | Später erneut versuchen |
| `REDIS_ERROR` | Redis Verbindungsfehler | Redis-Status prüfen |

### Rate Limit Response (429)

```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 60
}
```

---

## 📝 Beispiele

### cURL Beispiele

#### Job erstellen

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -H "X-User-Id: user-123" \
  -H "X-Session-Id: session-456" \
  -d '{
    "prompt": "Analysiere: Patient 45J, Fieber 39°C, Husten",
    "model": "gpt-4o"
  }'
```

#### Job-Status prüfen

```bash
curl http://localhost:3000/api/jobs/550e8400-e29b-41d4-a716-446655440000 \
  -H "X-User-Id: user-123"
```

#### Alle Jobs listen

```bash
curl "http://localhost:3000/api/jobs?limit=10&status=completed" \
  -H "X-User-Id: user-123"
```

#### Budget abfragen

```bash
curl http://localhost:3000/api/budget/user-123
```

### JavaScript/TypeScript Beispiele

#### API Client

```typescript
class MediSyncClient {
  private baseUrl: string;
  private userId: string;
  private sessionId: string;

  constructor(baseUrl: string, userId: string, sessionId: string) {
    this.baseUrl = baseUrl;
    this.userId = userId;
    this.sessionId = sessionId;
  }

  async createJob(prompt: string, model?: string) {
    const response = await fetch(`${this.baseUrl}/api/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': this.userId,
        'X-Session-Id': this.sessionId
      },
      body: JSON.stringify({ prompt, userId: this.userId, sessionId: this.sessionId, model })
    });
    return response.json();
  }

  async getJob(jobId: string) {
    const response = await fetch(`${this.baseUrl}/api/jobs/${jobId}`, {
      headers: {
        'X-User-Id': this.userId,
        'X-Session-Id': this.sessionId
      }
    });
    return response.json();
  }

  async getStats() {
    const response = await fetch(`${this.baseUrl}/api/stats/user/${this.userId}`);
    return response.json();
  }
}

// Verwendung
const client = new MediSyncClient(
  'http://localhost:3000',
  'user-123',
  'session-456'
);

const job = await client.createJob('Analysiere...', 'gpt-4o');
console.log('Job erstellt:', job.data.id);
```

### Python Beispiel

```python
import requests

class MediSyncClient:
    def __init__(self, base_url: str, user_id: str, session_id: str):
        self.base_url = base_url
        self.headers = {
            'X-User-Id': user_id,
            'X-Session-Id': session_id
        }
    
    def create_job(self, prompt: str, model: str = None):
        response = requests.post(
            f'{self.base_url}/api/jobs',
            headers={**self.headers, 'Content-Type': 'application/json'},
            json={
                'prompt': prompt,
                'userId': self.headers['X-User-Id'],
                'sessionId': self.headers['X-Session-Id'],
                'model': model
            }
        )
        return response.json()
    
    def get_job(self, job_id: str):
        response = requests.get(
            f'{self.base_url}/api/jobs/{job_id}',
            headers=self.headers
        )
        return response.json()

# Verwendung
client = MediSyncClient('http://localhost:3000', 'user-123', 'session-456')
job = client.create_job('Analysiere...', 'gpt-4o')
print(f"Job erstellt: {job['data']['id']}")
```

---

<div align="center">

**[⬆️ Nach oben](#-medisync-api-dokumentation)**

</div>
