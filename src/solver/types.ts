// Detrak game types

export type Symbol = 1 | 2 | 3 | 4 | 5 | 6;
export type Cell = Symbol | null;
export type Grid = Cell[][];

export interface Domino {
  first: Symbol;
  second: Symbol;
}

export interface Position {
  row: number;
  col: number;
}

export interface Placement {
  domino: Domino;
  pos1: Position;
  pos2: Position;
  flipped: boolean; // whether first/second are swapped
}

export interface ScoreBreakdown {
  rows: number[];      // Score for each row (5 values)
  cols: number[];      // Score for each column (5 values)
  diagAnti: number;    // Anti-diagonal (top-right to bottom-left) - counts ×2
  total: number;
}

export interface SolverProgress {
  explored: number;
  pruned: number;
  bestScore: number;
  bestGrid: Grid | null;
  scoreBreakdown?: ScoreBreakdown;
  currentDepth: number;
  elapsedMs: number;
  status: 'idle' | 'running' | 'complete' | 'cancelled';
  estimatedProgress: number; // 0-100
}

export interface SolverResult {
  bestScore: number;
  bestGrid: Grid;
  bestPlacements: Placement[];
  scoreBreakdown: ScoreBreakdown;
  stats: {
    totalExplored: number;
    totalPruned: number;
    elapsedMs: number;
  };
}

export interface SolverConfig {
  startingSymbol: Symbol;
  dominoes: Domino[];
  onProgress?: (progress: SolverProgress) => void;
  progressIntervalMs?: number;
}
