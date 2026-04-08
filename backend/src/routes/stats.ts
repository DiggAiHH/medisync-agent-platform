/**
 * Stats API Routes
 * 
 * Endpunkte:
 * - GET /api/stats - Gesamtstatistiken
 * - GET /api/stats/user/:userId - User Stats
 * - GET /api/stats/usage - Token Usage über Zeit
 * - GET /api/stats/models - Usage pro Modell
 * - GET /api/stats/sessions - Session Statistiken
 * - GET /api/stats/budget/:userId - Budget Status
 */

import { Router, Request, Response } from 'express';
import { TokenTracker } from '../ai/tokenTracker';
import { UsageMiddleware } from '../middleware/usageMiddleware';
import { GitHubModel } from '../ai/types';

interface StatsQueryParams {
  days?: string;
  startDate?: string;
  endDate?: string;
  model?: GitHubModel;
  limit?: string;
}

const router = Router();

// TokenTracker und UsageMiddleware Instanzen (werden aus server.ts injiziert)
let tokenTracker: TokenTracker | null = null;
let usageMiddleware: UsageMiddleware | null = null;

/**
 * Initialisiert den Router mit Dependencies
 */
export function initializeStatsRoutes(
  tracker: TokenTracker,
  middleware: UsageMiddleware
): Router {
  tokenTracker = tracker;
  usageMiddleware = middleware;
  return router;
}

/**
 * Validiert und parst Query Parameter
 */
function parseQueryParams(req: Request): Omit<StatsQueryParams, 'days' | 'limit'> & { days: number; limit: number } {
  const days = Math.min(parseInt(req.query.days as string || '30', 10), 365);
  const limit = Math.min(parseInt(req.query.limit as string || '100', 10), 1000);

  return {
    days: isNaN(days) ? 30 : days,
    limit: isNaN(limit) ? 100 : limit,
    startDate: req.query.startDate as string,
    endDate: req.query.endDate as string,
    model: req.query.model as GitHubModel,
  };
}

/**
 * GET /api/stats
 * Gesamtstatistiken der Plattform
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    if (!tokenTracker) {
      return res.status(503).json({
        success: false,
        error: 'Stats service not initialized',
      });
    }

    const { days } = parseQueryParams(req);
    const stats = await tokenTracker.getGlobalUsageStats(days);

    // Calculate additional metrics
    const totalModels = Object.keys(stats.modelBreakdown).length;
    const activeDays = stats.daily.length;
    const avgRequestsPerDay = activeDays > 0 ? Math.round(stats.total.requests / activeDays) : 0;
    const avgTokensPerDay = activeDays > 0 ? Math.round(stats.total.tokens / activeDays) : 0;
    const avgCostPerDay = activeDays > 0 ? stats.total.cost / activeDays : 0;

    // Find most used model
    let topModel: { model: string; requests: number; tokens: number } | null = null;
    for (const [model, data] of Object.entries(stats.modelBreakdown)) {
      if (!topModel || data.requests > topModel.requests) {
        topModel = { model, requests: data.requests, tokens: data.tokens };
      }
    }

    res.json({
      success: true,
      data: {
        period: {
          days,
          startDate: stats.daily[stats.daily.length - 1]?.date,
          endDate: stats.daily[0]?.date,
        },
        totals: {
          requests: stats.total.requests,
          tokens: stats.total.tokens,
          cost: stats.total.cost,
          uniqueUsers: stats.total.uniqueUsers,
        },
        averages: {
          requestsPerDay: avgRequestsPerDay,
          tokensPerDay: avgTokensPerDay,
          costPerDay: Number(avgCostPerDay.toFixed(4)),
          tokensPerRequest: stats.total.requests > 0
            ? Math.round(stats.total.tokens / stats.total.requests)
            : 0,
          costPerRequest: stats.total.requests > 0
            ? Number((stats.total.cost / stats.total.requests).toFixed(4))
            : 0,
        },
        models: {
          total: totalModels,
          top: topModel,
          breakdown: stats.modelBreakdown,
        },
        daily: stats.daily,
      },
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
    });
  }
});

/**
 * GET /api/stats/user/:userId
 * Statistiken für einen spezifischen User
 */
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    if (!tokenTracker) {
      return res.status(503).json({
        success: false,
        error: 'Stats service not initialized',
      });
    }

    const { userId } = req.params;
    const { days, limit } = parseQueryParams(req);

    // Get user stats
    const stats = await tokenTracker.getUserUsageStats(userId, days);
    const topModels = await tokenTracker.getUserTopModels(userId, 5);
    const sessions = await tokenTracker.getUserSessions(userId);
    const timeline = await tokenTracker.getUserUsageTimeline(userId, limit);

    // Get current day usage
    const today = new Date().toISOString().split('T')[0];
    const todayUsage = await tokenTracker.getUserDailyUsage(userId, today);

    // Get current month usage
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthUsage = await tokenTracker.getUserMonthlyUsage(userId, currentMonth);

    // Get current week usage
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekStr = `${weekStart.getFullYear()}-W${Math.ceil((weekStart.getDate()) / 7).toString().padStart(2, '0')}`;
    const weekUsage = await tokenTracker.getUserWeeklyUsage(userId, weekStr);

    res.json({
      success: true,
      data: {
        userId,
        periods: {
          today: todayUsage || {
            date: today,
            totalRequests: 0,
            totalTokens: 0,
            totalPromptTokens: 0,
            totalCompletionTokens: 0,
            estimatedCost: 0,
            modelBreakdown: {},
          },
          thisWeek: weekUsage || {
            date: weekStr,
            totalRequests: 0,
            totalTokens: 0,
            totalPromptTokens: 0,
            totalCompletionTokens: 0,
            estimatedCost: 0,
            modelBreakdown: {},
          },
          thisMonth: monthUsage || {
            date: currentMonth,
            totalRequests: 0,
            totalTokens: 0,
            totalPromptTokens: 0,
            totalCompletionTokens: 0,
            estimatedCost: 0,
            modelBreakdown: {},
          },
          history: {
            days,
            ...stats,
          },
        },
        models: {
          used: stats.models.length,
          top: topModels,
          all: stats.models,
        },
        sessions: {
          total: sessions.length,
          list: sessions.slice(0, 10),
        },
        recentActivity: timeline.slice(0, 20),
      },
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user statistics',
    });
  }
});

