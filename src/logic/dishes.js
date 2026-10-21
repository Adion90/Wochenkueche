// Dishes: creating, validating, editing, deleting. No screen code in here.

export const CATS = ['Fleisch', 'Fisch', 'Vegetarisch'];

export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Returns { ok, errors }. Name and category are required, minutes are optional.
export function validateDish(input) {
  const errors = [];
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) errors.push('Bitte gib einen Namen ein.');
  if (typeof input.cat !== 'string' || !CATS.includes(input.cat)) errors.push('Bitte wähle genau eine Kategorie.');
  if (input.minutes != null && (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 600)) {
    errors.push('Die Dauer muss eine ganze Zahl in Minuten sein.');
  }
  return { ok: errors.length === 0, errors };
}

export function createDish(input, { now = new Date().toISOString(), id = newId() } = {}) {
  const v = validateDish(input);
  if (!v.ok) throw new Error(v.errors.join(' '));
  return {
    id,
    name: input.name.trim(),
    cat: input.cat,
    kind: input.kind === true,
    minutes: input.minutes == null ? null : input.minutes,
    lastCooked: null,
    updated: now,
  };
}

// Changes name, category, minutes or kind. "lastCooked" is never edited by hand.
export function updateDish(dish, changes, now = new Date().toISOString()) {
  const merged = { ...dish, ...pick(changes, ['name', 'cat', 'kind', 'minutes']) };
  const v = validateDish(merged);
  if (!v.ok) throw new Error(v.errors.join(' '));
  return { ...merged, name: merged.name.trim(), kind: merged.kind === true, updated: now };
}

// Deleting leaves a marker behind, so that a later import does not bring the dish back.
export function deleteDish(dish, now = new Date().toISOString()) {
  return { ...dish, deleted: true, updated: now };
}

export function activeDishes(dishes) {
  return dishes.filter((d) => !d.deleted);
}

export function findDuplicateName(dishes, name, exceptId = null) {
  const n = String(name).trim().toLowerCase();
  return activeDishes(dishes).some((d) => d.id !== exceptId && d.name.trim().toLowerCase() === n);
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}
