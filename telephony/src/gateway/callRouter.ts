/**
 * Call Router.
 * Orchestrates the full call lifecycle:
 *   Starface poll → detect new call → consent → record → transcribe → triage → emit
 */
import { v4 as uuidv4 } from 'uuid';
import { TelephonyConfig } from '../shared/config';
import {
  Call,
  CallDirection,
  CallState,
  CallEvent,
  Transcript,
  TriageResult,
} from '../shared/types';
import { StarfaceAuth, StarfaceClient, StarfaceCalls, StarfaceContacts } from '../starface';
import { WhisperLocal, AudioFileManager, StreamingTranscription } from '../audio';
import { getGermanWhisperConfig } from '../audio/germanConfig';
import { PreDocumentation } from '../triage';
import { ConsentManager, AuditLogger, PrivacyFilter } from '../compliance';
import { AuditAction } from '../compliance/types';
import { StarfaceCallEntry } from '../starface/types';

export type CallEventHandler = (event: CallEvent) => void;
export type TriageResultHandler = (result: TriageResult) => void;

export class CallRouter {
  private _config: TelephonyConfig;
  private _starfaceAuth: StarfaceAuth;
  private _starfaceClient: StarfaceClient;
  private _starfaceCalls: StarfaceCalls;
  private _starfaceContacts: StarfaceContacts;
  private _whisper: WhisperLocal;
  private _audioFileManager: AudioFileManager;
  private _streamingTranscription: StreamingTranscription;
  private _preDocumentation: PreDocumentation;
  private _consentManager: ConsentManager;
  private _auditLogger: AuditLogger;
  private _privacyFilter: PrivacyFilter;

  private _activeCalls: Map<string, Call> = new Map();
  private _previousStarfaceCalls: StarfaceCallEntry[] = [];
  private _pollTimer: ReturnType<typeof setInterval> | null = null;

  private _onCallEvent: CallEventHandler[] = [];
  private _onTriageResult: TriageResultHandler[] = [];

  constructor(config: TelephonyConfig) {
    this._config = config;

    // Initialize Starface
    this._starfaceAuth = new StarfaceAuth(config.starface);
    this._starfaceClient = new StarfaceClient(config.starface, this._starfaceAuth);
    this._starfaceCalls = new StarfaceCalls(this._starfaceClient);
    this._starfaceContacts = new StarfaceContacts(this._starfaceClient);

    // Initialize Audio
    this._whisper = new WhisperLocal(config.whisper);
    this._audioFileManager = new AudioFileManager(config.gateway.audioTempDir);
    this._streamingTranscription = new StreamingTranscription(this._whisper);

    // Initialize Triage
    this._preDocumentation = new PreDocumentation(config.ollama);

    // Initialize Compliance
    this._auditLogger = new AuditLogger();
    this._consentManager = new ConsentManager(this._auditLogger);
    this._privacyFilter = new PrivacyFilter();
  }

  /** Register a handler for call events. */
  public onCallEvent(handler: CallEventHandler): void {
    this._onCallEvent.push(handler);
  }

  /** Register a handler for completed triage results. */
  public onTriageResult(handler: TriageResultHandler): void {
    this._onTriageResult.push(handler);
  }

  /**
   * Start the call routing engine.
   * Authenticates with Starface, then begins polling for call events.
   */
  public async start(): Promise<void> {
    console.log('[CallRouter] Starting...');

    // Authenticate with Starface
    await this._starfaceAuth.getToken();
    console.log('[CallRouter] Starface authenticated');

    // Start polling
    this._pollTimer = setInterval(
      () => this._pollCalls().catch((err) => console.error('[CallRouter] Poll error:', err)),
      this._config.starface.pollIntervalMs
    );

    console.log(`[CallRouter] Polling every ${this._config.starface.pollIntervalMs}ms`);
  }

  /**
   * Stop the call routing engine.
   */
  public stop(): void {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    console.log('[CallRouter] Stopped');
  }

  /**
   * Get all active calls.
   */
  public getActiveCalls(): Call[] {
    return Array.from(this._activeCalls.values());
  }

  /**
   * Get a specific call by ID.
   */
  public getCall(callId: string): Call | undefined {
    return this._activeCalls.get(callId);
  }

