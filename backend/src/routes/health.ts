/**
 * Health Check Routes
 * 
 * Endpunkte:
 * - GET /health - Gesamter Gesundheitsstatus
 * - GET /health/ready - Readiness Check (Kubernetes)
 * - GET /health/live - Liveness Check (Kubernetes)
 * - GET /health/detailed - Detaillierte Systeminformationen
 * - GET /health/models - GitHub Models API Status
 * - GET /health/queue - Queue Status
 * - GET /health/metrics - Prometheus-ähnliche Metriken
 */

import { Router, Request, Response } from 'express';
import { redisConnection, agentQueue, checkQueueHealth, isMemoryQueue } from '../queue/agentQueue';
import { getConnectedClientsCount } from '../websocket/streaming';
import { HealthStatus } from '../types';
import { MetricsCollector } from '../utils/metrics';

const router = Router();
const START_TIME = Date.now();
const VERSION = process.env.npm_package_version || '1.0.0';

// Metrics Collector Instanz
let metricsCollector: MetricsCollector | null = null;

/**
 * Initialisiert den Health Router mit Dependencies
 */
export function initializeHealthRoutes(metrics: MetricsCollector): Router {
  metricsCollector = metrics;
  return router;
}

/**
 * Prüft GitHub Models API Status
 */
