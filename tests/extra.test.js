// T-13: one additional dish in the running week.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TODAY, seeded, library, bigLibrary } from './helpers.js';
import { suggestExtra, DEFAULT_SETTINGS } from '../src/logic/suggest.js';

function ctx(dishes, over = {}) {
  return { dishes, today: TODAY, settings: DEFAULT_SETTINGS, cat: 'Fisch', kindSel: 'egal', planIds: [], shown: [], ...over };
}
const byId = (dishes) => (id) => dishes.find((d) => d.id === id);

test('T-13 kindgerecht "ja" gives only kindgerecht dishes of the chosen category', () => {
  const dishes = bigLibrary();
  const r = suggestExtra(ctx(dishes, { kindSel: 'ja' }), seeded(1));
  assert.equal(r.ids.length, 3);
  for (const id of r.ids) {
    assert.equal(byId(dishes)(id).cat, 'Fisch');
    assert.equal(byId(dishes)(id).kind, true);
  }
  assert.equal(r.hintLevel, 0);
});

test('T-13 kindgerecht "nein" gives only dishes that are not kindgerecht', () => {
  const dishes = bigLibrary();
  const r = suggestExtra(ctx(dishes, { kindSel: 'nein' }), seeded(2));
  for (const id of r.ids) assert.equal(byId(dishes)(id).kind, false);
});

test('T-13 "egal" allows both', () => {
  const dishes = bigLibrary();
  const seen = new Set();
  for (let s = 1; s <= 40; s++) suggestExtra(ctx(dishes), seeded(s)).ids.forEach((id) => seen.add(byId(dishes)(id).kind));
  assert.equal(seen.size, 2);
});

test('T-13 dishes already in the plan are not offered, and the weekly targets play no role', () => {
  const dishes = bigLibrary();
  const planIds = dishes.filter((d) => d.cat === 'Fisch').slice(0, 8).map((d) => d.id);
  const r = suggestExtra(ctx(dishes, { planIds }), seeded(3));
  for (const id of r.ids) assert.ok(!planIds.includes(id));
  assert.equal('targets' in ctx(dishes), false);
});

test('T-13 asking for new suggestions avoids the ones already shown', () => {
  const dishes = bigLibrary();
  const rng = seeded(4);
  const first = suggestExtra(ctx(dishes), rng);
  const second = suggestExtra(ctx(dishes, { shown: first.ids }), rng);
  for (const id of second.ids) assert.ok(!first.ids.includes(id));
});

test('T-13 same fallback as in the weekly plan: cooldown first, then the kindgerecht choice', () => {
  const inCooldown = library([['Fisch', true, 3], ['Fisch', true, 5], ['Fisch', true, 9], ['Fisch', false, 40], ['Fisch', false, 50]]);
  const r1 = suggestExtra(ctx(inCooldown, { kindSel: 'ja' }), seeded(1));
  assert.equal(r1.hintLevel, 1);
  assert.equal(r1.ids.length, 3);
  const noKind = library([['Fisch', false, 30], ['Fisch', false, 40], ['Fisch', false, 50]]);
  const r2 = suggestExtra(ctx(noKind, { kindSel: 'ja' }), seeded(1));
  assert.equal(r2.hintLevel, 2);
  assert.equal(r2.ids.length, 3);
});

test('T-13 the category is never relaxed', () => {
  const dishes = library([['Fleisch', false, 30], ['Vegetarisch', false, 40]]);
  const r = suggestExtra(ctx(dishes), seeded(1));
  assert.deepEqual(r.ids, []);
});
