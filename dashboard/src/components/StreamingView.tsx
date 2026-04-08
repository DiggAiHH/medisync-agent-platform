import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import type { WebSocketMessage } from '../types';

interface StreamingViewProps {
  jobId: string | null;
}

export function StreamingView({ jobId }: StreamingViewProps) {
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

  const { isConnected } = useWebSocket('ws://localhost:8080', {
    onMessage: handleMessage,
  });

  // Clear stream when job changes
  useEffect(() => {
    setStreamContent('');
    setIsStreaming(false);
  }, [jobId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamContent]);

  if (!jobId) {
    return (
      <div className="streaming-view">
        <div className="streaming-header">
          <h3>🔴 Live Stream</h3>
          <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? 'Verbunden' : 'Getrennt'}
          </span>
        </div>
        <div className="streaming-content empty">
          <p>Wählen Sie einen Job aus, um den Live-Stream zu sehen</p>
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
          <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? 'Verbunden' : 'Getrennt'}
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
