# Non-Functional Requirements

## Usability

- Primary gameplay controls must be large enough for children.
- Question and answer text must be centered and readable.
- Settings must remain simple and avoid hidden flows.
- Error messages for invalid JSON must be understandable.

## Responsiveness

- The app must fit common desktop and mobile viewport sizes.
- Top controls must not overlap question text in normal use.
- Long question or answer text must wrap safely.

## Performance

- Initial load should stay small because the frontend is a static Angular bundle.
- Random question selection should be instantaneous for typical question sets.
- Server stat reads and writes should be lightweight SQLite operations.

## Reliability

- Invalid or missing server DB must be handled by idempotent migrations.
- Invalid question JSON must not crash the app.
- Server stat updates must be synchronized within the JVM process and committed to SQLite.
- If stat API calls fail, gameplay should continue with local/session weights.

## Privacy

- No accounts or personal data are required.
- Question text and answer text are stored in the server-side SQLite DB.
- The SQLite DB should be treated as local application data.

## Portability

- The app targets local Docker execution with the same image layout as production.
- Static assets must be served locally, without internet dependency.
- The project should build through the checked-in Gradle wrapper.

## Maintainability

- Backend API models should stay in Kotlin source and frontend API interfaces should mirror them.
- Server-only persistence logic should remain isolated in the backend module.
- UI/game state should remain isolated in the Angular app component until it grows enough to split.
