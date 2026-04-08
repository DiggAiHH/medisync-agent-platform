/**
 * CORS (Cross-Origin Resource Sharing) Middleware
 * 
 * Konfiguration:
 * - Whitelist-basierte Origin-Prüfung
 * - Credentials Support
 * - Preflight Handling
 * - Sichere Header
 */

import { Request, Response, NextFunction } from 'express';

// ============================================
// CORS Configuration Types
// ============================================

export interface CorsOptions {
  /** Erlaubte Origins (exakt oder Regex-Pattern) */
  allowedOrigins: (string | RegExp)[];
  /** Erlaubte HTTP-Methoden */
  allowedMethods: string[];
  /** Erlaubte Header */
  allowedHeaders: string[];
  /** Exposed Headers */
  exposedHeaders: string[];
  /** Credentials (Cookies/Auth-Header) erlaubt */
  credentials: boolean;
  /** Preflight Cache-Dauer in Sekunden */
  maxAge: number;
  /** Custom Origin Check Funktion */
  originChecker?: (origin: string, req: Request) => boolean;
}

// ============================================
// Default Configuration
// ============================================

const DEFAULT_OPTIONS: CorsOptions = {
  allowedOrigins: [],
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-User-Id',
    'X-Session-Id',
    'X-API-Key',
    'Accept',
    'Accept-Language',
    'Accept-Encoding',
    'Origin',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-Id',
  ],
  credentials: true,
  maxAge: 86400, // 24 Stunden
};

// ============================================
// Environment-based Configuration
// ============================================

/**
 * Lädt CORS-Konfiguration aus Environment Variables
 */
export function loadCorsConfig(): CorsOptions {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  // Parse ALLOWED_ORIGINS aus Environment
  const envOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [];
  
  const options: CorsOptions = {
    ...DEFAULT_OPTIONS,
    allowedOrigins: envOrigins.length > 0 ? envOrigins : getDefaultOrigins(nodeEnv),
    credentials: process.env.CORS_CREDENTIALS !== 'false',
    maxAge: parseInt(process.env.CORS_MAX_AGE || '86400', 10),
  };
  
  return options;
}

/**
 * Gibt Default-Origins basierend auf Umgebung zurück
 */
function getDefaultOrigins(nodeEnv: string): (string | RegExp)[] {
  if (nodeEnv === 'development') {
    return [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173', // Vite dev server
      'http://localhost:8080',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      // Discord CDN für Assets
      /^https:\/\/cdn\.discordapp\.com$/,
    ];
  }
  
  // Produktion: Keine Defaults - müssen explizit konfiguriert werden
  return [];
}

// ============================================
// Origin Validation
// ============================================

/**
 * Prüft ob ein Origin erlaubt ist
 */
export function isOriginAllowed(
  origin: string,
  allowedOrigins: (string | RegExp)[]
): boolean {
  // Leerer Origin (z.B. Postman, curl) - nur in Development erlauben
  if (!origin || origin === 'null') {
    return process.env.NODE_ENV === 'development';
  }
  
  for (const allowed of allowedOrigins) {
    if (typeof allowed === 'string') {
      // Exakter Match
      if (origin.toLowerCase() === allowed.toLowerCase()) {
        return true;
      }
    } else if (allowed instanceof RegExp) {
      // Regex Match
      if (allowed.test(origin)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Loggt CORS-Verstöße für Monitoring
 */
function logCorsViolation(origin: string, path: string, userAgent?: string): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    type: 'CORS_VIOLATION',
    origin,
    path,
    userAgent,
    ip: 'unknown', // Wird vom Middleware-Context ergänzt
  };
  
  // In Produktion: An SIEM/Monitoring senden
  if (process.env.NODE_ENV === 'production') {
    console.error(`[SECURITY] CORS Violation: ${origin} attempted to access ${path}`);
  }
}

// ============================================
// CORS Middleware
// ============================================

/**
 * Erstellt die CORS Middleware
 */
export function createCorsMiddleware(options: Partial<CorsOptions> = {}) {
  const config: CorsOptions = {
    ...loadCorsConfig(),
    ...options,
  };
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    const method = req.method;
    
    // Preflight Request (OPTIONS)
    if (method === 'OPTIONS') {
      handlePreflight(req, res, config, origin);
      return;
    }
    
    // Normaler Request
    handleCors(req, res, config, origin);
    next();
  };
}

/**
 * Handhabt Preflight (OPTIONS) Requests
 */
function handlePreflight(
  req: Request,
  res: Response,
  config: CorsOptions,
  origin?: string
): void {
  // Origin prüfen
  const originAllowed = !origin || isOriginAllowed(origin, config.allowedOrigins);
  
  if (!originAllowed) {
    logCorsViolation(origin || 'null', req.path, req.headers['user-agent']);
    res.status(403).json({
      success: false,
      error: 'Origin not allowed',
    });
    return;
  }
  
  // Preflight-Headers setzen
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', config.allowedMethods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
  res.setHeader('Access-Control-Expose-Headers', config.exposedHeaders.join(', '));
  res.setHeader('Access-Control-Max-Age', config.maxAge.toString());
  
  if (config.credentials) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  // 204 No Content für Preflight
  res.status(204).send();
}

/**
 * Handhabt normale CORS Requests
 */
function handleCors(
  req: Request,
  res: Response,
  config: CorsOptions,
  origin?: string
): void {
  // Origin prüfen
  const originAllowed = !origin || isOriginAllowed(origin, config.allowedOrigins);
  
  if (!originAllowed) {
    logCorsViolation(origin || 'null', req.path, req.headers['user-agent']);
    // Bei nicht erlaubtem Origin trotzdem fortfahren (Browser blockiert client-seitig)
    // aber nicht die CORS-Headers setzen
    return;
  }
  
  // Vary Header setzen (wichtig für Caching)
  res.setHeader('Vary', 'Origin');
  
  // CORS-Headers setzen
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Expose-Headers', config.exposedHeaders.join(', '));
  
  if (config.credentials) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}

// ============================================
// Strict CORS Middleware
// ============================================

/**
 * Strikte CORS Middleware die bei Verstoß blockiert
 * Verwendung für sensible Endpunkte
 */
export function createStrictCorsMiddleware(options: Partial<CorsOptions> = {}) {
  const config: CorsOptions = {
    ...loadCorsConfig(),
    ...options,
  };
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    const method = req.method;
    
    // Preflight Request
    if (method === 'OPTIONS') {
      handlePreflight(req, res, config, origin);
      return;
    }
    
    // Origin strikt prüfen
    if (origin && !isOriginAllowed(origin, config.allowedOrigins)) {
      logCorsViolation(origin, req.path, req.headers['user-agent']);
      res.status(403).json({
        success: false,
        error: 'Forbidden: Origin not allowed',
      });
      return;
    }
    
    handleCors(req, res, config, origin);
    next();
  };
}

// ============================================
// Export
// ============================================

export default {
  createCorsMiddleware,
  createStrictCorsMiddleware,
  loadCorsConfig,
  isOriginAllowed,
  DEFAULT_OPTIONS,
};
