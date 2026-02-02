/**
 * Heavily optimized Detrak solver using:
 * - Zobrist hashing with transposition table
 * - Incremental score calculation
 * - Advanced move ordering (killer heuristic, history heuristic)
 * - Tighter upper bound calculation
 * - Constraint propagation for dead-end detection
 * - Iterative deepening for quick initial solutions
 */

import type {
  Grid,
  Domino,
  Position,
  Placement,
  SolverConfig,
  SolverProgress,
  SolverResult,
  Symbol,
  Cell,
  ScoreBreakdown,
} from './types';

// Pre-computed scoring table - scores are summed for all runs in a line
const SCORE_TABLE: number[] = [0, 0, 2, 3, 8, 10]; // index = run length

// Zobrist hashing tables (pre-computed random values)
const ZOBRIST: bigint[][] = [];
for (let pos = 0; pos < 25; pos++) {
  ZOBRIST[pos] = [];
  for (let sym = 0; sym <= 6; sym++) {
    // Use a simple but effective pseudo-random generation
    ZOBRIST[pos][sym] = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)) ^
                        (BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)) << 32n);
  }
}

// Position encoding for faster access
const posToIndex = (row: number, col: number): number => row * 5 + col;
const indexToPos = (idx: number): Position => ({ row: Math.floor(idx / 5), col: idx % 5 });

// Pre-compute adjacent pairs for domino placement
interface AdjacentPair {
  idx1: number;
  idx2: number;
  isHorizontal: boolean;
}

const ADJACENT_PAIRS: AdjacentPair[] = [];
for (let row = 0; row < 5; row++) {
  for (let col = 0; col < 5; col++) {
    const idx = posToIndex(row, col);
    // Horizontal neighbor
    if (col < 4) {
      ADJACENT_PAIRS.push({ idx1: idx, idx2: idx + 1, isHorizontal: true });
    }
    // Vertical neighbor
    if (row < 4) {
      ADJACENT_PAIRS.push({ idx1: idx, idx2: idx + 5, isHorizontal: false });
    }
  }
}

// Pre-compute line indices for scoring
const ROW_INDICES: number[][] = [];
const COL_INDICES: number[][] = [];
for (let i = 0; i < 5; i++) {
  ROW_INDICES[i] = [i * 5, i * 5 + 1, i * 5 + 2, i * 5 + 3, i * 5 + 4];
  COL_INDICES[i] = [i, i + 5, i + 10, i + 15, i + 20];
}
const DIAG_ANTI = [4, 8, 12, 16, 20];
const DIAG_ANTI_INDEX = 10; // Index in ALL_LINES

// All lines for scoring (11 lines: 5 rows + 5 cols + anti-diagonal)
// Note: Anti-diagonal counts ×2 in final score
const ALL_LINES: number[][] = [
  ...ROW_INDICES,
  ...COL_INDICES,
  DIAG_ANTI,
];

// Which lines each cell belongs to (for incremental updates)
const CELL_TO_LINES: number[][] = Array(25).fill(null).map(() => []);
ALL_LINES.forEach((line, lineIdx) => {
  line.forEach(cellIdx => {
    CELL_TO_LINES[cellIdx].push(lineIdx);
  });
});

/**
 * Fast grid state using flat array
 */
class FastGrid {
  cells: Cell[];
  hash: bigint;
  lineScores: number[]; // Current score for each of the 11 lines
  lineFilled: number[]; // Number of filled cells in each line

  constructor() {
    this.cells = Array(25).fill(null);
    this.hash = 0n;
    this.lineScores = Array(11).fill(0);
    this.lineFilled = Array(11).fill(0);
  }

  clone(): FastGrid {
    const g = new FastGrid();
    g.cells = [...this.cells];
    g.hash = this.hash;
    g.lineScores = [...this.lineScores];
    g.lineFilled = [...this.lineFilled];
    return g;
  }

