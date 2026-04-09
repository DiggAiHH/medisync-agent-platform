/**
 * Gateway main entry point.
 * Wires up all routes, WebSocket server, and the CallRouter.
 */
import { TelephonyConfig } from '../shared/config';
import { createServer, startServer } from './server';
import { CallRouter } from './callRouter';
import { LiveUpdates } from './ws/liveUpdates';
import { createHealthRoutes, HealthDependencies } from './routes/health';
import { createTriageRoutes } from './routes/triage';
import { createTranscriptRoutes, TranscriptDependencies } from './routes/transcripts';
import { StarfaceAuth, StarfaceClient, StarfaceHealth } from '../starface';
import { WhisperLocal, PiperLocal, AudioFileManager, StreamingTranscription } from '../audio';
import { AuditLogger } from '../compliance';

export async function startGateway(config: TelephonyConfig): Promise<{
  callRouter: CallRouter;
  liveUpdates: LiveUpdates;
  stop: () => void;
}> {
  // Create Express app
  const app = createServer(config.gateway);

  // Initialize shared services
  const starfaceAuth = new StarfaceAuth(config.starface);
  const starfaceClient = new StarfaceClient(config.starface, starfaceAuth);
  const starfaceHealth = new StarfaceHealth(starfaceClient);
  const whisper = new WhisperLocal(config.whisper);
  const piper = new PiperLocal(config.piper);
  const audioFileManager = new AudioFileManager(config.gateway.audioTempDir);
  const streamingTranscription = new StreamingTranscription(whisper);
  const auditLogger = new AuditLogger();

  // Register routes
  const healthDeps: HealthDependencies = { starfaceHealth, whisper, piper };
  app.use('/health', createHealthRoutes(healthDeps));

  const callRouter = new CallRouter(config);
  app.use('/triage', createTriageRoutes({ callRouter }));

  const transcriptDeps: TranscriptDependencies = {
    whisper,
    audioFileManager,
    streamingTranscription,
    auditLogger,
  };
  app.use('/transcripts', createTranscriptRoutes(transcriptDeps));

  // Start HTTP server
  const httpServer = await startServer(app, config.gateway.port);

  // Attach WebSocket
  const liveUpdates = new LiveUpdates();
  liveUpdates.attach(httpServer, '/ws');

  // Wire call events to WebSocket
  callRouter.onCallEvent((event) => liveUpdates.broadcastCallEvent(event));
  callRouter.onTriageResult((result) => liveUpdates.broadcastTriageResult(result));

  // Start call router
  await callRouter.start();

  console.log(`[Gateway] Telephony gateway running on port ${config.gateway.port}`);

  return {
    callRouter,
    liveUpdates,
    stop: () => {
      callRouter.stop();
      liveUpdates.close();
      httpServer.close();
    },
  };
}

export { CallRouter } from './callRouter';
export { LiveUpdates } from './ws/liveUpdates';
export { createServer, startServer } from './server';
