import itertools
import json

SYMBOLS = "ABCDE"

SCORE_GRID = {
    1: 0,
    2: 2,
    3: 3,
    4: 8,
    5: 10
}

def compute_score(sequence):
    return sum(SCORE_GRID[sum(1 for _ in group)] for _, group in itertools.groupby(sequence))

if __name__ == "__main__":
    scores = {
        "".join(seq): compute_score(seq)
        for seq in itertools.product(SYMBOLS, repeat=5)
    }
    with open('scores.json', 'w') as f:
        json.dump(scores, f, sort_keys=True, indent=4)
