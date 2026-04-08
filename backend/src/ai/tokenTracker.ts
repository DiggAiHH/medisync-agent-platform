/**
 * Token Tracker für Usage Analytics
 * 
 * Funktionen:
 * - Usage pro User/Session/Model
 * - Daily/Weekly/Monthly Aggregation
 * - Redis-basierte Speicherung mit TTL
 * - Budget-Tracking und Alerts
 */

import {
  TokenUsage,
  TokenUsageEntry,
  AggregatedTokenUsage,
  GitHubModel,
  TokenTrackingKeys,
} from './types';

// Redis Key Generatoren
const REDIS_KEYS: TokenTrackingKeys = {
  session: (sessionId: string) => `tokens:session:${sessionId}`,
  userDaily: (userId: string, date: string) => `tokens:user:${userId}:daily:${date}`,
  userMonthly: (userId: string, month: string) => `tokens:user:${userId}:monthly:${month}`,
  globalDaily: (date: string) => `tokens:global:daily:${date}`,
};

// Erweiterte Redis Key Generatoren
const EXTENDED_REDIS_KEYS = {
  userWeekly: (userId: string, week: string) => `tokens:user:${userId}:weekly:${week}`,
  modelDaily: (model: GitHubModel, date: string) => `tokens:model:${model}:daily:${date}`,
  modelMonthly: (model: GitHubModel, month: string) => `tokens:model:${model}:monthly:${month}`,
  userModelUsage: (userId: string, model: GitHubModel) => `tokens:user:${userId}:model:${model}`,
  budgetDaily: (userId: string, date: string) => `budget:user:${userId}:daily:${date}`,
  budgetAlerts: (userId: string) => `budget:alerts:${userId}`,
  requestLog: (date: string) => `requests:daily:${date}`,
  usageTimeline: (userId: string) => `timeline:user:${userId}`,
};

// Redis Interface (wird von außen injiziert)
export interface RedisClient {
  hincrby(key: string, field: string, increment: number): Promise<number>;
  hgetall(key: string): Promise<Record<string, string>>;
  hset(key: string, field: string, value: string): Promise<number>;
  hget(key: string, field: string): Promise<string | null>;
  hdel(key: string, ...fields: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { ex?: number }): Promise<string | null>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  zrevrange(key: string, start: number, stop: number): Promise<string[]>;
  zrevrangeWithScores(key: string, start: number, stop: number): Promise<Array<{ value: string; score: number }>>;
  zremrangebyrank(key: string, start: number, stop: number): Promise<number>;
  zcard(key: string): Promise<number>;
  zincrby(key: string, increment: number, member: string): Promise<number>;
  zrem(key: string, ...members: string[]): Promise<number>;
  mget(keys: string[]): Promise<(string | null)[]>;
  keys(pattern: string): Promise<string[]>;
  del(key: string): Promise<number>;
}

// Modell-Kosten (pro 1K Tokens)
const MODEL_COSTS: Record<GitHubModel, { input: number; output: number }> = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4.1': { input: 0.002, output: 0.008 },
  'gpt-4.5': { input: 0.03, output: 0.06 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3.7-sonnet': { input: 0.003, output: 0.015 },
  'claude-opus-4': { input: 0.015, output: 0.075 },
  'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
  'gemini-2.5-pro': { input: 0.00125, output: 0.01 },
  'llama-4': { input: 0.0005, output: 0.0015 },
};

// Model-Multiplier für Billing
export const MODEL_MULTIPLIERS: Record<GitHubModel, number> = {
  'gemini-2.0-flash': 0.25,
  'gpt-4.1': 1.0,
  'gpt-4o': 1.0,
  'gpt-4o-mini': 0.3,
  'gpt-4.5': 5.0,
  'claude-3.5-sonnet': 1.5,
  'claude-3.7-sonnet': 1.5,
  'claude-opus-4': 10.0,
  'gemini-2.5-pro': 1.25,
  'llama-4': 0.5,
};

