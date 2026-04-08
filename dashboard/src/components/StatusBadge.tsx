import type { JobStatus } from '../types';

interface StatusBadgeProps {
  status: JobStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const getStatusClass = () => {
    switch (status) {
      case 'pending':
        return 'status-pending';
      case 'processing':
        return 'status-processing';
      case 'completed':
        return 'status-completed';
      case 'failed':
        return 'status-failed';
      default:
        return '';
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'pending':
        return 'Ausstehend';
      case 'processing':
        return 'In Bearbeitung';
      case 'completed':
        return 'Abgeschlossen';
      case 'failed':
        return 'Fehlgeschlagen';
      default:
        return status;
    }
  };

  return (
    <span className={`status-badge ${getStatusClass()}`}>
      {status === 'processing' && <span className="spinner" />}
      {getStatusLabel()}
    </span>
  );
}
