import React from 'react';
import type { Symbol } from '../solver/types';

interface DiceFaceProps {
  value: Symbol | null;
  size?: 'sm' | 'md' | 'lg';
  interactive?: boolean;
  selected?: boolean;
  onClick?: () => void;
  highlight?: boolean;
}

const DICE_COLORS: Record<Symbol, string> = {
  1: '#ff6b6b',
  2: '#4ecdc4',
  3: '#ffe66d',
  4: '#95e1d3',
  5: '#dda0dd',
  6: '#98d8c8',
};

const SIZE_MAP = {
  sm: 32,
  md: 48,
  lg: 64,
};

// Pip positions for each dice value (as percentage from center)
const PIP_POSITIONS: Record<Symbol, Array<{ x: number; y: number }>> = {
  1: [{ x: 50, y: 50 }],
  2: [{ x: 25, y: 25 }, { x: 75, y: 75 }],
  3: [{ x: 25, y: 25 }, { x: 50, y: 50 }, { x: 75, y: 75 }],
  4: [{ x: 25, y: 25 }, { x: 75, y: 25 }, { x: 25, y: 75 }, { x: 75, y: 75 }],
  5: [{ x: 25, y: 25 }, { x: 75, y: 25 }, { x: 50, y: 50 }, { x: 25, y: 75 }, { x: 75, y: 75 }],
  6: [{ x: 25, y: 25 }, { x: 25, y: 50 }, { x: 25, y: 75 }, { x: 75, y: 25 }, { x: 75, y: 50 }, { x: 75, y: 75 }],
};

export const DiceFace: React.FC<DiceFaceProps> = ({
  value,
  size = 'md',
  interactive = false,
  selected = false,
  onClick,
  highlight = false,
}) => {
  const sizeNum = SIZE_MAP[size];
  const pipSize = sizeNum * 0.15;

  const style: React.CSSProperties = {
    width: sizeNum,
    height: sizeNum,
    borderRadius: sizeNum * 0.2,
    background: value ? DICE_COLORS[value] : 'rgba(255,255,255,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    cursor: interactive ? 'pointer' : 'default',
    transition: 'all 0.2s ease',
    boxShadow: selected
      ? `0 0 0 3px #fff, 0 4px 12px rgba(233, 69, 96, 0.5)`
      : highlight
      ? `0 0 20px ${value ? DICE_COLORS[value] : 'rgba(255,255,255,0.3)'}`
      : `0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255,255,255,0.2)`,
    transform: selected ? 'scale(1.05)' : 'scale(1)',
    border: value ? `2px solid rgba(0,0,0,0.2)` : '2px dashed rgba(255,255,255,0.2)',
  };

  return (
    <div style={style} onClick={interactive ? onClick : undefined}>
      {value && PIP_POSITIONS[value].map((pos, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${pos.x}%`,
            top: `${pos.y}%`,
            transform: 'translate(-50%, -50%)',
            width: pipSize,
            height: pipSize,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.7)',
            boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.3)',
          }}
        />
      ))}
    </div>
  );
};

export default DiceFace;
