/**
 * Empathy Analyzer using local Ollama LLM.
 * Analyzes emotional state of callers for better staff response.
 */
import { OllamaConfig } from '../shared/config';
import { EmpathyAnalysis, OllamaGenerateResponse } from './types';
import { EMPATHY_SYSTEM_PROMPT, buildEmpathyPrompt } from './prompts';

export class EmpathyAnalyzer {
  private _config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this._config = config;
  }

  /**
   * Analyze the emotional state of the caller.
   */
  public async analyze(transcriptText: string): Promise<EmpathyAnalysis> {
    try {
      const prompt = buildEmpathyPrompt(transcriptText);
      const rawResponse = await this._generate(prompt, EMPATHY_SYSTEM_PROMPT);
      return this._parseResponse(rawResponse);
    } catch {
      return this._ruleBasedFallback(transcriptText);
    }
  }

  private _ruleBasedFallback(text: string): EmpathyAnalysis {
    const lower = text.toLowerCase();

    const distressWords = ['schmerzen', 'angst', 'sorge', 'verzweifelt', 'hilfe', 'weinen', 'panik'];
    const angerWords = ['beschwerde', 'unverschämt', 'warten', 'unzufrieden', 'ärgerlich'];

    let distressCount = 0;
    let angerCount = 0;
    const cues: string[] = [];

    for (const word of distressWords) {
      if (lower.includes(word)) { distressCount++; cues.push(word); }
    }
    for (const word of angerWords) {
      if (lower.includes(word)) { angerCount++; cues.push(word); }
    }

    let sentiment: EmpathyAnalysis['overallSentiment'] = 'neutral';
    let tone: EmpathyAnalysis['recommendedTone'] = 'professionalism';

    if (distressCount >= 2) {
      sentiment = 'distressed';
      tone = 'reassurance';
    } else if (distressCount === 1) {
      sentiment = 'concerned';
      tone = 'warmth';
    } else if (angerCount >= 1) {
      sentiment = 'angry';
      tone = 'calm';
    }

    return {
      overallSentiment: sentiment,
      distressLevel: Math.min(1, (distressCount * 0.3) + (angerCount * 0.2)),
      urgencyCues: cues,
      empathyNotes: 'Regel-basierte Einschätzung',
      recommendedTone: tone,
    };
  }

  private _parseResponse(rawResponse: string): EmpathyAnalysis {
    const json = this._extractJson(rawResponse);
    const parsed = JSON.parse(json);

    const validSentiments = ['positive', 'neutral', 'concerned', 'distressed', 'angry'];
    const validTones = ['warmth', 'reassurance', 'urgency', 'professionalism', 'calm'];

    return {
      overallSentiment: validSentiments.includes(parsed.overallSentiment)
        ? parsed.overallSentiment
        : 'neutral',
      distressLevel: typeof parsed.distressLevel === 'number'
        ? Math.max(0, Math.min(1, parsed.distressLevel))
        : 0,
      urgencyCues: Array.isArray(parsed.urgencyCues) ? parsed.urgencyCues : [],
      empathyNotes: parsed.empathyNotes || '',
      recommendedTone: validTones.includes(parsed.recommendedTone)
        ? parsed.recommendedTone
        : 'professionalism',
      suggestedResponse: parsed.suggestedResponse || undefined,
    };
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
