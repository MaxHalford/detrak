import type {
  Grid,
  Domino,
  Position,
  Placement,
  SolverConfig,
  SolverProgress,
  SolverResult,
  Symbol,
} from './types';
import { calculateScore, calculateUpperBound } from './scoring';

/**
 * Create an empty 5x5 grid with the starting symbol at position (0,0)
 */
function createInitialGrid(startingSymbol: Symbol): Grid {
  const grid: Grid = Array(5).fill(null).map(() => Array(5).fill(null));
  grid[0][0] = startingSymbol;
  return grid;
}

/**
 * Clone a grid for backtracking
 */
function cloneGrid(grid: Grid): Grid {
  return grid.map(row => [...row]);
}

/**
 * Get all empty cells in the grid
 */
function getEmptyCells(grid: Grid): Position[] {
  const empty: Position[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (grid[row][col] === null) {
        empty.push({ row, col });
      }
    }
  }
  return empty;
}

/**
 * Check if two positions are adjacent (horizontally or vertically)
 */
function areAdjacent(p1: Position, p2: Position): boolean {
  const rowDiff = Math.abs(p1.row - p2.row);
  const colDiff = Math.abs(p1.col - p2.col);
  return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
}

/**
 * Get all valid domino placements for a given grid and domino
 * Returns placements sorted to prioritize positions likely to create runs
 */
function getValidPlacements(grid: Grid, domino: Domino): Placement[] {
  const emptyCells = getEmptyCells(grid);
  const placements: Placement[] = [];

  // Find all pairs of adjacent empty cells
  for (let i = 0; i < emptyCells.length; i++) {
    for (let j = i + 1; j < emptyCells.length; j++) {
      const pos1 = emptyCells[i];
      const pos2 = emptyCells[j];

      if (areAdjacent(pos1, pos2)) {
        // Add both orientations (not flipped and flipped)
        placements.push({
          domino,
          pos1,
          pos2,
          flipped: false,
        });

        // Only add flipped if symbols are different
        if (domino.first !== domino.second) {
          placements.push({
            domino,
            pos1,
            pos2,
            flipped: true,
          });
        }
      }
    }
  }

  // Sort placements to prioritize those that extend existing runs
  return placements.sort((a, b) => {
    const scoreA = evaluatePlacementPotential(grid, a);
    const scoreB = evaluatePlacementPotential(grid, b);
    return scoreB - scoreA;
  });
}

/**
 * Heuristic to evaluate how promising a placement is
 * Higher values = more likely to create/extend runs
 */
function evaluatePlacementPotential(grid: Grid, placement: Placement): number {
  const { pos1, pos2, domino, flipped } = placement;
  const sym1 = flipped ? domino.second : domino.first;
  const sym2 = flipped ? domino.first : domino.second;

  let score = 0;

  // Check neighbors of pos1 for matching symbols
  score += countMatchingNeighbors(grid, pos1, sym1) * 2;

  // Check neighbors of pos2 for matching symbols
  score += countMatchingNeighbors(grid, pos2, sym2) * 2;

  // Bonus if both symbols of domino are the same (doubles)
  if (domino.first === domino.second) {
    score += 3;
  }

  // Bonus for corner/edge positions that concentrate runs
  if (isCornerOrEdge(pos1)) score += 1;
  if (isCornerOrEdge(pos2)) score += 1;

  return score;
}

/**
 * Count how many adjacent filled cells match a given symbol
 */
function countMatchingNeighbors(grid: Grid, pos: Position, symbol: Symbol): number {
  const neighbors = [
    { row: pos.row - 1, col: pos.col },
    { row: pos.row + 1, col: pos.col },
    { row: pos.row, col: pos.col - 1 },
    { row: pos.row, col: pos.col + 1 },
  ];

  let count = 0;
  for (const n of neighbors) {
    if (n.row >= 0 && n.row < 5 && n.col >= 0 && n.col < 5) {
      if (grid[n.row][n.col] === symbol) {
        count++;
      }
    }
  }
  return count;
}

function isCornerOrEdge(pos: Position): boolean {
  return pos.row === 0 || pos.row === 4 || pos.col === 0 || pos.col === 4;
}

/**
 * Apply a placement to a grid (mutates grid)
 */
function applyPlacement(grid: Grid, placement: Placement): void {
  const { pos1, pos2, domino, flipped } = placement;
  grid[pos1.row][pos1.col] = flipped ? domino.second : domino.first;
  grid[pos2.row][pos2.col] = flipped ? domino.first : domino.second;
}

/**
 * Remove a placement from a grid (mutates grid)
 */
