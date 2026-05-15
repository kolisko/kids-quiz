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
- `spelling_sets`: user-maintained spelling word lists.
- `spelling_words`: normalized words parsed from each spelling set.
- `spelling_word_stats`: aggregate spelling counters by normalized word.

Questions are not edited or stored through a raw JSON textarea. JSON remains the HTTP transport format only.

## Settings Storage

Browser `localStorage` keys:

| Key | Type | Default |
| --- | --- | --- |
| `kids-quiz.seconds-limit` | integer string | `10` |
| `kids-quiz.target-score` | integer string | `10` |

Questions are intentionally not stored in browser `localStorage`.
Spelling sets are stored in SQLite through the authenticated API.

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

Returns spelling lists ordered by `sort_order`.

```json
[
  {
    "id": 1,
    "rawWords": "cat, dog",
    "words": [
      { "id": 1, "text": "cat", "normalized": "cat" },
      { "id": 2, "text": "dog", "normalized": "dog" }
    ]
  }
]
```

## PUT /api/spelling/sets

Replaces all spelling lists. Empty strings and empty comma entries are ignored.

```json
{
  "sets": ["cat, dog", "red, blue"]
}
```

## GET /api/spelling/session

Returns one random non-empty spelling set with words in saved order. Returns `404` with `no_spelling_sets` when none exist.

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
