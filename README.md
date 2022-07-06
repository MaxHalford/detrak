# Detrak optimal score

[Detrak](https://www.philibertnet.com/en/gigamic/73968-detrak-3421271117919.html) is a fun roll and write game. Every turn you throw a pair of dice to generate two symbols at random. The goal is the score points by placing symbols on a grid. The more adjacent symbols there are, the more points you score.

</br>
<div align="center">
    <img width="40%" src="46.jpg" />
</div>
</br>

The question I'm looking to answer here is:

> ***What is the highest possible score if the sequence of symbols is known in advance?***

I haven't found a smart answer yet. The brute-force way I see is to list all the possible grid layouts, and then evaluate each layout:

- `precompute_scores.py` generates a `.json` file mapping each possible row/column/diagonal symbol combination to a score
- `enumerate_layouts.py` generates a `.txt` file with all the possible grid layouts
- `evaluate_sequence.py` calculates the best possible score for a given sequence of symbols

Each script has an `N` parameter which can be changed. I haven't managed to run `enumerate_layouts.py` with `N=5` because it's simply taking too long.
