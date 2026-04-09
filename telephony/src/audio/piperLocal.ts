/**
 * Local Piper TTS Integration.
 * Connects to a locally running Piper HTTP server for German speech synthesis.
 * All processing stays on the local machine — DSGVO-konform.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PiperConfig } from '../shared/config';
import { SynthesisRequest, SynthesisResult, AudioFormat } from './types';

export class PiperLocal {
  private _config: PiperConfig;

  constructor(config: PiperConfig) {
    this._config = config;
  }

  /**
   * Synthesize text to speech.
   * Returns path to generated WAV file.
   */
  public async synthesize(request: SynthesisRequest): Promise<SynthesisResult> {
    const voice = request.voice || this._config.voice;
    const sampleRate = request.sampleRate || this._config.sampleRate;
    const outputPath = request.outputPath || this._generateOutputPath();

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const audioBuffer = await this._requestSynthesis(request.text, voice, sampleRate);

    fs.writeFileSync(outputPath, audioBuffer);

    return {
      audioPath: outputPath,
      format: AudioFormat.WAV,
      sizeBytes: audioBuffer.length,
      durationMs: this._estimateDuration(audioBuffer.length, sampleRate),
    };
  }

  /**
   * Check if the Piper server is healthy.
   */
  public async isHealthy(): Promise<boolean> {
    try {
      const url = new URL(this._config.endpoint);
      const lib = url.protocol === 'https:' ? await import('https') : await import('http');

      return new Promise<boolean>((resolve) => {
        const req = lib.request(
          {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: '/',
            method: 'GET',
            timeout: 5000,
          },
          (res) => {
            resolve(res.statusCode !== undefined && res.statusCode < 500);
            res.resume();
          }
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.end();
      });
    } catch {
      return false;
    }
  }

  private async _requestSynthesis(
    text: string,
    voice: string,
    sampleRate: number
  ): Promise<Buffer> {
    const url = new URL('/api/tts', this._config.endpoint);
    url.searchParams.set('voice', voice);
    url.searchParams.set('sampleRate', sampleRate.toString());
    if (this._config.speakerId !== undefined) {
      url.searchParams.set('speakerId', this._config.speakerId.toString());
    }

    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? await import('https') : await import('http');
    const body = text;

    return new Promise<Buffer>((resolve, reject) => {
      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
            'Content-Length': Buffer.byteLength(body).toString(),
          },
          timeout: this._config.requestTimeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(Buffer.concat(chunks));
            } else {
              const errorText = Buffer.concat(chunks).toString().substring(0, 500);
              reject(new Error(`Piper TTS error ${res.statusCode}: ${errorText}`));
            }
          });
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Piper TTS timeout after ${this._config.requestTimeoutMs}ms`));
      });

      req.write(body);
      req.end();
    });
  }

  private _generateOutputPath(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return path.join('/tmp/medisync-telephony', `tts_${timestamp}_${random}.wav`);
  }

  /**
   * Rough duration estimate from WAV buffer size.
   * WAV = 16-bit mono: duration = bytes / (sampleRate * 2)
   */
  private _estimateDuration(sizeBytes: number, sampleRate: number): number {
    // Subtract 44 bytes WAV header
    const audioBytes = Math.max(0, sizeBytes - 44);
    const durationSec = audioBytes / (sampleRate * 2);
    return Math.round(durationSec * 1000);
  }
}
