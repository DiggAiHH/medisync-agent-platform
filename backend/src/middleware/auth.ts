/**
 * Authentication & Authorization Middleware
 * 
 * Features:
 * - Discord OAuth2 User Verification
 * - Session Token Validation
 * - JWT API Authentication
 * - Role-Based Access Control (RBAC)
 * - API Key Authentication
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { logger } from '../utils/logger';

// ============================================
// Types & Interfaces
// ============================================

export interface AuthenticatedUser {
  id: string;
  username: string;
  discriminator?: string;
  avatar?: string;
  email?: string;
  roles: string[];
  guilds?: string[];
  isAdmin: boolean;
}

export interface SessionData {
  userId: string;
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  userAgent?: string;
  ip?: string;
}

export interface JWTPayload {
  sub: string; // User ID
  username: string;
  roles: string[];
  iat: number;
  exp: number;
  jti: string; // JWT ID
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      session?: SessionData;
      apiKey?: {
        keyId: string;
        permissions: string[];
      };
    }
  }
}

// ============================================
// Configuration
// ============================================

export const AUTH_CONFIG = {
  // Session
  SESSION_TIMEOUT_MS: 30 * 60 * 1000, // 30 Minuten
  SESSION_SECRET: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  
  // JWT
  JWT_SECRET: process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
  JWT_EXPIRY_SECONDS: 3600, // 1 Stunde
  
  // API Key
  API_KEY_HEADER: 'X-API-Key',
  
  // Discord
  DISCORD_API_BASE: 'https://discord.com/api/v10',
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  ALLOWED_GUILD_IDS: process.env.ALLOWED_GUILD_IDS?.split(',') || [],
  ADMIN_USER_IDS: process.env.ADMIN_USER_IDS?.split(',') || [],
};

// ============================================
// Session Store (In-Memory mit Redis-Option)
// ============================================

class SessionStore {
  private sessions: Map<string, SessionData> = new Map();
  private userSessions: Map<string, Set<string>> = new Map();
  
  /**
   * Erstellt eine neue Session
   */
  create(userId: string, userAgent?: string, ip?: string): SessionData {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    
    const session: SessionData = {
      userId,
      sessionId,
      createdAt: now,
      expiresAt: now + AUTH_CONFIG.SESSION_TIMEOUT_MS,
      userAgent,
      ip,
    };
    
    this.sessions.set(sessionId, session);
    
    // Track user sessions
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId)!.add(sessionId);
    
    logger.debug('Session created', { userId, sessionId });
    return session;
  }
  
  /**
   * Holt eine Session
   */
  get(sessionId: string): SessionData | undefined {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return undefined;
    }
    
    // Prüfe Ablauf
    if (Date.now() > session.expiresAt) {
      this.delete(sessionId);
      return undefined;
    }
    
    return session;
  }
  
  /**
   * Verlängert eine Session
   */
  extend(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return false;
    }
    
    session.expiresAt = Date.now() + AUTH_CONFIG.SESSION_TIMEOUT_MS;
    return true;
  }
  
  /**
   * Löscht eine Session
   */
  delete(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    
    if (session) {
      this.sessions.delete(sessionId);
      this.userSessions.get(session.userId)?.delete(sessionId);
      logger.debug('Session deleted', { sessionId });
      return true;
    }
    
    return false;
  }
  
  /**
   * Löscht alle Sessions eines Users
   */
  deleteAllForUser(userId: string): number {
 const sessionIds = this.userSessions.get(userId);
    
    if (!sessionIds) {
      return 0;
    }
    
    let count = 0;
    for (const sessionId of sessionIds) {
      this.sessions.delete(sessionId);
      count++;
    }
    
    this.userSessions.delete(userId);
    logger.info('All sessions deleted for user', { userId, count });
    return count;
  }
  
  /**
   * Bereinigt abgelaufene Sessions
   */
  cleanup(): number {
    const now = Date.now();
    let count = 0;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.delete(sessionId);
        count++;
      }
    }
    
    if (count > 0) {
      logger.info('Expired sessions cleaned up', { count });
    }
    
    return count;
  }
}

export const sessionStore = new SessionStore();

// ============================================
// Discord User Verification
// ============================================

/**
 * Verifiziert einen Discord User Token
 */
