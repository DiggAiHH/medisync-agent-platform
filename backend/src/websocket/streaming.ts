import { WebSocketServer, WebSocket } from 'ws';
import { AgentJob, WebSocketMessage } from '../types';
import { redisConnection } from '../queue/agentQueue';

const WS_PORT = parseInt(process.env.WS_PORT || '8080');

// WebSocket Server
export const wss = new WebSocketServer({
  port: WS_PORT,
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverMaxWindowBits: 10,
    concurrencyLimit: 10
  }
});

// Client-Verwaltung
interface ClientInfo {
  ws: WebSocket;
  jobIds: Set<string>;
  userId?: string;
  sessionId?: string;
  connectedAt: Date;
  lastPing: Date;
}

const clients = new Map<WebSocket, ClientInfo>();

// WebSocket Server initialisieren
export const initializeWebSocketServer = (): void => {
  wss.on('connection', (ws: WebSocket, req) => {
    const clientInfo: ClientInfo = {
      ws,
      jobIds: new Set(),
      connectedAt: new Date(),
      lastPing: new Date()
    };
    clients.set(ws, clientInfo);

    console.log(`🔌 Neuer WebSocket Client verbunden (Total: ${clients.size})`);

    // Initial Ping senden
    ws.send(JSON.stringify({
      type: 'connected',
      timestamp: new Date().toISOString(),
      message: 'Verbunden mit MediSync Agenten-Plattform'
    }));

    // Nachrichten-Handler
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(ws, message, clientInfo);
      } catch (error) {
        console.error('Fehler beim Parsen der WebSocket-Nachricht:', error);
        ws.send(JSON.stringify({
          type: 'error',
          timestamp: new Date().toISOString(),
          error: 'Ungültige Nachricht'
        }));
      }
    });

    // Verbindungs-Handler
    ws.on('close', (code: number, reason: Buffer) => {
      console.log(`🔌 WebSocket Client getrennt (Code: ${code}, Reason: ${reason.toString()})`);
      clients.delete(ws);
    });

    ws.on('error', (error: Error) => {
      console.error('WebSocket Fehler:', error);
      clients.delete(ws);
    });

    // Ping/Pong für Verbindungs-Keepalive
    ws.on('pong', () => {
      clientInfo.lastPing = new Date();
    });
  });

  wss.on('error', (error: Error) => {
    console.error('WebSocket Server Fehler:', error);
  });

  console.log(`🚀 WebSocket Server läuft auf Port ${WS_PORT}`);

  // Starte Ping-Interval
  startPingInterval();

  // Starte Redis Pub/Sub für Job-Updates
  subscribeToJobUpdates();
};

// Client-Nachrichten verarbeiten
const handleClientMessage = (
  ws: WebSocket, 
  message: any, 
  clientInfo: ClientInfo
): void => {
  switch (message.type) {
    case 'subscribe':
      // Zu bestimmten Jobs abonnieren
      if (message.jobId) {
        clientInfo.jobIds.add(message.jobId);
        console.log(`📡 Client abonniert Job ${message.jobId}`);
        ws.send(JSON.stringify({
          type: 'subscribed',
          jobId: message.jobId,
          timestamp: new Date().toISOString()
        }));
      }
      break;

    case 'unsubscribe':
      // Von Job abmelden
      if (message.jobId) {
        clientInfo.jobIds.delete(message.jobId);
        console.log(`📡 Client abgemeldet von Job ${message.jobId}`);
      }
      break;

    case 'register':
      // User/Session Registrierung
      if (message.userId) {
        clientInfo.userId = message.userId;
      }
      if (message.sessionId) {
        clientInfo.sessionId = message.sessionId;
      }
      console.log(`👤 Client registriert - User: ${clientInfo.userId}, Session: ${clientInfo.sessionId}`);
      break;

    case 'ping':
      // Ping-Pong
      ws.send(JSON.stringify({
        type: 'pong',
        timestamp: new Date().toISOString()
      }));
      break;

    default:
      console.log('Unbekannte Nachricht:', message);
  }
};

// Job-Update an relevante Clients broadcasten
export const broadcastJobUpdate = (job: AgentJob): void => {
  const message: WebSocketMessage = {
    type: 'job-update',
    jobId: job.id,
    data: job,
    timestamp: new Date().toISOString()
  };

  const messageStr = JSON.stringify(message);
  let sentCount = 0;

  clients.forEach((clientInfo, ws) => {
    // Sende an Clients, die diesen Job abonniert haben
    // oder die zur gleichen Session/User gehören
    const shouldSend = 
      clientInfo.jobIds.has(job.id) ||
      clientInfo.sessionId === job.sessionId ||
      clientInfo.userId === job.userId;

    if (shouldSend && ws.readyState === WebSocket.OPEN) {
      ws.send(messageStr);
      sentCount++;
    }
  });

  console.log(`📤 Job-Update für ${job.id} an ${sentCount} Clients gesendet`);
};

