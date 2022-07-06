import copy
import itertools
import tqdm

N = 5
N_TILES = N ** 2
N_TURNS = (N_TILES - 1) // 2

class Grid:

    def __init__(self, starting_symbol):
        self.layout = [starting_symbol] + [None] * (N_TILES - 1)

    @property
    def rows(self):
        return [[self.layout[i * N + j] for j in range(N)] for i in range(N)]

    @property
    def columns(self):
        return [
            [self.layout[i + j * N] for j in range(N)]
            for i in range(N)
        ]

    def __getitem__(self, at):
        i, j = at
        return self.layout[N * i + j]

    def is_free(self, *at):
        return self[at] is None

    def __setitem__(self, at, symbol):
        i, j = at
        self.layout[N * i + j] = symbol

    def __copy__(self):
        g = Grid(self[0, 0])
        g.layout = self.layout[:]
        return g


def enum(grid, turn, layouts, pbar):

    if turn == N_TURNS:
        layouts.append(grid.layout)
        pbar.update(1)
        return

    found = False

    for i, j in itertools.product(range(N), repeat=2):
        if not grid.is_free(i, j):
            continue

        # Handle symmetries
        if turn == 0 and i > j:
            continue

        for w, h in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            if not (
                0 <= i + w < N and
                0 <= j + h < N and
                grid.is_free(i + w, j + h)
            ):
                continue

            new_grid = copy.copy(grid)
            new_grid[i, j] = 2 * turn + 1
            new_grid[i + w, j + h] = 2 * turn + 2
            found = True

            enum(new_grid, turn=turn+1, layouts=layouts, pbar=pbar)

    # Cases where the grid can't be filled anymore
    else:
        if not found:
            layouts.append(grid.layout)
            pbar.update(1)

layouts = []
grid = Grid(0)
pbar = tqdm.tqdm()
enum(grid, turn=0, layouts=layouts, pbar=pbar)

with open(f'layouts_{N}.txt', 'w') as f:
    for layout in layouts:
        code = ' '.join('_' if i is None else str(i) for i in layout)
        f.write(f"{code}\n")
