/**
 * WebSocket Live Updates.
 * Broadcasts call events, transcription progress, and triage results in real-time.
 */
import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import { WsMessage, CallEvent, TriageResult } from '../../shared/types';

export class LiveUpdates {
  private _wss: WebSocketServer | null = null;
  private _clients: Set<WebSocket> = new Set();

  /**
   * Attach WebSocket server to an existing HTTP server.
   */
  public attach(server: HttpServer, path = '/ws'): void {
    this._wss = new WebSocketServer({ server, path });

    this._wss.on('connection', (ws: WebSocket) => {
      this._clients.add(ws);
      console.log(`[WS] Client connected (${this._clients.size} total)`);

      // Send connection confirmation
      this._send(ws, {
        type: 'connection_status',
        timestamp: new Date().toISOString(),
        data: { connected: true },
      });

      ws.on('close', () => {
        this._clients.delete(ws);
        console.log(`[WS] Client disconnected (${this._clients.size} total)`);
      });

      ws.on('error', (err) => {
        console.error('[WS] Client error:', err.message);
        this._clients.delete(ws);
      });
    });

    console.log(`[WS] WebSocket server listening on path ${path}`);
  }

  /**
   * Broadcast a call event to all connected clients.
   */
  public broadcastCallEvent(event: CallEvent): void {
    this._broadcast({
      type: 'call_event',
      timestamp: new Date().toISOString(),
      data: event,
    });
  }

  /**
   * Broadcast a triage result to all connected clients.
   */
  public broadcastTriageResult(result: TriageResult): void {
    this._broadcast({
      type: 'triage_complete',
      timestamp: new Date().toISOString(),
      data: result,
    });
  }

  /**
   * Broadcast transcription progress.
   */
  public broadcastTranscriptionProgress(callId: string, progress: {
    segmentIndex: number;
    totalSegments?: number;
    partialText: string;
    isComplete: boolean;
  }): void {
    this._broadcast({
      type: progress.isComplete ? 'transcription_complete' : 'transcription_progress',
      timestamp: new Date().toISOString(),
      data: { callId, ...progress },
    });
  }

  /**
   * Broadcast an error to all connected clients.
   */
  public broadcastError(error: { message: string; code?: string }): void {
    this._broadcast({
      type: 'error',
      timestamp: new Date().toISOString(),
      data: error,
    });
  }

  /**
   * Get number of connected clients.
   */
  public getClientCount(): number {
    return this._clients.size;
  }

  /**
   * Close all connections and shut down.
   */
  public close(): void {
    for (const client of this._clients) {
      client.close();
    }
    this._clients.clear();
    this._wss?.close();
    this._wss = null;
  }

  private _broadcast(message: WsMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this._clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  private _send(ws: WebSocket, message: WsMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
}
