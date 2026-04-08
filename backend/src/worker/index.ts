/**
 * Worker Entry Point
 * 
 * Startet den BullMQ Worker für die Verarbeitung von Agent-Jobs.
 * Inklusive Dead Letter Queue Handling und Graceful Shutdown.
 * 
 * HINWEIS: Im Memory-Queue-Mode wird der Worker automatisch im
 * Hauptprozess gestartet (siehe server.ts). Dieses Script ist dann
 * nicht erforderlich.
 */

import { createWorker, stopWorker, getWorkerStats } from './agentWorker';
import { redisConnection, agentQueue, isMemoryQueue } from '../queue/agentQueue';

// Beende sofort im Memory-Queue-Mode
if (isMemoryQueue) {
  console.log('🧠 Memory Queue Mode - Worker läuft im Hauptprozess');
  console.log('⏹️  Worker-Prozess nicht erforderlich. Beende...');
  process.exit(0);
}

// Konfiguration
const DLQ_ENABLED = process.env.DLQ_ENABLED === 'true';
const DLQ_RETENTION_DAYS = parseInt(process.env.DLQ_RETENTION_DAYS || '30', 10);
const DLQ_QUEUE_NAME = `${process.env.QUEUE_NAME || 'agent-jobs'}-failed`;

/**
 * Dead Letter Queue Handler
 * Verarbeitet fehlgeschlagene Jobs
 */
class DeadLetterQueueHandler {
  private isRunning = false;
  private checkInterval: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    if (!DLQ_ENABLED || this.isRunning) return;

    console.log('📦 Dead Letter Queue Handler gestartet');
    this.isRunning = true;

    // Periodisch fehlgeschlagene Jobs prüfen
    this.checkInterval = setInterval(async () => {
      await this.processFailedJobs();
    }, 60000); // Jede Minute
  }

  async stop(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('📦 Dead Letter Queue Handler gestoppt');
  }

  private async processFailedJobs(): Promise<void> {
    try {
      // Hole fehlgeschlagene Jobs
      const failedJobs = await agentQueue.getFailed(0, 100);
      
      if (failedJobs.length > 0) {
        console.log(`📦 ${failedJobs.length} fehlgeschlagene Jobs gefunden`);

        for (const job of failedJobs) {
          await this.handleFailedJob(job);
        }
      }
    } catch (error) {
      console.error('❌ Fehler beim Verarbeiten der DLQ:', error);
    }
  }

  private async handleFailedJob(job: any): Promise<void> {
    const jobData = job.data;
    const failedReason = job.failedReason;
    const attempts = job.attemptsMade;

    // Speichere in Redis für Analyse
    const dlqEntry = {
      jobId: job.id,
      data: jobData,
      error: failedReason,
      attempts,
      failedAt: new Date().toISOString(),
      retryable: this.isRetryableError(failedReason)
    };

    // Speichere in DLQ Set
    await redisConnection.zadd(
      'dlq:jobs',
      Date.now(),
      JSON.stringify(dlqEntry)
    );

    // Setze TTL für automatische Bereinigung
    await redisConnection.expire('dlq:jobs', DLQ_RETENTION_DAYS * 24 * 3600);

    // Sende Benachrichtigung (optional)
    await this.sendNotification(dlqEntry);

    console.log(`📦 Job ${job.id} zur DLQ hinzugefügt`);
  }

  private isRetryableError(error: string): boolean {
    const nonRetryableErrors = [
      'INVALID_TOKEN',
      'RATE_LIMIT_EXCEEDED',
      'UNRECOVERABLE_ERROR',
      'UNAUTHORIZED'
    ];
    return !nonRetryableErrors.some(e => error?.includes(e));
  }

  private async sendNotification(entry: any): Promise<void> {
    const webhookUrl = process.env.DLQ_WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'dlq_job_failed',
          jobId: entry.jobId,
          error: entry.error,
          retryable: entry.retryable,
          timestamp: entry.failedAt
        })
      });
    } catch (error) {
      console.error('❌ Fehler beim Senden der DLQ Benachrichtigung:', error);
    }
  }
}

/**
 * Worker Statistics Reporter
 */
class StatsReporter {
  private interval: NodeJS.Timeout | null = null;

  start(): void {
    this.interval = setInterval(async () => {
      const stats = await getWorkerStats();
      const queueStats = await agentQueue.getJobCounts();
      
      console.log('📊 Worker Stats:', {
        ...stats,
        queue: queueStats
      });
    }, 300000); // Alle 5 Minuten
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

// Hauptfunktion
async function main(): Promise<void> {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║          MediSync Agent Worker                           ║
╠══════════════════════════════════════════════════════════╣
║  Environment: ${process.env.NODE_ENV || 'development'}                                   ║
╚══════════════════════════════════════════════════════════╝
  `);

  // Initialisiere AI
  const { initializeAI } = await import('./agentWorker');
  initializeAI();

  // Starte Worker
  const worker = createWorker();

  // Starte DLQ Handler
  const dlqHandler = new DeadLetterQueueHandler();
  await dlqHandler.start();

  // Starte Stats Reporter
  const statsReporter = new StatsReporter();
  statsReporter.start();

  // Graceful Shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n⚠️  ${signal} empfangen. Starte graceful shutdown...`);

    // Stoppe Reporter
    statsReporter.stop();

    // Stoppe DLQ Handler
    await dlqHandler.stop();

    // Stoppe Worker
    await stopWorker();

    console.log('✅ Worker graceful shutdown abgeschlossen');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Error Handlers
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    shutdown('UNCAUGHT_EXCEPTION');
  });

  console.log('✅ Worker erfolgreich gestartet und bereit');
}

// Starte Worker
main().catch((error) => {
  console.error('❌ Fehler beim Starten des Workers:', error);
  process.exit(1);
});

export { DeadLetterQueueHandler };
