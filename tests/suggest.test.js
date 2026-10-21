// T-07 to T-12: day by day suggestions for the weekly plan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TODAY, seeded, dish, library, bigLibrary } from './helpers.js';
import { suggestForDay, sperrHint, DEFAULT_SETTINGS } from '../src/logic/suggest.js';

function ctx(dishes, over = {}) {
  return {
    dishes,
    today: TODAY,
    settings: DEFAULT_SETTINGS,
    days: 5,
    targets: { Fleisch: 2, Fisch: 0, Vegetarisch: 1 },
    kind: 3,
    chosen: [],
    shown: [],
    ...over,
  };
}
const byId = (dishes) => (id) => dishes.find((d) => d.id === id);

test('T-07 three different dishes are suggested per day', () => {
  const dishes = bigLibrary();
  const r = suggestForDay(ctx(dishes), seeded(1));
  assert.equal(r.ids.length, 3);
  assert.equal(new Set(r.ids).size, 3);
  assert.equal(r.hintLevel, 0);
});

test('T-07 asking for three new suggestions does not repeat the shown ones', () => {
  const dishes = bigLibrary();
  const rng = seeded(2);
  const first = suggestForDay(ctx(dishes), rng);
  const second = suggestForDay(ctx(dishes, { shown: first.ids }), rng);
  assert.equal(second.ids.length, 3);
  for (const id of second.ids) assert.ok(!first.ids.includes(id), 'repeated dish ' + id);
});

test('T-07 dishes already chosen this week are never suggested again', () => {
  const dishes = bigLibrary();
  const chosen = dishes.slice(0, 4).map((d) => d.id);
  const r = suggestForDay(ctx(dishes, { chosen }), seeded(3));
  for (const id of r.ids) assert.ok(!chosen.includes(id));
});

test('T-08 when as many category dishes are missing as days are left, only that category appears', () => {
  const dishes = bigLibrary();
  const find = (cat, kind) => dishes.find((d) => d.cat === cat && d.kind === kind);
  // 3 of 5 days are chosen (Fisch, Vegetarisch, Vegetarisch), 2 Fleisch are still missing, 2 days left
  const chosen = [find('Fisch', false).id, find('Vegetarisch', false).id, dishes.filter((d) => d.cat === 'Vegetarisch' && !d.kind)[1].id];
  for (let seed = 1; seed <= 20; seed++) {
    const r = suggestForDay(ctx(dishes, { chosen, kind: 0 }), seeded(seed));
    assert.equal(r.hintLevel, 0);
    for (const id of r.ids) assert.equal(byId(dishes)(id).cat, 'Fleisch');
  }
});

test('T-08 with one Fleisch and one Vegetarisch missing on 2 days, only those two categories appear', () => {
  const dishes = bigLibrary();
  const find = (cat) => dishes.filter((d) => d.cat === cat && !d.kind);
  const chosen = [find('Fisch')[0].id, find('Fisch')[1].id, find('Fisch')[2].id];
  for (let seed = 1; seed <= 20; seed++) {
    const r = suggestForDay(ctx(dishes, { chosen, kind: 0, targets: { Fleisch: 1, Fisch: 0, Vegetarisch: 1 } }), seeded(seed));
    for (const id of r.ids) assert.notEqual(byId(dishes)(id).cat, 'Fisch');
  }
});

test('T-09 once the kindgerecht number is reached, only non-kindgerecht dishes appear', () => {
  const dishes = bigLibrary();
  const kindDishes = dishes.filter((d) => d.kind);
  const chosen = [kindDishes[0].id, kindDishes[1].id];
  for (let seed = 1; seed <= 20; seed++) {
    const r = suggestForDay(ctx(dishes, { chosen, kind: 2, targets: { Fleisch: 0, Fisch: 0, Vegetarisch: 0 } }), seeded(seed));
    assert.equal(r.hintLevel, 0);
    for (const id of r.ids) assert.equal(byId(dishes)(id).kind, false);
  }
});

test('T-09 when as many kindgerecht dishes are missing as days are left, only kindgerecht dishes appear', () => {
  const dishes = bigLibrary();
  const nonKind = dishes.filter((d) => !d.kind);
  const kindDishes = dishes.filter((d) => d.kind);
  // days 5, kind 3: two non-kind and zero kind chosen -> 3 left, 3 kind needed
  const chosen = [nonKind[0].id, nonKind[1].id];
  for (let seed = 1; seed <= 20; seed++) {
    const r = suggestForDay(ctx(dishes, { chosen, kind: 3, targets: { Fleisch: 0, Fisch: 0, Vegetarisch: 0 } }), seeded(seed));
    assert.equal(r.hintLevel, 0);
    for (const id of r.ids) assert.equal(byId(dishes)(id).kind, true);
  }
  assert.ok(kindDishes.length > 3);
});

