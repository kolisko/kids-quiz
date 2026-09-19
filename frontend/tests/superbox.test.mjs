import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_BOX, DEFAULT_HOUSE, DEFAULT_PERSON, DEFAULT_FURNITURE, defaultDocument, boxFrame, particleFrame, totalDuration, boundPlacement, normalizePersonSpec, parseDocument, validSpec, personForKind, randomPersonSpec, saveLibraryDesign, PERSON_OPTIONS, PERSON_LABELS, PERSON_FACE_LABELS, PERSON_EYE_LABELS, PERSON_HAIR_LABELS, PERSON_TOP_LABELS, PERSON_BOTTOM_LABELS, PERSON_SHOE_LABELS } from '../src/app/superbox/superbox.model.ts';
import { personGeometry } from '../src/app/superbox/person-geometry.ts';

test('a complete workshop round trips, including rewards and arranged furniture', () => {
  const doc = defaultDocument();
  assert.deepEqual(parseDocument(JSON.stringify(doc)), doc);
  assert.ok(doc.library.some(d => d.id === doc.rewardId));
  assert.equal(new Set(doc.library.filter(d => d.kind === 'person').map(d => d.spec.kind)).size, 7);
  assert.equal(new Set(doc.library.filter(d => d.kind === 'furniture').map(d => d.spec.kind)).size, 4);
  assert.deepEqual(doc.placements.map(p => p.reward.spec.kind), ['boy', 'chair', 'toy']);
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
    doc => doc.person.hairStyle = 'unknown',
    doc => doc.person.top = 'unknown',
    doc => doc.library[0].spec.hairStyle = 'unknown',
    doc => doc.placements[0].reward.spec.bottom = 'unknown',
    doc => doc.person.face = 'unknown',
    doc => doc.person.eyes = 'unknown',
    doc => doc.person.build = 'unknown',
    doc => doc.person.shoes = 'unknown',
    doc => doc.person.topColor = 'red',
    doc => doc.person.bottomColor = 'url(bad)',
    doc => doc.person.shoeColor = '#123',
    doc => doc.person.fringe = 'yes',
    doc => doc.person.wrinkles = 101,
    doc => doc.person.facialHair = 'beard',
    doc => doc.person.top = 'bra',
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

test('every offered character combination survives serialization and obeys age and appearance rules', () => {
  for (const kind of Object.keys(PERSON_LABELS)) {
    const spec = personForKind(kind), options = PERSON_OPTIONS[kind];
    assert.ok(validSpec('person', spec), kind);
    for (const [field, choices, allowed] of [
      ['hairStyle', Object.keys(PERSON_HAIR_LABELS), options.hairStyles],
      ['top', Object.keys(PERSON_TOP_LABELS), options.tops],
      ['bottom', Object.keys(PERSON_BOTTOM_LABELS), options.bottoms],
      ['shoes', Object.keys(PERSON_SHOE_LABELS), options.shoes],
    ]) {
      for (const choice of choices) {
        const candidate = { ...spec, [field]: choice };
        assert.equal(validSpec('person', candidate), allowed.includes(choice), `${kind}/${field}/${choice}`);
        assert.ok(validSpec('person', normalizePersonSpec(candidate)));
      }
    }
    const doc = defaultDocument(); doc.person = spec;
    assert.deepEqual(parseDocument(JSON.stringify(doc)), doc);
  }
  for (const kind of ['baby', 'girl', 'boy']) {
    assert.equal(personForKind(kind).wrinkles, 0);
    assert.ok(!PERSON_OPTIONS[kind].tops.includes('bra'));
    assert.ok(!PERSON_OPTIONS[kind].shoes.includes('heels'));
  }
  for (const kind of ['boy', 'man', 'grandpa']) {
    assert.ok(!PERSON_OPTIONS[kind].bottoms.some(s => s.includes('skirt')));
    assert.ok(!PERSON_OPTIONS[kind].hairStyles.some(s => ['bun', 'buns', 'braids', 'pigtails', 'floor-length'].includes(s)));
  }
  for (const kind of ['girl', 'woman', 'grandma']) assert.ok(!PERSON_OPTIONS[kind].hairStyles.includes('mohawk'));
  for (const kind of ['grandpa', 'grandma']) assert.ok(personForKind(kind).wrinkles >= 35);
  for (const kind of ['chair', 'table', 'wardrobe', 'toy']) {
    for (const toy of ['bear', 'blocks', 'car']) assert.ok(validSpec('furniture', { ...DEFAULT_FURNITURE, kind, toy }));
  }
});

test('switching age or gender repairs incompatible choices without changing custom colors or compatible parts', () => {
  const woman = { ...personForKind('woman'), top: 'bra', bottom: 'royal-skirt', shoes: 'heels', hairStyle: 'floor-length', crown: true,
    face: 'oval', eyes: 'almond', skin: '#b98162', topColor: '#336699', bottomColor: '#223344', shoeColor: '#aabbcc' };
  for (const kind of Object.keys(PERSON_LABELS)) {
    const original = { ...woman, kind, wrinkles: 100, facialHair: 'beard' };
    const repaired = normalizePersonSpec(original);
    assert.ok(validSpec('person', repaired), kind);
    assert.deepEqual(normalizePersonSpec(repaired), repaired);
    for (const key of ['skin', 'hair', 'accent', 'topColor', 'bottomColor', 'shoeColor', 'face', 'eyes']) assert.equal(repaired[key], original[key]);
    if (kind === 'baby' || kind === 'girl' || kind === 'boy') {
      assert.equal(repaired.wrinkles, 0); assert.equal(repaired.facialHair, 'none');
    }
  }
  assert.equal(woman.top, 'bra', 'normalization must not mutate the source');
  const valid = { ...personForKind('man'), hairStyle: 'mohawk', top: 'jacket', bottom: 'shorts', shoes: 'clogs', fringe: true };
  assert.deepEqual(normalizePersonSpec(valid), valid);
});

function legacyDocument() {
  const doc = defaultDocument(); doc.version = 1;
  const legacy = { kind: 'princess', skin: '#efbe9e', hair: '#713e33', hairStyle: 'long', outfit: 'royal', clothing: '#bba1ed', accent: '#ffdc8b' };
  doc.person = { ...legacy };
  for (const design of doc.library) if (design.kind === 'person') design.spec = { ...legacy };
  for (const item of doc.placements) if (item.reward.kind === 'person') item.reward.spec = { ...legacy, kind: 'child', hairStyle: 'short', outfit: 'overalls' };
  return doc;
}

test('version 1 migration preserves every saved design, reward selection, colors and house placement', () => {
  const doc = legacyDocument();
  doc.person.kind = 'dad'; doc.person.hairStyle = 'buns';
  const mother = doc.library.find(d => d.id === 'mom');
  mother.spec.kind = 'mom'; mother.spec.hairStyle = 'short'; mother.spec.outfit = 'overalls';
  doc.rewardId = mother.id;
  const loaded = parseDocument(JSON.stringify(doc));
  assert.equal(loaded.version, 2);
  assert.equal(loaded.person.kind, 'man'); assert.equal(loaded.person.hairStyle, 'short');
  assert.equal(loaded.person.top, 'tshirt'); assert.equal(loaded.person.bottom, 'pants'); assert.equal(loaded.person.crown, false);
  const loadedMother = loaded.library.find(d => d.id === 'mom');
  assert.equal(loadedMother.spec.kind, 'woman'); assert.equal(loadedMother.spec.hairStyle, 'bob');
  assert.equal(loadedMother.spec.bottom, 'skirt');
  assert.equal(loadedMother.name, mother.name); assert.equal(loadedMother.spec.topColor, mother.spec.clothing);
  assert.equal(loaded.rewardId, doc.rewardId); assert.equal(loaded.library.length, doc.library.length); assert.equal(loaded.placements.length, doc.placements.length);
  assert.equal(loaded.library.find(d => d.id === 'princess').spec.crown, true);
  assert.equal(loaded.library.find(d => d.id === 'princess').spec.bottom, 'royal-skirt');
  assert.equal(loaded.placements[0].reward.spec.kind, 'boy');
  assert.equal(loaded.placements[0].reward.spec.bottomColor, doc.placements[0].reward.spec.accent);
  for (const key of ['id', 'name', 'x', 'y', 'size', 'flipped']) assert.equal(loaded.placements[0][key], doc.placements[0][key]);
  assert.deepEqual(parseDocument(JSON.stringify(loaded)), loaded);
});

test('migration rejects unknown old values instead of silently replacing a damaged workshop', () => {
  for (const mutate of [
    doc => doc.person.kind = 'unknown', doc => doc.person.hairStyle = 'unknown',
    doc => doc.library[0].spec.outfit = 'unknown', doc => doc.placements[0].reward.spec.skin = 'invalid',
  ]) {
    const doc = legacyDocument(); mutate(doc); assert.throws(() => parseDocument(JSON.stringify(doc)), /platný návrh/);
  }
});

test('age, face and eye geometry is distinct, finite and keeps long hair at the shared ground baseline', () => {
  const baby = personGeometry(personForKind('baby')), child = personGeometry(personForKind('boy'));
  const adult = personGeometry(personForKind('man')), older = personGeometry(personForKind('grandpa'));
  assert.ok(baby.shoulderY > child.shoulderY && child.shoulderY > adult.shoulderY);
  assert.ok(baby.headScale > adult.headScale && child.headScale > adult.headScale);
  assert.ok(older.shoulderY > adult.shoulderY);
  assert.equal(new Set(Object.keys(PERSON_FACE_LABELS).map(face => personGeometry({ ...DEFAULT_PERSON, face }).facePath)).size, 5);
  assert.equal(new Set(Object.keys(PERSON_EYE_LABELS).map(eyes => personGeometry({ ...DEFAULT_PERSON, eyes }).eyePath)).size, 5);
  for (const kind of Object.keys(PERSON_LABELS)) {
    for (const face of Object.keys(PERSON_FACE_LABELS)) {
      for (const top of PERSON_OPTIONS[kind].tops) {
        for (const bottom of PERSON_OPTIONS[kind].bottoms) {
          const g = personGeometry({ ...personForKind(kind), face, top, bottom });
          assert.doesNotMatch(JSON.stringify(g), /NaN|Infinity/);
          assert.ok(g.skirtY <= 184 && g.hipY < 179);
        }
      }
    }
  }
  for (const kind of ['girl', 'woman', 'grandma']) {
    const g = personGeometry({ ...personForKind(kind), hairStyle: 'floor-length' });
    assert.ok(Math.abs(g.headY + (g.hairEnd - 62) * g.headScale - 183) < .001);
  }
});


test('random people cover every type and always obey appearance rules and round-trip validation', () => {
  let seed = 0x5eeda11;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
  const types = new Set(), appearances = new Set();
  for (let i = 0; i < 1000; i++) {
    const person = randomPersonSpec(random);
    assert.ok(validSpec('person', person), JSON.stringify(person));
    types.add(person.kind); appearances.add(JSON.stringify(person));
    const doc = defaultDocument(); doc.person = person;
    assert.deepEqual(parseDocument(JSON.stringify(doc)).person, person);
  }
  assert.deepEqual([...types].sort(), Object.keys(PERSON_LABELS).sort());
  assert.equal(appearances.size, 1000);
  for (const boundary of [0, 1 - Number.EPSILON]) assert.ok(validSpec('person', randomPersonSpec(() => boundary)));
});


test('editing saved designs replaces the same entry for every editor without changing rewards or house copies', () => {
  for (const kind of ['person', 'furniture', 'box', 'house']) {
    let doc = defaultDocument();
    const created = saveLibraryDesign(doc, kind, 'Original');
    doc = created.document;
    if (kind === 'person' || kind === 'furniture') doc.rewardId = created.design.id;
    const libraryBefore = structuredClone(doc.library), placementsBefore = structuredClone(doc.placements);
    const previousLength = doc.library.length;
    if (kind === 'person') doc.person = { ...personForKind('man'), top: 'hoodie' };
    if (kind === 'furniture') doc.furniture = { ...doc.furniture, color: '#123456' };
    if (kind === 'box') doc.box = { ...doc.box, ribbon: '#123456' };
    if (kind === 'house') doc.house = { ...doc.house, wall: '#123456' };
    const updated = saveLibraryDesign(doc, kind, ' Updated ', created.design.id);
    assert.equal(updated.document.library.length, previousLength);
    assert.equal(updated.design.id, created.design.id);
    assert.equal(updated.design.name, 'Updated');
    assert.deepEqual(updated.design.spec, doc[kind]);
    assert.notEqual(updated.design.spec, doc[kind]);
    assert.deepEqual(doc.library, libraryBefore, 'the previous library must not be mutated');
    assert.deepEqual(updated.document.placements, placementsBefore);
    assert.equal(updated.document.rewardId, doc.rewardId);
    assert.deepEqual(parseDocument(JSON.stringify(updated.document)), updated.document);
    const copy = saveLibraryDesign(updated.document, kind, 'Copy');
    assert.notEqual(copy.design.id, updated.design.id);
    assert.equal(copy.document.library.length, previousLength + 1);
    assert.deepEqual(copy.document.library.find(d => d.id === updated.design.id), updated.design);
  }
});

test('full libraries can update existing entries but cannot silently add more copies', () => {
  const doc = defaultDocument();
  const source = doc.library[0];
  doc.library = Array.from({ length: 100 }, (_, i) => ({ ...structuredClone(source), id: i ? `design-${i}` : source.id }));
  assert.equal(saveLibraryDesign(doc, 'person', 'Updated', source.id).document.library.length, 100);
  assert.throws(() => saveLibraryDesign(doc, 'person', 'Copy'), /100 návrhů/);
});

test('invalid update targets and empty names never overwrite or duplicate a saved design', () => {
  const doc = defaultDocument(), before = structuredClone(doc);
  assert.throws(() => saveLibraryDesign(doc, 'person', 'Updated', 'missing'), /Původní návrh/);
  assert.throws(() => saveLibraryDesign(doc, 'box', 'Updated', 'princess'), /Původní návrh/);
  assert.throws(() => saveLibraryDesign(doc, 'person', '  ', 'princess'), /Pojmenujte/);
  assert.deepEqual(doc, before);
});
