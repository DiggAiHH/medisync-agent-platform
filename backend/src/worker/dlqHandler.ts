/**
 * Dead Letter Queue Handler
 * 
 * Standalone Service zur Verwaltung fehlgeschlagener Jobs.
 * - Sammelt fehlgeschlagene Jobs
- Sendet Benachrichtigungen
 * - Bereinigt alte Einträge
 */

import { redisConnection, agentQueue, isMemoryQueue } from '../queue/agentQueue';

const DLQ_ENABLED = process.env.DLQ_ENABLED === 'true';
const DLQ_RETENTION_DAYS = parseInt(process.env.DLQ_RETENTION_DAYS || '30', 10);
const NOTIFICATION_WEBHOOK = process.env.NOTIFICATION_WEBHOOK_URL;

/**
 * DLQ Handler Klasse
 */
class DLQHandler {
  private isRunning = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Starte den DLQ Handler
   */
  async start(): Promise<void> {
    if (!DLQ_ENABLED) {
      console.log('📦 DLQ Handler ist deaktiviert');
      return;
    }

    console.log(`
╔══════════════════════════════════════════════════════════╗
║          Dead Letter Queue Handler                       ║
╠══════════════════════════════════════════════════════════╣
║  Retention: ${DLQ_RETENTION_DAYS} Tage                                    ║
║  Webhook:  ${NOTIFICATION_WEBHOOK ? 'Aktiviert' : 'Deaktiviert'}                          ║
╚══════════════════════════════════════════════════════════╝
    `);

    this.isRunning = true;

    // Prüfe fehlgeschlagene Jobs alle 30 Sekunden
    this.checkInterval = setInterval(async () => {
      await this.processFailedJobs();
    }, 30000);

    // Bereinige alte Einträge täglich
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupOldEntries();
    }, 24 * 60 * 60 * 1000);

    // Sofortige erste Prüfung
    await this.processFailedJobs();
  }

  /**
   * Stoppe den DLQ Handler
   */
  async stop(): Promise<void> {
    console.log('📦 Stoppe DLQ Handler...');
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    this.isRunning = false;
    console.log('📦 DLQ Handler gestoppt');
  }

  /**
   * Verarbeite fehlgeschlagene Jobs
   */
  private async processFailedJobs(): Promise<void> {
    try {
      const failedJobs = await agentQueue.getFailed(0, 100);
      
      if (failedJobs.length === 0) return;

      console.log(`📦 ${failedJobs.length} fehlgeschlagene Jobs gefunden`);

      for (const job of failedJobs) {
        await this.handleFailedJob(job);
      }
    } catch (error) {
      console.error('❌ Fehler beim Verarbeiten der DLQ:', error);
    }
  }

  /**
   * Behandle einen einzelnen fehlgeschlagenen Job
   */
  private async handleFailedJob(job: any): Promise<void> {
    const jobId = job.id;
    const failedReason = job.failedReason;
    const attemptsMade = job.attemptsMade || 0;
    
    // Prüfe ob bereits in DLQ
    const redis = isMemoryQueue ? redisConnection as any : redisConnection;
    const exists = await redis.sismember('dlq:job_ids', jobId);
    if (exists) return;

    // Erstelle DLQ Eintrag
    const dlqEntry = {
      jobId,
      data: job.data,
      error: failedReason,
      attempts: attemptsMade,
      failedAt: new Date().toISOString(),
      retryable: this.isRetryableError(failedReason)
    };

    // Speichere in Sorted Set (nach Timestamp sortiert)
    await redis.zadd('dlq:jobs', Date.now(), JSON.stringify(dlqEntry));
    
    // Füge zu Job IDs Set hinzu
    await redis.sadd('dlq:job_ids', jobId);
    
    // Setze TTL
    await redis.expire('dlq:jobs', DLQ_RETENTION_DAYS * 24 * 3600);
    await redis.expire('dlq:job_ids', DLQ_RETENTION_DAYS * 24 * 3600);

    console.log(`📦 Job ${jobId} zur DLQ hinzugefügt`);

    // Sende Benachrichtigung
    await this.sendNotification(dlqEntry);
  }

  /**
   * Prüfe ob Fehler retry-bar ist
   */
  private isRetryableError(error: string): boolean {
    const nonRetryableErrors = [
      'INVALID_TOKEN',
      'RATE_LIMIT_EXCEEDED',
      'UNRECOVERABLE_ERROR',
      'UNAUTHORIZED',
      'FORBIDDEN'
    ];
    return !nonRetryableErrors.some(e => error?.includes(e));
  }

  /**
   * Sende Benachrichtigung
   */
  private async sendNotification(entry: any): Promise<void> {
    if (!NOTIFICATION_WEBHOOK) return;

    try {
      const response = await fetch(NOTIFICATION_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'dlq_job_failed',
          jobId: entry.jobId,
          error: entry.error,
          retryable: entry.retryable,
          attempts: entry.attempts,
          timestamp: entry.failedAt
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Fehler beim Senden der Benachrichtigung:', error);
    }
  }

  /**
   * Bereinige alte Einträge
   */
  private async cleanupOldEntries(): Promise<void> {
    try {
      const cutoffTime = Date.now() - (DLQ_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      
      // Entferne alte Einträge aus Sorted Set
      const redis = isMemoryQueue ? redisConnection as any : redisConnection;
      const removed = await redis.zremrangebyscore('dlq:jobs', 0, cutoffTime);
      
      if (removed > 0) {
        console.log(`📦 ${removed} alte DLQ Einträge bereinigt`);
      }
    } catch (error) {
      console.error('❌ Fehler beim Bereinigen der DLQ:', error);
    }
  }

  /**
   * Hole DLQ Statistiken
   */
  async getStats(): Promise<{
    totalFailed: number;
    inDLQ: number;
    retryable: number;
  }> {
    const redis = isMemoryQueue ? redisConnection as any : redisConnection;
    const failedJobs = await agentQueue.getFailed(0, 1000);
    const dlqJobs = await redis.zrange('dlq:jobs', 0, -1);
    
    let retryableCount = 0;
    for (const jobStr of dlqJobs) {
      const job = JSON.parse(jobStr);
      if (job.retryable) retryableCount++;
    }

    return {
      totalFailed: failedJobs.length,
      inDLQ: dlqJobs.length,
      retryable: retryableCount
    };
  }
}

// Singleton Instance
const dlqHandler = new DLQHandler();

/**
 * Hauptfunktion
 */
async function main(): Promise<void> {
  await dlqHandler.start();

  // Graceful Shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n⚠️  ${signal} empfangen. Stoppe DLQ Handler...`);
    await dlqHandler.stop();
    console.log('✅ DLQ Handler beendet');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Starte Handler
main().catch((error) => {
  console.error('❌ Fehler beim Starten des DLQ Handlers:', error);
  process.exit(1);
});

export { DLQHandler, dlqHandler };
