/**
 * Structured Logging Utility
 * 
 * Features:
 * - JSON-structured logging
 * - PII Redaction
 * - Log Levels
 * - Log Rotation (via external tools)
 * - Async Logging
 * - Contextual Logging
 */

import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ============================================
// Types & Configuration
// ============================================

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  logDir: string;
  appName: string;
  redactFields: string[];
  maxObjectDepth: number;
  maxStringLength: number;
}

// ============================================
// Default Configuration
// ============================================

const DEFAULT_CONFIG: LoggerConfig = {
  level: (process.env.LOG_LEVEL as LogLevel) || 'info',
  enableConsole: process.env.NODE_ENV !== 'production',
  enableFile: process.env.NODE_ENV === 'production',
  logDir: process.env.LOG_DIR || './logs',
  appName: process.env.APP_NAME || 'medisync-backend',
  redactFields: [
    'password',
    'token',
    'secret',
    'apiKey',
    'api_key',
    'authorization',
    'cookie',
    'session',
    'discordToken',
    'discord_token',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'githubToken',
    'github_token',
    'privateKey',
    'private_key',
    'creditCard',
    'credit_card',
    'ssn',
    'sin',
    'email',  // Optional: je nach Compliance-Anforderungen
    'phone',  // Optional: je nach Compliance-Anforderungen
  ],
  maxObjectDepth: 5,
  maxStringLength: 1000,
};

// ============================================
// Log Levels
// ============================================

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

// ============================================
// PII Redaction
// ============================================

/**
 * Redaktion sensibler Daten
 */
export function redactSensitiveData(
  obj: unknown,
  redactFields: string[] = DEFAULT_CONFIG.redactFields,
  depth: number = 0,
  maxDepth: number = DEFAULT_CONFIG.maxObjectDepth
): unknown {
  // Max depth reached
  if (depth > maxDepth) {
    return '[Max Depth Reached]';
  }
  
  // Null/undefined
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  // String
  if (typeof obj === 'string') {
    // Prüfe ob der String selbst ein sensitive field name ist (im Key)
    return obj.length > DEFAULT_CONFIG.maxStringLength
      ? obj.substring(0, DEFAULT_CONFIG.maxStringLength) + '...[truncated]'
      : obj;
  }
  
  // Number, Boolean
  if (typeof obj !== 'object') {
    return obj;
  }
  
  // Array
  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveData(item, redactFields, depth + 1, maxDepth));
  }
  
  // Object
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    // Check if key should be redacted
    const shouldRedact = redactFields.some(
      (field) => key.toLowerCase().includes(field.toLowerCase())
    );
    
    if (shouldRedact && value !== undefined) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redactSensitiveData(value, redactFields, depth + 1, maxDepth);
    }
  }
  
  return result;
}

/**
 * Redaktion in Strings (für URLs, Queries, etc.)
 */
export function redactString(input: string): string {
  const patterns = [
    { regex: /(token=)[^&\s]+/gi, replacement: '$1[REDACTED]' },
    { regex: /(api[_-]?key=)[^&\s]+/gi, replacement: '$1[REDACTED]' },
    { regex: /(secret=)[^&\s]+/gi, replacement: '$1[REDACTED]' },
    { regex: /(password=)[^&\s]+/gi, replacement: '$1[REDACTED]' },
    { regex: /(Bearer\s+)[^\s]+/gi, replacement: '$1[REDACTED]' },
    { regex: /(Basic\s+)[^\s]+/gi, replacement: '$1[REDACTED]' },
  ];
  
  let result = input;
  for (const pattern of patterns) {
    result = result.replace(pattern.regex, pattern.replacement);
  }
  
  return result;
}

// ============================================
// Logger Class
// ============================================

export class Logger {
  private config: LoggerConfig;
  private fileStream?: ReturnType<typeof createWriteStream>;
  private isReady: boolean = false;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (this.config.enableFile) {
      this.initializeFileLogging();
    }
    
