/**
 * Web Worker for Detrak solver
 * Runs solver in a separate thread for maximum performance
 */

import type { Symbol, Domino, Grid, Placement, ScoreBreakdown } from './types';

// Message types
export interface WorkerInput {
  type: 'start';
  startingSymbol: Symbol;
  dominoes: Domino[];
}

export interface WorkerOutput {
  type: 'progress' | 'complete' | 'error';
  explored?: number;
  pruned?: number;
  bestScore?: number;
  bestGrid?: Grid;
  elapsedMs?: number;
  scoreBreakdown?: ScoreBreakdown;
  placements?: Placement[];
  error?: string;
}

// Use typed arrays for maximum performance
const SCORE_TABLE = new Int8Array([-5, -5, 2, 3, 8, 10]); // index = run length

// Pre-computed adjacent pairs
const ADJACENT_PAIRS: Array<[number, number]> = [];
for (let row = 0; row < 5; row++) {
  for (let col = 0; col < 5; col++) {
    const idx = row * 5 + col;
    if (col < 4) ADJACENT_PAIRS.push([idx, idx + 1]);
    if (row < 4) ADJACENT_PAIRS.push([idx, idx + 5]);
  }
}

// Pre-computed line indices (rows, cols, anti-diagonal)
// Note: Only anti-diagonal counts (×2), main diagonal does not count
const LINES: Int8Array[] = [
  // Rows
  new Int8Array([0, 1, 2, 3, 4]),
  new Int8Array([5, 6, 7, 8, 9]),
  new Int8Array([10, 11, 12, 13, 14]),
  new Int8Array([15, 16, 17, 18, 19]),
  new Int8Array([20, 21, 22, 23, 24]),
  // Cols
  new Int8Array([0, 5, 10, 15, 20]),
  new Int8Array([1, 6, 11, 16, 21]),
  new Int8Array([2, 7, 12, 17, 22]),
  new Int8Array([3, 8, 13, 18, 23]),
  new Int8Array([4, 9, 14, 19, 24]),
  // Anti-diagonal only
  new Int8Array([4, 8, 12, 16, 20]),
];
const DIAG_ANTI_INDEX = 10;

// Which lines each cell belongs to (pre-computed)
const CELL_LINES: Int8Array[] = [];
for (let i = 0; i < 25; i++) {
  const lines: number[] = [];
  for (let lineIdx = 0; lineIdx < 11; lineIdx++) {
    if (LINES[lineIdx].includes(i)) lines.push(lineIdx);
  }
  CELL_LINES[i] = new Int8Array(lines);
}

// Neighbor indices for each cell (pre-computed)
const NEIGHBORS: Int8Array[] = [];
for (let i = 0; i < 25; i++) {
  const row = Math.floor(i / 5);
  const col = i % 5;
  const n: number[] = [];
  if (row > 0) n.push(i - 5);
  if (row < 4) n.push(i + 5);
  if (col > 0) n.push(i - 1);
  if (col < 4) n.push(i + 1);
  NEIGHBORS[i] = new Int8Array(n);
}

/**
 * Ultra-fast grid using typed arrays
 */
class FastGrid {
  cells: Int8Array; // 0 = empty, 1-6 = symbols
  lineScores: Int8Array;
  lineFilled: Int8Array;
  hash: number;

  constructor() {
    this.cells = new Int8Array(25);
    this.lineScores = new Int8Array(11);
    this.lineFilled = new Int8Array(11);
    this.hash = 0;
  }

  setCell(idx: number, value: number): void {
    const old = this.cells[idx];
    if (old !== 0) {
      this.hash ^= (old * 7919 + idx * 104729) | 0;
    }
    this.hash ^= (value * 7919 + idx * 104729) | 0;
    this.cells[idx] = value;

    // Update affected lines
    const lines = CELL_LINES[idx];
    for (let i = 0; i < lines.length; i++) {
      const lineIdx = lines[i];
      if (old === 0) this.lineFilled[lineIdx]++;
      this.lineScores[lineIdx] = this.scoreLine(lineIdx);
    }
  }

