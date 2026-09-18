import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('Timed arithmetic: levels, settings, personal records and atomic rewards', { timeout: 60000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'timed-arithmetic-'));
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const file = join(dir, 'quiz.sqlite');
  const process = spawn('java', ['-jar', fileURLToPath(new URL('../build/libs/kids-quiz-backend.jar', import.meta.url))], {
    env: { PATH: globalThis.process.env.PATH, JAVA_HOME: globalThis.process.env.JAVA_HOME, HOME: globalThis.process.env.HOME,
      PORT: String(port), KIDS_QUIZ_DATA_DIR: dir, KIDS_QUIZ_DB_PATH: file }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  process.stdout.on('data', chunk => { logs += chunk; });
  process.stderr.on('data', chunk => { logs += chunk; });
  const request = (path, token, body, method = body === undefined ? 'GET' : 'POST') => fetch(`http://127.0.0.1:${port}/api/${path}`, {
    method, headers: { ...(token ? { Cookie: `kids_quiz_session=${token}` } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let db;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { ready = (await request('health')).ok; } catch {}
      if (ready) break;
      if (process.exitCode !== null) throw new Error(logs);
      await delay(150);
    }
    assert.ok(ready, logs);
    db = new DatabaseSync(file);
    const users = [];
    for (let i = 0; i < 2; i++) {
      const { lastInsertRowid: id } = db.prepare("INSERT INTO users(email, role, status) VALUES(?, 'user', 'active')").run(`timed-${i}@example.invalid`);
      const token = randomBytes(32).toString('hex');
      db.prepare("INSERT INTO user_sessions(token, user_id, expires_at) VALUES(?, ?, datetime('now', '+1 hour'))").run(token, id);
      users.push({ id, token });
    }
    const token = users[0].token;
    let summary;
    await t.test('default limits and menu are per-user; anonymous access is rejected', async () => {
      assert.equal((await request('timed-arithmetic')).status, 401);
      const launch = await (await request('test-menu/launch', token, { key: 'tests.math.timed-arithmetic' })).json();
      assert.equal(launch.kind, 'timed_arithmetic');
      summary = launch.timedArithmetic;
      assert.deepEqual(summary.levels.map(l => l.seconds), [120, 120, 120]);
      assert.equal(summary.totalRecord, 0);
    });
    await t.test('all questions satisfy the three level boundaries and commutativity', () => {
      const seen = new Set();
      for (const level of summary.levels) {
        assert.ok(level.questions.some(q => q.key.startsWith('add:')));
        assert.ok(level.questions.some(q => q.key.startsWith('sub:')));
        for (const q of level.questions) {
          assert.ok(!seen.has(q.key), q.key);
          seen.add(q.key);
          const [operation, a, b] = q.key.split(':');
          const left = Number(a), right = Number(b);
          const expected = operation === 'add' ? left + right : left - right;
          assert.equal(q.answer, expected);
          assert.ok(q.answer >= 0 && q.answer <= 20);
          if (operation === 'add') assert.ok(left <= right);
          if (level.level === 1) assert.ok(left <= 10 && right <= 10 && expected <= 10);
          if (level.level === 2) assert.ok(expected >= 10 && expected <= 20 && Math.max(left, right) >= 10);
          if (level.level === 3 && operation === 'add') assert.ok(left < 10 && right < 10 && expected > 10);
          if (level.level === 3 && operation === 'sub') assert.ok(left > 10 && left < 20 && right < 10 && expected < 10);
        }
      }
    });
    await t.test('PATCH changes only the limits and validates all three values', async () => {
      const before = await (await request('settings', token)).json();
      const response = await request('settings', token, { timedArithmeticSeconds: [10, 11, 12] }, 'PATCH');
      assert.equal(response.status, 200);
      const after = await response.json();
      assert.deepEqual(after, { ...before, timedArithmeticSeconds: [10, 11, 12] });
      for (const values of [[1, 10, 10], [10, 10], [10, 10, 601]]) {
        assert.equal((await request('settings', token, { timedArithmeticSeconds: values }, 'PATCH')).status, 400);
      }
      assert.deepEqual((await (await request('settings', users[1].token)).json()).timedArithmeticSeconds, [120, 120, 120]);
    });
    const start = async () => {
      const response = await request('timed-arithmetic/runs', token, { requestId: randomUUID() });
      assert.equal(response.status, 200);
      return response.json();
    };
    const expire = run => db.prepare('UPDATE timed_arithmetic_runs SET starts_at_ms = ? WHERE id = ?').run(Date.now() - run.summary.levels.reduce((sum, l) => sum + l.seconds * 1000, 0) - 500, run.id);
    const answers = (run, scores) => {
      let offset = 0;
      const levels = run.summary.levels.map((level, index) => {
        const attempts = level.questions.slice(0, scores[index]).map((q, i) => ({ key: q.key, correct: true, elapsedMs: offset + 200 + i * 400 }));
        offset += level.seconds * 1000;
        return attempts;
      });
      return { levels };
    };
    const finish = (run, body, userToken = token) => request(`timed-arithmetic/runs/${run.id}/finish`, userToken, body);
    await t.test('server owns duration and user identity; early completion and cross-user submissions fail', async () => {
      const run = await start();
      const body = answers(run, [1, 1, 1]);
      assert.equal((await finish(run, body)).status, 409);
      assert.equal((await finish(run, body, users[1].token)).status, 404);
      assert.equal((await finish(run, body, '')).status, 401);
      const retry = await (await request('timed-arithmetic/runs', token, { requestId: run.id })).json();
      assert.equal(retry.startsAt, run.startsAt);
      expire(run);
      const wrongLevel = answers(run, [1, 1, 1]);
      wrongLevel.levels[1][0].key = run.summary.levels[0].questions[0].key;
      assert.equal((await finish(run, wrongLevel)).status, 400);
      const late = answers(run, [1, 1, 1]);
      late.levels[0][0].elapsedMs = 10000;
      assert.equal((await finish(run, late)).status, 400);
    });
    await t.test('first positive records award three unique v2 trophies and one stored superbox, exactly once', async () => {
      const run = await start();
      expire(run);
      const body = answers(run, [2, 2, 2]);
      const results = await Promise.all(Array.from({ length: 3 }, async () => {
        const response = await finish(run, body);
        assert.equal(response.status, 200);
        return response.json();
      }));
      assert.deepEqual(results[0], results[1]);
      assert.deepEqual(results[1], results[2]);
      assert.equal(results[0].total, 6);
      assert.equal(results[0].superboxAwarded, true);
      assert.equal(results[0].superboxCount, 1);
      assert.equal(new Set(results[0].levels.map(l => l.trophy.animalKey)).size, 3);
      assert.ok(results[0].levels.every(l => l.trophy.version === 2));
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM trophies WHERE user_id = ?').get(users[0].id).count, 3);
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM superboxes').get().count, 1);
      const other = await (await request('timed-arithmetic', users[1].token)).json();
      assert.equal(other.totalRecord, 0);
      assert.equal(other.superboxCount, 0);
    });
    await t.test('ties award nothing; level records and total records are independent', async () => {
      const tie = await start(); expire(tie);
      const tied = await (await finish(tie, answers(tie, [2, 2, 2]))).json();
      assert.equal(tied.superboxAwarded, false);
      assert.ok(tied.levels.every(l => !l.trophy));
      const level = await start(); expire(level);
      const improved = await (await finish(level, answers(level, [3, 1, 1]))).json();
      assert.ok(improved.levels[0].trophy);
      assert.equal(improved.totalRecord, 6);
      assert.equal(improved.superboxAwarded, false);
      const total = await start(); expire(total);
      const best = await (await finish(total, answers(total, [3, 2, 2]))).json();
      assert.ok(best.levels.every(l => !l.trophy));
      assert.equal(best.superboxAwarded, true);
      assert.equal(best.superboxCount, 2);
    });
    await t.test('different limits have independent records; zero correct answers give no rewards', async () => {
      await request('settings', token, { timedArithmeticSeconds: [20, 20, 20] }, 'PATCH');
      const run = await start(); expire(run);
      assert.equal(run.summary.totalRecord, 0);
      assert.ok(run.summary.levels.every(l => l.record === 0));
      const body = answers(run, [1, 1, 1]);
      body.levels.forEach(attempts => { attempts[0].correct = false; });
      const result = await (await finish(run, body)).json();
      assert.equal(result.total, 0);
      assert.ok(result.levels.every(l => !l.trophy && l.wrong === 1));
      assert.equal(result.superboxAwarded, false);
      await request('settings', token, { timedArithmeticSeconds: [10, 11, 12] }, 'PATCH');
      const restored = await (await request('timed-arithmetic', token)).json();
      assert.equal(restored.totalRecord, 7);
      assert.deepEqual(restored.levels.map(l => l.record), [3, 2, 2]);
    });
    await t.test('rewards and records roll back together on a database failure', async () => {
      const before = db.prepare('SELECT COUNT(*) AS count FROM trophies').get().count;
      const run = await start(); expire(run);
      db.exec("CREATE TRIGGER fail_superbox BEFORE INSERT ON superboxes BEGIN SELECT RAISE(ABORT, 'test rollback'); END");
      const response = await finish(run, answers(run, [4, 4, 4]));
      assert.equal(response.status, 500);
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM trophies').get().count, before);
      assert.equal(db.prepare('SELECT result_json FROM timed_arithmetic_runs WHERE id = ?').get(run.id).result_json, null);
      db.exec('DROP TRIGGER fail_superbox');
      const retry = await (await finish(run, answers(run, [4, 4, 4]))).json();
      assert.equal(retry.total, 12);
      assert.equal(retry.superboxAwarded, true);
    });
  } finally {
    db?.close();
    process.kill('SIGTERM');
    if (process.exitCode === null) await once(process, 'exit');
    await rm(dir, { recursive: true, force: true });
  }
});
