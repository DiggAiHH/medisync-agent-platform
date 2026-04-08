import { useJobs } from '../hooks/useJobs';
import { StatusBadge } from './StatusBadge';
import type { Job } from '../types';

interface JobListProps {
  selectedJobId: string | null;
  onSelectJob: (job: Job) => void;
}

export function JobList({ selectedJobId, onSelectJob }: JobListProps) {
  const { data: jobs, isLoading, error } = useJobs();

  if (isLoading) {
    return (
      <div className="job-list-container">
        <h2>Jobs</h2>
        <div className="job-list-loading">
          <div className="loading-spinner" />
          <p>Jobs werden geladen...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="job-list-container">
        <h2>Jobs</h2>
        <div className="job-list-error">
          <p>⚠️ Fehler beim Laden der Jobs</p>
          <button onClick={() => window.location.reload()}>Erneut versuchen</button>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const truncateText = (text: string, maxLength: number = 50) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="job-list-container">
      <h2>Jobs ({jobs?.length ?? 0})</h2>
      <div className="job-table-wrapper">
        <table className="job-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>User</th>
              <th>Prompt</th>
              <th>Status</th>
              <th>Erstellt</th>
            </tr>
          </thead>
          <tbody>
            {jobs?.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-state">
                  Keine Jobs vorhanden
                </td>
              </tr>
            ) : (
              jobs?.map((job) => (
                <tr
                  key={job.id}
                  className={selectedJobId === job.id ? 'selected' : ''}
                  onClick={() => onSelectJob(job)}
                >
                  <td className="job-id" title={job.id}>
                    {job.id.slice(0, 8)}...
                  </td>
                  <td>{job.userId}</td>
                  <td className="job-prompt" title={job.prompt}>
                    {truncateText(job.prompt, 40)}
                  </td>
                  <td>
                    <StatusBadge status={job.status} />
                  </td>
                  <td>{formatDate(job.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