  clearCell(idx: number): void {
    const old = this.cells[idx];
    if (old === 0) return;

    this.hash ^= (old * 7919 + idx * 104729) | 0;
    this.cells[idx] = 0;

    const lines = CELL_LINES[idx];
    for (let i = 0; i < lines.length; i++) {
      const lineIdx = lines[i];
      this.lineFilled[lineIdx]--;
      this.lineScores[lineIdx] = this.scoreLine(lineIdx);
    }
  }

  scoreLine(lineIdx: number): number {
    const line = LINES[lineIdx];
    let maxRun = 0;
    let run = 0;
    let last = 0;
    let filled = 0;

    for (let i = 0; i < 5; i++) {
      const c = this.cells[line[i]];
      if (c === 0) {
        run = 0;
        last = 0;
      } else {
        filled++;
        if (c === last) {
          run++;
        } else {
          run = 1;
          last = c;
        }
        if (run > maxRun) maxRun = run;
      }
    }

    if (filled === 5 && maxRun === 1) return -5;
    return SCORE_TABLE[maxRun];
  }

  totalScore(): number {
    let sum = 0;
    for (let i = 0; i < 11; i++) sum += this.lineScores[i];
    // Main diagonal counts ×2
    return sum + this.lineScores[DIAG_ANTI_INDEX];
  }

  clone(): FastGrid {
    const g = new FastGrid();
    g.cells.set(this.cells);
    g.lineScores.set(this.lineScores);
    g.lineFilled.set(this.lineFilled);
    g.hash = this.hash;
    return g;
  }

  toGrid(): Grid {
    const grid: Grid = [];
    for (let r = 0; r < 5; r++) {
      const row: (Symbol | null)[] = [];
      for (let c = 0; c < 5; c++) {
        const v = this.cells[r * 5 + c];
        row.push(v === 0 ? null : v as Symbol);
      }
      grid.push(row);
    }
    return grid;
  }
}

/**
 * Check for isolated empty cells (constraint propagation)
 */
function hasIsolatedCell(grid: FastGrid): boolean {
  for (let i = 0; i < 25; i++) {
    if (grid.cells[i] !== 0) continue;

    const neighbors = NEIGHBORS[i];
    let hasEmptyNeighbor = false;
    for (let j = 0; j < neighbors.length; j++) {
      if (grid.cells[neighbors[j]] === 0) {
        hasEmptyNeighbor = true;
        break;
      }
    }
    if (!hasEmptyNeighbor) return true;
  }
  return false;
}

/**
 * Count matching neighbors for move ordering
 */
function countMatching(grid: FastGrid, idx: number, sym: number): number {
  const neighbors = NEIGHBORS[idx];
  let count = 0;
  for (let i = 0; i < neighbors.length; i++) {
    if (grid.cells[neighbors[i]] === sym) count++;
  }
  return count;
}

/**
 * Calculate upper bound on remaining score
 */
function upperBound(grid: FastGrid, symCounts: Int8Array): number {
  let bound = 0;
  let diagBound = 0;

  for (let lineIdx = 0; lineIdx < 11; lineIdx++) {
    const filled = grid.lineFilled[lineIdx];
    const empty = 5 - filled;
    let lineContrib = 0;

    if (empty === 0) {
      lineContrib = grid.lineScores[lineIdx];
    } else {
      const line = LINES[lineIdx];
      let maxPossible = 0;

      // Check existing symbols
      for (let s = 1; s <= 6; s++) {
        let count = 0;
        for (let i = 0; i < 5; i++) {
          if (grid.cells[line[i]] === s) count++;
        }
        if (count > 0) {
          const potential = Math.min(5, count + Math.min(empty, symCounts[s]));
          if (potential > maxPossible) maxPossible = potential;
        }
      }

      // Or new run
      if (empty >= 2 && maxPossible < empty) {
        let maxSym = 0;
        for (let s = 1; s <= 6; s++) {
          if (symCounts[s] > maxSym) maxSym = symCounts[s];
        }
        const potential = Math.min(empty, maxSym);
        if (potential > maxPossible) maxPossible = potential;
      }

      if (filled === 0) maxPossible = Math.min(5, empty);

      lineContrib = SCORE_TABLE[maxPossible] || 10;
    }

    bound += lineContrib;
    if (lineIdx === DIAG_ANTI_INDEX) diagBound = lineContrib;
  }

  // Main diagonal counts ×2
  return bound + diagBound;
}

