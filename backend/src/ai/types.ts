/**
 * Gemeinsame TypeScript Interfaces für den GitHub Models AI Client
 * MediSync Agenten-Plattform
 */

// Message Rollen für Chat Completions
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

// Einzelne Chat Message
export interface Message {
  role: MessageRole;
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

// Tool Call für Function Calling
export interface ToolCall {
  id: string;
  type: 'function';
  index?: number;
  function: {
    name: string;
    arguments: string;
  };
}

// Verfügbare Modelle auf GitHub Models
export type GitHubModel =
  // OpenAI Models
  | 'gpt-4o'
  | 'gpt-4.1'
  | 'gpt-4.5'
  | 'gpt-4o-mini'
  // Anthropic Models
  | 'claude-3.5-sonnet'
  | 'claude-3.7-sonnet'
  | 'claude-opus-4'
  // Google Models
  | 'gemini-2.0-flash'
  | 'gemini-2.5-pro'
  // Meta Models
  | 'llama-4';

// Task Komplexität für Routing
export type TaskComplexity = 'simple' | 'standard' | 'complex' | 'fallback';

// Modell-Konfiguration mit Kosten-Multiplikator
export interface ModelConfig {
  id: GitHubModel;
  name: string;
  provider: 'openai' | 'anthropic' | 'google' | 'meta';
  costMultiplier: number;
  maxTokens: number;
  contextWindow: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  recommendedFor: TaskComplexity[];
}

// Chat Completion Request
export interface ChatCompletionRequest {
  model: GitHubModel;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

// Tool Definition für Function Calling
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// Chat Completion Response (non-streaming)
export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Choice[];
  usage?: TokenUsage;
}

// Einzelne Choice im Response
export interface Choice {
  index: number;
  message: Message;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  delta?: Partial<Message>; // Für Streaming
}

// Token Usage Information
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// Streaming Chunk
export interface StreamingChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Choice[];
}

// Router Konfiguration
export interface RouterConfig {
  defaultModel: GitHubModel;
  fallbackModel: GitHubModel;
  complexityThresholds: {
    simple: number;    // Max tokens für simple tasks
    standard: number;  // Max tokens für standard tasks
  };
  keywordMappings: Record<string, TaskComplexity>;
}

// Token Tracking Eintrag
export interface TokenUsageEntry {
  userId: string;
  sessionId: string;
  model: GitHubModel;
  timestamp: Date;
  usage: TokenUsage;
  estimatedCost: number; // In USD
  requestId: string;
  endpoint: string;
}

// Aggregierte Token Usage
export interface AggregatedTokenUsage {
  userId: string;
  date: string; // YYYY-MM-DD
  totalRequests: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  estimatedCost: number;
  modelBreakdown: Record<GitHubModel, {
    requests: number;
    tokens: number;
    cost: number;
  }>;
}

// Redis Token Tracking Key Struktur
export interface TokenTrackingKeys {
  session: (sessionId: string) => string;
  userDaily: (userId: string, date: string) => string;
  userMonthly: (userId: string, month: string) => string;
  globalDaily: (date: string) => string;
}

// Retry Konfiguration
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableStatusCodes: number[];
}

// GitHub Models Client Konfiguration
export interface GitHubModelsConfig {
  endpoint: string;
  token: string;
  defaultModel: GitHubModel;
  defaultTemperature: number;
  defaultMaxTokens: number;
  timeout: number;
  retry: RetryConfig;
}

// WebSocket Broadcast Message
export interface WebSocketBroadcastMessage {
  type: 'stream_chunk' | 'stream_complete' | 'stream_error' | 'usage_update';
  sessionId: string;
  userId: string;
  payload: unknown;
  timestamp: number;
}

// Streaming Handler Konfiguration
export interface StreamingHandlerConfig {
  webSocketManager?: WebSocketManager;
  accumulateResponse: boolean;
  emitUsageEvents: boolean;
}

// WebSocket Manager Interface (wird von außen bereitgestellt)
export interface WebSocketManager {
  broadcastToSession: (sessionId: string, message: WebSocketBroadcastMessage) => void;
  broadcastToUser: (userId: string, message: WebSocketBroadcastMessage) => void;
}

// Fehler Typen
export interface GitHubModelsError extends Error {
  code: string;
  statusCode?: number;
  isRetryable: boolean;
  requestId?: string;
}

// API Rate Limit Info
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTimestamp: number;
  retryAfter?: number;
}

// Gesammelter Streaming Response
export interface AccumulatedResponse {
  content: string;
  toolCalls: ToolCall[];
  usage: TokenUsage;
  finishReason: string | null;
  model: string;
  startTime: number;
  endTime: number;
  duration: number;
}

// Routing Result
export interface RoutingResult {
  model: GitHubModel;
  reason: string;
  complexity: TaskComplexity;
  estimatedTokens: number;
}

// Redis Client Interface
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: (string | number)[]): Promise<string | null>;
  del(key: string): Promise<number>;
  hdel(key: string, ...fields: (string | number)[]): Promise<number>;
  zrem(key: string, ...members: (string | number)[]): Promise<number>;
  zcard(key: string): Promise<number>;
  zremrangebyrank(key: string, start: number, stop: number): Promise<number>;
  zincrby(key: string, increment: number, member: string): Promise<string | number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  hset(key: string, field: string, value: string): Promise<number>;
  hget(key: string, field: string): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string>>;
  hincrby(key: string, field: string, increment: number): Promise<number>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  zrevrange(key: string, start: number, stop: number): Promise<string[]>;
  zrevrangeWithScores(key: string, start: number, stop: number): Promise<Array<{ value: string; score: number }>>;
  keys(pattern: string): Promise<string[]>;
  mget(keys: string[]): Promise<(string | null)[]>;
  pipeline(): { 
    hincrby(key: string, field: string, increment: number): { hincrby: (key: string, field: string, increment: number) => any };
    expire(key: string, seconds: number): { expire: (key: string, seconds: number) => any };
    exec(): Promise<[Error | null, unknown][] | null>;
  };
}
