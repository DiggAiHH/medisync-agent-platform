/**
 * Telephony Gateway HTTP Server.
 * Express-based REST API and WebSocket server for the telephony service.
 * Integrates all modules: Starface, Audio, Triage, Compliance.
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { GatewayConfig } from '../shared/config';

export function createServer(config: GatewayConfig): express.Express {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '10mb' }));

  // Request logging
  app.use((req, _res, next) => {
    console.log(`[Gateway] ${req.method} ${req.path}`);
    next();
  });

  return app;
}

export function startServer(
  app: express.Express,
  port: number,
): Promise<import('http').Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`[Gateway] HTTP server listening on port ${port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}
