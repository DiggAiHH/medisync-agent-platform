/**
 * Connection Check Utility
 * Prüft Ollama-Verbindung mit Timeout
 */

import { OllamaConnectionError, TimeoutError } from '../errors/MedicalAiError';

export interface ConnectionCheckResult {
    available: boolean;
    models: string[];
    error?: string;
    latencyMs: number;
}

/**
 * Prüft ob Ollama erreichbar ist
 * @param endpoint Ollama API Endpoint
 * @param timeoutMs Timeout in Millisekunden (default: 5000)
 */
export async function checkConnection(
    endpoint: string = 'http://localhost:11434',
    timeoutMs: number = 5000
): Promise<ConnectionCheckResult> {
    const startTime = Date.now();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${endpoint}/api/tags`, {
            method: 'GET',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            return {
                available: false,
                models: [],
                error: `HTTP ${response.status}: ${response.statusText}`,
                latencyMs: Date.now() - startTime
            };
        }

        const data = await response.json() as { models?: Array<{ name: string }> };
        const models = data.models?.map(m => m.name) || [];

        return {
            available: true,
            models,
            latencyMs: Date.now() - startTime
        };
    } catch (error) {
        clearTimeout(timeoutId);

        const latencyMs = Date.now() - startTime;

        if (error instanceof Error) {
            if (error.name === 'AbortError') {
                return {
                    available: false,
                    models: [],
                    error: `Connection timeout after ${timeoutMs}ms`,
                    latencyMs
                };
            }

            // Network errors
            if (error.message.includes('fetch') || 
                error.message.includes('ECONNREFUSED') ||
                error.message.includes('Failed to fetch')) {
                return {
                    available: false,
                    models: [],
                    error: `Cannot connect to Ollama at ${endpoint}`,
                    latencyMs
                };
            }
        }

        return {
            available: false,
            models: [],
            error: error instanceof Error ? error.message : String(error),
            latencyMs
        };
    }
}

/**
 * Schneller Health-Check ohne Model-Liste
 */
export async function quickHealthCheck(
    endpoint: string = 'http://localhost:11434',
    timeoutMs: number = 2000
): Promise<boolean> {
    const result = await checkConnection(endpoint, timeoutMs);
    return result.available;
}

/**
 * Wartet bis Ollama verfügbar ist (mit Retry)
 */
export async function waitForOllama(
    endpoint: string = 'http://localhost:11434',
    maxWaitMs: number = 30000,
    checkIntervalMs: number = 1000
): Promise<ConnectionCheckResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        const result = await checkConnection(endpoint, 2000);
        
        if (result.available) {
            return result;
        }

        await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    }

    return {
        available: false,
        models: [],
        error: `Ollama not available after ${maxWaitMs}ms`,
        latencyMs: Date.now() - startTime
    };
}
