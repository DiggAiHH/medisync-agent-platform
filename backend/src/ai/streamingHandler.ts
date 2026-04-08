/**
 * Streaming Handler für GitHub Models API
 * 
 * Verarbeitet Server-Sent Events (SSE) und:
 * - Broadcastet zu WebSocket
 * - Baut die Response zusammen
 * - Tracked Token Usage
 */

import {
  StreamingChunk,
  TokenUsage,
  AccumulatedResponse,
  WebSocketManager,
  WebSocketBroadcastMessage,
  StreamingHandlerConfig,
  GitHubModel,
} from './types';

// Default Konfiguration
const DEFAULT_STREAMING_CONFIG: StreamingHandlerConfig = {
  accumulateResponse: true,
  emitUsageEvents: true,
};

/**
 * Streaming Handler Klasse
 */
export class StreamingHandler {
  private config: StreamingHandlerConfig;
  private webSocketManager?: WebSocketManager;

  constructor(
    webSocketManager?: WebSocketManager,
    config?: Partial<StreamingHandlerConfig>
  ) {
    this.webSocketManager = webSocketManager;
    this.config = { ...DEFAULT_STREAMING_CONFIG, ...config };
  }

  /**
   * Verarbeitet einen Streaming Response
   */
  public async processStream(
    streamGenerator: AsyncGenerator<StreamingChunk, { usage?: TokenUsage; cost: number; model: string }, unknown>,
    context: {
      sessionId: string;
      userId: string;
      requestId: string;
      model: GitHubModel;
    }
  ): Promise<AccumulatedResponse> {
    const startTime = Date.now();
    
    const accumulated: AccumulatedResponse = {
      content: '',
      toolCalls: [],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
      finishReason: null,
      model: context.model,
      startTime,
      endTime: 0,
      duration: 0,
    };

    try {
      let chunkCount = 0;

      // Verarbeite alle Chunks
      for await (const chunk of streamGenerator) {
        chunkCount++;
        
        // Extrahiere Delta-Informationen
        const choice = chunk.choices[0];
        if (!choice) continue;

        // Verarbeite Content
        const deltaContent = choice.delta?.content;
        if (deltaContent) {
          accumulated.content += deltaContent;
        }

        // Verarbeite Tool Calls
        const deltaToolCalls = choice.delta?.tool_calls;
        if (deltaToolCalls) {
          for (const toolCall of deltaToolCalls) {
            if (toolCall.id) {
              // Neuer Tool Call
              accumulated.toolCalls.push({
                id: toolCall.id,
                type: 'function',
                function: {
                  name: toolCall.function?.name || '',
                  arguments: toolCall.function?.arguments || '',
                },
              });
            } else if (toolCall.index !== undefined && accumulated.toolCalls[toolCall.index]) {
              // Incrementelles Update eines bestehenden Tool Calls
              const existing = accumulated.toolCalls[toolCall.index];
              if (toolCall.function?.arguments) {
                existing.function.arguments += toolCall.function.arguments;
              }
            }
          }
        }

        // Verarbeite Finish Reason
        if (choice.finish_reason) {
          accumulated.finishReason = choice.finish_reason;
        }

        // Broadcast Chunk zu WebSocket
        if (this.webSocketManager) {
          this.broadcastChunk(context, chunk, chunkCount);
        }
      }

      // Erhalte finale Usage-Informationen
      const result = await streamGenerator.next();
      if (result.done && result.value) {
        const finalData = result.value as { usage?: TokenUsage; cost: number; model: string };
        if (finalData.usage) {
          accumulated.usage = finalData.usage;
        }
        accumulated.model = finalData.model;
      }

      accumulated.endTime = Date.now();
      accumulated.duration = accumulated.endTime - startTime;

      // Broadcast Completion
      if (this.webSocketManager) {
        this.broadcastCompletion(context, accumulated);
      }

      return accumulated;
    } catch (error) {
      // Broadcast Error
      if (this.webSocketManager) {
        this.broadcastError(context, error as Error);
      }
      throw error;
    }
  }

