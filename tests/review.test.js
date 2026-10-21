// T-14 to T-16: weekly review and history.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dish } from './helpers.js';
import { createPlan, addExtra, needsReview, canStartPlanning, defaultReview, applyReview } from '../src/logic/plan.js';

function setup() {
  const a = dish('A', 'Fleisch', { gap: 30 });
  const b = dish('B', 'Fisch', { gap: 40 });
  const c = dish('C', 'Vegetarisch', { gap: null });
  const other = dish('Ersatz', 'Vegetarisch', { gap: 60 });
  const dishes = [a, b, c, other];
  const plan = createPlan([a.id, b.id, c.id], '2026-10-16');
  return { a, b, c, other, dishes, plan };
}
const last = (dishes, id) => dishes.find((d) => d.id === id).lastCooked;

test('T-14 planning a new week is only possible after the review', () => {
  const { plan, dishes } = setup();
  assert.equal(needsReview(plan), true);
  assert.equal(canStartPlanning(plan), false);
  const { plan: done } = applyReview(dishes, plan, defaultReview(plan));
  assert.equal(needsReview(done), false);
  assert.equal(canStartPlanning(done), true);
});

test('T-14 the very first planning has no review', () => {
  assert.equal(canStartPlanning(null), true);
  assert.equal(needsReview(null), false);
});

test('T-15 in the review every dish starts as "gekocht"', () => {
  const { plan } = setup();
  const review = defaultReview(plan);
  assert.equal(review.length, 3);
  assert.ok(review.every((r) => r.status === 'ok'));
});

test('T-15 "nicht gekocht" keeps the old date, no preference afterwards', () => {
  const { a, b, c, dishes, plan } = setup();
  const review = defaultReview(plan).map((r) => (r.id === a.id ? { ...r, status: 'no' } : r));
  const res = applyReview(dishes, plan, review);
  assert.equal(last(res.dishes, a.id), a.lastCooked);
  assert.equal(last(res.dishes, b.id), '2026-10-16');
  assert.equal(last(res.dishes, c.id), '2026-10-16');
});

test('T-15 "auswärts oder bestellt" changes nothing', () => {
  const { a, dishes, plan } = setup();
  const review = defaultReview(plan).map((r) => (r.id === a.id ? { ...r, status: 'out' } : r));
  const res = applyReview(dishes, plan, review);
  assert.equal(last(res.dishes, a.id), a.lastCooked);
});

test('T-15 "anderes Gericht gekocht": the other dish gets the date, the planned one stays', () => {
  const { a, other, dishes, plan } = setup();
  const review = defaultReview(plan).map((r) => (r.id === a.id ? { ...r, status: 'other', other: other.id } : r));
  const res = applyReview(dishes, plan, review);
  assert.equal(last(res.dishes, other.id), '2026-10-16');
  assert.equal(last(res.dishes, a.id), a.lastCooked);
});

test('T-15 the whole week not cooked: no dish changes', () => {
  const { dishes, plan } = setup();
  const review = defaultReview(plan).map((r) => ({ ...r, status: 'no' }));
  const res = applyReview(dishes, plan, review);
  assert.deepEqual(res.dishes.map((d) => d.lastCooked), dishes.map((d) => d.lastCooked));
  assert.equal(res.plan.reviewed, true);
});

test('T-16 all cooked dishes of a week get the planning date', () => {
  const { dishes, plan, a, b, c } = setup();
  const res = applyReview(dishes, plan, defaultReview(plan));
  for (const d of [a, b, c]) assert.equal(last(res.dishes, d.id), '2026-10-16');
});

test('T-16 an additional dish gets the date it was added', () => {
  const { dishes, plan, other } = setup();
  const withExtra = addExtra(plan, other.id, '2026-10-19');
  assert.equal(withExtra.items.length, 4);
  const res = applyReview(dishes, withExtra, defaultReview(withExtra));
  assert.equal(last(res.dishes, other.id), '2026-10-19');
});

test('T-16 an older date never overwrites a newer one', () => {
  const { dishes, plan, a } = setup();
  dishes.find((d) => d.id === a.id).lastCooked = '2026-10-20';
  const res = applyReview(dishes, plan, defaultReview(plan));
  assert.equal(last(res.dishes, a.id), '2026-10-20');
});

test('adding the same dish twice does nothing', () => {
  const { plan, a } = setup();
  assert.equal(addExtra(plan, a.id, '2026-10-19').items.length, 3);
});

test('the review does not change the original data (no side effects)', () => {
  const { dishes, plan } = setup();
  const before = JSON.stringify({ dishes, plan });
  applyReview(dishes, plan, defaultReview(plan));
  assert.equal(JSON.stringify({ dishes, plan }), before);
});

test('a dish that was deleted meanwhile is skipped in the review', () => {
  const { dishes, plan, a } = setup();
  const without = dishes.filter((d) => d.id !== a.id);
  const res = applyReview(without, plan, defaultReview(plan));
  assert.equal(res.dishes.length, 3);
});
