/**
 * Test Fixtures für Ollama Responses
 * Mock-Daten für Unit Tests
 */

import { AnalysisResult } from '../../services/ollamaService';

// ============================================================================
// AnalysisResult Fixtures
// ============================================================================

export const mockAnalysisResponse = {
    /** Vollständig gültiges Response */
    valid: {
        summary: 'Patient zeigt Symptome einer grippeähnlichen Erkrankung.',
        keyPoints: ['Fieber seit 3 Tagen', 'Husten', 'Gliederschmerzen'],
        suggestions: ['Ruhe empfehlen', 'Fiebersenkende Medikamente']
    } as AnalysisResult,

    /** Minimales gültiges Response (nur Pflichtfelder) */
    minimal: {
        summary: 'Einfache Zusammenfassung',
        keyPoints: []
    } as AnalysisResult,

    /** Leere suggestions Array */
    emptySuggestions: {
        summary: 'Test Zusammenfassung',
        keyPoints: ['Punkt 1'],
        suggestions: []
    } as AnalysisResult,

    /** JSON mit Markdown-Codeblock */
    withMarkdown: '```json\n{"summary": "Test", "keyPoints": ["A", "B"]}\n```',

    /** JSON mit einfachen Quotes */
    withSingleQuotes: "{summary: 'Test', keyPoints: ['A', 'B']}",

    /** JSON mit trailing Komma */
    withTrailingComma: '{"summary": "Test", "keyPoints": ["A", "B",]}',

    /** Invalid: Syntaxfehler */
    invalidJson: '{"summary": "Test", "keyPoints": }',

    /** Invalid: Fehlendes summary */
    missingSummary: '{"keyPoints": ["A", "B"]}',

    /** Invalid: keyPoints ist kein Array */
    invalidKeyPoints: '{"summary": "Test", "keyPoints": "not an array"}',

    /** Invalid: suggestions ist kein Array */
    invalidSuggestions: '{"summary": "Test", "keyPoints": [], "suggestions": "not an array"}',

    /** Kein JSON, nur Freitext */
    malformed: 'Dies ist kein JSON sondern Freitext. Der Patient hat Fieber.',

    /** Leeres Objekt */
    empty: {},

    /** Null */
    nullValue: null,

    /** Leerer String */
    emptyString: '',

    /** JSON im Fließtext eingebettet */
    embeddedJson: 'Hier ist die Analyse: {"summary": "Test", "keyPoints": ["A"]} Ende der Analyse.'
};

// ============================================================================
// Chat Response Fixtures
// ============================================================================

export const mockChatResponse = {
    /** Einfache Text-Antwort */
    simple: 'Hallo, ich bin Ihr medizinischer Assistent.',

    /** Längere Antwort */
    long: `Basierend auf den Symptomen könnte es sich um eine grippale Infektion handeln. 
    Empfohlene Maßnahmen:
    1. Ruhe
    2. Viel Flüssigkeit
    3. Fiebersenkende Medikamente`,

    /** Leere Antwort */
    empty: '',

    /** Mit Sonderzeichen */
    withSpecialChars: 'Ärzte empfehlen: 99,9% der Fälle sind harmlos!'
};

// ============================================================================
// ICD-10 Response Fixtures
// ============================================================================

export const mockICD10Response = {
    /** Standard-Format */
    standard: `J11 - Influenza, Virus nicht nachgewiesen
    R50.9 - Fieber, nicht näher bezeichnet
    R05 - Husten`,

    /** Mit Leerzeilen */
    withEmptyLines: `J11 - Influenza

    R50.9 - Fieber
    
    R05 - Husten`,

    /** Leere Antwort */
    empty: '',

    /** Nur ein Code */
    single: 'J11 - Influenza'
};

// ============================================================================
// Ollama API Response Fixtures
// ============================================================================

export const mockOllamaApiResponse = {
    /** /api/tags Response */
    tags: {
        models: [
            { name: 'llama3.2:latest', size: 2010000000 },
            { name: 'nomic-embed-text:latest', size: 274000000 },
            { name: 'mistral:latest', size: 4100000000 }
        ]
    },

    /** /api/generate Response */
    generate: {
        model: 'llama3.2',
        response: '{"summary": "Test", "keyPoints": ["A"]}',
        done: true
    },

    /** /api/chat Response (non-streaming) */
    chat: {
        model: 'llama3.2',
        message: {
            role: 'assistant',
            content: 'Hallo, ich bin Ihr Assistent.'
        },
        done: true
    },

    /** Streaming Chunk */
    streamChunk: (content: string, done: boolean = false) => 
        JSON.stringify({
            model: 'llama3.2',
            message: { role: 'assistant', content },
            done
        })
};

// ============================================================================
// Streaming Fixtures
// ============================================================================

export async function* mockStreamGenerator(chunks: string[]): AsyncGenerator<string> {
    for (const chunk of chunks) {
        yield chunk;
        // Kleine Verzögerung für realistisches Verhalten
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}

export const mockStreamingChunks = {
    /** Normale Antwort in Chunks */
    normal: ['Hallo', ', ', 'ich ', 'bin ', 'ein ', 'Assistent', '.'],

    /** Leerer Stream */
    empty: [],

    /** Ein Chunk */
    single: ['Komplette Antwort in einem Chunk'],

    /** Mit Unicode */
    unicode: ['Ärzte', ' ', 'sagen', ' ', '99€', ' ', 'kostet', ' ', 'es.']
};

// ============================================================================
// Connection Check Fixtures
// ============================================================================

export const mockConnectionResults = {
    /** Erfolgreiche Verbindung */
    available: {
        available: true,
        models: ['llama3.2', 'nomic-embed-text'],
        latencyMs: 50
    },

    /** Nicht verfügbar */
    unavailable: {
        available: false,
        models: [],
        error: 'Connection refused',
        latencyMs: 1000
    },

    /** Timeout */
    timeout: {
        available: false,
        models: [],
        error: 'Connection timeout after 5000ms',
        latencyMs: 5000
    }
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Erstellt einen Mock-Response mit custom Daten
 */
export function createMockAnalysisResult(
    overrides: Partial<AnalysisResult> = {}
): AnalysisResult {
    return {
        summary: overrides.summary ?? 'Standard Zusammenfassung',
        keyPoints: overrides.keyPoints ?? ['Punkt 1', 'Punkt 2'],
        suggestions: overrides.suggestions
    };
}

/**
 * Simuliert einen langsamern Stream
 */
export async function* slowStream(
    chunks: string[], 
    delayMs: number = 100
): AsyncGenerator<string> {
    for (const chunk of chunks) {
        yield chunk;
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }
}
