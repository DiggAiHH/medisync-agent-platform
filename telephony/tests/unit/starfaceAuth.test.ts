/**
 * Unit tests for StarfaceAuth SHA512 challenge-response.
 */
import * as assert from 'assert';
import * as crypto from 'crypto';
import { StarfaceAuth } from '../../src/starface/auth';

describe('StarfaceAuth', () => {
  describe('computeSecret()', () => {
    it('should produce correct SHA512 challenge-response format', () => {
      const loginId = '0001';
      const nonce = 'abc123nonce';
      const password = 'testpassword';

      const secret = StarfaceAuth.computeSecret(loginId, nonce, password);

      // Verify format: loginId:hash
      assert.ok(secret.startsWith(`${loginId}:`), 'Secret must start with loginId:');

      const parts = secret.split(':');
      assert.strictEqual(parts.length, 2, 'Secret must have exactly one colon');
      assert.strictEqual(parts[0], loginId);
      // Hash should be 128 hex chars (SHA512)
      assert.strictEqual(parts[1].length, 128, 'SHA512 hash must be 128 hex characters');
    });

    it('should match manual SHA512 computation', () => {
      const loginId = '0001';
      const nonce = 'testnonce';
      const password = 'secret';

      // Manual computation per Starface docs:
      // 1. SHA512(password)
      const passwordHash = crypto.createHash('sha512').update(password).digest('hex');
      // 2. SHA512(loginId + nonce + passwordHash)
      const combined = loginId + nonce + passwordHash;
      const expectedHash = crypto.createHash('sha512').update(combined).digest('hex');
      const expected = `${loginId}:${expectedHash}`;

      const actual = StarfaceAuth.computeSecret(loginId, nonce, password);
      assert.strictEqual(actual, expected);
    });

    it('should produce different secrets for different nonces', () => {
      const loginId = '0001';
      const password = 'testpassword';

      const secret1 = StarfaceAuth.computeSecret(loginId, 'nonce1', password);
      const secret2 = StarfaceAuth.computeSecret(loginId, 'nonce2', password);

      assert.notStrictEqual(secret1, secret2);
    });

    it('should produce different secrets for different passwords', () => {
      const loginId = '0001';
      const nonce = 'nonce';

      const secret1 = StarfaceAuth.computeSecret(loginId, nonce, 'pass1');
      const secret2 = StarfaceAuth.computeSecret(loginId, nonce, 'pass2');

      assert.notStrictEqual(secret1, secret2);
    });
  });

  describe('isAuthenticated()', () => {
    it('should return false when not authenticated', () => {
      const auth = new StarfaceAuth({
        baseUrl: 'https://localhost:443',
        loginId: '0001',
        password: 'test',
        pollIntervalMs: 2000,
        requestTimeoutMs: 10000,
        tlsRejectUnauthorized: false,
      });

      assert.strictEqual(auth.isAuthenticated(), false);
    });
  });
});
