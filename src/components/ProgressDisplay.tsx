import React from 'react';
import type { SolverProgress } from '../solver/types';

interface ProgressDisplayProps {
  progress: SolverProgress;
}

const formatNumber = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
};

const formatTime = (ms: number): string => {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = (seconds % 60).toFixed(0);
  return `${minutes}m ${remainingSeconds}s`;
};

export const ProgressDisplay: React.FC<ProgressDisplayProps> = ({ progress }) => {
  const containerStyle: React.CSSProperties = {
    padding: '20px 24px',
    background: 'linear-gradient(145deg, rgba(22, 33, 62, 0.9), rgba(15, 52, 96, 0.9))',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    border: '1px solid rgba(255,255,255,0.1)',
    minWidth: '320px',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  };

  const titleStyle: React.CSSProperties = {
    fontFamily: 'var(--font-display)',
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--text-primary)',
  };

  const statusBadgeStyle: React.CSSProperties = {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'var(--font-mono)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    background:
      progress.status === 'running'
        ? 'rgba(78, 205, 196, 0.2)'
        : progress.status === 'complete'
        ? 'rgba(107, 203, 119, 0.2)'
        : progress.status === 'cancelled'
        ? 'rgba(233, 69, 96, 0.2)'
        : 'rgba(255, 255, 255, 0.1)',
    color:
      progress.status === 'running'
        ? '#4ecdc4'
        : progress.status === 'complete'
        ? '#6bcb77'
        : progress.status === 'cancelled'
        ? '#e94560'
        : 'var(--text-secondary)',
  };

  const statGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
    marginBottom: '16px',
  };

  const statBoxStyle: React.CSSProperties = {
    padding: '12px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '10px',
    textAlign: 'center',
  };

  const statLabelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px',
  };

  const statValueStyle: React.CSSProperties = {
    fontSize: '20px',
    fontWeight: 700,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-primary)',
  };

  const bestScoreStyle: React.CSSProperties = {
    ...statValueStyle,
    color: progress.bestScore > 0 ? 'var(--accent-gold)' : 'var(--text-primary)',
  };

  const progressBarContainer: React.CSSProperties = {
    height: '6px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '3px',
    overflow: 'hidden',
    position: 'relative',
  };

  const progressBarFill: React.CSSProperties = {
    height: '100%',
    background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
    borderRadius: '3px',
    transition: 'width 0.3s ease',
    width: progress.status === 'complete' ? '100%' : `${Math.max(1, progress.estimatedProgress)}%`,
  };

  const shimmerStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
    animation: progress.status === 'running' ? 'shimmer 1.5s infinite' : 'none',
  };

  const statusLabels: Record<string, string> = {
    running: 'En cours',
    complete: 'Terminé',
    cancelled: 'Annulé',
    idle: 'Prêt',
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>
          {progress.status === 'running' ? '🎲 Résolution...' : progress.status === 'complete' ? '✓ Solution trouvée' : progress.status === 'cancelled' ? '✗ Annulé' : 'Prêt'}
        </span>
        <span style={statusBadgeStyle}>{statusLabels[progress.status] || progress.status}</span>
      </div>

      <div style={statGridStyle}>
        <div style={statBoxStyle}>
          <div style={statLabelStyle}>Meilleur score</div>
          <div style={bestScoreStyle}>{progress.bestScore}</div>
        </div>
        <div style={statBoxStyle}>
          <div style={statLabelStyle}>Temps écoulé</div>
          <div style={statValueStyle}>{formatTime(progress.elapsedMs)}</div>
        </div>
        <div style={statBoxStyle}>
          <div style={statLabelStyle}>Explorées</div>
          <div style={statValueStyle}>{formatNumber(progress.explored)}</div>
        </div>
        <div style={statBoxStyle}>
          <div style={statLabelStyle}>Élaguées</div>
          <div style={statValueStyle}>{formatNumber(progress.pruned)}</div>
        </div>
      </div>

      <div style={progressBarContainer}>
        <div style={progressBarFill} />
        <div style={shimmerStyle} />
      </div>
    </div>
  );
};

// Add shimmer animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
`;
document.head.appendChild(styleSheet);

export default ProgressDisplay;
