/**
 * Streaming Transcription Wrapper.
 * Wraps Whisper for progressive transcription updates,
 * useful for real-time UI feedback during long audio files.
 */
import { WhisperLocal } from './whisperLocal';
import { TranscriptionRequest, TranscriptionProgressCallback, WhisperResponse } from './types';
import { Transcript, TranscriptSegment } from '../shared/types';
import { v4 as uuidv4 } from 'uuid';

export class StreamingTranscription {
  private _whisper: WhisperLocal;

  constructor(whisper: WhisperLocal) {
    this._whisper = whisper;
  }

  /**
   * Transcribe with progress updates.
   * Since whisper.cpp processes the whole file at once, we simulate streaming
   * by emitting segments progressively after completion.
   */
  public async transcribe(
    request: TranscriptionRequest,
    callId: string,
    onProgress?: TranscriptionProgressCallback
  ): Promise<Transcript> {
    const startTime = Date.now();

    // Perform full transcription
    const response = await this._whisper.transcribe(request);

    // Emit segments progressively
    if (onProgress) {
      const segments = response.segments;
      for (let i = 0; i < segments.length; i++) {
        const partialText = segments
          .slice(0, i + 1)
          .map((s) => s.text)
          .join(' ')
          .trim();

        onProgress({
          segmentIndex: i,
          totalSegments: segments.length,
          partialText,
          isComplete: i === segments.length - 1,
        });
      }
    }

    const processingTimeMs = Date.now() - startTime;

    return this._toTranscript(response, callId, request.model || 'default', processingTimeMs);
  }

  /**
   * Transcribe without progress (simple wrapper).
   */
  public async transcribeSimple(
    request: TranscriptionRequest,
    callId: string
  ): Promise<Transcript> {
    return this.transcribe(request, callId);
  }

  /**
   * Convert WhisperResponse to our Transcript format.
   */
  private _toTranscript(
    response: WhisperResponse,
    callId: string,
    model: string,
    processingTimeMs: number
  ): Transcript {
    const segments: TranscriptSegment[] = WhisperLocal.toTranscriptSegments(response.segments);

    return {
      id: uuidv4(),
      callId,
      segments,
      fullText: response.text.trim(),
      language: response.language,
      model,
      processingTimeMs,
      createdAt: new Date().toISOString(),
    };
  }
}
