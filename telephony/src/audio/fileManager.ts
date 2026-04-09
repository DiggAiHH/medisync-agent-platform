/**
 * Audio File Manager.
 * Handles temporary audio file storage, cleanup, and format detection.
 * Ensures audio files are properly managed and cleaned up.
 */
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AudioFileInfo, AudioFormat } from './types';

export class AudioFileManager {
  private _tempDir: string;
  /** Track managed files for cleanup */
  private _managedFiles: Map<string, { createdAt: number; path: string }> = new Map();

  constructor(tempDir: string) {
    this._tempDir = tempDir;
    if (!fs.existsSync(this._tempDir)) {
      fs.mkdirSync(this._tempDir, { recursive: true });
    }
  }

  /**
   * Save an audio buffer to a temporary file.
   * Returns file info with path.
   */
  public saveTemp(buffer: Buffer, format: AudioFormat = AudioFormat.WAV, prefix = 'call'): AudioFileInfo {
    const filename = `${prefix}_${uuidv4()}.${format}`;
    const filePath = path.join(this._tempDir, filename);

    fs.writeFileSync(filePath, buffer);

    const info: AudioFileInfo = {
      path: filePath,
      format,
      sizeBytes: buffer.length,
    };

    this._managedFiles.set(filePath, { createdAt: Date.now(), path: filePath });

    return info;
  }

  /**
   * Get info about an existing audio file.
   */
  public getFileInfo(filePath: string): AudioFileInfo | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const format = Object.values(AudioFormat).includes(ext as AudioFormat)
      ? (ext as AudioFormat)
      : AudioFormat.WAV;

    return {
      path: filePath,
      format,
      sizeBytes: stats.size,
    };
  }

  /**
   * Delete a specific audio file.
   */
  public deleteFile(filePath: string): boolean {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this._managedFiles.delete(filePath);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Clean up temporary files older than maxAgeMs.
   * Returns number of files deleted.
   */
  public cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let deleted = 0;

    for (const [filePath, meta] of this._managedFiles) {
      if (now - meta.createdAt > maxAgeMs) {
        if (this.deleteFile(filePath)) {
          deleted++;
        }
      }
    }

    // Also scan temp dir for orphaned files
    try {
      const files = fs.readdirSync(this._tempDir);
      for (const file of files) {
        const fullPath = path.join(this._tempDir, file);
        if (!this._managedFiles.has(fullPath)) {
          const stats = fs.statSync(fullPath);
          if (now - stats.mtimeMs > maxAgeMs) {
            fs.unlinkSync(fullPath);
            deleted++;
          }
        }
      }
    } catch {
      // Ignore cleanup errors
    }

    return deleted;
  }

  /**
   * Move an audio file to a permanent storage location.
   */
  public moveToPermanent(tempPath: string, permanentDir: string, filename?: string): string {
    if (!fs.existsSync(permanentDir)) {
      fs.mkdirSync(permanentDir, { recursive: true });
    }

    const finalName = filename || path.basename(tempPath);
    const permanentPath = path.join(permanentDir, finalName);

    fs.copyFileSync(tempPath, permanentPath);
    this.deleteFile(tempPath);

    return permanentPath;
  }

  /**
   * Get the temp directory path.
   */
  public getTempDir(): string {
    return this._tempDir;
  }

  /**
   * Get count of managed files.
   */
  public getManagedFileCount(): number {
    return this._managedFiles.size;
  }
}
