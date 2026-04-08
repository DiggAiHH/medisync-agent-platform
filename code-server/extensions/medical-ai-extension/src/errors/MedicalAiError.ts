/**
 * Medical AI Error Boundary System
 * Zentrale Fehlerbehandlung mit Recovery-Strategien
 */

export type ErrorCode = 
    | 'OLLAMA_CONNECTION' 
    | 'JSON_PARSE' 
    | 'VALIDATION' 
    | 'TIMEOUT'
    | 'MODEL_NOT_FOUND'
    | 'NETWORK_ERROR'
    | 'UNKNOWN';

export interface ErrorMetadata {
    confidence?: number;
    processingTime?: number;
    sources?: string[];
    model?: string;
    retryAttempt?: number;
    fallbackUsed?: boolean;
}

/**
 * Basis-Fehlerklasse für alle Medical AI Fehler
 */
export class MedicalAiError extends Error {
    public readonly timestamp: number;
    
    constructor(
        message: string,
        public readonly code: ErrorCode,
        public readonly recoverable: boolean,
        public readonly metadata?: ErrorMetadata
    ) {
        super(message);
        this.name = 'MedicalAiError';
        this.timestamp = Date.now();
        
        // Stack Trace erhalten
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, MedicalAiError);
        }
    }

    /**
     * Konvertiert Fehler zu einem für das Webview serialisierbaren Format
     */
    public toJSON(): {
        message: string;
        code: ErrorCode;
        recoverable: boolean;
        metadata?: ErrorMetadata;
    } {
        return {
            message: this.message,
            code: this.code,
            recoverable: this.recoverable,
            metadata: this.metadata
        };
    }
}

/**
 * Spezifischer Fehler für Ollama-Verbindungsprobleme
 */
export class OllamaConnectionError extends MedicalAiError {
    constructor(message: string, metadata?: ErrorMetadata) {
        super(
            message,
            'OLLAMA_CONNECTION',
            true, // Recoverable - User kann Ollama starten
            metadata
        );
        this.name = 'OllamaConnectionError';
    }
}

/**
 * Spezifischer Fehler für JSON-Parsing-Probleme
 */
export class JsonParseError extends MedicalAiError {
    public readonly rawResponse?: string;
    
    constructor(message: string, rawResponse?: string, metadata?: ErrorMetadata) {
        super(
            message,
            'JSON_PARSE',
            true, // Recoverable - Fallback zu unstrukturiertem Text
            { ...metadata, fallbackUsed: true }
        );
        this.name = 'JsonParseError';
        this.rawResponse = rawResponse;
    }
}

/**
 * Alias für JsonParseError (für Kompatibilität)
 */
export const ParseError = JsonParseError;

/**
 * Spezifischer Fehler für Validierungsfehler
 */
export class ValidationError extends MedicalAiError {
    constructor(message: string, metadata?: ErrorMetadata) {
        super(
            message,
            'VALIDATION',
            false, // Nicht recoverable - Input muss korrigiert werden
            metadata
        );
        this.name = 'ValidationError';
    }
}

/**
 * Spezifischer Fehler für Timeouts
 */
export class TimeoutError extends MedicalAiError {
    constructor(message: string, metadata?: ErrorMetadata) {
        super(
            message,
            'TIMEOUT',
            true, // Recoverable - Retry möglich
            metadata
        );
        this.name = 'TimeoutError';
    }
}

/**
 * Hilfsfunktion: Konvertiert beliebige Fehler zu MedicalAiError
 */
export function normalizeError(error: unknown): MedicalAiError {
    if (error instanceof MedicalAiError) {
        return error;
    }
    
    if (error instanceof Error) {
        // Prüfe auf bekannte Fehlermuster
        const message = error.message.toLowerCase();
        
        if (message.includes('ollama') || message.includes('econnrefused') || message.includes('fetch')) {
            return new OllamaConnectionError(
                `Ollama-Verbindung fehlgeschlagen: ${error.message}`,
                { processingTime: 0 }
            );
        }
        
        if (message.includes('timeout') || message.includes('aborted')) {
            return new TimeoutError(
                `Zeitüberschreitung: ${error.message}`,
                { processingTime: 30000 }
            );
        }
        
        return new MedicalAiError(
            error.message,
            'UNKNOWN',
            false,
            { processingTime: 0 }
        );
    }
    
    return new MedicalAiError(
        String(error),
        'UNKNOWN',
        false
    );
}

/**
 * Retry-Konfiguration
 */
export interface RetryConfig {
    maxAttempts: number;
    delayMs: number;
    backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxAttempts: 3,
    delayMs: 1000,
    backoffMultiplier: 2
};

/**
 * Führt eine Funktion mit Retry-Logik aus
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    config: RetryConfig = DEFAULT_RETRY_CONFIG,
    shouldRetry?: (error: MedicalAiError) => boolean
): Promise<T> {
    let lastError: MedicalAiError | undefined;
    
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = normalizeError(error);
            
            // Prüfe ob Retry sinnvoll ist
            if (attempt === config.maxAttempts) {
                break;
            }
            
            if (shouldRetry && !shouldRetry(lastError)) {
                throw lastError;
            }
            
            // Nur bei recoverable Fehlern retry
            if (!lastError.recoverable) {
                throw lastError;
            }
            
            // Exponentielles Backoff
            const delay = config.delayMs * Math.pow(config.backoffMultiplier, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw lastError || new MedicalAiError('Retry failed', 'UNKNOWN', false);
}

/**
 * Schema-Validierung für AnalysisResult
 */
export function validateAnalysisResult(data: unknown): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    
    if (typeof data !== 'object' || data === null) {
        errors.push('Response ist kein gültiges Objekt');
        return { valid: false, errors };
    }
    
    const obj = data as Record<string, unknown>;
    
    // summary prüfen
    if (!obj.summary || typeof obj.summary !== 'string') {
        errors.push('summary fehlt oder ist kein String');
    }
    
    // keyPoints prüfen
    if (!Array.isArray(obj.keyPoints)) {
        errors.push('keyPoints fehlt oder ist kein Array');
    } else {
        for (const point of obj.keyPoints) {
            if (typeof point !== 'string') {
                errors.push('keyPoints enthält nicht-String Werte');
                break;
            }
        }
    }
    
    // suggestions ist optional
    if (obj.suggestions !== undefined && !Array.isArray(obj.suggestions)) {
        errors.push('suggestions ist kein Array');
    }
    
    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
}
