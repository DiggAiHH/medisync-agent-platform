import { RateLimitEntry } from '../types';

/**
 * Simple rate limiter to prevent hitting Discord's rate limits
 * Default: 1 message per second per user
 */
export class RateLimiter {
  private userLimits: Map<string, RateLimitEntry> = new Map();
  private readonly delayMs: number;

  constructor(delayMs: number = parseInt(process.env.RATE_LIMIT_DELAY || '1000')) {
    this.delayMs = delayMs;
  }

  /**
   * Check if a user can send a message
   * Returns the remaining wait time in ms (0 if allowed)
   */
  public canProceed(userId: string): number {
    const now = Date.now();
    const entry = this.userLimits.get(userId);

    if (!entry) {
      return 0;
    }

    const elapsed = now - entry.timestamp;
    if (elapsed >= this.delayMs) {
      return 0;
    }

    return this.delayMs - elapsed;
  }

  /**
   * Record that a user has sent a message
   */
  public recordUsage(userId: string): void {
    this.userLimits.set(userId, {
      timestamp: Date.now(),
      count: 1
    });
  }

  /**
   * Wait for rate limit to clear for a specific user
   */
  public async waitForRateLimit(userId: string): Promise<void> {
    const waitTime = this.canProceed(userId);
    if (waitTime > 0) {
      await this.delay(waitTime);
    }
    this.recordUsage(userId);
  }

  /**
   * Generic delay function
   */
  public delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up old entries (call periodically)
   */
  public cleanup(): void {
    const now = Date.now();
    const maxAge = this.delayMs * 2;

    for (const [userId, entry] of this.userLimits.entries()) {
      if (now - entry.timestamp > maxAge) {
        this.userLimits.delete(userId);
      }
    }
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();
