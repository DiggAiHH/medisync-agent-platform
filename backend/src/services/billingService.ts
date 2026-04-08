/**
 * Billing Service
 * 
 * Funktionen:
 * - Berechnet Kosten basierend auf GitHub Models Pricing
 * - Multiplier für verschiedene Modelle
 * - Daily Cost Reports
 * - Budget Alerts (bei 80%, 100%)
 */

import { RedisClient, MODEL_MULTIPLIERS, calculateCost, calculateCostWithMultiplier } from '../ai/tokenTracker';
import { GitHubModel, TokenUsage } from '../ai/types';

// GitHub Models Preise (pro 1K Tokens) - Aktuell April 2026
export const GITHUB_MODELS_PRICING: Record<GitHubModel, { input: number; output: number }> = {
  // OpenAI Models
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4.1': { input: 0.002, output: 0.008 },
  'gpt-4.5': { input: 0.03, output: 0.06 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  
  // Anthropic Models
  'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3.7-sonnet': { input: 0.003, output: 0.015 },
  'claude-opus-4': { input: 0.015, output: 0.075 },
  
  // Google Models
  'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
  'gemini-2.5-pro': { input: 0.00125, output: 0.01 },
  
  // Meta Models
  'llama-4': { input: 0.0005, output: 0.0015 },
};

// Currency Multiplier (für zukünftige Währungsunterstützung)
export const CURRENCY_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
};

// Budget Alert Konfiguration
export interface BudgetAlertConfig {
  warningThreshold: number;    // 80%
  criticalThreshold: number;   // 100%
  notificationChannels: ('email' | 'webhook' | 'slack')[];
}

// Kosten Report
export interface CostReport {
  date: string;
  totalCost: number;
  currency: string;
  breakdown: Record<GitHubModel, {
    requests: number;
    tokens: number;
    baseCost: number;
    multiplier: number;
    finalCost: number;
  }>;
  summary: {
    totalRequests: number;
    totalTokens: number;
    avgCostPerRequest: number;
    avgCostPerToken: number;
    mostExpensiveModel: GitHubModel | null;
    cheapestModel: GitHubModel | null;
  };
}

// Daily Cost Entry
export interface DailyCostEntry {
  date: string;
  cost: number;
  requests: number;
  tokens: number;
  trend: 'up' | 'down' | 'stable';
  changePercent: number;
}

// Budget Status
export interface BudgetStatus {
  userId: string;
  period: 'daily' | 'weekly' | 'monthly';
  limit: number;
  used: number;
  remaining: number;
  percentage: number;
  projectedEndOfPeriod: number;
  status: 'ok' | 'warning' | 'critical' | 'exceeded';
}

// Alert History Entry
export interface AlertHistoryEntry {
  id: string;
  userId: string;
  type: 'warning' | 'critical' | 'exceeded';
  threshold: number;
  currentUsage: number;
  limit: number;
  timestamp: Date;
  acknowledged: boolean;
}

// Redis Keys
const BILLING_KEYS = {
  dailyCost: (date: string) => `billing:daily:${date}`,
  userDailyCost: (userId: string, date: string) => `billing:user:${userId}:daily:${date}`,
  userMonthlyCost: (userId: string, month: string) => `billing:user:${userId}:monthly:${month}`,
  alerts: (userId: string) => `billing:alerts:${userId}`,
  budgetConfig: (userId: string) => `billing:budget:${userId}`,
  costHistory: (userId: string) => `billing:history:${userId}`,
};

/**
 * Billing Service Klasse
 */
export class BillingService {
  private redis: RedisClient;
  private defaultCurrency: string;
  private alertCallbacks: ((alert: AlertHistoryEntry) => void)[] = [];

  constructor(redis: RedisClient, defaultCurrency: string = 'USD') {
    this.redis = redis;
    this.defaultCurrency = defaultCurrency;
  }

  /**
   * Berechnet die Kosten für eine Usage
   */
  public calculateCost(model: GitHubModel, usage: TokenUsage): {
    baseCost: number;
    multiplier: number;
    finalCost: number;
  } {
    const baseCost = calculateCost(model, usage);
    const multiplier = MODEL_MULTIPLIERS[model] || 1.0;
    const finalCost = baseCost * multiplier;

    return {
      baseCost: Number(baseCost.toFixed(6)),
      multiplier,
      finalCost: Number(finalCost.toFixed(6)),
    };
  }

