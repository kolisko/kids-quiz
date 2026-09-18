import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_BOX, DEFAULT_HOUSE, DEFAULT_PERSON, DEFAULT_FURNITURE, defaultDocument, boxFrame, particleFrame, totalDuration, boundPlacement, parseDocument, validSpec } from '../src/app/superbox/superbox.model.ts';

test('a complete workshop round trips, including rewards and arranged furniture', () => {
  const doc = defaultDocument();
  assert.deepEqual(parseDocument(JSON.stringify(doc)), doc);
  assert.ok(doc.library.some(d => d.id === doc.rewardId));
  assert.equal(new Set(doc.library.filter(d => d.kind === 'person').map(d => d.spec.kind)).size, 4);
  assert.equal(new Set(doc.library.filter(d => d.kind === 'furniture').map(d => d.spec.kind)).size, 4);
});

test('the gift waits, inflates, bursts exactly once, and leaves a persistent reward', () => {
  for (const inflation of ['puff', 'spin', 'wobble', 'bounce']) {
    for (const delay of [0, 800, 3000]) {
      const spec = { ...DEFAULT_BOX, inflation, delay };
      assert.equal(boxFrame(spec, 0).phase, 'waiting');
      assert.equal(boxFrame(spec, delay + 1).phase, 'inflating');
      assert.equal(boxFrame(spec, delay + spec.duration - 1).opened, false);
      assert.equal(boxFrame(spec, delay + spec.duration).phase, 'burst');
      assert.equal(boxFrame(spec, totalDuration(spec)).phase, 'reward');
      assert.equal(boxFrame(spec, totalDuration(spec) * 20).phase, 'reward');
      for (let elapsed = 0; elapsed < totalDuration(spec); elapsed += 13) {
        assert.doesNotMatch(boxFrame(spec, elapsed).transform, /NaN|Infinity/);
      }
      assert.equal(boxFrame(spec, 0).opened, false, 'replay starts closed');
    }
  }
});

test('every effect finishes without particles obscuring the reward and is seekable', () => {
  for (const bubbles of [true, false]) {
    for (let i = 0; i < 80; i++) {
      assert.equal(particleFrame(i, 80, 0, bubbles).opacity, 0);
      assert.equal(particleFrame(i, 80, 1, bubbles).opacity, 0);
      assert.deepEqual(particleFrame(i, 80, .4, bubbles), particleFrame(i, 80, .4, bubbles));
      assert.ok(particleFrame(i, 80, .4, bubbles).opacity > 0);
    }
  }
});

test('dragging and resizing keep the whole item within the house at all supported sizes', () => {
  for (const size of [10, 19, 28, -10, 200]) {
    for (const x of [-900, 0, 50, 100, 900]) {
      for (const y of [-900, 0, 50, 100, 900]) {
        const bounded = boundPlacement({ ...defaultDocument().placements[0], size, x, y }, DEFAULT_HOUSE);
        assert.ok(bounded.x - bounded.size / 2 >= 10);
        assert.ok(bounded.x + bounded.size / 2 <= 90);
        assert.ok(bounded.y - bounded.size / 2 >= 28);
        assert.ok(bounded.y + bounded.size / 2 <= 93);
      }
    }
  }
});

test('imports reject invalid parameters, missing rewards, duplicate ids and oversized libraries', () => {
  const invalidMutations = [
    doc => doc.box.color = 'url(https://example.com)',
    doc => doc.box.duration = 0,
    doc => doc.box.particles = 30000,
    doc => doc.house.floors = 0,
    doc => doc.house.rooms = 1.5,
    doc => doc.house.cost = -10,
    doc => doc.person.kind = 'unknown',
    doc => doc.rewardId = 'missing',
    doc => doc.fumfiks = null,
    doc => doc.library.push(doc.library[0]),
    doc => doc.placements.push(doc.placements[0]),
    doc => doc.placements[0].reward.kind = 'house',
    doc => doc.placements = Array.from({ length: 41 }, (_, i) => ({ ...doc.placements[0], id: String(i) })),
    doc => doc.library = Array.from({ length: 101 }, (_, i) => ({ ...doc.library[0], id: String(i) })),
  ];
  for (const mutate of invalidMutations) {
    const doc = defaultDocument(); mutate(doc);
    assert.throws(() => parseDocument(JSON.stringify(doc)), /platný návrh/);
  }
  for (const json of ['{broken', 'null', '[]', '{}', ' '.repeat(600001)]) assert.throws(() => parseDocument(json));
});

test('importing valid but off-canvas placements repairs their positions', () => {
  const doc = defaultDocument();
  doc.placements[0].x = 0; doc.placements[0].y = 100;
  const loaded = parseDocument(JSON.stringify(doc));
  assert.ok(loaded.placements[0].x >= 10 + loaded.placements[0].size / 2);
  assert.ok(loaded.placements[0].y <= 93 - loaded.placements[0].size / 2);
});

test('all editor variants are serializable valid specs', () => {
  for (const kind of ['child', 'princess', 'dad', 'mom']) {
    for (const outfit of ['casual', 'dress', 'overalls', 'royal']) assert.ok(validSpec('person', { ...DEFAULT_PERSON, kind, outfit }));
  }
  for (const kind of ['chair', 'table', 'wardrobe', 'toy']) {
    for (const toy of ['bear', 'blocks', 'car']) assert.ok(validSpec('furniture', { ...DEFAULT_FURNITURE, kind, toy }));
  }
  for (const kind of ['cottage', 'townhouse', 'castle']) {
    for (const floors of [1, 2, 3]) assert.ok(validSpec('house', { ...DEFAULT_HOUSE, kind, floors }));
  }
});
