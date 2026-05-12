# Functional Requirements

## Question Data

- The app shall accept question data as JSON array.
- Each item shall contain string attributes `q` and `a`.
- Blank `q` or `a` values shall be rejected with a visible validation error.
- Unknown JSON fields may be ignored.
- Users shall be able to paste custom question JSON in settings.
- Custom question JSON shall be persisted on the server in SQLite.
- Browser `localStorage` shall not be used as a source of question data.
- The frontend shall not fall back to a bundled question file.

## Game Settings

- The app shall allow configuring the question time limit in seconds.
- The default time limit shall be 10 seconds.
- The app shall allow configuring target score.
- The default target score shall be 10 points.
- Settings shall be persisted in browser `localStorage`.
- Settings values shall be coerced to at least `1`.

## Game Round

- The app shall open on a test selection screen when playable questions exist.
- The initial test selection screen shall show a start button.
- The app shall not select a question or start the countdown until the user starts a test.
- The app shall display one randomly selected question fullscreen.
- The top area shall show score and countdown.
- The question screen shall show a `Show answer` button.
- Pressing `Show answer` before timeout shall reveal the answer and show `Wrong` and `Next`.
- Pressing `Wrong` shall subtract 1 point and record the answer as wrong.
- Pressing `Next` after seeing the answer shall add 1 point and record the answer as correct.
- If timeout occurs before `Show answer`, the app shall subtract 1 point, record a timeout, reveal the answer, and show only `Next`.
- Timeout shall not allow a second `Wrong` penalty for the same question.

## Scoring

- Correct answer: `+1`.
- Wrong answer: `-1`.
- Timeout: `-1`.
- Current game score shall be reset by `Restart`, starting a selected test, or starting a new game from settings.
- Server question statistics shall not be reset by `Restart`.

## Adaptive Repetition

- The app shall use server-side question stats to prefer historically difficult questions.
- The app shall also use current-session mistakes to prefer recently missed questions.
- Correct answers may reduce only current-session difficulty weight; they shall not erase server history.

## End Of Game

- When score reaches target score, the app shall display a celebration screen.
- The celebration shall include a random animal image, a large `Gratulace!` heading, and CSS animation.
- The celebration shall not show animal names or per-animal message text.
- There shall be at least 40 predefined animal surprises.
- The end screen shall show a single prominent `Play again` action.

## Server Stats

- The server shall expose an endpoint to read the active question JSON.
- The server shall expose an endpoint to save the active question JSON.
- The server shall expose an endpoint to read aggregate question stats.
- The server shall expose an endpoint to record answer results.
- The server shall persist stats across server restarts.
- Stats shall include counts of correct, wrong, and timeout results per question key.
