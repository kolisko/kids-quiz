# Operations And Development

## Build Locally

Build the same image context used by CI:

```bash
./gradlew stageDockerImageContext --no-daemon
```

This runs:
- `npm ci` in `frontend/`
- Angular production build
- Kotlin backend jar build
- Docker runtime context staging under `build/deploy/image-context`

## Run Locally

The production-like path is Docker:

```bash
./gradlew buildDockerImage --no-daemon
docker run --rm -p 8080:8080 -v "$PWD/.local-data:/data" kids-quiz:latest
```

Open:

```text
http://localhost:8080
```

For separate frontend/backend development, run the Angular dev server from `frontend/` and the Ktor backend from Gradle, using the same API contracts.

## Runtime Data

Server runtime data is stored in SQLite:

```text
/opt/kids-quiz/data/kids-quiz.sqlite
```

Local development can override this path with:

```text
KIDS_QUIZ_DATA_DIR=/path/to/data
KIDS_QUIZ_DB_PATH=/path/to/kids-quiz.sqlite
```

SQLite files are intentionally gitignored.

## Editing Questions

Questions are stored in SQLite. There is no app settings JSON editor, bundled frontend question fallback, or question JSON file in source control.

## Source Ownership

Frontend/game UI:

```text
frontend/src/app/
```

Server API and persistence:

```text
backend/src/main/kotlin/com/example/quiz/
```

Static styling and assets:

```text
frontend/src/styles.css
frontend/src/assets/
```

Deploy files:

```text
deploy/
.github/workflows/deploy.yml
```

## Deployment Notes

- Production deploys pull a built Docker image from GHCR.
- The VPS does not pull source code.
- The container mounts `/opt/kids-quiz/data:/data`.
- Migrations run with `docker compose run --rm app migrate` before the app is recreated.

## Maintenance Notes

- Keep runtime question data and stats out of git.
- If API model shapes change, update frontend interfaces, backend models, and this specification together.
- If question key generation changes, add a DB migration for existing stats rows.
