# Architecture

## Technology Stack

- Angular standalone frontend with Angular Router.
- Kotlin/JVM backend built with Gradle submodules.
- Ktor HTTP server for API routes and static SPA fallback.
- SQLite persistence for production data.
- Docker image containing the server fat jar, Angular static files, and runtime entrypoint.

## Backend Hexagon

```text
backend/
  domain/        Pure domain models and rules.
  application/   Use cases and ports.
  adapters/      SQLite, runtime paths, artifact jobs, filesystem/OpenAI integrations.
  server/        Ktor composition root, auth, HTTP routes, static serving.
```

Dependency direction:

```text
server -> adapters -> application -> domain
server -> application -> domain
adapters -> domain
```

The server module is the only executable module. It wires `SqliteKidsQuizAdapter` into application use cases and exposes `/api/v2/*`.

## Frontend Layout

```text
frontend/src/app/
  domain/          TypeScript domain types and pure practice rules.
  application/     Practice facade and timer orchestration.
  infrastructure/  HTTP client, browser audio, local preferences.
  features/        Login, home, mode picker, practice, settings, assets, trophies, celebration.
  app.routes.ts    Router flow.
```

The primary flow is:

```text
login -> home/activity picker -> mode picker -> practice -> celebration
```

Settings, asset library, and trophies are first-class routes from the shell navigation.

## Runtime Components

Frontend:
- Calls `/api/v2/session` before entering the app.
- Loads activities from `/api/v2/activities`.
- Uses `/api/v2/practice/deck` to start a practice session.
- Records answers through `/api/v2/practice/answers`.
- Keeps current score, timer, revealed-answer state, and current-session adaptive weights locally.

Backend:
- Runs migrations before serving traffic.
- Serves `/api/v2` use-case endpoints.
- Keeps legacy `/api` endpoints available during transition for static asset URLs returned by existing artifact services.
- Serves Angular static files and returns `index.html` for SPA routes.
- Injects route-specific bootstrap data into `index.html` from the same v2 application use cases, so direct route loads render from server-owned data before any client-side API call.

Server-owned:
- SQLite data, global settings, long-term stats, auth cookie/session, artifact jobs, generated asset cache metadata, trophies.

Client-owned:
- Current route, selected mode, current round, timer state, current game score, current-session adaptive weights.
