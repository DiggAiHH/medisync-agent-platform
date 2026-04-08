import { Queue, Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { AgentJob, JobStatus, CreateJobRequest } from '../types';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const QUEUE_NAME = process.env.QUEUE_NAME || 'agent-jobs';
const USE_MEMORY_QUEUE = process.env.USE_MEMORY_QUEUE === 'true' || !process.env.REDIS_URL;

// In-Memory Queue Implementation (Fallback für lokale Entwicklung)
class MemoryQueue {
  private jobs: Map<string, any> = new Map();
  private waiting: string[] = [];
  private active: string[] = [];
  private completed: string[] = [];
  private failed: string[] = [];
  private eventHandlers: Map<string, Function[]> = new Map();

  async add(name: string, data: any, opts?: any): Promise<any> {
    const jobId = opts?.jobId || uuidv4();
    const job = {
      id: jobId,
      name,
      data,
      timestamp: Date.now(),
      processedOn: null,
      finishedOn: null,
      failedReason: null,
      returnvalue: null,
      attemptsMade: 0,
      opts: { ...opts, priority: opts?.priority || 0 }
    };

    this.jobs.set(jobId, job);
    this.waiting.push(jobId);
    
    // Sort by priority
    this.waiting.sort((a, b) => {
      const jobA = this.jobs.get(a);
      const jobB = this.jobs.get(b);
      return (jobB.opts.priority || 0) - (jobA.opts.priority || 0);
    });

    this.emit('waiting', jobId);
    return { id: jobId };
  }

  async getJob(jobId: string): Promise<any> {
    return this.jobs.get(jobId) || null;
  }

  async getWaiting(start = 0, end = 100): Promise<any[]> {
    return this.waiting.slice(start, end).map(id => this.jobs.get(id)).filter(Boolean);
  }

  async getActive(start = 0, end = 100): Promise<any[]> {
    return this.active.slice(start, end).map(id => this.jobs.get(id)).filter(Boolean);
  }

  async getCompleted(start = 0, end = 100): Promise<any[]> {
    return this.completed.slice(start, end).map(id => this.jobs.get(id)).filter(Boolean);
  }

  async getFailed(start = 0, end = 100): Promise<any[]> {
    return this.failed.slice(start, end).map(id => this.jobs.get(id)).filter(Boolean);
  }

  async getJobCounts(): Promise<{ waiting: number; active: number; completed: number; failed: number }> {
    return {
      waiting: this.waiting.length,
      active: this.active.length,
      completed: this.completed.length,
      failed: this.failed.length
    };
  }

  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  private emit(event: string, ...args: any[]): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => handler(...args));
  }

  // Interne Methoden für Worker
  getNextJob(): any | null {
    if (this.waiting.length === 0) return null;
    const jobId = this.waiting.shift()!;
    const job = this.jobs.get(jobId);
    if (job) {
      this.active.push(jobId);
      job.processedOn = Date.now();
      this.emit('active', job);
    }
    return job;
  }

  completeJob(jobId: string, result?: any): void {
    const index = this.active.indexOf(jobId);
    if (index > -1) this.active.splice(index, 1);
    
    const job = this.jobs.get(jobId);
    if (job) {
      job.finishedOn = Date.now();
      job.returnvalue = result;
      this.completed.unshift(jobId);
      this.emit('completed', job);
    }
  }

  failJob(jobId: string, error: string): void {
    const index = this.active.indexOf(jobId);
    if (index > -1) this.active.splice(index, 1);
    
    const job = this.jobs.get(jobId);
    if (job) {
      job.finishedOn = Date.now();
      job.failedReason = error;
      job.attemptsMade++;
      this.failed.unshift(jobId);
      this.emit('failed', job, new Error(error));
    }
  }

  async close(): Promise<void> {
    this.jobs.clear();
    this.waiting = [];
    this.active = [];
    this.completed = [];
    this.failed = [];
  }

  // Count methods for health checks
  async getWaitingCount(): Promise<number> {
    return this.waiting.length;
  }

  async getActiveCount(): Promise<number> {
    return this.active.length;
  }

  async getCompletedCount(): Promise<number> {
    return this.completed.length;
  }

  async getFailedCount(): Promise<number> {
    return this.failed.length;
  }

  async getDelayedCount(): Promise<number> {
    return 0; // In-memory queue doesn't support delayed jobs
  }
}

// In-Memory Redis Implementation
class MemoryRedis {
  private data: Map<string, { value: string; expiresAt?: number }> = new Map();
  private sets: Map<string, Set<string>> = new Map();
  private sortedSets: Map<string, Array<{ score: number; member: string }>> = new Map();
  private connected = true;

