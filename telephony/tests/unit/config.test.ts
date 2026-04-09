/**
 * Unit tests for shared config validation.
 */
import * as assert from 'assert';
import {
  StarfaceConfigSchema,
  WhisperConfigSchema,
  OllamaConfigSchema,
  PiperConfigSchema,
  GatewayConfigSchema,
  TelephonyConfigSchema,
} from '../../src/shared/config';

describe('Config Schemas', () => {
  describe('StarfaceConfigSchema', () => {
    it('should validate a complete config', () => {
      const result = StarfaceConfigSchema.safeParse({
        baseUrl: 'https://192.168.1.100:443',
        loginId: '0001',
        password: 'testpass',
      });
      assert.ok(result.success, 'Should validate successfully');
      if (result.success) {
        assert.strictEqual(result.data.pollIntervalMs, 2000); // default
        assert.strictEqual(result.data.tlsRejectUnauthorized, false); // default
      }
    });

    it('should reject invalid URL', () => {
      const result = StarfaceConfigSchema.safeParse({
        baseUrl: 'not-a-url',
        loginId: '0001',
        password: 'test',
      });
      assert.ok(!result.success);
    });

    it('should reject empty loginId', () => {
      const result = StarfaceConfigSchema.safeParse({
        baseUrl: 'https://localhost:443',
        loginId: '',
        password: 'test',
      });
      assert.ok(!result.success);
    });
  });

  describe('WhisperConfigSchema', () => {
    it('should provide correct defaults', () => {
      const result = WhisperConfigSchema.safeParse({});
      assert.ok(result.success);
      if (result.success) {
        assert.strictEqual(result.data.endpoint, 'http://localhost:8178');
        assert.strictEqual(result.data.model, 'large-v3');
        assert.strictEqual(result.data.language, 'de');
      }
    });

    it('should validate model enum', () => {
      const result = WhisperConfigSchema.safeParse({ model: 'invalid-model' });
      assert.ok(!result.success);
    });
  });

  describe('OllamaConfigSchema', () => {
    it('should provide correct defaults', () => {
      const result = OllamaConfigSchema.safeParse({});
      assert.ok(result.success);
      if (result.success) {
        assert.strictEqual(result.data.endpoint, 'http://localhost:11434');
        assert.strictEqual(result.data.model, 'llama3.2');
        assert.strictEqual(result.data.temperature, 0.2);
      }
    });

    it('should reject temperature out of range', () => {
      const result = OllamaConfigSchema.safeParse({ temperature: 3.0 });
      assert.ok(!result.success);
    });
  });

  describe('PiperConfigSchema', () => {
    it('should provide correct defaults', () => {
      const result = PiperConfigSchema.safeParse({});
      assert.ok(result.success);
      if (result.success) {
        assert.strictEqual(result.data.voice, 'de_DE-thorsten-high');
        assert.strictEqual(result.data.sampleRate, 22050);
      }
    });
  });

  describe('GatewayConfigSchema', () => {
    it('should provide correct defaults', () => {
      const result = GatewayConfigSchema.safeParse({});
      assert.ok(result.success);
      if (result.success) {
        assert.strictEqual(result.data.port, 3100);
        assert.strictEqual(result.data.wsPort, 8180);
        assert.strictEqual(result.data.audioRetentionDays, 90);
        assert.strictEqual(result.data.transcriptRetentionDays, 3650);
      }
    });
  });

  describe('TelephonyConfigSchema', () => {
    it('should validate a complete nested config', () => {
      const result = TelephonyConfigSchema.safeParse({
        starface: {
          baseUrl: 'https://192.168.1.100:443',
          loginId: '0001',
          password: 'test',
        },
        whisper: {},
        ollama: {},
        piper: {},
        gateway: {},
      });
      assert.ok(result.success, 'Should validate complete config');
    });

    it('should reject missing starface config', () => {
      const result = TelephonyConfigSchema.safeParse({
        whisper: {},
        ollama: {},
        piper: {},
        gateway: {},
      });
      assert.ok(!result.success);
    });
  });
});
