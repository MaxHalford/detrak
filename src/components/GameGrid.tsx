import React, { useState } from 'react';
import type { Grid, ScoreBreakdown, Placement } from '../solver/types';
import DetrakSymbol from './DetrakSymbol';

interface GameGridProps {
  grid: Grid;
  scoreBreakdown?: ScoreBreakdown;
  placements?: Placement[];
  highlightCells?: Set<string>; // "row,col" format
  animated?: boolean;
}

// Build a map of cell position to domino index
function buildDominoMap(placements: Placement[]): Map<string, number> {
  const map = new Map<string, number>();
  placements.forEach((p, idx) => {
    map.set(`${p.pos1.row},${p.pos1.col}`, idx);
    map.set(`${p.pos2.row},${p.pos2.col}`, idx);
  });
  return map;
}

// Get direction to partner cell in domino
function getDominoDirection(
  row: number,
  col: number,
  dominoMap: Map<string, number>
): 'top' | 'right' | 'bottom' | 'left' | null {
  const cellKey = `${row},${col}`;
  const dominoIdx = dominoMap.get(cellKey);
  if (dominoIdx === undefined) return null;

  const directions = [
    { key: `${row - 1},${col}`, dir: 'top' as const },
    { key: `${row},${col + 1}`, dir: 'right' as const },
    { key: `${row + 1},${col}`, dir: 'bottom' as const },
    { key: `${row},${col - 1}`, dir: 'left' as const },
  ];

  for (const { key, dir } of directions) {
    if (dominoMap.get(key) === dominoIdx) return dir;
  }
  return null;
}

const SCORE_COLOR = (score: number): string => {
  if (score >= 8) return 'var(--accent-gold)';
  if (score >= 3) return 'var(--accent-green)';
  if (score >= 0) return 'var(--text-primary)';
  return 'var(--accent-primary)';
};

const GAP = 4; // Consistent gap between all cells