// Budget Alert Thresholds
export interface BudgetAlert {
  userId: string;
  threshold: number; // 80 oder 100
  currentUsage: number;
  limit: number;
  timestamp: Date;
  acknowledged: boolean;
}

// Usage Statistics
export interface UsageStatistics {
  totalRequests: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  uniqueUsers: number;
  uniqueSessions: number;
  modelBreakdown: Record<GitHubModel, {
    requests: number;
    tokens: number;
    cost: number;
  }>;
  timeRange: {
    start: string;
    end: string;
  };
}

/**
 * Berechnet die Kosten für eine Usage
 */
export function calculateCost(model: GitHubModel, usage: TokenUsage): number {
  const costs = MODEL_COSTS[model];
  if (!costs) return 0;

  const inputCost = (usage.prompt_tokens / 1000) * costs.input;
  const outputCost = (usage.completion_tokens / 1000) * costs.output;
  return Number((inputCost + outputCost).toFixed(6));
}

/**
 * Berechnet die Kosten mit Multiplier
 */
export function calculateCostWithMultiplier(model: GitHubModel, usage: TokenUsage): number {
  const baseCost = calculateCost(model, usage);
  const multiplier = MODEL_MULTIPLIERS[model] || 1.0;
  return Number((baseCost * multiplier).toFixed(6));
}

/**
 * Formatiert ein Datum als YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Formatiert ein Datum als YYYY-MM
 */
function formatMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/**
 * Formatiert eine Woche als YYYY-WW
 */
function formatWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
}

/**
 * Token Tracker Klasse
 */
export class TokenTracker {
  private redis: RedisClient;
  private defaultTTL: number;

  constructor(redis: RedisClient, defaultTTL: number = 60 * 60 * 24 * 90) {
    // 90 Tage Default TTL
    this.redis = redis;
    this.defaultTTL = defaultTTL;
  }

  /**
   * Trackt Token Usage für einen Request
   */
  public async trackUsage(entry: TokenUsageEntry): Promise<void> {
    const date = formatDate(entry.timestamp);
    const month = formatMonth(entry.timestamp);
    const week = formatWeek(entry.timestamp);

    // Parallel Updates
    await Promise.all([
      this.trackSessionUsage(entry),
      this.trackUserDailyUsage(entry, date),
      this.trackUserWeeklyUsage(entry, week),
      this.trackUserMonthlyUsage(entry, month),
      this.trackGlobalDailyUsage(entry, date),
      this.trackModelUsage(entry, date, month),
      this.trackUserModelUsage(entry),
      this.updateUsageTimeline(entry),
    ]);
  }

  /**
   * Trackt Usage für eine Session
   */
  private async trackSessionUsage(entry: TokenUsageEntry): Promise<void> {
    const key = REDIS_KEYS.session(entry.sessionId);
    const cost = entry.estimatedCost;

    await Promise.all([
      this.redis.hincrby(key, 'total_requests', 1),
      this.redis.hincrby(key, 'total_tokens', entry.usage.total_tokens),
      this.redis.hincrby(key, 'prompt_tokens', entry.usage.prompt_tokens),
      this.redis.hincrby(key, 'completion_tokens', entry.usage.completion_tokens),
      this.redis.hset(key, 'last_request', entry.timestamp.toISOString()),
      this.redis.hset(key, 'user_id', entry.userId),
      this.redis.hincrby(key, `model:${entry.model}:requests`, 1),
      this.redis.hincrby(key, `model:${entry.model}:tokens`, entry.usage.total_tokens),
    ]);

    // Kosten als Float speichern
    const currentCost = parseFloat(await this.redis.hgetall(key).then(h => h.total_cost || '0'));
    await this.redis.hset(key, 'total_cost', (currentCost + cost).toFixed(6));

    // TTL setzen
    await this.redis.expire(key, this.defaultTTL);

    // Request zur Sorted Set hinzufügen
    const requestData = JSON.stringify({
      id: entry.requestId,
      timestamp: entry.timestamp.toISOString(),
      model: entry.model,
      tokens: entry.usage.total_tokens,
      cost: entry.estimatedCost,
      endpoint: entry.endpoint,
    });
    await this.redis.zadd(`${key}:requests`, entry.timestamp.getTime(), requestData);

    // Alte Requests entfernen (nur letzte 1000 behalten)
    await this.redis.zremrangebyrank(`${key}:requests`, 0, -1001);
  }

