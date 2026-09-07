import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TestSessionEngine } from '../src/app/test-session-engine.ts';

function candidates() {
  return [2, 0, 1].flatMap((order) => ['add', 'sub'].flatMap((operation) =>
    Array.from({ length: 8 }, (_, index) => ({
      key: `${order}:${operation}:${index}`,
      value: { order, operation, index },
      weight: index + 1,
      group: `${order}:${operation}`,
      order,
    })),
  ));
}

function finish(session) {
  const questions = [];
  for (let next = session.next(); next !== null; next = session.next()) {
    questions.push(next);
    session.record('correct');
  }
  assert.ok(session.finished);
  return questions;
}

test('mixed sessions progress from easy to hard while retaining balanced selection', () => {
  for (let run = 0; run < 100; run += 1) {
    const session = new TestSessionEngine();
    session.startBalanced(candidates(), 10);
    const questions = finish(session);
    const orders = questions.map((question) => question.order);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
    assert.equal(new Set(questions).size, 10);
    const groupCounts = [0, 1, 2].flatMap((order) => ['add', 'sub'].map((operation) =>
      questions.filter((question) => question.order === order && question.operation === operation).length,
    ));
    assert.ok(groupCounts.every((count) => count === 1 || count === 2));
  }
});

test('presentation order does not change weighted selection', (t) => {
  const items = candidates();
  for (const method of ['start', 'startBalanced']) {
    let state;
    t.mock.method(Math, 'random', () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 2 ** 32;
    });
    const ordered = new TestSessionEngine();
    state = 42;
    ordered[method](items, 10);
    const unordered = new TestSessionEngine();
    state = 42;
    unordered[method](items.map(({ order, ...item }) => item), 10);
    assert.deepEqual(ordered.selectedValues(), unordered.selectedValues());
    t.mock.restoreAll();
  }
});

test('items within one difficulty still have random presentation order', (t) => {
  const session = new TestSessionEngine();
  session.startBalanced(candidates().filter((item) => item.order === 1), 6);
  const selected = session.selectedValues();
  t.mock.method(Math, 'random', () => 0.999);
  assert.deepEqual(finish(session), [...selected].reverse());
});

test('sessions without ordering keep random presentation', (t) => {
  const session = new TestSessionEngine();
  session.start(candidates().map(({ order, ...item }) => item), 10);
  const selected = session.selectedValues();
  t.mock.method(Math, 'random', () => 0.999);
  assert.deepEqual(finish(session), [...selected].reverse());
});

test('wrong answers repeat without immediate repetition and count as one mistake', (t) => {
  t.mock.method(Math, 'random', () => 0);
  const session = new TestSessionEngine();
  session.startBalanced([
    { key: 'easy-a', value: 'easy-a', weight: 1, order: 0 },
    { key: 'easy-b', value: 'easy-b', weight: 1, order: 0 },
    { key: 'normal', value: 'normal', weight: 1, order: 1 },
    { key: 'hard', value: 'hard', weight: 1, order: 2 },
  ], 4);
  assert.equal(session.next(), 'easy-a');
  session.record('wrong');
  assert.equal(session.next(), 'easy-b');
  session.record('correct');
  assert.equal(session.next(), 'easy-a');
  session.record('wrong');
  assert.equal(session.next(), 'normal');
  session.record('correct');
  assert.equal(session.finished, false);
  assert.deepEqual(finish(session), ['easy-a', 'hard']);
  assert.equal(session.completedCount, 4);
  assert.deepEqual(session.results().filter((result) => result.hadMistake), [
    { key: 'easy-a', hadMistake: true },
  ]);
  session.clear();
  assert.equal(session.next(), null);
  assert.deepEqual(session.results(), []);
});
