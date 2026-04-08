import { useJob } from '../hooks/useJobs';
import { StatusBadge } from './StatusBadge';

interface JobDetailProps {
  jobId: string | null;
}

export function JobDetail({ jobId }: JobDetailProps) {
  const { data: job, isLoading, error } = useJob(jobId ?? '');

  if (!jobId) {
    return (
      <div className="job-detail-container">
        <div className="empty-detail">
          <p>Wählen Sie einen Job aus der Liste aus</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="job-detail-container">
        <div className="job-detail-loading">
          <div className="loading-spinner" />
          <p>Job wird geladen...</p>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="job-detail-container">
        <div className="job-detail-error">
          <p>⚠️ Fehler beim Laden des Jobs</p>
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
      second: '2-digit',
    });
  };

  return (
    <div className="job-detail-container">
      <div className="job-detail-header">
        <h2>Job Details</h2>
        <StatusBadge status={job.status} />
      </div>

      <div className="job-detail-content">
        <div className="detail-section">
          <h3>Informationen</h3>
          <div className="detail-grid">
            <div className="detail-item">
              <label>ID</label>
              <code>{job.id}</code>
            </div>
            <div className="detail-item">
              <label>User ID</label>
              <span>{job.userId}</span>
            </div>
            <div className="detail-item">
              <label>Erstellt</label>
              <span>{formatDate(job.createdAt)}</span>
            </div>
            <div className="detail-item">
              <label>Aktualisiert</label>
              <span>{formatDate(job.updatedAt)}</span>
            </div>
          </div>
        </div>

        <div className="detail-section">
          <h3>Prompt</h3>
          <div className="prompt-box">
            <pre>{job.prompt}</pre>
          </div>
        </div>

        {job.result && (
          <div className="detail-section">
            <h3>Ergebnis</h3>
            <div className="result-box">
              <pre>{job.result}</pre>
            </div>
          </div>
        )}

        {job.error && (
          <div className="detail-section">
            <h3>Fehler</h3>
            <div className="error-box">
              <pre>{job.error}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
