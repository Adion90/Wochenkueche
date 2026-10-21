// The heart of the app: which dishes are suggested.
// Rules: cooldown (Sperrfrist), weighting by days since last cooked with a cap (Deckel),
// weekly targets that must stay reachable, and a fallback when there are not enough dishes.
// No screen code in here. Random numbers can be injected, so tests are repeatable.

import { CATS, activeDishes } from './dishes.js';
import { daysBetween } from './dates.js';

export const DEFAULT_SETTINGS = { sperrfrist: 14, deckel: 60 };

const HINTS = [
  '',
  'Alle passenden Gerichte waren in den letzten 14 Tagen dran. Die Sperrfrist ist für diesen Vorschlag aufgehoben.',
  'Es gibt nicht genug kindgerechte Gerichte für diese Vorgabe. Die Kinder-Vorgabe ist für diesen Vorschlag gelockert.',
  'Für die Kategorie-Vorgaben fehlen passende Gerichte. Die Vorgaben sind für diesen Vorschlag gelockert.',
];

export function gapDays(dish, today) {
  if (!dish.lastCooked) return Infinity;
  return daysBetween(dish.lastCooked, today);
}

export function inSperrfrist(dish, today, settings = DEFAULT_SETTINGS) {
  return gapDays(dish, today) < settings.sperrfrist;
}

// Weight for the random draw: days since last cooked, capped. Never cooked = highest weight.
export function weight(dish, today, settings = DEFAULT_SETTINGS) {
  const g = gapDays(dish, today);
  if (g === Infinity) return settings.deckel;
  return Math.max(1, Math.min(g, settings.deckel));
}

// Draws k different dishes, heavier weights are more likely.
export function drawWeighted(pool, k, today, settings = DEFAULT_SETTINGS, rng = Math.random) {
  const rest = pool.slice();
  const out = [];
  while (out.length < k && rest.length) {
    const ws = rest.map((d) => weight(d, today, settings));
    let r = rng() * ws.reduce((a, b) => a + b, 0);
    let i = 0;
    for (; i < ws.length; i++) {
      r -= ws[i];
      if (r <= 0) break;
    }
    i = Math.min(i, rest.length - 1);
    out.push(rest[i]);
    rest.splice(i, 1);
  }
  return out;
}

// In the fallback the dish with the longest pause comes first (no randomness).
export function longestPauseFirst(pool, k, today) {
  const g = (d) => {
    const x = gapDays(d, today);
    return x === Infinity ? 1e9 : x;
  };
  return pool.slice().sort((a, b) => g(b) - g(a)).slice(0, k);
}

// Short text for a dish that was picked by hand although it is in the cooldown.
export function sperrHint(dish, today, settings = DEFAULT_SETTINGS) {
  if (!inSperrfrist(dish, today, settings)) return null;
  const g = gapDays(dish, today);
  if (g <= 0) return 'heute schon gekocht';
  if (g === 1) return 'zuletzt gestern gekocht';
  return `zuletzt vor ${g} Tagen gekocht`;
}

// ---------- weekly plan: day by day ----------

// A "type" is one category combined with kindgerecht yes/no: 6 types in total.
const typeOf = (d) => CATS.indexOf(d.cat) * 2 + (d.kind ? 1 : 0);

// Can the remaining days still be filled, given what is needed and what dishes exist?
// needCat: minimum per category, needKind: exact number of kindgerecht days (or null = free).
function feasible(daysLeft, needCat, needKind, supply) {
  const catSum = [0, 0, 0];
  function rec(i, left, kindSum) {
    if (i === 6) {
      if (left !== 0) return false;
      for (let c = 0; c < 3; c++) if (catSum[c] < needCat[c]) return false;
      return needKind === null || kindSum === needKind;
    }
    const cat = i >> 1;
    const isKind = i & 1;
    for (let n = Math.min(supply[i], left); n >= 0; n--) {
      catSum[cat] += n;
      const ok = rec(i + 1, left - n, kindSum + isKind * n);
      catSum[cat] -= n;
      if (ok) return true;
    }
    return false;
  }
  return rec(0, daysLeft, 0);
}

const TIERS = [
  { sperr: true, kind: true, cat: true },
  { sperr: false, kind: true, cat: true },
  { sperr: false, kind: false, cat: true },
  { sperr: false, kind: false, cat: false },
];

