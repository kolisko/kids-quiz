# Data And API Contracts

## SQLite Storage

Production DB path:

```text
/opt/kids-quiz/data/kids-quiz.sqlite
```

Tables:
- `tests`: playable test names and ordering.
- `questions`: one row per question, unique by `test_id + q`.
- `question_answers`: ordered answer list for each question.
- `question_stats`: aggregate performance counters by `question_id + direction`.
- `app_settings`: one global settings row for timer and target score.
- `spelling_sets`: user-maintained spelling word lists.
- `spelling_words`: normalized words parsed from each spelling set.
- `spelling_word_stats`: aggregate spelling counters by normalized word.

Questions are not edited or stored through a raw JSON textarea. JSON remains the HTTP transport format only.

## Settings Storage

Settings are stored globally in SQLite and are shared by every browser.

Defaults:

| Field | Type | Default |
| --- | --- | --- |
| `secondsLimit` | integer | `30` |
| `targetScore` | integer | `10` |

No application settings are stored in browser `localStorage`.
Spelling sets are also stored in SQLite through the authenticated API.

## GET /api/settings

Returns global game settings.

```json
{
  "secondsLimit": 30,
  "targetScore": 10
}
```

## PUT /api/settings

Replaces global game settings. Values below `1` are clamped to `1`.

```json
{
  "secondsLimit": 30,
  "targetScore": 10
}
```

## GET /api/tests

Returns playable tests ordered by `sort_order`.

```json
{
  "id": 1,
  "name": "Malá násobilka",
  "type": "multiplication",
  "questionCount": 37
}
```

`type` is either `multiplication` or `english`.

## GET /api/tests/{testId}/questions

Returns questions from SQLite ordered by `sort_order`.

```json
[
  {
    "id": 13,
    "q": "24",
    "answers": ["6 * 4", "8 * 3"]
  }
]
```

## GET /api/tests/{testId}/stats

Returns aggregate stats for one test keyed by question id.

Optional query parameters:
- `direction`: `product_to_factors` or `factors_to_product`; defaults to `product_to_factors`.

```json
{
  "statsByQuestionId": {
    "13": {
      "correct": 0,
      "wrong": 2,
      "timeout": 1
    }
  }
}
```

## POST /api/tests/{testId}/stats/answer

Records one answer result for one question.

```json
{
  "questionId": 13,
  "correct": false,
  "timedOut": false,
  "direction": "factors_to_product"
}
```

## GET /api/spelling/sets

Returns spelling lists ordered by `sort_order`. Exactly one non-empty configured list can be marked as the latest list.

```json
[
  {
    "id": 1,
    "rawWords": "cat, dog",
    "isLatest": true,
    "words": [
      { "id": 1, "text": "cat", "normalized": "cat" },
      { "id": 2, "text": "dog", "normalized": "dog" }
    ]
  }
]
```

## PUT /api/spelling/sets

Replaces all spelling lists. Empty strings and empty comma entries are ignored. `latestSetIndex` points to the selected item in the submitted `sets` array; when it is missing or points at an empty list, the last non-empty list is used.

```json
{
  "sets": ["cat, dog", "red, blue"],
  "latestSetIndex": 1
}
```

## GET /api/spelling/session

Returns a non-empty spelling set with words in saved order. Without `mode`, this behaves as `mode=latest`.

- `mode=latest` returns the latest spelling set.
- `mode=older` returns one random non-latest spelling set.
- Returns `404` with `no_spelling_sets` when the latest mode has no words.
- Returns `404` with `no_older_spelling_sets` when older mode has no older words.

```json
{
  "setId": 1,
  "words": [
    { "id": 1, "text": "cat", "normalized": "cat" }
  ]
}
```

## GET /api/spelling/stats

Returns aggregate spelling stats keyed by normalized word.

```json
{
  "statsByWord": {
    "cat": {
      "correct": 1,
      "wrong": 0,
      "timeout": 0
    }
  }
}
```

## POST /api/spelling/stats/answer

Records one spelling answer result.

```json
{
  "word": "cat",
  "correct": true,
  "timedOut": false
}
```

Response:

```json
{
  "questionId": 13,
  "stats": {
    "correct": 0,
    "wrong": 1,
    "timeout": 0
  }
}
```

Rules:
- If `correct` is `true`, increment `correct`.
- Else if `timedOut` is `true`, increment `timeout`.
- Else increment `wrong`.
- Invalid JSON-like body or missing required fields returns HTTP 400.

## Server Persistence

All production question and stats data is stored in SQLite and survives container restart/recreate.
