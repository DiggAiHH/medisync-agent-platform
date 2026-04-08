import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Routes
import jobsRouter from './routes/jobs';
import healthRouter, { initializeHealthRoutes } from './routes/health';
import statsRouter, { initializeStatsRoutes } from './routes/stats';

// Queue & WebSocket
import { redisConnection, closeQueue, isMemoryQueue } from './queue/agentQueue';
import { initializeWebSocketServer, closeWebSocketServer } from './websocket/streaming';

// Services & Middleware
import { createTokenTracker, RedisClient } from './ai/tokenTracker';
import { createUsageMiddleware } from './middleware/usageMiddleware';
import { createBillingService } from './services/billingService';
import { createMetricsCollector } from './utils/metrics';

// Umgebungsvariablen laden
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000');
const NODE_ENV = process.env.NODE_ENV || 'development';

// CORS Konfiguration
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Erlaube Anfragen ohne Origin (z.B. von Postman)
    if (!origin) {
      return callback(null, true);
    }
    
    // In Entwicklung: Erlaube alle Origins
    if (NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // In Produktion: Prüfe gegen erlaubte Origins
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    callback(new Error('Nicht erlaubter Origin'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-User-Id', 'X-Session-Id'],
  credentials: true,
  maxAge: 86400 // 24 Stunden
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request Logging Middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Initialize Services
const redisClient = redisConnection as unknown as RedisClient;
const tokenTracker = createTokenTracker(redisClient);
const usageMiddleware = createUsageMiddleware(redisClient, tokenTracker);
const billingService = createBillingService(redisClient);
const metricsCollector = createMetricsCollector(redisClient);

// Apply Usage Tracking Middleware globally
app.use(usageMiddleware.middleware());

// Track response times
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    metricsCollector.trackRequestDuration(
      req.method,
      req.route?.path || req.path,
      res.statusCode,
      duration
    );
  });
  
  next();
});

// Routes
app.use('/api/jobs', jobsRouter);
app.use('/health', initializeHealthRoutes(metricsCollector));
app.use('/api/stats', initializeStatsRoutes(tokenTracker, usageMiddleware));

// Budget Management Routes
app.get('/api/budget/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const status = await billingService.checkBudgetStatus(userId);
    const history = await billingService.getCostHistory(userId, 30);
    const alerts = await billingService.getAlertHistory(userId);

    res.json({
      success: true,
      data: {
        userId,
        budget: await billingService.getBudget(userId),
        status,
        history,
        alerts,
      },
    });
  } catch (error) {
    console.error('Error fetching budget:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch budget information',
    });
  }
});

app.put('/api/budget/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { dailyLimit, weeklyLimit, monthlyLimit, currency } = req.body;

    await billingService.setBudget(userId, {
      dailyLimit,
      weeklyLimit,
      monthlyLimit,
      currency,
    });

    res.json({
      success: true,
      message: 'Budget configuration updated',
    });
  } catch (error) {
    console.error('Error updating budget:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update budget configuration',
    });
  }
});

app.get('/api/budget/:userId/invoice', async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, currency } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required',
      });
    }

    const invoice = await billingService.generateInvoice(
      userId,
      startDate as string,
      endDate as string,
      currency as string
    );

    res.json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate invoice',
    });
  }
});

// Rate Limit Status Route
app.get('/api/ratelimit/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const status = await usageMiddleware.getBudgetStatus(userId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('Error fetching rate limit status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rate limit status',
    });
  }
});

// Metrics Export Route
app.get('/api/metrics', async (req, res) => {
  try {
    const format = (req.query.format as string) || 'json';

    if (format === 'prometheus') {
      const lines = await metricsCollector.exportPrometheusMetrics();
      res.setHeader('Content-Type', 'text/plain');
      return res.send(lines.join('\n'));
    }

    res.json({
      success: true,
      data: metricsCollector.exportJSON(),
    });
  } catch (error) {
    console.error('Error exporting metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export metrics',
    });
  }
});