  /**
   * Berechnet Kosten mit Multiplier (Alias für calculateCost)
   */
  public calculateCostWithMultiplier(model: GitHubModel, usage: TokenUsage): number {
    return calculateCostWithMultiplier(model, usage);
  }

  /**
   * Konvertiert Kosten in andere Währung
   */
  public convertCurrency(amount: number, from: string, to: string): number {
    const fromRate = CURRENCY_RATES[from] || 1.0;
    const toRate = CURRENCY_RATES[to] || 1.0;
    return Number(((amount / fromRate) * toRate).toFixed(4));
  }

  /**
   * Trackt Kosten für einen Request
   */
  public async trackCost(
    userId: string,
    model: GitHubModel,
    usage: TokenUsage,
    requestId: string
  ): Promise<{
    baseCost: number;
    multiplier: number;
    finalCost: number;
  }> {
    const { baseCost, multiplier, finalCost } = this.calculateCost(model, usage);
    const date = new Date().toISOString().split('T')[0];
    const month = new Date().toISOString().slice(0, 7);

    // Track global daily cost
    const dailyKey = BILLING_KEYS.dailyCost(date);
    await Promise.all([
      this.redis.hincrby(dailyKey, 'total_requests', 1),
      this.redis.hincrby(dailyKey, 'total_tokens', usage.total_tokens),
      this.redis.hincrby(dailyKey, `model:${model}:requests`, 1),
      this.redis.hincrby(dailyKey, `model:${model}:tokens`, usage.total_tokens),
    ]);

    // Update cost (stored as string for precision)
    const currentDailyCost = parseFloat(await this.redis.hgetall(dailyKey).then(h => h.total_cost || '0'));
    await this.redis.hset(dailyKey, 'total_cost', (currentDailyCost + finalCost).toFixed(6));
    await this.redis.hset(dailyKey, 'last_updated', new Date().toISOString());

    // Track user daily cost
    const userDailyKey = BILLING_KEYS.userDailyCost(userId, date);
    const currentUserCost = parseFloat(
      await this.redis.hgetall(userDailyKey).then(h => h.total_cost || '0')
    );
    await this.redis.hset(userDailyKey, 'total_cost', (currentUserCost + finalCost).toFixed(6));
    await this.redis.hincrby(userDailyKey, 'total_requests', 1);
    await this.redis.hincrby(userDailyKey, 'total_tokens', usage.total_tokens);

    // Track user monthly cost
    const userMonthlyKey = BILLING_KEYS.userMonthlyCost(userId, month);
    const currentMonthlyCost = parseFloat(
      await this.redis.hgetall(userMonthlyKey).then(h => h.total_cost || '0')
    );
    await this.redis.hset(userMonthlyKey, 'total_cost', (currentMonthlyCost + finalCost).toFixed(6));

    // Store cost history
    const historyKey = BILLING_KEYS.costHistory(userId);
    await this.redis.zadd(
      historyKey,
      Date.now(),
      JSON.stringify({
        requestId,
        timestamp: new Date().toISOString(),
        model,
        tokens: usage.total_tokens,
        baseCost,
        multiplier,
        finalCost,
      })
    );

    // Set TTLs
    await Promise.all([
      this.redis.expire(dailyKey, 60 * 60 * 24 * 365 * 2),     // 2 Jahre
      this.redis.expire(userDailyKey, 60 * 60 * 24 * 90),      // 90 Tage
      this.redis.expire(userMonthlyKey, 60 * 60 * 24 * 365 * 2), // 2 Jahre
      this.redis.expire(historyKey, 60 * 60 * 24 * 365),        // 1 Jahr
    ]);

    // Check budget alerts
    await this.checkBudgetAlert(userId, currentUserCost + finalCost);

    return { baseCost, multiplier, finalCost };
  }

  /**
   * Generiert einen Daily Cost Report
   */
  public async generateDailyReport(date?: string, currency: string = this.defaultCurrency): Promise<CostReport> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const dailyKey = BILLING_KEYS.dailyCost(targetDate);
    const data = await this.redis.hgetall(dailyKey);

    if (!data || Object.keys(data).length === 0) {
      return {
        date: targetDate,
        totalCost: 0,
        currency,
        breakdown: {} as CostReport['breakdown'],
        summary: {
          totalRequests: 0,
          totalTokens: 0,
          avgCostPerRequest: 0,
          avgCostPerToken: 0,
          mostExpensiveModel: null,
          cheapestModel: null,
        },
      };
    }

