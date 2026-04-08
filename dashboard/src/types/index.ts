export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Job {
  id: string;
  userId: string;
  prompt: string;
  status: JobStatus;
  result?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface JobStats {
  total: number;
  active: number;
  completed: number;
  failed: number;
}

export interface WebSocketMessage {
  type: 'job_update' | 'stream_chunk' | 'stream_end' | 'connected';
  jobId?: string;
  data?: Job;
  chunk?: string;
  message?: string;
}

export interface CreateJobRequest {
  userId: string;
  prompt: string;
}