  /**
   * Trackt tägliche Usage für einen User
   */
  private async trackUserDailyUsage(entry: TokenUsageEntry, date: string): Promise<void> {
    const key = REDIS_KEYS.userDaily(entry.userId, date);
    const cost = entry.estimatedCost;

    await Promise.all([
      this.redis.hincrby(key, 'total_requests', 1),
      this.redis.hincrby(key, 'total_tokens', entry.usage.total_tokens),
      this.redis.hincrby(key, 'prompt_tokens', entry.usage.prompt_tokens),
      this.redis.hincrby(key, 'completion_tokens', entry.usage.completion_tokens),
      this.redis.hincrby(key, `model:${entry.model}:requests`, 1),
      this.redis.hincrby(key, `model:${entry.model}:tokens`, entry.usage.total_tokens),
      this.redis.hset(key, 'last_updated', entry.timestamp.toISOString()),
    ]);

    // Kosten aggregieren
    const currentCost = parseFloat(await this.redis.hgetall(key).then(h => h.total_cost || '0'));
    await this.redis.hset(key, 'total_cost', (currentCost + cost).toFixed(6));

    // TTL: 2 Jahre für tägliche Daten
    await this.redis.expire(key, 60 * 60 * 24 * 365 * 2);
  }

  /**
   * Trackt wöchentliche Usage für einen User
   */
  private async trackUserWeeklyUsage(entry: TokenUsageEntry, week: string): Promise<void> {
    const key = EXTENDED_REDIS_KEYS.userWeekly(entry.userId, week);
    const cost = entry.estimatedCost;

    await Promise.all([
      this.redis.hincrby(key, 'total_requests', 1),
      this.redis.hincrby(key, 'total_tokens', entry.usage.total_tokens),
      this.redis.hincrby(key, 'prompt_tokens', entry.usage.prompt_tokens),
      this.redis.hincrby(key, 'completion_tokens', entry.usage.completion_tokens),
      this.redis.hincrby(key, `model:${entry.model}:requests`, 1),
      this.redis.hincrby(key, `model:${entry.model}:tokens`, entry.usage.total_tokens),
    ]);

    // Kosten aggregieren
    const currentCost = parseFloat(await this.redis.hgetall(key).then(h => h.total_cost || '0'));
    await this.redis.hset(key, 'total_cost', (currentCost + cost).toFixed(6));

    // TTL: 3 Jahre für wöchentliche Daten
    await this.redis.expire(key, 60 * 60 * 24 * 365 * 3);
  }

  /**
   * Trackt monatliche Usage für einen User
   */
  private async trackUserMonthlyUsage(entry: TokenUsageEntry, month: string): Promise<void> {
    const key = REDIS_KEYS.userMonthly(entry.userId, month);
    const cost = entry.estimatedCost;

    await Promise.all([
      this.redis.hincrby(key, 'total_requests', 1),
      this.redis.hincrby(key, 'total_tokens', entry.usage.total_tokens),
      this.redis.hincrby(key, 'prompt_tokens', entry.usage.prompt_tokens),
      this.redis.hincrby(key, 'completion_tokens', entry.usage.completion_tokens),
      this.redis.hincrby(key, `model:${entry.model}:requests`, 1),
      this.redis.hincrby(key, `model:${entry.model}:tokens`, entry.usage.total_tokens),
    ]);

    // Kosten aggregieren
    const currentCost = parseFloat(await this.redis.hgetall(key).then(h => h.total_cost || '0'));
    await this.redis.hset(key, 'total_cost', (currentCost + cost).toFixed(6));

    // TTL: 5 Jahre für monatliche Daten
    await this.redis.expire(key, 60 * 60 * 24 * 365 * 5);
  }

