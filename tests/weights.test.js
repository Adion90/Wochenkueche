// T-03 to T-06: cooldown (Sperrfrist), weighting, cap (Deckel), never-cooked dishes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TODAY, seeded, dish } from './helpers.js';
import { weight, drawWeighted, inSperrfrist, DEFAULT_SETTINGS } from '../src/logic/suggest.js';

test('T-03 a dish cooked less than 14 days ago is in the cooldown, 14 days is free', () => {
  assert.equal(inSperrfrist(dish('a', 'Fleisch', { gap: 13 }), TODAY), true);
  assert.equal(inSperrfrist(dish('b', 'Fleisch', { gap: 14 }), TODAY), false);
  assert.equal(inSperrfrist(dish('c', 'Fleisch', { gap: null }), TODAY), false);
});

test('T-04 older dishes are drawn clearly more often (about 14 %, 29 %, 57 %)', () => {
  const pool = [dish('a', 'Fleisch', { gap: 15 }), dish('b', 'Fleisch', { gap: 30 }), dish('c', 'Fleisch', { gap: 60 })];
  const rng = seeded(42);
  const count = { a: 0, b: 0, c: 0 };
  const runs = 10000;
  for (let i = 0; i < runs; i++) {
    const [picked] = drawWeighted(pool, 1, TODAY, DEFAULT_SETTINGS, rng);
    count[picked.name]++;
  }
  const share = (k) => count[k] / runs;
  assert.ok(Math.abs(share('a') - 15 / 105) < 0.02, `15 days: ${share('a')}`);
  assert.ok(Math.abs(share('b') - 30 / 105) < 0.02, `30 days: ${share('b')}`);
  assert.ok(Math.abs(share('c') - 60 / 105) < 0.02, `60 days: ${share('c')}`);
});

test('T-05 the weight stops growing at the cap of 60 days', () => {
  assert.equal(weight(dish('a', 'Fleisch', { gap: 200 }), TODAY), 60);
  assert.equal(weight(dish('b', 'Fleisch', { gap: 60 }), TODAY), 60);
  assert.equal(weight(dish('c', 'Fleisch', { gap: 59 }), TODAY), 59);

  const pool = [dish('old', 'Fleisch', { gap: 200 }), dish('cap', 'Fleisch', { gap: 60 })];
  const rng = seeded(7);
  let old = 0;
  for (let i = 0; i < 10000; i++) {
    if (drawWeighted(pool, 1, TODAY, DEFAULT_SETTINGS, rng)[0].name === 'old') old++;
  }
  assert.ok(Math.abs(old / 10000 - 0.5) < 0.02, `share of the 200-day dish: ${old / 10000}`);
});

test('T-06 a dish without history gets the highest weight', () => {
  assert.equal(weight(dish('n', 'Fisch', { gap: null }), TODAY), 60);
  assert.equal(weight(dish('n', 'Fisch', { gap: null }), TODAY), weight(dish('o', 'Fisch', { gap: 500 }), TODAY));
});

test('drawing never returns the same dish twice and never more than available', () => {
  const pool = [dish('a', 'Fleisch', { gap: 20 }), dish('b', 'Fisch', { gap: 30 })];
  const out = drawWeighted(pool, 3, TODAY, DEFAULT_SETTINGS, seeded(1));
  assert.equal(out.length, 2);
  assert.notEqual(out[0].id, out[1].id);
});
