/**
 * Unit Tests für jsonValidator
 */

import * as assert from 'assert';
import {
    validateAnalysisResult,
    attemptJsonRepair,
    extractJsonBlock,
    flexibleJsonParse
} from '../../utils/jsonValidator';
import { JsonParseError } from '../../errors/MedicalAiError';
import { mockAnalysisResponse } from '../fixtures/ollamaResponses';

suite('jsonValidator', () => {
    suite('validateAnalysisResult', () => {
        test('should accept valid AnalysisResult', () => {
            const result = validateAnalysisResult(mockAnalysisResponse.valid);
            assert.strictEqual(result.summary, mockAnalysisResponse.valid.summary);
            assert.deepStrictEqual(result.keyPoints, mockAnalysisResponse.valid.keyPoints);
            assert.deepStrictEqual(result.suggestions, mockAnalysisResponse.valid.suggestions);
        });

        test('should accept minimal valid result (only summary)', () => {
            const result = validateAnalysisResult(mockAnalysisResponse.minimal);
            assert.strictEqual(result.summary, 'Einfache Zusammenfassung');
            assert.deepStrictEqual(result.keyPoints, []);
            assert.strictEqual(result.suggestions, undefined);
        });

        test('should throw on null input', () => {
            assert.throws(
                () => validateAnalysisResult(null),
                JsonParseError
            );
        });

        test('should throw on non-object input', () => {
            assert.throws(
                () => validateAnalysisResult('string'),
                JsonParseError
            );
        });

        test('should throw on missing summary', () => {
            assert.throws(
                () => validateAnalysisResult(mockAnalysisResponse.missingSummary),
                JsonParseError
            );
        });

        test('should throw on invalid keyPoints type', () => {
            assert.throws(
                () => validateAnalysisResult(mockAnalysisResponse.invalidKeyPoints),
                JsonParseError
            );
        });

        test('should throw on invalid suggestions type', () => {
            assert.throws(
                () => validateAnalysisResult(mockAnalysisResponse.invalidSuggestions),
                JsonParseError
            );
        });

        test('should filter non-string values from keyPoints', () => {
            const input = {
                summary: 'Test',
                keyPoints: ['Valid', 123, null, 'Also Valid', undefined]
            };
            const result = validateAnalysisResult(input);
            assert.deepStrictEqual(result.keyPoints, ['Valid', 'Also Valid']);
        });

        test('should trim summary whitespace', () => {
            const input = {
                summary: '  Test mit Whitespace  ',
                keyPoints: []
            };
            const result = validateAnalysisResult(input);
            assert.strictEqual(result.summary, 'Test mit Whitespace');
        });
    });

    suite('attemptJsonRepair', () => {
        test('should remove markdown code block markers', () => {
            const result = attemptJsonRepair(mockAnalysisResponse.withMarkdown);
            assert.strictEqual((result as { summary: string }).summary, 'Test');
        });

        test('should repair single quotes', () => {
            const result = attemptJsonRepair(mockAnalysisResponse.withSingleQuotes);
            assert.strictEqual((result as { summary: string }).summary, 'Test');
        });

        test('should repair trailing commas', () => {
            const result = attemptJsonRepair(mockAnalysisResponse.withTrailingComma);
            assert.strictEqual((result as { summary: string }).summary, 'Test');
        });

        test('should throw on irreparable JSON', () => {
            assert.throws(
                () => attemptJsonRepair(mockAnalysisResponse.malformed),
                JsonParseError
            );
        });
    });

    suite('extractJsonBlock', () => {
        test('should extract JSON from embedded text', () => {
            const result = extractJsonBlock(mockAnalysisResponse.embeddedJson);
            assert.ok(result.includes('summary'));
            assert.ok(result.includes('keyPoints'));
        });

        test('should throw when no JSON found', () => {
            assert.throws(
                () => extractJsonBlock('Kein JSON hier'),
                JsonParseError
            );
        });
    });

    suite('flexibleJsonParse', () => {
        test('should parse valid JSON directly', () => {
            const json = JSON.stringify(mockAnalysisResponse.valid);
            const result = flexibleJsonParse(json);
            assert.strictEqual((result as { summary: string }).summary, mockAnalysisResponse.valid.summary);
        });

        test('should parse JSON with markdown', () => {
            const result = flexibleJsonParse(mockAnalysisResponse.withMarkdown);
            assert.strictEqual((result as { summary: string }).summary, 'Test');
        });

        test('should parse embedded JSON', () => {
            const result = flexibleJsonParse(mockAnalysisResponse.embeddedJson);
            assert.strictEqual((result as { summary: string }).summary, 'Test');
        });

        test('should throw on completely invalid input', () => {
            assert.throws(
                () => flexibleJsonParse(mockAnalysisResponse.malformed),
                JsonParseError
            );
        });
    });
});
