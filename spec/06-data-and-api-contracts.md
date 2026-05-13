# Data And API Contracts

## Question JSON

Location:
- SQLite tables `tests`, `questions`, and `question_stats` in the configured runtime DB.
- Production DB path: `/opt/kids-quiz/data/kids-quiz.sqlite`.

Schema:

```json
[
  {
    "q": "Question text",
    "a": "Answer text"
  }
]
```

Validation:
- Root must be an array.
- `q` must be a non-blank string.
- `a` must be a non-blank string.

## Settings Storage

Browser `localStorage` keys:

| Key | Type | Default |
| --- | --- | --- |
| `kids-quiz.seconds-limit` | integer string | `10` |
| `kids-quiz.target-score` | integer string | `10` |

Questions are intentionally not stored in browser `localStorage`.

## Tests

Shape:

```json
{
  "id": 1,
  "name": "Malá násobilka",
  "questionCount": 37
}
```

Rules:
- Test names are stored in SQLite.
- The start screen renders buttons from `GET /api/tests`.
- Questions and stats are scoped by test id.

## Question Key

Stats are keyed by normalized question and answer:

```text
{q.trim()}
---answer---
{a.trim()}
```

This means changing either question text or answer text creates a new stats identity.

## Question Stats

Shape:

```json
{
  "correct": 0,
  "wrong": 0,
  "timeout": 0
}
```

Meaning:
- `correct`: user clicked `Next` after showing answer before timeout.
- `wrong`: user clicked `Wrong`.
- `timeout`: timer expired before `Show answer`.

## GET /api/tests

Returns playable tests ordered by `sort_order`.

## GET /api/tests/{testId}/stats

Returns aggregate stats for one test.

Response:

```json
{
  "statsByKey": {
    "2 + 2?\n---answer---\n4": {
      "correct": 0,
      "wrong": 2,
      "timeout": 1
    }
  }
}
```

Failure behavior:
- If no stats rows exist, response is an empty map.

## GET /api/tests/{testId}/questions

Returns question JSON for one test as a JSON array.

Response:

```json
[
  {
    "q": "2 + 2?",
    "a": "4"
  }
]
```

Rules:
- Return questions from the SQLite DB ordered by `sort_order`.
- If no DB questions exist, return `[]`.

## POST /api/tests/{testId}/questions

Saves question JSON for one test on the server.

Request:

```json
[
  {
    "q": "2 + 2?",
    "a": "4"
  }
]
```

Rules:
- Accept a JSON array with `q` and `a` question items.
- Accept `[]` as a valid empty question set.
- Replace that test's DB question rows with the submitted items.

Failure behavior:
- Invalid question JSON returns HTTP 400 and does not replace the previous DB rows.

## POST /api/tests/{testId}/stats/answer

Records one answer result for one test.

Request:

```json
{
  "q": "2 + 2?",
  "a": "4",
  "correct": false,
  "timedOut": false
}
```

Rules:
- If `correct` is `true`, increment `correct`.
- Else if `timedOut` is `true`, increment `timeout`.
- Else increment `wrong`.

Response:

```json
{
  "key": "2 + 2?\n---answer---\n4",
  "stats": {
    "correct": 0,
    "wrong": 1,
    "timeout": 0
  }
}
```

Failure behavior:
- Invalid JSON-like body or missing required fields returns HTTP 400.

## Server Persistence

All production question and stats data is stored in SQLite:

```text
/opt/kids-quiz/data/kids-quiz.sqlite
```

Legacy `.quiz-questions.json` and `.quiz-stats.tsv` files are imported once by DB migration and then archived under the runtime backup directory.
