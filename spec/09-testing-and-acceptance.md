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

Authenticate first when auth is enabled, then read test-scoped data:

```bash
curl -s http://127.0.0.1:8080/api/tests
```

Read questions:

```bash
curl -s http://127.0.0.1:8080/api/tests/1/questions
```

Read stats:

```bash
curl -s http://127.0.0.1:8080/api/tests/1/stats
```

Record answer:

```bash
curl -s -X POST http://127.0.0.1:8080/api/tests/1/stats/answer \
  -H 'Content-Type: application/json' \
  --data '{"questionId":13,"correct":false,"timedOut":false}'
```

Acceptance:
- `GET /api/tests/{testId}/questions` returns questions with `answers`.
- `GET /api/tests/{testId}/stats` returns valid JSON keyed by question id.
- `POST /api/tests/{testId}/stats/answer` increments the expected counter.
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
