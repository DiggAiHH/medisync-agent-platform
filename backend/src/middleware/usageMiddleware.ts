/**
 * Usage Middleware
 * 
 * Funktionen:
 * - Trackt API Requests
 * - Trackt Token Usage
 * - Rate Limiting (requests per minute)
 * - Budget Limits (max tokens per user)
 */

import { Request, Response, NextFunction } from 'express';
import { RedisClient, TokenTracker, createTokenUsageEntry, MODEL_MULTIPLIERS } from '../ai/tokenTracker';
import { GitHubModel, TokenUsage } from '../ai/types';
import { v4 as uuidv4 } from 'uuid';

// Default Limits pro User
export const DEFAULT_LIMITS = {
  requestsPerMinute: 60,
  requestsPerHour: 1000,
  requestsPerDay: 10000,
  tokensPerDay: 100000,
  costPerDay: 5.00, // USD
};

// Custom Limits pro User (wird aus Redis geladen)
interface UserLimits {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  tokensPerDay: number;
  costPerDay: number;
}

// Rate Limit Status
interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  limit: number;
}

// Budget Alert Event
interface BudgetAlert {
  userId: string;
  type: 'warning' | 'critical';
  threshold: number;
  currentUsage: number;
  limit: number;
  timestamp: Date;
}

// Request Context
interface RequestContext {
  userId: string;
  sessionId: string;
  requestId: string;
  startTime: number;
  model?: GitHubModel;
  endpoint: string;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      usageContext?: RequestContext;
      tokenTracker?: TokenTracker;
    }
  }
}

// Redis Key Generators
const RATE_LIMIT_KEYS = {
  minute: (userId: string) => `ratelimit:${userId}:minute`,
  hour: (userId: string) => `ratelimit:${userId}:hour`,
  day: (userId: string) => `ratelimit:${userId}:day`,
};

const BUDGET_KEYS = {
  dailyTokens: (userId: string, date: string) => `budget:${userId}:tokens:${date}`,
  dailyCost: (userId: string, date: string) => `budget:${userId}:cost:${date}`,
  alerts: (userId: string) => `budget:${userId}:alerts`,
  limits: (userId: string) => `budget:${userId}:limits`,
};

/**
 * Usage Middleware Klasse
 */
export class UsageMiddleware {
  private redis: RedisClient;
  private tokenTracker: TokenTracker;
  private alertCallbacks: ((alert: BudgetAlert) => void)[] = [];

  constructor(redis: RedisClient, tokenTracker: TokenTracker) {
    this.redis = redis;
    this.tokenTracker = tokenTracker;
  }

  /**
   * Haupt-Middleware - trackt Requests und enforced Limits
   */
  public middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Extract user info from request
        const userId = this.extractUserId(req);
        const sessionId = this.extractSessionId(req);
        const requestId = uuidv4();
        const startTime = Date.now();

        // Store context in request
        req.usageContext = {
          userId,
          sessionId,
          requestId,
          startTime,
          endpoint: req.path,
        };
        req.tokenTracker = this.tokenTracker;

        // Check rate limits
        const rateLimitCheck = await this.checkRateLimits(userId);
        if (!rateLimitCheck.allowed) {
          res.status(429).json({
            success: false,
            error: 'Rate limit exceeded',
            retryAfter: Math.ceil((rateLimitCheck.resetTime - Date.now()) / 1000),
            limit: rateLimitCheck.limit,
          });
          return;
        }

        // Check budget limits
        const budgetCheck = await this.checkBudgetLimits(userId);
        if (!budgetCheck.allowed) {
          res.status(403).json({
            success: false,
            error: 'Budget limit exceeded',
            budgetStatus: budgetCheck,
          });
          return;
        }

        // Track request
        await this.trackRequest(userId, req.path);

