# GitHub Models AI Client

MediSync Agenten-Plattform - AI Layer für GitHub Models API

## Übersicht

Dieses Modul bietet einen vollständigen Client für die GitHub Models Inference API mit:

- 🎯 **Intelligent Model Routing** - Kostenoptimierte Modell-Auswahl
- 🔄 **Streaming Support** - Echtzeit-Responses mit WebSocket Broadcast
- 📊 **Token Tracking** - Detaillierte Usage-Analytics mit Redis
- 🛡️ **Robust Error Handling** - Retry-Logic mit Exponential Backoff

## Installation

```bash
# Umgebungsvariable setzen
export GITHUB_TOKEN="ghp_xxxx"

# Oder in .env
GITHUB_TOKEN=ghp_xxxx
```

## Schnellstart

```typescript
import { GitHubModelsClient, ModelRouter, StreamingHandler } from './ai';

// Client initialisieren
const client = new GitHubModelsClient({
  token: process.env.GITHUB_TOKEN,
});

// Router für kostenoptimierte Auswahl
const router = new ModelRouter();

// Nachrichten
const messages = [
  { role: 'system', content: 'Du bist ein medizinischer Assistent.' },
  { role: 'user', content: 'Zusammenfassung der Symptome...' },
];

// Automatisches Routing
const routing = router.route(messages);
console.log(`Verwende: ${routing.model}`);

// Request
const { response, cost } = await client.chatCompletion(messages, {
  model: routing.model,
});
```

## Architektur

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Layer                                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Model Router │──│GitHub Models │──│   Streaming  │          │
│  │              │  │   Client     │  │   Handler    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         │                 │                  │                  │
│         ▼                 ▼                  ▼                  │
│  ┌──────────────────────────────────────────────────┐          │
│  │              Token Tracker (Redis)                │          │
│  └──────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              GitHub Models API (models.github.ai)               │
└─────────────────────────────────────────────────────────────────┘
```

## Komponenten

### 1. GitHubModelsClient (`githubModelsClient.ts`)

Hauptclient für API-Kommunikation.

**Features:**
- Non-streaming und Streaming Requests
- Automatische Retry-Logic bei 429/5xx Fehlern
- Exponential Backoff mit Jitter
- Token-Kostenberechnung

```typescript
// Non-streaming
const { response, cost } = await client.chatCompletion(messages, {
  model: 'gpt-4.1',
  temperature: 0.7,
  max_tokens: 2000,
});

// Streaming
const stream = client.streamChatCompletion(messages, { stream: true });
for await (const chunk of stream) {
  console.log(chunk.choices[0]?.delta?.content);
}
```

### 2. ModelRouter (`modelRouter.ts`)

Kostenoptimierte Modell-Auswahl basierend auf Task-Komplexität.

**Routing-Strategie:**

| Komplexität | Modell | Multiplier | Use Case |
|------------|--------|------------|----------|
| Simple | gemini-2.0-flash | 0.25x | Übersetzungen, Klassifizierungen |
| Standard | gpt-4.1 | 1x | Dokumentation, Standard-Anfragen |
| Complex | claude-3.7-sonnet | 1x | Analyse, Debugging, Architektur |
| Fallback | gpt-4o-mini | 0.075x | Budget-Requests |

```typescript
const router = new ModelRouter();

// Automatisches Routing
const routing = router.route(messages);
// → { model: 'gemini-2.0-flash', complexity: 'simple', ... }

// Mit Anforderungen
const routing = router.route(messages, {
  requiresTools: true,
  maxCostMultiplier: 1.0,
  preferredProvider: 'openai',
});
```

### 3. StreamingHandler (`streamingHandler.ts`)

Verarbeitet Server-Sent Events und broadcastet zu WebSocket.

```typescript
const streamingHandler = new StreamingHandler(webSocketManager);

const result = await streamingHandler.processStream(stream, {
  sessionId: 'sess_123',
  userId: 'user_456',
  requestId: 'req_789',
  model: 'gpt-4.1',
});

