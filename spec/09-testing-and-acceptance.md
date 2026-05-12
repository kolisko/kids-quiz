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

Read stats:

```bash
curl -s http://127.0.0.1:8080/api/stats
```

Read questions:

```bash
curl -s http://127.0.0.1:8080/api/questions
```

Save questions:

```bash
curl -s -X POST http://127.0.0.1:8080/api/questions \
  -H 'Content-Type: application/json' \
  --data '[{"q":"2 + 2?","a":"4"}]'
```

Record answer:

```bash
curl -s -X POST http://127.0.0.1:8080/api/stats/answer \
  -H 'Content-Type: application/json' \
  --data '{"q":"2 + 2?","a":"4","correct":false,"timedOut":false}'
```

Acceptance:
- `GET /api/questions` returns valid question JSON from SQLite.
- `POST /api/questions` persists a valid question set in SQLite.
- `GET /api/stats` returns valid JSON.
- `POST /api/stats/answer` increments the expected counter.
- After stopping and restarting the server, stats remain available.

## Manual UI Scenarios

### Settings Validation

- Open app with empty server questions.
- Confirm settings screen appears.
- Paste invalid JSON.
- Confirm validation error appears.
- Paste valid JSON.
- Confirm game starts.
- Refresh the browser and confirm the same questions load from the server.

### Correct Answer

- Click `Odpoved`.
- Click `Dalsi`.
- Confirm score increments.
- Confirm server records `correct`.

### Wrong Answer

- Click `Odpoved`.
- Click `Spatne`.
- Confirm score decrements.
- Confirm server records `wrong`.

### Timeout

- Set seconds to `1`.
- Wait for timeout.
- Confirm score decrements once.
- Confirm answer is shown with timeout note.
- Confirm only `Dalsi` is available.
- Confirm server records `timeout`.

### Finish Game

- Set target score to `1`.
- Answer one question correctly.
- Confirm celebration screen appears with animal asset.

## Regression Checklist

- `Restart` resets score but does not clear server stats.
- `Settings` can be opened from all screens.
- Custom JSON survives refresh through server SQLite, not browser `localStorage`.
- Server DB files are ignored by git.
- No generated build artifacts appear in `git status`.