/**
 * GET /api/stats/usage
 * Token Usage über Zeit
 */
router.get('/usage', async (req: Request, res: Response) => {
  try {
    if (!tokenTracker) {
      return res.status(503).json({
        success: false,
        error: 'Stats service not initialized',
      });
    }

    const { days, model } = parseQueryParams(req);

    const stats = await tokenTracker.getGlobalUsageStats(days);

    // Filter by model if specified
    let filteredDaily = stats.daily;
    if (model && stats.modelBreakdown[model]) {
      // Recalculate totals for specific model
      const modelStats = stats.modelBreakdown[model];
      return res.json({
        success: true,
        data: {
          model,
          period: { days },
          totals: {
            requests: modelStats.requests,
            tokens: modelStats.tokens,
          },
          daily: filteredDaily.map(day => ({
            date: day.date,
            requests: day.requests,
            tokens: day.tokens,
            cost: day.cost,
            uniqueUsers: day.uniqueUsers,
            uniqueSessions: day.uniqueSessions,
          })),
        },
      });
    }

    res.json({
      success: true,
      data: {
        period: { days },
        totals: stats.total,
        daily: stats.daily,
        byModel: stats.modelBreakdown,
      },
    });
  } catch (error) {
    console.error('Error fetching usage stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch usage statistics',
    });
  }
});

/**
 * GET /api/stats/models
 * Usage pro Modell
 */
router.get('/models', async (req: Request, res: Response) => {
  try {
    if (!tokenTracker) {
      return res.status(503).json({
        success: false,
        error: 'Stats service not initialized',
      });
    }

    const { days } = parseQueryParams(req);
    const stats = await tokenTracker.getGlobalUsageStats(days);

    // Calculate percentages and rankings
    const totalRequests = stats.total.requests;
    const totalTokens = stats.total.tokens;

    const modelStats = Object.entries(stats.modelBreakdown).map(([model, data]) => ({
      model: model as GitHubModel,
      requests: data.requests,
      tokens: data.tokens,
      requestPercentage: totalRequests > 0 ? (data.requests / totalRequests) * 100 : 0,
      tokenPercentage: totalTokens > 0 ? (data.tokens / totalTokens) * 100 : 0,
      avgTokensPerRequest: data.requests > 0 ? Math.round(data.tokens / data.requests) : 0,
    }));

    // Sort by requests
    modelStats.sort((a, b) => b.requests - a.requests);

    res.json({
      success: true,
      data: {
        period: { days },
        totalModels: modelStats.length,
        totalRequests,
        totalTokens,
        models: modelStats,
        rankings: {
          byRequests: modelStats.map((m, i) => ({ rank: i + 1, model: m.model, value: m.requests })),
          byTokens: [...modelStats]
            .sort((a, b) => b.tokens - a.tokens)
            .map((m, i) => ({ rank: i + 1, model: m.model, value: m.tokens })),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching model stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch model statistics',
    });
  }
});

/**
 * GET /api/stats/sessions
 * Session-basierte Statistiken
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    if (!tokenTracker) {
      return res.status(503).json({
        success: false,
        error: 'Stats service not initialized',
      });
    }

    const { days, limit } = parseQueryParams(req);
    const stats = await tokenTracker.getGlobalUsageStats(days);

    // Calculate session metrics
    const totalSessions = stats.daily.reduce((sum, day) => sum + day.uniqueSessions, 0);
    const avgSessionsPerDay = stats.daily.length > 0 ? totalSessions / stats.daily.length : 0;

    res.json({
      success: true,
      data: {
        period: { days },
        totals: {
          sessions: totalSessions,
          avgPerDay: Number(avgSessionsPerDay.toFixed(2)),
          avgRequestsPerSession: totalSessions > 0
            ? Math.round(stats.total.requests / totalSessions)
            : 0,
          avgTokensPerSession: totalSessions > 0
            ? Math.round(stats.total.tokens / totalSessions)
            : 0,
        },
        daily: stats.daily.map(day => ({
          date: day.date,
          sessions: day.uniqueSessions,
          requests: day.requests,
          tokens: day.tokens,
          users: day.uniqueUsers,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching session stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session statistics',
    });
  }
});

/**
 * GET /api/stats/session/:sessionId
 * Details für eine spezifische Session
 */
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    if (!tokenTracker) {
      return res.status(503).json({
        success: false,
        error: 'Stats service not initialized',
      });
    }

    const { sessionId } = req.params;
    const sessionData = await tokenTracker.getSessionUsage(sessionId);

    if (!sessionData) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    res.json({
      success: true,
      data: sessionData,
    });
  } catch (error) {
    console.error('Error fetching session details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session details',
    });
  }
});