export async function verifyDiscordUser(
  accessToken: string
): Promise<AuthenticatedUser | null> {
  try {
    const response = await fetch(`${AUTH_CONFIG.DISCORD_API_BASE}/users/@me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    if (!response.ok) {
      logger.warn('Discord user verification failed', { status: response.status });
      return null;
    }
    
    const data = await response.json();
    
    // Prüfe ob User in erlaubten Guilds ist (falls konfiguriert)
    if (AUTH_CONFIG.ALLOWED_GUILD_IDS.length > 0) {
      const guildsResponse = await fetch(`${AUTH_CONFIG.DISCORD_API_BASE}/users/@me/guilds`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      
      if (guildsResponse.ok) {
        const guilds = await guildsResponse.json();
        const userGuildIds = guilds.map((g: any) => g.id);
        
        const hasAllowedGuild = AUTH_CONFIG.ALLOWED_GUILD_IDS.some(
          id => userGuildIds.includes(id)
        );
        
        if (!hasAllowedGuild) {
          logger.warn('User not in allowed guilds', { userId: (data as { id: string }).id });
          return null;
        }
        
        data.guilds = userGuildIds;
      }
    }
    
    const user: AuthenticatedUser = {
      id: data.id,
      username: data.username,
      discriminator: data.discriminator,
      avatar: data.avatar,
      email: data.email,
      roles: [],
      guilds: data.guilds,
      isAdmin: AUTH_CONFIG.ADMIN_USER_IDS.includes(data.id),
    };
    
    return user;
  } catch (error) {
    logger.error('Error verifying Discord user', { error });
    return null;
  }
}

/**
 * Verifiziert Discord Bot Token (für Server-zu-Server)
 */
export async function verifyDiscordBotToken(token: string): Promise<boolean> {
  // Einfache Prüfung: Token-Format
  const tokenPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  
  if (!tokenPattern.test(token)) {
    return false;
  }
  
  // In Produktion: Gegen Discord API validieren
  if (process.env.NODE_ENV === 'production') {
    try {
      const response = await fetch(`${AUTH_CONFIG.DISCORD_API_BASE}/users/@me`, {
        headers: {
          Authorization: `Bot ${token}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  
  return true;
}

// ============================================
// JWT Handling
// ============================================

/**
 * Erstellt ein JWT Token
 */
export function createJWT(user: AuthenticatedUser): string {
  const now = Math.floor(Date.now() / 1000);
  const jti = crypto.randomUUID();
  
  const payload: JWTPayload = {
    sub: user.id,
    username: user.username,
    roles: user.roles,
    iat: now,
    exp: now + AUTH_CONFIG.JWT_EXPIRY_SECONDS,
    jti,
  };
  
  // Einfache JWT-Implementierung (für Produktion: jsonwebtoken library verwenden)
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', AUTH_CONFIG.JWT_SECRET)
    .update(`${header}.${payloadB64}`)
    .digest('base64url');
  
  return `${header}.${payloadB64}.${signature}`;
}

/**
 * Verifiziert ein JWT Token
 */
export function verifyJWT(token: string): JWTPayload | null {
  try {
    const [header, payload, signature] = token.split('.');
    
    if (!header || !payload || !signature) {
      return null;
    }
    
    // Signatur prüfen
    const expectedSignature = crypto
      .createHmac('sha256', AUTH_CONFIG.JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url');
    
    if (signature !== expectedSignature) {
      return null;
    }
    
    // Payload parsen
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as JWTPayload;
    
    // Ablauf prüfen
    if (Date.now() / 1000 > decoded.exp) {
      return null;
    }
    
    return decoded;
  } catch {
    return null;
  }
}

// ============================================
// API Key Management
// ============================================

class APIKeyStore {
  private keys: Map<string, { permissions: string[]; createdAt: number }> = new Map();
  
  /**
   * Erstellt einen neuen API Key
   */
  create(permissions: string[] = ['read']): { keyId: string; key: string } {
    const keyId = crypto.randomBytes(16).toString('hex');
    const keySecret = crypto.randomBytes(32).toString('hex');
    const key = `${keyId}.${keySecret}`;
    
    // Hash für Speicherung
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    
    this.keys.set(keyHash, {
      permissions,
      createdAt: Date.now(),
    });
    
    logger.info('API key created', { keyId });
    return { keyId, key };
  }
  
  /**
   * Verifiziert einen API Key
   */
  verify(key: string): { keyId: string; permissions: string[] } | null {
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    const stored = this.keys.get(keyHash);
    
    if (!stored) {
      return null;
    }
    
    const keyId = key.split('.')[0];
    return {
      keyId,
      permissions: stored.permissions,
    };
  }
  
  /**
   * Löscht einen API Key
   */
  revoke(keyId: string): boolean {
    for (const [hash, data] of this.keys.entries()) {
      if (hash.startsWith(keyId)) {
        this.keys.delete(hash);
        logger.info('API key revoked', { keyId });
        return true;
      }
    }
    return false;
  }
}

export const apiKeyStore = new APIKeyStore();

// ============================================
// Middlewares
// ============================================

/**
 * Session-basierte Authentifizierung
 */
export function requireSession(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const sessionId = req.headers['x-session-id'] as string ||
                   req.cookies?.sessionId;
  
  if (!sessionId) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'NO_SESSION',
    });
    return;
  }
  
  const session = sessionStore.get(sessionId);
  
  if (!session) {
    res.status(401).json({
      success: false,
      error: 'Session expired or invalid',
      code: 'INVALID_SESSION',
    });
    return;
  }
  
  // Session verlängern
  sessionStore.extend(sessionId);
  
  req.session = session;
  next();
}

