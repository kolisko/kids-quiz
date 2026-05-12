# Architecture

## Technology Stack

- Kotlin Multiplatform with JS and JVM targets.
- Kobweb application plugin for frontend routing and fullstack API.
- Compose HTML for UI rendering.
- Kotlin serialization on the frontend/common model layer.
- Kobweb API routes on the JVM backend.
- SQLite persistence for server-side questions and stats.

## Module Layout

```text
site/
  src/commonMain/kotlin/com/example/quiz/shared/
    QuizModels.kt
  src/jsMain/kotlin/com/example/quiz/pages/
    Index.kt
  src/jvmMain/kotlin/com/example/quiz/api/
    Questions.kt
    QuestionsStore.kt
    Stats.kt
    StatsStore.kt
    JsonSupport.kt
    stats/Answer.kt
  src/jsMain/resources/public/
    styles.css
    assets/animals/*.svg
```

## Runtime Components

Frontend:
- Loads questions and settings.
- Displays game UI.
- Maintains current game score and current round state.
- Calls backend APIs to load/save questions and to load/update long-term stats.
- Stores user settings in `localStorage`.

Backend:
- Serves Kobweb API endpoints.
- Loads and writes active question JSON through SQLite.
- Loads and writes long-term answer stats through SQLite.
- Runs idempotent DB migrations before serving production traffic.

Static resources:
- Stylesheet at `/styles.css`.
- Animal SVGs under `/assets/animals/`.

## Data Flow

Startup:
1. Browser opens `/`.
2. Frontend requests `/api/questions`.
3. Frontend requests `/api/stats`.
4. Frontend validates questions and enters game or settings.

Answer result:
1. User answers correctly, wrongly, or times out.
2. Frontend updates score immediately.
3. Frontend sends `POST /api/stats/answer`.
4. Backend updates in-memory stats and writes file.
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
- Active custom question JSON.
- Aggregated question performance history.

Shared model:
- Question shape.
- Stats shape.
- API request/response shape.
- Question key generation.
