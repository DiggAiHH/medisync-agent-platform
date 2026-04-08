/**
 * Unit Tests für StreamingManager
 */

import * as assert from 'assert';
import { StreamingManager, streamToString, Message } from '../../utils/streamingManager';
import { mockStreamingChunks, mockStreamGenerator } from '../fixtures/ollamaResponses';

suite('StreamingManager', () => {
    let manager: StreamingManager;

    setup(() => {
        manager = new StreamingManager({
            endpoint: 'http://localhost:11434',
            model: 'llama3.2'
        });
    });

    teardown(() => {
        manager.dispose();
    });

    suite('Basic Functionality', () => {
        test('should create instance with options', () => {
            assert.ok(manager);
            assert.strictEqual(manager.isStreaming, false);
        });

        test('should update options', () => {
            manager.updateOptions({ model: 'mistral', temperature: 0.5 });
            // Options are internal, but we can verify no error is thrown
            assert.ok(true);
        });

        test('should not allow concurrent streams', async () => {
            // Simulate streaming state
            const customManager = new StreamingManager({
                endpoint: 'http://invalid:11434',
                model: 'test'
            });

            // Start a stream that will hang
            const streamPromise = (async () => {
                const chunks: string[] = [];
                try {
                    for await (const chunk of customManager.streamChat([{ role: 'user', content: 'test' }])) {
                        chunks.push(chunk);
                    }
                } catch {
                    // Expected to fail
                }
                return chunks;
            })();

            // Small delay to let the stream start
            await new Promise(resolve => setTimeout(resolve, 50));

            // Try to start another stream
            try {
                for await (const _ of customManager.streamChat([{ role: 'user', content: 'test2' }])) {
                    // Should not reach here
                }
                assert.fail('Should have thrown error for concurrent stream');
            } catch (error) {
                assert.ok((error as Error).message.includes('already active'));
            }

            customManager.dispose();
        });
    });

    suite('Cancellation', () => {
        test('should cancel streaming', async () => {
            const customManager = new StreamingManager({
                endpoint: 'http://invalid:11434',
                model: 'test'
            });

            // Cancel immediately should not throw
            customManager.cancel();
            assert.strictEqual(customManager.isStreaming, false);

            customManager.dispose();
        });

        test('should reset streaming state after cancel', () => {
            manager.cancel();
            assert.strictEqual(manager.isStreaming, false);
        });
    });

    suite('streamToString', () => {
        test('should aggregate stream to string', async () => {
            const stream = mockStreamGenerator(mockStreamingChunks.normal);
            const result = await streamToString(stream);
            assert.strictEqual(result, 'Hallo, ich bin ein Assistent.');
        });

        test('should handle empty stream', async () => {
            const stream = mockStreamGenerator(mockStreamingChunks.empty);
            const result = await streamToString(stream);
            assert.strictEqual(result, '');
        });

        test('should handle single chunk', async () => {
            const stream = mockStreamGenerator(mockStreamingChunks.single);
            const result = await streamToString(stream);
            assert.strictEqual(result, 'Komplette Antwort in einem Chunk');
        });

        test('should handle unicode chunks', async () => {
            const stream = mockStreamGenerator(mockStreamingChunks.unicode);
            const result = await streamToString(stream);
            assert.strictEqual(result, 'Ärzte sagen 99€ kostet es.');
        });
    });

    suite('dispose', () => {
        test('should dispose without errors', () => {
            const testManager = new StreamingManager({
                endpoint: 'http://localhost:11434',
                model: 'test'
            });
            testManager.dispose();
            assert.ok(true);
        });

        test('should cancel on dispose', () => {
            const testManager = new StreamingManager({
                endpoint: 'http://localhost:11434',
                model: 'test'
            });
            testManager.dispose();
            assert.strictEqual(testManager.isStreaming, false);
        });
    });
});