        // Add rate limit headers
        res.setHeader('X-RateLimit-Limit', rateLimitCheck.limit.toString());
        res.setHeader('X-RateLimit-Remaining', rateLimitCheck.remaining.toString());
        res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimitCheck.resetTime / 1000).toString());

        // Track response time on finish
        res.on('finish', () => {
          this.trackResponseTime(req, res, Date.now() - startTime);
        });

        next();
      } catch (error) {
        console.error('Usage middleware error:', error);
        next();
      }
    };
  }

  /**
   * AI Usage Middleware - trackt Token Usage für AI Requests
   */
  public trackAIUsage(model: GitHubModel) {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (req.usageContext) {
        req.usageContext.model = model;
      }

      // Override res.json to capture usage
      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        this.processAIResponse(req, res, body);
        return originalJson(body);
      };

      next();
    };
  }

  /**
   * Extrahiert User ID aus Request
   */
  private extractUserId(req: Request): string {
    // Versuche aus verschiedenen Quellen
    return (
      req.headers['x-user-id'] as string ||
      (req as any).user?.id ||
      req.ip ||
      'anonymous'
    );
  }

  /**
   * Extrahiert Session ID aus Request
   */
  private extractSessionId(req: Request): string {
    return (
      req.headers['x-session-id'] as string ||
      req.cookies?.sessionId ||
      uuidv4()
    );
  }

  /**
   * Prüft Rate Limits für einen User
   */
  private async checkRateLimits(userId: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
    limit: number;
    violations: string[];
  }> {
    const now = Date.now();
    const limits = await this.getUserLimits(userId);
    const violations: string[] = [];

    // Minute window
    const minuteKey = RATE_LIMIT_KEYS.minute(userId);
    const minuteCount = parseInt(await this.redis.get(minuteKey) || '0', 10);
    const minuteReset = Math.ceil(now / 60000) * 60000;

    // Hour window
    const hourKey = RATE_LIMIT_KEYS.hour(userId);
    const hourCount = parseInt(await this.redis.get(hourKey) || '0', 10);
    const hourReset = Math.ceil(now / 3600000) * 3600000;

    // Day window
    const dayKey = RATE_LIMIT_KEYS.day(userId);
    const dayCount = parseInt(await this.redis.get(dayKey) || '0', 10);
    const dayReset = Math.ceil(now / 86400000) * 86400000;

    // Check limits
    if (minuteCount >= limits.requestsPerMinute) {
      violations.push('minute');
    }
    if (hourCount >= limits.requestsPerHour) {
      violations.push('hour');
    }
    if (dayCount >= limits.requestsPerDay) {
      violations.push('day');
    }

    const allowed = violations.length === 0;
    const remaining = Math.min(
      limits.requestsPerMinute - minuteCount,
      limits.requestsPerHour - hourCount,
      limits.requestsPerDay - dayCount
    );

    return {
      allowed,
      remaining: Math.max(0, remaining),
      resetTime: minuteReset,
      limit: limits.requestsPerMinute,
      violations,
    };
  }

  /**
   * Prüft Budget Limits für einen User
   */
  private async checkBudgetLimits(userId: string): Promise<{
    allowed: boolean;
    tokensUsed: number;
    tokensLimit: number;
    costUsed: number;
    costLimit: number;
    tokenPercentage: number;
    costPercentage: number;
  }> {
    const today = new Date().toISOString().split('T')[0];
    const limits = await this.getUserLimits(userId);

    // Get current usage
    const tokensUsed = parseInt(
      await this.redis.get(BUDGET_KEYS.dailyTokens(userId, today)) || '0',
      10
    );
    const costUsed = parseFloat(
      await this.redis.get(BUDGET_KEYS.dailyCost(userId, today)) || '0'
    );

    const tokenPercentage = (tokensUsed / limits.tokensPerDay) * 100;
    const costPercentage = (costUsed / limits.costPerDay) * 100;

    const tokenExceeded = tokensUsed >= limits.tokensPerDay;
    const costExceeded = costUsed >= limits.costPerDay;

    return {
      allowed: !tokenExceeded && !costExceeded,
      tokensUsed,
      tokensLimit: limits.tokensPerDay,
      costUsed,
      costLimit: limits.costPerDay,
      tokenPercentage,
      costPercentage,
    };
  }

  /**
   * Trackt einen Request
   */
  private async trackRequest(userId: string, endpoint: string): Promise<void> {
    const now = Date.now();
    const minuteKey = RATE_LIMIT_KEYS.minute(userId);
    const hourKey = RATE_LIMIT_KEYS.hour(userId);
    const dayKey = RATE_LIMIT_KEYS.day(userId);

    // Increment counters
    await Promise.all([
      // Minute counter (60s TTL)
      this.redis.set(minuteKey, (parseInt(await this.redis.get(minuteKey) || '0', 10) + 1).toString(), {
        ex: 60,
      }),
      // Hour counter (3600s TTL)
      this.redis.set(hourKey, (parseInt(await this.redis.get(hourKey) || '0', 10) + 1).toString(), {
        ex: 3600,
      }),
      // Day counter (86400s TTL)
      this.redis.set(dayKey, (parseInt(await this.redis.get(dayKey) || '0', 10) + 1).toString(), {
        ex: 86400,
      }),
    ]);

    // Log request
    console.log(`[${new Date().toISOString()}] Request: ${endpoint} | User: ${userId}`);
  }

  /**
   * Verarbeitet eine AI Response und trackt Token Usage
   */
  private async processAIResponse(
    req: Request,
    res: Response,
    body: any
  ): Promise<void> {
    if (!req.usageContext) return;

    const { userId, sessionId, requestId, endpoint, model } = req.usageContext;
    if (!model) return;

    // Extract usage from response
    const usage: TokenUsage = body.usage || {
      prompt_tokens: body.promptTokens || 0,
      completion_tokens: body.completionTokens || 0,
      total_tokens: body.totalTokens || 0,
    };

    // Create and track usage entry
    const entry = createTokenUsageEntry(
      userId,
      sessionId,
      model,
      usage,
      requestId,
      endpoint
    );

    await this.tokenTracker.trackUsage(entry);

    // Update budget tracking
    await this.updateBudgetUsage(userId, usage, entry.estimatedCost);

    // Check for budget alerts
    await this.checkBudgetAlerts(userId, usage, entry.estimatedCost);
  }

  /**
   * Aktualisiert Budget Usage
   */
  private async updateBudgetUsage(
    userId: string,
    usage: TokenUsage,
    cost: number
  ): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    // Update token count
    const tokenKey = BUDGET_KEYS.dailyTokens(userId, today);
    await this.redis.set(
      tokenKey,
      (parseInt(await this.redis.get(tokenKey) || '0', 10) + usage.total_tokens).toString(),
      { ex: 86400 }
    );

    // Update cost
    const costKey = BUDGET_KEYS.dailyCost(userId, today);
    const currentCost = parseFloat(await this.redis.get(costKey) || '0');
    await this.redis.set(costKey, (currentCost + cost).toFixed(6), { ex: 86400 });
  }

  /**
   * Prüft und sendet Budget Alerts
   */
  private async checkBudgetAlerts(
    userId: string,
    usage: TokenUsage,
    cost: number
  ): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const limits = await this.getUserLimits(userId);

    // Get current usage
    const tokensUsed = parseInt(
      await this.redis.get(BUDGET_KEYS.dailyTokens(userId, today)) || '0',
      10
    );
    const costUsed = parseFloat(
      await this.redis.get(BUDGET_KEYS.dailyCost(userId, today)) || '0'
    );

    const tokenPercentage = (tokensUsed / limits.tokensPerDay) * 100;
    const costPercentage = (costUsed / limits.costPerDay) * 100;
    const maxPercentage = Math.max(tokenPercentage, costPercentage);

    // Check for alerts
    let alert: BudgetAlert | null = null;

    if (maxPercentage >= 100) {
      alert = {
        userId,
        type: 'critical',
        threshold: 100,
        currentUsage: Math.max(tokensUsed, costUsed),
        limit: Math.max(limits.tokensPerDay, limits.costPerDay),
        timestamp: new Date(),
      };
    } else if (maxPercentage >= 80) {
      alert = {
        userId,
        type: 'warning',
        threshold: 80,
        currentUsage: Math.max(tokensUsed, costUsed),
        limit: Math.max(limits.tokensPerDay, limits.costPerDay),
        timestamp: new Date(),
      };
    }

    if (alert) {
      // Store alert
      const alertKey = BUDGET_KEYS.alerts(userId);
      await this.redis.zadd(
        alertKey,
        Date.now(),
        JSON.stringify(alert)
      );

      // Trim old alerts
      await this.redis.zremrangebyrank(alertKey, 0, -101);

      // Notify callbacks
      this.alertCallbacks.forEach(cb => cb(alert!));

      console.log(`[BUDGET ALERT] User ${userId}: ${alert.type} - ${maxPercentage.toFixed(1)}%`);
    }
  }

  /**
   * Trackt Response Time
   */
  private async trackResponseTime(
    req: Request,
    res: Response,
    duration: number
  ): Promise<void> {
    // Store in Redis for metrics
    const date = new Date().toISOString().split('T')[0];
    const key = `metrics:response_time:${date}`;

    await this.redis.zadd(key, duration, JSON.stringify({
      path: req.path,
      method: req.method,
      status: res.statusCode,
      duration,
      timestamp: new Date().toISOString(),
    }));

    // Trim old entries
    await this.redis.zremrangebyrank(key, 0, -10001);
  }

  /**
   * Holt User Limits (mit Fallback auf Defaults)
   */
  public async getUserLimits(userId: string): Promise<UserLimits> {
    const limitsKey = BUDGET_KEYS.limits(userId);
    const stored = await this.redis.get(limitsKey);

    if (stored) {
      return JSON.parse(stored);
    }

    return DEFAULT_LIMITS;
  }

  /**
   * Setzt User Limits
   */
  public async setUserLimits(userId: string, limits: Partial<UserLimits>): Promise<void> {
    const limitsKey = BUDGET_KEYS.limits(userId);
    const current = await this.getUserLimits(userId);
    const updated = { ...current, ...limits };

    await this.redis.set(limitsKey, JSON.stringify(updated));
  }

  /**
   * Holt Budget Status für einen User
   */
  public async getBudgetStatus(userId: string): Promise<{
    limits: UserLimits;
    usage: {
      requests: { minute: number; hour: number; day: number };
      tokens: number;
      cost: number;
    };
    percentages: {
      requests: { minute: number; hour: number; day: number };
      tokens: number;
      cost: number;
    };
  }> {
    const today = new Date().toISOString().split('T')[0];
    const limits = await this.getUserLimits(userId);

    const [minuteReqs, hourReqs, dayReqs, tokens, cost] = await Promise.all([
      this.redis.get(RATE_LIMIT_KEYS.minute(userId)),
      this.redis.get(RATE_LIMIT_KEYS.hour(userId)),
      this.redis.get(RATE_LIMIT_KEYS.day(userId)),
      this.redis.get(BUDGET_KEYS.dailyTokens(userId, today)),
      this.redis.get(BUDGET_KEYS.dailyCost(userId, today)),
    ]);

    const minuteRequests = parseInt(minuteReqs || '0', 10);
    const hourRequests = parseInt(hourReqs || '0', 10);
    const dayRequests = parseInt(dayReqs || '0', 10);
    const tokenCount = parseInt(tokens || '0', 10);
    const costAmount = parseFloat(cost || '0');

    return {
      limits,
      usage: {
        requests: {
          minute: minuteRequests,
          hour: hourRequests,
          day: dayRequests,
        },
        tokens: tokenCount,
        cost: costAmount,
      },
      percentages: {
        requests: {
          minute: (minuteRequests / limits.requestsPerMinute) * 100,
          hour: (hourRequests / limits.requestsPerHour) * 100,
          day: (dayRequests / limits.requestsPerDay) * 100,
        },
        tokens: (tokenCount / limits.tokensPerDay) * 100,
        cost: (costAmount / limits.costPerDay) * 100,
      },
    };
  }

  /**
   * Holt Budget Alerts für einen User
   */
  public async getBudgetAlerts(userId: string, limit: number = 10): Promise<BudgetAlert[]> {
    const alertKey = BUDGET_KEYS.alerts(userId);
    const alerts = await this.redis.zrevrange(alertKey, 0, limit - 1);

    return alerts.map(a => JSON.parse(a));
  }

  /**
   * Registriert einen Alert Callback
   */
  public onBudgetAlert(callback: (alert: BudgetAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Reset User Usage (für Testing)
   */
  public async resetUserUsage(userId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    await Promise.all([
      this.redis.del(RATE_LIMIT_KEYS.minute(userId)),
      this.redis.del(RATE_LIMIT_KEYS.hour(userId)),
      this.redis.del(RATE_LIMIT_KEYS.day(userId)),
      this.redis.del(BUDGET_KEYS.dailyTokens(userId, today)),
      this.redis.del(BUDGET_KEYS.dailyCost(userId, today)),
    ]);
  }
}

/**
 * Factory Funktion für die Middleware
 */
export function createUsageMiddleware(
  redis: RedisClient,
  tokenTracker: TokenTracker
): UsageMiddleware {
  return new UsageMiddleware(redis, tokenTracker);
}

export { RATE_LIMIT_KEYS, BUDGET_KEYS };
export type { UserLimits, BudgetAlert, RequestContext };
