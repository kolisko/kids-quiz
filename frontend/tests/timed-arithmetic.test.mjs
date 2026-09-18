import assert from 'node:assert/strict';
import test from 'node:test';
import { TimedArithmeticEngine, formatTime } from '../src/app/timed-arithmetic/timed-arithmetic.model.ts';

const levels = [1, 2, 3].map(level => ({ level, seconds: 10, record: 0, questions: [
  { key: `add:${level}:1`, text: `${level} + 1`, answer: level + 1 },
  { key: `add:${level}:2`, text: `${level} + 2`, answer: level + 2 },
  { key: `sub:${level}:1`, text: `${level} − 1`, answer: level - 1 },
] }));

test('three fixed deadlines advance automatically, including after a suspended tab', () => {
  const engine = new TimedArithmeticEngine(levels);
  engine.tick(-3000);
  assert.equal(engine.levelIndex, -1);
  assert.equal(engine.question, null);
  engine.tick(0);
  assert.equal(engine.levelIndex, 0);
  assert.equal(engine.secondsLeft, 10);
  engine.tick(9999);
  assert.equal(engine.secondsLeft, 1);
  engine.tick(20000);
  assert.equal(engine.levelIndex, 2);
  assert.equal(engine.secondsLeft, 10);
  engine.tick(30000);
  assert.equal(engine.finished, true);
  assert.equal(engine.question, null);
  assert.equal(engine.total, 0);
});

test('reveal, mark, next: only correct answers count; double taps cannot score a new question', () => {
  const engine = new TimedArithmeticEngine(levels);
  engine.tick(0);
  engine.record(true, 100);
  assert.equal(engine.total, 0);
  engine.reveal(200);
  engine.record(true, 300);
  engine.record(true, 301);
  assert.equal(engine.total, 1);
  assert.equal(engine.answerVisible, false);
  engine.reveal(400);
  engine.record(false, 500);
  assert.equal(engine.total, 1);
  assert.deepEqual(engine.attempts[0].map(a => a.correct), [true, false]);
});

test('an answer at the deadline does not leak into the next level', () => {
  const engine = new TimedArithmeticEngine(levels);
  engine.tick(0);
  engine.reveal(9900);
  engine.record(true, 10000);
  assert.equal(engine.levelIndex, 1);
  assert.equal(engine.answerVisible, false);
  assert.equal(engine.total, 0);
  engine.tick(29900);
  engine.reveal(29901);
  engine.record(true, 30000);
  assert.equal(engine.finished, true);
  assert.equal(engine.total, 0);
});

test('balanced questions keep coming, without immediate or reversed-key duplicates', () => {
  const engine = new TimedArithmeticEngine([{ ...levels[0], seconds: 600 }, levels[1], levels[2]]);
  engine.tick(0);
  const keys = [];
  for (let i = 0; i < 100; i++) {
    keys.push(engine.question.key);
    engine.reveal(i * 1000 + 100);
    engine.record(true, i * 1000 + 200);
  }
  assert.equal(engine.total, 100);
  assert.ok(keys.every((key, i) => i === 0 || key !== keys[i - 1]));
  assert.equal(keys.filter(key => key.startsWith('add:')).length, 50);
});

test('moving the clock backwards never extends a level or changes recorded answers', () => {
  const engine = new TimedArithmeticEngine(levels);
  engine.tick(9000);
  engine.reveal(5000);
  assert.equal(engine.secondsLeft, 1);
  engine.record(true, 8500);
  assert.equal(engine.attempts[0][0].elapsedMs, 9000);
  assert.equal(formatTime(120), '2:00');
  assert.equal(formatTime(9), '0:09');
});