  setCell(idx: number, value: Symbol): void {
    const oldValue = this.cells[idx];

    // Update Zobrist hash
    if (oldValue !== null) {
      this.hash ^= ZOBRIST[idx][oldValue];
    }
    this.hash ^= ZOBRIST[idx][value];

    this.cells[idx] = value;

    // Update line scores incrementally
    for (const lineIdx of CELL_TO_LINES[idx]) {
      if (oldValue === null) {
        this.lineFilled[lineIdx]++;
      }
      this.lineScores[lineIdx] = this.calculateLineScore(ALL_LINES[lineIdx]);
    }
  }

  clearCell(idx: number): void {
    const oldValue = this.cells[idx];
    if (oldValue === null) return;

    // Update Zobrist hash
    this.hash ^= ZOBRIST[idx][oldValue];

    this.cells[idx] = null;

    // Update line scores
    for (const lineIdx of CELL_TO_LINES[idx]) {
      this.lineFilled[lineIdx]--;
      this.lineScores[lineIdx] = this.calculateLineScore(ALL_LINES[lineIdx]);
    }
  }

  calculateLineScore(indices: number[]): number {
    let totalScore = 0;
    let currentRun = 0;
    let lastSymbol: Cell = null;
    let filledCount = 0;
    let hasAnyRun = false;

    for (const idx of indices) {
      const cell = this.cells[idx];
      if (cell === null) {
        // End of run due to empty cell
        if (currentRun >= 2) {
          totalScore += SCORE_TABLE[currentRun];
          hasAnyRun = true;
        }
        currentRun = 0;
        lastSymbol = null;
      } else {
        filledCount++;
        if (cell === lastSymbol) {
          currentRun++;
        } else {
          // Different symbol, score previous run
          if (currentRun >= 2) {
            totalScore += SCORE_TABLE[currentRun];
            hasAnyRun = true;
          }
          currentRun = 1;
        }
        lastSymbol = cell;
      }
    }
    // Score final run
    if (currentRun >= 2) {
      totalScore += SCORE_TABLE[currentRun];
      hasAnyRun = true;
    }

    // Only apply penalty if line is complete with no runs
    if (filledCount === 5 && !hasAnyRun) {
      return -5;
    }

    return totalScore;
  }

  getTotalScore(): number {
    // Sum all lines + add diagonal again (it counts ×2)
    return this.lineScores.reduce((a, b) => a + b, 0) + this.lineScores[DIAG_ANTI_INDEX];
  }

  getFilledCount(): number {
    let count = 0;
    for (let i = 0; i < 25; i++) {
      if (this.cells[i] !== null) count++;
    }
    return count;
  }

  isEmpty(idx: number): boolean {
    return this.cells[idx] === null;
  }

  toGrid(): Grid {
    const grid: Grid = [];
    for (let row = 0; row < 5; row++) {
      grid.push(this.cells.slice(row * 5, row * 5 + 5));
    }
    return grid;
  }
}

/**
 * Calculate upper bound on remaining score potential
 * With summed scoring, we use 10 (max possible) for any incomplete line
 */
function calculateUpperBound(grid: FastGrid, _remainingDominoes: Domino[]): number {
  let bound = 0;
  let diagAntiBound = 0;

  // For each line, calculate maximum possible score
  for (let lineIdx = 0; lineIdx < 11; lineIdx++) {
    const filledCount = grid.lineFilled[lineIdx];
    const emptyCount = 5 - filledCount;

    let lineContribution = 0;

    if (emptyCount === 0) {
      // Line is complete, use actual score
      lineContribution = grid.lineScores[lineIdx];
    } else {
      // With summed scoring, theoretical max is 10 (5-in-a-row)
      lineContribution = 10;
    }

    bound += lineContribution;

    // Track diagonal contribution separately (it counts ×2)
    if (lineIdx === DIAG_ANTI_INDEX) {
      diagAntiBound = lineContribution;
    }
  }

  // Add diagonal again (×2)
  return bound + diagAntiBound;
}

/**
 * Check if placing dominoes can still lead to valid tiling
 * Returns false if there are isolated single cells
 */