/**
 * GET /api/stats/budget/:userId
 * Budget Status für einen User
 */
router.get('/budget/:userId', async (req: Request, res: Response) => {
  try {
    if (!usageMiddleware) {
      return res.status(503).json({
        success: false,
        error: 'Budget service not initialized',
      });
    }

    const { userId } = req.params;
    const budgetStatus = await usageMiddleware.getBudgetStatus(userId);
    const alerts = await usageMiddleware.getBudgetAlerts(userId, 10);

    res.json({
      success: true,
      data: {
        userId,
        limits: budgetStatus.limits,
        currentUsage: budgetStatus.usage,
        percentages: budgetStatus.percentages,
        status: {
          requests: budgetStatus.percentages.requests.day < 100 ? 'ok' : 'exceeded',
          tokens: budgetStatus.percentages.tokens < 100 ? 'ok' : 'exceeded',
          cost: budgetStatus.percentages.cost < 100 ? 'ok' : 'exceeded',
        },
        alerts: alerts.map(alert => ({
          type: alert.type,
          threshold: alert.threshold,
          timestamp: alert.timestamp,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching budget status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch budget status',
    });
  }
});

/**
 * GET /api/stats/top-users
 * Top Nutzer nach Usage
 */
router.get('/top-users', async (req: Request, res: Response) => {
  try {
    if (!tokenTracker) {
      return res.status(503).json({
        success: false,
        error: 'Stats service not initialized',
      });
    }

    const { days, limit } = parseQueryParams(req);
    const stats = await tokenTracker.getGlobalUsageStats(days);

    // Note: In a real implementation, you would maintain a leaderboard in Redis
    // For now, return aggregated data
    res.json({
      success: true,
      data: {
        period: { days },
        totalUsers: stats.total.uniqueUsers,
        message: 'User ranking requires additional tracking. Use /api/stats/user/:userId for individual stats.',
      },
    });
  } catch (error) {
    console.error('Error fetching top users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch top users',
    });
  }
});

/**
 * GET /api/stats/export
 * Exportiere Statistiken als CSV/JSON
 */
router.get('/export', async (req: Request, res: Response) => {
  try {
    if (!tokenTracker) {
      return res.status(503).json({
        success: false,
        error: 'Stats service not initialized',
      });
    }

    const { days } = parseQueryParams(req);
    const format = (req.query.format as string || 'json').toLowerCase();
    const stats = await tokenTracker.getGlobalUsageStats(days);

    if (format === 'csv') {
      // Generate CSV
      const headers = ['Date', 'Requests', 'Tokens', 'Cost', 'Unique Users', 'Unique Sessions'];
      const rows = stats.daily.map(day =>
        `${day.date},${day.requests},${day.tokens},${day.cost},${day.uniqueUsers},${day.uniqueSessions}`
      );
      const csv = [headers.join(','), ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="stats-${new Date().toISOString().split('T')[0]}.csv"`);
      return res.send(csv);
    }

    // Default JSON
    res.json({
      success: true,
      exportedAt: new Date().toISOString(),
      data: stats,
    });
  } catch (error) {
    console.error('Error exporting stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export statistics',
    });
  }
});

export default router;
