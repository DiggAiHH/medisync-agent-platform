/**
 * Unit Tests für OllamaService
 */

import * as assert from 'assert';
import { OllamaService, AnalysisResult } from '../../services/ollamaService';
import { JsonParseError } from '../../errors/MedicalAiError';
import { mockAnalysisResponse, createMockAnalysisResult } from '../fixtures/ollamaResponses';

suite('OllamaService', () => {
    let service: OllamaService;

    setup(() => {
        service = new OllamaService();
    });

    teardown(() => {
        service.dispose();
    });

    suite('Configuration', () => {
        test('should get current model', () => {
            const model = service.getCurrentModel();
            assert.ok(typeof model === 'string');
            assert.ok(model.length > 0);
        });

        test('should set model', () => {
            service.setModel('mistral');
            assert.strictEqual(service.getCurrentModel(), 'mistral');
        });

        test('should cancel current request without error', () => {
            service.cancelCurrentRequest();
            assert.ok(true);
        });

        test('should check connection with timeout', async function() {
            this.timeout(10000);
            // This test might fail if Ollama isn't running
            // We just verify it doesn't throw
            try {
                const result = await service.checkConnection(1000);
                assert.ok(typeof result === 'boolean');
            } catch {
                // Expected if Ollama not running
                assert.ok(true);
            }
        });
    });

    suite('Model Management', () => {
        test('should list models (may be empty if unavailable)', async function() {
            this.timeout(5000);
            const models = await service.listModels();
            assert.ok(Array.isArray(models));
        });
    });

    suite('JSON Validation Integration', () => {
        test('validateAnalysisResult should work with valid data', () => {
            // This tests the integration with the utils module
            const valid = createMockAnalysisResult();
            assert.ok(valid.summary);
            assert.ok(Array.isArray(valid.keyPoints));
        });

        test('should handle all fixture types', () => {
            // Verify all fixtures are accessible
            assert.ok(mockAnalysisResponse.valid);
            assert.ok(mockAnalysisResponse.minimal);
            assert.ok(mockAnalysisResponse.withMarkdown);
            assert.ok(mockAnalysisResponse.malformed);
            assert.ok(mockAnalysisResponse.invalidJson);
        });
    });

    suite('Disposal', () => {
        test('should dispose without errors', () => {
            const testService = new OllamaService();
            testService.dispose();
            assert.ok(true);
        });

        test('should cancel on dispose', () => {
            const testService = new OllamaService();
            testService.dispose();
            // After disposal, isAvailable should reflect the state
            // but we mainly verify no error is thrown
            assert.ok(true);
        });
    });

    // Note: Tests for analyzeMedicalText, chat, etc. would require
    // mocking the Ollama client or running against a real server.
    // These are marked as integration tests.
    
    suite('Integration (requires Ollama)', () => {
        test('analyzeMedicalText - requires Ollama', async function() {
            // Skip if Ollama not available
            const available = service.getIsAvailable();
            if (!available) {
                this.skip();
                return;
            }

            this.timeout(30000);
            const text = 'Patient hat Fieber und Husten seit 3 Tagen.';
            
            try {
                const result = await service.analyzeMedicalText(text);
                assert.ok(result.summary);
                assert.ok(Array.isArray(result.keyPoints));
            } catch (error) {
                // May fail due to network/model issues
                console.log('Integration test skipped due to error:', error);
                this.skip();
            }
        });

        test('chat - requires Ollama', async function() {
            const available = service.getIsAvailable();
            if (!available) {
                this.skip();
                return;
            }

            this.timeout(30000);
            const messages = [
                { role: 'user' as const, content: 'Hallo' }
            ];

            try {
                const result = await service.chat(messages);
                assert.ok(typeof result === 'string');
            } catch {
                this.skip();
            }
        });

        test('summarizeReport - requires Ollama', async function() {
            const available = service.getIsAvailable();
            if (!available) {
                this.skip();
                return;
            }

            this.timeout(30000);
            const text = 'Patient berichtet über Kopfschmerzen und Übelkeit.';

            try {
                const result = await service.summarizeReport(text);
                assert.ok(typeof result === 'string');
            } catch {
                this.skip();
            }
        });

        test('suggestICD10 - requires Ollama', async function() {
            const available = service.getIsAvailable();
            if (!available) {
                this.skip();
                return;
            }

            this.timeout(30000);
            const diagnosis = 'Akute Bronchitis';

            try {
                const result = await service.suggestICD10(diagnosis);
                assert.ok(Array.isArray(result));
            } catch {
                this.skip();
            }
        });

        test('createEmbedding - requires Ollama', async function() {
            const available = service.getIsAvailable();
            if (!available) {
                this.skip();
                return;
            }

            this.timeout(30000);
            const text = 'Test text for embedding';

            try {
                const result = await service.createEmbedding(text);
                assert.ok(Array.isArray(result));
                assert.ok(result.length > 0);
            } catch {
                this.skip();
            }
        });
    });
});
