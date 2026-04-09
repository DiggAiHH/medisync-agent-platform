/**
 * Pre-Documentation Generator.
 * Creates structured pre-documentation from transcript analysis.
 * Combines urgency, intent, empathy, and extracted details into a complete PreDocument.
 */
import { OllamaConfig } from '../shared/config';
import {
  CallId,
  CallIntent,
  PreDocument,
  EmpathyScore,
  Transcript,
  TriageResult,
} from '../shared/types';
import { UrgencyClassification, IntentExtraction, EmpathyAnalysis, OllamaGenerateResponse } from './types';
import { UrgencyClassifier } from './urgencyClassifier';
import { IntentExtractor } from './intentExtractor';
import { EmpathyAnalyzer } from './empathyAnalyzer';
import { PREDOC_SYSTEM_PROMPT, buildPreDocPrompt } from './prompts';

export class PreDocumentation {
  private _config: OllamaConfig;
  private _urgencyClassifier: UrgencyClassifier;
  private _intentExtractor: IntentExtractor;
  private _empathyAnalyzer: EmpathyAnalyzer;

  constructor(config: OllamaConfig) {
    this._config = config;
    this._urgencyClassifier = new UrgencyClassifier(config);
    this._intentExtractor = new IntentExtractor(config);
    this._empathyAnalyzer = new EmpathyAnalyzer(config);
  }

  /**
   * Generate a complete triage result from a transcript.
   * Runs urgency, intent, and empathy analysis in parallel, then generates pre-doc.
   */
  public async generateTriageResult(
    callId: CallId,
    transcript: Transcript
  ): Promise<TriageResult> {
    const startTime = Date.now();

    // Run analyses in parallel
    const [urgency, intent, empathy] = await Promise.all([
      this._urgencyClassifier.classify(transcript.fullText),
      this._intentExtractor.extract(transcript.fullText),
      this._empathyAnalyzer.analyze(transcript.fullText),
    ]);

    // Generate pre-documentation with additional LLM call
    const preDoc = await this._generatePreDocument(
      callId,
      transcript.fullText,
      urgency,
      intent,
      empathy
    );

    const processingTimeMs = Date.now() - startTime;

    return {
      callId,
      urgency: urgency.level,
      intent: intent.primaryIntent,
      confidence: (urgency.confidence + intent.confidence) / 2,
      reasoning: urgency.reasoning,
      preDocument: preDoc,
      transcript,
      processingTimeMs,
      model: this._config.model,
    };
  }

  /**
   * Generate the pre-documentation from all analysis results.
   */
  private async _generatePreDocument(
    callId: CallId,
    transcriptText: string,
    urgency: UrgencyClassification,
    intent: IntentExtraction,
    empathy: EmpathyAnalysis
  ): Promise<PreDocument> {
    let chiefComplaint = '';
    let symptoms: string[] = [];
    let requestedAction = '';
    let suggestedICD10: string[] | undefined;
    let freeText = '';
    let aiNotes = '';

    try {
      const prompt = buildPreDocPrompt(transcriptText, urgency.level, intent.primaryIntent);
      const rawResponse = await this._generate(prompt, PREDOC_SYSTEM_PROMPT);
      const parsed = this._parsePreDocResponse(rawResponse);

      chiefComplaint = parsed.chiefComplaint || intent.extractedDetails.freeText || '';
      symptoms = parsed.symptoms || intent.extractedDetails.symptoms || [];
      requestedAction = parsed.requestedAction || '';
      suggestedICD10 = parsed.suggestedICD10;
      freeText = parsed.freeText || '';
      aiNotes = parsed.aiNotes || '';
    } catch {
      // Fallback: build from intent extraction data
      chiefComplaint = intent.extractedDetails.freeText || 'Aus Transkript nicht eindeutig erkennbar';
      symptoms = intent.extractedDetails.symptoms || [];
      requestedAction = this._intentToAction(intent.primaryIntent);
      freeText = transcriptText.substring(0, 500);
      aiNotes = `Dringlichkeit: ${urgency.level} (${urgency.reasoning})`;
    }

    const empathyScore: EmpathyScore = {
      overallSentiment: empathy.overallSentiment,
      distressLevel: empathy.distressLevel,
      urgencyCues: empathy.urgencyCues,
      empathyNotes: empathy.empathyNotes,
    };

    return {
      callId,
      patientName: intent.extractedDetails.patientName,
      dateOfBirth: intent.extractedDetails.dateOfBirth,
      urgency: urgency.level,
      intent: intent.primaryIntent,
      chiefComplaint,
      symptoms,
      requestedAction,
      suggestedICD10,
      freeText,
      aiNotes,
      empathy: empathyScore,
      createdAt: new Date().toISOString(),
    };
  }

  private _parsePreDocResponse(rawResponse: string): {
    chiefComplaint?: string;
    symptoms?: string[];
    requestedAction?: string;
    suggestedICD10?: string[];
    freeText?: string;
    aiNotes?: string;
  } {
    const json = this._extractJson(rawResponse);
    return JSON.parse(json);
  }

  private _intentToAction(intent: CallIntent): string {
    const actions: Record<CallIntent, string> = {
      [CallIntent.TERMIN]: 'Termin vereinbaren',
      [CallIntent.REZEPT]: 'Rezept ausstellen',
      [CallIntent.UEBERWEISUNG]: 'Überweisung erstellen',
      [CallIntent.BEFUND]: 'Befund mitteilen',
      [CallIntent.BERATUNG]: 'Ärztliche Beratung',
      [CallIntent.NOTFALL]: 'Sofortige ärztliche Versorgung',
      [CallIntent.VERWALTUNG]: 'Administrative Bearbeitung',
      [CallIntent.SONSTIGES]: 'Klärung des Anliegens',
    };
    return actions[intent] || 'Klärung des Anliegens';
  }

  private _extractJson(text: string): string {
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) return jsonMatch[1].trim();
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) return braceMatch[0];
    return text;
  }

  private async _generate(prompt: string, system: string): Promise<string> {
    const url = new URL('/api/generate', this._config.endpoint);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? await import('https') : await import('http');

    const body = JSON.stringify({
      model: this._config.model,
      prompt,
      system,
      temperature: this._config.temperature,
      num_predict: this._config.maxTokens,
      format: 'json',
      stream: false,
    });

    return new Promise<string>((resolve, reject) => {
      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body).toString(),
          },
          timeout: this._config.requestTimeoutMs,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => (data += chunk.toString()));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const parsed = JSON.parse(data) as OllamaGenerateResponse;
                resolve(parsed.response);
              } catch {
                reject(new Error(`Invalid Ollama response: ${data.substring(0, 200)}`));
              }
            } else {
              reject(new Error(`Ollama error ${res.statusCode}: ${data.substring(0, 500)}`));
            }
          });
        }
      );
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Ollama timeout')); });
      req.write(body);
      req.end();
    });
  }
}
