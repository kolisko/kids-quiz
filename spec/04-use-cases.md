# Use Cases

## UC-01 Start With No Questions

Actor: User

Preconditions:
- No custom questions exist in server question storage.
- `/data/questions.json` is `[]`.

Main flow:
1. User opens the app.
2. App loads settings and asks the server for the active questions.
3. App finds no playable questions.
4. App shows settings screen.

Expected result:
- User sees empty question JSON and can paste questions.

## UC-02 Start Existing Test

Actor: Child

Preconditions:
- Server question storage contains playable questions.

Main flow:
1. User opens the app.
2. App loads settings and questions.
3. App shows the test selection screen.
4. User clicks `Mala nasobilka`.

Expected result:
- The first question appears.
- Countdown starts only after the click.

## UC-03 Paste And Save Questions

Actor: Parent or teacher

Preconditions:
- User is on settings screen.

Main flow:
1. User pastes JSON array with `q` and `a`.
2. User changes seconds or target score if desired.
3. User clicks `Save and play`.
4. App validates JSON and starts a new game.

Expected result:
- Custom questions are saved on the server.
- Settings are saved in browser storage.

Failure flow:
- If JSON is invalid or contains blank `q`/`a`, app stays on settings and shows an error.

## UC-04 Answer Correctly

Actor: Child

Preconditions:
- A question is visible.
- Timer has not expired.

Main flow:
1. Child thinks of an answer.
2. Child clicks `Show answer`.
3. App reveals the answer.
4. Child/parent clicks `Next`.

Expected result:
- Score increases by 1.
- Server records one correct result for the question.
- Next question appears unless target score is reached.

## UC-05 Mark Wrong

Actor: Child or parent

Preconditions:
- Answer is visible because `Show answer` was clicked before timeout.

Main flow:
1. User clicks `Wrong`.
2. App subtracts 1 point.
3. App records wrong result on the server.
4. App shows another question.

Expected result:
- The question becomes more likely to appear in later selections.

## UC-06 Timeout

Actor: Child

Preconditions:
- A question is visible.
- User does not click `Show answer` before timer reaches zero.

Main flow:
1. Timer reaches zero.
2. App subtracts 1 point.
3. App records timeout result on the server.
4. App reveals the answer and shows `Next`.
5. User clicks `Next`.

Expected result:
- Only one penalty is applied.
- The question becomes more likely to appear later.

## UC-07 Finish Game

Actor: Child

Preconditions:
- Score is one point below target score.
- Answer is visible.

Main flow:
1. User clicks `Next`.
2. Score reaches target.
3. App shows random animal celebration.

Expected result:
- Game stops and a simplified celebration screen is shown.
- User can play again with one prominent action.

## UC-08 Long-Term Adaptive Practice

Actor: Returning child

Preconditions:
- Server stats contain prior wrong or timeout results.

Main flow:
1. User starts another game.
2. App loads server stats.
3. App weighs historically difficult questions more heavily.

Expected result:
- Questions with higher mistake history appear more often than easy questions.
