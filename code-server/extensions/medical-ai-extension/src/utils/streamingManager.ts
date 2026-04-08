/**
 * Streaming Manager
 * Verbesserter Streaming-Handler mit Cancellation Support
 */

import * as vscode from 'vscode';
import { JsonParseError, OllamaConnectionError } from '../errors/MedicalAiError';

export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface StreamingManagerOptions {
    endpoint: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
}

/**
 * Manager für Streaming-Requests mit Cancellation-Support
 */
export class StreamingManager implements vscode.Disposable {
    private _abortController: AbortController | undefined;
    private _disposables: vscode.Disposable[] = [];
    private _isStreaming: boolean = false;

    constructor(private _options: StreamingManagerOptions) {}

    /**
     * Streamt Chat-Antworten als AsyncGenerator
     * Unterstützt Cancellation via AbortController
     */
    public async *streamChat(messages: Message[]): AsyncGenerator<string, void, unknown> {
        if (this._isStreaming) {
            throw new Error('Another streaming request is already active');
        }

        this._abortController = new AbortController();
        this._isStreaming = true;

        try {
            const response = await fetch(`${this._options.endpoint}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this._options.model,
                    messages,
                    stream: true,
                    options: {
                        temperature: this._options.temperature ?? 0.3,
                        num_predict: this._options.maxTokens ?? 1000
                    }
                }),
                signal: this._abortController.signal
            });

            if (!response.ok) {
                throw new OllamaConnectionError(
                    `HTTP ${response.status}: ${response.statusText}`,
                    { processingTime: 0 }
                );
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body available');
            }

            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // Decode und buffer
                buffer += new TextDecoder().decode(value, { stream: true });

                // Verarbeite vollständige Zeilen
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Letzte unvollständige Zeile behalten

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;

                    try {
                        const parsed = JSON.parse(trimmed);
                        
                        // Ollama Chat Format
                        if (parsed.message?.content) {
                            yield parsed.message.content;
                        }
                        // Ollama Generate Format (Fallback)
                        else if (parsed.response) {
                            yield parsed.response;
                        }

                        // Stream beendet?
                        if (parsed.done) {
                            return;
                        }
                    } catch {
                        // Ungültige Zeile überspringen, aber buffer für nächste Iteration
                    }
                }
            }

            // Verarbeite verbleibenden Buffer
            if (buffer.trim()) {
                try {
                    const parsed = JSON.parse(buffer.trim());
                    if (parsed.message?.content) {
                        yield parsed.message.content;
                    }
                } catch {
                    // Ignoriere unvollständiges JSON am Ende
                }
            }
        } finally {
            this._isStreaming = false;
            this._abortController = undefined;
        }
    }

    /**
     * Bricht den aktuellen Stream ab
     */
    public cancel(): void {
        if (this._abortController) {
            this._abortController.abort();
            this._abortController = undefined;
        }
        this._isStreaming = false;
    }

    /**
     * Prüft ob gerade gestreamt wird
     */
    public get isStreaming(): boolean {
        return this._isStreaming;
    }

    /**
     * Aktualisiert die Optionen
     */
    public updateOptions(options: Partial<StreamingManagerOptions>): void {
        this._options = { ...this._options, ...options };
    }

    public dispose(): void {
        this.cancel();
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
    }
}

/**
 * Hilfsfunktion: Stream zu komplettem String aggregieren
 */
export async function streamToString(
    stream: AsyncGenerator<string>
): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return chunks.join('');
}

/**
 * Hilfsfunktion: Stream mit Timeout
 */
export async function* streamWithTimeout(
    stream: AsyncGenerator<string>,
    timeoutMs: number
): AsyncGenerator<string> {
    const startTime = Date.now();

    for await (const chunk of stream) {
        if (Date.now() - startTime > timeoutMs) {
            throw new Error(`Streaming timeout after ${timeoutMs}ms`);
        }
        yield chunk;
    }
}
