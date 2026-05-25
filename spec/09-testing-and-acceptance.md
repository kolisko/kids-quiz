# Testing And Acceptance

## Build Verification

Command:

```bash
./gradlew stageDockerImageContext --no-daemon
```

Acceptance:
- Build exits successfully.
- Angular frontend compiles.
- Kotlin/Ktor backend compiles.
- Docker image context contains `app.jar`, `public/`, `Dockerfile`, and `docker-entrypoint.sh`.

Known warnings:
- Local odd-numbered Node versions may warn during Angular builds. CI pins Node 24.

## Docker Verification

Command:

```bash
./gradlew buildDockerImage --no-daemon
docker run --rm -p 8080:8080 -v "$PWD/.local-data:/data" kids-quiz:latest
```

Acceptance:
- `GET /api/health` returns success.
- `/` returns the Angular app.
- Restarting/recreating the container keeps SQLite data in the mounted volume.

## API Verification

Authenticate first when auth is enabled, then read activities:

```bash
curl -s http://127.0.0.1:8080/api/v2/activities
```

Start a practice deck:

```bash
curl -s -X POST http://127.0.0.1:8080/api/v2/practice/deck \
  -H 'Content-Type: application/json' \
  --data '{"activityId":"multiplication:1","mode":"product_to_factors"}'
```

Record answer:

```bash
curl -s -X POST http://127.0.0.1:8080/api/v2/practice/answers \
  -H 'Content-Type: application/json' \
  --data '{"activityId":"multiplication:1","itemId":"13","result":"wrong","direction":"product_to_factors"}'
```

Run backend module tests:

```bash
./gradlew :backend:test
```

Acceptance:
- `GET /api/v2/activities` returns playable activities.
- `POST /api/v2/practice/deck` returns questions or words plus settings and stats.
- `POST /api/v2/practice/answers` increments the expected counter.
- Domain and application use-case tests pass without server, SQLite, or browser dependencies.
- After stopping and restarting the server, stats remain available.

## Manual UI Scenarios

### Settings

- Open settings during play.
- Confirm the timer stops and settings can be saved without starting a game.
- Return to test selection.

### Correct Answer

- Click `Ukázat odpověď`.
- Click `Správně`.
- Confirm score increments.
- Confirm server records `correct`.

### Wrong Answer

- Click `Ukázat odpověď`.
- Click `Špatně`.
- Confirm score decrements.
- Confirm server records `wrong`.

### Timeout

- Set seconds to `1`.
- Wait for timeout.
- Confirm score decrements once.
- Confirm answer is shown with timeout note.
- Confirm only `Další` is available.
- Confirm server records `timeout`.

### Finish Game

- Set target score to `1`.
- Answer one question correctly.
- Confirm celebration screen appears with animal asset.

## Regression Checklist

- Secondary icon actions do not start a timer.
- Multi-answer questions show answer count hint.
- Questions and answers load from SQLite, not browser `localStorage`.
- Server DB files are ignored by git.
- No generated build artifacts appear in `git status`.
