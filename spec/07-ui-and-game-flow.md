# UI And Game Flow

## Screens

### Start Screen

Visible elements:
- Heading `Kids Quiz`.
- One button per test name loaded from the database.

Behavior:
- The countdown is not visible and does not run.
- Clicking a test button loads that test's questions and stats, then starts a new game.

### Play Screen

Visible elements:
- Score pill: `Skóre current / target`.
- Timer pill: remaining seconds.
- Icon button for returning to test selection.
- Icon button for settings.
- Large centered question or answer text.
- Primary action area.

Question state:
- Shows label `Otázka`.
- Shows `Ukázat odpověď` button.
- Shows answer count hint when more than one answer is correct.

Answer state:
- Shows label `Odpověď`.
- Shows answer text.
- If answer was shown in time: buttons `Špatně` and `Správně`.
- If timeout occurred: timeout note and only `Další`.

### Settings Screen

Visible elements:
- Heading `Nastavení`.
- Seconds input.
- Target score input.
- `Uložit` button.

Behavior:
- Saving persists settings and does not start a game.
- Returning from settings goes back to test selection.

### Finished Screen

Visible elements:
- Confetti text.
- Random animal image without an embedded animal name label.
- Score label.
- Large `Gratulace!` heading.
- One prominent `Vybrat test` button.

Behavior:
- `Vybrat test` returns to the start screen without starting the timer.

## Timer Behavior

- Timer starts only after the user selects a test and a question is selected.
- Timer does not start from settings, restart, or finished screens.
- Timer stops when answer is shown.
- Timer reaching zero triggers timeout penalty.
- Timer resets for each new question.

## Scoring UI

- Score updates immediately on user action or timeout.
- Timeout and wrong actions show a short `-1` flash.
- Score can be negative.

## Visual Design

- Fullscreen soft background.
- Large typography for question/answer.
- Compact top controls.
- Rounded controls and child-friendly colors.
- Local SVG animal images with CSS animations.

## Accessibility Considerations

- Buttons use text labels.
- Game can be operated with pointer interaction.
- Text wraps to avoid overflow.
- Color alone should not be the only indicator of state; timeout includes text note.