function hasValidTiling(grid: FastGrid): boolean {
  // Quick check: count empty cells
  const emptyCells: number[] = [];
  for (let i = 0; i < 25; i++) {
    if (grid.isEmpty(i)) {
      emptyCells.push(i);
    }
  }

  // Must have even number of empty cells
  if (emptyCells.length % 2 !== 0) {
    return false;
  }

  // Check for isolated cells (cells with no empty neighbors)
  for (const idx of emptyCells) {
    const row = Math.floor(idx / 5);
    const col = idx % 5;
    let hasEmptyNeighbor = false;

    // Check all 4 neighbors
    if (row > 0 && grid.isEmpty(idx - 5)) hasEmptyNeighbor = true;
    if (row < 4 && grid.isEmpty(idx + 5)) hasEmptyNeighbor = true;
    if (col > 0 && grid.isEmpty(idx - 1)) hasEmptyNeighbor = true;
    if (col < 4 && grid.isEmpty(idx + 1)) hasEmptyNeighbor = true;

    if (!hasEmptyNeighbor) {
      return false; // Isolated cell found
    }
  }

  return true;
}

/**
 * Generate valid placements with smart ordering
 */
interface ScoredPlacement {
  pair: AdjacentPair;
  sym1: Symbol;
  sym2: Symbol;
  score: number;
}

// Beam width - limits branching factor for faster search
// Higher = more thorough but slower, lower = faster but may miss optimal
const BEAM_WIDTH = 20;

function getOrderedPlacements(
  grid: FastGrid,
  domino: Domino,
  killerMoves: Map<string, number>,
  historyTable: Map<string, number>,
  useBeam: boolean = true
): ScoredPlacement[] {
  const placements: ScoredPlacement[] = [];

  for (const pair of ADJACENT_PAIRS) {
    if (!grid.isEmpty(pair.idx1) || !grid.isEmpty(pair.idx2)) {
      continue;
    }

    // Try both orientations
    const orientations: [Symbol, Symbol][] = [[domino.first, domino.second]];
    if (domino.first !== domino.second) {
      orientations.push([domino.second, domino.first]);
    }

    for (const [sym1, sym2] of orientations) {
      // Calculate placement score for ordering
      let score = 0;

      // Bonus for matching neighbors (greedy heuristic)
      score += countMatchingNeighbors(grid, pair.idx1, sym1) * 100;
      score += countMatchingNeighbors(grid, pair.idx2, sym2) * 100;

      // Bonus for doubles (they create guaranteed runs)
      if (sym1 === sym2) {
        score += 200;
      }

      // Killer move bonus
      const moveKey = `${pair.idx1}-${pair.idx2}-${sym1}-${sym2}`;
      score += (killerMoves.get(moveKey) || 0) * 500;

      // History heuristic bonus
      score += (historyTable.get(moveKey) || 0);

      // Prefer edge/corner placements early (concentrates symbols)
      const row1 = Math.floor(pair.idx1 / 5);
      const col1 = pair.idx1 % 5;
      const row2 = Math.floor(pair.idx2 / 5);
      const col2 = pair.idx2 % 5;

      if (row1 === 0 || row1 === 4 || col1 === 0 || col1 === 4) score += 20;
      if (row2 === 0 || row2 === 4 || col2 === 0 || col2 === 4) score += 20;

      placements.push({ pair, sym1, sym2, score });
    }
  }

  // Sort by score descending (best moves first)
  placements.sort((a, b) => b.score - a.score);

  // Apply beam search - limit to top BEAM_WIDTH placements
  if (useBeam && placements.length > BEAM_WIDTH) {
    return placements.slice(0, BEAM_WIDTH);
  }

  return placements;
}

