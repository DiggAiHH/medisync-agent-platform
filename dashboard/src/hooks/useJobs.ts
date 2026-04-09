import { useQuery, useMutation, useQueryClient } from 'react-query';
import { getJobs, getJob, createJob, getJobStats } from '../api/jobs';
import { appConfig } from '../config';
import { demoJobs, demoStats, getDemoJob } from '../demoData';

const JOBS_KEY = 'jobs';
const JOB_STATS_KEY = 'jobStats';

// Hook für alle Jobs mit Auto-Refresh alle 5 Sekunden
export function useJobs() {
  return useQuery({
    queryKey: [JOBS_KEY],
    queryFn: async () => {
      if (appConfig.isDemoMode) {
        return demoJobs;
      }

      const response = await getJobs();
      return response.data;
    },
    refetchInterval: appConfig.isDemoMode ? false : 5000,
    refetchIntervalInBackground: !appConfig.isDemoMode,
    staleTime: appConfig.isDemoMode ? Infinity : 0,
  });
}

// Hook für einzelnen Job
export function useJob(id: string) {
  return useQuery({
    queryKey: [JOBS_KEY, id],
    queryFn: async () => {
      if (appConfig.isDemoMode) {
        return getDemoJob(id);
      }

      const response = await getJob(id);
      return response.data;
    },
    enabled: !!id,
    refetchInterval: appConfig.isDemoMode ? false : 5000,
    staleTime: appConfig.isDemoMode ? Infinity : 0,
  });
}

// Hook für Job Statistiken
export function useJobStats() {
  return useQuery({
    queryKey: [JOB_STATS_KEY],
    queryFn: async () => {
      if (appConfig.isDemoMode) {
        return demoStats;
      }

      const response = await getJobStats();
      return response.data;
    },
    refetchInterval: appConfig.isDemoMode ? false : 5000,
    staleTime: appConfig.isDemoMode ? Infinity : 0,
  });
}

// Hook für Job Erstellung
export function useCreateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, prompt }: { userId: string; prompt: string }) => {
      if (appConfig.isDemoMode) {
        throw new Error('Im Demo-Modus koennen keine neuen Jobs erstellt werden.');
      }

      const response = await createJob(userId, prompt);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate und refetch Jobs
      queryClient.invalidateQueries([JOBS_KEY]);
      queryClient.invalidateQueries([JOB_STATS_KEY]);
    },
  });
}

// Hook für manuelles Refetch
export function useRefreshJobs() {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries([JOBS_KEY]);
    queryClient.invalidateQueries([JOB_STATS_KEY]);
  };
}
