/**
 * Urgency Classifier using local Ollama LLM.
 * Classifies call transcripts into urgency levels.
 */
import { OllamaConfig } from '../shared/config';
import { UrgencyLevel } from '../shared/types';
import { UrgencyClassification, OllamaGenerateResponse } from './types';
import { URGENCY_SYSTEM_PROMPT, buildUrgencyPrompt } from './prompts';

export class UrgencyClassifier {
  private _config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this._config = config;
  }

  /**
   * Classify the urgency of a call transcript.
   */
  public async classify(transcriptText: string): Promise<UrgencyClassification> {
    try {
      const prompt = buildUrgencyPrompt(transcriptText);
      const rawResponse = await this._generate(prompt, URGENCY_SYSTEM_PROMPT);
      const parsed = this._parseResponse(rawResponse);
      return parsed;
    } catch {
      // Fallback: rule-based classification
      return this._ruleBasedFallback(transcriptText);
    }
  }

  /**
   * Rule-based fallback when LLM fails.
   */
  private _ruleBasedFallback(text: string): UrgencyClassification {
    const lower = text.toLowerCase();

    const emergencyWords = [
      'notfall', 'bewusstlos', 'atemnot', 'brustschmerzen', 'krampfanfall',
      'starke blutung', 'ohnmacht', 'herzinfarkt', 'schlaganfall',
    ];
    const urgentWords = [
      'dringend', 'hohes fieber', 'starke schmerzen', 'verschlechterung',
      'seit tagen', 'akut', 'schlimmer geworden',
    ];

    for (const word of emergencyWords) {
      if (lower.includes(word)) {
        return {
          level: UrgencyLevel.NOTFALL,
          confidence: 0.7,
          reasoning: `Notfall-Schlüsselwort erkannt: "${word}" (Regel-basiert)`,
          urgencyCues: [word],
        };
      }
    }

    for (const word of urgentWords) {
      if (lower.includes(word)) {
        return {
          level: UrgencyLevel.DRINGEND,
          confidence: 0.6,
          reasoning: `Dringlichkeits-Schlüsselwort erkannt: "${word}" (Regel-basiert)`,
          urgencyCues: [word],
        };
      }
    }

    return {
      level: UrgencyLevel.NORMAL,
      confidence: 0.5,
      reasoning: 'Keine besonderen Dringlichkeitshinweise erkannt (Regel-basiert)',
      urgencyCues: [],
    };
  }

  private _parseResponse(rawResponse: string): UrgencyClassification {
    const json = this._extractJson(rawResponse);
    const parsed = JSON.parse(json);

    // Validate level
    const validLevels = Object.values(UrgencyLevel);
    if (!validLevels.includes(parsed.level)) {
      throw new Error(`Invalid urgency level: ${parsed.level}`);
    }

    return {
      level: parsed.level as UrgencyLevel,
      confidence: typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
      reasoning: parsed.reasoning || '',
      urgencyCues: Array.isArray(parsed.urgencyCues) ? parsed.urgencyCues : [],
    };
  }

  private _extractJson(text: string): string {
    // Try to extract JSON block from markdown code fences
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      return jsonMatch[1].trim();
    }
    // Try to find raw JSON object
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
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Ollama timeout after ${this._config.requestTimeoutMs}ms`));
      });

      req.write(body);
      req.end();
    });
  }
}