  /**
   * Trackt globale tägliche Usage
   */
  private async trackGlobalDailyUsage(entry: TokenUsageEntry, date: string): Promise<void> {
    const key = REDIS_KEYS.globalDaily(date);
    const cost = entry.estimatedCost;

    await Promise.all([
      this.redis.hincrby(key, 'total_requests', 1),
      this.redis.hincrby(key, 'total_tokens', entry.usage.total_tokens),
      this.redis.hincrby(key, 'prompt_tokens', entry.usage.prompt_tokens),
      this.redis.hincrby(key, 'completion_tokens', entry.usage.completion_tokens),
      this.redis.hincrby(key, `model:${entry.model}:requests`, 1),
      this.redis.hincrby(key, `model:${entry.model}:tokens`, entry.usage.total_tokens),
    ]);

    // Track unique users
    await this.redis.zadd(`${key}:users`, entry.timestamp.getTime(), entry.userId);

    // Kosten aggregieren
    const currentCost = parseFloat(await this.redis.hgetall(key).then(h => h.total_cost || '0'));
    await this.redis.hset(key, 'total_cost', (currentCost + cost).toFixed(6));

    // Track unique sessions
    await this.redis.zadd(`${key}:sessions`, entry.timestamp.getTime(), entry.sessionId);

    // TTL: 3 Jahre für globale Daten
    await this.redis.expire(key, 60 * 60 * 24 * 365 * 3);
  }

  /**
   * Trackt Modell-spezifische Usage
   */
  private async trackModelUsage(
    entry: TokenUsageEntry,
    date: string,
    month: string
  ): Promise<void> {
    const dailyKey = EXTENDED_REDIS_KEYS.modelDaily(entry.model, date);
    const monthlyKey = EXTENDED_REDIS_KEYS.modelMonthly(entry.model, month);

    await Promise.all([
      // Daily model stats
      this.redis.hincrby(dailyKey, 'total_requests', 1),
      this.redis.hincrby(dailyKey, 'total_tokens', entry.usage.total_tokens),
      this.redis.hincrby(dailyKey, 'prompt_tokens', entry.usage.prompt_tokens),
      this.redis.hincrby(dailyKey, 'completion_tokens', entry.usage.completion_tokens),
      // Monthly model stats
      this.redis.hincrby(monthlyKey, 'total_requests', 1),
      this.redis.hincrby(monthlyKey, 'total_tokens', entry.usage.total_tokens),
      this.redis.hincrby(monthlyKey, 'prompt_tokens', entry.usage.prompt_tokens),
      this.redis.hincrby(monthlyKey, 'completion_tokens', entry.usage.completion_tokens),
    ]);

    // Track unique users per model
    await this.redis.zadd(`${dailyKey}:users`, entry.timestamp.getTime(), entry.userId);

    // Set TTL
    await Promise.all([
      this.redis.expire(dailyKey, 60 * 60 * 24 * 365 * 2),
      this.redis.expire(monthlyKey, 60 * 60 * 24 * 365 * 5),
    ]);
  }

  /**
   * Trackt User-Modell Kombinationen
   */
  private async trackUserModelUsage(entry: TokenUsageEntry): Promise<void> {
    const key = EXTENDED_REDIS_KEYS.userModelUsage(entry.userId, entry.model);

    await Promise.all([
      this.redis.hincrby(key, 'total_requests', 1),
      this.redis.hincrby(key, 'total_tokens', entry.usage.total_tokens),
      this.redis.hset(key, 'last_used', entry.timestamp.toISOString()),
    ]);

    // Track in global user:models sorted set
    await this.redis.zincrby(`user:${entry.userId}:models`, 1, entry.model);

    // TTL: 2 Jahre
    await this.redis.expire(key, 60 * 60 * 24 * 365 * 2);
  }

