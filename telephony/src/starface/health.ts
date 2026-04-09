/**
 * Starface Health Check.
 * Verify connectivity and authentication to the Starface PBX.
 */
import { StarfaceClient } from './client';

export interface StarfaceHealthStatus {
  connected: boolean;
  authenticated: boolean;
  version?: string;
  activeCalls?: number;
  responseTimeMs: number;
  error?: string;
}

export class StarfaceHealth {
  private _client: StarfaceClient;

  constructor(client: StarfaceClient) {
    this._client = client;
  }

  /**
   * Perform a full health check.
   */
  public async check(): Promise<StarfaceHealthStatus> {
    const start = Date.now();

    try {
      // Try to list active calls as a connectivity + auth check
      const calls = await this._client.get<unknown[]>('/calls');
      const responseTimeMs = Date.now() - start;

      return {
        connected: true,
        authenticated: true,
        activeCalls: calls.length,
        responseTimeMs,
      };
    } catch (error) {
      const responseTimeMs = Date.now() - start;
      const message = error instanceof Error ? error.message : String(error);

      return {
        connected: !message.includes('ECONNREFUSED') && !message.includes('timeout'),
        authenticated: !message.includes('401') && !message.includes('403'),
        responseTimeMs,
        error: message,
      };
    }
  }

  /**
   * Quick connectivity check (no auth required).
   */
  public async quickCheck(): Promise<boolean> {
    try {
      // The login GET endpoint doesn't require auth — just returns a nonce
      await this._client.request<unknown>({
        method: 'GET',
        path: '/login',
        skipAuth: true,
      });
      return true;
    } catch {
      return false;
    }
  }
}
