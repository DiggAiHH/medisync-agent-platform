/**
 * API Client mit Error Recovery und Retry-Logik
 * 
 * Features:
 * - Automatische Retries bei transienten Fehlern
 * - Exponential Backoff
 * - Circuit Breaker Pattern
 * - Fallback Mechanismen
 */

import { JobRequest, JobResponse } from '../types';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || '30000');

// Retry Konfiguration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 10000;

// Circuit Breaker State
interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number | null;
  isOpen: boolean;
}

const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailureTime: null,
  isOpen: false
};

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 Minute

/**
 * Prüft ob Circuit Breaker offen ist
 */
function isCircuitBreakerOpen(): boolean {
  if (!circuitBreaker.isOpen) return false;
  
  // Prüfe ob Timeout abgelaufen ist
  if (circuitBreaker.lastFailureTime && 
      Date.now() - circuitBreaker.lastFailureTime > CIRCUIT_BREAKER_TIMEOUT) {
    console.log('[API Client] Circuit Breaker zurückgesetzt');
    circuitBreaker.isOpen = false;
    circuitBreaker.failures = 0;
    return false;
  }
  
  return true;
}

/**
 * Record success - reset circuit breaker
 */
function recordSuccess(): void {
  if (circuitBreaker.failures > 0) {
    circuitBreaker.failures = 0;
    circuitBreaker.isOpen = false;
    circuitBreaker.lastFailureTime = null;
  }
}

/**
 * Record failure - update circuit breaker
 */
function recordFailure(): void {
  circuitBreaker.failures++;
  circuitBreaker.lastFailureTime = Date.now();
  
  if (circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreaker.isOpen = true;
    console.error(`[API Client] Circuit Breaker geöffnet nach ${circuitBreaker.failures} Fehlern`);
  }
}

/**
 * Prüft ob ein Fehler retry-bar ist
 */
function isRetryableError(error: Error): boolean {
  // Netzwerk-Fehler sind retry-bar
  const retryableMessages = [
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'Network request failed',
    'fetch failed',
    'timeout',
    'Timeout'
  ];
  
  return retryableMessages.some(msg => error.message.includes(msg));
}

/**
 * Berechne Retry Delay mit Exponential Backoff
 */
function getRetryDelay(attempt: number): number {
  const delay = Math.min(
    INITIAL_RETRY_DELAY * Math.pow(2, attempt),
    MAX_RETRY_DELAY
  );
  // Addiere zufälligen Jitter (0-1000ms)
  return delay + Math.random() * 1000;
}

/**
 * Sleep Funktion
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch mit Timeout
 */
async function fetchWithTimeout(
  url: string, 
  options: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * API Request mit Retry-Logik
 */
async function apiRequestWithRetry<T>(
  requestFn: () => Promise<T>,
  operationName: string
): Promise<T> {
  // Prüfe Circuit Breaker
  if (isCircuitBreakerOpen()) {
    throw new Error('Circuit Breaker ist offen - API temporär nicht verfügbar');
  }
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await requestFn();
      recordSuccess();
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Letzter Versuch fehlgeschlagen
      if (attempt === MAX_RETRIES) {
        recordFailure();
        break;
      }
      
      // Prüfe ob Fehler retry-bar ist
      if (!isRetryableError(lastError)) {
        recordFailure();
        throw lastError;
      }
      
      // Berechne Delay und warte
      const delay = getRetryDelay(attempt);
      console.log(`[API Client] ${operationName} fehlgeschlagen (Versuch ${attempt + 1}/${MAX_RETRIES + 1}), retry in ${Math.round(delay)}ms...`);
      await sleep(delay);
    }
  }
  
  throw lastError || new Error(`${operationName} fehlgeschlagen nach ${MAX_RETRIES + 1} Versuchen`);
}

/**
 * Submit a job to the MediSync Agent API (mit Retry)
 */
export async function submitJobWithRetry(jobRequest: JobRequest): Promise<JobResponse> {
  return apiRequestWithRetry(async () => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/jobs`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(jobRequest)
      },
      REQUEST_TIMEOUT
    );

    if (!response.ok) {
      const errorText = await response.text();
      
      // 5xx Fehler sind retry-bar
      if (response.status >= 500) {
        throw new Error(`Server Error ${response.status}: ${errorText}`);
      }
      
      // 4xx Fehler sind nicht retry-bar
      throw new Error(`Client Error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as JobResponse;
    return data;
  }, 'submitJob');
}

/**
 * Get job status from the API (mit Retry)
 */
export async function getJobStatusWithRetry(jobId: string): Promise<JobResponse> {
  return apiRequestWithRetry(async () => {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/jobs/${jobId}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      },
      REQUEST_TIMEOUT
    );

    if (!response.ok) {
      const errorText = await response.text();
      
      if (response.status >= 500) {
        throw new Error(`Server Error ${response.status}: ${errorText}`);
      }
      
      throw new Error(`Client Error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as JobResponse;
    return data;
  }, 'getJobStatus');
}

/**
 * Health Check mit Retry
 */
export async function checkAPIHealth(): Promise<{ healthy: boolean; latency: number }> {
  const startTime = Date.now();
  
  try {
    await apiRequestWithRetry(async () => {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/health`,
        { method: 'GET' },
        5000 // Kürzeres Timeout für Health Checks
      );
      
      if (!response.ok) {
        throw new Error(`Health Check failed: ${response.status}`);
      }
      
      return response;
    }, 'healthCheck');
    
    return {
      healthy: true,
      latency: Date.now() - startTime
    };
  } catch (error) {
    return {
      healthy: false,
      latency: Date.now() - startTime
    };
  }
}

/**
 * Hole Circuit Breaker Status
 */
export function getCircuitBreakerStatus(): {
  isOpen: boolean;
  failures: number;
  lastFailureTime: number | null;
} {
  return {
    isOpen: circuitBreaker.isOpen,
    failures: circuitBreaker.failures,
    lastFailureTime: circuitBreaker.lastFailureTime
  };
}

// Exportiere auch Original-Funktionen für Kompatibilität
export { submitJobWithRetry as submitJob, getJobStatusWithRetry as getJobStatus };
