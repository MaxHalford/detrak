import React from 'react';

export const ScoringReference: React.FC = () => {
  const containerStyle: React.CSSProperties = {
    padding: '16px 20px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '12px',
    marginTop: '16px',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  const tableStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '8px',
  };

  const cellStyle = (isHeader: boolean): React.CSSProperties => ({
    textAlign: 'center',
    padding: '8px 4px',
    background: isHeader ? 'rgba(255,255,255,0.05)' : 'transparent',
    borderRadius: '6px',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    color: isHeader ? 'var(--text-muted)' : 'var(--text-primary)',
    fontWeight: isHeader ? 500 : 600,
  });

  const scoreStyle = (score: number): React.CSSProperties => ({
    ...cellStyle(false),
    color: score > 0 ? (score >= 8 ? 'var(--accent-gold)' : 'var(--accent-green)') : 'var(--accent-primary)',
  });

  return (
    <div style={containerStyle}>
      <div style={titleStyle}>Barème des points</div>
      <div style={tableStyle}>
        <div style={cellStyle(true)}>Suite</div>
        <div style={cellStyle(true)}>2</div>
        <div style={cellStyle(true)}>3</div>
        <div style={cellStyle(true)}>4</div>
        <div style={cellStyle(true)}>5</div>

        <div style={cellStyle(true)}>Pts</div>
        <div style={scoreStyle(2)}>+2</div>
        <div style={scoreStyle(3)}>+3</div>
        <div style={scoreStyle(8)}>+8</div>
        <div style={scoreStyle(10)}>+10</div>
      </div>
      <div style={{
        marginTop: '10px',
        fontSize: '12px',
        color: 'var(--text-muted)',
        textAlign: 'center',
      }}>
        Aucune paire dans une ligne/colonne = <span style={{ color: 'var(--accent-primary)' }}>-5</span>
      </div>
    </div>
  );
};

export default ScoringReference;
