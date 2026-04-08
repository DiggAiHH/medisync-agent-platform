/**
 * Input Validation Middleware
 * 
 * Zod-basierte Validierung für alle API-Eingaben
 * - XSS Prevention
 - Length Limits
 * - Type Safety
 * - Sanitization
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';

// ============================================
// Konstanten für Limits
// ============================================

export const VALIDATION_LIMITS = {
  // Prompt/Content Limits
  MAX_PROMPT_LENGTH: 10000,
  MIN_PROMPT_LENGTH: 1,
  MAX_CONTEXT_LENGTH: 50000,
  
  // ID Limits
  MAX_ID_LENGTH: 128,
  MIN_ID_LENGTH: 1,
  
  // String Limits
  MAX_STRING_LENGTH: 1000,
  MAX_DESCRIPTION_LENGTH: 5000,
  
  // Array Limits
  MAX_ARRAY_ITEMS: 100,
  
  // Numeric Limits
  MAX_COST_LIMIT: 10000,
  MAX_TOKEN_LIMIT: 10000000,
  
  // Pagination
  MAX_LIMIT: 1000,
  DEFAULT_LIMIT: 100,
} as const;

// ============================================
// XSS Prevention Helper
// ============================================

const XSS_PATTERNS = {
  script: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  event: /\s*on\w+\s*=\s*["']?[^"'>]+["']?/gi,
  javascript: /javascript:/gi,
  data: /data:/gi,
  iframe: /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
  object: /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
  embed: /<embed\b[^<]*[^>]*>/gi,
  link: /<link\b[^<]*[^>]*>/gi,
  style: /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
  meta: /<meta\b[^<]*[^>]*>/gi,
  base: /<base\b[^<]*[^>]*>/gi,
  form: /<form\b[^<]*[^>]*>/gi,
  input: /<input\b[^<]*[^>]*>/gi,
};

/**
 * Überprüft einen String auf XSS-Patterns
 */
export function containsXSS(input: string): boolean {
  for (const [name, pattern] of Object.entries(XSS_PATTERNS)) {
    if (pattern.test(input)) {
      return true;
    }
    // Reset regex lastIndex
    pattern.lastIndex = 0;
  }
  return false;
}

/**
 * Sanitisiert einen String gegen XSS
 */
export function sanitizeXSS(input: string): string {
  let sanitized = input;
  
  // Entferne gefährliche Tags und Attribute
  for (const [name, pattern] of Object.entries(XSS_PATTERNS)) {
    sanitized = sanitized.replace(pattern, '');
  }
  
  // HTML-Entities escapen
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
  
  return sanitized;
}

/**
 * Zod-Transform für XSS-Sanitization
 */
const sanitizedString = () => z.string().transform((val) => sanitizeXSS(val.trim()));

// ============================================
// UUID Validation Helper
// ============================================

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const uuidSchema = z.string().regex(uuidRegex, 'Ungültige UUID-Format');

// ============================================
// Job Schemas
// ============================================

export const createJobSchema = z.object({
  prompt: z.string()
    .min(VALIDATION_LIMITS.MIN_PROMPT_LENGTH, 'Prompt darf nicht leer sein')
    .max(VALIDATION_LIMITS.MAX_PROMPT_LENGTH, `Prompt zu lang (max ${VALIDATION_LIMITS.MAX_PROMPT_LENGTH} Zeichen)`)
    .refine((val) => !containsXSS(val), {
      message: 'Potenziell gefährlicher Inhalt erkannt',
    })
    .transform((val) => val.trim()),
  
  userId: z.string()
    .min(VALIDATION_LIMITS.MIN_ID_LENGTH)
    .max(VALIDATION_LIMITS.MAX_ID_LENGTH)
    .regex(/^[a-zA-Z0-9_-]+$/, 'UserId enthält ungültige Zeichen')
    .transform((val) => val.trim()),
  
  sessionId: z.string()
    .min(VALIDATION_LIMITS.MIN_ID_LENGTH)
    .max(VALIDATION_LIMITS.MAX_ID_LENGTH)
    .regex(/^[a-zA-Z0-9_-]+$/, 'SessionId enthält ungültige Zeichen')
    .transform((val) => val.trim()),
  
  context: z.string()
    .max(VALIDATION_LIMITS.MAX_CONTEXT_LENGTH, `Kontext zu lang (max ${VALIDATION_LIMITS.MAX_CONTEXT_LENGTH} Zeichen)`)
    .optional()
    .transform((val) => val ? sanitizeXSS(val.trim()) : val),
  
  model: z.enum(['gpt-4', 'gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini', 'o3-mini'])
    .optional(),
  
  priority: z.number().int().min(1).max(10).optional(),
  
  metadata: z.record(z.unknown()).optional(),
}).strict();

