# Architecture

## Technology Stack

- Angular frontend built with npm and served as static files.
- Kotlin/JVM backend built with Gradle.
- Ktor HTTP server for API routes and static SPA fallback.
- Kotlin serialization for backend request/response models.
- SQLite persistence for server-side questions and stats.
- Docker image containing only the backend jar, Angular static files, and runtime entrypoint.

## Module Layout

```text
frontend/
  src/app/
    app.component.ts
    app.component.html
  src/assets/animals/*.svg
  src/styles.css

backend/
  src/main/kotlin/com/example/quiz/
    Application.kt
    Auth.kt
    Database.kt
    Models.kt
    RuntimePaths.kt
    Stores.kt
    Migrate.kt

deploy/
  Dockerfile.runtime
  docker-compose.yml
  docker-entrypoint.sh
```

## Runtime Components

Frontend:
- Loads questions and settings.
- Displays game UI.
- Maintains current game score and current round state.
- Calls backend APIs to load/save questions and to load/update long-term stats.
- Stores only user settings in `localStorage`.

Backend:
- Serves `/api` endpoints.
- Serves Angular static files and returns `index.html` for SPA routes.
- Loads and writes active questions through SQLite.
- Loads and writes long-term answer stats through SQLite.
- Runs idempotent DB migrations before serving production traffic.

Static resources:
- Angular output is staged under `/app/public` in the Docker image.
- Animal SVGs are served under `/assets/animals/`.

## Data Flow

Startup:
1. Browser opens `/`.
2. Frontend checks `/api/auth/status`.
3. Frontend requests `/api/questions`.
4. Frontend requests `/api/stats`.
5. Frontend validates server questions and enters game or settings.

Answer result:
1. User answers correctly, wrongly, or times out.
2. Frontend updates score immediately.
3. Frontend sends `POST /api/stats/answer`.
4. Backend updates SQLite stats.
5. Frontend merges returned question stats into local `serverStats`.

Question selection:
1. Frontend calculates weights from `serverStats` and session mistakes.
2. Frontend randomly picks from weighted question indices.

## State Ownership

Client-owned:
- Current screen.
- Current score.
- Current question index.
- Timer state.
- Settings form state.

Server-owned:
- Active question set.
- Aggregated question performance history.
- Authentication cookie/session state.

Shared contract:
- Question shape.
- Stats shape.
- API request/response shape.
- Question key generation.