/**
 * Placement with score for ordering
 */
interface ScoredMove {
  idx1: number;
  idx2: number;
  sym1: number;
  sym2: number;
  score: number;
}

// Reusable move array to avoid allocations
const movePool: ScoredMove[] = [];
for (let i = 0; i < 100; i++) {
  movePool.push({ idx1: 0, idx2: 0, sym1: 0, sym2: 0, score: 0 });
}

/**
 * Get ordered moves (reuses objects to avoid allocations)
 */
function getMoves(
  grid: FastGrid,
  dom: Domino,
  killers: Int32Array,
  history: Int32Array,
  beamWidth: number
): { moves: ScoredMove[], count: number } {
  let count = 0;

  for (let p = 0; p < ADJACENT_PAIRS.length; p++) {
    const [idx1, idx2] = ADJACENT_PAIRS[p];
    if (grid.cells[idx1] !== 0 || grid.cells[idx2] !== 0) continue;

    // Try both orientations
    const syms: [number, number][] = [[dom.first, dom.second]];
    if (dom.first !== dom.second) syms.push([dom.second, dom.first]);

    for (const [s1, s2] of syms) {
      const move = movePool[count++];
      move.idx1 = idx1;
      move.idx2 = idx2;
      move.sym1 = s1;
      move.sym2 = s2;

      // Score for ordering
      let score = 0;
      score += countMatching(grid, idx1, s1) * 100;
      score += countMatching(grid, idx2, s2) * 100;
      if (s1 === s2) score += 200;

      // Killer/history heuristics (packed index)
      const key = idx1 * 1000000 + idx2 * 10000 + s1 * 100 + s2;
      const keyMod = key % 65536;
      score += killers[keyMod] * 500;
      score += history[keyMod];

      move.score = score;
    }
  }

  // Sort by score descending (insertion sort is fast for small arrays)
  for (let i = 1; i < count; i++) {
    const m = movePool[i];
    let j = i - 1;
    while (j >= 0 && movePool[j].score < m.score) {
      movePool[j + 1] = movePool[j];
      j--;
    }
    movePool[j + 1] = m;
  }

  return { moves: movePool, count: Math.min(count, beamWidth) };
}

/**
 * Main solver function
 */