export const jobIdParamSchema = z.object({
  id: uuidSchema,
}).strict();

export const jobListQuerySchema = z.object({
  limit: z.string()
    .optional()
    .transform((val) => {
      const num = parseInt(val || String(VALIDATION_LIMITS.DEFAULT_LIMIT), 10);
      return Math.min(Math.max(num, 1), VALIDATION_LIMITS.MAX_LIMIT);
    }),
  
  status: z.enum(['pending', 'active', 'completed', 'failed', 'cancelled'])
    .optional(),
  
  userId: z.string()
    .max(VALIDATION_LIMITS.MAX_ID_LENGTH)
    .optional(),
  
  sessionId: z.string()
    .max(VALIDATION_LIMITS.MAX_ID_LENGTH)
    .optional(),
}).strict();

// ============================================
// Budget Schemas
// ============================================

export const updateBudgetSchema = z.object({
  dailyLimit: z.number()
    .min(0)
    .max(VALIDATION_LIMITS.MAX_COST_LIMIT)
    .optional(),
  
  weeklyLimit: z.number()
    .min(0)
    .max(VALIDATION_LIMITS.MAX_COST_LIMIT * 7)
    .optional(),
  
  monthlyLimit: z.number()
    .min(0)
    .max(VALIDATION_LIMITS.MAX_COST_LIMIT * 31)
    .optional(),
  
  currency: z.enum(['USD', 'EUR', 'GBP']).optional(),
}).strict().refine((data) => {
  return data.dailyLimit !== undefined || 
         data.weeklyLimit !== undefined || 
         data.monthlyLimit !== undefined ||
         data.currency !== undefined;
}, {
  message: 'Mindestens ein Limit oder Währung muss angegeben werden',
});

export const invoiceQuerySchema = z.object({
  startDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum muss im Format YYYY-MM-DD sein'),
  
  endDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum muss im Format YYYY-MM-DD sein'),
  
  currency: z.enum(['USD', 'EUR', 'GBP']).optional(),
}).strict().refine((data) => {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  return start <= end;
}, {
  message: 'startDate muss vor oder gleich endDate sein',
  path: ['startDate'],
});

// ============================================
// Stats Schemas
// ============================================

export const statsQuerySchema = z.object({
  days: z.string()
    .optional()
    .transform((val) => {
      const num = parseInt(val || '30', 10);
      return Math.min(Math.max(num, 1), 365);
    }),
  
  userId: z.string()
    .max(VALIDATION_LIMITS.MAX_ID_LENGTH)
    .optional(),
  
  sessionId: z.string()
    .max(VALIDATION_LIMITS.MAX_ID_LENGTH)
    .optional(),
  
  format: z.enum(['json', 'csv', 'prometheus']).optional(),
}).strict();

// ============================================
// Discord Schemas
// ============================================

export const discordUserIdSchema = z.string()
  .regex(/^\d{17,20}$/, 'Ungültige Discord User ID');

export const discordGuildIdSchema = z.string()
  .regex(/^\d{17,20}$/, 'Ungültige Discord Guild ID');

