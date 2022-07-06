import json
import math
import tqdm

N = 3
N_TILES = N ** 2
N_TURNS = (N_TILES - 1) // 2
SYMBOLS = "ABCDE"

sequence = [
    'AB',
    'BC',
    'AC',
    'BD'
]
symbols = ''.join(sequence)

assert len(sequence) == N_TURNS

def rows(grid):
    return [''.join(grid[i * N + j] for j in range(N)) for i in range(N)]

def columns(grid):
    return [''.join(grid[i + j * N] for j in range(N)) for i in range(N)]

def diagonal(grid):
    return ''.join(grid[(N - 1) * (i + 1)] for i in range(N))

with open(f'scores_{N}.json') as f:
    scores = json.load(f)

best_score = -math.inf

with open(f'layouts_{N}.txt') as f:
    pbar = tqdm.tqdm(f.readlines())
    for line in pbar:
        layout = {
            i: symbols[int(s) - 1] for i, s in enumerate(line.rstrip().split(' '))
            if s != '_' and s != '0'
        }

        for starting_symbol in SYMBOLS:
            grid = [starting_symbol] + ['_'] * (N_TILES - 1)
            for pos, symbol in layout.items():
                grid[pos] = symbol
            score = sum(
                scores[line] or -5
                for line in (
                    rows(grid) +
                    columns(grid) +
                    [diagonal(grid), diagonal(grid)]
                )
            )
            if score > best_score:
                pbar.set_description(f"Current best score is {best_score}")
                best_score = score
