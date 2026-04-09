/**
 * Audio pipeline types.
 */

/** Supported audio formats */
export enum AudioFormat {
  WAV = 'wav',
  MP3 = 'mp3',
  OGG = 'ogg',
  FLAC = 'flac',
}

/** Audio file metadata */
export interface AudioFileInfo {
  path: string;
  format: AudioFormat;
  sizeBytes: number;
  durationMs?: number;
  sampleRate?: number;
  channels?: number;
}

/** Whisper transcription request */
export interface TranscriptionRequest {
  audioPath: string;
  language?: string;
  model?: string;
  /** Initial prompt to guide transcription (medical vocabulary hints) */
  initialPrompt?: string;
  /** Word-level timestamps */
  wordTimestamps?: boolean;
}

/** Whisper transcription segment */
export interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
}

/** Whisper transcription response */
export interface WhisperResponse {
  text: string;
  segments: WhisperSegment[];
  language: string;
  duration: number;
}

/** TTS synthesis request */
export interface SynthesisRequest {
  text: string;
  voice?: string;
  speakerId?: number;
  outputPath?: string;
  sampleRate?: number;
}

/** TTS synthesis response */
export interface SynthesisResult {
  audioPath: string;
  format: AudioFormat;
  sizeBytes: number;
  durationMs: number;
}

/** Streaming transcription progress callback */
export type TranscriptionProgressCallback = (progress: {
  segmentIndex: number;
  totalSegments?: number;
  partialText: string;
  isComplete: boolean;
}) => void;