/**
 * JWT-basierte Authentifizierung
 */
export function requireJWT(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'Bearer token required',
      code: 'NO_TOKEN',
    });
    return;
  }
  
  const token = authHeader.substring(7);
  const payload = verifyJWT(token);
  
  if (!payload) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
      code: 'INVALID_TOKEN',
    });
    return;
  }
  
  req.user = {
    id: payload.sub,
    username: payload.username,
    roles: payload.roles,
    isAdmin: payload.roles.includes('admin'),
  };
  
  next();
}

/**
 * API Key Authentifizierung
 */
export function requireAPIKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const apiKey = req.headers[AUTH_CONFIG.API_KEY_HEADER.toLowerCase()] as string;
  
  if (!apiKey) {
    res.status(401).json({
      success: false,
      error: 'API key required',
      code: 'NO_API_KEY',
    });
    return;
  }
  
  const keyData = apiKeyStore.verify(apiKey);
  
  if (!keyData) {
    logger.warn('Invalid API key attempt', { ip: req.ip });
    res.status(401).json({
      success: false,
      error: 'Invalid API key',
      code: 'INVALID_API_KEY',
    });
    return;
  }
  
  req.apiKey = keyData;
  next();
}

/**
 * Discord Token Authentifizierung (für Bot-to-API)
 */
export async function requireDiscordAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Discord ')) {
    res.status(401).json({
      success: false,
      error: 'Discord authentication required',
      code: 'NO_DISCORD_AUTH',
    });
    return;
  }
  
  const token = authHeader.substring(8);
  const user = await verifyDiscordUser(token);
  
  if (!user) {
    res.status(401).json({
      success: false,
      error: 'Invalid Discord token',
      code: 'INVALID_DISCORD_TOKEN',
    });
    return;
  }
  
  req.user = user;
  next();
}

/**
 * Rolle-basierte Autorisierung
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    
    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }
    
    // Admin hat immer Zugriff
    if (user.isAdmin) {
      next();
      return;
    }
    
    const hasRole = allowedRoles.some(role => user.roles.includes(role));
    
    if (!hasRole) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        requiredRoles: allowedRoles,
      });
      return;
    }
    
    next();
  };
}

/**
 * Admin-Only Middleware
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = req.user;
  
  if (!user || !user.isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Admin access required',
    });
    return;
  }
  
  next();
}

// ============================================
// Combined Auth Middleware
// ============================================

/**
 * Kombinierte Authentifizierung (versucht mehrere Methoden)
 * Reihenfolge: Session -> JWT -> API Key
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // 1. Session versuchen
  const sessionId = req.headers['x-session-id'] as string || req.cookies?.sessionId;
  if (sessionId) {
    const session = sessionStore.get(sessionId);
    if (session) {
      req.session = session;
      sessionStore.extend(sessionId);
      next();
      return;
    }
  }
  
  // 2. JWT versuchen
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyJWT(token);
    if (payload) {
      req.user = {
        id: payload.sub,
        username: payload.username,
        roles: payload.roles,
        isAdmin: payload.roles.includes('admin'),
      };
      next();
      return;
    }
  }
  
  // 3. API Key versuchen
  const apiKey = req.headers[AUTH_CONFIG.API_KEY_HEADER.toLowerCase()] as string;
  if (apiKey) {
    const keyData = apiKeyStore.verify(apiKey);
    if (keyData) {
      req.apiKey = keyData;
      next();
      return;
    }
  }
  
  // Keine gültige Authentifizierung
  res.status(401).json({
    success: false,
    error: 'Authentication required',
    code: 'AUTH_REQUIRED',
  });
}

// ============================================
// Export
// ============================================

export default {
  sessionStore,
  apiKeyStore,
  verifyDiscordUser,
  verifyDiscordBotToken,
  createJWT,
  verifyJWT,
  requireSession,
  requireJWT,
  requireAPIKey,
  requireDiscordAuth,
  requireRole,
  requireAdmin,
  requireAuth,
  AUTH_CONFIG,
};
