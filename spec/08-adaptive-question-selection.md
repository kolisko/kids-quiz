# Adaptive Question Selection

## Purpose

The app should show difficult questions more often so children practice weak areas across multiple sessions.

## Inputs

For each question:
- Server stats: `correct`, `wrong`, `timeout`.
- Session mistakes: local count for mistakes in the current game.

## Current Weight Formula

For question index `i`:

```text
mistakes = wrong + timeout
longTermDifficulty = max(0, mistakes * 2 - correct)
sessionDifficulty = currentSessionMistakes[i]
weight = 1 + longTermDifficulty * 2 + sessionDifficulty * 3
```

Selection builds a weighted list of indices and picks randomly from it.

## Effects

- Every question always has at least weight `1`.
- Wrong and timeout results increase long-term probability.
- Correct results reduce long-term difficulty pressure over time, but do not delete history.
- Current-session mistakes have a strong short-term effect.

## Examples

New question:

```text
correct=0, wrong=0, timeout=0, session=0
weight=1
```

Question with 2 wrong answers:

```text
correct=0, wrong=2, timeout=0, session=0
longTermDifficulty=4
weight=9
```

Question with 4 correct and 1 timeout:

```text
correct=4, wrong=0, timeout=1, session=0
longTermDifficulty=max(0, 2 - 4)=0
weight=1
```

## Future Extensions

- Per-user profiles.
- Decay old mistakes over time.
- Separate weighting for wrong vs timeout.
- Show a parent-facing "hardest questions" report.
- Reset stats from settings.
