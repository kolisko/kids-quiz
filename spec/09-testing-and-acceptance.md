# Testing And Acceptance

## Build Verification

Command:

```bash
./gradlew :site:build
```

Acceptance:
- Build exits successfully.
- Kotlin/JS and Kotlin/JVM targets compile.
- Kobweb backend API jar is produced.

Known warnings:
- Webpack bundle size warnings are acceptable for this app.
- Gradle/Kotlin may warn that JDK 26 falls back to JVM target 25.

## API Verification

Start server:

```bash
./gradlew :site:kobwebStart -PkobwebEnv=DEV -PkobwebRunLayout=FULLSTACK
```

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
- `GET /api/questions` returns valid question JSON from the server.
- `POST /api/questions` persists a valid question set on the server.
- `GET /api/stats` returns valid JSON.
- `POST /api/stats/answer` increments the expected counter.
- After stopping and restarting the server, stats remain available.

## Manual UI Scenarios

### Settings Validation

- Open app with empty default questions.
- Confirm settings screen appears.
- Paste invalid JSON.
- Confirm validation error appears.
- Paste valid JSON.
- Confirm game starts.
- Refresh the browser and confirm the same questions load from the server.

### Correct Answer

- Click `Show answer`.
- Click `Next`.
- Confirm score increments.
- Confirm server records `correct`.

### Wrong Answer

- Click `Show answer`.
- Click `Wrong`.
- Confirm score decrements.
- Confirm server records `wrong`.

### Timeout

- Set seconds to `1`.
- Wait for timeout.
- Confirm score decrements once.
- Confirm answer is shown with timeout note.
- Confirm only `Next` is available.
- Confirm server records `timeout`.

### Finish Game

- Set target score to `1`.
- Answer one question correctly.
- Confirm celebration screen appears with animal asset.

## Regression Checklist

- `Restart` resets score but does not clear server stats.
- `Settings` can be opened from all screens.
- Custom JSON survives refresh through server storage, not browser `localStorage`.
- Server question and stats files are ignored by git.
- No generated build artifacts appear in `git status`.
