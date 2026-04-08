import { UserSession } from '../types';

/**
 * Manages user sessions for the agent interactions
 */
export class SessionManager {
  private sessions: Map<string, UserSession> = new Map();
  private userSessionMap: Map<string, string> = new Map(); // Maps userId to sessionId
  private readonly sessionTimeoutMs: number = 30 * 60 * 1000; // 30 minutes

  /**
   * Create a new session for a user
   */
  public createSession(userId: string, channelId: string, messageId: string, interactionToken?: string): UserSession {
    // Close existing session if any
    this.closeSessionByUserId(userId);

    const sessionId = this.generateSessionId();
    const now = Date.now();

    const session: UserSession = {
      sessionId,
      userId,
      channelId,
      messageId,
      interactionToken,
      createdAt: now,
      lastActivity: now
    };

    this.sessions.set(sessionId, session);
    this.userSessionMap.set(userId, sessionId);

    console.log(`[SessionManager] Created session ${sessionId} for user ${userId}`);
    return session;
  }

  /**
   * Get session by ID
   */
  public getSession(sessionId: string): UserSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
    return session;
  }

  /**
   * Get session by user ID
   */
  public getSessionByUserId(userId: string): UserSession | undefined {
    const sessionId = this.userSessionMap.get(userId);
    if (sessionId) {
      return this.getSession(sessionId);
    }
    return undefined;
  }

  /**
   * Update session with thread ID
   */
  public setThreadId(sessionId: string, threadId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.threadId = threadId;
      session.lastActivity = Date.now();
    }
  }

  /**
   * Update session with job ID
   */
  public setJobId(sessionId: string, jobId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.jobId = jobId;
      session.lastActivity = Date.now();
      console.log(`[SessionManager] JobId ${jobId} linked to session ${sessionId}`);
    }
  }

  /**
   * Update session with interaction token (for editing ephemeral messages)
   */
  public setInteractionToken(sessionId: string, token: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.interactionToken = token;
      session.lastActivity = Date.now();
    }
  }

  /**
   * Get session by job ID
   */
  public getSessionByJobId(jobId: string): UserSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.jobId === jobId) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Close a session
   */
  public closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.userSessionMap.delete(session.userId);
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Close session by user ID
   */
  public closeSessionByUserId(userId: string): void {
    const sessionId = this.userSessionMap.get(userId);
    if (sessionId) {
      this.closeSession(sessionId);
    }
  }

  /**
   * Clean up expired sessions
   */
  public cleanup(): void {
    const now = Date.now();
    const sessionsToClose: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.sessionTimeoutMs) {
        sessionsToClose.push(sessionId);
      }
    }

    for (const sessionId of sessionsToClose) {
      this.closeSession(sessionId);
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

// Singleton instance
export const sessionManager = new SessionManager();
