/**
 * Core shared types for the Telephony service.
 * Used across all modules: starface, audio, triage, compliance, gateway.
 */

/** Unique identifiers */
export type CallId = string;
export type ContactId = string;
export type UserId = string;
export type GroupId = string;
export type TranscriptId = string;
export type ConsentId = string;

/** Call direction */
export enum CallDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
  INTERNAL = 'internal',
}

/** Call state lifecycle */
export enum CallState {
  RINGING = 'ringing',
  ACTIVE = 'active',
  ON_HOLD = 'on_hold',
  TRANSFERRED = 'transferred',
  COMPLETED = 'completed',
  MISSED = 'missed',
  VOICEMAIL = 'voicemail',
}

/** Urgency levels for medical triage */
export enum UrgencyLevel {
  NOTFALL = 'notfall',         // Emergency — immediate action
  DRINGEND = 'dringend',       // Urgent — same-day
  NORMAL = 'normal',           // Normal — schedule appointment
  INFORMATION = 'information', // Info request — no clinical urgency
}

/** Medical call intents */
export enum CallIntent {
  TERMIN = 'termin',               // Appointment scheduling
  REZEPT = 'rezept',               // Prescription request
  UEBERWEISUNG = 'ueberweisung',  // Referral
  BEFUND = 'befund',               // Test results inquiry
  BERATUNG = 'beratung',           // Medical consultation
  NOTFALL = 'notfall',             // Emergency
  VERWALTUNG = 'verwaltung',       // Administrative (insurance, billing)
  SONSTIGES = 'sonstiges',         // Other
}

/** Caller information resolved from Starface contacts */
export interface CallerInfo {
  phoneNumber: string;
  displayName?: string;
  contactId?: ContactId;
  isKnownPatient: boolean;
  /** Last visit date if patient is known */
  lastVisit?: string;
}

/** A phone call record */
export interface Call {
  id: CallId;
  starfaceCallId: string;
  direction: CallDirection;
  state: CallState;
  caller: CallerInfo;
  calledNumber: string;
  /** Starface group/queue the call was routed to */
  targetGroup?: string;
  startTime: string;       // ISO 8601
  answerTime?: string;
  endTime?: string;
  durationMs?: number;
  /** Path to recorded audio file (local) */
  recordingPath?: string;
  /** Has DSGVO recording consent been given? */
  recordingConsent: boolean;
}

/** A call event emitted by the Starface polling or webhook */
export interface CallEvent {
  type: 'call_started' | 'call_answered' | 'call_ended' | 'call_missed' | 'call_transferred';
  callId: CallId;
  starfaceCallId: string;
  timestamp: string;
  data: Partial<Call>;
}

/** A transcript segment */
export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
  confidence: number;
  speaker?: 'caller' | 'staff' | 'unknown';
}

/** Full transcript of a call */
export interface Transcript {
  id: TranscriptId;
  callId: CallId;
  segments: TranscriptSegment[];
  fullText: string;
  language: string;
  model: string;
  processingTimeMs: number;
  createdAt: string;
}

/** Empathy / sentiment analysis result */
export interface EmpathyScore {
  overallSentiment: 'positive' | 'neutral' | 'concerned' | 'distressed' | 'angry';
  distressLevel: number;   // 0.0 – 1.0
  urgencyCues: string[];   // e.g., ["Schmerzen", "Atemnot", "seit 3 Tagen"]
  empathyNotes: string;    // LLM-generated contextual note
}

/** Pre-documentation generated from transcript */
export interface PreDocument {
  callId: CallId;
  patientName?: string;
  dateOfBirth?: string;
  urgency: UrgencyLevel;
  intent: CallIntent;
  chiefComplaint: string;
  symptoms: string[];
  requestedAction: string;
  suggestedICD10?: string[];
  freeText: string;
  /** Staff notes / recommendations from AI */
  aiNotes: string;
  empathy: EmpathyScore;
  createdAt: string;
}

/** Triage result combining urgency, intent, and pre-doc */
export interface TriageResult {
  callId: CallId;
  urgency: UrgencyLevel;
  intent: CallIntent;
  confidence: number;         // 0.0 – 1.0
  reasoning: string;          // LLM explanation
  preDocument: PreDocument;
  transcript: Transcript;
  processingTimeMs: number;
  model: string;
}

/** WebSocket message types for live updates */
export type WsMessageType =
  | 'call_event'
  | 'transcription_progress'
  | 'transcription_complete'
  | 'triage_complete'
  | 'connection_status'
  | 'error';

export interface WsMessage {
  type: WsMessageType;
  timestamp: string;
  data: unknown;
}
