/**
 * Beispiel-Verwendung des GitHub Models AI Clients
 * 
 * Diese Datei zeigt, wie alle Komponenten zusammenarbeiten
 */

import {
  GitHubModelsClient,
  ModelRouter,
  StreamingHandler,
  TokenTracker,
  createTokenUsageEntry,
  Message,
  RedisClient,
  WebSocketManager,
} from './index';

// =============================================================================
// BEISPIEL 1: Einfacher Chat Completion Request
// =============================================================================

async function simpleExample() {
  // Client initialisieren
  const client = new GitHubModelsClient({
    token: process.env.GITHUB_TOKEN!,
    defaultModel: 'gpt-4.1',
  });

  // Nachrichten erstellen
  const messages: Message[] = [
    { role: 'system', content: 'Du bist ein hilfreicher Assistent für Ärzte.' },
    { role: 'user', content: 'Zusammenfassung: Patient hat Kopfschmerzen und Fieber seit 3 Tagen.' },
  ];

  // Non-streaming Request
  const { response, cost } = await client.chatCompletion(messages);
  
  console.log('Response:', response.choices[0].message.content);
  console.log('Cost:', cost);
  console.log('Usage:', response.usage);
}

// =============================================================================
// BEISPIEL 2: Mit Model Router (Kosten-Optimierung)
// =============================================================================

async function routerExample() {
  const client = new GitHubModelsClient({
    token: process.env.GITHUB_TOKEN!,
  });

  const router = new ModelRouter();

  // Einfacher Task → wird zu gemini-2.0-flash geroutet
  const simpleMessages: Message[] = [
    { role: 'user', content: 'Übersetze "Hello World" auf Deutsch' },
  ];

  const simpleRouting = router.route(simpleMessages);
  console.log(`Einfacher Task: ${simpleRouting.model} (${simpleRouting.reason})`);
  // Ausgabe: gemini-2.0-flash

  // Komplexer Task → wird zu claude-3.7-sonnet geroutet
  const complexMessages: Message[] = [
    { 
      role: 'user', 
      content: 'Analysiere diesen komplexen medizinischen Fall mit Differentialdiagnosen und Behandlungsoptionen...' 
    },
  ];

  const complexRouting = router.route(complexMessages);
  console.log(`Komplexer Task: ${complexRouting.model} (${complexRouting.reason})`);
  // Ausgabe: claude-3.7-sonnet

  // Request mit geroutetem Modell
  const { response } = await client.chatCompletion(complexMessages, {
    model: complexRouting.model,
  });
}

// =============================================================================
// BEISPIEL 3: Streaming mit WebSocket Broadcast
// =============================================================================

async function streamingExample() {
  // WebSocket Manager (wird normalerweise extern bereitgestellt)
  const mockWebSocketManager: WebSocketManager = {
    broadcastToSession: (sessionId, message) => {
      console.log(`[WebSocket:${sessionId}]`, message.type);
    },
    broadcastToUser: (userId, message) => {
      console.log(`[WebSocket:${userId}]`, message.type);
    },
  };

  const client = new GitHubModelsClient({
    token: process.env.GITHUB_TOKEN!,
  });

  // Streaming Handler mit WebSocket
  const streamingHandler = new StreamingHandler(mockWebSocketManager, {
    emitUsageEvents: true,
  });

  const messages: Message[] = [
    { role: 'user', content: 'Schreibe einen ausführlichen Bericht über...' },
  ];

  // Streaming starten
  const stream = client.streamChatCompletion(messages, {
    model: 'gpt-4.1',
    max_tokens: 2000,
  });

  // Stream verarbeiten und accumulieren
  const result = await streamingHandler.processStream(stream, {
    sessionId: 'sess_abc123',
    userId: 'user_xyz789',
    requestId: 'req_456',
    model: 'gpt-4.1',
  });

  console.log('Accumulated Content:', result.content);
  console.log('Duration:', result.duration, 'ms');
  console.log('Usage:', result.usage);
}

// =============================================================================
// BEISPIEL 4: Token Tracking mit Redis
// =============================================================================

async function tokenTrackingExample() {
  // Mock Redis Client (in Produktion: echte Redis-Verbindung)
  const mockRedis: RedisClient = {
    hincrby: async () => 1,
    hgetall: async () => ({}),
    hset: async () => 1,
    expire: async () => 1,
    get: async () => null,
    set: async () => null,
    zadd: async () => 1,
    zrange: async () => [],
    zremrangebyrank: async () => 0,
  };

  const tokenTracker = new TokenTracker(mockRedis);
  const client = new GitHubModelsClient({
    token: process.env.GITHUB_TOKEN!,
  });

  // Request durchführen
  const messages: Message[] = [
    { role: 'user', content: 'Klassifiziere diese Symptome' },
  ];

  const { response, cost } = await client.chatCompletion(messages, {
    model: 'gemini-2.0-flash',
  });

  // Usage tracken
  if (response.usage) {
    const usageEntry = createTokenUsageEntry(
      'user_123',
      'session_456',
      'gemini-2.0-flash',
      response.usage,
      'req_789',
      '/chat/completions'
    );

    await tokenTracker.trackUsage(usageEntry);
  }

  // Statistiken abrufen
  const sessionUsage = await tokenTracker.getSessionUsage('session_456');
  console.log('Session Usage:', sessionUsage);

  const dailyUsage = await tokenTracker.getUserDailyUsage('user_123');
  console.log('Daily Usage:', dailyUsage);

  const monthlyStats = await tokenTracker.getUserUsageStats('user_123', 30);
  console.log('Monthly Stats:', monthlyStats);
}

