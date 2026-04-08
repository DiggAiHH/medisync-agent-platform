/**
 * Budget Limit Types
 * 
 * Definiert alle Typen für das Budget-Limit System
 */

import { GitHubModel } from '../ai/types';

// Default Limits pro User
export const DEFAULT_LIMITS = {
  requestsPerMinute: 60,
  requestsPerHour: 1000,
  requestsPerDay: 10000,
  tokensPerDay: 100000,
  costPerDay: 5.00, // USD
};

// User-spezifische Limits
export interface UserLimits {
  userId: string;
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  tokensPerDay: number;
  costPerDay: number;
  updatedAt: Date;
  updatedBy?: string;
}

// Budget Konfiguration
export interface BudgetConfig {
  userId: string;
  dailyLimit: number;
  weeklyLimit: number;
  monthlyLimit: number;
  currency: string;
  alertThresholds: {
    warning: number;   // 60%
    critical: number;  // 80%
    emergency: number; // 100%
  };
  notificationChannels: ('email' | 'webhook' | 'slack' | 'sms')[];
  autoBlockOnLimit: boolean;
  resetDayOfMonth: number; // 1 = Erster des Monats
}

// Budget Alert
export interface BudgetAlert {
  id: string;
  userId: string;
  type: 'info' | 'warning' | 'critical' | 'emergency';
  level: '60%' | '80%' | '100%';
  threshold: number;
  currentUsage: {
    requests: number;
    tokens: number;
    cost: number;
  };
  limit: UserLimits;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  notificationSent: {
    email?: boolean;
    webhook?: boolean;
    slack?: boolean;
    sms?: boolean;
  };
}

// Usage Limit Check Result
export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  currentUsage: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
    tokensPerDay: number;
    costPerDay: number;
  };
  limits: UserLimits;
  percentages: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
    tokensPerDay: number;
    costPerDay: number;
  };
  resetTime: Date;
}

// Rate Limit Status
export interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetTime: number; // Unix timestamp
  window: 'minute' | 'hour' | 'day';
}

// Token Limit Status
export interface TokenLimitStatus {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
  resetTime: Date;
}

// Cost Limit Status
export interface CostLimitStatus {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
  currency: string;
  resetTime: Date;
}

// Limit Override (für Admins)
export interface LimitOverride {
  id: string;
  userId: string;
  overrideType: 'temporary' | 'permanent';
  limits: Partial<UserLimits>;
  reason: string;
  createdBy: string;
  createdAt: Date;
  expiresAt?: Date;
  active: boolean;
}

// Limit History Entry
export interface LimitHistoryEntry {
  id: string;
  userId: string;
  timestamp: Date;
  action: 'blocked' | 'warning' | 'limit_reached' | 'override_applied';
  details: {
    limitType: string;
    currentValue: number;
    limitValue: number;
    endpoint?: string;
    model?: GitHubModel;
  };
}

// Limit Report
export interface LimitReport {
  userId: string;
  period: {
    start: Date;
    end: Date;
  };
  limits: UserLimits;
  usage: {
    requestsPerMinute: { max: number; avg: number };
    requestsPerHour: { max: number; avg: number };
    requestsPerDay: { total: number; daily: number[] };
    tokensPerDay: { total: number; daily: number[] };
    costPerDay: { total: number; daily: number[] };
  };
  violations: Array<{
    timestamp: Date;
    type: string;
    details: string;
  }>;
  alerts: BudgetAlert[];
  recommendations: string[];
}

// Export/Import Format
export interface LimitsExport {
  version: string;
  exportedAt: Date;
  limits: UserLimits[];
  budgetConfigs: BudgetConfig[];
  overrides: LimitOverride[];
}

// API Response Types
export interface LimitsStatusResponse {
  success: boolean;
  data?: {
    userId: string;
    limits: UserLimits;
    currentUsage: LimitCheckResult['currentUsage'];
    percentages: LimitCheckResult['percentages'];
    status: 'ok' | 'warning' | 'critical' | 'exceeded';
    nextReset: Date;
  };
  error?: string;
}

export interface UpdateLimitsRequest {
  requestsPerMinute?: number;
  requestsPerHour?: number;
  requestsPerDay?: number;
  tokensPerDay?: number;
  costPerDay?: number;
  reason?: string;
}

// Validation
export const LIMIT_VALIDATION = {
  minRequestsPerMinute: 1,
  maxRequestsPerMinute: 10000,
  minRequestsPerHour: 1,
  maxRequestsPerHour: 100000,
  minRequestsPerDay: 1,
  maxRequestsPerDay: 1000000,
  minTokensPerDay: 100,
  maxTokensPerDay: 100000000,
  minCostPerDay: 0.01,
  maxCostPerDay: 10000,
};

// Rate Limit Headers
export interface RateLimitHeaders {
  'X-RateLimit-Limit': string;
  'X-RateLimit-Remaining': string;
  'X-RateLimit-Reset': string;
  'X-RateLimit-Window': string;
}

// Budget Alert Templates
export const BUDGET_ALERT_TEMPLATES = {
  info: {
    subject: 'Budget Info: 60% erreicht',
    message: 'Sie haben 60% Ihres täglichen Budgets verbraucht.',
  },
  warning: {
    subject: 'Budget Warnung: 80% erreicht',
    message: 'Sie haben 80% Ihres täglichen Budgets verbraucht. Bitte achten Sie auf Ihre Nutzung.',
  },
  critical: {
    subject: 'Budget Kritisch: 100% erreicht',
    message: 'Sie haben Ihr tägliches Budget vollständig verbraucht. Weitere Requests werden blockiert.',
  },
  emergency: {
    subject: 'Budget Notfall: Limit überschritten',
    message: 'Ihre Nutzung überschreitet Ihr Budget erheblich. Kontaktieren Sie den Support.',
  },
};