// ctx: { dishes, today, settings, days, targets:{Fleisch,Fisch,Vegetarisch}, kind, chosen:[ids], shown:[ids] }
// Returns { ids, hintLevel, hint }.
export function suggestForDay(ctx, rng = Math.random) {
  const settings = ctx.settings || DEFAULT_SETTINGS;
  const all = activeDishes(ctx.dishes);
  const byId = new Map(all.map((d) => [d.id, d]));
  const chosen = ctx.chosen.map((id) => byId.get(id)).filter(Boolean);
  const daysLeft = ctx.days - ctx.chosen.length;
  if (daysLeft <= 0) return { ids: [], hintLevel: 0, hint: '' };

  const chosenCat = [0, 0, 0];
  let chosenKind = 0;
  for (const d of chosen) {
    chosenCat[CATS.indexOf(d.cat)]++;
    if (d.kind) chosenKind++;
  }
  let needCat = CATS.map((c, i) => Math.max(0, (ctx.targets[c] || 0) - chosenCat[i]));
  let needKind = ctx.kind - chosenKind;
  // Hand-picked dishes may have made a target impossible. Then it is simply no longer enforced.
  if (needCat.reduce((a, b) => a + b, 0) > daysLeft) needCat = [0, 0, 0];
  if (needKind < 0 || needKind > daysLeft) needKind = null;

  const shown = new Set(ctx.shown || []);
  for (let t = 0; t < TIERS.length; t++) {
    const tier = TIERS[t];
    const nc = tier.cat ? needCat : [0, 0, 0];
    const nk = tier.kind ? needKind : null;
    const chosenIds = new Set(ctx.chosen);
    const pool = all.filter((d) => !chosenIds.has(d.id) && (!tier.sperr || !inSperrfrist(d, ctx.today, settings)));
    const supply = [0, 0, 0, 0, 0, 0];
    for (const d of pool) supply[typeOf(d)]++;

    const okType = supply.map((s, ty) => {
      if (s === 0) return false;
      const nc2 = nc.slice();
      const ci = ty >> 1;
      nc2[ci] = Math.max(0, nc2[ci] - 1);
      const nk2 = nk === null ? null : nk - (ty & 1);
      if (nk2 !== null && nk2 < 0) return false;
      const sup2 = supply.slice();
      sup2[ty]--;
      return feasible(daysLeft - 1, nc2, nk2, sup2);
    });
    const allowed = pool.filter((d) => okType[typeOf(d)]);
    let fresh = allowed.filter((d) => !shown.has(d.id));
    if (fresh.length < 3 && allowed.length >= 3) fresh = allowed;

    const last = t === TIERS.length - 1;
    if (fresh.length >= 3 || (last && allowed.length > 0)) {
      const list = last && fresh.length < 3 ? allowed : fresh;
      const picked = t === 0 ? drawWeighted(list, 3, ctx.today, settings, rng) : longestPauseFirst(list, 3, ctx.today);
      return { ids: picked.map((d) => d.id), hintLevel: t, hint: HINTS[t] };
    }
  }
  return { ids: [], hintLevel: TIERS.length - 1, hint: HINTS[TIERS.length - 1] };
}

// ---------- additional dish in the running week ----------

// ctx: { dishes, today, settings, cat, kindSel:'ja'|'nein'|'egal', planIds:[ids], shown:[ids] }
// The weekly targets play no role here. The category is never relaxed.
export function suggestExtra(ctx, rng = Math.random) {
  const settings = ctx.settings || DEFAULT_SETTINGS;
  const planIds = new Set(ctx.planIds || []);
  const shown = new Set(ctx.shown || []);
  const base = activeDishes(ctx.dishes).filter((d) => d.cat === ctx.cat && !planIds.has(d.id));
  const tiers = [
    { sperr: true, kind: true },
    { sperr: false, kind: true },
    { sperr: false, kind: false },
  ];
  for (let t = 0; t < tiers.length; t++) {
    const tier = tiers[t];
    const allowed = base.filter((d) => {
      if (tier.sperr && inSperrfrist(d, ctx.today, settings)) return false;
      if (tier.kind && ctx.kindSel === 'ja' && !d.kind) return false;
      if (tier.kind && ctx.kindSel === 'nein' && d.kind) return false;
      return true;
    });
    let fresh = allowed.filter((d) => !shown.has(d.id));
    if (fresh.length < 3 && allowed.length >= 3) fresh = allowed;
    const last = t === tiers.length - 1;
    if (fresh.length >= 3 || (last && allowed.length > 0)) {
      const list = last && fresh.length < 3 ? allowed : fresh;
      const picked = t === 0 ? drawWeighted(list, 3, ctx.today, settings, rng) : longestPauseFirst(list, 3, ctx.today);
      const level = t === 0 ? 0 : t === 1 ? 1 : 2;
      return { ids: picked.map((d) => d.id), hintLevel: level, hint: HINTS[level] };
    }
  }
  return { ids: [], hintLevel: 2, hint: '' };
}