    this.isReady = true;
  }

  private initializeFileLogging(): void {
    try {
      // Ensure log directory exists
      if (!existsSync(this.config.logDir)) {
        mkdirSync(this.config.logDir, { recursive: true });
      }

      const logFile = join(this.config.logDir, `${this.config.appName}.log`);
      
      this.fileStream = createWriteStream(logFile, { flags: 'a' });
      
      this.fileStream.on('error', (err) => {
        console.error('Logger file stream error:', err);
        this.config.enableFile = false;
      });
    } catch (err) {
      console.error('Failed to initialize file logging:', err);
      this.config.enableFile = false;
    }
  }

  /**
   * Prüft ob ein Log-Level aktiv ist
   */
  private isLevelEnabled(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }

  /**
   * Erstellt einen Log-Eintrag
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    meta: Record<string, unknown> = {}
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: redactString(message),
      app: this.config.appName,
      pid: process.pid,
      ...redactSensitiveData(meta) as Record<string, unknown>,
    };

    return entry;
  }

  /**
   * Schreibt einen Log-Eintrag
   */
  private write(entry: LogEntry): void {
    const logLine = JSON.stringify(entry) + '\n';

    // Console output
    if (this.config.enableConsole) {
      const consoleMethod = this.getConsoleMethod(entry.level);
      consoleMethod(logLine.trim());
    }

    // File output
    if (this.config.enableFile && this.fileStream) {
      this.fileStream.write(logLine);
    }
  }

  /**
   * Wählt die passende Console-Methode
   */
  private getConsoleMethod(level: LogLevel): (...args: unknown[]) => void {
    switch (level) {
      case 'trace':
      case 'debug':
        return console.debug;
      case 'info':
        return console.info;
      case 'warn':
        return console.warn;
      case 'error':
      case 'fatal':
        return console.error;
      default:
        return console.log;
    }
  }

  // ============================================
  // Public Logging Methods
  // ============================================

  trace(message: string, meta?: Record<string, unknown>): void {
    if (!this.isLevelEnabled('trace')) return;
    this.write(this.createLogEntry('trace', message, meta));
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (!this.isLevelEnabled('debug')) return;
    this.write(this.createLogEntry('debug', message, meta));
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (!this.isLevelEnabled('info')) return;
    this.write(this.createLogEntry('info', message, meta));
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (!this.isLevelEnabled('warn')) return;
    this.write(this.createLogEntry('warn', message, meta));
  }

  error(message: string, meta?: Record<string, unknown>): void {
    if (!this.isLevelEnabled('error')) return;
    this.write(this.createLogEntry('error', message, meta));
  }

  fatal(message: string, meta?: Record<string, unknown>): void {
    if (!this.isLevelEnabled('fatal')) return;
    this.write(this.createLogEntry('fatal', message, meta));
  }

  // ============================================
  // Child Logger
  // ============================================

  /**
   * Erstellt einen Child-Logger mit festem Kontext
   */
  child(defaultMeta: Record<string, unknown>): Logger {
    const childConfig = {
      ...this.config,
    };
    
    const childLogger = new Logger(childConfig);
    
    // Override createLogEntry to include defaultMeta
    const originalCreateLogEntry = childLogger.createLogEntry.bind(childLogger);
    childLogger.createLogEntry = (
      level: LogLevel,
      message: string,
      meta: Record<string, unknown> = {}
    ): LogEntry => {
      return originalCreateLogEntry(level, message, {
        ...defaultMeta,
        ...meta,
      });
    };
    
    return childLogger;
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Loggt einen HTTP Request
   */
  logRequest(req: {
    method: string;
    url: string;
    headers?: Record<string, unknown>;
    ip?: string;
    userAgent?: string;
  }, meta?: Record<string, unknown>): void {
    this.info('HTTP Request', {
      method: req.method,
      url: redactString(req.url),
      ip: req.ip,
      userAgent: req.userAgent,
      ...meta,
    });
  }

  /**
   * Loggt einen HTTP Response
   */
  logResponse(res: {
    statusCode: number;
    duration: number;
  }, meta?: Record<string, unknown>): void {
    const level: LogLevel = res.statusCode >= 500 ? 'error' :
                           res.statusCode >= 400 ? 'warn' : 'info';
    
    this[level]('HTTP Response', {
      statusCode: res.statusCode,
      duration: res.duration,
      ...meta,
    });
  }

  /**
   * Loggt einen Security Event
   */
  logSecurity(event: string, meta?: Record<string, unknown>): void {
    this.warn(`Security: ${event}`, {
      type: 'security',
      ...meta,
    });
  }

  /**
   * Schließt den Logger
   */
  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.fileStream) {
        this.fileStream.end(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

// ============================================
// Singleton Instance
// ============================================

export const logger = new Logger();

// ============================================
// Request Context Middleware
// ============================================

import { Request, Response, NextFunction } from 'express';

export interface RequestContext {
  requestId: string;
  userId?: string;
  sessionId?: string;
}

/**
 * Middleware für Request-Kontext Logging
 */
export function requestLoggerMiddleware(
  loggerInstance: Logger = logger
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] as string ||
                     crypto.randomUUID();
    
    // Attach request ID to response
    res.setHeader('X-Request-Id', requestId);
    
    // Create child logger with request context
    const requestLogger = loggerInstance.child({
      requestId,
      userId: (req as any).user?.id,
      sessionId: (req as any).session?.sessionId,
    });
    
    // Attach logger to request
    (req as any).logger = requestLogger;
    
    // Log request
    requestLogger.logRequest({
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    
    // Log response on finish
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      requestLogger.logResponse({
        statusCode: res.statusCode,
        duration,
      });
    });
    
    next();
  };
}

// ============================================
// Async Context Storage (für automatischen Kontext)
// ============================================

import { AsyncLocalStorage } from 'async_hooks';

const asyncStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Wrapper für Async Context
 */
export function runWithContext<T>(
  context: RequestContext,
  fn: () => T
): T {
  return asyncStorage.run(context, fn);
}

/**
 * Holt den aktuellen Request-Kontext
 */
export function getCurrentContext(): RequestContext | undefined {
  return asyncStorage.getStore();
}

// ============================================
// Error Logging
// ============================================

/**
 * Loggt einen Error mit Stack Trace
 */
export function logError(
  error: Error,
  context?: Record<string, unknown>,
  loggerInstance: Logger = logger
): void {
  loggerInstance.error(error.message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...context,
  });
}

// ============================================
// Performance Logging
// ============================================

export class PerformanceLogger {
  private logger: Logger;
  private timers: Map<string, number> = new Map();

  constructor(loggerInstance: Logger = logger) {
    this.logger = loggerInstance;
  }

  start(label: string): void {
    this.timers.set(label, performance.now());
  }

  end(label: string, meta?: Record<string, unknown>): number {
    const startTime = this.timers.get(label);
    
    if (!startTime) {
      this.logger.warn(`Timer '${label}' not found`);
      return 0;
    }
    
    const duration = Math.round(performance.now() - startTime);
    this.timers.delete(label);
    
    this.logger.debug(`Performance: ${label}`, {
      label,
      duration,
      ...meta,
    });
    
    return duration;
  }
}

// ============================================
// Export
// ============================================

export default {
  Logger,
  logger,
  PerformanceLogger,
  requestLoggerMiddleware,
  runWithContext,
  getCurrentContext,
  logError,
  redactSensitiveData,
  redactString,
};

// Node.js crypto import for UUID generation
import crypto from 'crypto';