function solve(startingSymbol: Symbol, dominoes: Domino[]): void {
  const grid = new FastGrid();
  grid.setCell(0, startingSymbol);

  // Sort dominoes: doubles first, then by frequency
  const freq = new Int8Array(7);
  freq[startingSymbol]++;
  for (const d of dominoes) {
    freq[d.first]++;
    freq[d.second]++;
  }

  const ordered = [...dominoes].sort((a, b) => {
    const aD = a.first === a.second ? 1 : 0;
    const bD = b.first === b.second ? 1 : 0;
    if (aD !== bD) return bD - aD;
    return (freq[b.first] + freq[b.second]) - (freq[a.first] + freq[a.second]);
  });

  let bestScore = -Infinity;
  let bestGrid: FastGrid | null = null;
  let bestPlacements: Placement[] = [];

  let explored = 0;
  let pruned = 0;
  const startTime = performance.now();
  let lastUpdate = startTime;

  // Heuristic tables (fixed-size arrays)
  const killers: Int32Array[] = [];
  const history = new Int32Array(65536);
  for (let i = 0; i < 12; i++) killers.push(new Int32Array(65536));

  // Symbol counts for upper bound
  const symCounts = new Int8Array(7);

  function updateSymCounts(depth: number): void {
    symCounts.fill(0);
    for (let i = depth; i < 12; i++) {
      symCounts[ordered[i].first]++;
      symCounts[ordered[i].second]++;
    }
  }

  // Quick greedy solution first
  function quickSolve(depth: number): boolean {
    if (depth === 12) {
      const score = grid.totalScore();
      if (score > bestScore) {
        bestScore = score;
        bestGrid = grid.clone();
      }
      return true;
    }

    const { moves, count } = getMoves(grid, ordered[depth], killers[depth], history, 100);

    for (let i = 0; i < Math.min(3, count); i++) {
      const m = moves[i];
      grid.setCell(m.idx1, m.sym1);
      grid.setCell(m.idx2, m.sym2);

      if (!hasIsolatedCell(grid) && quickSolve(depth + 1)) {
        grid.clearCell(m.idx1);
        grid.clearCell(m.idx2);
        return true;
      }

      grid.clearCell(m.idx1);
      grid.clearCell(m.idx2);
    }
    return false;
  }

  quickSolve(0);

  // Reset grid for full search
  for (let i = 1; i < 25; i++) grid.clearCell(i);

  // Send initial progress
  const sendProgress = () => {
    const now = performance.now();
    if (now - lastUpdate > 50) {
      lastUpdate = now;
      self.postMessage({
        type: 'progress',
        explored,
        pruned,
        bestScore: bestScore === -Infinity ? 0 : bestScore,
        bestGrid: bestGrid?.toGrid() || null,
        elapsedMs: now - startTime,
      } as WorkerOutput);
    }
  };

  // Full search with stack
  interface Frame {
    depth: number;
    moveIdx: number;
    moveCount: number;
    applied: boolean;
    idx1: number;
    idx2: number;
  }

  const stack: Frame[] = [];
  const placementStack: Array<{ idx1: number; idx2: number; sym1: number; sym2: number }> = [];

  // Initialize
  updateSymCounts(0);
  const init = getMoves(grid, ordered[0], killers[0], history, 25);

  stack.push({
    depth: 0,
    moveIdx: 0,
    moveCount: init.count,
    applied: false,
    idx1: 0,
    idx2: 0,
  });

  // Store moves for each level (avoid regenerating)
  const levelMoves: ScoredMove[][] = [];
  for (let i = 0; i < 12; i++) {
    levelMoves[i] = [];
    for (let j = 0; j < 100; j++) {
      levelMoves[i].push({ idx1: 0, idx2: 0, sym1: 0, sym2: 0, score: 0 });
    }
  }

  // Copy initial moves
  for (let i = 0; i < init.count; i++) {
    const src = init.moves[i];
    const dst = levelMoves[0][i];
    dst.idx1 = src.idx1;
    dst.idx2 = src.idx2;
    dst.sym1 = src.sym1;
    dst.sym2 = src.sym2;
    dst.score = src.score;
  }

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];

    // Check if exhausted
    if (frame.moveIdx >= frame.moveCount) {
      if (frame.applied) {
        grid.clearCell(frame.idx1);
        grid.clearCell(frame.idx2);
        placementStack.pop();
      }
      stack.pop();
      continue;
    }

    // Undo previous move from this frame
    if (frame.applied) {
      grid.clearCell(frame.idx1);
      grid.clearCell(frame.idx2);
      placementStack.pop();
    }

    // Get next move
    const move = levelMoves[frame.depth][frame.moveIdx];
    frame.moveIdx++;
    frame.applied = true;
    frame.idx1 = move.idx1;
    frame.idx2 = move.idx2;

    // Apply move
    grid.setCell(move.idx1, move.sym1);
    grid.setCell(move.idx2, move.sym2);
    placementStack.push({ idx1: move.idx1, idx2: move.idx2, sym1: move.sym1, sym2: move.sym2 });

    explored++;

    // Complete?
    if (frame.depth + 1 === 12) {
      const score = grid.totalScore();
      if (score > bestScore) {
        bestScore = score;
        bestGrid = grid.clone();

        // Build placements
        bestPlacements = placementStack.map((p, i) => ({
          domino: ordered[i],
          pos1: { row: Math.floor(p.idx1 / 5), col: p.idx1 % 5 },
          pos2: { row: Math.floor(p.idx2 / 5), col: p.idx2 % 5 },
          flipped: p.sym1 !== ordered[i].first,
        }));

        // Update killer
        const key = (move.idx1 * 1000000 + move.idx2 * 10000 + move.sym1 * 100 + move.sym2) % 65536;
        killers[frame.depth][key]++;
        history[key] += frame.depth * frame.depth;
      }
      sendProgress();
      continue;
    }

    // Constraint check
    if (hasIsolatedCell(grid)) {
      pruned++;
      continue;
    }

    // Upper bound check
    updateSymCounts(frame.depth + 1);
    const ub = upperBound(grid, symCounts);
    if (ub <= bestScore) {
      pruned++;
      continue;
    }

    // Get next level moves
    const next = getMoves(grid, ordered[frame.depth + 1], killers[frame.depth + 1], history, 25);
    if (next.count === 0) {
      pruned++;
      continue;
    }

    // Copy moves to level storage
    for (let i = 0; i < next.count; i++) {
      const src = next.moves[i];
      const dst = levelMoves[frame.depth + 1][i];
      dst.idx1 = src.idx1;
      dst.idx2 = src.idx2;
      dst.sym1 = src.sym1;
      dst.sym2 = src.sym2;
      dst.score = src.score;
    }

    // Push new frame
    stack.push({
      depth: frame.depth + 1,
      moveIdx: 0,
      moveCount: next.count,
      applied: false,
      idx1: 0,
      idx2: 0,
    });

    // Periodic progress
    if (explored % 5000 === 0) sendProgress();
  }

  // Done
  const endTime = performance.now();

  if (!bestGrid) {
    self.postMessage({ type: 'error', error: 'No solution found' } as WorkerOutput);
    return;
  }

  // Calculate score breakdown
  const finalGrid = bestGrid.toGrid();
  const scoreBreakdown = calcBreakdown(finalGrid);

  self.postMessage({
    type: 'complete',
    explored,
    pruned,
    bestScore,
    bestGrid: finalGrid,
    elapsedMs: endTime - startTime,
    scoreBreakdown,
    placements: bestPlacements,
  } as WorkerOutput);
}

function calcBreakdown(grid: Grid): ScoreBreakdown {
  const scoreLine = (cells: (Symbol | null)[]): number => {
    let maxRun = 1, run = 1;
    for (let i = 1; i < 5; i++) {
      if (cells[i] === cells[i - 1]) {
        run++;
        if (run > maxRun) maxRun = run;
      } else {
        run = 1;
      }
    }
    return SCORE_TABLE[maxRun];
  };

  const rows = grid.map(r => scoreLine(r));
  const cols: number[] = [];
  for (let c = 0; c < 5; c++) {
    cols.push(scoreLine([grid[0][c], grid[1][c], grid[2][c], grid[3][c], grid[4][c]]));
  }
  const diagAnti = scoreLine([grid[0][4], grid[1][3], grid[2][2], grid[3][1], grid[4][0]]);

  // Anti-diagonal counts ×2
  const total = rows.reduce((a, b) => a + b, 0) + cols.reduce((a, b) => a + b, 0) + diagAnti * 2;

  return { rows, cols, diagAnti, total };
}

// Message handler
self.onmessage = (e: MessageEvent<WorkerInput>) => {
  if (e.data.type === 'start') {
    solve(e.data.startingSymbol, e.data.dominoes);
  }
};
