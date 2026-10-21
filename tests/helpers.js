// Shared helpers for the tests: fixed "today", seeded random numbers, quick dish factory.
import { addDays } from '../src/logic/dates.js';

export const TODAY = '2026-10-23';

// Small seeded random generator (mulberry32), so statistical tests are repeatable.
export function seeded(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let counter = 0;
// gap = days since last cooked (null = never cooked)
export function dish(name, cat, { kind = false, gap = null, minutes = null, updated = '2026-01-01T00:00:00.000Z' } = {}) {
  counter++;
  return {
    id: 'x' + counter,
    name,
    cat,
    kind,
    minutes,
    lastCooked: gap == null ? null : addDays(TODAY, -gap),
    updated,
  };
}

// Builds a library: list of [cat, kind, gap] entries, names are generated.
export function library(entries) {
  return entries.map(([cat, kind, gap], i) => dish(`${cat}-${kind ? 'K' : 'N'}-${i}`, cat, { kind, gap }));
}

// A generous library: for every category and kind setting, 6 dishes with varied pauses.
export function bigLibrary() {
  const out = [];
  for (const cat of ['Fleisch', 'Fisch', 'Vegetarisch']) {
    for (const kind of [true, false]) {
      [20, 25, 40, 60, 90, null].forEach((gap) => out.push(dish(`${cat}-${kind}-${gap}`, cat, { kind, gap })));
    }
  }
  return out;
}
