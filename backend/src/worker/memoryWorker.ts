/**
 * Memory Worker
 * 
 * Startet den Worker für die In-Memory Queue.
 * In agentWorker.ts ist bereits ein Memory Worker integriert,
 * daher reicht es hier, createWorker() aufzurufen.
 */

import { createWorker, stopWorker, getWorkerStats } from './agentWorker';
import { isMemoryQueue } from '../queue/agentQueue';

/**
 * Startet den Worker (automatisch Memory oder Redis)
 */
export async function startWorker(): Promise<void> {
  if (!isMemoryQueue) {
    console.log('[Worker] Redis Mode - verwende separaten Worker-Prozess');
    return;
  }

  console.log('[Worker] Memory Mode - starte integrierten Worker');
  createWorker();
}

/**
 * Stoppt den Worker
 */
export async function stopMemoryWorker(): Promise<void> {
  await stopWorker();
}

/**
 * Prüft ob Memory Queue verwendet wird
 */
export function isMemoryMode(): boolean {
  return isMemoryQueue;
}

// Re-exports
export { getWorkerStats };
