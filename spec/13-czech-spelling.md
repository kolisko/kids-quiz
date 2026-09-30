# Czech spelling for grade 3

- Menu: Český jazyk → Doplň ú/ů a i/y (`tests.czech.orthography`). Grammar is separate from the existing foreign-language/translation branches, including Czech translations. Respects existing per-user menu visibility and automatic entry into a branch with a single test.
- The initial list contains 80 familiar words covering ú, ů, short i and short y. Each question masks one specific letter with `_`; ambiguous standalone words such as kůra/kúra and byl/bil are excluded from the initial list.
- Settings → Český jazyk – Pravopis provides one editable comma-separated list per user, including non-admin users, independently of the foreign-language settings tabs. `GET/PUT /api/czech-spelling/words` persists it in `czech_spelling_words` (migration 33). Trim, lowercase, normalize Unicode and deduplicate entries. Reject empty lists, non-word entries, more than 500 words, or words without ú/ů/i/y. Words with several eligible letters generate separate one-letter questions. Accented í/ý remain visible.
- Show two large answer buttons in the existing question-card layout. A click reveals the complete correct word and feedback; Další advances. Answers are evaluated automatically. The selected wrong answer stays visible in red with ✕ Tvoje volba and a prominent Špatně message. Only a correctly selected answer is green with ✓ Správně; unselected buttons stay neutral, including after a mistake or timeout. Both choices are disabled until the next question.
- Use `TestSessionEngine.startBalanced` for an even mix of the available ú/ů and i/y questions, the existing adaptive weights, timeout, mistake repetition and completion tracking.
- Use `targetScore` and `secondsLimit` from settings. Targets above the word-bank size allow repeated words to preserve the requested target. A mistake or timeout does not increase the score and the item must be answered correctly later.
- Save each word/letter position once per completed test, with any mistake taking precedence, in per-user `czech_spelling_stats` (migration 33). Launch returns that user's statistics for adaptive selection. No image or audio generation is required.
- Finishing uses the existing trophy award and celebration flow.

Validation: `node --test frontend/tests/czech-spelling.test.mjs frontend/tests/test-session-engine.test.mjs`; after building the backend jar, `node --test backend/tests/czech-spelling.test.mjs`.

UI acceptance: choose an incorrect letter, check the revealed word and unchanged score; use Další and complete the repeated word correctly. Let a question time out and check that it repeats. Complete the configured goal and check the fumfik, then confirm it appears in the trophy collection.
