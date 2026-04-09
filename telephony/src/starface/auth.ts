/**
 * Starface REST API Authentication.
 * Implements the SHA512 challenge-response protocol per Starface documentation.
 *
 * Flow:
 * 1. GET /rest/login → { loginType, nonce, secret: null }
 * 2. Compute: loginId:SHA512(loginId + nonce + SHA512(password))
 * 3. POST /rest/login → { authToken }
 * 4. Use authToken in header for all subsequent requests (valid 4 hours)
 */
import * as crypto from 'crypto';
import { StarfaceConfig } from '../shared/config';
import {
  StarfaceLoginChallenge,
  StarfaceLoginRequest,
  StarfaceLoginResponse,
} from './types';

export class StarfaceAuth {
  private _config: StarfaceConfig;
  private _authToken: string | null = null;
  private _tokenExpiresAt: number = 0;
  /** Token refresh margin: refresh 10 minutes before expiry */
  private static readonly TOKEN_REFRESH_MARGIN_MS = 10 * 60 * 1000;
  /** Token validity: 4 hours per Starface docs */
  private static readonly TOKEN_VALIDITY_MS = 4 * 60 * 60 * 1000;

  constructor(config: StarfaceConfig) {
    this._config = config;
  }

  /**
   * Get a valid auth token. Refreshes automatically if expired/near-expiry.
   */
  public async getToken(): Promise<string> {
    if (this._authToken && Date.now() < this._tokenExpiresAt - StarfaceAuth.TOKEN_REFRESH_MARGIN_MS) {
      return this._authToken;
    }
    return this._authenticate();
  }

  /**
   * Force a new authentication.
   */
  public async refreshToken(): Promise<string> {
    return this._authenticate();
  }

  /**
   * Check if we have a valid token.
   */
  public isAuthenticated(): boolean {
    return !!this._authToken && Date.now() < this._tokenExpiresAt;
  }

  /**
   * Compute the SHA512 secret per Starface protocol.
   * Formula: loginId:SHA512(loginId + nonce + SHA512(password))
   */
  public static computeSecret(loginId: string, nonce: string, password: string): string {
    const passwordHash = crypto.createHash('sha512').update(password).digest('hex');
    const combined = loginId + nonce + passwordHash;
    const combinedHash = crypto.createHash('sha512').update(combined).digest('hex');
    return `${loginId}:${combinedHash}`;
  }

  /**
   * Perform the full authentication flow.
   */
  private async _authenticate(): Promise<string> {
    const baseUrl = this._config.baseUrl.replace(/\/$/, '');

    // Step 1: GET /rest/login to get nonce
    const challengeResponse = await this._httpRequest<StarfaceLoginChallenge>(
      `${baseUrl}/rest/login`,
      { method: 'GET' }
    );

    // Step 2: Compute secret
    const secret = StarfaceAuth.computeSecret(
      this._config.loginId,
      challengeResponse.nonce,
      this._config.password
    );

    // Step 3: POST /rest/login with secret
    const loginPayload: StarfaceLoginRequest = {
      loginType: challengeResponse.loginType,
      nonce: challengeResponse.nonce,
      secret,
    };

    const loginResponse = await this._httpRequest<StarfaceLoginResponse>(
      `${baseUrl}/rest/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginPayload),
      }
    );

    this._authToken = loginResponse.authToken;
    this._tokenExpiresAt = Date.now() + StarfaceAuth.TOKEN_VALIDITY_MS;

    return this._authToken;
  }

  /**
   * Internal HTTP helper using Node's built-in https/http.
   */
  private async _httpRequest<T>(url: string, options: {
    method: string;
    headers?: Record<string, string>;
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
          headers: {
            'X-Version': '2',
            ...options.headers,
          },
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
                reject(new Error(`Invalid JSON response from Starface: ${data.substring(0, 200)}`));
              }
            } else {
              reject(new Error(`Starface API error ${res.statusCode}: ${data.substring(0, 500)}`));
            }
          });
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Starface request timeout after ${this._config.requestTimeoutMs}ms`));
      });

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }
}