function countMatchingNeighbors(grid: FastGrid, idx: number, symbol: Symbol): number {
  const row = Math.floor(idx / 5);
  const col = idx % 5;
  let count = 0;

  if (row > 0 && grid.cells[idx - 5] === symbol) count++;
  if (row < 4 && grid.cells[idx + 5] === symbol) count++;
  if (col > 0 && grid.cells[idx - 1] === symbol) count++;
  if (col < 4 && grid.cells[idx + 1] === symbol) count++;

  return count;
}

/**
 * Transposition table entry
 */
interface TTEntry {
  bestScore: number;
  depth: number;
  flag: 'exact' | 'lower' | 'upper';
}

/**
 * Main optimized solver
 */
export function createOptimizedSolver(config: SolverConfig): {
  start: () => Promise<SolverResult>;
  cancel: () => void;
} {
  const { startingSymbol, dominoes, onProgress } = config;

  let cancelled = false;

  const start = (): Promise<SolverResult> => {
    return new Promise((resolve, reject) => {
      if (dominoes.length !== 12) {
        reject(new Error(`Expected 12 dominoes, got ${dominoes.length}`));
        return;
      }

      // Optimize domino ordering: doubles first, then by symbol frequency
      const symbolFreq: number[] = [0, 0, 0, 0, 0, 0, 0];
      for (const d of dominoes) {
        symbolFreq[d.first]++;
        symbolFreq[d.second]++;
      }
      // Include starting symbol
      symbolFreq[startingSymbol]++;

      const orderedDominoes = [...dominoes].sort((a, b) => {
        // Doubles first
        const aDouble = a.first === a.second ? 1 : 0;
        const bDouble = b.first === b.second ? 1 : 0;
        if (aDouble !== bDouble) return bDouble - aDouble;

        // Then by combined symbol frequency (prefer common symbols)
        const aFreq = symbolFreq[a.first] + symbolFreq[a.second];
        const bFreq = symbolFreq[b.first] + symbolFreq[b.second];
        return bFreq - aFreq;
      });

      // Initialize grid
      const grid = new FastGrid();
      grid.setCell(0, startingSymbol);

      // State tracking
      let bestScore = -Infinity;
      let bestGrid: FastGrid | null = null;
      let bestPlacements: Placement[] = [];

      let explored = 0;
      let pruned = 0;
      const startTime = Date.now();

      // Transposition table
      const transpositionTable: Map<string, TTEntry> = new Map();

      // Move ordering heuristics
      const killerMoves: Map<string, number>[] = Array(12).fill(null).map(() => new Map());
      const historyTable: Map<string, number> = new Map();

      const updateProgress = (depth: number, status: SolverProgress['status'] = 'running') => {
        const now = Date.now();
        const bestGridArray = bestGrid ? bestGrid.toGrid() : null;
        const progress: SolverProgress = {
          explored,
          pruned,
          bestScore: bestScore === -Infinity ? 0 : bestScore,
          bestGrid: bestGridArray,
          scoreBreakdown: bestGridArray ? calculateScoreBreakdown(bestGridArray) : undefined,
          currentDepth: depth,
          elapsedMs: now - startTime,
          status,
          estimatedProgress: Math.min(99, Math.log10(explored + 1) * 10),
        };
        onProgress?.(progress);
      };

      // Iterative deepening - first find any valid solution quickly
      let quickSolutionFound = false;

      function findQuickSolution(depth: number): boolean {
        if (depth === 12) {
          const score = grid.getTotalScore();
          if (bestGrid === null || score > bestScore) {
            bestScore = score;
            bestGrid = grid.clone();
          }
          return true;
        }

        const dom = orderedDominoes[depth];
        const placements = getOrderedPlacements(grid, dom, killerMoves[depth], historyTable, false);

        if (placements.length === 0) return false;

        // Just try the first (best-ordered) placement
        const p = placements[0];
        grid.setCell(p.pair.idx1, p.sym1);
        grid.setCell(p.pair.idx2, p.sym2);

        if (hasValidTiling(grid)) {
          if (findQuickSolution(depth + 1)) {
            grid.clearCell(p.pair.idx1);
            grid.clearCell(p.pair.idx2);
            return true;
          }
        }

        grid.clearCell(p.pair.idx1);
        grid.clearCell(p.pair.idx2);

        // Try a few more
        for (let i = 1; i < Math.min(3, placements.length); i++) {
          const p2 = placements[i];
          grid.setCell(p2.pair.idx1, p2.sym1);
          grid.setCell(p2.pair.idx2, p2.sym2);

          if (hasValidTiling(grid) && findQuickSolution(depth + 1)) {
            grid.clearCell(p2.pair.idx1);
            grid.clearCell(p2.pair.idx2);
            return true;
          }

          grid.clearCell(p2.pair.idx1);
          grid.clearCell(p2.pair.idx2);
        }

        return false;
      }

      // Main search with full optimization
      const BATCH_SIZE = 3000;
      let operationsThisBatch = 0;

      interface StackFrame {
        depth: number;
        placements: ScoredPlacement[];
        placementIndex: number;
        appliedPlacement: ScoredPlacement | null;
      }

      const stack: StackFrame[] = [];
      const placementHistory: Placement[] = [];

      function initializeSearch(): void {
        // Find quick solution first for better initial bound
        findQuickSolution(0);
        quickSolutionFound = bestGrid !== null;

        if (quickSolutionFound) {
          updateProgress(12);
        }

        // Reset grid for full search
        for (let i = 1; i < 25; i++) {
          grid.clearCell(i);
        }

        // Initialize stack for full search
        const initialPlacements = getOrderedPlacements(grid, orderedDominoes[0], killerMoves[0], historyTable);

        if (initialPlacements.length === 0) {
          return;
        }

        stack.push({
          depth: 0,
          placements: initialPlacements,
          placementIndex: 0,
          appliedPlacement: null,
        });
      }

      function processBatch(): void {
        if (cancelled) {
          updateProgress(0, 'cancelled');
          reject(new Error('Solver cancelled'));
          return;
        }

        operationsThisBatch = 0;

        while (stack.length > 0 && operationsThisBatch < BATCH_SIZE) {
          if (cancelled) {
            updateProgress(0, 'cancelled');
            reject(new Error('Solver cancelled'));
            return;
          }

          const frame = stack[stack.length - 1];
          operationsThisBatch++;

          // Check if we've exhausted placements at this level
          if (frame.placementIndex >= frame.placements.length) {
            // Backtrack
            if (frame.appliedPlacement) {
              const p = frame.appliedPlacement;
              grid.clearCell(p.pair.idx1);
              grid.clearCell(p.pair.idx2);
              placementHistory.pop();
            }
            stack.pop();
            continue;
          }

          // Remove previous placement from this frame
          if (frame.appliedPlacement) {
            const p = frame.appliedPlacement;
            grid.clearCell(p.pair.idx1);
            grid.clearCell(p.pair.idx2);
            placementHistory.pop();
          }

          // Get next placement
          const placement = frame.placements[frame.placementIndex];
          frame.placementIndex++;
          frame.appliedPlacement = placement;

          // Apply placement
          grid.setCell(placement.pair.idx1, placement.sym1);
          grid.setCell(placement.pair.idx2, placement.sym2);

          const pos1 = indexToPos(placement.pair.idx1);
          const pos2 = indexToPos(placement.pair.idx2);
          placementHistory.push({
            domino: orderedDominoes[frame.depth],
            pos1,
            pos2,
            flipped: placement.sym1 !== orderedDominoes[frame.depth].first,
          });

          explored++;

          // Check if complete
          if (frame.depth + 1 === 12) {
            const score = grid.getTotalScore();
            if (score > bestScore) {
              bestScore = score;
              bestGrid = grid.clone();
              bestPlacements = [...placementHistory];

              // Update killer moves
              const moveKey = `${placement.pair.idx1}-${placement.pair.idx2}-${placement.sym1}-${placement.sym2}`;
              killerMoves[frame.depth].set(moveKey, (killerMoves[frame.depth].get(moveKey) || 0) + 1);

              // Update history table
              historyTable.set(moveKey, (historyTable.get(moveKey) || 0) + frame.depth * frame.depth);

              updateProgress(12);
            }
            continue;
          }

          // Constraint propagation: check for isolated cells
          if (!hasValidTiling(grid)) {
            pruned++;
            continue;
          }

          // Pruning: check upper bound
          const remainingDominoes = orderedDominoes.slice(frame.depth + 1);
          const upperBound = calculateUpperBound(grid, remainingDominoes);

          if (upperBound <= bestScore) {
            pruned++;
            continue;
          }

          // Check transposition table
          const hashKey = grid.hash.toString(16);
          const ttEntry = transpositionTable.get(hashKey);
          if (ttEntry && ttEntry.depth >= 12 - frame.depth - 1) {
            if (ttEntry.flag === 'exact' && ttEntry.bestScore <= bestScore) {
              pruned++;
              continue;
            }
            if (ttEntry.flag === 'upper' && ttEntry.bestScore <= bestScore) {
              pruned++;
              continue;
            }
          }

          // Get placements for next level
          const nextPlacements = getOrderedPlacements(
            grid,
            orderedDominoes[frame.depth + 1],
            killerMoves[frame.depth + 1],
            historyTable
          );

          if (nextPlacements.length === 0) {
            pruned++;
            continue;
          }

          // Push new frame
          stack.push({
            depth: frame.depth + 1,
            placements: nextPlacements,
            placementIndex: 0,
            appliedPlacement: null,
          });
        }

        // Update progress
        const currentDepth = stack.length > 0 ? stack[stack.length - 1].depth : 12;
        updateProgress(currentDepth);

        // Check if done
        if (stack.length === 0) {
          if (!bestGrid) {
            reject(new Error('No solution found'));
            return;
          }

          const endTime = Date.now();

          // Calculate final score breakdown
          const finalGrid = bestGrid.toGrid();
          const scoreBreakdown = calculateScoreBreakdown(finalGrid);

          updateProgress(12, 'complete');

          resolve({
            bestScore,
            bestGrid: finalGrid,
            bestPlacements,
            scoreBreakdown,
            stats: {
              totalExplored: explored,
              totalPruned: pruned,
              elapsedMs: endTime - startTime,
            },
          });
          return;
        }

        // Continue processing
        setTimeout(processBatch, 0);
      }

      // Start search
      updateProgress(0, 'running');

      setTimeout(() => {
        initializeSearch();
        processBatch();
      }, 0);
    });
  };

  const cancel = () => {
    cancelled = true;
  };

  return { start, cancel };
}

