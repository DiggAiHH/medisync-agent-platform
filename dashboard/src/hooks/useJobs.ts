import { useQuery, useMutation, useQueryClient } from 'react-query';
import { getJobs, getJob, createJob, getJobStats } from '../api/jobs';
// Job type imported for future use

const JOBS_KEY = 'jobs';
const JOB_STATS_KEY = 'jobStats';

// Hook für alle Jobs mit Auto-Refresh alle 5 Sekunden
export function useJobs() {
  return useQuery({
    queryKey: [JOBS_KEY],
    queryFn: async () => {
      const response = await getJobs();
      return response.data;
    },
    refetchInterval: 5000, // Auto-Refresh alle 5 Sekunden
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
}

// Hook für einzelnen Job
export function useJob(id: string) {
  return useQuery({
    queryKey: [JOBS_KEY, id],
    queryFn: async () => {
      const response = await getJob(id);
      return response.data;
    },
    enabled: !!id,
    refetchInterval: 5000,
  });
}

// Hook für Job Statistiken
export function useJobStats() {
  return useQuery({
    queryKey: [JOB_STATS_KEY],
    queryFn: async () => {
      const response = await getJobStats();
      return response.data;
    },
    refetchInterval: 5000,
  });
}

// Hook für Job Erstellung
export function useCreateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, prompt }: { userId: string; prompt: string }) => {
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
