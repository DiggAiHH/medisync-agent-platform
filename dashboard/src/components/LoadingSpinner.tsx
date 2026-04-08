import React from 'react';
import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  message?: string;
  fullscreen?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'medium',
  message = 'Laden...',
  fullscreen = false,
}) => {
  const spinnerContent = (
    <div className={`loading-spinner loading-spinner--${size}`}>
      <div className="loading-spinner__circle">
        <div className="loading-spinner__segment loading-spinner__segment--1"></div>
        <div className="loading-spinner__segment loading-spinner__segment--2"></div>
        <div className="loading-spinner__segment loading-spinner__segment--3"></div>
        <div className="loading-spinner__segment loading-spinner__segment--4"></div>
      </div>
      {message && <p className="loading-spinner__message">{message}</p>}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="loading-spinner__overlay">
        {spinnerContent}
      </div>
    );
  }

  return spinnerContent;
};

// Skeleton Loader für Listen
interface SkeletonListProps {
  count?: number;
  height?: number;
}

export const SkeletonList: React.FC<SkeletonListProps> = ({
  count = 5,
  height = 60,
}) => {
  return (
    <div className="skeleton-list">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="skeleton-item"
          style={{ height: `${height}px` }}
        >
          <div className="skeleton-item__content">
            <div className="skeleton-item__line skeleton-item__line--1"></div>
            <div className="skeleton-item__line skeleton-item__line--2"></div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Skeleton Card
export const SkeletonCard: React.FC = () => {
  return (
    <div className="skeleton-card">
      <div className="skeleton-card__header">
        <div className="skeleton-card__title"></div>
        <div className="skeleton-card__subtitle"></div>
      </div>
      <div className="skeleton-card__body">
        <div className="skeleton-card__line"></div>
        <div className="skeleton-card__line"></div>
        <div className="skeleton-card__line"></div>
      </div>
    </div>
  );
};

// Error State
interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  message = 'Ein Fehler ist aufgetreten',
  onRetry,
}) => {
  return (
    <div className="error-state">
      <div className="error-state__icon">⚠️</div>
      <p className="error-state__message">{message}</p>
      {onRetry && (
        <button className="error-state__retry-btn" onClick={onRetry}>
          Erneut versuchen
        </button>
      )}
    </div>
  );
};

// Empty State
interface EmptyStateProps {
  icon?: string;
  title?: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = '📭',
  title = 'Keine Daten',
  message = 'Es sind noch keine Daten vorhanden.',
  action,
}) => {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <h3 className="empty-state__title">{title}</h3>
      <p className="empty-state__message">{message}</p>
      {action && (
        <button className="empty-state__action-btn" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
};

export default LoadingSpinner;
