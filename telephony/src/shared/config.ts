/**
 * Configuration schema for all telephony subsystems.
 * Validated with Zod at startup.
 */
import { z } from 'zod';

/** Starface PBX connection config */
export const StarfaceConfigSchema = z.object({
  /** Base URL of the Starface REST API, e.g. https://192.168.1.100:443 */
  baseUrl: z.string().url(),
  /** Login ID (Starface user number, e.g. "0001") */
  loginId: z.string().min(1),
  /** Password (plain text — hashed at runtime via SHA512 challenge-response) */
  password: z.string().min(1),
  /** Polling interval in ms for call events (default 2000) */
  pollIntervalMs: z.number().int().min(500).default(2000),
  /** Request timeout in ms */
  requestTimeoutMs: z.number().int().min(1000).default(10000),
  /** TLS: reject unauthorized certificates (disable for self-signed) */
  tlsRejectUnauthorized: z.boolean().default(false),
});
export type StarfaceConfig = z.infer<typeof StarfaceConfigSchema>;

/** Local Whisper STT config */
export const WhisperConfigSchema = z.object({
  /** Whisper server endpoint (whisper.cpp HTTP server) */
  endpoint: z.string().url().default('http://localhost:8178'),
  /** Whisper model to use: tiny, base, small, medium, large-v2, large-v3 */
  model: z.enum(['tiny', 'base', 'small', 'medium', 'large-v2', 'large-v3']).default('large-v3'),
  /** Language hint */
  language: z.string().default('de'),
  /** Request timeout in ms (large files can take time) */
  requestTimeoutMs: z.number().int().min(5000).default(120000),
  /** Max audio file size in bytes (25 MB default) */
  maxFileSizeBytes: z.number().int().default(25 * 1024 * 1024),
});
export type WhisperConfig = z.infer<typeof WhisperConfigSchema>;

/** Local Ollama LLM config (for triage) */
export const OllamaConfigSchema = z.object({
  /** Ollama API endpoint */
  endpoint: z.string().url().default('http://localhost:11434'),
  /** Model name for triage/classification */
  model: z.string().default('llama3.2'),
  /** Temperature for generation (low = more deterministic) */
  temperature: z.number().min(0).max(2).default(0.2),
  /** Max tokens per response */
  maxTokens: z.number().int().min(100).default(2000),
  /** Request timeout in ms */
  requestTimeoutMs: z.number().int().min(5000).default(60000),
});
export type OllamaConfig = z.infer<typeof OllamaConfigSchema>;

/** Local Piper TTS config */
export const PiperConfigSchema = z.object({
  /** Piper HTTP server endpoint */
  endpoint: z.string().url().default('http://localhost:5030'),
  /** Voice model (German) */
  voice: z.string().default('de_DE-thorsten-high'),
  /** Speaker ID (for multi-speaker models) */
  speakerId: z.number().int().optional(),
  /** Output sample rate */
  sampleRate: z.number().int().default(22050),
  /** Request timeout in ms */
  requestTimeoutMs: z.number().int().min(1000).default(30000),
});
export type PiperConfig = z.infer<typeof PiperConfigSchema>;

/** Gateway server config */
export const GatewayConfigSchema = z.object({
  /** HTTP port */
  port: z.number().int().min(1).max(65535).default(3100),
  /** WebSocket port */
  wsPort: z.number().int().min(1).max(65535).default(8180),
  /** CORS allowed origins */
  corsOrigins: z.array(z.string()).default(['http://localhost:5173']),
  /** Directory for temporary audio files */
  audioTempDir: z.string().default('/tmp/medisync-telephony'),
  /** Max days to keep transcripts */
  transcriptRetentionDays: z.number().int().default(3650), // 10 years default
  /** Max days to keep audio recordings */
  audioRetentionDays: z.number().int().default(90),
});
export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;

/** Complete telephony configuration */
export const TelephonyConfigSchema = z.object({
  starface: StarfaceConfigSchema,
  whisper: WhisperConfigSchema,
  ollama: OllamaConfigSchema,
  piper: PiperConfigSchema,
  gateway: GatewayConfigSchema,
});
export type TelephonyConfig = z.infer<typeof TelephonyConfigSchema>;

/**
 * Load configuration from environment variables.
 * All env vars are prefixed with TELEPHONY_ or specific service prefix.
 */
export function loadConfigFromEnv(): TelephonyConfig {
  return TelephonyConfigSchema.parse({
    starface: {
      baseUrl: process.env.STARFACE_BASE_URL || 'https://localhost:443',
      loginId: process.env.STARFACE_LOGIN_ID || '',
      password: process.env.STARFACE_PASSWORD || '',
      pollIntervalMs: parseInt(process.env.STARFACE_POLL_INTERVAL_MS || '2000', 10),
      requestTimeoutMs: parseInt(process.env.STARFACE_REQUEST_TIMEOUT_MS || '10000', 10),
      tlsRejectUnauthorized: process.env.STARFACE_TLS_REJECT_UNAUTHORIZED === 'true',
    },
    whisper: {
      endpoint: process.env.WHISPER_ENDPOINT || 'http://localhost:8178',
      model: process.env.WHISPER_MODEL || 'large-v3',
      language: process.env.WHISPER_LANGUAGE || 'de',
      requestTimeoutMs: parseInt(process.env.WHISPER_REQUEST_TIMEOUT_MS || '120000', 10),
      maxFileSizeBytes: parseInt(process.env.WHISPER_MAX_FILE_SIZE_BYTES || String(25 * 1024 * 1024), 10),
    },
    ollama: {
      endpoint: process.env.OLLAMA_ENDPOINT || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL || 'llama3.2',
      temperature: parseFloat(process.env.OLLAMA_TEMPERATURE || '0.2'),
      maxTokens: parseInt(process.env.OLLAMA_MAX_TOKENS || '2000', 10),
      requestTimeoutMs: parseInt(process.env.OLLAMA_REQUEST_TIMEOUT_MS || '60000', 10),
    },
    piper: {
      endpoint: process.env.PIPER_ENDPOINT || 'http://localhost:5030',
      voice: process.env.PIPER_VOICE || 'de_DE-thorsten-high',
      speakerId: process.env.PIPER_SPEAKER_ID ? parseInt(process.env.PIPER_SPEAKER_ID, 10) : undefined,
      sampleRate: parseInt(process.env.PIPER_SAMPLE_RATE || '22050', 10),
      requestTimeoutMs: parseInt(process.env.PIPER_REQUEST_TIMEOUT_MS || '30000', 10),
    },
    gateway: {
      port: parseInt(process.env.TELEPHONY_PORT || '3100', 10),
      wsPort: parseInt(process.env.TELEPHONY_WS_PORT || '8180', 10),
      corsOrigins: process.env.TELEPHONY_CORS_ORIGINS?.split(',') || ['http://localhost:5173'],
      audioTempDir: process.env.TELEPHONY_AUDIO_TEMP_DIR || '/tmp/medisync-telephony',
      transcriptRetentionDays: parseInt(process.env.TELEPHONY_TRANSCRIPT_RETENTION_DAYS || '3650', 10),
      audioRetentionDays: parseInt(process.env.TELEPHONY_AUDIO_RETENTION_DAYS || '90', 10),
    },
  });
}
