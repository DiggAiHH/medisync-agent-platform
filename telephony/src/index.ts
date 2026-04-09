/**
 * MediSync Telephony Service — Top-level entry point.
 * Loads configuration and starts the gateway.
 */
import { loadConfigFromEnv } from './shared/config';
import { startGateway } from './gateway';

// Re-export all modules for library use
export * from './shared/types';
export * from './shared/config';
export * from './starface';
export * from './audio';
export * from './triage';
export * from './compliance';
export * from './gateway';

/**
 * Start the telephony service.
 * Call this from the CLI or from a Docker container entrypoint.
 */
export async function main(): Promise<void> {
  console.log('[Telephony] MediSync Telephony Service starting...');

  const config = loadConfigFromEnv();
  console.log('[Telephony] Configuration loaded');
  console.log(`[Telephony] Starface: ${config.starface.baseUrl}`);
  console.log(`[Telephony] Whisper: ${config.whisper.endpoint} (model: ${config.whisper.model})`);
  console.log(`[Telephony] Ollama: ${config.ollama.endpoint} (model: ${config.ollama.model})`);
  console.log(`[Telephony] Piper: ${config.piper.endpoint} (voice: ${config.piper.voice})`);

  const { stop } = await startGateway(config);

  // Graceful shutdown
  const shutdown = () => {
    console.log('[Telephony] Shutting down...');
    stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Run if executed directly
if (require.main === module) {
  main().catch((err) => {
    console.error('[Telephony] Fatal error:', err);
    process.exit(1);
  });
}
