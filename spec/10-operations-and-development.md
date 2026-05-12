# Operations And Development

## Run Locally

Start development server:

```bash
./gradlew :site:kobwebStart -PkobwebEnv=DEV -PkobwebRunLayout=FULLSTACK
```

Open:

```text
http://localhost:8080
```

Stop server:

```bash
./gradlew :site:kobwebStop
```

## Build

```bash
./gradlew :site:build
```

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

Questions are edited through the app settings UI/API and saved to SQLite.
There is no bundled frontend question fallback and no question JSON file in source control.

## Important Config

Kobweb config:

```text
site/.kobweb/conf.yaml
```

Important fields:
- `server.port`: development port.
- `server.files.dev.contentRoot`: public resources.
- `server.files.dev.script`: dev JS bundle.
- `server.files.dev.api`: JVM API jar.
- `server.files.prod.script`: production JS bundle.

## Source Ownership

Frontend/game UI:

```text
site/src/jsMain/kotlin/com/example/quiz/pages/Index.kt
```

Shared models:

```text
site/src/commonMain/kotlin/com/example/quiz/shared/QuizModels.kt
```

Server API and persistence:

```text
site/src/jvmMain/kotlin/com/example/quiz/api/
```

Static styling and assets:

```text
site/src/jsMain/resources/public/
```

## Deployment Notes

- Current app assumes Kobweb fullstack runtime because questions and stats require JVM API endpoints.
- Static-only export is not sufficient unless server question storage and stats are replaced by another backend.
- Production deploys pull a built Docker image from GHCR; the VPS does not pull source code.

## Maintenance Notes

- Keep runtime question overrides and stats out of git.
- If API model shapes change, update shared models and this specification together.
- If question key generation changes, add a DB migration for existing stats rows.
