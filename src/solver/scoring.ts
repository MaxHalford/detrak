import type { Grid, Cell, ScoreBreakdown } from './types';

// Scoring table for adjacent identical symbols
// 2 adjacent: 2 points
// 3 adjacent: 3 points
// 4 adjacent: 8 points (4 + 4 bonus)
// 5 adjacent: 10 points (5 + 5 bonus)
// No pairs: -5 penalty
const SCORE_TABLE: Record<number, number> = {
  0: -5,  // Penalty for no adjacent pairs
  1: -5,  // Single symbol counts as no pairs
  2: 2,
  3: 3,
  4: 8,
  5: 10,
};

/**
 * Calculate score for a single line (row, column, or diagonal)
 * Finds the longest run of adjacent identical symbols
 */
export function scoreLineComplete(line: Cell[]): number {
  if (line.some(cell => cell === null)) {
    throw new Error('Cannot score incomplete line');
  }

  let maxRun = 1;
  let currentRun = 1;

  for (let i = 1; i < line.length; i++) {
    if (line[i] === line[i - 1]) {
      currentRun++;
      maxRun = Math.max(maxRun, currentRun);
    } else {
      currentRun = 1;
    }
  }

  return SCORE_TABLE[maxRun] ?? -5;
}

/**
 * Calculate score for a line that may have empty cells
 * Used for partial grid evaluation
 */
export function scoreLinePartial(line: Cell[]): number {
  const filled = line.filter(c => c !== null);
  if (filled.length === 0) return 0;

  let maxRun = 1;
  let currentRun = 1;
  let lastSymbol: Cell = null;

  for (const cell of line) {
    if (cell === null) {
      currentRun = 1;
      lastSymbol = null;
      continue;
    }
    if (cell === lastSymbol) {
      currentRun++;
      maxRun = Math.max(maxRun, currentRun);
    } else {
      currentRun = 1;
    }
    lastSymbol = cell;
  }

  // Only return penalty if line is complete with no runs
  if (filled.length === line.length && maxRun === 1) {
    return -5;
  }

  return SCORE_TABLE[maxRun] ?? 0;
}

/**
 * Calculate the maximum possible score for a partially filled line
 * Used for upper bound estimation in pruning
 */
export function maxPossibleLineScore(line: Cell[]): number {
  const filled = line.filter(c => c !== null);
  const empty = line.length - filled.length;

  if (empty === 0) {
    return scoreLineComplete(line);
  }

  // If line is all empty, max possible is 10 (5 adjacent)
  if (filled.length === 0) {
    return 10;
  }

  // Calculate current best run
  let maxRun = 1;
  let currentRun = 1;
  let lastSymbol: Cell = null;

  for (const cell of line) {
    if (cell === null) {
      currentRun = 1;
      lastSymbol = null;
      continue;
    }
    if (cell === lastSymbol) {
      currentRun++;
      maxRun = Math.max(maxRun, currentRun);
    } else {
      currentRun = 1;
    }
    lastSymbol = cell;
  }

  // Optimistic: assume we can fill empties to maximize run
  // The theoretical max is all 5 cells being the same
  const potentialMax = Math.min(5, maxRun + empty);
  return SCORE_TABLE[potentialMax] ?? 10;
}

/**
 * Calculate complete score breakdown for a filled grid
 */
export function calculateScore(grid: Grid): ScoreBreakdown {
  const rows: number[] = [];
  const cols: number[] = [];

  // Score rows
  for (let r = 0; r < 5; r++) {
    rows.push(scoreLineComplete(grid[r]));
  }

  // Score columns
  for (let c = 0; c < 5; c++) {
    const col = [grid[0][c], grid[1][c], grid[2][c], grid[3][c], grid[4][c]];
    cols.push(scoreLineComplete(col));
  }

  // Score anti-diagonal (top-right to bottom-left) - counts ×2
  const antiDiag = [grid[0][4], grid[1][3], grid[2][2], grid[3][1], grid[4][0]];
  const diagAnti = scoreLineComplete(antiDiag);

  const total = rows.reduce((a, b) => a + b, 0) +
                cols.reduce((a, b) => a + b, 0) +
                diagAnti * 2;

  return { rows, cols, diagAnti, total };
}

/**
 * Calculate current score for a partially filled grid
 */
export function calculatePartialScore(grid: Grid): number {
  let score = 0;

  // Score rows
  for (let r = 0; r < 5; r++) {
    score += scoreLinePartial(grid[r]);
  }

  // Score columns
  for (let c = 0; c < 5; c++) {
    const col = [grid[0][c], grid[1][c], grid[2][c], grid[3][c], grid[4][c]];
    score += scoreLinePartial(col);
  }

  // Score diagonals
  const mainDiag = [grid[0][0], grid[1][1], grid[2][2], grid[3][3], grid[4][4]];
  score += scoreLinePartial(mainDiag);

  const antiDiag = [grid[0][4], grid[1][3], grid[2][2], grid[3][1], grid[4][0]];
  score += scoreLinePartial(antiDiag);

  return score;
}

/**
 * Calculate upper bound on possible score from current state
 * Used for branch and bound pruning
 */
export function calculateUpperBound(grid: Grid): number {
  let bound = 0;

  // Upper bound for rows
  for (let r = 0; r < 5; r++) {
    bound += maxPossibleLineScore(grid[r]);
  }

  // Upper bound for columns
  for (let c = 0; c < 5; c++) {
    const col = [grid[0][c], grid[1][c], grid[2][c], grid[3][c], grid[4][c]];
    bound += maxPossibleLineScore(col);
  }

  // Upper bound for diagonals
  const mainDiag = [grid[0][0], grid[1][1], grid[2][2], grid[3][3], grid[4][4]];
  bound += maxPossibleLineScore(mainDiag);

  const antiDiag = [grid[0][4], grid[1][3], grid[2][2], grid[3][1], grid[4][0]];
  bound += maxPossibleLineScore(antiDiag);

  return bound;
}
