import { useState } from 'react';
import { useCreateJob } from '../hooks/useJobs';

interface CreateJobModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateJobModal({ isOpen, onClose }: CreateJobModalProps) {
  const [userId, setUserId] = useState('');
  const [prompt, setPrompt] = useState('');
  const createJob = useCreateJob();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim() || !prompt.trim()) return;

    try {
      await createJob.mutateAsync({ userId, prompt });
      setUserId('');
      setPrompt('');
      onClose();
    } catch (error) {
      console.error('Failed to create job:', error);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Neuen Job erstellen</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="userId">User ID</label>
            <input
              type="text"
              id="userId"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="z.B. user-123"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="prompt">Prompt</label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Geben Sie Ihre Anfrage ein..."
              rows={5}
              required
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Abbrechen
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={createJob.isLoading || !userId.trim() || !prompt.trim()}
            >
              {createJob.isLoading ? (
                <>
                  <span className="spinner small" />
                  Erstelle...
                </>
              ) : (
                'Job erstellen'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
