export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface AgentJob {
  id: string;
  prompt: string;
  userId: string;
  sessionId: string;
  status: JobStatus;
  result?: string;
  error?: string;
  createdAt: string;
  updatedAt?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CreateJobRequest {
  prompt: string;
  userId: string;
  sessionId: string;
}

export interface JobResponse {
  success: boolean;
  data?: AgentJob;
  error?: string;
}

export interface JobsListResponse {
  success: boolean;
  data: AgentJob[];
  count: number;
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  services: {
    server: boolean;
    redis: boolean;
    queue: boolean;
    models?: boolean;
  };
  uptime: number;
  version: string;
}

export type WebSocketMessageType = 
  | 'connected'
  | 'subscribed'
  | 'pong'
  | 'error'
  | 'job-update'
  | 'job-completed'
  | 'job-failed'
  | 'stream_chunk'
  | 'stream_end'
  | 'stream_error'
  | 'usage_update';

export interface WebSocketMessage {
  type: WebSocketMessageType;
  jobId?: string;
  sessionId?: string;
  userId?: string;
  data?: AgentJob | StreamChunkData | StreamEndData | StreamErrorData;
  payload?: unknown;
  message?: string;
  timestamp: string;
}

export interface StreamChunkData {
  requestId?: string;
  chunkNumber: number;
  content: string;
  toolCalls?: unknown[];
  finishReason?: string | null;
}

export interface StreamEndData {
  requestId?: string;
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  duration: number;
}

export interface StreamErrorData {
  requestId?: string;
  error: string;
  code: string;
}
