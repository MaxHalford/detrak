import React, { useState } from 'react';
import type { Symbol, Domino } from '../solver/types';
import DetrakSymbol from './DetrakSymbol';

interface DominoInputProps {
  index: number;
  domino: Domino | null;
  onChange: (domino: Domino) => void;
  onRemove?: () => void;
}

export const DominoInput: React.FC<DominoInputProps> = ({
  index,
  domino,
  onChange,
  onRemove,
}) => {
  const [selectingFirst, setSelectingFirst] = useState(true);

  const handleDiceClick = (value: Symbol) => {
    if (!domino) {
      onChange({ first: value, second: value });
      setSelectingFirst(false);
    } else if (selectingFirst) {
      onChange({ first: value, second: domino.second });
      setSelectingFirst(false);
    } else {
      onChange({ first: domino.first, second: value });
      setSelectingFirst(true);
    }
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.1)',
  };

  const dominoDisplayStyle: React.CSSProperties = {
    display: 'flex',
    gap: '4px',
    padding: '4px',
    background: 'rgba(0,0,0,0.3)',
    borderRadius: '8px',
    minWidth: '104px',
    justifyContent: 'center',
  };

  const pickerStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 1fr)',
    gap: '4px',
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '14px',
    color: 'var(--text-secondary)',
    minWidth: '24px',
  };

  return (
    <div style={containerStyle}>
      <span style={labelStyle}>#{index + 1}</span>

      <div style={dominoDisplayStyle}>
        <div
          onClick={() => setSelectingFirst(true)}
          style={{ cursor: 'pointer', opacity: selectingFirst && domino ? 1 : 0.7 }}
        >
          <DetrakSymbol
            value={domino?.first ?? null}
            size="md"
            selected={selectingFirst && !!domino}
          />
        </div>
        <div
          onClick={() => setSelectingFirst(false)}
          style={{ cursor: 'pointer', opacity: !selectingFirst && domino ? 1 : 0.7 }}
        >
          <DetrakSymbol
            value={domino?.second ?? null}
            size="md"
            selected={!selectingFirst && !!domino}
          />
        </div>
      </div>

      <div style={pickerStyle}>
        {([1, 2, 3, 4, 5, 6] as Symbol[]).map((val) => (
          <DetrakSymbol
            key={val}
            value={val}
            size="sm"
            interactive
            onClick={() => handleDiceClick(val)}
          />
        ))}
      </div>

      {onRemove && domino && (
        <button
          onClick={onRemove}
          style={{
            background: 'rgba(233, 69, 96, 0.2)',
            border: 'none',
            borderRadius: '6px',
            padding: '8px',
            color: 'var(--accent-primary)',
            cursor: 'pointer',
            fontSize: '16px',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
};

export default DominoInput;
