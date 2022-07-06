import itertools
import json

N = 3
SYMBOLS = "ABCDE"

SCORE_GRID = {
    1: 0,
    2: 2,
    3: 3,
    4: 8,
    5: 10
}

def compute_score(sequence):
    return sum(
        SCORE_GRID[sum(1 for _ in group)]
        for symbol, group in itertools.groupby(sequence)
        if symbol != '_'
    )

if __name__ == "__main__":
    scores = {
        "".join(seq): compute_score(seq)
        for seq in itertools.product(SYMBOLS + '_', repeat=N)
    }
    with open(f'scores_{N}.json', 'w') as f:
        json.dump(scores, f, sort_keys=True, indent=4)
