// T-01, T-02: creating dishes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDish, validateDish, findDuplicateName, CATS } from '../src/logic/dishes.js';

test('T-01 a dish can be created with name and category only', () => {
  const d = createDish({ name: 'Käsespätzle', cat: 'Vegetarisch' }, { now: '2026-10-23T10:00:00.000Z', id: 'a1' });
  assert.equal(d.name, 'Käsespätzle');
  assert.equal(d.cat, 'Vegetarisch');
  assert.equal(d.kind, false, 'kindgerecht is off by default');
  assert.equal(d.minutes, null, 'minutes are optional');
  assert.equal(d.lastCooked, null, 'a new dish has never been cooked');
});

test('T-01 minutes and kindgerecht are optional extras', () => {
  const d = createDish({ name: 'Lachs', cat: 'Fisch', kind: true, minutes: 30 });
  assert.equal(d.kind, true);
  assert.equal(d.minutes, 30);
});

test('T-01 a dish without name is rejected', () => {
  assert.deepEqual(validateDish({ name: '  ', cat: 'Fisch' }).ok, false);
  assert.throws(() => createDish({ name: '', cat: 'Fisch' }));
});

test('T-02 a dish has exactly one valid category', () => {
  assert.deepEqual(CATS, ['Fleisch', 'Fisch', 'Vegetarisch']);
  assert.equal(validateDish({ name: 'X', cat: 'Suppe' }).ok, false);
  assert.equal(validateDish({ name: 'X', cat: ['Fleisch', 'Fisch'] }).ok, false);
  assert.equal(validateDish({ name: 'X' }).ok, false);
  assert.equal(validateDish({ name: 'X', cat: 'Fleisch' }).ok, true);
});

test('minutes must be a sensible whole number when given', () => {
  assert.equal(validateDish({ name: 'X', cat: 'Fleisch', minutes: 0 }).ok, false);
  assert.equal(validateDish({ name: 'X', cat: 'Fleisch', minutes: 12.5 }).ok, false);
  assert.equal(validateDish({ name: 'X', cat: 'Fleisch', minutes: 45 }).ok, true);
});

test('a duplicate name is detected, ignoring case and the dish itself', () => {
  const dishes = [createDish({ name: 'Chili', cat: 'Fleisch' }, { id: 'a' })];
  assert.equal(findDuplicateName(dishes, 'chili'), true);
  assert.equal(findDuplicateName(dishes, 'chili', 'a'), false);
  assert.equal(findDuplicateName(dishes, 'Gulasch'), false);
});
