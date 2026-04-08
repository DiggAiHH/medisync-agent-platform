/**
 * GitHub Models API Client
 * 
 * Implementiert die GitHub Models Inference API mit:
 * - Streaming Support
 * - Retry-Logic mit Exponential Backoff
 * - Rate Limit Handling
 * - TypeScript Type Safety
 * 
 * Endpoint: https://models.github.ai/inference/chat/completions
 */

import {
  GitHubModel,
  Message,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamingChunk,
  TokenUsage,
  ToolDefinition,
  GitHubModelsConfig,
  GitHubModelsError,
  RateLimitInfo,
  AccumulatedResponse,
  RetryConfig,
} from './types';

// Standard Konfiguration
const DEFAULT_CONFIG: Partial<GitHubModelsConfig> = {
  endpoint: 'https://models.github.ai/inference/chat/completions',
  defaultModel: 'gpt-4.1',
  defaultTemperature: 0.7,
  defaultMaxTokens: 2048,
  timeout: 60000,
  retry: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    retryableStatusCodes: [429, 500, 502, 503, 504],
  },
};

// Kosten pro 1K Tokens (geschätzt basierend auf aktuellen Preisen)
const MODEL_COSTS: Record<GitHubModel, { input: number; output: number }> = {
  // OpenAI Models
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4.1': { input: 0.002, output: 0.008 },
  'gpt-4.5': { input: 0.03, output: 0.06 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  // Anthropic Models
  'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3.7-sonnet': { input: 0.003, output: 0.015 },
  'claude-opus-4': { input: 0.015, output: 0.075 },
  // Google Models
  'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
  'gemini-2.5-pro': { input: 0.00125, output: 0.01 },
  // Meta Models
  'llama-4': { input: 0.0005, output: 0.0015 },
};

/**
 * Berechnet die geschätzten Kosten für einen Request
 */
export function calculateCost(model: GitHubModel, usage: TokenUsage): number {
  const costs = MODEL_COSTS[model];
  if (!costs) return 0;

  const inputCost = (usage.prompt_tokens / 1000) * costs.input;
  const outputCost = (usage.completion_tokens / 1000) * costs.output;
  return Number((inputCost + outputCost).toFixed(6));
}

/**
 * Erstellt einen standardisierten Fehler
 */
function createError(
  message: string,
  code: string,
  statusCode?: number,
  isRetryable: boolean = false,
  requestId?: string
): GitHubModelsError {
  const error = new Error(message) as GitHubModelsError;
  error.code = code;
  error.statusCode = statusCode;
  error.isRetryable = isRetryable;
  error.requestId = requestId;
  return error;
}

/**
 * Extrahiert Rate Limit Informationen aus Response Headers
 */
function extractRateLimitInfo(headers: Headers): RateLimitInfo | null {
  const limit = headers.get('x-ratelimit-limit');
  const remaining = headers.get('x-ratelimit-remaining');
  const reset = headers.get('x-ratelimit-reset');
  const retryAfter = headers.get('retry-after');

  if (!limit || !remaining) return null;

  return {
    limit: parseInt(limit, 10),
    remaining: parseInt(remaining, 10),
    resetTimestamp: reset ? parseInt(reset, 10) * 1000 : Date.now() + 60000,
    retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
  };
}

/**
 * Berechnet die Delay für Retry mit Exponential Backoff
 */
function calculateRetryDelay(
  attempt: number,
  rateLimitInfo: RateLimitInfo | null,
  config: RetryConfig
): number {
  // Wenn Retry-After Header vorhanden, verwende diesen
  if (rateLimitInfo?.retryAfter) {
    return rateLimitInfo.retryAfter * 1000;
  }

  // Exponential Backoff: baseDelay * 2^attempt + jitter
  const exponentialDelay = config.baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  const delay = Math.min(exponentialDelay + jitter, config.maxDelay);

  return Math.floor(delay);
}

/**
 * Wartet für die angegebene Zeit
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GitHub Models API Client Klasse
 */
export class GitHubModelsClient {
  private config: GitHubModelsConfig;

  constructor(config?: Partial<GitHubModelsConfig>) {
    const token = config?.token || process.env.GITHUB_TOKEN;
    if (!token) {
      throw createError(
        'GITHUB_TOKEN ist nicht gesetzt',
        'MISSING_AUTH_TOKEN',
        undefined,
        false
      );
    }

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      token,
      retry: {
        ...DEFAULT_CONFIG.retry,
        ...config?.retry,
      },
    } as GitHubModelsConfig;
  }

  /**
   * Aktualisiert die Client-Konfiguration
   */
  public updateConfig(config: Partial<GitHubModelsConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Führt einen Chat Completion Request durch (non-streaming)
   */
  public async chatCompletion(
    messages: Message[],
    options?: Partial<Omit<ChatCompletionRequest, 'messages' | 'stream'>>
  ): Promise<{ response: ChatCompletionResponse; cost: number }> {
    const requestBody: ChatCompletionRequest = {
      model: options?.model || this.config.defaultModel,
      messages,
      temperature: options?.temperature ?? this.config.defaultTemperature,
      max_tokens: options?.max_tokens ?? this.config.defaultMaxTokens,
      top_p: options?.top_p,
      tools: options?.tools,
      tool_choice: options?.tool_choice,
      stream: false,
    };

    const response = await this.makeRequest<ChatCompletionResponse>(requestBody);
    const cost = response.usage
      ? calculateCost(requestBody.model, response.usage)
      : 0;

    return { response, cost };
  }

  /**
   * Streaming Chat Completion - Yields Chunks
   */
  public async *streamChatCompletion(
    messages: Message[],
    options?: Partial<Omit<ChatCompletionRequest, 'messages' | 'stream'>>
  ): AsyncGenerator<StreamingChunk, { usage?: TokenUsage; cost: number; model: string }, unknown> {
    const model = options?.model || this.config.defaultModel;
    const requestBody: ChatCompletionRequest = {
      model,
      messages,
      temperature: options?.temperature ?? this.config.defaultTemperature,
      max_tokens: options?.max_tokens ?? this.config.defaultMaxTokens,
      top_p: options?.top_p,
      tools: options?.tools,
      tool_choice: options?.tool_choice,
      stream: true,
    };

    const { response, reader, decoder } = await this.makeStreamingRequest(requestBody);
    
    let accumulatedContent = '';
    let usage: TokenUsage | undefined;
    let buffer = '';

    try {
      let chunkCount = 0;

      // Verarbeite alle Chunks
      for await (const chunk of streamGenerator()) {
        chunkCount++;
        
        // Extrahiere Delta-Informationen
        const choice = chunk.choices[0];
        if (!choice) continue;

        // Verarbeite Content
        const deltaContent = choice.delta?.content;
        if (deltaContent) {
          accumulatedContent += deltaContent;
        }

        yield chunk;
      }

      // Schätze Usage wenn nicht vom Server bereitgestellt
      if (!usage) {
        const promptTokens = this.estimateTokenCount(messages.map(m => m.content).join(' '));
        const completionTokens = this.estimateTokenCount(accumulatedContent);
        usage = {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        };
      }

      const cost = calculateCost(model, usage);

      return { usage, cost, model };
    } finally {
      reader.releaseLock();
    }

    async function* streamGenerator(): AsyncGenerator<StreamingChunk> {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;

          if (trimmedLine.startsWith('data: ')) {
            try {
              const jsonStr = trimmedLine.slice(6);
              const chunk: StreamingChunk = JSON.parse(jsonStr);
              yield chunk;
            } catch (parseError) {
              console.warn('Fehler beim Parsen des Streaming Chunks:', parseError);
            }
          }
        }
      }

      // Verarbeite verbleibenden Buffer
      if (buffer.trim()) {
        const trimmedLine = buffer.trim();
        if (trimmedLine.startsWith('data: ') && trimmedLine !== 'data: [DONE]') {
          try {
            const jsonStr = trimmedLine.slice(6);
            const chunk: StreamingChunk = JSON.parse(jsonStr);
            yield chunk;
          } catch {
            // Ignoriere unparsebare letzte Zeilen
          }
        }
      }
    }
  }

  /**
   * Interne Methode für HTTP Requests mit Retry-Logic
   */
  private async makeRequest<T>(
    requestBody: ChatCompletionRequest,
    attempt: number = 0
  ): Promise<T> {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), this.config.timeout);

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);

      // Rate Limit Handling
      if (response.status === 429) {
        const rateLimitInfo = extractRateLimitInfo(response.headers);
        
        if (attempt < this.config.retry.maxRetries) {
          const delay = calculateRetryDelay(attempt, rateLimitInfo, this.config.retry);
          console.warn(`Rate limit erreicht. Warte ${delay}ms vor Retry ${attempt + 1}/${this.config.retry.maxRetries}`);
          await sleep(delay);
          return this.makeRequest(requestBody, attempt + 1);
        }

        throw createError(
          'Rate limit überschritten. Bitte versuchen Sie es später erneut.',
          'RATE_LIMIT_EXCEEDED',
          429,
          false,
          requestBody.model
        );
      }

      // Auth Fehler
      if (response.status === 401) {
        throw createError(
          'Ungültiger oder abgelaufener GitHub Token',
          'INVALID_TOKEN',
          401,
          false
        );
      }

      // Server Fehler mit Retry
      if (this.config.retry.retryableStatusCodes.includes(response.status)) {
        if (attempt < this.config.retry.maxRetries) {
          const delay = calculateRetryDelay(attempt, null, this.config.retry);
          console.warn(`Server Fehler ${response.status}. Retry ${attempt + 1}/${this.config.retry.maxRetries} nach ${delay}ms`);
          await sleep(delay);
          return this.makeRequest(requestBody, attempt + 1);
        }
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw createError(
          `GitHub Models API Fehler: ${response.status} - ${errorBody}`,
          'API_ERROR',
          response.status,
          response.status >= 500
        );
      }

      return await response.json() as T;
    } catch (error) {
      clearTimeout(timeoutId);

      // Abort Error (Timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw createError(
          'Request timeout - Die Anfrage hat zu lange gedauert',
          'REQUEST_TIMEOUT',
          undefined,
          true
        );
      }

      // Bereits verarbeiteter Fehler
      if ((error as GitHubModelsError).code) {
        throw error;
      }

      // Netzwerk Fehler mit Retry
      if (error instanceof TypeError && attempt < this.config.retry.maxRetries) {
        const delay = calculateRetryDelay(attempt, null, this.config.retry);
        console.warn(`Netzwerkfehler. Retry ${attempt + 1}/${this.config.retry.maxRetries} nach ${delay}ms`);
        await sleep(delay);
        return this.makeRequest(requestBody, attempt + 1);
      }

      throw createError(
        `Unerwarteter Fehler: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UNKNOWN_ERROR',
        undefined,
        false
      );
    }
  }

  /**
   * Interne Methode für Streaming Requests
   */
  private async makeStreamingRequest(
    requestBody: ChatCompletionRequest
  ): Promise<{
    response: Response;
    reader: ReadableStreamDefaultReader<Uint8Array>;
    decoder: TextDecoder;
  }> {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), this.config.timeout);

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401) {
          throw createError(
            'Ungültiger oder abgelaufener GitHub Token',
            'INVALID_TOKEN',
            401,
            false
          );
        }
        if (response.status === 429) {
          throw createError(
            'Rate limit überschritten',
            'RATE_LIMIT_EXCEEDED',
            429,
            false
          );
        }

        const errorBody = await response.text();
        throw createError(
          `GitHub Models API Fehler: ${response.status} - ${errorBody}`,
          'API_ERROR',
          response.status,
          response.status >= 500
        );
      }

      if (!response.body) {
        throw createError(
          'Response body ist null',
          'EMPTY_RESPONSE',
          undefined,
          false
        );
      }

      return {
        response,
        reader: response.body.getReader(),
        decoder: new TextDecoder(),
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw createError(
          'Request timeout',
          'REQUEST_TIMEOUT',
          undefined,
          true
        );
      }

      throw error;
    }
  }

  /**
   * Schätzt die Token-Anzahl für einen Text
   * Grobe Schätzung: ~4 Zeichen pro Token
   */
  private estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Validiert einen GitHub Token
   */
  public async validateToken(): Promise<{ valid: boolean; error?: string }> {
    try {
      // Einfacher Test-Request mit minimalem Payload
      await this.chatCompletion(
        [{ role: 'user', content: 'Hi' }],
        { max_tokens: 1 }
      );
      return { valid: true };
    } catch (error) {
      const ghError = error as GitHubModelsError;
      if (ghError.code === 'INVALID_TOKEN') {
        return { valid: false, error: 'Ungültiger Token' };
      }
      // Andere Fehler sind ok - Token ist gültig, aber API hat andere Probleme
      if (ghError.statusCode && ghError.statusCode !== 401) {
        return { valid: true };
      }
      return { valid: false, error: ghError.message };
    }
  }

  /**
   * Gibt die aktuelle Konfiguration zurück
   */
  public getConfig(): Readonly<GitHubModelsConfig> {
    return Object.freeze({ ...this.config });
  }
}

// Singleton Export für einfachen Zugriff
let globalClient: GitHubModelsClient | null = null;

export function initializeClient(config?: Partial<GitHubModelsConfig>): GitHubModelsClient {
  globalClient = new GitHubModelsClient(config);
  return globalClient;
}

export function getClient(): GitHubModelsClient {
  if (!globalClient) {
    return initializeClient();
  }
  return globalClient;
}

export { MODEL_COSTS };
