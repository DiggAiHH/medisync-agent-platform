import axios, { AxiosInstance, AxiosError } from 'axios';
import { JobRequest, JobResponse } from '../types';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || '30000');

/**
 * Axios-based API Client for MediSync Agent API
 * Alternative to fetch-based apiClient.ts
 * 
 * To use this instead of fetch:
 * 1. Install axios: npm install axios
 * 2. Update imports in agentCommand.ts to use this file
 */
class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: REQUEST_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[ApiClient] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.code === 'ECONNREFUSED') {
          throw new Error('Verbindung zur MediSync API fehlgeschlagen. Ist der Server erreichbar?');
        }
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
          throw new Error('Request timeout - the API did not respond in time');
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Create a new job
   * POST /api/jobs
   */
  async createJob(prompt: string, userId: string, sessionId: string): Promise<JobResponse> {
    try {
      const response = await this.client.post<JobResponse>('/api/jobs', {
        prompt,
        userId,
        sessionId
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.response) {
          throw new Error(`API Error ${axiosError.response.status}: ${JSON.stringify(axiosError.response.data)}`);
        }
        throw new Error(axiosError.message);
      }
      throw error;
    }
  }

  /**
   * Get job status by ID
   * GET /api/jobs/:jobId
   */
  async getJob(jobId: string): Promise<JobResponse> {
    try {
      const response = await this.client.get<JobResponse>(`/api/jobs/${jobId}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.response?.status === 404) {
          throw new Error(`Job ${jobId} not found`);
        }
        if (axiosError.response) {
          throw new Error(`API Error ${axiosError.response.status}: ${JSON.stringify(axiosError.response.data)}`);
        }
        throw new Error(axiosError.message);
      }
      throw error;
    }
  }

  /**
   * Check API health
   * GET /health
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/health', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export convenience functions matching the original apiClient.ts interface
export async function submitJob(jobRequest: JobRequest): Promise<JobResponse> {
  return apiClient.createJob(jobRequest.prompt, jobRequest.userId, jobRequest.sessionId);
}

export async function getJobStatus(jobId: string): Promise<JobResponse> {
  return apiClient.getJob(jobId);
}

// Default export for flexibility
export default apiClient;
