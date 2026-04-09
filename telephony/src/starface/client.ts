/**
 * Starface REST API HTTP Client.
 * Typed wrapper with automatic token management and retry logic.
 */
import { StarfaceConfig } from '../shared/config';
import { StarfaceAuth } from './auth';
import { StarfaceApiError } from './types';

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Skip authentication (for login endpoint) */
  skipAuth?: boolean;
}

export class StarfaceClient {
  private _config: StarfaceConfig;
  private _auth: StarfaceAuth;

  constructor(config: StarfaceConfig, auth?: StarfaceAuth) {
    this._config = config;
    this._auth = auth || new StarfaceAuth(config);
  }

  /**
   * Make an authenticated request to the Starface REST API.
   */
  public async request<T>(options: RequestOptions): Promise<T> {
    const baseUrl = this._config.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/rest${options.path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Version': '2',
      ...options.headers,
    };

    if (!options.skipAuth) {
      const token = await this._auth.getToken();
      headers['authToken'] = token;
    }

    try {
      return await this._httpRequest<T>(url, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (error) {
      // If authentication error, refresh token and retry once
      if (error instanceof Error && error.message.includes('401')) {
        await this._auth.refreshToken();
        const newToken = await this._auth.getToken();
        headers['authToken'] = newToken;
        return this._httpRequest<T>(url, {
          method: options.method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
        });
      }
      throw error;
    }
  }

  /**
   * GET request shorthand.
   */
  public async get<T>(path: string): Promise<T> {
    return this.request<T>({ method: 'GET', path });
  }

  /**
   * POST request shorthand.
   */
  public async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: 'POST', path, body });
  }

  /**
   * PUT request shorthand.
   */
  public async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: 'PUT', path, body });
  }

  /**
   * DELETE request shorthand.
   */
  public async delete<T>(path: string): Promise<T> {
    return this.request<T>({ method: 'DELETE', path });
  }

  /**
   * Get the auth instance (for health checks).
   */
  public getAuth(): StarfaceAuth {
    return this._auth;
  }

  /**
   * Download a binary resource (e.g., voicemail audio).
   */
  public async downloadBinary(path: string): Promise<Buffer> {
    const baseUrl = this._config.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/rest${path}`;
    const token = await this._auth.getToken();

    return this._httpDownload(url, {
      'X-Version': '2',
      'authToken': token,
    });
  }

  private async _httpRequest<T>(url: string, options: {
    method: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<T> {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? await import('https') : await import('http');

    return new Promise<T>((resolve, reject) => {
      const req = lib.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: options.method,
          headers: options.headers,
          timeout: this._config.requestTimeoutMs,
          rejectUnauthorized: this._config.tlsRejectUnauthorized,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => (data += chunk.toString()));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(data) as T);
              } catch {
                reject(new Error(`Invalid JSON from Starface: ${data.substring(0, 200)}`));
              }
            } else {
              const apiError: StarfaceApiError = {
                status: res.statusCode || 0,
                message: data.substring(0, 500),
              };
              reject(new Error(`Starface ${apiError.status}: ${apiError.message}`));
            }
          });
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Starface timeout after ${this._config.requestTimeoutMs}ms`));
      });

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  private async _httpDownload(url: string, headers: Record<string, string>): Promise<Buffer> {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? await import('https') : await import('http');

    return new Promise<Buffer>((resolve, reject) => {
      const req = lib.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'GET',
          headers,
          timeout: this._config.requestTimeoutMs,
          rejectUnauthorized: this._config.tlsRejectUnauthorized,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(Buffer.concat(chunks));
            } else {
              reject(new Error(`Starface download error ${res.statusCode}`));
            }
          });
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Starface download timeout'));
      });
      req.end();
    });
  }
}
