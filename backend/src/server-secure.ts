/**
 * MediSync Backend Server - Security Enhanced Version
 * 
 * Sicherheitsfeatures:
 * - Input Validation mit Zod
 * - CORS mit Whitelist
 * - Authentication Middleware
 * - Security Headers (Helmet)
 * - Structured Logging (keine PII)
 * - Rate Limiting
 * - XSS Protection
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';

// Security Middlewares
import { createCorsMiddleware } from './middleware/cors';
import { 
  securityHeaders, 
  validateRequest, 
  validateRequestCombined,
  createJobSchema, 
  jobIdParamSchema, 
  jobListQuerySchema,
  updateBudgetSchema,
  invoiceQuerySchema,
  statsQuerySchema,
} from './middleware/validation';
import { 
  requireAuth, 
  requireSession,
  requireAPIKey,
  requireAdmin,
  AUTH_CONFIG 
} from './middleware/auth';
import { logger, requestLoggerMiddleware } from './utils/logger';

// Routes
import jobsRouter from './routes/jobs';
import healthRouter, { initializeHealthRoutes } from './routes/health';
import statsRouter, { initializeStatsRoutes } from './routes/stats';

// Queue & WebSocket
import { redisConnection, closeQueue } from './queue/agentQueue';
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

// =============================================================================
// Security Middleware
// =============================================================================

// 1. Helmet - Security Headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: NODE_ENV === 'production' ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  } : false,
  crossOriginEmbedderPolicy: false, // Für WebSocket
}));

// 2. Request Logging (ohne sensitive Daten)
app.use(requestLoggerMiddleware(logger));

// 3. CORS mit Whitelist
app.use(createCorsMiddleware());

// 4. Body Parsing mit Limits
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    // Raw body für Webhook Signature Verification
    (req as any).rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// 5. Custom Security Headers
app.use(securityHeaders());

// =============================================================================
// Health Checks (ohne Auth - für Load Balancer)
// =============================================================================

// Health endpoints ohne Authentifizierung
app.use('/health', healthRouter);

// =============================================================================
// API Authentication
// =============================================================================

// Ab hier ist Authentifizierung erforderlich
app.use(requireAuth);

// =============================================================================
// Initialize Services
// =============================================================================

const redisClient = redisConnection as unknown as RedisClient;
const tokenTracker = createTokenTracker(redisClient);
const usageMiddleware = createUsageMiddleware(redisClient, tokenTracker);
const billingService = createBillingService(redisClient);
const metricsCollector = createMetricsCollector(redisClient);

// Apply Usage Tracking Middleware globally (nach Auth)
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

// =============================================================================
// API Routes (mit Validierung)
// =============================================================================

// Stats Routes
app.use('/api/stats', initializeStatsRoutes(tokenTracker, usageMiddleware));

// Job Routes mit Validation
app.use('/api/jobs', jobsRouter);

// Budget Routes
app.get('/api/budget/:userId', async (req, res) => {
  try {
    // Auth check: User kann nur eigenes Budget sehen
    const userId = req.params.userId;
    const requestingUser = req.user?.id || req.session?.userId;
    
    if (!requestingUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    // Admin darf alles sehen
    const isAdmin = req.user?.isAdmin;
    
    if (userId !== requestingUser && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
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
    logger.error('Error fetching budget', { error, userId: req.params.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch budget information',
    });
  }
});

app.put('/api/budget/:userId', 
  validateRequest(updateBudgetSchema),
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const requestingUser = req.user?.id || req.session?.userId;
      const isAdmin = req.user?.isAdmin;
      
      // Nur eigene Budgets oder Admin
      if (userId !== requestingUser && !isAdmin) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
      
      const { dailyLimit, weeklyLimit, monthlyLimit, currency } = req.body;

      await billingService.setBudget(userId, {
        dailyLimit,
        weeklyLimit,
        monthlyLimit,
        currency,
      });

      logger.info('Budget updated', { userId, dailyLimit, weeklyLimit, monthlyLimit });

      res.json({
        success: true,
        message: 'Budget configuration updated',
      });
    } catch (error) {
      logger.error('Error updating budget', { error, userId: req.params.userId });
      res.status(500).json({
        success: false,
        error: 'Failed to update budget configuration',
      });
    }
  }
);

app.get('/api/budget/:userId/invoice', 
  validateRequestCombined({ query: invoiceQuerySchema }),
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const { startDate, endDate, currency } = req.query as any;

      const invoice = await billingService.generateInvoice(
        userId,
        startDate,
        endDate,
        currency
      );

      res.json({
        success: true,
        data: invoice,
      });
    } catch (error) {
      logger.error('Error generating invoice', { error, userId: req.params.userId });
      res.status(500).json({
        success: false,
        error: 'Failed to generate invoice',
      });
    }
  }
);

// Rate Limit Status Route
app.get('/api/ratelimit/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const status = await usageMiddleware.getBudgetStatus(userId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Error fetching rate limit status', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rate limit status',
    });
  }
});

// Metrics Export Route (Admin only)
app.get('/api/metrics', requireAdmin, async (req, res) => {
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
    logger.error('Error exporting metrics', { error });
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
    logger.error('Error fetching pricing', { error });
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
      authentication: true,
    },
    documentation: '/',
  });
});

// =============================================================================
// Error Handling
// =============================================================================

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint nicht gefunden',
    path: req.path,
    method: req.method,
  });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Log error (ohne sensitive Daten)
  logger.error('Unhandled error', {
    error: err.message,
    name: err.name,
    path: req.path,
    method: req.method,
    status: err.status,
  });
  
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
    error: NODE_ENV === 'production' 
      ? 'Interner Serverfehler' 
      : err.message,
    ...(NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// =============================================================================
// Server Start
// =============================================================================

const server = app.listen(PORT, () => {
  logger.info(`MediSync Backend gestartet`, {
    port: PORT,
    environment: NODE_ENV,
  });
  
  console.log(`
╔══════════════════════════════════════════════════════════╗
║          MediSync Agenten-Plattform Backend              ║
╠══════════════════════════════════════════════════════════╣
║  Environment: ${NODE_ENV.padEnd(45)}║
║  API Server:  http://localhost:${PORT.toString().padEnd(33)}║
╠══════════════════════════════════════════════════════════╣
║  Security Features:                                      ║
║  ✅ Input Validation (Zod)                               ║
║  ✅ CORS Whitelist                                       ║
║  ✅ Authentication Required                              ║
║  ✅ Security Headers (Helmet)                            ║
║  ✅ Structured Logging (no PII)                          ║
║  ✅ Rate Limiting (60/min, 1000/hr, 10000/day)           ║
║  ✅ Budget Management ($5/day default)                   ║
║  ✅ XSS Protection                                       ║
╚══════════════════════════════════════════════════════════╝
  `);
});

// WebSocket Server starten
try {
  initializeWebSocketServer();
} catch (error) {
  logger.error('Fehler beim Starten des WebSocket Servers', { error });
}

// =============================================================================
// Graceful Shutdown
// =============================================================================

const gracefulShutdown = async (signal: string) => {
  logger.info(`Shutdown initiated`, { signal });

  // HTTP Server schließen
  server.close(() => {
    logger.info('HTTP Server geschlossen');
  });

  // Warte auf bestehende Verbindungen (max 30 Sekunden)
  const shutdownTimeout = setTimeout(() => {
    logger.error('Force shutdown nach Timeout');
    process.exit(1);
  }, 30000);

  try {
    // WebSocket Server schließen
    await closeWebSocketServer();

    // Queue-Verbindungen schließen
    await closeQueue();
    
    // Logger schließen
    await logger.close();

    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown abgeschlossen');
    process.exit(0);
  } catch (error) {
    logger.error('Fehler beim Shutdown', { error });
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
};

// Signal Handler
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled Promise Rejection Handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
});

// Uncaught Exception Handler
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { 
    error: error.message, 
    stack: error.stack 
  });
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Export für Tests
export default app;
export { tokenTracker, usageMiddleware, billingService, metricsCollector };