function calculateScoreBreakdown(grid: Grid): ScoreBreakdown {
  const rows: number[] = [];
  const cols: number[] = [];

  for (let i = 0; i < 5; i++) {
    rows.push(scoreCompleteLine(grid[i]));
    cols.push(scoreCompleteLine([grid[0][i], grid[1][i], grid[2][i], grid[3][i], grid[4][i]]));
  }

  const diagAnti = scoreCompleteLine([grid[0][4], grid[1][3], grid[2][2], grid[3][1], grid[4][0]]);

  // Anti-diagonal counts ×2
  const total = rows.reduce((a, b) => a + b, 0) +
                cols.reduce((a, b) => a + b, 0) +
                diagAnti * 2;

  return { rows, cols, diagAnti, total };
}

function scoreCompleteLine(line: Cell[]): number {
  let totalScore = 0;
  let currentRun = 1;
  let hasAnyRun = false;

  for (let i = 1; i < line.length; i++) {
    if (line[i] === line[i - 1]) {
      currentRun++;
    } else {
      if (currentRun >= 2) {
        totalScore += SCORE_TABLE[currentRun];
        hasAnyRun = true;
      }
      currentRun = 1;
    }
  }
  // Score final run
  if (currentRun >= 2) {
    totalScore += SCORE_TABLE[currentRun];
    hasAnyRun = true;
  }

  return hasAnyRun ? totalScore : -5;
}
