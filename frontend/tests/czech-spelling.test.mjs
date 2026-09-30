import assert from 'node:assert/strict';
import test from 'node:test';
import { TestSessionEngine } from '../src/app/test-session-engine.ts';
import { czechSpellingCandidates, czechSpellingPrompt, czechSpellingResults } from '../src/app/czech-spelling.ts';

const questions = [
  ['úkol', 0, ['ú', 'ů']], ['stůl', 2, ['ú', 'ů']],
  ['růže', 1, ['ú', 'ů']], ['úsměv', 0, ['ú', 'ů']],
  ['žirafa', 1, ['i', 'y']], ['ryba', 1, ['i', 'y']],
  ['šiška', 1, ['i', 'y']], ['boty', 3, ['i', 'y']],
].map(([word, blankIndex, options]) => ({ key: `${word}:${blankIndex}`, word, blankIndex, options }));

test('exactly the selected letter is hidden, preserving other accents and letters', () => {
  assert.equal(czechSpellingPrompt(questions[0]), '_kol');
  assert.equal(czechSpellingPrompt(questions[1]), 'st_l');
  assert.equal(czechSpellingPrompt(questions[6]), 'š_ška');
  assert.equal(czechSpellingPrompt(questions[7]), 'bot_');
});

test('both rules are balanced, questions are unique within the pool, and larger settings remain achievable', () => {
  for (const target of [1, 2, 5, 8, 10, 100]) {
    for (let run = 0; run < 30; run++) {
      const session = new TestSessionEngine();
      session.startBalanced(czechSpellingCandidates(questions, target, () => 1), target);
      assert.equal(session.selectedCount, target);
      const selected = session.selectedValues();
      const uCount = selected.filter(index => questions[index].options[0] === 'ú').length;
      assert.ok(Math.abs(uCount - (target - uCount)) <= 1);
      if (target <= questions.length) assert.equal(new Set(selected).size, target);
      while (session.next() !== null) session.record('correct');
      assert.equal(session.completedCount, target);
      assert.ok(session.finished);
    }
  }
});

test('mistakes and timeouts repeat until correct and remain mistakes in saved statistics', () => {
  const session = new TestSessionEngine();
  session.startBalanced(czechSpellingCandidates(questions, 4, () => 1), 4);
  const first = session.next();
  session.record('wrong');
  assert.equal(session.completedCount, 0);
  assert.equal(session.finished, false);
  let repeated = false;
  let attempts = 1;
  for (let next = session.next(); next !== null; next = session.next()) {
    if (attempts === 1) assert.notEqual(next, first);
    if (next === first) repeated = true;
    session.record('correct');
    attempts++;
  }
  assert.ok(repeated);
  assert.equal(attempts, 5);
  assert.equal(session.completedCount, 4);
  assert.ok(session.finished);
  assert.deepEqual(czechSpellingResults(session.results()).filter(result => !result.correct), [
    { key: questions[first].key, correct: false },
  ]);
});

test('adaptive weights are retained and repeated words count once when saving', () => {
  const candidates = czechSpellingCandidates(questions, 10, key => key === 'úkol:0' ? 25 : 1);
  assert.ok(candidates.filter(item => item.value === 0).every(item => item.weight === 25));
  assert.deepEqual(czechSpellingResults([
    { key: 'úkol:0#0', hadMistake: false },
    { key: 'úkol:0#1', hadMistake: true },
    { key: 'úkol:0#2', hadMistake: false },
    { key: 'ryba:1#0', hadMistake: false },
  ]), [{ key: 'úkol:0', correct: false }, { key: 'ryba:1', correct: true }]);
  assert.deepEqual(czechSpellingCandidates([], 10, () => 1), []);
});
