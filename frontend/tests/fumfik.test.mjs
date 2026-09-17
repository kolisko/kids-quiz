import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loginFumfikDestination } from '../src/app/fumfik/login-fumfik-motion.ts';
import { FUMFIK_OPTIONS, FUMFIK_REACTIONS, BODY_GEOMETRY, REST_POSE, DEFAULT_FUMFIK, earTransform, eyeGeometry, headGeometry, mouthGeometry, noseTransform, randomReaction, reactionPose, reactionTarget, specQuery } from '../src/app/fumfik-v2/fumfik.model.ts';

const REACTIONS = ['wink-right', 'wink-left', 'blink', 'smile', 'surprise', 'wiggle-ears', 'grow-nose', 'tongue-out', 'shake-head', 'nod-head', 'hop', 'puff', 'spin'];

test('login movement stays onscreen and its entire corridor avoids login and leaderboard panels', () => {
  let seed = 37;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const viewport = { width: 1280, height: 840 };
  const obstacles = [{ left: 450, top: 200, width: 380, height: 390 }];
  const occupied = [{ left: 80, top: 450, width: 150, height: 150 }];
  let current = { left: 70, top: 90, width: 150, height: 150 };
  let moved = 0;
  for (let i = 0; i < 100; i++) {
    const pointer = { x: current.left + 75, y: current.top + 75 };
    const delta = loginFumfikDestination(current, viewport, obstacles, pointer, random, occupied);
    if (!delta) continue;
    moved++;
    assert.ok(Math.hypot(delta.x, delta.y) >= 97.5);
    const target = { ...current, left: current.left + delta.x, top: current.top + delta.y };
    assert.ok(target.left >= 18 && target.top >= 18);
    assert.ok(target.left + target.width <= viewport.width - 18);
    assert.ok(target.top + target.height <= viewport.height - 18);
    assert.ok(target.left + target.width <= 72 || target.left >= 238 || target.top + target.height <= 442 || target.top >= 608);
    for (let frame = 0; frame <= 100; frame++) {
      const left = current.left + delta.x * frame / 100;
      const top = current.top + delta.y * frame / 100;
      assert.ok(left + current.width <= 432 || left >= 848 || top + current.height <= 182 || top >= 608);
    }
    assert.ok(pointer.x < target.left - 25 || pointer.x > target.left + target.width + 25
      || pointer.y < target.top - 25 || pointer.y > target.top + target.height + 25);
    current = target;
  }
  assert.ok(moved > 50);
});

test('login stays put when there is no safe movement space', () => {
  const rect = { left: 20, top: 20, width: 100, height: 100 };
  assert.equal(loginFumfikDestination(rect, { width: 90, height: 90 }, [], { x: 30, y: 30 }), null);
  assert.equal(loginFumfikDestination(rect, { width: 390, height: 844 }, [{ left: 0, top: 0, width: 390, height: 844 }], { x: 30, y: 30 }), null);
});

test('random taps can select every lab reaction without repeating the previous one', () => {
  assert.deepEqual(FUMFIK_REACTIONS, REACTIONS);
  for (const previous of [undefined, ...REACTIONS]) {
    const choices = new Set(Array.from({ length: 100 }, (_, i) => randomReaction(previous, () => i / 100)));
    assert.deepEqual([...choices].sort(), REACTIONS.filter(reaction => reaction !== previous).sort());
  }
  for (const previous of REACTIONS) {
    const choices = Array.from({ length: 100 }, (_, i) => randomReaction(previous, () => i / 100, true));
    assert.ok(choices.every(reaction => ['wink-right', 'wink-left', 'blink', 'smile'].includes(reaction) && reaction !== previous));
  }
});

test('all existing backend parameter values remain available in the experimental component', () => {
  const kotlin = readFileSync(new URL('../../backend/src/main/kotlin/com/example/quiz/TrophyAnimals.kt', import.meta.url), 'utf8');
  for (const [name, values] of Object.entries(FUMFIK_OPTIONS)) {
    const enumName = `TrophyAnimal${name[0].toUpperCase()}${name.slice(1)}`;
    const source = kotlin.match(new RegExp(`enum class ${enumName} \\{([^}]+)\\}`))[1];
    assert.deepEqual(values, source.split(',').map(value => value.trim()).filter(Boolean));
  }
});

