/**
 * Transcript routes.
 * REST endpoints for transcript management.
 */
import { Router, Request, Response } from 'express';
import { WhisperLocal, AudioFileManager, StreamingTranscription } from '../../audio';
import { getGermanWhisperConfig } from '../../audio/germanConfig';
import { AuditLogger } from '../../compliance';
import { AuditAction } from '../../compliance/types';
import { AudioFormat } from '../../audio';

export interface TranscriptDependencies {
  whisper: WhisperLocal;
  audioFileManager: AudioFileManager;
  streamingTranscription: StreamingTranscription;
  auditLogger: AuditLogger;
}

export function createTranscriptRoutes(deps: TranscriptDependencies): Router {
  const router = Router();

  /**
   * POST /transcripts/upload
   * Upload an audio file for transcription.
   * Expects multipart/form-data with 'audio' field.
   */
  router.post('/upload', async (req: Request, res: Response) => {
    // Expect raw audio in request body (simplified; production would use multer)
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const audioBuffer = Buffer.concat(chunks);
        if (audioBuffer.length === 0) {
          res.status(400).json({ error: 'No audio data received' });
          return;
        }

        const callId = (req.query.callId as string) || 'manual';

        // Save to temp file
        const fileInfo = deps.audioFileManager.saveTemp(audioBuffer, AudioFormat.WAV, 'upload');

        // Transcribe
        const germanConfig = getGermanWhisperConfig();
        const transcript = await deps.streamingTranscription.transcribe(
          {
            audioPath: fileInfo.path,
            language: germanConfig.language,
            initialPrompt: germanConfig.initialPrompt,
          },
          callId
        );

        deps.auditLogger.log({
          action: AuditAction.TRANSCRIPT_CREATED,
          resourceType: 'transcript',
          resourceId: transcript.id,
          actor: 'api',
          metadata: { segments: transcript.segments.length },
        });

        // Cleanup temp file
        deps.audioFileManager.deleteFile(fileInfo.path);

        res.json(transcript);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Transcription failed';
        res.status(500).json({ error: message });
      }
    });
  });

  return router;
}