async function checkGitHubModelsStatus(): Promise<{
  available: boolean;
  latency: number;
  models?: string[];
  error?: string;
}> {
  const startTime = Date.now();
  const endpoint = process.env.GITHUB_MODELS_ENDPOINT || 'https://models.inference.ai.azure.com';
  const token = process.env.GITHUB_TOKEN;

  try {
    const response = await fetch(`${endpoint}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const latency = Date.now() - startTime;

    if (response.ok) {
      const data = await response.json();
      return {
        available: true,
        latency,
        models: data.data?.map((m: any) => m.id) || [],
      };
    }

    return {
      available: false,
      latency,
      error: `HTTP ${response.status}: ${response.statusText}`,
    };
  } catch (error) {
    return {
      available: false,
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Prüft Redis Verbindung detailliert
 */
async function checkRedisStatus(): Promise<{
  connected: boolean;
  latency: number;
  info?: Record<string, any>;
  error?: string;
}> {
  // Wenn Memory Queue verwendet wird
  if (isMemoryQueue) {
    return {
      connected: false,
      latency: 0,
      error: 'Using in-memory queue (Redis not available)',
    };
  }

  const startTime = Date.now();

  try {
    await redisConnection.ping();
    const latency = Date.now() - startTime;

    // Get Redis info
    const info = await redisConnection.info('server');
    const infoLines = info.split('\r\n');
    const infoObj: Record<string, string> = {};

    for (const line of infoLines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        infoObj[key] = value;
      }
    }

    return {
      connected: true,
      latency,
      info: {
        version: infoObj.redis_version,
        mode: infoObj.redis_mode,
        uptime: infoObj.uptime_in_seconds,
      },
    };
  } catch (error) {
    return {
      connected: false,
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Holt detaillierte Queue Statistiken
 */
async function getDetailedQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  total: number;
  processingTime: {
    average: number;
    min: number;
    max: number;
  };
}> {
  // Verwende Memory Queue Stats wenn aktiv
  if (isMemoryQueue) {
    const counts = await agentQueue.getJobCounts();
    return {
      waiting: counts.waiting,
      active: counts.active,
      completed: counts.completed,
      failed: counts.failed,
      delayed: 0,
      paused: 0,
      total: counts.waiting + counts.active + counts.completed + counts.failed,
      processingTime: { average: 0, min: 0, max: 0 },
    };
  }

  const [
    waiting,
    active,
    completed,
    failed,
    delayed,
    paused,
  ] = await Promise.all([
    agentQueue.getWaitingCount(),
    agentQueue.getActiveCount(),
    agentQueue.getCompletedCount(),
    agentQueue.getFailedCount(),
    agentQueue.getDelayedCount(),
    Promise.resolve(0),
  ]);

  const completedJobs = await agentQueue.getCompleted(0, 100);
  const processingTimes: number[] = [];

  for (const job of completedJobs) {
    if (job.processedOn && job.finishedOn) {
      processingTimes.push(job.finishedOn - job.processedOn);
    }
  }

  const avgProcessingTime = processingTimes.length > 0
    ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
    : 0;

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    paused,
    total: waiting + active + completed + failed + delayed + paused,
    processingTime: {
      average: Math.round(avgProcessingTime),
      min: processingTimes.length > 0 ? Math.min(...processingTimes) : 0,
      max: processingTimes.length > 0 ? Math.max(...processingTimes) : 0,
    },
  };
}

// GET /health - Gesundheitsstatus
router.get('/', async (req: Request, res: Response) => {
  try {
    // Redis Status prüfen (skip wenn Memory Queue)
    let redisHealthy = false;
    let redisLatency = 0;
    
    if (isMemoryQueue) {
      redisHealthy = false; // Redis ist nicht aktiv
    } else {
      try {
        const startTime = Date.now();
        await redisConnection.ping();
        redisLatency = Date.now() - startTime;
        redisHealthy = true;
      } catch (error) {
        console.error('Redis Health Check fehlgeschlagen:', error);
      }
    }

    // Queue Status prüfen
    const queueHealthy = await checkQueueHealth();

    // GitHub Models API prüfen
    const modelsStatus = await checkGitHubModelsStatus();

    // Gesamtstatus bestimmen
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    if (!redisHealthy || !queueHealthy) {
      overallStatus = 'unhealthy';
    } else if (!modelsStatus.available) {
      overallStatus = 'degraded';
    }

    // Queue-Statistiken abrufen
    let queueStats = null;
    try {
      queueStats = await getDetailedQueueStats();
    } catch (error) {
      console.error('Fehler beim Abrufen der Queue-Statistiken:', error);
    }

    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: {
        server: true,
        redis: redisHealthy,
        queue: queueHealthy,
        models: modelsStatus.available,
      },
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      version: VERSION,
    };

    // Zusätzliche Details
    const response: any = {
      ...healthStatus,
      latency: {
        redis: redisLatency,
        models: modelsStatus.latency,
      },
      websocket: {
        connectedClients: getConnectedClientsCount(),
      },
    };

    if (queueStats) {
      response.queue = queueStats;
    }

    if (modelsStatus.models) {
      response.availableModels = modelsStatus.models.slice(0, 10);
    }

    if (modelsStatus.error) {
      response.warnings = [`Models API: ${modelsStatus.error}`];
    }
    
    if (isMemoryQueue) {
      response.warnings = response.warnings || [];
      response.warnings.push('Using in-memory queue - jobs will be lost on restart');
    }

    // HTTP Status Code basierend auf Gesundheit
    const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

    res.status(statusCode).json(response);
  } catch (error) {
    console.error('Fehler beim Health Check:', error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        server: false,
        redis: false,
        queue: false,
        models: false,
      },
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      version: VERSION,
      error: 'Health Check fehlgeschlagen',
    });
  }
});

// GET /health/detailed - Detaillierte Systeminformationen
router.get('/detailed', async (req: Request, res: Response) => {
  try {
    const [redisStatus, modelsStatus, queueStats] = await Promise.all([
      checkRedisStatus(),
      checkGitHubModelsStatus(),
      getDetailedQueueStats(),
    ]);

    // System Info
    const systemInfo = {
      platform: process.platform,
      nodeVersion: process.version,
      memory: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime(),
    };

    // Environment Info (sanitized)
    const envInfo = {
      nodeEnv: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 3000,
      redisUrl: process.env.REDIS_URL ? 'configured' : 'not configured',
      githubToken: process.env.GITHUB_TOKEN ? 'configured' : 'not configured',
      wsPort: process.env.WS_PORT || 8080,
    };

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      system: systemInfo,
      environment: envInfo,
      services: {
        redis: redisStatus,
        models: modelsStatus,
        queue: queueStats,
      },
      websocket: {
        connectedClients: getConnectedClientsCount(),
      },
    });
  } catch (error) {
    console.error('Error in detailed health check:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get detailed health status',
    });
  }
});

// GET /health/models - GitHub Models API Status
router.get('/models', async (req: Request, res: Response) => {
  try {
    const modelsStatus = await checkGitHubModelsStatus();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      models: modelsStatus,
    });
  } catch (error) {
    console.error('Error checking models status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check models status',
    });
  }
});

// GET /health/redis - Redis Status
router.get('/redis', async (req: Request, res: Response) => {
  try {
    const redisStatus = await checkRedisStatus();

    res.status(redisStatus.connected ? 200 : 503).json({
      success: redisStatus.connected,
      timestamp: new Date().toISOString(),
      redis: redisStatus,
    });
  } catch (error) {
    console.error('Error checking redis status:', error);
    res.status(503).json({
      success: false,
      error: 'Failed to check redis status',
    });
  }
});

// GET /health/queue - Queue Status
router.get('/queue', async (req: Request, res: Response) => {
  try {
    const queueStats = await getDetailedQueueStats();
    const isHealthy = queueStats.failed < queueStats.completed * 0.1; // < 10% failed

    res.json({
      success: true,
      healthy: isHealthy,
      timestamp: new Date().toISOString(),
      queue: queueStats,
    });
  } catch (error) {
    console.error('Error checking queue status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check queue status',
    });
  }
});

// GET /health/metrics - Prometheus-ähnliche Metriken
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const queueStats = await getDetailedQueueStats();

    // Build Prometheus-style metrics
    const metrics: string[] = [];

    // Uptime
    const uptime = Math.floor((Date.now() - START_TIME) / 1000);
    metrics.push(`# HELP app_uptime_seconds Application uptime in seconds`);
    metrics.push(`# TYPE app_uptime_seconds gauge`);
    metrics.push(`app_uptime_seconds ${uptime}`);

    // Queue metrics
    metrics.push(`# HELP queue_jobs_total Total number of jobs`);
    metrics.push(`# TYPE queue_jobs_total gauge`);
    metrics.push(`queue_jobs_total{state="waiting"} ${queueStats.waiting}`);
    metrics.push(`queue_jobs_total{state="active"} ${queueStats.active}`);
    metrics.push(`queue_jobs_total{state="completed"} ${queueStats.completed}`);
    metrics.push(`queue_jobs_total{state="failed"} ${queueStats.failed}`);
    metrics.push(`queue_jobs_total{state="delayed"} ${queueStats.delayed}`);

    // Processing time
    metrics.push(`# HELP queue_processing_time_ms Average processing time in milliseconds`);
    metrics.push(`# TYPE queue_processing_time_ms gauge`);
    metrics.push(`queue_processing_time_ms ${queueStats.processingTime.average}`);

    // WebSocket connections
    metrics.push(`# HELP websocket_connections_total Active WebSocket connections`);
    metrics.push(`# TYPE websocket_connections_total gauge`);
    metrics.push(`websocket_connections_total ${getConnectedClientsCount()}`);

    // Add custom metrics from collector
    if (metricsCollector) {
      const customMetrics = await metricsCollector.exportPrometheusMetrics();
      metrics.push(...customMetrics);
    }

    res.setHeader('Content-Type', 'text/plain');
    res.send(metrics.join('\n'));
  } catch (error) {
    console.error('Error generating metrics:', error);
    res.status(500).send('# Error generating metrics');
  }
});

// GET /health/ready - Readiness Check (für Kubernetes)
router.get('/ready', async (req: Request, res: Response) => {
  try {
    const queueHealthy = await checkQueueHealth();
    
    // Redis ist optional wenn Memory Queue verwendet wird
    let redisHealthy = isMemoryQueue;
    if (!isMemoryQueue) {
      redisHealthy = await redisConnection.ping().then(() => true).catch(() => false);
    }

    if (redisHealthy && queueHealthy) {
      res.status(200).json({
        ready: true,
        timestamp: new Date().toISOString(),
        mode: isMemoryQueue ? 'memory' : 'redis',
      });
    } else {
      res.status(503).json({
        ready: false,
        timestamp: new Date().toISOString(),
        services: {
          redis: redisHealthy,
          queue: queueHealthy,
        },
      });
    }
  } catch (error) {
    res.status(503).json({
      ready: false,
      timestamp: new Date().toISOString(),
      error: 'Readiness Check fehlgeschlagen',
    });
  }
});

// GET /health/live - Liveness Check (für Kubernetes)
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
  });
});

export default router;
