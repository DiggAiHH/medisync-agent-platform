/**
 * Intent Extractor using local Ollama LLM.
 * Extracts caller intent and structured details from transcripts.
 */
import { OllamaConfig } from '../shared/config';
import { CallIntent } from '../shared/types';
import { IntentExtraction, OllamaGenerateResponse } from './types';
import { INTENT_SYSTEM_PROMPT, buildIntentPrompt } from './prompts';

export class IntentExtractor {
  private _config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this._config = config;
  }

  /**
   * Extract intent and details from a transcript.
   */
  public async extract(transcriptText: string): Promise<IntentExtraction> {
    try {
      const prompt = buildIntentPrompt(transcriptText);
      const rawResponse = await this._generate(prompt, INTENT_SYSTEM_PROMPT);
      return this._parseResponse(rawResponse);
    } catch {
      return this._ruleBasedFallback(transcriptText);
    }
  }

  /**
   * Rule-based fallback when LLM fails.
   */
  private _ruleBasedFallback(text: string): IntentExtraction {
    const lower = text.toLowerCase();

    const intentPatterns: Array<{ intent: CallIntent; keywords: string[] }> = [
      { intent: CallIntent.NOTFALL, keywords: ['notfall', 'sofort', 'krankenwagen', 'bewusstlos'] },
      { intent: CallIntent.TERMIN, keywords: ['termin', 'anmelden', 'sprechstunde', 'vorbeikommen'] },
      { intent: CallIntent.REZEPT, keywords: ['rezept', 'medikament', 'tabletten', 'nachbestell'] },
      { intent: CallIntent.UEBERWEISUNG, keywords: ['überweisung', 'facharzt', 'spezialist'] },
      { intent: CallIntent.BEFUND, keywords: ['befund', 'ergebnis', 'laborwerte', 'blutwerte'] },
      { intent: CallIntent.BERATUNG, keywords: ['frage', 'beratung', 'wissen', 'information'] },
      { intent: CallIntent.VERWALTUNG, keywords: ['versicherung', 'bescheinigung', 'krankschreibung'] },
    ];

    for (const { intent, keywords } of intentPatterns) {
      for (const keyword of keywords) {
        if (lower.includes(keyword)) {
          return {
            primaryIntent: intent,
            secondaryIntents: [],
            confidence: 0.5,
            extractedDetails: {
              freeText: `Schlüsselwort "${keyword}" erkannt (Regel-basiert)`,
            },
          };
        }
      }
    }

    return {
      primaryIntent: CallIntent.SONSTIGES,
      secondaryIntents: [],
      confidence: 0.3,
      extractedDetails: {
        freeText: 'Keine klare Absicht erkannt (Regel-basiert)',
      },
    };
  }

  private _parseResponse(rawResponse: string): IntentExtraction {
    const json = this._extractJson(rawResponse);
    const parsed = JSON.parse(json);

    const validIntents = Object.values(CallIntent);
    const primaryIntent = validIntents.includes(parsed.primaryIntent)
      ? parsed.primaryIntent as CallIntent
      : CallIntent.SONSTIGES;

    const secondaryIntents = Array.isArray(parsed.secondaryIntents)
      ? parsed.secondaryIntents.filter((i: string) => validIntents.includes(i as CallIntent)) as CallIntent[]
      : [];

    return {
      primaryIntent,
      secondaryIntents,
      confidence: typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
      extractedDetails: {
        patientName: parsed.extractedDetails?.patientName || undefined,
        dateOfBirth: parsed.extractedDetails?.dateOfBirth || undefined,
        symptoms: Array.isArray(parsed.extractedDetails?.symptoms)
          ? parsed.extractedDetails.symptoms
          : undefined,
        medications: Array.isArray(parsed.extractedDetails?.medications)
          ? parsed.extractedDetails.medications
          : undefined,
        requestedDate: parsed.extractedDetails?.requestedDate || undefined,
        doctorName: parsed.extractedDetails?.doctorName || undefined,
        insuranceInfo: parsed.extractedDetails?.insuranceInfo || undefined,
        freeText: parsed.extractedDetails?.freeText || undefined,
      },
    };
  }

  private _extractJson(text: string): string {
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      return jsonMatch[1].trim();
    }
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      return braceMatch[0];
    }
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
                reject(new Error(`Invalid response from Ollama: ${data.substring(0, 200)}`));
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
