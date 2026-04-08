/**
 * Agent Worker - BullMQ Worker für Job-Verarbeitung
 * 
 * Verarbeitet Jobs aus der Queue und kommuniziert mit GitHub Models API.
 * - Status-Updates via Redis Pub/Sub
 * - Streaming zu WebSocket
 * - Retry-Logik mit Exponential Backoff
 * - Failed Queue für manuelle Retries
 */

import { Worker, Job, UnrecoverableError } from 'bullmq';
import { AgentJob, JobStatus } from '../types';
import { redisConnection, agentQueue, updateJobStatus, isMemoryQueue } from '../queue/agentQueue';
import { 
  GitHubModelsClient, 
  ModelRouter, 
  StreamingHandler,
  StreamingChunk,
  TokenUsage,
  Message,
  AccumulatedResponse,
  GitHubModel
} from '../ai';

// Konfiguration
const QUEUE_NAME = process.env.QUEUE_NAME || 'agent-jobs';
const FAILED_QUEUE_NAME = `${QUEUE_NAME}-failed`;
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);

// Medical AI System Prompt
const MEDICAL_SYSTEM_PROMPT = `Du bist ein medizinischer AI-Assistent für deutsche Arztpraxen.
Antworte präzise und fachlich korrekt auf Deutsch.
Wenn unsicher, weise auf Limitationen hin.`;

// Worker Instanz
let worker: Worker | null = null;

// Memory Worker (für In-Memory Queue)
let memoryWorkerRunning = false;
let memoryWorkerInterval: NodeJS.Timeout | null = null;

// AI Client und Router (Singletons)
let aiClient: GitHubModelsClient | null = null;
let modelRouter: ModelRouter | null = null;

/**
 * Initialisiert den AI Client und Router
 */
export function initializeAI(): void {
  if (!aiClient) {
    aiClient = new GitHubModelsClient();
    console.log('🤖 GitHub Models Client initialisiert');
  }
  if (!modelRouter) {
    modelRouter = new ModelRouter();
    console.log('🎯 Model Router initialisiert');
  }
}

/**
 * Gibt den AI Client zurück (lazy initialization)
 */
export function getAIClient(): GitHubModelsClient {
  if (!aiClient) {
    initializeAI();
  }
  return aiClient!;
}

/**
 * Gibt den Model Router zurück (lazy initialization)
 */
export function getModelRouter(): ModelRouter {
  if (!modelRouter) {
    initializeAI();
  }
  return modelRouter!;
}

/**
 * Broadcastet einen Job-Update via Redis Pub/Sub
 */
async function broadcastJobUpdate(job: AgentJob): Promise<void> {
  try {
    // In MemoryQueue-Modus wird der Broadcast übersprungen
    if (isMemoryQueue) return;
    await (redisConnection as any).publish('job-updates', JSON.stringify(job));
  } catch (error) {
    console.error('Fehler beim Broadcasten des Job-Updates:', error);
  }
}

/**
 * Broadcastet einen Stream-Chunk via Redis Pub/Sub
 */
async function broadcastStreamChunk(
  jobId: string,
  sessionId: string,
  userId: string,
  chunk: { content: string; chunkNumber: number; finishReason?: string | null }
): Promise<void> {
  try {
    // In MemoryQueue-Modus wird der Broadcast übersprungen
    if (isMemoryQueue) return;
    
    const message = {
      type: 'stream_chunk',
      jobId,
      sessionId,
      userId,
      payload: chunk,
      timestamp: new Date().toISOString()
    };
    await (redisConnection as any).publish(`stream:${sessionId}`, JSON.stringify(message));
  } catch (error) {
    console.error('Fehler beim Broadcasten des Stream-Chunks:', error);
  }
}

/**
 * Broadcastet Stream-Ende via Redis Pub/Sub
 */
async function broadcastStreamEnd(
  jobId: string,
  sessionId: string,
  userId: string,
  result: { content: string; usage: TokenUsage; duration: number }
): Promise<void> {
  try {
    // In MemoryQueue-Modus wird der Broadcast übersprungen
    if (isMemoryQueue) return;
    
    const message = {
      type: 'stream_end',
      jobId,
      sessionId,
      userId,
      payload: result,
      timestamp: new Date().toISOString()
    };
    await (redisConnection as any).publish(`stream:${sessionId}`, JSON.stringify(message));
  } catch (error) {
    console.error('Fehler beim Broadcasten des Stream-Ende:', error);
  }
}

