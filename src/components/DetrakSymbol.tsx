import React from 'react';
import type { Symbol } from '../solver/types';

interface DetrakSymbolProps {
  value: Symbol | null;
  size?: 'sm' | 'md' | 'lg';
  interactive?: boolean;
  selected?: boolean;
  onClick?: () => void;
  highlight?: boolean;
}

const SIZE_MAP = {
  sm: 32,
  md: 48,
  lg: 64,
};

// Colors for each symbol
const SYMBOL_COLORS: Record<Symbol, { bg: string; stroke: string }> = {
  1: { bg: '#2d1f3d', stroke: '#e94560' },      // Diagonal - Red/Pink
  2: { bg: '#1f2d3d', stroke: '#4ecdc4' },      // X - Teal
  3: { bg: '#3d351f', stroke: '#ffe66d' },      // Bars - Yellow
  4: { bg: '#1f3d2d', stroke: '#6bcb77' },      // Hash - Green
  5: { bg: '#2d1f3d', stroke: '#dda0dd' },      // Triangle - Purple
  6: { bg: '#1f3d3d', stroke: '#ff9f43' },      // Circle - Orange
};

// SVG symbol renderers
const SymbolSVGs: Record<Symbol, (color: string, size: number) => React.ReactNode> = {
  // 1: Single diagonal line
  1: (color, size) => {
    const strokeWidth = size * 0.12;
    const margin = size * 0.22;
    return (
      <line
        x1={margin}
        y1={size - margin}
        x2={size - margin}
        y2={margin}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    );
  },

  // 2: X (cross)
  2: (color, size) => {
    const strokeWidth = size * 0.1;
    const margin = size * 0.22;
    return (
      <>
        <line
          x1={margin}
          y1={margin}
          x2={size - margin}
          y2={size - margin}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <line
          x1={size - margin}
          y1={margin}
          x2={margin}
          y2={size - margin}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </>
    );
  },

  // 3: Three vertical bars
  3: (color, size) => {
    const strokeWidth = size * 0.1;
    const marginY = size * 0.22;
    const spacing = size / 4;
    return (
      <>
        <line
          x1={spacing}
          y1={marginY}
          x2={spacing}
          y2={size - marginY}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <line
          x1={spacing * 2}
          y1={marginY}
          x2={spacing * 2}
          y2={size - marginY}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <line
          x1={spacing * 3}
          y1={marginY}
          x2={spacing * 3}
          y2={size - marginY}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </>
    );
  },

  // 4: Hash/grid (#)
  4: (color, size) => {
    const strokeWidth = size * 0.08;
    const margin = size * 0.18;
    const inner1 = size * 0.38;
    const inner2 = size * 0.62;
    return (
      <>
        {/* Vertical lines */}
        <line
          x1={inner1}
          y1={margin}
          x2={inner1}
          y2={size - margin}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <line
          x1={inner2}
          y1={margin}
          x2={inner2}
          y2={size - margin}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Horizontal lines */}
        <line
          x1={margin}
          y1={inner1}
          x2={size - margin}
          y2={inner1}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <line
          x1={margin}
          y1={inner2}
          x2={size - margin}
          y2={inner2}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </>
    );
  },

  // 5: Triangle
  5: (color, size) => {
    const strokeWidth = size * 0.1;
    const margin = size * 0.2;
    const centerX = size / 2;
    const topY = margin;
    const bottomY = size - margin;
    return (
      <polygon
        points={`${centerX},${topY} ${margin},${bottomY} ${size - margin},${bottomY}`}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    );
  },

  // 6: Circle
  6: (color, size) => {
    const strokeWidth = size * 0.1;
    const center = size / 2;
    const radius = size * 0.32;
    return (
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
      />
    );
  },
};

export const DetrakSymbol: React.FC<DetrakSymbolProps> = ({
  value,
  size = 'md',
  interactive = false,
  selected = false,
  onClick,
  highlight = false,
}) => {
  const sizeNum = SIZE_MAP[size];
  const colors = value ? SYMBOL_COLORS[value] : null;

  const containerStyle: React.CSSProperties = {
    width: sizeNum,
    height: sizeNum,
    borderRadius: sizeNum * 0.18,
    background: colors ? colors.bg : 'rgba(255,255,255,0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    cursor: interactive ? 'pointer' : 'default',
    transition: 'all 0.2s ease',
    boxShadow: selected
      ? `0 0 0 3px ${colors?.stroke || '#fff'}, 0 4px 12px rgba(233, 69, 96, 0.5)`
      : highlight
      ? `0 0 20px ${colors?.stroke || 'rgba(255,255,255,0.3)'}, inset 0 0 20px ${colors?.stroke}40`
      : `0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255,255,255,0.1)`,
    transform: selected ? 'scale(1.08)' : 'scale(1)',
    border: value ? `2px solid ${colors?.stroke}50` : '2px dashed rgba(255,255,255,0.15)',
  };

  // Account for the 2px border
  const innerSize = sizeNum - 4;

  return (
    <div style={containerStyle} onClick={interactive ? onClick : undefined}>
      {value && (
        <svg
          width={innerSize}
          height={innerSize}
          viewBox={`0 0 ${innerSize} ${innerSize}`}
          style={{ display: 'block' }}
        >
          {SymbolSVGs[value](colors!.stroke, innerSize)}
        </svg>
      )}
    </div>
  );
};

export default DetrakSymbol;
