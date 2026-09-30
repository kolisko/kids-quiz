import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
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

test('Czech spelling: menu, word bank, per-user statistics and ordinary trophy reward', { timeout: 60000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'czech-spelling-'));
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const file = join(directory, 'quiz.sqlite');
  const server = spawn('java', ['-jar', fileURLToPath(new URL('../build/libs/kids-quiz-backend.jar', import.meta.url))], {
    env: { PATH: process.env.PATH, JAVA_HOME: process.env.JAVA_HOME, HOME: process.env.HOME,
      PORT: String(port), KIDS_QUIZ_DATA_DIR: directory, KIDS_QUIZ_DB_PATH: file },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  const request = (path, token, body, method = body === undefined ? 'GET' : 'POST') => fetch(`http://127.0.0.1:${port}/api/${path}`, {
    method, headers: { ...(token ? { Cookie: `kids_quiz_session=${token}` } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const menuKey = 'tests.czech.orthography';
  const launch = token => request('test-menu/launch', token, { key: menuKey });
  let db;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { ready = (await request('health')).ok; } catch {}
      if (ready) break;
      if (server.exitCode !== null) throw new Error(logs);
      await delay(150);
    }
    assert.ok(ready, logs);
    db = new DatabaseSync(file);
    const tokens = [0, 1].map(index => {
      const { lastInsertRowid } = db.prepare("INSERT INTO users(email, role, status) VALUES(?, 'user', 'active')").run(`czech-${index}@example.invalid`);
      const token = randomBytes(32).toString('hex');
      db.prepare("INSERT INTO user_sessions(token, user_id, expires_at) VALUES(?, ?, datetime('now', '+1 hour'))").run(token, lastInsertRowid);
      return token;
    });
    const [token, other] = tokens;
    let questions;
    await t.test('launch uses saved settings and returns questions for 80 unambiguous words', async () => {
      assert.equal((await launch()).status, 401);
      assert.equal((await request('czech-spelling/stats/session', undefined, { results: [] })).status, 401);
      await request('settings', token, { targetScore: 12, secondsLimit: 20 }, 'PATCH');
      const response = await launch(token);
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.kind, 'czech_spelling');
      assert.equal(data.selectedLanguage, null);
      assert.equal(data.settings.targetScore, 12);
      assert.equal(data.settings.secondsLimit, 20);
      questions = data.czechSpellingQuestions;
      assert.equal(new Set(questions.map(q => q.word)).size, 80);
      assert.equal(new Set(questions.map(q => q.key)).size, questions.length);
      assert.equal((await (await request('czech-spelling/words', token)).json()).rawWords.split(', ').length, 80);
      const answers = { ú: 0, ů: 0, i: 0, y: 0 };
      for (const q of questions) {
        const letter = q.word[q.blankIndex];
        assert.ok(q.options.includes(letter), q.word);
        assert.deepEqual(q.options, ['ú', 'ů'].includes(letter) ? ['ú', 'ů'] : ['i', 'y']);
        assert.equal(q.key, `${q.word}:${q.blankIndex}`);
        const alternative = q.word.slice(0, q.blankIndex) + q.options.find(option => option !== letter) + q.word.slice(q.blankIndex + 1);
        assert.ok(!questions.some(candidate => candidate.word === alternative), q.word);
        assert.ok(!['kůra', 'kúra', 'byl', 'bil', 'vír', 'výr'].includes(q.word));
        answers[letter]++;
      }
      assert.ok(Object.values(answers).every(count => count >= 20));
    });
    await t.test('grammar has an independent menu branch and visibility', async () => {
      for (const key of [menuKey, 'tests.czech']) {
        await request('settings', token, { hiddenTestMenuKeys: [key] }, 'PATCH');
        assert.equal((await launch(token)).status, 404);
        assert.equal((await launch(other)).status, 200);
      }
      await request('settings', token, { hiddenTestMenuKeys: [] }, 'PATCH');
      const tree = await (await request('test-menu', token)).json();
      const czechTests = tree.children.find(node => node.key === 'tests.czech').children;
      assert.deepEqual(czechTests.map(node => node.key), [menuKey]);
      assert.ok(czechTests[0].launchable);
      const translationTests = tree.children.find(node => node.key === 'tests.language.cs').children;
      assert.deepEqual(translationTests.map(node => node.key), ['tests.language.cs.spelling', 'tests.language.cs.flipcards']);
      await request('settings', token, { hiddenTestMenuKeys: ['tests.language.cs'] }, 'PATCH');
      assert.equal((await launch(token)).status, 200);
      await request('settings', token, { hiddenTestMenuKeys: [] }, 'PATCH');
      assert.ok(tree.children.find(node => node.key === 'tests.language.en').children.some(node => node.key.endsWith('.flipcards')));
    });
    await t.test('mistakes count once, survive a new launch and belong only to the current user', async () => {
      const [first, second] = questions;
      const response = await request('czech-spelling/stats/session', token, { results: [
        { key: first.key, correct: false }, { key: first.key, correct: true }, { key: second.key, correct: true },
      ] });
      assert.equal(response.status, 200);
      const stats = (await response.json()).statsByKey;
      assert.deepEqual(stats[first.key], { correct: 0, wrong: 1 });
      assert.deepEqual(stats[second.key], { correct: 1, wrong: 0 });
      assert.deepEqual((await (await launch(token)).json()).czechSpellingStats.statsByKey, stats);
      assert.deepEqual((await (await launch(other)).json()).czechSpellingStats.statsByKey, {});
      assert.equal((await request('czech-spelling/stats/session', token, { results: [
        { key: first.key, correct: true }, { key: 'unknown', correct: true },
      ] })).status, 400);
      assert.deepEqual((await (await launch(token)).json()).czechSpellingStats.statsByKey, stats);
      assert.equal((await request('czech-spelling/stats/session', token, { results: [{ key: first.key }] })).status, 400);
    });
    await t.test('the shared reward endpoint grants and stores a fumfik', async () => {
      const response = await request('trophies/award-next', token, {});
      assert.equal(response.status, 200);
      const { awarded, trophies } = await response.json();
      assert.equal(awarded.version, 2);
      assert.equal(trophies.length, 1);
      assert.deepEqual(await (await request('trophies', token)).json(), trophies);
      assert.deepEqual(await (await request('trophies', other)).json(), []);
    });
    await t.test('a comma-separated word list is editable per user and generates one-letter variants', async () => {
      const defaults = await (await request('czech-spelling/words', other)).json();
      assert.equal((await request('czech-spelling/words')).status, 401);
      assert.equal((await request('czech-spelling/words', undefined, { rawWords: 'úkol' }, 'PUT')).status, 401);
      const saved = await request('czech-spelling/words', token, { rawWords: '  ÚKOL, rybičky, stůl, úkol, \n žirafa  ' }, 'PUT');
      assert.equal(saved.status, 200);
      assert.deepEqual(await saved.json(), { rawWords: 'úkol, rybičky, stůl, žirafa' });
      assert.deepEqual(await (await request('czech-spelling/words', token)).json(), { rawWords: 'úkol, rybičky, stůl, žirafa' });
      assert.deepEqual(await (await request('czech-spelling/words', other)).json(), defaults);
      const custom = (await (await launch(token)).json()).czechSpellingQuestions;
      assert.deepEqual(new Set(custom.map(q => q.word)), new Set(['úkol', 'rybičky', 'stůl', 'žirafa']));
      assert.deepEqual(custom.filter(q => q.word === 'rybičky').map(q => q.blankIndex), [1, 3, 6]);
      assert.equal((await request('czech-spelling/stats/session', token, { results: [{ key: 'rybičky:3', correct: true }] })).status, 200);
      for (const [rawWords, error] of [
        ['', 'empty_czech_spelling_words'], [',, \n', 'empty_czech_spelling_words'],
        ['pes', 'missing_czech_spelling_letters'], ['úkol, pes', 'missing_czech_spelling_letters'],
        ['úkol, malý dům', 'invalid_czech_spelling_words'], ['úkol2', 'invalid_czech_spelling_words'],
      ]) {
        const response = await request('czech-spelling/words', token, { rawWords }, 'PUT');
        assert.equal(response.status, 400);
        assert.equal((await response.json()).error, error);
      }
      assert.deepEqual(await (await request('czech-spelling/words', token)).json(), { rawWords: 'úkol, rybičky, stůl, žirafa' });
      await request('czech-spelling/words', token, { rawWords: 'stůl' }, 'PUT');
      assert.equal((await (await launch(token)).json()).czechSpellingQuestions.length, 1);
    });
  } finally {
    db?.close();
    if (server.exitCode === null) {
      server.kill('SIGTERM');
      await once(server, 'exit');
    }
    await rm(directory, { recursive: true, force: true });
  }
});
