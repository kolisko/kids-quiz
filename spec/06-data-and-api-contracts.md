# Data And API Contracts

## Question JSON

Location:
- Default file: `/data/questions.json`
- Server override file: `site/.quiz-questions.json`

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

## GET /api/stats

Returns aggregate stats.

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
- If no stats file exists, response is an empty map.
- If stats file contains invalid rows, invalid rows are ignored.

## GET /api/questions

Returns the active question JSON as a JSON array.

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
- If `site/.quiz-questions.json` exists, return it.
- Otherwise return bundled `/data/questions.json`.
- If neither source exists, return `[]`.

## POST /api/questions

Saves the active question JSON on the server.

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
- Persist the body to `site/.quiz-questions.json`.

Failure behavior:
- Invalid question JSON returns HTTP 400 and does not replace the previous server file.

## POST /api/stats/answer

Records one answer result.

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

## Server Persistence Files

Question override:

```text
site/.quiz-questions.json
```

Stats:

```text
site/.quiz-stats.tsv
```

Format:

```text
base64url(questionKey)\tcorrect\twrong\ttimeout
```

Both files are ignored by git because they are runtime data.
