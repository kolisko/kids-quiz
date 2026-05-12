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

Server question override is stored in:

```text
site/.quiz-questions.json
```

Server stats are stored in:

```text
site/.quiz-stats.tsv
```

These files are intentionally gitignored. Deleting `site/.quiz-questions.json` returns the app to the bundled default question file. Deleting `site/.quiz-stats.tsv` resets long-term question difficulty history.

## Editing Questions

Default questions:

```text
site/src/jsMain/resources/public/data/questions.json
```

The current default is `[]`. Users can provide questions in the app settings instead.
Saved questions are written to the server override file, not to browser `localStorage`.

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
- For multi-device use on a local network, run the Kobweb server on a reachable host and open the host URL from client devices.

## Maintenance Notes

- Keep runtime question overrides and stats out of git.
- If API model shapes change, update shared models and this specification together.
- If question key generation changes, consider migration for existing stats files.
- If stats need stronger consistency or multiple server processes, replace TSV file with a database.
