// T-17 to T-19: export, import, merging.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dish } from './helpers.js';
import { exportData, parseImport, previewImport, mergeDishes, exportReminderDue } from '../src/logic/backup.js';

const OLD = '2026-01-01T00:00:00.000Z';
const NEW = '2026-06-01T00:00:00.000Z';
const NEWER = '2026-09-01T00:00:00.000Z';

function d(id, name, over = {}) {
  return { id, name, cat: 'Fleisch', kind: false, minutes: null, lastCooked: null, updated: OLD, ...over };
}

test('T-17 the export file for 200 dishes stays far below 1 MB', () => {
  const many = Array.from({ length: 200 }, (_, i) => d('id-' + i, 'Gericht mit etwas längerem Namen Nummer ' + i, { minutes: 30, lastCooked: '2026-10-01', kind: i % 2 === 0 }));
  const text = JSON.stringify(exportData(many, '2026-10-23T12:00:00.000Z'));
  const bytes = new TextEncoder().encode(text).length;
  assert.ok(bytes < 1024 * 1024, 'size ' + bytes);
  assert.ok(bytes < 100 * 1024, 'expected far smaller, size ' + bytes);
});

test('the export contains dishes and history only, not the running week', () => {
  const data = exportData([d('a', 'A')], '2026-10-23T12:00:00.000Z');
  assert.deepEqual(Object.keys(data).sort(), ['dishes', 'exportedAt', 'format', 'version']);
});

test('T-18 import adds new dishes', () => {
  const local = [d('a', 'A')];
  const incoming = exportData([d('a', 'A'), d('b', 'B')], NEW);
  const merged = mergeDishes(local, incoming.dishes);
  assert.equal(merged.length, 2);
  assert.deepEqual(previewImport(local, incoming.dishes).added, 1);
});

test('T-18 a dish changed on both sides: the younger change wins', () => {
  const local = [d('a', 'Chili alt', { updated: OLD, minutes: 30 })];
  const incomingNewer = [d('a', 'Chili neu', { updated: NEW, minutes: 45 })];
  const m1 = mergeDishes(local, incomingNewer);
  assert.equal(m1[0].name, 'Chili neu');
  assert.equal(m1[0].minutes, 45);

  const localNewer = [d('a', 'Chili lokal', { updated: NEWER, minutes: 20 })];
  const m2 = mergeDishes(localNewer, incomingNewer);
  assert.equal(m2[0].name, 'Chili lokal');
  assert.equal(m2[0].minutes, 20);
});

test('T-18 for "zuletzt gekocht" the younger date wins, even if the other side edited the dish later', () => {
  const local = [d('a', 'A', { lastCooked: '2026-10-10', updated: OLD })];
  const incoming = [d('a', 'A umbenannt', { lastCooked: '2026-09-01', updated: NEW })];
  const m = mergeDishes(local, incoming);
  assert.equal(m[0].name, 'A umbenannt');
  assert.equal(m[0].lastCooked, '2026-10-10');
  const m2 = mergeDishes(incoming, local);
  assert.equal(m2[0].lastCooked, '2026-10-10');
});

test('T-18 a date on one side only is kept', () => {
  const m = mergeDishes([d('a', 'A', { lastCooked: null })], [d('a', 'A', { lastCooked: '2026-10-05' })]);
  assert.equal(m[0].lastCooked, '2026-10-05');
});

test('T-18 deleted dishes travel along and stay deleted', () => {
  const local = [d('a', 'A', { updated: OLD })];
  const incoming = [d('a', 'A', { updated: NEW, deleted: true })];
  const m = mergeDishes(local, incoming);
  assert.equal(m[0].deleted, true);
  const p = previewImport(local, incoming);
  assert.equal(p.removed, 1);
  // a younger local edit beats an older deletion
  const localEdited = [d('a', 'A bearbeitet', { updated: NEWER })];
  assert.equal(mergeDishes(localEdited, incoming)[0].deleted, undefined);
});

test('T-19 importing the same file twice changes nothing', () => {
  const local = [d('a', 'A', { lastCooked: '2026-10-01' }), d('c', 'C')];
  const incoming = [d('a', 'A neu', { updated: NEW, lastCooked: '2026-10-09' }), d('b', 'B'), d('c', 'C', { updated: NEW, deleted: true })];
  const once = mergeDishes(local, incoming);
  const twice = mergeDishes(once, incoming);
  assert.deepEqual(twice, once);
});

test('T-19 the order of the two sides does not decide the result', () => {
  const x = [d('a', 'A x', { updated: NEW, lastCooked: '2026-10-01' }), d('b', 'B')];
  const y = [d('a', 'A y', { updated: NEWER, lastCooked: '2026-10-05' }), d('c', 'C')];
  const norm = (list) => [...list].sort((p, q) => p.id.localeCompare(q.id));
  assert.deepEqual(norm(mergeDishes(x, y)), norm(mergeDishes(y, x)));
});

test('the preview counts added, changed, removed and history entries', () => {
  const local = [d('a', 'A'), d('b', 'B'), d('c', 'C'), d('e', 'E', { lastCooked: null })];
  const incoming = [
    d('a', 'A neu', { updated: NEW }),
    d('b', 'B', { updated: NEW, deleted: true }),
    d('f', 'F'),
    d('e', 'E', { lastCooked: '2026-10-02' }),
  ];
  const p = previewImport(local, incoming);
  assert.equal(p.added, 1);
  assert.equal(p.changed, 1);
  assert.equal(p.removed, 1);
  assert.equal(p.historyUpdated, 1);
});

test('the preview warns about the same name under a different id', () => {
  const local = [d('a', 'Käsespätzle')];
  const incoming = [d('zz', 'käsespätzle'), d('y', 'Neu')];
  const p = previewImport(local, incoming);
  assert.deepEqual(p.nameConflicts, ['käsespätzle']);
});

test('import rejects files that are not from this app or are broken', () => {
  assert.equal(parseImport('kein json').ok, false);
  assert.equal(parseImport('{"format":"anderes","version":1,"dishes":[]}').ok, false);
  assert.equal(parseImport('{"format":"wochenkueche","version":99,"dishes":[]}').ok, false);
  assert.equal(parseImport('{"format":"wochenkueche","version":1,"dishes":[{"id":"a"}]}').ok, false);
  const good = parseImport(JSON.stringify(exportData([d('a', 'A')], NEW)));
  assert.equal(good.ok, true);
  assert.equal(good.data.dishes.length, 1);
});

test('the reminder to export appears after four saved plans', () => {
  assert.equal(exportReminderDue(3), false);
  assert.equal(exportReminderDue(4), true);
  assert.equal(exportReminderDue(7), true);
});