  /**
   * Aktualisiert die Usage Timeline für einen User
   */
  private async updateUsageTimeline(entry: TokenUsageEntry): Promise<void> {
    const key = EXTENDED_REDIS_KEYS.usageTimeline(entry.userId);
    const timestamp = entry.timestamp.getTime();

    const data = JSON.stringify({
      timestamp: entry.timestamp.toISOString(),
      model: entry.model,
      tokens: entry.usage.total_tokens,
      cost: entry.estimatedCost,
      endpoint: entry.endpoint,
      sessionId: entry.sessionId,
    });

    await this.redis.zadd(key, timestamp, data);

    // Alte Einträge entfernen (nur letzte 5000 behalten)
    await this.redis.zremrangebyrank(key, 0, -5001);

    // TTL: 2 Jahre
    await this.redis.expire(key, 60 * 60 * 24 * 365 * 2);
  }

  /**
   * Holt Usage für eine Session
   */
  public async getSessionUsage(sessionId: string): Promise<{
    sessionId: string;
    totalRequests: number;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    totalCost: number;
    modelBreakdown: Record<GitHubModel, { requests: number; tokens: number }>;
    recentRequests: Array<{
      id: string;
      timestamp: string;
      model: GitHubModel;
      tokens: number;
      cost: number;
      endpoint: string;
    }>;
  } | null> {
    const key = REDIS_KEYS.session(sessionId);
    const data = await this.redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    // Model Breakdown parsen
    const modelBreakdown: Record<string, { requests: number; tokens: number }> = {};
    for (const [field, value] of Object.entries(data)) {
      if (field.startsWith('model:') && field.endsWith(':requests')) {
        const model = field.replace('model:', '').replace(':requests', '') as GitHubModel;
        const requests = parseInt(value, 10);
        const tokens = parseInt(data[`model:${model}:tokens`] || '0', 10);
        modelBreakdown[model] = { requests, tokens };
      }
    }

    // Recent Requests
    const recentRequestData = await this.redis.zrange(`${key}:requests`, -100, -1);
    const recentRequests = recentRequestData.map(r => JSON.parse(r));

    return {
      sessionId,
      totalRequests: parseInt(data.total_requests || '0', 10),
      totalTokens: parseInt(data.total_tokens || '0', 10),
      promptTokens: parseInt(data.prompt_tokens || '0', 10),
      completionTokens: parseInt(data.completion_tokens || '0', 10),
      totalCost: parseFloat(data.total_cost || '0'),
      modelBreakdown: modelBreakdown as Record<GitHubModel, { requests: number; tokens: number }>,
      recentRequests,
    };
  }

  /**
   * Holt tägliche Usage für einen User
   */
  public async getUserDailyUsage(
    userId: string,
    date?: string
  ): Promise<AggregatedTokenUsage | null> {
    const targetDate = date || formatDate(new Date());
    const key = REDIS_KEYS.userDaily(userId, targetDate);
    const data = await this.redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return this.parseAggregatedUsage(userId, targetDate, data);
  }

  /**
   * Holt wöchentliche Usage für einen User
   */
  public async getUserWeeklyUsage(
    userId: string,
    week?: string
  ): Promise<AggregatedTokenUsage | null> {
    const targetWeek = week || formatWeek(new Date());
    const key = EXTENDED_REDIS_KEYS.userWeekly(userId, targetWeek);
    const data = await this.redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return this.parseAggregatedUsage(userId, targetWeek, data);
  }

  /**
   * Holt monatliche Usage für einen User
   */
  public async getUserMonthlyUsage(
    userId: string,
    month?: string
  ): Promise<AggregatedTokenUsage | null> {
    const targetMonth = month || formatMonth(new Date());
    const key = REDIS_KEYS.userMonthly(userId, targetMonth);
    const data = await this.redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return this.parseAggregatedUsage(userId, targetMonth, data);
  }