test('an appearance is reproducible from its seven explicit URL parameters', () => {
  assert.deepEqual(Object.fromEntries(new URLSearchParams(specQuery(DEFAULT_FUMFIK))), DEFAULT_FUMFIK);
});

test('right wink affects only the character right eye, completely closes it, then returns to rest', () => {
  assert.deepEqual(reactionPose('wink-right', 0), REST_POSE);
  const peak = reactionPose('wink-right', .45);
  assert.equal(peak.rightBlink, 1);
  assert.equal(peak.leftBlink, 0);
  for (const kind of FUMFIK_OPTIONS.eyes) {
    const closed = eyeGeometry(kind, peak.rightBlink, 0);
    assert.equal(closed.openness, 0);
    assert.equal(closed.highlight, 0);
  }
  assert.deepEqual(reactionPose('wink-right', 1), REST_POSE);
});

test('all reactions have a smooth attack and recovery, including interruption by another reaction', () => {
  for (const reaction of REACTIONS) {
    const start = reactionTarget('surprise');
    assert.deepEqual(reactionPose(reaction, 0, 1, start), start);
    assert.deepEqual(reactionPose(reaction, 1, 1, start), REST_POSE);
    let previous = start;
    for (let i = 1; i <= 1000; i++) {
      const pose = reactionPose(reaction, i / 1000, 1, start);
      for (const key of Object.keys(REST_POSE)) {
        assert.ok(pose[key] >= (['earWiggle', 'headShake', 'headNod'].includes(key) ? -1 : 0) && pose[key] <= 1);
        const delta = Math.abs(pose[key] - previous[key]);
        assert.ok((key === 'turn' ? Math.min(delta, 1 - delta) : delta) < .06);
      }
      previous = pose;
    }
  }
});

test('yes and no use distinct axes and repeat their movement before settling', () => {
  for (const [reaction, field] of [['shake-head', 'headShake'], ['nod-head', 'headNod']]) {
    const frames = Array.from({ length: 101 }, (_, i) => reactionPose(reaction, i / 100));
    assert.ok(Math.min(...frames.map(pose => pose[field])) < -.7);
    assert.ok(Math.max(...frames.map(pose => pose[field])) > .7);
    const full = reactionPose(reaction, .4);
    assert.equal(reactionPose(reaction, .4, .5)[field], full[field] / 2);
    const head = headGeometry(full);
    if (reaction === 'shake-head') {
      assert.notEqual(head.x, 200);
      assert.notEqual(head.faceX, 0);
      assert.equal(head.faceY, 0);
    } else {
      assert.equal(head.rotation, 0);
      assert.equal(head.faceX, 0);
      assert.notEqual(head.faceY, 0);
      assert.ok(head.scaleY < 1);
    }
  }
});

test('hop lifts the complete head, changes its ground shadow and lands at its original position', () => {
  const resting = headGeometry(REST_POSE);
  const peak = headGeometry(reactionPose('hop', .5));
  assert.equal(peak.x, resting.x);
  assert.equal(peak.y, resting.y - 40);
  assert.ok(peak.shadowRadius < resting.shadowRadius);
  assert.ok(peak.shadowOpacity < resting.shadowOpacity);
  assert.deepEqual(headGeometry(reactionPose('hop', 1)), resting);
});

test('puff expands around the same center, then fully deflates', () => {
  const peak = headGeometry(reactionPose('puff', .45));
  assert.equal(peak.x, 200);
  assert.equal(peak.y, 200);
  assert.equal(peak.scaleX, 1.2);
  assert.equal(peak.scaleY, 1.2);
  assert.deepEqual(headGeometry(reactionPose('puff', 1)), headGeometry(REST_POSE));
});

test('spin makes one forward 360-degree rotation without rotating backwards on recovery', () => {
  for (const intensity of [.2, .5, 1]) {
    let previous = 0;
    for (let i = 1; i < 1000; i++) {
      const angle = headGeometry(reactionPose('spin', i / 1000, intensity)).rotation;
      assert.ok(angle > previous);
      previous = angle;
    }
    assert.ok(previous > 359.99);
    assert.deepEqual(reactionPose('spin', 1, intensity), REST_POSE);
    assert.equal(headGeometry(reactionPose('spin', .5, intensity)).rotation, 180);
  }
});