export const discordTokenSchema = z.string()
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'Ungültiges Token-Format');

// ============================================
// Generic Schemas
// ============================================

export const paginationSchema = z.object({
  page: z.string()
    .optional()
    .transform((val) => Math.max(parseInt(val || '1', 10), 1)),
  
  limit: z.string()
    .optional()
    .transform((val) => {
      const num = parseInt(val || String(VALIDATION_LIMITS.DEFAULT_LIMIT), 10);
      return Math.min(Math.max(num, 1), VALIDATION_LIMITS.MAX_LIMIT);
    }),
}).strict();

// ============================================
// Validation Middleware Factory
// ============================================

/**
 * Erstellt ein Validation Middleware für Express
 */
export function validateRequest<T extends ZodSchema>(
  schema: T,
  source: 'body' | 'params' | 'query' = 'body'
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = req[source];
      const validated = await schema.parseAsync(data);
      
      // Überschreibe mit validierten Daten
      req[source] = validated;
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        }));
        
        res.status(400).json({
          success: false,
          error: 'Validierungsfehler',
          details: issues,
        });
        return;
      }
      
      next(error);
    }
  };
}

/**
 * Kombinierte Validation für Body, Params und Query
 */
export function validateRequestCombined(
  schemas: {
    body?: ZodSchema;
    params?: ZodSchema;
    query?: ZodSchema;
  }
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const errors: Array<{ source: string; issues: any[] }> = [];
    
    try {
      if (schemas.body) {
        try {
          req.body = await schemas.body.parseAsync(req.body);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push({
              source: 'body',
              issues: error.issues.map((i) => ({
                path: i.path.join('.'),
                message: i.message,
              })),
            });
          }
        }
      }
      
      if (schemas.params) {
        try {
          req.params = await schemas.params.parseAsync(req.params);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push({
              source: 'params',
              issues: error.issues.map((i) => ({
                path: i.path.join('.'),
                message: i.message,
              })),
            });
          }
        }
      }
      
      if (schemas.query) {
        try {
          req.query = await schemas.query.parseAsync(req.query);
        } catch (error) {
          if (error instanceof ZodError) {
            errors.push({
              source: 'query',
              issues: error.issues.map((i) => ({
                path: i.path.join('.'),
                message: i.message,
              })),
            });
          }
        }
      }
      
      if (errors.length > 0) {
        res.status(400).json({
          success: false,
          error: 'Validierungsfehler',
          details: errors,
        });
        return;
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
}

// ============================================
// Security Headers Middleware
// ============================================

/**
 * Fügt Security Headers zu allen Responses hinzu
 */
export function securityHeaders() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // XSS Protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // HSTS (nur in Produktion)
    if (process.env.NODE_ENV === 'production') {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      );
    }
    
    // Content Security Policy
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' ws: wss:;"
    );
    
    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Permissions Policy
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()'
    );
    
    next();
  };
}

// ============================================
// Rate Limit Response Formatter
// ============================================

/**
 * Formatiert Rate Limit Fehler konsistent
 */
export function formatRateLimitError(
  retryAfter: number,
  limit: number
): object {
  return {
    success: false,
    error: 'Rate limit exceeded',
    retryAfter,
    limit,
    message: `Zu viele Anfragen. Bitte warten Sie ${retryAfter} Sekunden.`,
  };
}

// ============================================
// Export Types
// ============================================

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
export type InvoiceQueryInput = z.infer<typeof invoiceQuerySchema>;
export type StatsQueryInput = z.infer<typeof statsQuerySchema>;

export default {
  createJobSchema,
  jobIdParamSchema,
  jobListQuerySchema,
  updateBudgetSchema,
  invoiceQuerySchema,
  statsQuerySchema,
  discordUserIdSchema,
  discordGuildIdSchema,
  paginationSchema,
  validateRequest,
  validateRequestCombined,
  securityHeaders,
  containsXSS,
  sanitizeXSS,
  VALIDATION_LIMITS,
};