    // Parse breakdown
    const breakdown: CostReport['breakdown'] = {} as CostReport['breakdown'];
    const modelCosts: Array<{ model: GitHubModel; finalCost: number }> = [];

    for (const [field, value] of Object.entries(data)) {
      if (field.startsWith('model:') && field.endsWith(':tokens')) {
        const model = field.replace('model:', '').replace(':tokens', '') as GitHubModel;
        const tokens = parseInt(value, 10);
        const requests = parseInt(data[`model:${model}:requests`] || '0', 10);
        
        // Calculate costs for this model
        const mockUsage: TokenUsage = {
          prompt_tokens: Math.floor(tokens * 0.7),
          completion_tokens: Math.floor(tokens * 0.3),
          total_tokens: tokens,
        };
        const { baseCost, multiplier, finalCost } = this.calculateCost(model, mockUsage);

        breakdown[model] = {
          requests,
          tokens,
          baseCost,
          multiplier,
          finalCost,
        };

        modelCosts.push({ model, finalCost });
      }
    }

    const totalRequests = parseInt(data.total_requests || '0', 10);
    const totalTokens = parseInt(data.total_tokens || '0', 10);
    const totalCost = parseFloat(data.total_cost || '0');

    // Sort by cost
    modelCosts.sort((a, b) => b.finalCost - a.finalCost);

    // Convert currency if needed
    const convertedCost = currency !== 'USD'
      ? this.convertCurrency(totalCost, 'USD', currency)
      : totalCost;