test('T-10 overlapping rules (2 Fleisch, 1 Vegetarisch, 4 kindgerecht in 5 days) always work out', () => {
  const dishes = bigLibrary();
  for (let seed = 1; seed <= 200; seed++) {
    const rng = seeded(seed);
    const chosen = [];
    for (let day = 0; day < 5; day++) {
      const r = suggestForDay(ctx(dishes, { chosen, kind: 4, days: 5, targets: { Fleisch: 2, Fisch: 0, Vegetarisch: 1 } }), rng);
      assert.equal(r.hintLevel, 0, `seed ${seed} day ${day} needed a fallback`);
      assert.ok(r.ids.length >= 1);
      chosen.push(r.ids[Math.floor(rng() * r.ids.length)]);
    }
    const picked = chosen.map(byId(dishes));
    assert.equal(new Set(chosen).size, 5);
    assert.ok(picked.filter((d) => d.cat === 'Fleisch').length >= 2, `seed ${seed}: Fleisch`);
    assert.ok(picked.filter((d) => d.cat === 'Vegetarisch').length >= 1, `seed ${seed}: Vegetarisch`);
    assert.equal(picked.filter((d) => d.kind).length, 4, `seed ${seed}: kindgerecht`);
  }
});

test('T-11 fallback step 1: the cooldown is lifted first, longest pause first', () => {
  const dishes = [
    ...library([['Fleisch', false, 5], ['Fleisch', false, 8], ['Fleisch', false, 6], ['Fleisch', false, 7]]),
    ...library([['Fisch', false, 40], ['Vegetarisch', false, 50]]),
  ];
  const r = suggestForDay(ctx(dishes, { days: 2, kind: 0, targets: { Fleisch: 2, Fisch: 0, Vegetarisch: 0 } }), seeded(5));
  assert.equal(r.hintLevel, 1);
  assert.ok(r.hint.length > 0);
  assert.equal(r.ids.length, 3);
  const picked = r.ids.map((id) => byId(dishes)(id));
  assert.ok(picked.every((d) => d.cat === 'Fleisch'));
  // longest pause first = oldest date first: the dishes cooked 8, 7 and 6 days ago
  assert.deepEqual(picked.map((d) => d.lastCooked), ['2026-10-15', '2026-10-16', '2026-10-17']);
});

test('T-11 fallback step 2: then the kindgerecht number is relaxed', () => {
  const dishes = library([['Fleisch', false, 30], ['Fleisch', false, 40], ['Fisch', false, 50], ['Vegetarisch', false, 60]]);
  const r = suggestForDay(ctx(dishes, { days: 1, kind: 1, targets: { Fleisch: 0, Fisch: 0, Vegetarisch: 0 } }), seeded(5));
  assert.equal(r.hintLevel, 2);
  assert.equal(r.ids.length, 3);
  // longest pause first: 60, 50, 40 days
  assert.deepEqual(r.ids.map((id) => byId(dishes)(id).lastCooked), ['2026-08-24', '2026-09-03', '2026-09-13']);
});

test('T-11 fallback step 3: finally the category is relaxed', () => {
  const dishes = library([['Fleisch', false, 30], ['Fisch', false, 40], ['Vegetarisch', false, 50], ['Vegetarisch', false, 60]]);
  const r = suggestForDay(ctx(dishes, { days: 2, kind: 0, targets: { Fleisch: 2, Fisch: 0, Vegetarisch: 0 } }), seeded(5));
  assert.equal(r.hintLevel, 3);
  assert.ok(r.ids.length >= 1);
});

test('T-11 when nothing is missing there is no hint', () => {
  const r = suggestForDay(ctx(bigLibrary()), seeded(9));
  assert.equal(r.hintLevel, 0);
  assert.equal(r.hint, '');
});

test('T-12 a dish in the cooldown can be chosen by hand and shows a hint', () => {
  const d = dish('Pizza', 'Vegetarisch', { gap: 5 });
  assert.equal(sperrHint(d, TODAY), 'zuletzt vor 5 Tagen gekocht');
  assert.equal(sperrHint(dish('Alt', 'Fleisch', { gap: 30 }), TODAY), null);
  assert.equal(sperrHint(dish('Neu', 'Fleisch', { gap: null }), TODAY), null);
});

test('T-12 after hand-picked dishes make a target unreachable, suggestions still work without a warning', () => {
  const dishes = bigLibrary();
  const veg = dishes.filter((d) => d.cat === 'Vegetarisch' && !d.kind);
  // 3 days, 2 Fleisch wanted, but 2 Vegetarisch picked by hand -> only 1 day left, 2 Fleisch impossible
  const chosen = [veg[0].id, veg[1].id];
  const r = suggestForDay(ctx(dishes, { days: 3, kind: 0, chosen, targets: { Fleisch: 2, Fisch: 0, Vegetarisch: 0 } }), seeded(4));
  assert.equal(r.hintLevel, 0, 'no warning: the targets are simply no longer enforced');
  assert.equal(r.ids.length, 3);
});

test('no suggestions are returned once all days are chosen', () => {
  const dishes = bigLibrary();
  const chosen = dishes.slice(0, 5).map((d) => d.id);
  const r = suggestForDay(ctx(dishes, { chosen }), seeded(1));
  assert.deepEqual(r.ids, []);
});

test('deleted dishes are never suggested', () => {
  const dishes = bigLibrary();
  dishes.forEach((d, i) => { if (i % 2 === 0) d.deleted = true; });
  const r = suggestForDay(ctx(dishes, { kind: 0 }), seeded(1));
  for (const id of r.ids) assert.ok(!byId(dishes)(id).deleted);
});

test('with fewer than three dishes left, the suggestions are simply fewer', () => {
  const dishes = library([['Fleisch', false, 30], ['Fisch', false, 40]]);
  const r = suggestForDay(ctx(dishes, { days: 2, kind: 0, targets: { Fleisch: 0, Fisch: 0, Vegetarisch: 0 } }), seeded(1));
  assert.equal(r.ids.length, 2);
});
