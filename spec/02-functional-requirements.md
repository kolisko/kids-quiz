# Functional Requirements

## Question Data

- The app shall load question data from SQLite.
- Each question shall contain `q` and an ordered `answers` list.
- Multiple correct answers shall be stored as multiple DB answer rows.
- Browser `localStorage` shall not be used as a source of question data.
- The frontend shall not fall back to a bundled question file.
- The frontend shall not expose a raw question JSON editor.

## Game Settings

- The app shall allow configuring the question time limit in seconds.
- The default time limit shall be 30 seconds.
- The app shall allow configuring target score.
- The default target score shall be 10 points.
- Settings shall be persisted globally in SQLite.
- Settings values shall be coerced to at least `1`.

## Game Round

- The app shall open on a test selection screen when playable questions exist.
- The initial test selection screen shall show one large button per test.
- The app shall not select a question or start the countdown until the user starts a test.
- The app shall display one randomly selected question fullscreen.
- The top area shall show score and countdown.
- The question screen shall show a `Ukázat odpověď` button.
- Questions with multiple answers shall show a small answer count hint.
- Pressing `Ukázat odpověď` before timeout shall reveal the answer and show `Špatně` and `Správně`.
- Pressing `Špatně` shall subtract 1 point and record the answer as wrong.
- Pressing `Správně` after seeing the answer shall add 1 point and record the answer as correct.
- If timeout occurs before `Ukázat odpověď`, the app shall subtract 1 point, record a timeout, reveal the answer, and show only `Další`.
- Timeout shall not allow a second `Wrong` penalty for the same question.

## Scoring

- Correct answer: `+1`.
- Wrong answer: `-1`.
- Timeout: `-1`.
- Current game score shall reset when returning to test selection or starting a selected test.
- Secondary actions shall not immediately start a timer.
- Server question statistics shall not be reset by returning to test selection.

## Adaptive Repetition

- The app shall use server-side question stats to prefer historically difficult questions.
- The app shall also use current-session mistakes to prefer recently missed questions.
- Correct answers may reduce only current-session difficulty weight; they shall not erase server history.

## End Of Game

- When score reaches target score, the app shall display a celebration screen.
- The celebration shall include a random animal image, a large `Gratulace!` heading, and CSS animation.
- The celebration shall not show animal names or per-animal message text.
- There shall be at least 40 predefined animal surprises.
- The end screen shall show a single prominent `Vybrat test` action.

## Server Stats

- The server shall expose a test-scoped endpoint to read questions from SQLite.
- The server shall expose an endpoint to read aggregate question stats.
- The server shall expose an endpoint to record answer results.
- The server shall persist stats across server restarts.
- Stats shall include counts of correct, wrong, and timeout results per question id.
