/**
 * Web Worker wrapper for the optimized solver
 */

import type {
  Symbol,
  SolverConfig,
  SolverResult,
  ScoreBreakdown,
  Grid,
} from './types';
import type { WorkerInput, WorkerOutput } from './worker';

// Calculate score breakdown (for progress updates)
// Scores are summed for all runs in a line
const SCORE_TABLE: number[] = [0, 0, 2, 3, 8, 10];

function calcBreakdown(grid: Grid): ScoreBreakdown {
  const scoreLine = (cells: (Symbol | null)[]): number => {
    let totalScore = 0;
    let run = 1;
    let hasAnyRun = false;
    for (let i = 1; i < 5; i++) {
      if (cells[i] === cells[i - 1]) {
        run++;
      } else {
        if (run >= 2) {
          totalScore += SCORE_TABLE[run];
          hasAnyRun = true;
        }
        run = 1;
      }
    }
    if (run >= 2) {
      totalScore += SCORE_TABLE[run];
      hasAnyRun = true;
    }
    return hasAnyRun ? totalScore : -5;
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

export function createWorkerSolver(config: SolverConfig): {
  start: () => Promise<SolverResult>;
  cancel: () => void;
} {
  const { startingSymbol, dominoes, onProgress } = config;

  let worker: Worker | null = null;
  let cancelled = false;

  const start = (): Promise<SolverResult> => {
    return new Promise((resolve, reject) => {
      // Create worker from blob (to avoid separate file bundling issues)
      const workerCode = `
${workerSource}
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      worker = new Worker(workerUrl, { type: 'module' });

      worker.onmessage = (e: MessageEvent<WorkerOutput>) => {
        if (cancelled) return;

        const data = e.data;

        if (data.type === 'progress') {
          // Calculate breakdown for progress grid
          let breakdown: ScoreBreakdown | undefined;
          if (data.bestGrid) {
            breakdown = calcBreakdown(data.bestGrid);
          }

          onProgress?.({
            explored: data.explored || 0,
            pruned: data.pruned || 0,
            bestScore: data.bestScore || 0,
            bestGrid: data.bestGrid || null,
            bestPlacements: data.placements || undefined,
            scoreBreakdown: breakdown,
            currentDepth: 0,
            elapsedMs: data.elapsedMs || 0,
            status: 'running',
            estimatedProgress: Math.min(99, Math.log10((data.explored || 0) + 1) * 10),
          });
        } else if (data.type === 'complete') {
          URL.revokeObjectURL(workerUrl);
          worker?.terminate();

          resolve({
            bestScore: data.bestScore!,
            bestGrid: data.bestGrid!,
            bestPlacements: data.placements || [],
            scoreBreakdown: data.scoreBreakdown!,
            stats: {
              totalExplored: data.explored || 0,
              totalPruned: data.pruned || 0,
              elapsedMs: data.elapsedMs || 0,
            },
          });
        } else if (data.type === 'error') {
          URL.revokeObjectURL(workerUrl);
          worker?.terminate();
          reject(new Error(data.error));
        }
      };

      worker.onerror = (e) => {
        URL.revokeObjectURL(workerUrl);
        reject(new Error(e.message));
      };

      // Start solver
      worker.postMessage({
        type: 'start',
        startingSymbol,
        dominoes,
      } as WorkerInput);
    });
  };

  const cancel = () => {
    cancelled = true;
    worker?.terminate();
  };

  return { start, cancel };
}

// Inline worker source (will be bundled)
const workerSource = `
const SCORE_TABLE = new Int8Array([0, 0, 2, 3, 8, 10]);

const ADJACENT_PAIRS = [];
for (let row = 0; row < 5; row++) {
  for (let col = 0; col < 5; col++) {
    const idx = row * 5 + col;
    if (col < 4) ADJACENT_PAIRS.push([idx, idx + 1]);
    if (row < 4) ADJACENT_PAIRS.push([idx, idx + 5]);
  }
}

const LINES = [
  new Int8Array([0, 1, 2, 3, 4]),
  new Int8Array([5, 6, 7, 8, 9]),
  new Int8Array([10, 11, 12, 13, 14]),
  new Int8Array([15, 16, 17, 18, 19]),
  new Int8Array([20, 21, 22, 23, 24]),
  new Int8Array([0, 5, 10, 15, 20]),
  new Int8Array([1, 6, 11, 16, 21]),
  new Int8Array([2, 7, 12, 17, 22]),
  new Int8Array([3, 8, 13, 18, 23]),
  new Int8Array([4, 9, 14, 19, 24]),
  new Int8Array([4, 8, 12, 16, 20]),
];
const DIAG_ANTI_INDEX = 10;

const CELL_LINES = [];
for (let i = 0; i < 25; i++) {
  const lines = [];
  for (let lineIdx = 0; lineIdx < 11; lineIdx++) {
    if (LINES[lineIdx].includes(i)) lines.push(lineIdx);
  }
  CELL_LINES[i] = new Int8Array(lines);
}

const NEIGHBORS = [];
for (let i = 0; i < 25; i++) {
  const row = Math.floor(i / 5);
  const col = i % 5;
  const n = [];
  if (row > 0) n.push(i - 5);
  if (row < 4) n.push(i + 5);
  if (col > 0) n.push(i - 1);
  if (col < 4) n.push(i + 1);
  NEIGHBORS[i] = new Int8Array(n);
}

class FastGrid {
  constructor() {
    this.cells = new Int8Array(25);
    this.lineScores = new Int8Array(11);
    this.lineFilled = new Int8Array(11);
    this.hash = 0;
  }

  setCell(idx, value) {
    const old = this.cells[idx];
    if (old !== 0) this.hash ^= (old * 7919 + idx * 104729) | 0;
    this.hash ^= (value * 7919 + idx * 104729) | 0;
    this.cells[idx] = value;
    const lines = CELL_LINES[idx];
    for (let i = 0; i < lines.length; i++) {
      const lineIdx = lines[i];
      if (old === 0) this.lineFilled[lineIdx]++;
      this.lineScores[lineIdx] = this.scoreLine(lineIdx);
    }
  }

  clearCell(idx) {
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

  scoreLine(lineIdx) {
    const line = LINES[lineIdx];
    let totalScore = 0, run = 0, last = 0, filled = 0, hasAnyRun = false;
    for (let i = 0; i < 5; i++) {
      const c = this.cells[line[i]];
      if (c === 0) {
        if (run >= 2) { totalScore += SCORE_TABLE[run]; hasAnyRun = true; }
        run = 0; last = 0;
      } else {
        filled++;
        if (c === last) { run++; }
        else {
          if (run >= 2) { totalScore += SCORE_TABLE[run]; hasAnyRun = true; }
          run = 1; last = c;
        }
      }
    }
    if (run >= 2) { totalScore += SCORE_TABLE[run]; hasAnyRun = true; }
    if (filled === 5 && !hasAnyRun) return -5;
    return totalScore;
  }

  totalScore() {
    let sum = 0;
    for (let i = 0; i < 11; i++) sum += this.lineScores[i];
    // Main diagonal counts ×2
    return sum + this.lineScores[DIAG_ANTI_INDEX];
  }

  clone() {
    const g = new FastGrid();
    g.cells.set(this.cells);
    g.lineScores.set(this.lineScores);
    g.lineFilled.set(this.lineFilled);
    g.hash = this.hash;
    return g;
  }

  toGrid() {
    const grid = [];
    for (let r = 0; r < 5; r++) {
      const row = [];
      for (let c = 0; c < 5; c++) {
        const v = this.cells[r * 5 + c];
        row.push(v === 0 ? null : v);
      }
      grid.push(row);
    }
    return grid;
  }
}

function hasIsolatedCell(grid) {
  for (let i = 0; i < 25; i++) {
    if (grid.cells[i] !== 0) continue;
    const neighbors = NEIGHBORS[i];
    let hasEmpty = false;
    for (let j = 0; j < neighbors.length; j++) {
      if (grid.cells[neighbors[j]] === 0) { hasEmpty = true; break; }
    }
    if (!hasEmpty) return true;
  }
  return false;
}

function countMatching(grid, idx, sym) {
  const neighbors = NEIGHBORS[idx];
  let count = 0;
  for (let i = 0; i < neighbors.length; i++) {
    if (grid.cells[neighbors[i]] === sym) count++;
  }
  return count;
}

function upperBound(grid, symCounts) {
  let bound = 0;
  let diagBound = 0;
  for (let lineIdx = 0; lineIdx < 11; lineIdx++) {
    const filled = grid.lineFilled[lineIdx];
    const empty = 5 - filled;
    let lineContrib = 0;
    if (empty === 0) { lineContrib = grid.lineScores[lineIdx]; }
    else {
      const line = LINES[lineIdx];
      let maxPossible = 0;
      for (let s = 1; s <= 6; s++) {
        let count = 0;
        for (let i = 0; i < 5; i++) if (grid.cells[line[i]] === s) count++;
        if (count > 0) {
          const potential = Math.min(5, count + Math.min(empty, symCounts[s]));
          if (potential > maxPossible) maxPossible = potential;
        }
      }
      if (empty >= 2 && maxPossible < empty) {
        let maxSym = 0;
        for (let s = 1; s <= 6; s++) if (symCounts[s] > maxSym) maxSym = symCounts[s];
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

const movePool = [];
for (let i = 0; i < 100; i++) movePool.push({ idx1: 0, idx2: 0, sym1: 0, sym2: 0, score: 0 });

function getMoves(grid, dom, killers, history, beamWidth) {
  let count = 0;
  for (let p = 0; p < ADJACENT_PAIRS.length; p++) {
    const [idx1, idx2] = ADJACENT_PAIRS[p];
    if (grid.cells[idx1] !== 0 || grid.cells[idx2] !== 0) continue;
    const syms = [[dom.first, dom.second]];
    if (dom.first !== dom.second) syms.push([dom.second, dom.first]);
    for (const [s1, s2] of syms) {
      const move = movePool[count++];
      move.idx1 = idx1; move.idx2 = idx2; move.sym1 = s1; move.sym2 = s2;
      let score = countMatching(grid, idx1, s1) * 100 + countMatching(grid, idx2, s2) * 100;
      if (s1 === s2) score += 200;
      const keyMod = (idx1 * 1000000 + idx2 * 10000 + s1 * 100 + s2) % 65536;
      score += killers[keyMod] * 500 + history[keyMod];
      move.score = score;
    }
  }
  for (let i = 1; i < count; i++) {
    const m = movePool[i];
    let j = i - 1;
    while (j >= 0 && movePool[j].score < m.score) { movePool[j + 1] = movePool[j]; j--; }
    movePool[j + 1] = m;
  }
  return { moves: movePool, count: Math.min(count, beamWidth) };
}

function solve(startingSymbol, dominoes) {
  const grid = new FastGrid();
  grid.setCell(0, startingSymbol);

  const freq = new Int8Array(7);
  freq[startingSymbol]++;
  for (const d of dominoes) { freq[d.first]++; freq[d.second]++; }

  // Track original indices when sorting
  const indexed = dominoes.map((d, i) => ({ domino: d, originalIndex: i }));
  indexed.sort((a, b) => {
    const aD = a.domino.first === a.domino.second ? 1 : 0;
    const bD = b.domino.first === b.domino.second ? 1 : 0;
    if (aD !== bD) return bD - aD;
    return (freq[b.domino.first] + freq[b.domino.second]) - (freq[a.domino.first] + freq[a.domino.second]);
  });
  const ordered = indexed.map(x => x.domino);
  const originalIndices = indexed.map(x => x.originalIndex);

  let bestScore = -Infinity;
  let bestGrid = null;
  let bestPlacements = [];
  let explored = 0, pruned = 0;
  const startTime = performance.now();
  let lastUpdate = startTime;

  const killers = [];
  const history = new Int32Array(65536);
  for (let i = 0; i < 12; i++) killers.push(new Int32Array(65536));

  const symCounts = new Int8Array(7);

  function updateSymCounts(depth) {
    symCounts.fill(0);
    for (let i = depth; i < 12; i++) {
      symCounts[ordered[i].first]++;
      symCounts[ordered[i].second]++;
    }
  }

  function quickSolve(depth) {
    if (depth === 12) {
      const score = grid.totalScore();
      if (score > bestScore) { bestScore = score; bestGrid = grid.clone(); }
      return true;
    }
    const { moves, count } = getMoves(grid, ordered[depth], killers[depth], history, 100);
    for (let i = 0; i < Math.min(3, count); i++) {
      const m = moves[i];
      grid.setCell(m.idx1, m.sym1); grid.setCell(m.idx2, m.sym2);
      if (!hasIsolatedCell(grid) && quickSolve(depth + 1)) {
        grid.clearCell(m.idx1); grid.clearCell(m.idx2); return true;
      }
      grid.clearCell(m.idx1); grid.clearCell(m.idx2);
    }
    return false;
  }

  quickSolve(0);
  for (let i = 1; i < 25; i++) grid.clearCell(i);

  const sendProgress = () => {
    const now = performance.now();
    if (now - lastUpdate > 50) {
      lastUpdate = now;
      self.postMessage({
        type: 'progress', explored, pruned,
        bestScore: bestScore === -Infinity ? 0 : bestScore,
        bestGrid: bestGrid?.toGrid() || null,
        placements: bestPlacements.length > 0 ? bestPlacements : null,
        elapsedMs: now - startTime,
      });
    }
  };

  const stack = [];
  const placementStack = [];
  const levelMoves = [];
  for (let i = 0; i < 12; i++) {
    levelMoves[i] = [];
    for (let j = 0; j < 100; j++) levelMoves[i].push({ idx1: 0, idx2: 0, sym1: 0, sym2: 0, score: 0 });
  }

  updateSymCounts(0);
  const init = getMoves(grid, ordered[0], killers[0], history, 40);
  stack.push({ depth: 0, moveIdx: 0, moveCount: init.count, applied: false, idx1: 0, idx2: 0 });
  for (let i = 0; i < init.count; i++) {
    const src = init.moves[i], dst = levelMoves[0][i];
    dst.idx1 = src.idx1; dst.idx2 = src.idx2; dst.sym1 = src.sym1; dst.sym2 = src.sym2; dst.score = src.score;
  }

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame.moveIdx >= frame.moveCount) {
      if (frame.applied) { grid.clearCell(frame.idx1); grid.clearCell(frame.idx2); placementStack.pop(); }
      stack.pop(); continue;
    }
    if (frame.applied) { grid.clearCell(frame.idx1); grid.clearCell(frame.idx2); placementStack.pop(); }
    const move = levelMoves[frame.depth][frame.moveIdx];
    frame.moveIdx++; frame.applied = true; frame.idx1 = move.idx1; frame.idx2 = move.idx2;
    grid.setCell(move.idx1, move.sym1); grid.setCell(move.idx2, move.sym2);
    placementStack.push({ idx1: move.idx1, idx2: move.idx2, sym1: move.sym1, sym2: move.sym2 });
    explored++;

    if (frame.depth + 1 === 12) {
      const score = grid.totalScore();
      if (score > bestScore) {
        bestScore = score; bestGrid = grid.clone();
        bestPlacements = placementStack.map((p, i) => ({
          domino: ordered[i],
          originalIndex: originalIndices[i],
          pos1: { row: Math.floor(p.idx1 / 5), col: p.idx1 % 5 },
          pos2: { row: Math.floor(p.idx2 / 5), col: p.idx2 % 5 },
          flipped: p.sym1 !== ordered[i].first,
        }));
        const key = (move.idx1 * 1000000 + move.idx2 * 10000 + move.sym1 * 100 + move.sym2) % 65536;
        killers[frame.depth][key]++; history[key] += frame.depth * frame.depth;
      }
      sendProgress(); continue;
    }

    if (hasIsolatedCell(grid)) { pruned++; continue; }
    updateSymCounts(frame.depth + 1);
    if (upperBound(grid, symCounts) <= bestScore) { pruned++; continue; }

    const next = getMoves(grid, ordered[frame.depth + 1], killers[frame.depth + 1], history, 40);
    if (next.count === 0) { pruned++; continue; }

    for (let i = 0; i < next.count; i++) {
      const src = next.moves[i], dst = levelMoves[frame.depth + 1][i];
      dst.idx1 = src.idx1; dst.idx2 = src.idx2; dst.sym1 = src.sym1; dst.sym2 = src.sym2; dst.score = src.score;
    }

    stack.push({ depth: frame.depth + 1, moveIdx: 0, moveCount: next.count, applied: false, idx1: 0, idx2: 0 });
    if (explored % 5000 === 0) sendProgress();
  }

  const endTime = performance.now();
  if (!bestGrid) { self.postMessage({ type: 'error', error: 'No solution found' }); return; }

  const finalGrid = bestGrid.toGrid();
  const scoreLine = (cells) => {
    let totalScore = 0, run = 1, hasAnyRun = false;
    for (let i = 1; i < 5; i++) {
      if (cells[i] === cells[i - 1]) { run++; }
      else { if (run >= 2) { totalScore += SCORE_TABLE[run]; hasAnyRun = true; } run = 1; }
    }
    if (run >= 2) { totalScore += SCORE_TABLE[run]; hasAnyRun = true; }
    return hasAnyRun ? totalScore : -5;
  };
  const rows = finalGrid.map(r => scoreLine(r));
  const cols = [];
  for (let c = 0; c < 5; c++) cols.push(scoreLine([finalGrid[0][c], finalGrid[1][c], finalGrid[2][c], finalGrid[3][c], finalGrid[4][c]]));
  const diagAnti = scoreLine([finalGrid[0][4], finalGrid[1][3], finalGrid[2][2], finalGrid[3][1], finalGrid[4][0]]);
  const total = rows.reduce((a, b) => a + b, 0) + cols.reduce((a, b) => a + b, 0) + diagAnti * 2;

  self.postMessage({
    type: 'complete', explored, pruned, bestScore,
    bestGrid: finalGrid, elapsedMs: endTime - startTime,
    scoreBreakdown: { rows, cols, diagAnti, total },
    placements: bestPlacements,
  });
}

self.onmessage = (e) => { if (e.data.type === 'start') solve(e.data.startingSymbol, e.data.dominoes); };
`;
