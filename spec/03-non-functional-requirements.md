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

- Initial local development load should be acceptable for a Kotlin/JS app.
- Random question selection should be instantaneous for typical question sets.
- Server stat reads and writes should be lightweight file operations.

## Reliability

- Invalid or missing server stats file must not prevent app startup.
- Invalid question JSON must not crash the app.
- Server stat updates must be synchronized within the JVM process to avoid corrupting the stats map.
- If stat API calls fail, gameplay should continue with local/session weights.

## Privacy

- No accounts or personal data are required.
- Question text and answer text are stored locally by the app and in server-side aggregate stats keys.
- Server stats file should be treated as local application data.

## Portability

- The app targets local Kobweb fullstack execution.
- Static assets must be served locally, without internet dependency.
- The project should build through the checked-in Gradle wrapper.

## Maintainability

- Shared API models should live in common Kotlin source where possible.
- Server-only persistence logic should remain isolated in `jvmMain`.
- UI/game state should remain isolated in the page implementation unless it grows enough to split.