  async ping(): Promise<string> {
    return 'PONG';
  }

  async info(): Promise<string> {
    return 'redis_version:6.0.0\r\nused_memory:1024';
  }

  duplicate(): MemoryRedis {
    return new MemoryRedis();
  }

  async setex(key: string, seconds: number, value: string): Promise<string> {
    this.data.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    const entry = this.data.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.data.delete(key);
      return null;
    }
    return entry.value;
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    if (!this.sortedSets.has(key)) {
      this.sortedSets.set(key, []);
    }
    const set = this.sortedSets.get(key)!;
    const existingIndex = set.findIndex(item => item.member === member);
    if (existingIndex >= 0) {
      set[existingIndex].score = score;
    } else {
      set.push({ score, member });
    }
    set.sort((a, b) => a.score - b.score);
    return 1;
  }

  async zremrangebyscore(key: string, min: string | number, max: string | number): Promise<number> {
    if (!this.sortedSets.has(key)) return 0;
    const set = this.sortedSets.get(key)!;
    const minScore = min === '-inf' ? -Infinity : Number(min);
    const maxScore = max === '+inf' ? Infinity : Number(max);
    const initialLength = set.length;
    const filtered = set.filter(item => item.score < minScore || item.score > maxScore);
    this.sortedSets.set(key, filtered);
    return initialLength - filtered.length;
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.sortedSets.has(key)) return [];
    const set = this.sortedSets.get(key)!;
    const end = stop === -1 ? undefined : stop + 1;
    return set.slice(start, end).map(item => item.member);
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }
    const set = this.sets.get(key)!;
    let added = 0;
    for (const member of members) {
      if (!set.has(member)) {
        set.add(member);
        added++;
      }
    }
    return added;
  }

  async sismember(key: string, member: string): Promise<number> {
    const set = this.sets.get(key);
    return set && set.has(member) ? 1 : 0;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.data.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + seconds * 1000;
      return 1;
    }
    return 0;
  }

  async quit(): Promise<string> {
    this.connected = false;
    return 'OK';
  }

  on(event: string, handler: Function): void {
    // MemoryRedis doesn't emit events
  }
}

// Exportierte Instanzen
export let agentQueue: Queue | MemoryQueue;
export let redisConnection: Redis | MemoryRedis;
export let isMemoryQueue = false;

// Initialisiere Queue basierend auf Konfiguration
if (USE_MEMORY_QUEUE) {
  console.log('🧠 Verwende In-Memory Queue (kein Redis erforderlich)');
  agentQueue = new MemoryQueue();
  redisConnection = new MemoryRedis();
  isMemoryQueue = true;
} else {
  // Redis-Verbindung mit Retry-Logik
  const createRedisConnection = () => {
    const connection = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        console.log(`Redis reconnect attempt ${times}, retrying in ${delay}ms...`);
        return delay;
      },
      reconnectOnError: (err: Error) => {
        const targetErrors = ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'];
        return targetErrors.some(targetError => err.message.includes(targetError));
      }
    });

    connection.on('connect', () => {
      console.log('✅ Redis verbunden');
    });

    connection.on('error', (err) => {
      console.error('❌ Redis Verbindungsfehler:', err.message);
    });

    connection.on('reconnecting', () => {
      console.log('🔄 Redis Verbindung wird wiederhergestellt...');
    });

    return connection;
  };

  redisConnection = createRedisConnection();

  // BullMQ Queue
  agentQueue = new Queue(QUEUE_NAME, {
    connection: redisConnection as Redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      },
      removeOnComplete: {
        age: 24 * 3600,
        count: 1000
      },
      removeOnFail: {
        age: 7 * 24 * 3600,
        count: 500
      }
    }
  });
}

// Queue-Events überwachen
(agentQueue as any).on('waiting', (jobId: string) => {
  console.log(`📥 Job ${jobId} wartet in der Queue`);
});

(agentQueue as any).on('active', (job: any) => {
  console.log(`⚙️  Job ${job.id} wird verarbeitet`);
});

(agentQueue as any).on('completed', (job: any) => {
  console.log(`✅ Job ${job.id} abgeschlossen`);
});

(agentQueue as any).on('failed', (job: any, err: Error) => {
  console.error(`❌ Job ${job?.id} fehlgeschlagen:`, err.message);
});