  /**
   * Parst aggregierte Usage Daten
   */
  private parseAggregatedUsage(
    userId: string,
    period: string,
    data: Record<string, string>
  ): AggregatedTokenUsage {
    const modelBreakdown: Record<string, { requests: number; tokens: number; cost: number }> = {};

    for (const [field, value] of Object.entries(data)) {
      if (field.startsWith('model:') && field.endsWith(':requests')) {
        const model = field.replace('model:', '').replace(':requests', '') as GitHubModel;
        const requests = parseInt(value, 10);
        const tokens = parseInt(data[`model:${model}:tokens`] || '0', 10);
        const cost = parseFloat(data[`model:${model}:cost`] || '0');
        modelBreakdown[model] = { requests, tokens, cost };
      }
    }

    return {
      userId,
      date: period,
      totalRequests: parseInt(data.total_requests || '0', 10),
      totalTokens: parseInt(data.total_tokens || '0', 10),
      totalPromptTokens: parseInt(data.prompt_tokens || '0', 10),
      totalCompletionTokens: parseInt(data.completion_tokens || '0', 10),
      estimatedCost: parseFloat(data.total_cost || '0'),
      modelBreakdown: modelBreakdown as AggregatedTokenUsage['modelBreakdown'],
    };
  }

  /**
   * Holt globale tägliche Usage
   */
  public async getGlobalDailyUsage(date?: string): Promise<{
    date: string;
    totalRequests: number;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    totalCost: number;
    uniqueUsers: number;
    uniqueSessions: number;
    modelBreakdown: Record<GitHubModel, { requests: number; tokens: number }>;
  } | null> {
    const targetDate = date || formatDate(new Date());
    const key = REDIS_KEYS.globalDaily(targetDate);
    const data = await this.redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    // Zähle Unique Users und Sessions
    const userKeys = await this.redis.zrange(`${key}:users`, 0, -1);
    const sessionKeys = await this.redis.zrange(`${key}:sessions`, 0, -1);

    // Model Breakdown
    const modelBreakdown: Record<string, { requests: number; tokens: number }> = {};
    for (const [field, value] of Object.entries(data)) {
      if (field.startsWith('model:') && field.endsWith(':requests')) {
        const model = field.replace('model:', '').replace(':requests', '') as GitHubModel;
        const requests = parseInt(value, 10);
        const tokens = parseInt(data[`model:${model}:tokens`] || '0', 10);
        modelBreakdown[model] = { requests, tokens };
      }
    }

    return {
      date: targetDate,
      totalRequests: parseInt(data.total_requests || '0', 10),
      totalTokens: parseInt(data.total_tokens || '0', 10),
      promptTokens: parseInt(data.prompt_tokens || '0', 10),
      completionTokens: parseInt(data.completion_tokens || '0', 10),
      totalCost: parseFloat(data.total_cost || '0'),
      uniqueUsers: userKeys.length,
      uniqueSessions: sessionKeys.length,
      modelBreakdown: modelBreakdown as Record<GitHubModel, { requests: number; tokens: number }>,
    };
  }

  /**
   * Holt Modell-spezifische tägliche Usage
   */
  public async getModelDailyUsage(
    model: GitHubModel,
    date?: string
  ): Promise<{
    model: GitHubModel;
    date: string;
    totalRequests: number;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    uniqueUsers: number;
  } | null> {
    const targetDate = date || formatDate(new Date());
    const key = EXTENDED_REDIS_KEYS.modelDaily(model, targetDate);
    const data = await this.redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    const userKeys = await this.redis.zrange(`${key}:users`, 0, -1);

    return {
      model,
      date: targetDate,
      totalRequests: parseInt(data.total_requests || '0', 10),
      totalTokens: parseInt(data.total_tokens || '0', 10),
      promptTokens: parseInt(data.prompt_tokens || '0', 10),
      completionTokens: parseInt(data.completion_tokens || '0', 10),
      uniqueUsers: userKeys.length,
    };
  }