  /**
   * Process a completed call: transcribe and triage.
   * Called when a call ends and has a recording.
   */
  public async processCompletedCall(call: Call): Promise<TriageResult | null> {
    if (!call.recordingPath) {
      console.log(`[CallRouter] No recording for call ${call.id}, skipping triage`);
      return null;
    }

    // Check consent
    if (!this._consentManager.canProcessWithAI(call.id)) {
      console.log(`[CallRouter] No AI consent for call ${call.id}, skipping triage`);
      this._auditLogger.log({
        action: AuditAction.TRIAGE_PERFORMED,
        resourceType: 'call',
        resourceId: call.id,
        actor: 'system',
        metadata: { blocked: true, reason: 'No AI processing consent given' },
      });
      return null;
    }

    try {
      // Transcribe
      const germanConfig = getGermanWhisperConfig();
      const transcript = await this._streamingTranscription.transcribe(
        {
          audioPath: call.recordingPath,
          language: germanConfig.language,
          initialPrompt: germanConfig.initialPrompt,
        },
        call.id
      );

      this._auditLogger.log({
        action: AuditAction.TRANSCRIPT_CREATED,
        resourceType: 'transcript',
        resourceId: transcript.id,
        actor: 'system',
        metadata: { callId: call.id, segments: transcript.segments.length },
      });

      // Apply privacy filter to transcript before triage
      const filteredText = this._privacyFilter.redact(transcript.fullText);
      const filteredTranscript: Transcript = {
        ...transcript,
        fullText: filteredText,
        segments: transcript.segments.map((s) => ({
          ...s,
          text: this._privacyFilter.redact(s.text),
        })),
      };

      // Run triage
      const triageResult = await this._preDocumentation.generateTriageResult(
        call.id,
        filteredTranscript
      );

      this._auditLogger.log({
        action: AuditAction.TRIAGE_PERFORMED,
        resourceType: 'call',
        resourceId: call.id,
        actor: 'system',
        metadata: { urgency: triageResult.urgency, intent: triageResult.intent },
      });

      // Emit triage result
      for (const handler of this._onTriageResult) {
        handler(triageResult);
      }

      return triageResult;
    } catch (error) {
      console.error(`[CallRouter] Error processing call ${call.id}:`, error);
      return null;
    }
  }

  /**
   * Poll Starface for call changes.
   */
  private async _pollCalls(): Promise<void> {
    const currentCalls = await this._starfaceCalls.getActiveCalls();
    const previousMap = new Map(this._previousStarfaceCalls.map((c) => [c.id, c]));
    const changes = this._starfaceCalls.detectChanges(previousMap, currentCalls);

    // Process new calls
    for (const starfaceCall of changes.newCalls) {
      const callId = uuidv4();

      // Look up caller
      const callerContact = await this._starfaceContacts.findByPhoneNumber(
        starfaceCall.callerId || ''
      );

      const callerDisplayName = callerContact
        ? `${callerContact.firstName || ''} ${callerContact.lastName || ''}`.trim()
        : starfaceCall.callerName;

      const call: Call = {
        id: callId,
        starfaceCallId: String(starfaceCall.id),
        direction: this._mapDirection(starfaceCall),
        state: CallState.RINGING,
        caller: {
          phoneNumber: starfaceCall.callerId || 'unknown',
          displayName: callerDisplayName || undefined,
          contactId: callerContact?.id,
          isKnownPatient: callerContact !== null,
        },
        calledNumber: starfaceCall.calledId || '',
        startTime: new Date().toISOString(),
        recordingConsent: false,
      };

      this._activeCalls.set(callId, call);

      const event: CallEvent = {
        type: 'call_started',
        callId,
        starfaceCallId: String(starfaceCall.id),
        timestamp: new Date().toISOString(),
        data: call,
      };

      this._emitCallEvent(event);
    }

    // Process ended calls
    for (const starfaceCall of changes.endedCalls) {
      const call = this._findCallByStarfaceId(String(starfaceCall.id));
      if (call) {
        call.state = CallState.COMPLETED;
        call.endTime = new Date().toISOString();
        if (call.startTime) {
          call.durationMs = Date.now() - new Date(call.startTime).getTime();
        }

        const event: CallEvent = {
          type: 'call_ended',
          callId: call.id,
          starfaceCallId: String(starfaceCall.id),
          timestamp: new Date().toISOString(),
          data: call,
        };

        this._emitCallEvent(event);

        // Process completed call asynchronously
        this.processCompletedCall(call).catch((err) =>
          console.error(`[CallRouter] Post-call processing error:`, err)
        );
      }
    }

    this._previousStarfaceCalls = currentCalls;
  }

  private _findCallByStarfaceId(starfaceCallId: string): Call | undefined {
    for (const call of this._activeCalls.values()) {
      if (call.starfaceCallId === starfaceCallId) return call;
    }
    return undefined;
  }

  private _mapDirection(starfaceCall: StarfaceCallEntry): CallDirection {
    if (starfaceCall.direction === 'INBOUND') return CallDirection.INBOUND;
    if (starfaceCall.direction === 'OUTBOUND') return CallDirection.OUTBOUND;
    return CallDirection.INTERNAL;
  }

  private _emitCallEvent(event: CallEvent): void {
    for (const handler of this._onCallEvent) {
      handler(event);
    }
  }
}
