import { ChatInputCommandInteraction, Client, Collection } from 'discord.js';

// Discord Bot Command Interface
export interface Command {
  data: {
    name: string;
    description: string;
    options?: CommandOption[];
  };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export interface CommandOption {
  name: string;
  description: string;
  type: number;
  required?: boolean;
}

// Extended Client with commands collection
export interface ExtendedClient extends Client {
  commands: Collection<string, Command>;
}

// MediSync API Types
export interface JobRequest {
  prompt: string;
  userId: string;
  sessionId: string;
}

export interface JobResponse {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message?: string;
}

// WebSocket Message Types
export interface WebSocketMessage {
  type: 'job_update' | 'job_complete' | 'job_failed' | 'ping' | 'pong';
  jobId?: string;
  status?: string;
  result?: AgentResult;
  error?: string;
  timestamp: number;
}

export interface AgentResult {
  content: string;
  metadata?: {
    model?: string;
    tokensUsed?: number;
    processingTime?: number;
    confidence?: number;
  };
  followUpQuestions?: string[];
}

// Rate Limiter Types
export interface RateLimitEntry {
  timestamp: number;
  count: number;
}

// Session Management
export interface UserSession {
  sessionId: string;
  userId: string;
  channelId: string;
  messageId: string;
  threadId?: string;
  jobId?: string;
  interactionToken?: string;
  createdAt: number;
  lastActivity: number;
}
