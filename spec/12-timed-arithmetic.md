# Timed arithmetic up to 20

- Menu key: `tests.math.timed-arithmetic`; visible in the existing per-user menu tree.
- Three consecutive levels, 120 seconds each by default. Each user can PATCH
  `timedArithmeticSeconds` on `/api/settings` (three integers, 10-600 seconds).
- Level 1: positive operands, addition with result at most 10; subtraction starting
  at most 10 with a nonnegative result.
- Level 2: addition/subtraction stays inside the inclusive 10-20 interval, e.g.
  `14 + 3`, `18 - 4`, `18 + 2`, `20 - 3`.
- Level 3: single-digit addition crosses 10, or subtraction from 11-19 of a
  single-digit number produces a result below 10, e.g. `8 + 7`, `14 - 6`.
- Addition uses canonical commutative keys. Questions are shuffled with balanced
  addition/subtraction; no immediate repeat. No +0/-0 questions.
- Answer flow is unchanged: reveal, then self-assess correct/wrong. Only correct
  answers count; no points are deducted, and no fixed question-count target applies.
- The game has a 3-second countdown. Level transitions are automatic, without a
  pause; wall-clock deadlines keep running when the tab is hidden. An answer at or
  after a deadline cannot score in either the old or the next level.
- Results stay in browser memory until all three levels finish. Abandoning or
  reloading an unfinished game does not save scores or award anything.
- The server creates a user-owned run with an immutable duration snapshot and
  start time. It rejects early completion, invalid questions/timestamps and
  cross-user submissions. Self-assessment is intentionally trusted, as in existing
  practice; this is not an anti-cheat or competitive scoring system.
- Level records are per user + level + duration. Total records are per user + all
  three durations. Changing duration never overwrites another duration's records.
- A strict improvement over the previous level record awards one unique v2
  Fumfik. A strict total improvement awards one superbox. Initial records are zero;
  ties and zero scores do not earn rewards.
- Finishing is transactional and idempotent: results, records, trophies and the
  superbox are saved together. Repeating the same finish request returns the same
  stored receipt without additional awards.
- Superboxes currently store only owner, source run and acquisition time. There
  is no open/use action. They do not count as Fumfiks in the leaderboard.
- Migration 32 is additive; it does not rewrite old trophies or practice stats.

## Tests

`node --test frontend/tests/timed-arithmetic.test.mjs`

After building the backend jar (Node 24 and Java 21):
`node --test backend/tests/timed-arithmetic.test.mjs`

Backend tests use disposable databases, including a deliberate transaction
failure to verify that no partial rewards remain.
