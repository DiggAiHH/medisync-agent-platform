import axios from 'axios';
import { appConfig } from '../config';

const API_BASE_URL = appConfig.apiUrl || '/';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

// GET /api/jobs - Alle Jobs holen
export const getJobs = () => api.get<Job[]>('/api/jobs');

// GET /api/jobs/:id - Einzelnen Job
export const getJob = (id: string) => api.get<Job>(`/api/jobs/${id}`);

// POST /api/jobs - Neuen Job erstellen
export const createJob = (userId: string, prompt: string) => 
  api.post<Job>('/api/jobs', { userId, prompt });

// GET /api/jobs/stats - Job Statistiken
export const getJobStats = () => api.get<JobStats>('/api/jobs/stats');

import type { Job, JobStats, CreateJobRequest } from '../types';
export type { Job, JobStats, CreateJobRequest };