  /**
   * Holt Usage-Statistiken für einen Zeitraum
   */
  public async getUserUsageStats(
    userId: string,
    days: number = 30
  ): Promise<{
    daily: Array<{ date: string; requests: number; tokens: number; cost: number }>;
    total: {
      requests: number;
      tokens: number;
      cost: number;
    };
    averagePerDay: {
      requests: number;
      tokens: number;
      cost: number;
    };
    models: string[];
  }> {
    const daily: Array<{ date: string; requests: number; tokens: number; cost: number }> = [];
    let totalRequests = 0;
    let totalTokens = 0;
    let totalCost = 0;
    const usedModels = new Set<string>();

    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = formatDate(date);

      const usage = await this.getUserDailyUsage(userId, dateStr);
      if (usage) {
        daily.push({
          date: dateStr,
          requests: usage.totalRequests,
          tokens: usage.totalTokens,
          cost: usage.estimatedCost,
        });
        totalRequests += usage.totalRequests;
        totalTokens += usage.totalTokens;
        totalCost += usage.estimatedCost;

        // Collect used models
        Object.keys(usage.modelBreakdown).forEach(model => usedModels.add(model));
      }
    }

    // Sortiere nach Datum (neueste zuerst)
    daily.sort((a, b) => b.date.localeCompare(a.date));

    const activeDays = daily.length || 1;

