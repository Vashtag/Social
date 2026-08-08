# Tests

`validate.mjs` checks the puzzle data embedded in each game's `index.html`. It
is read-only — it never edits the games — and exits non-zero if anything is
malformed, so bad content can't ship unnoticed.

```sh
node tests/validate.mjs
```

What it verifies:

- **Wordle** — every answer is exactly 5 letters, no duplicates; the guess
  list is a clean blob; every answer is itself a legal guess.
- **Hangman** — every entry has a lowercase term and a non-empty hint.
- **Rootle** — each puzzle has 4 terms whose roots concatenate to real words,
  every clue has text, and the tile pool can always reach 12 (real + distractors).
- **Connections** — each puzzle is four groups of four with 16 unique words.
- **Waffle** — each scramble uses the solution's exact letters, starts with no
  green tiles, and is solvable within a sane swap budget; the glossary defines
  every Waffle word and Wordle answer.

Runs automatically on push / pull request via
`.github/workflows/validate.yml`.
