import React from 'react';
import type { Grid, ScoreBreakdown } from '../solver/types';
import DetrakSymbol from './DetrakSymbol';

interface GameGridProps {
  grid: Grid;
  scoreBreakdown?: ScoreBreakdown;
  highlightCells?: Set<string>; // "row,col" format
  animated?: boolean;
}

const SCORE_COLOR = (score: number): string => {
  if (score >= 8) return 'var(--accent-gold)';
  if (score >= 3) return 'var(--accent-green)';
  if (score >= 0) return 'var(--text-primary)';
  return 'var(--accent-primary)';
};

export const GameGrid: React.FC<GameGridProps> = ({
  grid,
  scoreBreakdown,
  highlightCells,
  animated = false,
}) => {
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0',
    padding: '20px',
    background: 'linear-gradient(145deg, rgba(22, 33, 62, 0.9), rgba(15, 52, 96, 0.9))',
    borderRadius: '20px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    border: '1px solid rgba(255,255,255,0.1)',
  };

  const gridContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
  };

  const cellStyle = (row: number, col: number): React.CSSProperties => ({
    animation: animated ? `fadeIn 0.3s ease ${(row * 5 + col) * 0.05}s both` : undefined,
  });

  const scoreStyle = (score: number): React.CSSProperties => ({
    width: '40px',
    textAlign: 'center',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    fontSize: '14px',
    color: SCORE_COLOR(score),
    padding: '4px 0',
    background: 'rgba(0,0,0,0.2)',
    borderRadius: '6px',
  });

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    gap: '4px',
    marginBottom: '8px',
    alignItems: 'center',
  };

  const colScoreStyle = (score: number): React.CSSProperties => ({
    width: '48px',
    textAlign: 'center',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    fontSize: '14px',
    color: SCORE_COLOR(score),
    background: 'rgba(0,0,0,0.2)',
    borderRadius: '6px',
    padding: '4px 0',
  });

  const diagAntiStyle = (score: number): React.CSSProperties => ({
    textAlign: 'center',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    fontSize: '14px',
    color: SCORE_COLOR(score),
    background: 'rgba(0,0,0,0.2)',
    borderRadius: '6px',
    padding: '4px 8px',
  });

  const totalStyle: React.CSSProperties = {
    marginTop: '16px',
    padding: '12px 20px',
    background: 'linear-gradient(135deg, rgba(233, 69, 96, 0.3), rgba(255, 107, 107, 0.3))',
    borderRadius: '12px',
    textAlign: 'center',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '24px',
    color: 'var(--accent-gold)',
    letterSpacing: '0.5px',
  };

  return (
    <div style={containerStyle}>
      {/* Column scores header + anti-diagonal */}
      {scoreBreakdown && (
        <div style={headerStyle}>
          {scoreBreakdown.cols.map((score, i) => (
            <div key={i} style={colScoreStyle(score)}>
              {score > 0 ? `+${score}` : score}
            </div>
          ))}
          <div style={{ marginLeft: '8px', ...diagAntiStyle(scoreBreakdown.diagAnti) }}>
            {scoreBreakdown.diagAnti > 0 ? `×2 +${scoreBreakdown.diagAnti}` : `×2 ${scoreBreakdown.diagAnti}`}
          </div>
        </div>
      )}

      {/* Grid with row scores */}
      <div style={gridContainerStyle}>
        {grid.map((row, rowIdx) => (
          <div key={rowIdx} style={rowStyle}>
            {row.map((cell, colIdx) => (
              <div key={colIdx} style={cellStyle(rowIdx, colIdx)}>
                <DetrakSymbol
                  value={cell}
                  size="md"
                  highlight={highlightCells?.has(`${rowIdx},${colIdx}`)}
                />
              </div>
            ))}
            {scoreBreakdown && (
              <div style={{ marginLeft: '8px', ...scoreStyle(scoreBreakdown.rows[rowIdx]) }}>
                {scoreBreakdown.rows[rowIdx] > 0 ? `+${scoreBreakdown.rows[rowIdx]}` : scoreBreakdown.rows[rowIdx]}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Total score */}
      {scoreBreakdown && (
        <div style={totalStyle}>
          Total : {scoreBreakdown.total} points
        </div>
      )}
    </div>
  );
};

// Add keyframes for animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.8);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
`;
document.head.appendChild(styleSheet);

export default GameGrid;
