import { useJobStats } from '../hooks/useJobs';

export function StatsPanel() {
  const { data: stats, isLoading, error } = useJobStats();

  if (isLoading) {
    return (
      <div className="stats-panel">
        <div className="stat-card loading">
          <div className="stat-skeleton" />
        </div>
        <div className="stat-card loading">
          <div className="stat-skeleton" />
        </div>
        <div className="stat-card loading">
          <div className="stat-skeleton" />
        </div>
        <div className="stat-card loading">
          <div className="stat-skeleton" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="stats-panel">
        <div className="stat-card error">
          <span className="stat-value">-</span>
          <span className="stat-label">Fehler beim Laden</span>
        </div>
      </div>
    );
  }

  const statItems = [
    { label: 'Gesamt Jobs', value: stats?.total ?? 0, color: 'primary' },
    { label: 'Aktiv', value: stats?.active ?? 0, color: 'warning' },
    { label: 'Abgeschlossen', value: stats?.completed ?? 0, color: 'success' },
    { label: 'Fehlgeschlagen', value: stats?.failed ?? 0, color: 'error' },
  ];

  return (
    <div className="stats-panel">
      {statItems.map((item) => (
        <div key={item.label} className={`stat-card ${item.color}`}>
          <span className="stat-value">{item.value}</span>
          <span className="stat-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
