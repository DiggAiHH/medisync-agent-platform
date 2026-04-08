/**
 * JSON Validator Utilities
 * Robustes JSON-Parsing mit Validierung ohne externe Dependencies
 */

import { AnalysisResult } from '../services/ollamaService';
import { JsonParseError } from '../errors/MedicalAiError';

/**
 * Validiert und typisiert ein AnalysisResult
 * Zod-ähnliche Validierung ohne External Dependency
 */
export function validateAnalysisResult(json: unknown): AnalysisResult {
    if (!json || typeof json !== 'object') {
        throw new JsonParseError('Invalid JSON structure - expected object', JSON.stringify(json));
    }

    const result = json as Partial<AnalysisResult>;

    // summary ist Pflicht
    if (!result.summary || typeof result.summary !== 'string') {
        throw new JsonParseError(
            'Missing or invalid summary field',
            JSON.stringify(json)
        );
    }

    // keyPoints muss ein Array sein (fallback zu leerem Array)
    let keyPoints: string[] = [];
    if (result.keyPoints !== undefined) {
        if (!Array.isArray(result.keyPoints)) {
            throw new JsonParseError(
                'keyPoints must be an array',
                JSON.stringify(json)
            );
        }
        // Filtere nur gültige Strings
        keyPoints = result.keyPoints.filter((p): p is string => typeof p === 'string');
    }

    // suggestions ist optional
    let suggestions: string[] | undefined;
    if (result.suggestions !== undefined) {
        if (!Array.isArray(result.suggestions)) {
            throw new JsonParseError(
                'suggestions must be an array if provided',
                JSON.stringify(json)
            );
        }
        suggestions = result.suggestions.filter((s): s is string => typeof s === 'string');
    }

    return {
        summary: result.summary.trim(),
        keyPoints,
        suggestions
    };
}

/**
 * Versucht JSON zu reparieren wenn möglich
 * Heuristik-basierte Reparatur für häufige LLM-Ausgabe-Fehler
 */
export function attemptJsonRepair(raw: string): unknown {
    // Entferne Markdown-Code-Block-Marker
    let cleaned = raw
        .replace(/```json\s*/gi, '')
        .replace(/```\s*$/gi, '')
        .replace(/```/g, '')
        .trim();

    // Entferne führende/trailing Kommas
    cleaned = cleaned
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/\{\s*,/g, '{')
        .replace(/\[\s*,/g, '[');

    // Füge fehlende Quotes hinzu (einfache Heuristik)
    // Beispiel: { summary: "test" } -> { "summary": "test" }
    cleaned = cleaned.replace(/(\{|,\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

    try {
        return JSON.parse(cleaned);
    } catch {
        // Versuche einzelne Quotes zu escapen
        try {
            const escaped = cleaned.replace(/(?<!\\)'/g, '"');
            return JSON.parse(escaped);
        } catch {
            throw new JsonParseError('JSON could not be repaired', raw);
        }
    }
}

/**
 * Extrahiert JSON aus einem Text-Block
 * Suche nach dem ersten { und letzten }
 */
export function extractJsonBlock(text: string): string {
    const startIdx = text.indexOf('{');
    const endIdx = text.lastIndexOf('}');

    if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
        throw new JsonParseError('No JSON object found in text', text);
    }

    return text.substring(startIdx, endIdx + 1);
}

/**
 * Versucht JSON auf mehrere Arten zu parsen
 */
export function flexibleJsonParse(raw: string): unknown {
    // Versuch 1: Direktes Parsen
    try {
        return JSON.parse(raw);
    } catch {
        // Weiter zum nächsten Versuch
    }

    // Versuch 2: JSON-Block extrahieren
    try {
        const block = extractJsonBlock(raw);
        return JSON.parse(block);
    } catch {
        // Weiter zum nächsten Versuch
    }

    // Versuch 3: JSON reparieren
    try {
        return attemptJsonRepair(raw);
    } catch {
        // Weiter zum letzten Versuch
    }

    // Versuch 4: Extrahieren + Reparieren
    try {
        const block = extractJsonBlock(raw);
        return attemptJsonRepair(block);
    } catch {
        throw new JsonParseError('All JSON parsing attempts failed', raw);
    }
}
