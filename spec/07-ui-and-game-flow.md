# UI And Game Flow

## Screens

### Start Screen

Visible elements:
- Heading `Vyber test`.
- Primary test button `Mala nasobilka`.
- Loaded question count.
- `Settings` button.

Behavior:
- The countdown is not visible and does not run.
- Clicking `Mala nasobilka` starts a new game and selects the first question.

### Play Screen

Visible elements:
- Score pill: `Score current / target`.
- Timer pill: remaining seconds.
- `Restart` button.
- `Settings` button.
- Large centered question or answer text.
- Primary action area.

Question state:
- Shows label `Question`.
- Shows `Show answer` button.

Answer state:
- Shows label `Answer`.
- Shows answer text.
- If answer was shown in time: buttons `Wrong` and `Next`.
- If timeout occurred: timeout note and only `Next`.

### Settings Screen

Visible elements:
- Heading `Settings`.
- Loaded question count.
- Seconds input.
- Target score input.
- Questions JSON textarea.
- Validation error area.
- `Save and play` button.

Behavior:
- Saving validates JSON.
- Valid save persists settings and starts new game.
- Invalid save keeps the user on settings.

### Finished Screen

Visible elements:
- Confetti text.
- Random animal image without an embedded animal name label.
- Score label.
- Large `Gratulace!` heading.
- One prominent `Play again` button.

Behavior:
- `Play again` resets current game score but preserves server stats.

## Timer Behavior

- Timer starts only after the user selects a test and a question is selected.
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