// Job-Abschluss broadcasten
export const broadcastJobCompleted = (job: AgentJob): void => {
  const message: WebSocketMessage = {
    type: job.error ? 'job-failed' : 'job-completed',
    jobId: job.id,
    data: job,
    timestamp: new Date().toISOString()
  };

  const messageStr = JSON.stringify(message);

  clients.forEach((clientInfo, ws) => {
    const shouldSend = 
      clientInfo.jobIds.has(job.id) ||
      clientInfo.sessionId === job.sessionId ||
      clientInfo.userId === job.userId;

    if (shouldSend && ws.readyState === WebSocket.OPEN) {
      ws.send(messageStr);
    }
  });

  console.log(`✅ Job-Abschluss für ${job.id} broadcasted`);
};

// Ping-Interval für Keepalive
const startPingInterval = (): void => {
  const PING_INTERVAL = 30000; // 30 Sekunden

  setInterval(() => {
    const now = new Date();
    const deadClients: WebSocket[] = [];

    clients.forEach((clientInfo, ws) => {
      // Prüfe ob Client noch lebt (letzter Ping älter als 2 Minuten)
      const lastPingAge = now.getTime() - clientInfo.lastPing.getTime();
      if (lastPingAge > 120000) {
        deadClients.push(ws);
        return;
      }

      // Sende Ping
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    });

    // Tote Clients entfernen
    deadClients.forEach(ws => {
      console.log('🧹 Toter Client entfernt');
      clients.delete(ws);
      ws.terminate();
    });

    if (deadClients.length > 0) {
      console.log(`🧹 ${deadClients.length} tote Clients entfernt`);
    }
  }, PING_INTERVAL);
};

// Redis Pub/Sub für Job-Updates
const subscribeToJobUpdates = async (): Promise<void> => {
  const subscriber = redisConnection.duplicate();

  subscriber.on('message', (channel: string, message: string) => {
    try {
      if (channel === 'job-updates') {
        const job = JSON.parse(message) as AgentJob;
        broadcastJobUpdate(job);
      } else if (channel.startsWith('stream:')) {
        const streamMessage = JSON.parse(message);
        broadcastStreamMessage(streamMessage);
      }
    } catch (error) {
      console.error('Fehler beim Verarbeiten von Redis Pub/Sub Nachricht:', error);
    }
  });

  await subscriber.subscribe('job-updates');
  await subscriber.psubscribe('stream:*');
  console.log('📡 Abonniert auf job-updates und stream:* Channels');
};

// Broadcast Stream-Nachricht an relevante Clients
const broadcastStreamMessage = (message: any): void => {
  const messageStr = JSON.stringify(message);
  let sentCount = 0;

  clients.forEach((clientInfo, ws) => {
    // Sende an Clients, die diesen Job/Session abonniert haben
    const shouldSend = 
      clientInfo.jobIds.has(message.jobId) ||
      clientInfo.sessionId === message.sessionId ||
      clientInfo.userId === message.userId;

    if (shouldSend && ws.readyState === WebSocket.OPEN) {
      ws.send(messageStr);
      sentCount++;
    }
  });

  if (message.type === 'stream_chunk') {
    console.log(`📤 Stream ${message.type} für Job ${message.jobId} an ${sentCount} Clients`);
  }
};

// WebSocket Server schließen
export const closeWebSocketServer = async (): Promise<void> => {
  console.log('🛑 Schließe WebSocket Server...');

  // Alle Clients trennen
  clients.forEach((clientInfo, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, 'Server wird heruntergefahren');
    }
  });
  clients.clear();

  // Server schließen
  return new Promise((resolve, reject) => {
    wss.close((err) => {
      if (err) {
        reject(err);
      } else {
        console.log('✅ WebSocket Server geschlossen');
        resolve();
      }
    });
  });
};

// Anzahl der verbundenen Clients
export const getConnectedClientsCount = (): number => {
  return clients.size;
};

// Broadcast Stream Chunk für externe Aufrufe
export const broadcastStreamChunk = (
  jobId: string,
  sessionId: string,
  userId: string,
  chunk: { content: string; chunkNumber: number }
): void => {
  const message = {
    type: 'stream_chunk',
    jobId,
    sessionId,
    userId,
    payload: chunk,
    timestamp: new Date().toISOString()
  };
  broadcastStreamMessage(message);
};

// Broadcast Stream End für externe Aufrufe
export const broadcastStreamEnd = (
  jobId: string,
  sessionId: string,
  userId: string,
  result: { content: string; usage: any; duration: number }
): void => {
  const message = {
    type: 'stream_end',
    jobId,
    sessionId,
    userId,
    payload: result,
    timestamp: new Date().toISOString()
  };
  broadcastStreamMessage(message);
};
