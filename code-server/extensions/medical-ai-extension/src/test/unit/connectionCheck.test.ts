/**
 * Unit Tests für connectionCheck
 */

import * as assert from 'assert';
import {
    checkConnection,
    quickHealthCheck,
    waitForOllama,
    ConnectionCheckResult
} from '../../utils/connectionCheck';

suite('connectionCheck', () => {
    // Note: These tests assume no Ollama server is running
    // In a real CI environment, you might want to mock fetch

    suite('checkConnection', () => {
        test('should return unavailable for invalid endpoint', async () => {
            const result = await checkConnection('http://invalid-host:99999', 1000);
            assert.strictEqual(result.available, false);
            assert.ok(result.error);
            assert.ok(result.latencyMs >= 0);
        });

        test('should respect timeout parameter', async () => {
            const startTime = Date.now();
            const result = await checkConnection('http://192.0.2.1:11434', 500); // Non-routable IP
            const elapsed = Date.now() - startTime;
            
            // Should timeout quickly, not hang
            assert.ok(elapsed < 2000, `Timeout took too long: ${elapsed}ms`);
            assert.strictEqual(result.available, false);
        });

        test('should return models array always', async () => {
            const result = await checkConnection('http://localhost:11434', 100);
            assert.ok(Array.isArray(result.models));
        });
    });

    suite('quickHealthCheck', () => {
        test('should return false when Ollama not available', async () => {
            const result = await quickHealthCheck('http://invalid:11434', 100);
            assert.strictEqual(result, false);
        });

        test('should use shorter timeout by default', async () => {
            const startTime = Date.now();
            await quickHealthCheck('http://192.0.2.1:11434');
            const elapsed = Date.now() - startTime;
            
            // Default timeout is 2000ms, should fail faster
            assert.ok(elapsed < 3000);
        });
    });

    suite('waitForOllama', () => {
        test('should return unavailable after maxWait', async () => {
            const startTime = Date.now();
            const result = await waitForOllama('http://invalid:11434', 500, 100);
            const elapsed = Date.now() - startTime;
            
            assert.strictEqual(result.available, false);
            assert.ok(elapsed >= 400 && elapsed < 1000, 
                `Expected ~500ms, got ${elapsed}ms`);
        });

        test('should return immediately if available', async function() {
            // This test requires Ollama to be running
            // Skip if not available
            const quickCheck = await quickHealthCheck();
            if (!quickCheck) {
                this.skip();
                return;
            }

            const startTime = Date.now();
            const result = await waitForOllama('http://localhost:11434', 5000, 100);
            const elapsed = Date.now() - startTime;
            
            assert.strictEqual(result.available, true);
            assert.ok(elapsed < 500, 'Should return immediately if available');
        });
    });
});