    return {
      daily,
      total: {
        requests: totalRequests,
        tokens: totalTokens,
        cost: Number(totalCost.toFixed(4)),
      },
      averagePerDay: {
        requests: Math.round(totalRequests / activeDays),
        tokens: Math.round(totalTokens / activeDays),
        cost: Number((totalCost / activeDays).toFixed(4)),
      },
      models: Array.from(usedModels),
    };
  }

  /**
   * Holt die Usage Timeline für einen User
   */
  public async getUserUsageTimeline(
    userId: string,
    limit: number = 100
  ): Promise<Array<{
    timestamp: string;
    model: GitHubModel;
    tokens: number;
    cost: number;
    endpoint: string;
    sessionId: string;
  }>> {
    const key = EXTENDED_REDIS_KEYS.usageTimeline(userId);
    const entries = await this.redis.zrevrange(key, 0, limit - 1);

    return entries.map(entry => JSON.parse(entry));
  }

  /**
   * Holt globale Statistiken für einen Zeitraum
   */
  public async getGlobalUsageStats(
    days: number = 30
  ): Promise<{
    daily: Array<{
      date: string;
      requests: number;
      tokens: number;
      cost: number;
      uniqueUsers: number;
      uniqueSessions: number;
    }>;
    total: {
      requests: number;
      tokens: number;
      cost: number;
      uniqueUsers: number;
    };
    modelBreakdown: Record<GitHubModel, {
      requests: number;
      tokens: number;
    }>;
  }> {
    const daily: Array<{
      date: string;
      requests: number;
      tokens: number;
      cost: number;
      uniqueUsers: number;
      uniqueSessions: number;
    }> = [];
    const modelTotals: Record<string, { requests: number; tokens: number }> = {};
    let totalRequests = 0;
    let totalTokens = 0;
    let totalCost = 0;
    const allUsers = new Set<string>();

    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = formatDate(date);

      const usage = await this.getGlobalDailyUsage(dateStr);
      if (usage) {
        daily.push({
          date: dateStr,
          requests: usage.totalRequests,
          tokens: usage.totalTokens,
          cost: usage.totalCost,
          uniqueUsers: usage.uniqueUsers,
          uniqueSessions: usage.uniqueSessions,
        });
        totalRequests += usage.totalRequests;
        totalTokens += usage.totalTokens;
        totalCost += usage.totalCost;

        // Aggregate model usage
        for (const [model, stats] of Object.entries(usage.modelBreakdown)) {
          if (!modelTotals[model]) {
            modelTotals[model] = { requests: 0, tokens: 0 };
          }
          modelTotals[model].requests += stats.requests;
          modelTotals[model].tokens += stats.tokens;
        }
      }
    }

    // Sortiere nach Datum (neueste zuerst)
    daily.sort((a, b) => b.date.localeCompare(a.date));

    return {
      daily,
      total: {
        requests: totalRequests,
        tokens: totalTokens,
        cost: Number(totalCost.toFixed(4)),
        uniqueUsers: allUsers.size,
      },
      modelBreakdown: modelTotals as Record<GitHubModel, { requests: number; tokens: number }>,
    };
  }

  /**
   * Holt die am häufigsten genutzten Modelle für einen User
   */
  public async getUserTopModels(
    userId: string,
    limit: number = 5
  ): Promise<Array<{ model: string; requests: number }>> {
    const key = `user:${userId}:models`;
    const models = await this.redis.zrevrangeWithScores(key, 0, limit - 1);

    const result: Array<{ model: string; requests: number }> = [];
    for (const item of models) {
      result.push({
        model: item.value,
        requests: item.score,
      });
    }

    return result;
  }

  /**
   * Holt alle Sessions für einen User
   */
  public async getUserSessions(userId: string): Promise<Array<{
    sessionId: string;
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    lastRequest: string;
  }>> {
    const pattern = REDIS_KEYS.session('*');
    const keys = await this.redis.keys(pattern);
    const sessions: Array<{
      sessionId: string;
      totalRequests: number;
      totalTokens: number;
      totalCost: number;
      lastRequest: string;
    }> = [];

    for (const key of keys) {
      const data = await this.redis.hgetall(key);
      if (data.user_id === userId) {
        const sessionId = key.replace('tokens:session:', '');
        sessions.push({
          sessionId,
          totalRequests: parseInt(data.total_requests || '0', 10),
          totalTokens: parseInt(data.total_tokens || '0', 10),
          totalCost: parseFloat(data.total_cost || '0'),
          lastRequest: data.last_request || '',
        });
      }
    }

    // Sortiere nach letztem Request (neueste zuerst)
    return sessions.sort((a, b) =>
      new Date(b.lastRequest).getTime() - new Date(a.lastRequest).getTime()
    );
  }

  /**
   * Löscht alle Daten für eine Session
   */
  public async clearSessionData(sessionId: string): Promise<void> {
    const key = REDIS_KEYS.session(sessionId);
    await this.redis.del(key);
    await this.redis.del(`${key}:requests`);
    console.log(`Session data cleared for ${sessionId}`);
  }

  /**
   * Löscht alle Daten für einen User
   */
  public async clearUserData(userId: string): Promise<void> {
    const patterns = [
      REDIS_KEYS.userDaily(userId, '*'),
      REDIS_KEYS.userMonthly(userId, '*'),
      EXTENDED_REDIS_KEYS.userWeekly(userId, '*'),
      EXTENDED_REDIS_KEYS.usageTimeline(userId),
      `user:${userId}:models`,
    ];

    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      for (const key of keys) {
        await this.redis.del(key);
      }
    }

    console.log(`User data cleared for ${userId}`);
  }

  /**
   * Setzt den Redis Client
   */
  public setRedisClient(redis: RedisClient): void {
    this.redis = redis;
  }
}

/**
 * Erstellt einen neuen Token Tracker
 */
export function createTokenTracker(redis: RedisClient, defaultTTL?: number): TokenTracker {
  return new TokenTracker(redis, defaultTTL);
}

/**
 * Erstellt einen TokenUsageEntry
 */
export function createTokenUsageEntry(
  userId: string,
  sessionId: string,
  model: GitHubModel,
  usage: TokenUsage,
  requestId: string,
  endpoint: string
): TokenUsageEntry {
  const estimatedCost = calculateCost(model, usage);

  return {
    userId,
    sessionId,
    model,
    timestamp: new Date(),
    usage,
    estimatedCost,
    requestId,
    endpoint,
  };
}

export { REDIS_KEYS, EXTENDED_REDIS_KEYS, MODEL_COSTS };
