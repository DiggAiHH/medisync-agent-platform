/**
 * DSGVO Consent Manager.
 * Tracks recording and AI-processing consent per call.
 * All consent must be explicitly granted before any recording/processing.
 */
import { v4 as uuidv4 } from 'uuid';
import { CallId, ConsentId } from '../shared/types';
import {
  ConsentRecord,
  ConsentType,
  ConsentMethod,
  AuditAction,
} from './types';
import { AuditLogger } from './auditLogger';

export class ConsentManager {
  /** In-memory store. Replace with persistent DB in production. */
  private _consents: Map<string, ConsentRecord> = new Map();
  private _auditLogger: AuditLogger;

  constructor(auditLogger: AuditLogger) {
    this._auditLogger = auditLogger;
  }

  /**
   * Record that consent was granted for a call.
   */
  public grantConsent(params: {
    callId: CallId;
    callerPhone: string;
    consentType: ConsentType;
    method: ConsentMethod;
    verifiedBy?: string;
    expiresAt?: string;
  }): ConsentRecord {
    const record: ConsentRecord = {
      id: uuidv4(),
      callId: params.callId,
      callerPhone: params.callerPhone,
      consentType: params.consentType,
      method: params.method,
      granted: true,
      timestamp: new Date().toISOString(),
      verifiedBy: params.verifiedBy,
      expiresAt: params.expiresAt,
    };

    const key = this._key(params.callId, params.consentType);
    this._consents.set(key, record);

    this._auditLogger.log({
      action: AuditAction.CONSENT_GRANTED,
      actor: params.verifiedBy || 'system',
      resourceType: 'consent',
      resourceId: record.id,
      metadata: {
        callId: params.callId,
        consentType: params.consentType,
        method: params.method,
      },
    });

    return record;
  }

  /**
   * Revoke a previously granted consent.
   */
  public revokeConsent(callId: CallId, consentType: ConsentType, revokedBy: string): boolean {
    const key = this._key(callId, consentType);
    const record = this._consents.get(key);
    if (!record || !record.granted) {
      return false;
    }

    record.granted = false;
    record.revokedAt = new Date().toISOString();
    this._consents.set(key, record);

    this._auditLogger.log({
      action: AuditAction.CONSENT_REVOKED,
      actor: revokedBy,
      resourceType: 'consent',
      resourceId: record.id,
      metadata: { callId, consentType },
    });

    return true;
  }

  /**
   * Check if consent is currently valid for a call + type.
   */
  public hasConsent(callId: CallId, consentType: ConsentType): boolean {
    const key = this._key(callId, consentType);
    const record = this._consents.get(key);
    if (!record || !record.granted) {
      return false;
    }

    // Check expiry
    if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
      return false;
    }

    // Check revocation
    if (record.revokedAt) {
      return false;
    }

    return true;
  }

  /**
   * Check if recording is allowed for a call.
   * Requires RECORDING consent.
   */
  public canRecord(callId: CallId): boolean {
    return this.hasConsent(callId, ConsentType.RECORDING);
  }

  /**
   * Check if AI processing is allowed for a call.
   * Requires AI_PROCESSING consent.
   */
  public canProcessWithAI(callId: CallId): boolean {
    return this.hasConsent(callId, ConsentType.AI_PROCESSING);
  }

  /**
   * Get all consent records for a call.
   */
  public getConsentsForCall(callId: CallId): ConsentRecord[] {
    const results: ConsentRecord[] = [];
    for (const [key, record] of this._consents) {
      if (key.startsWith(callId + ':')) {
        results.push(record);
      }
    }
    return results;
  }

  /**
   * Get a consent record by ID.
   */
  public getConsentById(consentId: ConsentId): ConsentRecord | undefined {
    for (const record of this._consents.values()) {
      if (record.id === consentId) {
        return record;
      }
    }
    return undefined;
  }

  /**
   * Remove all consent records for a call (for retention cleanup).
   */
  public removeConsentsForCall(callId: CallId): number {
    let removed = 0;
    for (const key of this._consents.keys()) {
      if (key.startsWith(callId + ':')) {
        this._consents.delete(key);
        removed++;
      }
    }
    return removed;
  }

  private _key(callId: CallId, consentType: ConsentType): string {
    return `${callId}:${consentType}`;
  }
}