// result.content - Vollständiger Text
// result.usage - Token Usage
// result.duration - Verarbeitungszeit
```

**WebSocket Events:**
- `stream_chunk` - Einzelnes Token/Stück
- `stream_complete` - Stream beendet
- `stream_error` - Fehler aufgetreten
- `usage_update` - Token Usage Update

### 4. TokenTracker (`tokenTracker.ts`)

Redis-basiertes Usage-Tracking.

```typescript
const tokenTracker = new TokenTracker(redisClient);

// Usage tracken
await tokenTracker.trackUsage({
  userId: 'user_123',
  sessionId: 'sess_456',
  model: 'gpt-4.1',
  usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  estimatedCost: 0.0004,
  timestamp: new Date(),
  requestId: 'req_789',
  endpoint: '/chat/completions',
});

// Statistiken abrufen
const session = await tokenTracker.getSessionUsage('sess_456');
const daily = await tokenTracker.getUserDailyUsage('user_123');
const stats = await tokenTracker.getUserUsageStats('user_123', 30);
```

**Redis Keys:**
- `tokens:session:{id}` - Session-Usage
- `tokens:user:{id}:daily:{date}` - Tägliche User-Usage
- `tokens:user:{id}:monthly:{month}` - Monatliche User-Usage
- `tokens:global:daily:{date}` - Globale tägliche Usage

## Verfügbare Modelle

### OpenAI
- `gpt-4o` - 128K Kontext, Tool Support
- `gpt-4.1` - Empfohlen für Standard-Tasks
- `gpt-4.5` - Höchste Qualität, teurer
- `gpt-4o-mini` - Budget-Option

### Anthropic
- `claude-3.5-sonnet` - Ausgewogene Performance
- `claude-3.7-sonnet` - Empfohlen für komplexe Tasks
- `claude-opus-4` - Höchste Qualität, teuer

### Google
- `gemini-2.0-flash` - Sehr schnell & günstig
- `gemini-2.5-pro` - Hohe Qualität, 1M Kontext

### Meta
- `llama-4` - Open Source, kein Tool Support

## Fehlerbehandlung

```typescript
try {
  await client.chatCompletion(messages);
} catch (error) {
  const err = error as GitHubModelsError;
  
  if (err.code === 'RATE_LIMIT_EXCEEDED') {
    // 429 - Zu viele Requests
    console.log(`Retry after ${err.retryAfter}s`);
  } else if (err.code === 'INVALID_TOKEN') {
    // 401 - Token ungültig
    console.error('Token überprüfen!');
  } else if (err.code === 'REQUEST_TIMEOUT') {
    // Timeout - Retry möglich
    console.error('Request timeout');
  }
}
```

## Kosten-Optimierungs-Strategie

### 1. Smart Routing
```typescript
// Automatische Modell-Auswahl basierend auf Komplexität
const routing = router.route(messages);
```

### 2. Budget-Limits
```typescript
const routing = router.route(messages, {
  maxCostMultiplier: 0.5, // Nur Modelle <= 0.5x Kosten
});
```

### 3. Caching
```typescript
const router = new ModelRouter();

// Cache aktivieren für wiederholte Requests
const routing = router.route(messages, { useCache: true });
```

### 4. Kosten-Monitoring
```typescript
const tokenTracker = new TokenTracker(redis);

// Monatliche Kosten überwachen
const monthly = await tokenTracker.getUserMonthlyUsage('user_123');
if (monthly.estimatedCost > 100) {
  console.warn('Budget-Limit erreicht!');
}
```

## API Referenz

Siehe `types.ts` für alle Interfaces und `example.ts` für ausführliche Beispiele.

## Environment Variables

| Variable | Beschreibung | Default |
|----------|-------------|---------|
| `GITHUB_TOKEN` | GitHub Personal Access Token | - |
| `GITHUB_MODELS_ENDPOINT` | API Endpoint | `https://models.github.ai/inference/chat/completions` |

## License

MIT - Teil der MediSync Agenten-Plattform