// =============================================================================
// BEISPIEL 5: Komplette Integration
// =============================================================================

async function completeIntegrationExample() {
  // Dependencies
  const redis: RedisClient = {
    hincrby: async () => 1,
    hgetall: async () => ({}),
    hset: async () => 1,
    expire: async () => 1,
    get: async () => null,
    set: async () => null,
    zadd: async () => 1,
    zrange: async () => [],
    zremrangebyrank: async () => 0,
  };

  const webSocketManager: WebSocketManager = {
    broadcastToSession: (sessionId, message) => {
      // In Produktion: WebSocket.io oder ähnliches
      console.log(`[WS:${sessionId}] ${message.type}`);
    },
    broadcastToUser: (userId, message) => {
      console.log(`[WS:${userId}] ${message.type}`);
    },
  };

  // Komponenten initialisieren
  const client = new GitHubModelsClient({
    token: process.env.GITHUB_TOKEN!,
    defaultModel: 'gpt-4.1',
  });

  const router = new ModelRouter();
  const streamingHandler = new StreamingHandler(webSocketManager);
  const tokenTracker = new TokenTracker(redis);

  // Request-Kontext
  const context = {
    sessionId: 'sess_medical_001',
    userId: 'user_dr_schmidt',
    requestId: 'req_' + Date.now(),
  };

  // Nachrichten
  const messages: Message[] = [
    { 
      role: 'system', 
      content: 'Du bist ein medizinischer KI-Assistent. Hilfe bei der Dokumentation und Analyse.' 
    },
    { 
      role: 'user', 
      content: 'Patient: 45-jähriger Mann, beschwerdefrei, Routineuntersuchung. Bitte einen Vorschlag für die Dokumentation erstellen.' 
    },
  ];

  // 1. Modell-Routing (kostenoptimiert)
  const routing = router.route(messages, {
    maxCostMultiplier: 1.0, // Optional: Budget-Limit
  });

  console.log(`🎯 Routing: ${routing.model} (${routing.reason})`);
  console.log(`💰 Geschätzte Kosten: $${routing.estimatedCost.toFixed(4)}`);

  // 2. Streaming Request
  const stream = client.streamChatCompletion(messages, {
    model: routing.model,
    temperature: 0.3,
    max_tokens: 1500,
  });

  // 3. Stream verarbeiten + WebSocket Broadcast
  const result = await streamingHandler.processStream(stream, {
    ...context,
    model: routing.model,
  });

  // 4. Token Usage tracken
  const usageEntry = createTokenUsageEntry(
    context.userId,
    context.sessionId,
    routing.model,
    result.usage,
    context.requestId,
    '/chat/completions'
  );

  await tokenTracker.trackUsage(usageEntry);

  // 5. Ergebnis zurückgeben
  return {
    content: result.content,
    model: routing.model,
    cost: calculateCost(routing.model, result.usage),
    duration: result.duration,
    usage: result.usage,
  };
}

// Hilfsfunktion für Kostenberechnung
function calculateCost(model: string, usage: { prompt_tokens: number; completion_tokens: number }): number {
  const costs: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 0.0025, output: 0.01 },
    'gpt-4.1': { input: 0.002, output: 0.008 },
    'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
  };

  const modelCosts = costs[model] || { input: 0.002, output: 0.008 };
  const inputCost = (usage.prompt_tokens / 1000) * modelCosts.input;
  const outputCost = (usage.completion_tokens / 1000) * modelCosts.output;
  return Number((inputCost + outputCost).toFixed(6));
}

// =============================================================================
// BEISPIEL 6: Error Handling & Retry
// =============================================================================

async function errorHandlingExample() {
  const client = new GitHubModelsClient({
    token: process.env.GITHUB_TOKEN!,
    retry: {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      retryableStatusCodes: [429, 500, 502, 503, 504],
    },
  });

  try {
    const { response } = await client.chatCompletion([
      { role: 'user', content: 'Hallo' },
    ]);
    
    console.log('Success:', response.choices[0].message.content);
  } catch (error) {
    const err = error as { code?: string; message: string; statusCode?: number };
    
    switch (err.code) {
      case 'RATE_LIMIT_EXCEEDED':
        console.error('⏳ Rate limit erreicht. Bitte später erneut versuchen.');
        break;
      case 'INVALID_TOKEN':
        console.error('🔑 Ungültiger GitHub Token. Bitte Token überprüfen.');
        break;
      case 'REQUEST_TIMEOUT':
        console.error('⏱️ Request hat zu lange gedauert.');
        break;
      default:
        console.error('❌ Fehler:', err.message);
    }
  }
}

// Export für Tests
export {
  simpleExample,
  routerExample,
  streamingExample,
  tokenTrackingExample,
  completeIntegrationExample,
  errorHandlingExample,
};