/**
 * Erstellt Messages Array mit System Prompt
 */
function createMessages(prompt: string, isMedical: boolean = true): Message[] {
  const messages: Message[] = [];
  
  if (isMedical) {
    messages.push({
      role: 'system',
      content: MEDICAL_SYSTEM_PROMPT
    });
  }
  
  messages.push({
    role: 'user',
    content: prompt
  });
  
  return messages;
}

/**
 * Verarbeitet einen einzelnen Job
 */
export async function processJob(job: Job<AgentJob> | any): Promise<string> {
  const jobData = job.data || job;
  const startTime = Date.now();
  
  console.log(`🚀 Starte Verarbeitung von Job ${jobData.id}`);

  try {
    // 1. Update Status zu "processing"
    await updateJobStatus(jobData.id, 'processing');
    
    // Aktualisierte Job-Daten für Broadcast
    const processingJob: AgentJob = {
      ...jobData,
      status: 'processing',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await broadcastJobUpdate(processingJob);

    // 2. Route zu passendem Modell
    const router = getModelRouter();
    const messages = createMessages(jobData.prompt);
    const routing = router.route(messages);
    
    console.log(`🎯 Job ${jobData.id} geroutet zu Modell: ${routing.model} (${routing.reason})`);

    // 3. Stream zu WebSocket
    const client = getAIClient();
    const stream = client.streamChatCompletion(messages, { 
      model: routing.model,
      temperature: 0.7,
      max_tokens: 2048
    });

    // Verarbeite Stream mit Chunk-Broadcasting
    let accumulatedContent = '';
    let chunkCount = 0;
    let finalUsage: TokenUsage | undefined;
    let finalModel = routing.model;

    for await (const chunk of stream) {
      chunkCount++;
      
      // Extrahiere Delta-Content
      const deltaContent = chunk.choices[0]?.delta?.content;
      if (deltaContent) {
        accumulatedContent += deltaContent;
        
        // Broadcast Chunk zu WebSocket
        await broadcastStreamChunk(
          jobData.id,
          jobData.sessionId,
          jobData.userId,
          {
            content: deltaContent,
            chunkNumber: chunkCount,
            finishReason: chunk.choices[0]?.finish_reason
          }
        );
      }
    }

    // Erhalte finale Usage-Informationen
    const result = await stream.next();
    if (result.done && result.value) {
      const finalData = result.value as { usage?: TokenUsage; cost: number; model: string };
      finalUsage = finalData.usage;
      finalModel = finalData.model as GitHubModel;
    }

    const duration = Date.now() - startTime;

    // 4. Speichere Ergebnis
    const finalResult = accumulatedContent;
    
    // Broadcast Stream-Ende
    await broadcastStreamEnd(
      jobData.id,
      jobData.sessionId,
      jobData.userId,
      {
        content: finalResult,
        usage: finalUsage || {
          prompt_tokens: Math.ceil(jobData.prompt.length / 4),
          completion_tokens: Math.ceil(finalResult.length / 4),
          total_tokens: Math.ceil((jobData.prompt.length + finalResult.length) / 4)
        },
        duration
      }
    );

    // 5. Update Status zu "completed"
    await updateJobStatus(jobData.id, 'completed', finalResult);
    
    const completedJob: AgentJob = {
      ...jobData,
      status: 'completed',
      result: finalResult,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await broadcastJobUpdate(completedJob);

    console.log(`✅ Job ${jobData.id} erfolgreich abgeschlossen`);

    return finalResult;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error(`❌ Fehler bei Job ${jobData.id}:`, errorMessage);

    // Unterscheide zwischen retry-baren und nicht-retry-baren Fehlern
    const isRetryable = isRetryableError(error);
    const attemptsMade = job.attemptsMade || 0;
    const maxAttempts = 3;

    if (!isRetryable || attemptsMade >= maxAttempts - 1) {
      // Finale Fehlerbehandlung
      await updateJobStatus(jobData.id, 'failed', undefined, errorMessage);
      
      const failedJob: AgentJob = {
        ...jobData,
        status: 'failed',
        error: errorMessage,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await broadcastJobUpdate(failedJob);

      // Throw UnrecoverableError für nicht-retry-bare Fehler
      if (!isRetryable) {
        throw new UnrecoverableError(errorMessage);
      }
    }

    // Retry-baren Fehler weiterwerfen für automatischen Retry
    throw error;
  }
}

/**
 * Prüft ob ein Fehler retry-bar ist
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // Nicht-retry-bare Fehler
    const nonRetryableCodes = ['INVALID_TOKEN', 'RATE_LIMIT_EXCEEDED', 'UNRECOVERABLE_ERROR'];
    const errorCode = (error as { code?: string }).code;
    
    if (errorCode && nonRetryableCodes.includes(errorCode)) {
      return false;
    }

    // Nicht-retry-bare HTTP Status Codes
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 401 || statusCode === 403) {
      return false;
    }

    // Retry-bare Fehler (Netzwerk, Timeout, Server Errors)
    const retryableCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'REQUEST_TIMEOUT'];
    if (errorCode && retryableCodes.includes(errorCode)) {
      return true;
    }

    return true; // Default: retry
  }
  return false;
}

/**
 * Erstellt einen Memory Worker (für In-Memory Queue)
 */
function createMemoryWorker(): void {
  console.log(`👷 Erstelle Memory Worker mit Concurrency: ${CONCURRENCY}`);
  
  memoryWorkerRunning = true;
  const memoryQueue = agentQueue as any;
  let activeJobs = 0;

  memoryWorkerInterval = setInterval(async () => {
    if (!memoryWorkerRunning) return;
    if (activeJobs >= CONCURRENCY) return;

    const job = memoryQueue.getNextJob();
    if (!job) return;

    activeJobs++;
    
    try {
      await processJob(job);
      memoryQueue.completeJob(job.id, job.returnvalue);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      memoryQueue.failJob(job.id, errorMessage);
    } finally {
      activeJobs--;
    }
  }, 100); // Prüfe alle 100ms auf neue Jobs

  console.log('✅ Memory Worker erfolgreich gestartet');
}

/**
 * Erstellt und startet den BullMQ Worker
 */
export function createWorker(): Worker | null {
  // Wenn In-Memory Queue verwendet wird, erstelle Memory Worker
  if (isMemoryQueue) {
    createMemoryWorker();
    return null;
  }

  console.log(`👷 Erstelle Worker mit Concurrency: ${CONCURRENCY}`);

  worker = new Worker<AgentJob, string>(
    QUEUE_NAME,
    processJob,
    {
      connection: redisConnection as any,
      concurrency: CONCURRENCY,
      stalledInterval: 30000,
      maxStalledCount: 3,
      lockDuration: 30000,
      limiter: {
        max: 100,
        duration: 60000
      }
    }
  );

  // Worker Event Handler
  worker.on('completed', (job: Job, result: string) => {
    console.log(`✅ Worker: Job ${job.id} abgeschlossen`);
  });

  worker.on('failed', (job: Job | undefined, error: Error) => {
    console.error(`❌ Worker: Job ${job?.id} fehlgeschlagen:`, error.message);
  });

  worker.on('progress', (job: Job, progress: unknown) => {
    console.log(`📊 Worker: Job ${job.id} Fortschritt: ${progress}`);
  });

  worker.on('stalled', (jobId: string) => {
    console.warn(`⚠️ Worker: Job ${jobId} ist stalled`);
  });

  worker.on('error', (error: Error) => {
    console.error('❌ Worker Fehler:', error);
  });

  console.log('✅ Worker erfolgreich gestartet');
  
  return worker;
}

/**
 * Gibt die aktive Worker-Instanz zurück
 */
export function getWorker(): Worker | null {
  return worker;
}

/**
 * Stoppt den Worker gracefully
 */
export async function stopWorker(): Promise<void> {
  // Stoppe Memory Worker
  if (memoryWorkerRunning) {
    console.log('🛑 Stoppe Memory Worker...');
    memoryWorkerRunning = false;
    if (memoryWorkerInterval) {
      clearInterval(memoryWorkerInterval);
      memoryWorkerInterval = null;
    }
    console.log('✅ Memory Worker gestoppt');
  }

  // Stoppe BullMQ Worker
  if (worker) {
    console.log('🛑 Stoppe Worker...');
    await worker.close();
    worker = null;
    console.log('✅ Worker gestoppt');
  }
}

/**
 * Gibt Worker-Statistiken zurück
 */
export async function getWorkerStats(): Promise<{
  isRunning: boolean;
  concurrency: number;
  queueName: string;
  mode: string;
}> {
  return {
    isRunning: worker !== null || memoryWorkerRunning,
    concurrency: CONCURRENCY,
    queueName: QUEUE_NAME,
    mode: isMemoryQueue ? 'memory' : 'redis'
  };
}
