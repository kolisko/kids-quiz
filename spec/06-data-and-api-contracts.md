# Data And API Contracts

## Persistence

Production SQLite data remains at:

```text
/opt/kids-quiz/data/kids-quiz.sqlite
```

The redesign keeps existing tables and migrations. The new hexagonal backend wraps the current schema behind repository ports before introducing any future additive schema changes.

Persisted data:
- Tests and multiplication questions.
- Question, spelling, and flipcard stats.
- Global settings.
- Spelling sets and flipcard words/translations.
- Artifact jobs and generated asset status.
- Trophies.

## API Versioning

The redesigned frontend uses `/api/v2/*`. Legacy `/api/*` remains available for transition and for existing generated asset URLs.

All v2 endpoints require authentication unless auth is disabled by configuration, except health and session status.

## Session

`GET /api/v2/session`

```json
{ "authenticated": true }
```

`POST /api/v2/session/login`

```json
{ "password": "secret" }
```

## Settings

`GET /api/v2/settings`

Returns:

```json
{
  "secondsLimit": 30,
  "targetScore": 10,
  "celebrationTapLimit": 100,
  "audioSource": "browser_tts",
  "flipcardSource": "all_words"
}
```

`PUT /api/v2/settings` replaces settings. `secondsLimit` and `targetScore` are clamped to at least `1`; `celebrationTapLimit` is clamped to at least `0`.

## Activities

`GET /api/v2/activities`

Returns multiplication tests plus spelling and flipcard activities for each learning language.

```json
{
  "activities": [
    {
      "id": "multiplication:1",
      "kind": "multiplication",
      "label": "Malá násobilka",
      "language": null,
      "testId": 1,
      "questionCount": 37
    },
    {
      "id": "spelling:en",
      "kind": "spelling",
      "label": "Angličtina spelling",
      "language": "en",
      "testId": null,
      "questionCount": 0
    }
  ],
  "languages": ["en", "de", "es"]
}
```

## Practice

`POST /api/v2/practice/deck`

```json
{
  "activityId": "multiplication:1",
  "mode": "product_to_factors",
  "limit": 10
}
```

Returns a unified deck:

```json
{
  "activity": { "id": "multiplication:1", "kind": "multiplication", "label": "Malá násobilka" },
  "mode": "product_to_factors",
  "settings": { "secondsLimit": 30, "targetScore": 10 },
  "questions": [{ "id": 13, "q": "24", "answers": ["6 * 4", "8 * 3"] }],
  "spellingWords": [],
  "flipcardWords": [],
  "questionStats": { "13": { "correct": 0, "wrong": 2, "timeout": 1 } },
  "wordStats": {}
}
```

`POST /api/v2/practice/answers`

```json
{
  "activityId": "multiplication:1",
  "itemId": "13",
  "result": "timeout",
  "direction": "product_to_factors"
}
```

`result` is `correct`, `wrong`, or `timeout`.

## Content

- `GET /api/v2/content/spelling/sets?language=en`
- `PUT /api/v2/content/spelling/sets?language=en`
- `GET /api/v2/content/flipcards/words?language=en`
- `PUT /api/v2/content/flipcards/words?language=en`

Request and response bodies keep the existing spelling and flipcard shapes.

## Assets

- `GET /api/v2/assets/flipcards?language=en`
- `POST /api/v2/assets/flipcards/images/missing?language=en`
- `POST /api/v2/assets/flipcards/audio/missing?language=en`
- `GET /api/v2/assets/images/{word}`
- `POST /api/v2/assets/images/{word}?force=true`
- `GET /api/v2/assets/audio/{word}?language=en&kind=word`
- `POST /api/v2/assets/audio/{word}?language=en&kind=word&force=true&forFlipcard=true`
- `GET /api/v2/assets/translations?language=de`
- `POST /api/v2/assets/translations?language=de`

## Trophies

- `GET /api/v2/trophies`
- `POST /api/v2/trophies`

Award request:

```json
{ "animalKey": "animal-01" }
```
