import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { appConfig } from '../config';
import { getDemoJob, getDemoStreamContent } from '../demoData';
import type { WebSocketMessage } from '../types';

interface StreamingViewProps {
  jobId: string | null;
}

export function StreamingView({ jobId }: StreamingViewProps) {
  const isDemoMode = appConfig.isDemoMode;
  const [streamContent, setStreamContent] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleMessage = (message: WebSocketMessage) => {
    switch (message.type) {
      case 'stream_chunk':
        if (message.jobId === jobId) {
          setStreamContent((prev) => prev + (message.chunk || ''));
          setIsStreaming(true);
        }
        break;
      case 'stream_end':
        if (message.jobId === jobId) {
          setIsStreaming(false);
        }
        break;
      case 'job_update':
        if (message.jobId === jobId && message.data?.status !== 'processing') {
          setIsStreaming(false);
        }
        break;
    }
  };

  const { isConnected } = useWebSocket(appConfig.wsUrl, {
    onMessage: handleMessage,
    enabled: !isDemoMode && Boolean(appConfig.wsUrl),
  });

  // Clear stream when job changes
  useEffect(() => {
    if (isDemoMode) {
      const demoJob = jobId ? getDemoJob(jobId) : undefined;
      setStreamContent(jobId ? getDemoStreamContent(jobId) : '');
      setIsStreaming(demoJob?.status === 'processing');
      return;
    }

    setStreamContent('');
    setIsStreaming(false);
  }, [isDemoMode, jobId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamContent]);

  const connectionActive = isDemoMode || isConnected;
  const connectionLabel = isDemoMode ? 'Demo' : isConnected ? 'Verbunden' : 'Getrennt';

  if (!jobId) {
    return (
      <div className="streaming-view">
        <div className="streaming-header">
          <h3>🔴 Live Stream</h3>
          <span className={`connection-status ${connectionActive ? 'connected' : 'disconnected'}`}>
            {connectionLabel}
          </span>
        </div>
        <div className="streaming-content empty">
          <p>Wählen Sie einen Job aus, um die Stream-Vorschau zu sehen</p>
        </div>
      </div>
    );
  }

  return (
    <div className="streaming-view">
      <div className="streaming-header">
        <h3>🔴 Live Stream</h3>
        <div className="streaming-status">
          {isStreaming && <span className="streaming-indicator">Streaming...</span>}
          <span className={`connection-status ${connectionActive ? 'connected' : 'disconnected'}`}>
            {connectionLabel}
          </span>
        </div>
      </div>
      <div className="streaming-content" ref={scrollRef}>
        {streamContent ? (
          <pre className="stream-text">{streamContent}</pre>
        ) : (
          <div className="stream-placeholder">
            {isStreaming ? (
              <div className="waiting-stream">
                <div className="loading-spinner small" />
                <span>Warte auf Daten...</span>
              </div>
            ) : (
              <p>Keine Stream-Daten verfügbar</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