    return {
      date: targetDate,
      totalCost: Number(convertedCost.toFixed(4)),
      currency,
      breakdown,
      summary: {
        totalRequests,
        totalTokens,
        avgCostPerRequest: totalRequests > 0 ? Number((totalCost / totalRequests).toFixed(6)) : 0,
        avgCostPerToken: totalTokens > 0 ? Number((totalCost / totalTokens).toFixed(6)) : 0,
        mostExpensiveModel: modelCosts[0]?.model || null,
        cheapestModel: modelCosts[modelCosts.length - 1]?.model || null,
      },
    };
  }

  /**
   * Generiert einen User Cost Report
   */
  public async generateUserReport(
    userId: string,
    date?: string,
    currency: string = this.defaultCurrency
  ): Promise<CostReport & { userId: string }> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const userDailyKey = BILLING_KEYS.userDailyCost(userId, targetDate);
    const data = await this.redis.hgetall(userDailyKey);

    const totalCost = parseFloat(data.total_cost || '0');
    const totalRequests = parseInt(data.total_requests || '0', 10);
    const totalTokens = parseInt(data.total_tokens || '0', 10);

    const convertedCost = currency !== 'USD'
      ? this.convertCurrency(totalCost, 'USD', currency)
      : totalCost;

    return {
      userId,
      date: targetDate,
      totalCost: Number(convertedCost.toFixed(4)),
      currency,
      breakdown: {} as CostReport['breakdown'], // Detailed breakdown not stored per user
      summary: {
        totalRequests,
        totalTokens,
        avgCostPerRequest: totalRequests > 0 ? Number((totalCost / totalRequests).toFixed(6)) : 0,
        avgCostPerToken: totalTokens > 0 ? Number((totalCost / totalTokens).toFixed(6)) : 0,
        mostExpensiveModel: null,
        cheapestModel: null,
      },
    };
  }

  /**
   * Holt Cost History für einen Zeitraum
   */
  public async getCostHistory(
    userId: string,
    days: number = 30
  ): Promise<DailyCostEntry[]> {
    const entries: DailyCostEntry[] = [];
    const today = new Date();
    let previousCost = 0;

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const data = await this.redis.hgetall(BILLING_KEYS.userDailyCost(userId, dateStr));
      const cost = parseFloat(data.total_cost || '0');
      const requests = parseInt(data.total_requests || '0', 10);
      const tokens = parseInt(data.total_tokens || '0', 10);

      let trend: 'up' | 'down' | 'stable' = 'stable';
      let changePercent = 0;

      if (previousCost > 0) {
        changePercent = ((cost - previousCost) / previousCost) * 100;
        if (changePercent > 5) trend = 'up';
        else if (changePercent < -5) trend = 'down';
      }

      entries.push({
        date: dateStr,
        cost: Number(cost.toFixed(4)),
        requests,
        tokens,
        trend,
        changePercent: Number(changePercent.toFixed(2)),
      });

      previousCost = cost;
    }

    // Sort by date (newest first)
    return entries.sort((a, b) => b.date.localeCompare(a.date));
  }

  /**
   * Setzt Budget für einen User
   */
  public async setBudget(
    userId: string,
    config: {
      dailyLimit?: number;
      weeklyLimit?: number;
      monthlyLimit?: number;
      currency?: string;
    }
  ): Promise<void> {
    const budgetKey = BILLING_KEYS.budgetConfig(userId);
    const existing = await this.redis.get(budgetKey);
    const current = existing ? JSON.parse(existing) : {};

    const updated = {
      ...current,
      ...config,
      updatedAt: new Date().toISOString(),
    };

    await this.redis.set(budgetKey, JSON.stringify(updated));
  }

  /**
   * Holt Budget Konfiguration
   */
  public async getBudget(userId: string): Promise<{
    dailyLimit: number;
    weeklyLimit: number;
    monthlyLimit: number;
    currency: string;
  } | null> {
    const budgetKey = BILLING_KEYS.budgetConfig(userId);
    const data = await this.redis.get(budgetKey);

    if (!data) {
      return {
        dailyLimit: 5.0,
        weeklyLimit: 35.0,
        monthlyLimit: 150.0,
        currency: this.defaultCurrency,
      };
    }

    return JSON.parse(data);
  }

  /**
   * Prüft Budget Status
   */
  public async checkBudgetStatus(
    userId: string,
    period: 'daily' | 'weekly' | 'monthly' = 'daily'
  ): Promise<BudgetStatus> {
    const budget = await this.getBudget(userId);
    if (!budget) {
      throw new Error('No budget configured');
    }

    let limit: number;
    let used: number;

    switch (period) {
      case 'daily':
        limit = budget.dailyLimit;
        const today = new Date().toISOString().split('T')[0];
        const dailyData = await this.redis.hgetall(BILLING_KEYS.userDailyCost(userId, today));
        used = parseFloat(dailyData.total_cost || '0');
        break;

      case 'weekly':
        limit = budget.weeklyLimit;
        // Calculate weekly usage
        used = await this.calculateWeeklyUsage(userId);
        break;

      case 'monthly':
        limit = budget.monthlyLimit;
        const month = new Date().toISOString().slice(0, 7);
        const monthlyData = await this.redis.hgetall(BILLING_KEYS.userMonthlyCost(userId, month));
        used = parseFloat(monthlyData.total_cost || '0');
        break;
    }

    const percentage = (used / limit) * 100;
    const remaining = Math.max(0, limit - used);

    // Project end of period usage
    const daysInPeriod = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
    const dayOfPeriod = period === 'daily' ? 1 : new Date().getDay() || 7;
    const projected = (used / dayOfPeriod) * daysInPeriod;

    let status: BudgetStatus['status'] = 'ok';
    if (percentage >= 100) status = 'exceeded';
    else if (percentage >= 80) status = 'critical';
    else if (percentage >= 60) status = 'warning';

    return {
      userId,
      period,
      limit,
      used: Number(used.toFixed(4)),
      remaining: Number(remaining.toFixed(4)),
      percentage: Number(percentage.toFixed(2)),
      projectedEndOfPeriod: Number(projected.toFixed(4)),
      status,
    };
  }

  /**
   * Berechnet wöchentliche Usage
   */
  private async calculateWeeklyUsage(userId: string): Promise<number> {
    const today = new Date();
    const dayOfWeek = today.getDay() || 7;
    let total = 0;

    for (let i = 0; i < dayOfWeek; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const data = await this.redis.hgetall(BILLING_KEYS.userDailyCost(userId, dateStr));
      total += parseFloat(data.total_cost || '0');
    }

    return total;
  }

  /**
   * Prüft und sendet Budget Alerts
   */
  private async checkBudgetAlert(userId: string, currentCost: number): Promise<void> {
    const budget = await this.getBudget(userId);
    if (!budget) return;

    const percentage = (currentCost / budget.dailyLimit) * 100;
    let alert: AlertHistoryEntry | null = null;

    if (percentage >= 100) {
      alert = {
        id: `${Date.now()}-${userId}`,
        userId,
        type: 'exceeded',
        threshold: 100,
        currentUsage: currentCost,
        limit: budget.dailyLimit,
        timestamp: new Date(),
        acknowledged: false,
      };
    } else if (percentage >= 80) {
      alert = {
        id: `${Date.now()}-${userId}`,
        userId,
        type: 'critical',
        threshold: 80,
        currentUsage: currentCost,
        limit: budget.dailyLimit,
        timestamp: new Date(),
        acknowledged: false,
      };
    }

    if (alert) {
      // Store alert
      const alertKey = BILLING_KEYS.alerts(userId);
      await this.redis.zadd(alertKey, Date.now(), JSON.stringify(alert));
      await this.redis.expire(alertKey, 60 * 60 * 24 * 30); // 30 days

      // Notify callbacks
      this.alertCallbacks.forEach(cb => cb(alert!));

      console.log(`[BILLING ALERT] User ${userId}: ${alert.type} - ${percentage.toFixed(1)}%`);
    }
  }

  /**
   * Holt Alert History
   */
  public async getAlertHistory(
    userId: string,
    limit: number = 50
  ): Promise<AlertHistoryEntry[]> {
    const alertKey = BILLING_KEYS.alerts(userId);
    const alerts = await this.redis.zrevrange(alertKey, 0, limit - 1);

    return alerts.map(a => JSON.parse(a));
  }

  /**
   * Bestätigt einen Alert
   */
  public async acknowledgeAlert(userId: string, alertId: string): Promise<void> {
    const alertKey = BILLING_KEYS.alerts(userId);
    const alerts = await this.redis.zrange(alertKey, 0, -1);

    for (const alertStr of alerts) {
      const alert = JSON.parse(alertStr);
      if (alert.id === alertId) {
        alert.acknowledged = true;
        await this.redis.zrem(alertKey, alertStr);
        await this.redis.zadd(alertKey, new Date(alert.timestamp).getTime(), JSON.stringify(alert));
        break;
      }
    }
  }

  /**
   * Registriert einen Alert Callback
   */
  public onAlert(callback: (alert: AlertHistoryEntry) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Generiert Invoice für einen User
   */
  public async generateInvoice(
    userId: string,
    startDate: string,
    endDate: string,
    currency: string = this.defaultCurrency
  ): Promise<{
    userId: string;
    period: { start: string; end: string };
    items: Array<{
      date: string;
      requests: number;
      tokens: number;
      cost: number;
    }>;
    total: number;
    currency: string;
    generatedAt: string;
  }> {
    const items: Array<{
      date: string;
      requests: number;
      tokens: number;
      cost: number;
    }> = [];

    let currentDate = new Date(startDate);
    const end = new Date(endDate);
    let totalCost = 0;

    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const data = await this.redis.hgetall(BILLING_KEYS.userDailyCost(userId, dateStr));

      const cost = parseFloat(data.total_cost || '0');
      if (cost > 0) {
        items.push({
          date: dateStr,
          requests: parseInt(data.total_requests || '0', 10),
          tokens: parseInt(data.total_tokens || '0', 10),
          cost: currency !== 'USD'
            ? this.convertCurrency(cost, 'USD', currency)
            : cost,
        });
        totalCost += cost;
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return {
      userId,
      period: { start: startDate, end: endDate },
      items,
      total: currency !== 'USD'
        ? this.convertCurrency(totalCost, 'USD', currency)
        : totalCost,
      currency,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Holt Pricing Informationen
   */
  public getPricing(currency: string = this.defaultCurrency): Array<{
    model: GitHubModel;
    inputPrice: number;
    outputPrice: number;
    multiplier: number;
  }> {
    return Object.entries(GITHUB_MODELS_PRICING).map(([model, pricing]) => ({
      model: model as GitHubModel,
      inputPrice: currency !== 'USD'
        ? this.convertCurrency(pricing.input, 'USD', currency)
        : pricing.input,
      outputPrice: currency !== 'USD'
        ? this.convertCurrency(pricing.output, 'USD', currency)
        : pricing.output,
      multiplier: MODEL_MULTIPLIERS[model as GitHubModel],
    }));
  }
}

/**
 * Factory Funktion
 */
export function createBillingService(
  redis: RedisClient,
  defaultCurrency?: string
): BillingService {
  return new BillingService(redis, defaultCurrency);
}

export {
  BILLING_KEYS,
};