// Pricing Information
app.get('/api/pricing', async (req, res) => {
  try {
    const currency = (req.query.currency as string) || 'USD';
    const pricing = billingService.getPricing(currency);

    res.json({
      success: true,
      data: {
        currency,
        models: pricing,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching pricing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pricing information',
    });
  }
});

// Root Endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'MediSync Agenten-Plattform API',
    version: '1.0.0',
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    features: {
      usageTracking: true,
      rateLimiting: true,
      budgetManagement: true,
      metrics: true,
    },
    endpoints: {
      api: {
        jobs: {
          create: 'POST /api/jobs',
          get: 'GET /api/jobs/:id',
          list: 'GET /api/jobs',
          delete: 'DELETE /api/jobs/:id',
          retry: 'POST /api/jobs/:id/retry',
        },
        stats: {
          global: 'GET /api/stats',
          user: 'GET /api/stats/user/:userId',
          usage: 'GET /api/stats/usage',
          models: 'GET /api/stats/models',
          sessions: 'GET /api/stats/sessions',
          session: 'GET /api/stats/session/:sessionId',
          budget: 'GET /api/stats/budget/:userId',
          export: 'GET /api/stats/export',
        },
        budget: {
          status: 'GET /api/budget/:userId',
          update: 'PUT /api/budget/:userId',
          invoice: 'GET /api/budget/:userId/invoice',
        },
        monitoring: {
          rateLimit: 'GET /api/ratelimit/:userId',
          metrics: 'GET /api/metrics',
          pricing: 'GET /api/pricing',
        },
      },
      health: {
        status: 'GET /health',
        detailed: 'GET /health/detailed',
        models: 'GET /health/models',
        redis: 'GET /health/redis',
        queue: 'GET /health/queue',
        metrics: 'GET /health/metrics',
        ready: 'GET /health/ready',
        live: 'GET /health/live',
      },
      websocket: {
        url: `ws://localhost:${process.env.WS_PORT || 8080}`,
        description: 'WebSocket für Echtzeit-Job-Updates',
      },
    },
    documentation: {
      usageTracking: 'Trackt API Requests, Token Usage und Kosten pro User/Session/Modell',
      rateLimiting: 'Requests per Minute/Hour/Day Limits mit automatischer Blockierung',
      budgetManagement: 'Tägliche/Wöchentliche/Monatliche Budget Limits mit Alerts',
      metrics: 'Prometheus-kompatible Metriken für Monitoring',
    },
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint nicht gefunden',
    path: req.path,
    method: req.method,
    documentation: '/',
  });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Error:', err);
  
  // Track error in metrics
  metricsCollector.trackError(
    err.name || 'UnknownError',
    err.message,
    {
      endpoint: req.path,
      userId: req.usageContext?.userId,
    }
  );
  
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Interner Serverfehler',
    ...(NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Server starten
const server = app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║          MediSync Agenten-Plattform Backend              ║
╠══════════════════════════════════════════════════════════╣
║  Environment: ${NODE_ENV.padEnd(45)}║
║  API Server:  http://localhost:${PORT.toString().padEnd(33)}║
╠══════════════════════════════════════════════════════════╣
║  Queue Mode: ${(isMemoryQueue ? 'In-Memory (kein Redis)' : 'Redis').padEnd(43)}║
╚══════════════════════════════════════════════════════════╝
  `);
});

// WebSocket Server starten
try {
  initializeWebSocketServer();
} catch (error) {
  console.error('Fehler beim Starten des WebSocket Servers:', error);
}

// Graceful Shutdown Handler
const gracefulShutdown = async (signal: string) => {
  console.log(`\n⚠️  ${signal} empfangen. Starte graceful shutdown...`);

  // HTTP Server schließen
  server.close(() => {
    console.log('✅ HTTP Server geschlossen');
  });

  // Warte auf bestehende Verbindungen (max 30 Sekunden)
  const shutdownTimeout = setTimeout(() => {
    console.error('⚠️  Force shutdown nach Timeout');
    process.exit(1);
  }, 30000);

  try {
    // WebSocket Server schließen
    await closeWebSocketServer();

    // Queue-Verbindungen schließen
    await closeQueue();

    clearTimeout(shutdownTimeout);
    console.log('✅ Graceful shutdown abgeschlossen');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fehler beim Shutdown:', error);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
};

// Signal Handler
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled Promise Rejection Handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Uncaught Exception Handler
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Export für Tests
export default app;
export { tokenTracker, usageMiddleware, billingService, metricsCollector };