export const GameGrid: React.FC<GameGridProps> = ({
  grid,
  scoreBreakdown,
  placements,
  highlightCells,
  animated = false,
}) => {
  const [hoveredDomino, setHoveredDomino] = useState<number | null>(null);

  const formatScore = (score: number) => score > 0 ? `+${score}` : `${score}`;
  const dominoMap = placements ? buildDominoMap(placements) : new Map<string, number>();

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px',
    background: 'linear-gradient(145deg, rgba(22, 33, 62, 0.9), rgba(15, 52, 96, 0.9))',
    borderRadius: '20px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    border: '1px solid rgba(255,255,255,0.1)',
  };

  const tableStyle: React.CSSProperties = {
    borderSpacing: `${GAP}px`,
    borderCollapse: 'separate',
  };

  const getCellWrapperStyle = (row: number, col: number): React.CSSProperties => {
    const cellKey = `${row},${col}`;
    const dominoIdx = dominoMap.get(cellKey);
    const partnerDir = placements ? getDominoDirection(row, col, dominoMap) : null;
    const isHovered = dominoIdx !== undefined && dominoIdx === hoveredDomino;
    const isStartingSymbol = row === 0 && col === 0 && dominoIdx === undefined;

    // Always reserve border space, but only color it on hover
    const borderWidth = 3;
    const borderColor = isHovered ? '#e94560' : 'transparent';
    const border = `${borderWidth}px solid ${borderColor}`;

    let borderStyle: React.CSSProperties = {
      borderTop: border,
      borderRight: border,
      borderBottom: border,
      borderLeft: border,
      borderRadius: '10px',
    };

    if (partnerDir && placements) {
      // Remove border on the side facing partner (always transparent there)
      switch (partnerDir) {
        case 'right':
          borderStyle = {
            ...borderStyle,
            borderRight: `${borderWidth}px solid transparent`,
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
          };
          break;
        case 'left':
          borderStyle = {
            ...borderStyle,
            borderLeft: `${borderWidth}px solid transparent`,
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
          };
          break;
        case 'bottom':
          borderStyle = {
            ...borderStyle,
            borderBottom: `${borderWidth}px solid transparent`,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
          };
          break;
        case 'top':
          borderStyle = {
            ...borderStyle,
            borderTop: `${borderWidth}px solid transparent`,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
          };
          break;
      }
    }

    return {
      position: 'relative',
      ...borderStyle,
      background: isHovered
        ? 'rgba(233, 69, 96, 0.5)'
        : isStartingSymbol
          ? 'rgba(255, 215, 0, 0.2)'
          : 'transparent',
      transition: 'background 0.15s ease, border-color 0.15s ease',
      cursor: dominoIdx !== undefined ? 'pointer' : 'default',
    };
  };

  const cellStyle = (row: number, col: number): React.CSSProperties => ({
    padding: 0,
    animation: animated ? `fadeIn 0.3s ease ${(row * 5 + col) * 0.05}s both` : undefined,
  });

  const tooltipStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(0, 0, 0, 0.9)',
    color: 'var(--accent-gold)',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    zIndex: 10,
    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
    border: '1px solid rgba(255, 215, 0, 0.3)',
  };

  const scoreBoxStyle = (score: number): React.CSSProperties => ({
    textAlign: 'center',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    fontSize: '14px',
    color: SCORE_COLOR(score),
    background: 'rgba(0,0,0,0.2)',
    borderRadius: '6px',
    padding: '4px 8px',
    whiteSpace: 'nowrap',
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

  const handleCellHover = (row: number, col: number) => {
    const cellKey = `${row},${col}`;
    const dominoIdx = dominoMap.get(cellKey);
    setHoveredDomino(dominoIdx ?? null);
  };

  const handleCellLeave = () => {
    setHoveredDomino(null);
  };

  // Get the original domino number (1-12) for display
  const getOriginalDominoNumber = (row: number, col: number): number | null => {
    const cellKey = `${row},${col}`;
    const dominoIdx = dominoMap.get(cellKey);
    if (dominoIdx === undefined || !placements) return null;
    return placements[dominoIdx].originalIndex + 1; // 1-based for display
  };

  // Check if this cell should show the tooltip (first cell of the domino pair)
  const shouldShowTooltip = (row: number, col: number): boolean => {
    const cellKey = `${row},${col}`;
    const dominoIdx = dominoMap.get(cellKey);
    if (dominoIdx === undefined || dominoIdx !== hoveredDomino || !placements) return false;

    const placement = placements[dominoIdx];
    // Show tooltip on the first cell of the domino
    return placement.pos1.row === row && placement.pos1.col === col;
  };

  return (
    <div style={containerStyle}>
      <table style={tableStyle}>
        <tbody>
          {/* Column scores header row */}
          {scoreBreakdown && (
            <tr>
              {scoreBreakdown.cols.map((score, i) => (
                <td key={i} style={{ padding: 0 }}>
                  <div style={scoreBoxStyle(score)}>{formatScore(score)}</div>
                </td>
              ))}
              <td style={{ padding: 0 }}>
                <div style={scoreBoxStyle(scoreBreakdown.diagAnti)}>
                  ×2 {formatScore(scoreBreakdown.diagAnti)}
                </div>
              </td>
            </tr>
          )}

          {/* Grid rows */}
          {grid.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {row.map((cell, colIdx) => (
                <td key={colIdx} style={cellStyle(rowIdx, colIdx)}>
                  <div
                    style={getCellWrapperStyle(rowIdx, colIdx)}
                    onMouseEnter={() => handleCellHover(rowIdx, colIdx)}
                    onMouseLeave={handleCellLeave}
                  >
                    <DetrakSymbol
                      value={cell}
                      size="md"
                      highlight={highlightCells?.has(`${rowIdx},${colIdx}`)}
                    />
                    {shouldShowTooltip(rowIdx, colIdx) && (
                      <div style={tooltipStyle}>
                        Tirage {getOriginalDominoNumber(rowIdx, colIdx)}
                      </div>
                    )}
                  </div>
                </td>
              ))}
              <td style={{ padding: 0 }}>
                {scoreBreakdown && (
                  <div style={scoreBoxStyle(scoreBreakdown.rows[rowIdx])}>
                    {formatScore(scoreBreakdown.rows[rowIdx])}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
