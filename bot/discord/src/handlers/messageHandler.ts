import WebSocket from 'ws';
import { Client, TextChannel, ThreadChannel } from 'discord.js';
import { sessionManager } from '../utils/sessionManager';
import { rateLimiter } from '../utils/rateLimiter';
import { WebSocketMessage, AgentResult, UserSession } from '../types';

const WEBSOCKET_URL = process.env.WEBSOCKET_URL || 'ws://localhost:8080';
const DISCORD_API_BASE = 'https://discord.com/api/v10';
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 5000;

/**
 * WebSocket Message Handler for MediSync Agent responses
 */
export class MessageHandler {
  private ws: WebSocket | null = null;
  private client: Client;
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isIntentionallyClosed = false;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Initialize WebSocket connection
   */
  public connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[MessageHandler] WebSocket already connected');
      return;
    }

    console.log(`[MessageHandler] Connecting to WebSocket at ${WEBSOCKET_URL}...`);

    try {
      this.ws = new WebSocket(WEBSOCKET_URL);

      this.ws.on('open', this.onOpen.bind(this));
      this.ws.on('message', this.onMessage.bind(this));
      this.ws.on('close', this.onClose.bind(this));
      this.ws.on('error', this.onError.bind(this));
    } catch (error) {
      console.error('[MessageHandler] Failed to create WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Close the WebSocket connection
   */
  public disconnect(): void {
    this.isIntentionallyClosed = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if WebSocket is connected
   */
  public isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private onOpen(): void {
    console.log('[MessageHandler] WebSocket connected successfully');
    this.reconnectAttempts = 0;
    this.isIntentionallyClosed = false;

    // Send a ping every 30 seconds to keep connection alive
    const pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);
  }

  private async onMessage(data: WebSocket.RawData): Promise<void> {
    try {
      const message = JSON.parse(data.toString()) as WebSocketMessage;
      console.log(`[MessageHandler] Received message type: ${message.type}`);

      switch (message.type) {
        case 'job_update':
          await this.handleJobUpdate(message);
          break;
        case 'job_complete':
          await this.handleJobComplete(message);
          break;
        case 'job_failed':
          await this.handleJobFailed(message);
          break;
        case 'pong':
          // Heartbeat response, ignore
          break;
        default:
          console.log(`[MessageHandler] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('[MessageHandler] Error processing message:', error);
    }
  }

  private onClose(code: number, reason: Buffer): void {
    console.log(`[MessageHandler] WebSocket closed: ${code} - ${reason.toString()}`);
    this.ws = null;

    if (!this.isIntentionallyClosed) {
      this.scheduleReconnect();
    }
  }

  private onError(error: Error): void {
    console.error('[MessageHandler] WebSocket error:', error);
    // Don't close here, let the 'close' event handle reconnection
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[MessageHandler] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = RECONNECT_DELAY * this.reconnectAttempts;

    console.log(`[MessageHandler] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private async handleJobUpdate(message: WebSocketMessage): Promise<void> {
    if (!message.jobId || !message.status) return;

    const session = sessionManager.getSessionByJobId(message.jobId);
    if (!session) {
      console.log(`[MessageHandler] No session found for job ${message.jobId}`);
      return;
    }

    // Update can be ignored for now, or used to update a progress indicator
    console.log(`[MessageHandler] Job ${message.jobId} status: ${message.status}`);
  }

  private async handleJobComplete(message: WebSocketMessage): Promise<void> {
    if (!message.jobId || !message.result) {
      console.log('[MessageHandler] Incomplete job_complete message');
      return;
    }

    const session = sessionManager.getSessionByJobId(message.jobId);
    if (!session) {
      console.log(`[MessageHandler] No session found for completed job ${message.jobId}`);
      return;
    }

    try {
      await rateLimiter.waitForRateLimit(session.userId);
      
      // First try to update the ephemeral message via webhook
      const updatedViaWebhook = await this.updateEphemeralMessage(session, message.result, message.jobId);
      
      // If webhook update fails or isn't possible, send via DM or channel
      if (!updatedViaWebhook) {
        await this.sendResultToUser(session, message.result, message.jobId);
      }
    } catch (error) {
      console.error('[MessageHandler] Error handling job complete:', error);
    }
  }

  private async handleJobFailed(message: WebSocketMessage): Promise<void> {
    if (!message.jobId) return;

    const session = sessionManager.getSessionByJobId(message.jobId);
    if (!session) return;

    try {
      await rateLimiter.waitForRateLimit(session.userId);
      
      // Try to update ephemeral message with error
      const updatedViaWebhook = await this.updateEphemeralMessageWithError(
        session, 
        message.error || 'Unbekannter Fehler', 
        message.jobId
      );
      
      if (!updatedViaWebhook) {
        await this.sendErrorToUser(session, message.error || 'Unbekannter Fehler', message.jobId);
      }
    } catch (error) {
      console.error('[MessageHandler] Error sending failure notification:', error);
    }
  }



  /**
   * Update ephemeral message via Discord Webhook
   * Returns true if successful, false otherwise
   */
  private async updateEphemeralMessage(
    session: UserSession,
    result: AgentResult,
    jobId: string
  ): Promise<boolean> {
    if (!session.interactionToken || !process.env.DISCORD_APPLICATION_ID) {
      return false;
    }

    try {
      const content = this.formatResultContent(result, jobId);
      
      // Discord has a 2000 char limit for webhook messages
      const needsThread = content.length > 2000 || 
                         (result.followUpQuestions && result.followUpQuestions.length > 0);

      if (needsThread) {
        // For long content, update with summary and create thread
        const summary = content.substring(0, 1800) + '\n\n... (vollständige Antwort im Thread)';
        
        const response = await fetch(
          `${DISCORD_API_BASE}/webhooks/${process.env.DISCORD_APPLICATION_ID}/${session.interactionToken}/messages/@original`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
            },
            body: JSON.stringify({
              content: summary,
              components: [{
                type: 1,
                components: [{
                  type: 2,
                  style: 5,
                  label: 'Vollständige Antwort anzeigen',
                  url: `https://discord.com/channels/@me/${session.channelId}/${session.messageId}`
                }]
              }]
            })
          }
        );

        if (!response.ok) {
          throw new Error(`Discord API error: ${response.status}`);
        }

        // Create thread and send full result
        await this.createThreadAndSendResult(session, result, jobId);
      } else {
        // Simple update for short content
        const response = await fetch(
          `${DISCORD_API_BASE}/webhooks/${process.env.DISCORD_APPLICATION_ID}/${session.interactionToken}/messages/@original`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
            },
            body: JSON.stringify({ content })
          }
        );

        if (!response.ok) {
          throw new Error(`Discord API error: ${response.status}`);
        }
      }

      console.log(`[MessageHandler] Updated ephemeral message for job ${jobId}`);
      return true;
    } catch (error) {
      console.error('[MessageHandler] Failed to update ephemeral message:', error);
      return false;
    }
  }

  /**
   * Update ephemeral message with error via Discord Webhook
   */
  private async updateEphemeralMessageWithError(
    session: UserSession,
    error: string,
    jobId: string
  ): Promise<boolean> {
    if (!session.interactionToken || !process.env.DISCORD_APPLICATION_ID) {
      return false;
    }

    try {
      const response = await fetch(
        `${DISCORD_API_BASE}/webhooks/${process.env.DISCORD_APPLICATION_ID}/${session.interactionToken}/messages/@original`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
          },
          body: JSON.stringify({
            content: `❌ **Fehler bei Agent-Anfrage** (Job: \`${jobId}\`)\n\n${error.substring(0, 1500)}`
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Discord API error: ${response.status}`);
      }

      return true;
    } catch (err) {
      console.error('[MessageHandler] Failed to update ephemeral message with error:', err);
      return false;
    }
  }

  /**
   * Format the result content with metadata
   */
  private formatResultContent(result: AgentResult, jobId: string): string {
    const { content, metadata } = result;
    
    let responseText = `✅ **Agent-Antwort** (Job: \`${jobId}\`)\n\n${content}`;
    
    // Add metadata if available
    if (metadata) {
      const metaLines: string[] = [];
      if (metadata.model) metaLines.push(`🤖 Modell: ${metadata.model}`);
      if (metadata.processingTime) metaLines.push(`⏱️ Zeit: ${metadata.processingTime}ms`);
      if (metadata.tokensUsed) metaLines.push(`📝 Tokens: ${metadata.tokensUsed}`);
      if (metadata.confidence) metaLines.push(`🎯 Konfidenz: ${Math.round(metadata.confidence * 100)}%`);
      
      if (metaLines.length > 0) {
        responseText += '\n\n' + '─'.repeat(30) + '\n' + metaLines.join(' | ');
      }
    }

    return responseText;
  }

  /**
   * Create a thread and send the full result
   */
  private async createThreadAndSendResult(
    session: UserSession,
    result: AgentResult,
    jobId: string
  ): Promise<void> {
    const channel = await this.client.channels.fetch(session.channelId);
    if (!channel || !channel.isTextBased() || !(channel instanceof TextChannel)) {
      // Fall back to DM if channel not available
      await this.sendResultToUser(session, result, jobId);
      return;
    }

    const message = await channel.messages.fetch(session.messageId).catch(() => null);
    if (!message) return;

    const thread = await message.startThread({
      name: `Agent-Antwort ${jobId.substring(0, 8)}`,
      autoArchiveDuration: 60
    });

    sessionManager.setThreadId(session.sessionId, thread.id);

    // Send result in chunks
    const content = this.formatResultContent(result, jobId);
    await this.sendInChunks(thread, content);

    // Add follow-up questions
    if (result.followUpQuestions && result.followUpQuestions.length > 0) {
      await thread.send({
        content: '**Mögliche Folgefragen:**\n' + 
                 result.followUpQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')
      });
    }
  }

  private async sendResultToUser(
    session: UserSession,
    result: AgentResult,
    jobId: string
  ): Promise<void> {
    const channel = await this.client.channels.fetch(session.channelId);
    if (!channel || !channel.isTextBased()) {
      console.error('[MessageHandler] Channel not found or not text-based');
      return;
    }

    const content = this.formatResultContent(result, jobId);

    // Check if we need to create a thread (long content > 2000 chars)
    const needsThread = content.length > 2000;

    if (needsThread && !session.threadId && channel instanceof TextChannel) {
      // Create a thread for this conversation
      const message = await channel.messages.fetch(session.messageId).catch(() => null);
      if (message) {
        const thread = await message.startThread({
          name: `Agent-Antwort ${jobId.substring(0, 8)}`,
          autoArchiveDuration: 60
        });
        sessionManager.setThreadId(session.sessionId, thread.id);

        // Send the result in the thread
        await this.sendInChunks(thread, content);

        // Add follow-up questions as separate messages
        if (result.followUpQuestions && result.followUpQuestions.length > 0) {
          await thread.send({
            content: '**Mögliche Folgefragen:**\n' + 
                     result.followUpQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')
          });
        }
      }
    } else if (session.threadId) {
      // Send in existing thread
      const thread = await this.client.channels.fetch(session.threadId) as ThreadChannel;
      if (thread) {
        await this.sendInChunks(thread, content);
      }
    } else {
      // Send as DM
      const user = await this.client.users.fetch(session.userId);
      if (user) {
        try {
          await this.sendInChunks(user, content);
        } catch {
          // If DM fails, try to send in channel
          if (channel.isTextBased()) {
            const textChannel = channel as TextChannel;
            await textChannel.send({
              content: `<@${session.userId}> **Agent-Antwort:**\n\n${content.substring(0, 1500)}${content.length > 1500 ? '...' : ''}`,
            });
          }
        }
      }
    }
  }

  private async sendErrorToUser(
    session: { userId: string; channelId: string },
    error: string,
    jobId: string
  ): Promise<void> {
    try {
      const user = await this.client.users.fetch(session.userId);
      await user.send({
        content: `❌ **Fehler bei Agent-Anfrage** (Job: \`${jobId}\`)\n\n${error}`
      });
    } catch {
      console.error('[MessageHandler] Failed to send error notification to user');
    }
  }

  private async sendInChunks(
    destination: TextChannel | ThreadChannel | { send: Function },
    content: string,
    maxLength: number = 1900
  ): Promise<void> {
    if (content.length <= maxLength) {
      await destination.send({ content });
      return;
    }

    const chunks: string[] = [];
    let remaining = content;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Try to find a good breaking point
      let chunk = remaining.substring(0, maxLength);
      const lastNewline = chunk.lastIndexOf('\n');
      const lastSpace = chunk.lastIndexOf(' ');

      if (lastNewline > maxLength * 0.8) {
        chunk = chunk.substring(0, lastNewline);
      } else if (lastSpace > maxLength * 0.8) {
        chunk = chunk.substring(0, lastSpace);
      }

      chunks.push(chunk);
      remaining = remaining.substring(chunk.length).trim();
    }

    for (let i = 0; i < chunks.length; i++) {
      const prefix = i === 0 ? '' : `(Fortsetzung ${i + 1}/${chunks.length})\n`;
      await rateLimiter.waitForRateLimit('global');
      await destination.send({ content: prefix + chunks[i] });
    }
  }
}