  /**
   * Broadcastet einen einzelnen Chunk
   */
  private broadcastChunk(
    context: { sessionId: string; userId: string; requestId: string },
    chunk: StreamingChunk,
    chunkNumber: number
  ): void {
    if (!this.webSocketManager) return;

    const message: WebSocketBroadcastMessage = {
      type: 'stream_chunk',
      sessionId: context.sessionId,
      userId: context.userId,
      payload: {
        requestId: context.requestId,
        chunkNumber,
        content: chunk.choices[0]?.delta?.content || '',
        toolCalls: chunk.choices[0]?.delta?.tool_calls || [],
        finishReason: chunk.choices[0]?.finish_reason,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };

    this.webSocketManager.broadcastToSession(context.sessionId, message);
  }

  /**
   * Broadcastet Stream Completion
   */
  private broadcastCompletion(
    context: { sessionId: string; userId: string; requestId: string },
    accumulated: AccumulatedResponse
  ): void {
    if (!this.webSocketManager) return;

    const message: WebSocketBroadcastMessage = {
      type: 'stream_complete',
      sessionId: context.sessionId,
      userId: context.userId,
      payload: {
        requestId: context.requestId,
        content: accumulated.content,
        toolCalls: accumulated.toolCalls,
        usage: accumulated.usage,
        finishReason: accumulated.finishReason,
        duration: accumulated.duration,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };

    this.webSocketManager.broadcastToSession(context.sessionId, message);

    // Sende Usage Update
    if (this.config.emitUsageEvents) {
      this.broadcastUsageUpdate(context, accumulated);
    }
  }

  /**
   * Broadcastet Usage Update
   */
  private broadcastUsageUpdate(
    context: { sessionId: string; userId: string; requestId: string },
    accumulated: AccumulatedResponse
  ): void {
    if (!this.webSocketManager) return;

    const message: WebSocketBroadcastMessage = {
      type: 'usage_update',
      sessionId: context.sessionId,
      userId: context.userId,
      payload: {
        requestId: context.requestId,
        usage: accumulated.usage,
        model: accumulated.model,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };

    this.webSocketManager.broadcastToUser(context.userId, message);
  }

  /**
   * Broadcastet einen Fehler
   */
  private broadcastError(
    context: { sessionId: string; userId: string; requestId: string },
    error: Error
  ): void {
    if (!this.webSocketManager) return;

    const message: WebSocketBroadcastMessage = {
      type: 'stream_error',
      sessionId: context.sessionId,
      userId: context.userId,
      payload: {
        requestId: context.requestId,
        error: error.message,
        code: (error as { code?: string }).code || 'STREAM_ERROR',
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };

    this.webSocketManager.broadcastToSession(context.sessionId, message);
  }
}

/**
 * Stream Accumulator für Szenarien ohne WebSocket
 */
export class StreamAccumulator {
  private accumulated: AccumulatedResponse;
  private startTime: number;
  private onChunk?: (content: string, toolCalls: unknown[]) => void;
  private onComplete?: (response: AccumulatedResponse) => void;

  constructor(
    model: GitHubModel,
    callbacks?: {
      onChunk?: (content: string, toolCalls: unknown[]) => void;
      onComplete?: (response: AccumulatedResponse) => void;
    }
  ) {
    this.startTime = Date.now();
    this.onChunk = callbacks?.onChunk;
    this.onComplete = callbacks?.onComplete;

    this.accumulated = {
      content: '',
      toolCalls: [],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
      finishReason: null,
      model,
      startTime: this.startTime,
      endTime: 0,
      duration: 0,
    };
  }

  /**
   * Verarbeite einen Chunk
   */
  public processChunk(chunk: StreamingChunk): void {
    const choice = chunk.choices[0];
    if (!choice) return;

    // Content
    const deltaContent = choice.delta?.content;
    if (deltaContent) {
      this.accumulated.content += deltaContent;
    }

    // Tool Calls
    const deltaToolCalls = choice.delta?.tool_calls;
    if (deltaToolCalls) {
      for (const toolCall of deltaToolCalls) {
        if (toolCall.id) {
          this.accumulated.toolCalls.push({
            id: toolCall.id,
            type: 'function',
            function: {
              name: toolCall.function?.name || '',
              arguments: toolCall.function?.arguments || '',
            },
          });
        } else if (toolCall.index !== undefined && this.accumulated.toolCalls[toolCall.index]) {
          const existing = this.accumulated.toolCalls[toolCall.index];
          if (toolCall.function?.arguments) {
            existing.function.arguments += toolCall.function.arguments;
          }
        }
      }
    }

    // Finish Reason
    if (choice.finish_reason) {
      this.accumulated.finishReason = choice.finish_reason;
    }

    // Callback
    if (this.onChunk) {
      this.onChunk(this.accumulated.content, this.accumulated.toolCalls);
    }
  }

  /**
   * Schließe den Stream ab
   */
  public finalize(usage?: TokenUsage): AccumulatedResponse {
    this.accumulated.endTime = Date.now();
    this.accumulated.duration = this.accumulated.endTime - this.startTime;

    if (usage) {
      this.accumulated.usage = usage;
    } else {
      // Schätze Usage
      this.accumulated.usage.completion_tokens = Math.ceil(this.accumulated.content.length / 4);
      this.accumulated.usage.total_tokens = this.accumulated.usage.completion_tokens;
    }

    if (this.onComplete) {
      this.onComplete(this.accumulated);
    }

    return this.accumulated;
  }

  /**
   * Gibt den aktuellen Stand zurück
   */
  public getCurrentState(): Readonly<AccumulatedResponse> {
    return Object.freeze({ ...this.accumulated });
  }
}

/**
 * SSE Parser für Roh-Text Streams
 */
export class SSEParser {
  private buffer: string = '';
  private onChunk: (chunk: StreamingChunk) => void;
  private onComplete: () => void;
  private onError: (error: Error) => void;

  constructor(
    callbacks: {
      onChunk: (chunk: StreamingChunk) => void;
      onComplete: () => void;
      onError: (error: Error) => void;
    }
  ) {
    this.onChunk = callbacks.onChunk;
    this.onComplete = callbacks.onComplete;
    this.onError = callbacks.onError;
  }

  /**
   * Verarbeite eingehende Daten
   */
  public processData(data: Uint8Array): void {
    const decoder = new TextDecoder();
    this.buffer += decoder.decode(data, { stream: true });

    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      this.processLine(line);
    }
  }

  /**
   * Verarbeite eine einzelne Zeile
   */
  private processLine(line: string): void {
    const trimmedLine = line.trim();

    if (!trimmedLine) return;
    if (trimmedLine === 'data: [DONE]') {
      this.onComplete();
      return;
    }

    if (trimmedLine.startsWith('data: ')) {
      try {
        const jsonStr = trimmedLine.slice(6);
        const chunk: StreamingChunk = JSON.parse(jsonStr);
        this.onChunk(chunk);
      } catch (error) {
        this.onError(new Error(`Failed to parse SSE data: ${error}`));
      }
    }
  }

  /**
   * Schließe den Parser
   */
  public finalize(): void {
    if (this.buffer.trim()) {
      this.processLine(this.buffer);
    }
    this.onComplete();
  }
}

/**
 * Erstellt einen ReadableStream aus einem AsyncGenerator
 */
export function createReadableStreamFromGenerator(
  generator: AsyncGenerator<StreamingChunk, unknown, unknown>
): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/**
 * Kombiniert mehrere Stream Chunks zu einer Completion Response
 */
export function combineChunks(chunks: StreamingChunk[]): {
  content: string;
  toolCalls: unknown[];
  finishReason: string | null;
} {
  let content = '';
  const toolCalls: unknown[] = [];
  let finishReason: string | null = null;

  for (const chunk of chunks) {
    const choice = chunk.choices[0];
    if (!choice) continue;

    if (choice.delta?.content) {
      content += choice.delta.content;
    }

    if (choice.delta?.tool_calls) {
      toolCalls.push(...choice.delta.tool_calls);
    }

    if (choice.finish_reason) {
      finishReason = choice.finish_reason;
    }
  }

  return { content, toolCalls, finishReason };
}

// Exportiere Factory-Funktionen
export function createStreamingHandler(
  webSocketManager?: WebSocketManager,
  config?: Partial<StreamingHandlerConfig>
): StreamingHandler {
  return new StreamingHandler(webSocketManager, config);
}

export function createStreamAccumulator(
  model: GitHubModel,
  callbacks?: {
    onChunk?: (content: string, toolCalls: unknown[]) => void;
    onComplete?: (response: AccumulatedResponse) => void;
  }
): StreamAccumulator {
  return new StreamAccumulator(model, callbacks);
}