function removePlacement(grid: Grid, placement: Placement): void {
  const { pos1, pos2 } = placement;
  grid[pos1.row][pos1.col] = null;
  grid[pos2.row][pos2.col] = null;
}

/**
 * Async solver that yields to UI between batches
 * Uses iterative deepening with proper backtracking
 */
export function createAsyncSolver(config: SolverConfig): {
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

      const grid = createInitialGrid(startingSymbol);

      let bestScore = -Infinity;
      let bestGrid: Grid | null = null;
      let bestPlacements: Placement[] = [];

      let explored = 0;
      let pruned = 0;
      const startTime = Date.now();
      const BATCH_SIZE = 2000;

      const updateProgress = (depth: number, status: SolverProgress['status'] = 'running') => {
        const now = Date.now();
        const progress: SolverProgress = {
          explored,
          pruned,
          bestScore: bestScore === -Infinity ? 0 : bestScore,
          bestGrid: bestGrid ? cloneGrid(bestGrid) : null,
          currentDepth: depth,
          elapsedMs: now - startTime,
          status,
          estimatedProgress: Math.min(99, Math.log10(explored + 1) * 10),
        };
        onProgress?.(progress);
      };

      // Stack frame that stores state needed for backtracking
      interface StackFrame {
        depth: number;
        placementIndex: number;
        validPlacements: Placement[];
        appliedPlacement: Placement | null;
      }

      const stack: StackFrame[] = [];
      const placementStack: Placement[] = []; // Track applied placements for final result

      // Initialize with first level
      const initialPlacements = getValidPlacements(grid, dominoes[0]);
      if (initialPlacements.length === 0) {
        reject(new Error('No valid initial placements'));
        return;
      }

      stack.push({
        depth: 0,
        placementIndex: 0,
        validPlacements: initialPlacements,
        appliedPlacement: null,
      });

      const processBatch = () => {
        if (cancelled) {
          updateProgress(0, 'cancelled');
          reject(new Error('Solver cancelled'));
          return;
        }

        let operationsThisBatch = 0;

        while (stack.length > 0 && operationsThisBatch < BATCH_SIZE) {
          if (cancelled) {
            updateProgress(0, 'cancelled');
            reject(new Error('Solver cancelled'));
            return;
          }

          const frame = stack[stack.length - 1];
          operationsThisBatch++;

          // Check if we've exhausted placements at this level
          if (frame.placementIndex >= frame.validPlacements.length) {
            // Backtrack: remove the placement we made to get here
            if (frame.appliedPlacement) {
              removePlacement(grid, frame.appliedPlacement);
              placementStack.pop();
            }
            stack.pop();
            continue;
          }

          // If there's a previously applied placement from this frame, remove it first
          if (frame.appliedPlacement) {
            removePlacement(grid, frame.appliedPlacement);
            placementStack.pop();
          }

          // Get next placement to try
          const placement = frame.validPlacements[frame.placementIndex];
          frame.placementIndex++;
          frame.appliedPlacement = placement;

          // Apply this placement
          applyPlacement(grid, placement);
          placementStack.push(placement);
          explored++;

          // Check if complete (12 dominoes placed)
          if (frame.depth + 1 === 12) {
            const score = calculateScore(grid);
            if (score.total > bestScore) {
              bestScore = score.total;
              bestGrid = cloneGrid(grid);
              bestPlacements = [...placementStack];
              updateProgress(12);
            }
            continue;
          }

          // Pruning check
          const upperBound = calculateUpperBound(grid);
          if (upperBound <= bestScore) {
            pruned++;
            continue;
          }

          // Get placements for next level
          const nextPlacements = getValidPlacements(grid, dominoes[frame.depth + 1]);
          if (nextPlacements.length === 0) {
            pruned++;
            continue;
          }

          // Push new frame for next depth
          stack.push({
            depth: frame.depth + 1,
            placementIndex: 0,
            validPlacements: nextPlacements,
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
          const finalScore = calculateScore(bestGrid);

          updateProgress(12, 'complete');

          resolve({
            bestScore,
            bestGrid,
            bestPlacements,
            scoreBreakdown: finalScore,
            stats: {
              totalExplored: explored,
              totalPruned: pruned,
              elapsedMs: endTime - startTime,
            },
          });
          return;
        }

        // Continue processing - use requestAnimationFrame for smoother UI
        setTimeout(processBatch, 0);
      };

      updateProgress(0, 'running');
      setTimeout(processBatch, 0);
    });
  };

  const cancel = () => {
    cancelled = true;
  };

  return { start, cancel };
}