test('a new reaction starts from the current complete pose, even during a head movement', () => {
  for (const first of REACTIONS) {
    const current = reactionPose(first, .4);
    for (const next of REACTIONS) {
      assert.deepEqual(reactionPose(next, 0, 1, current), current);
      assert.deepEqual(reactionPose(next, 1, 1, current), REST_POSE);
      const head = headGeometry(reactionPose(next, .2, 1, current));
      assert.ok(!/NaN|Infinity/.test(head.transform));
      assert.ok(head.scaleX > 0 && head.scaleY > 0);
    }
  }
});

test('ear wiggle moves both ways, keeps its attachment pivot and respects intensity', () => {
  const frames = Array.from({ length: 101 }, (_, i) => reactionPose('wiggle-ears', i / 100).earWiggle);
  assert.ok(Math.min(...frames) < -.7);
  assert.ok(Math.max(...frames) > .7);
  const full = reactionPose('wiggle-ears', .4);
  assert.equal(reactionPose('wiggle-ears', .4, .5).earWiggle, full.earWiggle / 2);
  for (const ears of FUMFIK_OPTIONS.ears) {
    assert.notEqual(earTransform(ears, full), earTransform(ears, REST_POSE));
    assert.ok(earTransform(ears, full).endsWith(ears === 'floppy' ? '0 6)' : '0 26)'));
  }
});

test('enlarging the original nose leaves space for every mouth and returns to its original size', () => {
  assert.equal(noseTransform(REST_POSE), 'translate(0 35) scale(1)');
  assert.equal(noseTransform(reactionTarget('grow-nose')), 'translate(0 37) scale(1.8)');
  for (const kind of FUMFIK_OPTIONS.mouth) {
    for (let i = 0; i <= 100; i++) {
      const pose = reactionPose('grow-nose', i / 100);
      const mouth = mouthGeometry(kind, pose);
      const noseBottom = 35 + pose.noseGrowth * 2 + 18 * (1 + pose.noseGrowth * .8);
      assert.ok(mouth.offset + Math.min(0, mouth.top) - 2 > noseBottom);
      for (const rig of Object.values(BODY_GEOMETRY)) {
        assert.ok(rig.faceY + (mouth.offset + mouth.bottom * .75 + 2) * rig.scale < 312);
      }
    }
  }
});

test('the existing mouth opens for a single protruding tongue with continuous geometry', () => {
  for (const kind of FUMFIK_OPTIONS.mouth) {
    const rest = mouthGeometry(kind, REST_POSE);
    const out = mouthGeometry(kind, reactionTarget('tongue-out'));
    assert.ok(out.bottom > out.top);
    assert.equal(out.teeth, 0);
    assert.equal(out.tongue, 1);
    assert.equal(out.tongueOut, 1);
    assert.notEqual(rest.tonguePath, out.tonguePath);
    assert.notEqual(rest.tongueExtension, out.tongueExtension);
    for (let i = 0; i <= 100; i++) {
      const geometry = mouthGeometry(kind, reactionPose('tongue-out', i / 100));
      assert.equal(geometry.tonguePath.match(/[MQLCZ]/g).join(''), 'MQLCZ');
      assert.ok(!/NaN|Infinity/.test(geometry.tonguePath));
    }
    assert.deepEqual(mouthGeometry(kind, reactionPose('tongue-out', 1)), rest);
  }
});

test('eye and mouth paths retain their topology throughout animation; facial features stay separated', () => {
  for (const body of Object.values(BODY_GEOMETRY)) {
    for (const mouth of FUMFIK_OPTIONS.mouth) {
      for (let i = 0; i <= 10; i++) {
        const pose = reactionPose('surprise', i / 10);
        const geometry = mouthGeometry(mouth, pose);
        assert.equal((geometry.path.match(/[MCZ]/g) ?? []).join(''), 'MCCZ');
        assert.ok(!/NaN|Infinity/.test(geometry.path));
        // Nose ends at y=53; the mouth's highest control point stays below it.
        assert.ok(78 + geometry.top > 53);
        assert.ok(body.faceY + (78 + geometry.bottom + 2) * body.scale < 312);
      }
    }
  }
  for (const eyes of FUMFIK_OPTIONS.eyes) {
    const rest = eyeGeometry(eyes, 0, 0).path.match(/[MLZ]/g).join('');
    for (let i = 0; i <= 10; i++) assert.equal(eyeGeometry(eyes, i / 10, 0).path.match(/[MLZ]/g).join(''), rest);
  }
});
