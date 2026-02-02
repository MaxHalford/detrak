import React, { useState, useCallback, useRef } from 'react';
import type { Symbol, Domino, SolverProgress, SolverResult } from './solver/types';
import { createWorkerSolver } from './solver/solver-worker';
import { DetrakSymbol, DominoInput, GameGrid, ProgressDisplay, ScoringReference } from './components';

const INITIAL_DOMINOES: (Domino | null)[] = Array(12).fill(null);

function App() {
  const [startingSymbol, setStartingSymbol] = useState<Symbol>(1);
  const [dominoes, setDominoes] = useState<(Domino | null)[]>(INITIAL_DOMINOES);
  const [progress, setProgress] = useState<SolverProgress | null>(null);
  const [result, setResult] = useState<SolverResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const solverRef = useRef<{ cancel: () => void } | null>(null);

  const handleDominoChange = useCallback((index: number, domino: Domino) => {
    setDominoes(prev => {
      const next = [...prev];
      next[index] = domino;
      return next;
    });
  }, []);

  const handleStartSolve = useCallback(async () => {
    // Validate all dominoes are set
    const validDominoes = dominoes.filter((d): d is Domino => d !== null);
    if (validDominoes.length !== 12) {
      setError(`Veuillez entrer les 12 dominos. Actuellement : ${validDominoes.length}.`);
      return;
    }

    setError(null);
    setResult(null);

    const solver = createWorkerSolver({
      startingSymbol,
      dominoes: validDominoes,
      onProgress: setProgress,
    });

    solverRef.current = solver;

    try {
      const solverResult = await solver.start();
      setResult(solverResult);
    } catch (e) {
      if (e instanceof Error && e.message !== 'Solver cancelled') {
        setError(e.message);
      }
    } finally {
      solverRef.current = null;
    }
  }, [startingSymbol, dominoes]);

  const handleCancel = useCallback(() => {
    solverRef.current?.cancel();
  }, []);

  const handleReset = useCallback(() => {
    setDominoes(INITIAL_DOMINOES);
    setProgress(null);
    setResult(null);
    setError(null);
  }, []);

  const handleRandomize = useCallback(() => {
    const randomDominoes: Domino[] = Array.from({ length: 12 }, () => ({
      first: (Math.floor(Math.random() * 6) + 1) as Symbol,
      second: (Math.floor(Math.random() * 6) + 1) as Symbol,
    }));
    setDominoes(randomDominoes);
    setStartingSymbol((Math.floor(Math.random() * 6) + 1) as Symbol);
  }, []);

  const isRunning = progress?.status === 'running';
  const dominoCount = dominoes.filter(d => d !== null).length;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>
          Detrak Solveur
        </h1>
        <p style={styles.subtitle}>
          Trouvez le placement optimal pour un score maximum
        </p>
      </header>

      <main style={styles.main}>
        <div style={styles.leftPanel}>
          {/* Starting Symbol */}
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Symbole de départ</h2>
            <p style={styles.sectionDesc}>Sélectionnez le symbole pré-placé en haut à gauche</p>
            <div style={styles.symbolPicker}>
              {([1, 2, 3, 4, 5, 6] as Symbol[]).map((val) => (
                <DetrakSymbol
                  key={val}
                  value={val}
                  size="lg"
                  interactive
                  selected={startingSymbol === val}
                  onClick={() => setStartingSymbol(val)}
                />
              ))}
            </div>
          </section>

          {/* Domino Input */}
          <section style={styles.section}>
            <div style={styles.sectionHeader}>
              <div>
                <h2 style={styles.sectionTitle}>Tirages des dés</h2>
                <p style={styles.sectionDesc}>Entrez les 12 paires de symboles obtenues aux dés</p>
              </div>
              <span style={styles.counter}>{dominoCount}/12</span>
            </div>

            <div style={styles.dominoList}>
              {dominoes.map((domino, i) => (
                <DominoInput
                  key={i}
                  index={i}
                  domino={domino}
                  onChange={(d) => handleDominoChange(i, d)}
                />
              ))}
            </div>
          </section>

          {/* Actions */}
          <div style={styles.actions}>
            {!isRunning ? (
              <>
                <button
                  style={{
                    ...styles.primaryButton,
                    opacity: dominoCount !== 12 ? 0.5 : 1,
                    cursor: dominoCount !== 12 ? 'not-allowed' : 'pointer',
                  }}
                  onClick={handleStartSolve}
                  disabled={dominoCount !== 12}
                >
                  Résoudre
                </button>
                <button style={styles.randomButton} onClick={handleRandomize}>
                  Aléatoire
                </button>
                <button style={styles.secondaryButton} onClick={handleReset}>
                  Réinitialiser
                </button>
              </>
            ) : (
              <button style={styles.cancelButton} onClick={handleCancel}>
                Annuler
              </button>
            )}
          </div>

          {error && (
            <div style={styles.error}>{error}</div>
          )}

          <ScoringReference />
        </div>

        <div style={styles.rightPanel}>
          {/* Progress Display */}
          {progress && (
            <section style={styles.section}>
              <ProgressDisplay progress={progress} />
            </section>
          )}

          {/* Best grid during solving */}
          {progress && progress.bestGrid && progress.status === 'running' && (
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>Meilleure solution trouvée</h2>
              <GameGrid grid={progress.bestGrid} scoreBreakdown={progress.scoreBreakdown} />
            </section>
          )}

          {/* Result Grid */}
          {result && (
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>Solution optimale</h2>
              <GameGrid
                grid={result.bestGrid}
                scoreBreakdown={result.scoreBreakdown}
                animated
              />
              <div style={styles.stats}>
                <div style={styles.statItem}>
                  <span style={styles.statLabel}>Grilles explorées</span>
                  <span style={styles.statValue}>{result.stats.totalExplored.toLocaleString()}</span>
                </div>
                <div style={styles.statItem}>
                  <span style={styles.statLabel}>Grilles élaguées</span>
                  <span style={styles.statValue}>{result.stats.totalPruned.toLocaleString()}</span>
                </div>
                <div style={styles.statItem}>
                  <span style={styles.statLabel}>Temps</span>
                  <span style={styles.statValue}>{(result.stats.elapsedMs / 1000).toFixed(2)}s</span>
                </div>
              </div>
            </section>
          )}

          {/* Empty state */}
          {!progress && !result && (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>🎯</div>
              <h3 style={styles.emptyTitle}>Prêt à résoudre</h3>
              <p style={styles.emptyText}>
                Entrez vos 12 tirages de dés, puis cliquez sur Résoudre pour trouver le placement optimal.
              </p>
            </div>
          )}
        </div>
      </main>

      <footer style={styles.footer}>
        <p>
          Detrak est un jeu de dés conçu par Reiner Knizia, édité par Gigamic.
          Ce solveur utilise un algorithme de branch and bound avec élagage pour trouver les solutions optimales.
        </p>
        <p style={{ marginTop: '8px' }}>
          <a href="https://github.com/MaxHalford/detrak" target="_blank" rel="noopener noreferrer" style={styles.footerLink}>
            GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '48px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
  },
  titleIcon: {
    fontSize: '56px',
  },
  subtitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '18px',
    color: 'var(--text-secondary)',
    marginTop: '8px',
  },
  main: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '32px',
    flex: 1,
  },
  leftPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  rightPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  section: {
    background: 'rgba(22, 33, 62, 0.6)',
    borderRadius: '20px',
    padding: '24px',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
  },
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '20px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: '0 0 4px 0',
  },
  sectionDesc: {
    fontSize: '14px',
    color: 'var(--text-muted)',
    margin: 0,
  },
  counter: {
    fontFamily: 'var(--font-mono)',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--accent-primary)',
    background: 'rgba(233, 69, 96, 0.15)',
    padding: '6px 12px',
    borderRadius: '20px',
  },
  symbolPicker: {
    display: 'flex',
    gap: '12px',
    marginTop: '16px',
    flexWrap: 'wrap',
  },
  dominoList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '480px',
    overflowY: 'auto',
    paddingRight: '8px',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  primaryButton: {
    flex: 1,
    minWidth: '120px',
    padding: '14px 24px',
    fontSize: '16px',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(233, 69, 96, 0.4)',
    transition: 'all 0.2s ease',
  },
  secondaryButton: {
    padding: '14px 24px',
    fontSize: '16px',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    background: 'rgba(255,255,255,0.1)',
    color: 'var(--text-primary)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  cancelButton: {
    flex: 1,
    padding: '14px 24px',
    fontSize: '16px',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    background: 'rgba(233, 69, 96, 0.2)',
    color: 'var(--accent-primary)',
    border: '1px solid var(--accent-primary)',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  randomButton: {
    padding: '14px 24px',
    fontSize: '16px',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    background: 'linear-gradient(135deg, #4ecdc4, #44a08d)',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(78, 205, 196, 0.3)',
    transition: 'all 0.2s ease',
  },
  error: {
    padding: '12px 16px',
    background: 'rgba(233, 69, 96, 0.15)',
    border: '1px solid var(--accent-primary)',
    borderRadius: '10px',
    color: 'var(--accent-primary)',
    fontSize: '14px',
    fontFamily: 'var(--font-display)',
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px',
    background: 'rgba(22, 33, 62, 0.4)',
    borderRadius: '20px',
    border: '2px dashed rgba(255,255,255,0.1)',
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: '64px',
    marginBottom: '16px',
  },
  emptyTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '24px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: '0 0 8px 0',
  },
  emptyText: {
    fontSize: '16px',
    color: 'var(--text-muted)',
    maxWidth: '300px',
    lineHeight: 1.5,
  },
  stats: {
    marginTop: '16px',
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
  },
  statItem: {
    flex: 1,
    minWidth: '100px',
    padding: '12px',
    background: 'rgba(0,0,0,0.2)',
    borderRadius: '10px',
    textAlign: 'center',
  },
  statLabel: {
    display: 'block',
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px',
  },
  statValue: {
    fontSize: '16px',
    fontWeight: 600,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-primary)',
  },
  footer: {
    marginTop: '32px',
    textAlign: 'center',
    padding: '16px',
    color: 'var(--text-muted)',
    fontSize: '13px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
  },
  footerLink: {
    color: 'var(--text-muted)',
    textDecoration: 'none',
  },
};

export default App;