// Job erstellen
export const createAgentJob = async (request: CreateJobRequest): Promise<AgentJob> => {
  const jobId = uuidv4();
  const timestamp = new Date().toISOString();

  const agentJob: AgentJob = {
    id: jobId,
    prompt: request.prompt,
    userId: request.userId,
    sessionId: request.sessionId,
    status: 'pending',
    createdAt: timestamp
  };

  // Job zur Queue hinzufügen
  await agentQueue.add(
    'process-agent-task',
    agentJob,
    {
      jobId: jobId,
      priority: 1
    }
  );

  // Job-Daten in Redis/Memory speichern für schnellen Zugriff
  await redisConnection.setex(
    `job:${jobId}`,
    7 * 24 * 3600,
    JSON.stringify(agentJob)
  );

  return agentJob;
};

// Job-Status abrufen
export const getJobStatus = async (jobId: string): Promise<AgentJob | null> => {
  // Zuerst aus Redis/Memory-Cache laden
  const cached = await redisConnection.get(`job:${jobId}`);
  if (cached) {
    return JSON.parse(cached);
  }

  // Fallback: Aus Queue laden
  const job = await agentQueue.getJob(jobId);
  if (!job) {
    return null;
  }

  const jobData = isMemoryQueue ? job : job.data;
  const state = isMemoryQueue ? (job.finishedOn ? 'completed' : job.processedOn ? 'processing' : 'pending') : await (job as Job).getState();

  const agentJob: AgentJob = {
    id: job.id as string,
    prompt: jobData.prompt,
    userId: jobData.userId,
    sessionId: jobData.sessionId,
    status: state as JobStatus,
    result: job.returnvalue,
    error: job.failedReason,
    createdAt: new Date(job.timestamp).toISOString(),
    updatedAt: job.processedOn ? new Date(job.processedOn).toISOString() : undefined,
    startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : undefined,
    completedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : undefined
  };

  return agentJob;
};

// Alle Jobs abrufen (mit Limit)
export const getAllJobs = async (limit: number = 100): Promise<AgentJob[]> => {
  // Jobs aus verschiedenen Zuständen abrufen
  const [waiting, active, completed, failed] = await Promise.all([
    agentQueue.getWaiting(0, limit),
    agentQueue.getActive(0, limit),
    agentQueue.getCompleted(0, limit),
    agentQueue.getFailed(0, limit)
  ]);

  const allJobs = [...waiting, ...active, ...completed, ...failed];
  
  // Nach Erstellungsdatum sortieren (neueste zuerst)
  allJobs.sort((a, b) => b.timestamp - a.timestamp);

  return allJobs.slice(0, limit).map(job => ({
    id: job.id as string,
    prompt: job.data?.prompt || job.prompt,
    userId: job.data?.userId || job.userId,
    sessionId: job.data?.sessionId || job.sessionId,
    status: job.finishedOn ? 'completed' : job.processedOn ? 'processing' : 'pending',
    result: job.returnvalue,
    error: job.failedReason,
    createdAt: new Date(job.timestamp).toISOString(),
    updatedAt: job.processedOn ? new Date(job.processedOn).toISOString() : undefined,
    startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : undefined,
    completedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : undefined
  }));
};

// Job-Status aktualisieren
export const updateJobStatus = async (
  jobId: string, 
  status: JobStatus, 
  result?: string, 
  error?: string
): Promise<void> => {
  const existing = await getJobStatus(jobId);
  if (!existing) {
    throw new Error(`Job ${jobId} nicht gefunden`);
  }

  const updated: AgentJob = {
    ...existing,
    status,
    ...(result && { result }),
    ...(error && { error }),
    updatedAt: new Date().toISOString(),
    ...(status === 'processing' && { startedAt: new Date().toISOString() }),
    ...(status === 'completed' && { completedAt: new Date().toISOString() }),
    ...(status === 'failed' && { completedAt: new Date().toISOString() })
  };

  await redisConnection.setex(
    `job:${jobId}`,
    7 * 24 * 3600,
    JSON.stringify(updated)
  );
};

// Queue-Status prüfen
export const checkQueueHealth = async (): Promise<boolean> => {
  try {
    await redisConnection.ping();
    return true;
  } catch (error) {
    console.error('Queue Health Check fehlgeschlagen:', error);
    return false;
  }
};

// Graceful Shutdown
export const closeQueue = async (): Promise<void> => {
  console.log('🛑 Schließe Queue-Verbindungen...');
  await agentQueue.close();
  await redisConnection.quit();
  console.log('✅ Queue-Verbindungen geschlossen');
};
