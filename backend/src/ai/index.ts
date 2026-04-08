/**
 * GitHub Models AI Client - Haupt-Export
 * 
 * MediSync Agenten-Plattform
 * 
 * @example
 * ```typescript
 * import { 
 *   GitHubModelsClient, 
 *   ModelRouter, 
 *   StreamingHandler, 
 *   TokenTracker 
 * } from './ai';
 * 
 * // Client initialisieren
 * const client = new GitHubModelsClient({ token: process.env.GITHUB_TOKEN });
 * 
 * // Router für kostenoptimierte Modell-Auswahl
 * const router = new ModelRouter();
 * 
 * // Request routen
 * const routing = router.route(messages);
 * console.log(`Verwende Modell: ${routing.model} (${routing.reason})`);
 * 
 * // Streaming Request
 * const stream = client.streamChatCompletion(messages, { model: routing.model });
 * 
 * // Mit Streaming Handler verarbeiten
 * const handler = new StreamingHandler(webSocketManager);
 * const result = await handler.processStream(stream, {
 *   sessionId: 'sess_123',
 *   userId: 'user_456',
 *   requestId: 'req_789',
 *   model: routing.model
 * });
 * ```
 */

// Types
export * from './types';

// GitHub Models Client
export {
  GitHubModelsClient,
  initializeClient,
  getClient,
  calculateCost,
  MODEL_COSTS,
} from './githubModelsClient';

// Model Router
export {
  ModelRouter,
  initializeRouter,
  getRouter,
  routeRequest,
  selectModel,
  analyzeComplexity,
  MODEL_CONFIGS,
  DEFAULT_ROUTER_CONFIG,
} from './modelRouter';

// Streaming Handler
export {
  StreamingHandler,
  StreamAccumulator,
  SSEParser,
  createStreamingHandler,
  createStreamAccumulator,
  createReadableStreamFromGenerator,
  combineChunks,
} from './streamingHandler';

// Token Tracker
export {
  TokenTracker,
  createTokenTracker,
  createTokenUsageEntry,
  REDIS_KEYS,
} from './tokenTracker';

// Re-Export wichtiger Typen für einfachen Zugriff
export type {
  GitHubModel,
  Message,
  TaskComplexity,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamingChunk,
  TokenUsage,
  RoutingResult,
  AccumulatedResponse,
  TokenUsageEntry,
  AggregatedTokenUsage,
  WebSocketManager,
  RedisClient,
} from './types';
