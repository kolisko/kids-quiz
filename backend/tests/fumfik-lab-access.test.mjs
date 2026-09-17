import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('Fumfik access and versioned trophy compatibility', { timeout: 60000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'fumfik-access-'));
  const publicDir = join(directory, 'public');
  const labDir = join(publicDir, 'fumfik-lab');
  await mkdir(labDir, { recursive: true });
  await writeFile(join(publicDir, 'index.html'), '<h1>Public app</h1>');
  await writeFile(join(labDir, 'index.html'), '<h1>Private lab</h1>');
  await writeFile(join(labDir, 'lab.js'), '/* private lab bundle */');
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const dbFile = join(directory, 'test.sqlite');
  const startBackend = () => spawn('java', ['-jar', fileURLToPath(new URL('../build/libs/kids-quiz-backend.jar', import.meta.url))], {
    env: { PATH: globalThis.process.env.PATH, JAVA_HOME: globalThis.process.env.JAVA_HOME, HOME: globalThis.process.env.HOME,
      PORT: String(port), KIDS_QUIZ_DATA_DIR: directory, KIDS_QUIZ_DB_PATH: dbFile, KIDS_QUIZ_STATIC_DIR: publicDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let process = startBackend();
  const base = `http://127.0.0.1:${port}`;
  const request = (path, token, method = 'GET') => fetch(base + path, { method, redirect: 'manual', headers: token ? { Cookie: `kids_quiz_session=${token}` } : {} });
  const waitForBackend = async () => {
    let logs = '';
    process.stdout.on('data', chunk => { logs += chunk; });
    process.stderr.on('data', chunk => { logs += chunk; });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { ready = (await request('/api/health')).ok; } catch {}
      if (ready) break;
      if (process.exitCode !== null) throw new Error(`Backend exited: ${logs}`);
      await delay(200);
    }
    assert.ok(ready, `Backend did not start: ${logs}`);
  };
  let db;
  try {
    await waitForBackend();
    db = new DatabaseSync(dbFile);
    const fixtures = {};
    for (const [name, role, status, expiration] of [
      ['admin', 'admin', 'active', '+1 hour'], ['member', 'user', 'active', '+1 hour'],
      ['suspended', 'admin', 'suspended', '+1 hour'], ['expired', 'admin', 'active', '-1 hour'],
    ]) {
      const { lastInsertRowid } = db.prepare('INSERT INTO users(email, role, status) VALUES (?, ?, ?)').run(`${name}@lab-test.invalid`, role, status);
      const token = randomBytes(32).toString('hex');
      db.prepare("INSERT INTO user_sessions(token, user_id, expires_at) VALUES (?, ?, datetime('now', ?))").run(token, lastInsertRowid, expiration);
      fixtures[name] = { id: lastInsertRowid, token };
    }
    const paths = ['/fumfik-lab', '/fumfik-lab/', '/fumfik-lab/index.html', '/fumfik-lab/lab.js', '/assets/../fumfik-lab/lab.js'];
    for (const name of ['anonymous', 'member', 'suspended', 'expired']) {
      await t.test(`${name} cannot load the lab or its files`, async () => {
        for (const path of paths) {
          const response = await request(path, fixtures[name]?.token);
          assert.equal(response.status, name === 'member' ? 403 : 302, path);
          assert.equal(response.headers.get('cache-control'), 'no-store');
          if (name !== 'member') assert.equal(response.headers.get('location'), '/');
          assert.doesNotMatch(await response.text(), /Private lab|private lab bundle/);
        }
      });
    }
    await t.test('admin gets a canonical URL, the page and its bundle without public caching', async () => {
      const redirect = await request('/fumfik-lab', fixtures.admin.token);
      assert.equal(redirect.status, 302);
      assert.equal(redirect.headers.get('location'), '/fumfik-lab/');
      for (const path of paths.slice(1)) {
        const response = await request(path, fixtures.admin.token);
        assert.equal(response.status, 200, path);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.match(await response.text(), /Private lab|private lab bundle/);
      }
      assert.equal((await request('/fumfik-lab/missing.js', fixtures.admin.token)).status, 404);
      assert.equal((await request('/')).status, 200);
    });
    await t.test('an existing session loses access immediately when the admin role is removed', async () => {
      db.prepare("UPDATE users SET role='user' WHERE id=?").run(fixtures.admin.id);
      assert.equal((await request('/fumfik-lab/', fixtures.admin.token)).status, 403);
      db.prepare("UPDATE users SET role='admin' WHERE id=?").run(fixtures.admin.id);
    });

    const query = 'body=round&ears=floppy&eyes=sparkle&nose=heart&mouth=grin&palette=sky&background=waves';
    const legacyKeys = ['animal-01', 'animal-40', `generated:${query}`];
    for (const key of legacyKeys) {
      db.prepare('INSERT INTO trophies(user_id, animal_key, won_at) VALUES (?, ?, ?)').run(fixtures.member.id, key, '2026-01-02 03:04:05');
    }
    const storedRows = () => db.prepare('SELECT * FROM trophies ORDER BY user_id, animal_key').all();
    const originalRows = storedRows();
    const oldSvg = await (await request(`/api/trophy-animals/generated.svg?${query}`, fixtures.member.token)).text();
    assert.match(oldSvg, /<svg/);

    await t.test('versions 0 and 1 retain their keys, original URLs and award dates', async () => {
      const response = await request('/api/trophies', fixtures.member.token);
      assert.equal(response.status, 200);
      const items = await response.json();
      assert.equal(items.length, 3);
      for (const item of items) {
        assert.ok(legacyKeys.includes(item.animalKey));
        assert.equal(item.wonAt, '2026-01-02 03:04:05');
        assert.equal(item.version, item.animalKey.startsWith('animal-') ? 0 : 1);
        assert.equal(item.imagePath, item.version === 0 ? `/assets/animals/${item.animalKey}.svg` : `/api/trophy-animals/generated.svg?${query}`);
        assert.deepEqual(item.spec, item.version === 0 ? null : Object.fromEntries(new URLSearchParams(query)));
      }
      assert.deepEqual(storedRows(), originalRows);
    });

    await t.test('only version 2 is awarded, even before collecting all legacy trophies; concurrent awards are unique', async () => {
      assert.equal((await request('/api/trophies/award-next', undefined, 'POST')).status, 401);
      const responses = await Promise.all(Array.from({ length: 12 }, () => request('/api/trophies/award-next', fixtures.member.token, 'POST')));
      const keys = new Set(legacyKeys);
      for (const response of responses) {
        assert.equal(response.status, 200);
        const { awarded } = await response.json();
        assert.equal(awarded.version, 2);
        assert.equal(awarded.imagePath, null);
        assert.ok(awarded.animalKey.startsWith('generated-v2:'));
        assert.deepEqual(awarded.spec, Object.fromEntries(new URLSearchParams(awarded.animalKey.slice('generated-v2:'.length))));
        assert.ok(!keys.has(awarded.animalKey));
        keys.add(awarded.animalKey);
      }
      const items = await (await request('/api/trophies', fixtures.member.token)).json();
      assert.equal(items.length, 15);
      assert.ok(items.slice(0, 12).every(item => item.version === 2));
      assert.deepEqual(storedRows().filter(row => legacyKeys.includes(row.animal_key)), originalRows);
      assert.deepEqual(await (await request('/api/trophies', fixtures.admin.token)).json(), []);
      const otherAward = await (await request('/api/trophies/award-next', fixtures.admin.token, 'POST')).json();
      assert.equal(otherAward.awarded.version, 2);
    });

    await t.test('all saved versions survive a backend restart without rewriting any trophy or legacy SVG', async () => {
      const before = storedRows();
      const itemsBefore = await (await request('/api/trophies', fixtures.member.token)).json();
      process.kill('SIGTERM');
      await once(process, 'exit');
      process = startBackend();
      await waitForBackend();
      assert.deepEqual(storedRows(), before);
      assert.deepEqual(await (await request('/api/trophies', fixtures.member.token)).json(), itemsBefore);
      assert.equal(await (await request(`/api/trophy-animals/generated.svg?${query}`, fixtures.member.token)).text(), oldSvg);
    });
  } finally {
    db?.close();
    if (process.exitCode === null) {
      process.kill('SIGTERM');
      await once(process, 'exit');
    }
    await rm(directory, { recursive: true, force: true });
  }
});
