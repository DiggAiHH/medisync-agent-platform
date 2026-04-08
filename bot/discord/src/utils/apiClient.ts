import { JobRequest, JobResponse } from '../types';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || '30000');

/**
 * Submit a job to the MediSync Agent API
 */
export async function submitJob(jobRequest: JobRequest): Promise<JobResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${API_BASE_URL}/api/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(jobRequest),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as JobResponse;
    return data;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - the API did not respond in time');
      }
      throw error;
    }
    throw new Error('Unknown error occurred while submitting job');
  }
}

/**
 * Get job status from the API
 */
export async function getJobStatus(jobId: string): Promise<JobResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as JobResponse;
    return data;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - the API did not respond in time');
      }
      throw error;
    }
    throw new Error('Unknown error occurred while checking job status');
  }
}
