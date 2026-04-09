/**
 * DSGVO Compliance types.
 */
import { CallId, ConsentId } from '../shared/types';

/** Type of consent given */
export enum ConsentType {
  /** Consent to record the phone call */
  RECORDING = 'recording',
  /** Consent to AI processing of the call */
  AI_PROCESSING = 'ai_processing',
  /** Consent to store transcript */
  TRANSCRIPT_STORAGE = 'transcript_storage',
}

/** How consent was given */
export enum ConsentMethod {
  /** Verbal consent during call (recorded) */
  VERBAL = 'verbal',
  /** Written consent on file */
  WRITTEN = 'written',
  /** Opt-in via patient portal */
  DIGITAL = 'digital',
  /** Auto-play announcement + no opt-out = implied (legal grey area, not recommended) */
  ANNOUNCEMENT = 'announcement',
}

/** A consent record */
export interface ConsentRecord {
  id: ConsentId;
  callId: CallId;
  callerPhone: string;
  consentType: ConsentType;
  method: ConsentMethod;
  granted: boolean;
  timestamp: string;
  /** Staff member who verified consent */
  verifiedBy?: string;
  /** When consent expires (null = valid until revoked) */
  expiresAt?: string;
  /** When consent was revoked */
  revokedAt?: string;
}

/** Audit log entry types */
export enum AuditAction {
  CALL_RECORDED = 'call_recorded',
  TRANSCRIPT_CREATED = 'transcript_created',
  TRANSCRIPT_ACCESSED = 'transcript_accessed',
  TRANSCRIPT_DELETED = 'transcript_deleted',
  TRIAGE_PERFORMED = 'triage_performed',
  PREDOC_CREATED = 'predoc_created',
  PREDOC_ACCESSED = 'predoc_accessed',
  CONSENT_GRANTED = 'consent_granted',
  CONSENT_REVOKED = 'consent_revoked',
  DATA_EXPORTED = 'data_exported',
  DATA_DELETED = 'data_deleted',
  RETENTION_CLEANUP = 'retention_cleanup',
}

/** An immutable audit log entry */
export interface AuditEntry {
  id: string;
  timestamp: string;
  action: AuditAction;
  /** Who triggered the action (system, user ID, or 'auto') */
  actor: string;
  /** The resource affected */
  resourceType: 'call' | 'transcript' | 'predoc' | 'consent' | 'audio';
  resourceId: string;
  /** Additional metadata (never contains PII) */
  metadata?: Record<string, string | number | boolean>;
}

/** Data retention policy */
export interface RetentionPolicy {
  /** Resource type */
  resourceType: 'audio' | 'transcript' | 'predoc' | 'consent' | 'audit';
  /** Max retention in days */
  retentionDays: number;
  /** Legal basis for retention */
  legalBasis: string;
}

/** Default retention policies per German medical law */
export const DEFAULT_RETENTION_POLICIES: RetentionPolicy[] = [
  {
    resourceType: 'audio',
    retentionDays: 90,
    legalBasis: '§ 630f BGB — Aufbewahrung nach Verarbeitung nicht mehr erforderlich',
  },
  {
    resourceType: 'transcript',
    retentionDays: 3650, // 10 years
    legalBasis: '§ 630f BGB — Allgemeine Patientenakte: 10 Jahre nach Behandlungsabschluss',
  },
  {
    resourceType: 'predoc',
    retentionDays: 3650,
    legalBasis: '§ 630f BGB — Allgemeine Patientenakte: 10 Jahre nach Behandlungsabschluss',
  },
  {
    resourceType: 'consent',
    retentionDays: 3650,
    legalBasis: 'Art. 7 Abs. 1 DSGVO — Nachweis der Einwilligung',
  },
  {
    resourceType: 'audit',
    retentionDays: 3650,
    legalBasis: 'Art. 5 Abs. 2 DSGVO — Rechenschaftspflicht',
  },
];
