/**
 * Unit tests for DSGVO Compliance modules.
 * Tests ConsentManager, AuditLogger, PrivacyFilter, and RetentionScheduler.
 */
import * as assert from 'assert';
import { ConsentManager } from '../../src/compliance/consentManager';
import { AuditLogger } from '../../src/compliance/auditLogger';
import { PrivacyFilter } from '../../src/compliance/privacyFilter';
import { RetentionScheduler } from '../../src/compliance/retentionScheduler';
import { ConsentType, ConsentMethod, AuditAction, DEFAULT_RETENTION_POLICIES } from '../../src/compliance/types';

describe('ConsentManager', () => {
  let auditLogger: AuditLogger;
  let manager: ConsentManager;

  beforeEach(() => {
    auditLogger = new AuditLogger();
    manager = new ConsentManager(auditLogger);
  });

  it('should grant and check consent', () => {
    manager.grantConsent({
      callId: 'call-1',
      callerPhone: '+49 171 1234567',
      consentType: ConsentType.RECORDING,
      method: ConsentMethod.VERBAL,
    });

    assert.strictEqual(manager.hasConsent('call-1', ConsentType.RECORDING), true);
    assert.strictEqual(manager.hasConsent('call-1', ConsentType.AI_PROCESSING), false);
  });

  it('should revoke consent', () => {
    manager.grantConsent({
      callId: 'call-1',
      callerPhone: '+49 171 1234567',
      consentType: ConsentType.RECORDING,
      method: ConsentMethod.VERBAL,
    });

    manager.revokeConsent('call-1', ConsentType.RECORDING, 'caller');
    assert.strictEqual(manager.hasConsent('call-1', ConsentType.RECORDING), false);
  });

  it('should check canRecord requires RECORDING consent', () => {
    assert.strictEqual(manager.canRecord('call-1'), false);

    manager.grantConsent({
      callId: 'call-1',
      callerPhone: '+49 171 1234567',
      consentType: ConsentType.RECORDING,
      method: ConsentMethod.VERBAL,
    });

    assert.strictEqual(manager.canRecord('call-1'), true);
  });

  it('should check canProcessWithAI requires AI_PROCESSING consent', () => {
    assert.strictEqual(manager.canProcessWithAI('call-1'), false);

    manager.grantConsent({
      callId: 'call-1',
      callerPhone: '+49 171 1234567',
      consentType: ConsentType.AI_PROCESSING,
      method: ConsentMethod.VERBAL,
    });

    assert.strictEqual(manager.canProcessWithAI('call-1'), true);
  });

  it('should create audit entries for consent operations', () => {
    manager.grantConsent({
      callId: 'call-1',
      callerPhone: '+49 171 1234567',
      consentType: ConsentType.RECORDING,
      method: ConsentMethod.VERBAL,
    });

    const entries = auditLogger.getByAction(AuditAction.CONSENT_GRANTED);
    assert.ok(entries.length >= 1, 'Should have audit entry for granted consent');
  });
});

describe('AuditLogger', () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = new AuditLogger();
  });

  it('should log entries with required fields', () => {
    const entry = logger.log({
      action: AuditAction.CALL_RECORDED,
      actor: 'system',
      resourceType: 'call',
      resourceId: 'call-1',
    });

    assert.ok(entry.id, 'Entry must have an ID');
    assert.ok(entry.timestamp, 'Entry must have a timestamp');
    assert.strictEqual(entry.action, AuditAction.CALL_RECORDED);
    assert.strictEqual(entry.actor, 'system');
    assert.strictEqual(entry.resourceType, 'call');
    assert.strictEqual(entry.resourceId, 'call-1');
  });

  it('should query by resource', () => {
    logger.log({ action: AuditAction.CALL_RECORDED, actor: 'system', resourceType: 'call', resourceId: 'c1' });
    logger.log({ action: AuditAction.TRANSCRIPT_CREATED, actor: 'system', resourceType: 'transcript', resourceId: 't1' });
    logger.log({ action: AuditAction.CALL_RECORDED, actor: 'system', resourceType: 'call', resourceId: 'c2' });

    const callEntries = logger.getByResource('call', 'c1');
    assert.strictEqual(callEntries.length, 1);
  });

  it('should query by action', () => {
    logger.log({ action: AuditAction.CALL_RECORDED, actor: 'system', resourceType: 'call', resourceId: 'c1' });
    logger.log({ action: AuditAction.CALL_RECORDED, actor: 'system', resourceType: 'call', resourceId: 'c2' });
    logger.log({ action: AuditAction.TRANSCRIPT_CREATED, actor: 'system', resourceType: 'transcript', resourceId: 't1' });

    const recorded = logger.getByAction(AuditAction.CALL_RECORDED);
    assert.strictEqual(recorded.length, 2);
  });

  it('should support metadata', () => {
    const entry = logger.log({
      action: AuditAction.TRIAGE_PERFORMED,
      actor: 'system',
      resourceType: 'call',
      resourceId: 'c1',
      metadata: { urgency: 'notfall', confidence: 0.95 },
    });

    assert.deepStrictEqual(entry.metadata, { urgency: 'notfall', confidence: 0.95 });
  });

  it('entries should be immutable after creation', () => {
    const all = logger.exportAll();
    const initialLength = all.length;

    logger.log({ action: AuditAction.CALL_RECORDED, actor: 'system', resourceType: 'call', resourceId: 'c1' });

    // The previously returned array should not be affected
    assert.strictEqual(all.length, initialLength);
  });
});

describe('PrivacyFilter', () => {
  let filter: PrivacyFilter;

  beforeEach(() => {
    filter = new PrivacyFilter();
  });

  it('should redact German phone numbers', () => {
    const text = 'Sie können mich unter +49 171 1234567 erreichen';
    const redacted = filter.redact(text);
    assert.ok(!redacted.includes('1234567'), 'Phone number should be redacted');
    assert.ok(redacted.includes('[TELEFON]') || redacted.includes('[REDACTED]'),
      'Should contain redaction marker');
  });

  it('should redact email addresses', () => {
    const text = 'Meine Email ist patient@example.com';
    const redacted = filter.redact(text);
    assert.ok(!redacted.includes('patient@example.com'), 'Email should be redacted');
  });

  it('should redact IBAN numbers', () => {
    const text = 'IBAN: DE89370400440532013000';
    const redacted = filter.redact(text);
    assert.ok(!redacted.includes('DE89370400440532013000'), 'IBAN should be redacted');
  });

  it('should redact German date-of-birth patterns', () => {
    const text = 'Geboren am 15.03.1965';
    const redacted = filter.redact(text);
    assert.ok(!redacted.includes('15.03.1965'), 'DOB should be redacted');
  });

  it('should detect PII presence', () => {
    assert.strictEqual(filter.containsPII('Normaler Text ohne PII'), false);
    assert.strictEqual(filter.containsPII('Rufen Sie +49 171 1234567 an'), true);
    assert.strictEqual(filter.containsPII('Email: test@test.de'), true);
  });

  it('should not redact non-PII medical text', () => {
    const text = 'Patient klagt über Kopfschmerzen und Übelkeit seit drei Tagen';
    const redacted = filter.redact(text);
    assert.strictEqual(redacted, text, 'Non-PII medical text should remain unchanged');
  });
});

describe('RetentionScheduler', () => {
  it('should initialize with default policies', () => {
    const scheduler = new RetentionScheduler(
      new AuditLogger(),
      async (_type, _olderThan) => 0,
    );

    // Just verify it constructs without errors
    assert.ok(scheduler, 'Scheduler should instantiate');
    scheduler.stop(); // Clean up interval
  });
});
