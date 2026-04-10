import { useState } from 'react';
import { StatsPanel } from './components/StatsPanel';
import { JobList } from './components/JobList';
import { JobDetail } from './components/JobDetail';
import { StreamingView } from './components/StreamingView';
import { CreateJobModal } from './components/CreateJobModal';
import { appConfig } from './config';
import type { Job } from './types';
import './App.css';

function App() {
  const isDemoMode = appConfig.isDemoMode;
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'detail'>('overview');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const handleSelectJob = (job: Job) => {
    setSelectedJob(job);
    setActiveTab('detail');
  };

  const handleBackToOverview = () => {
    setActiveTab('overview');
    setSelectedJob(null);
  };

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">🏥</span>
            <h1>MediSync</h1>
          </div>
          <p className="logo-subtitle">Agent Dashboard</p>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={handleBackToOverview}
          >
            <span className="nav-icon">📊</span>
            Übersicht
          </button>
          <button
            className={`nav-item ${activeTab === 'detail' ? 'active' : ''}`}
            onClick={() => selectedJob && setActiveTab('detail')}
            disabled={!selectedJob}
          >
            <span className="nav-icon">📄</span>
            Job Details
          </button>
        </nav>

        <div className="sidebar-footer">
          <button
            className="btn-create-job"
            onClick={() => !isDemoMode && setIsCreateModalOpen(true)}
            disabled={isDemoMode}
            title={isDemoMode ? 'In der oeffentlichen Vorschau deaktiviert' : undefined}
          >
            <span>+</span>
            Neuer Job
          </button>
          {isDemoMode && <p className="sidebar-note">Demo-Modus aktiv</p>}
          <div className="sidebar-contact">
            <p className="sidebar-contact-label">Kontakt</p>
            <a className="sidebar-contact-link" href="mailto:Diggai@tutanota.de">
              Diggai@tutanota.de
            </a>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {isDemoMode && (
          <section className="demo-banner">
            <p className="demo-eyebrow">Oeffentliche Vorschau</p>
            <h2>Dashboard-Demo fuer Kunden</h2>
            <p>
              Diese Bereitstellung zeigt Beispieldaten. Fuer Live-Daten koennen spaeter
              VITE_API_URL und VITE_WS_URL hinterlegt werden.
            </p>
          </section>
        )}

        {activeTab === 'overview' ? (
          <>
            <header className="content-header">
              <h1>Dashboard</h1>
              <p>{isDemoMode ? 'Interaktive Produktvorschau mit Demo-Daten' : 'Übersicht aller Agent-Jobs'}</p>
            </header>

            <section className="stats-section">
              <StatsPanel />
            </section>

            <section className="jobs-section">
              <JobList
                selectedJobId={selectedJob?.id ?? null}
                onSelectJob={handleSelectJob}
              />
            </section>

            <section className="streaming-section">
              <StreamingView jobId={selectedJob?.id ?? null} />
            </section>
          </>
        ) : (
          <>
            <header className="content-header">
              <button className="btn-back" onClick={handleBackToOverview}>
                ← Zurück zur Übersicht
              </button>
            </header>
            <JobDetail jobId={selectedJob?.id ?? null} />
          </>
        )}
      </main>

      {/* Create Job Modal */}
      {!isDemoMode && (
        <CreateJobModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
