/**
 * Local Whisper STT Integration.
 * Connects to a locally running whisper.cpp HTTP server or processes via CLI.
 * All audio stays on the local machine — DSGVO-konform.
 */
import * as fs from 'fs';
import * as path from 'path';
import { WhisperConfig } from '../shared/config';
import {
  TranscriptionRequest,
  WhisperResponse,
  WhisperSegment,
} from './types';
import { TranscriptSegment } from '../shared/types';

export class WhisperLocal {
  private _config: WhisperConfig;

  constructor(config: WhisperConfig) {
    this._config = config;
  }

  /**
   * Transcribe an audio file using the local Whisper server.
   * Sends the audio file via multipart/form-data POST to whisper.cpp HTTP server.
   */
  public async transcribe(request: TranscriptionRequest): Promise<WhisperResponse> {
    const audioPath = request.audioPath;

    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const stats = fs.statSync(audioPath);
    if (stats.size > this._config.maxFileSizeBytes) {
      throw new Error(
        `Audio file too large: ${stats.size} bytes (max ${this._config.maxFileSizeBytes})`
      );
    }

    const audioBuffer = fs.readFileSync(audioPath);
    const filename = path.basename(audioPath);

    // Build multipart form data manually (no external dependency)
    const boundary = `----WhisperBoundary${Date.now()}`;
    const formParts: Buffer[] = [];

    // Audio file part
    formParts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: audio/wav\r\n\r\n`
    ));
    formParts.push(audioBuffer);
    formParts.push(Buffer.from('\r\n'));

    // Model parameter
    const model = request.model || this._config.model;
    formParts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `${model}\r\n`
    ));

    // Language parameter
    const language = request.language || this._config.language;
    formParts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="language"\r\n\r\n` +
      `${language}\r\n`
    ));

    // Response format
    formParts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
      `verbose_json\r\n`
    ));

    // Initial prompt (if provided)
    if (request.initialPrompt) {
      formParts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="prompt"\r\n\r\n` +
        `${request.initialPrompt}\r\n`
      ));
    }

    // Closing boundary
    formParts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(formParts);

    return this._postMultipart(body, boundary);
  }

  /**
   * Convert Whisper segments to our internal TranscriptSegment format.
   */
  public static toTranscriptSegments(whisperSegments: WhisperSegment[]): TranscriptSegment[] {
    return whisperSegments.map((seg) => ({
      startMs: Math.round(seg.start * 1000),
      endMs: Math.round(seg.end * 1000),
      text: seg.text.trim(),
      confidence: Math.max(0, Math.min(1, Math.exp(seg.avg_logprob))),
      speaker: 'unknown' as const,
    }));
  }

  /**
   * Check if the Whisper server is healthy.
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

  private async _postMultipart(body: Buffer, boundary: string): Promise<WhisperResponse> {
    const url = new URL('/inference', this._config.endpoint);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? await import('https') : await import('http');

    return new Promise<WhisperResponse>((resolve, reject) => {
      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length.toString(),
          },
          timeout: this._config.requestTimeoutMs,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => (data += chunk.toString()));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(data) as WhisperResponse);
              } catch {
                reject(new Error(`Invalid JSON from Whisper: ${data.substring(0, 200)}`));
              }
            } else {
              reject(new Error(`Whisper error ${res.statusCode}: ${data.substring(0, 500)}`));
            }
          });
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Whisper timeout after ${this._config.requestTimeoutMs}ms`));
      });

      req.write(body);
      req.end();
    });
  }
}
