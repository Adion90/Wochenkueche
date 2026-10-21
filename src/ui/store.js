// Storage in the browser of the device. Everything the app remembers lives under one key.
// All calls are wrapped, so the app still runs (without saving) when the browser refuses storage.

const KEY = 'wochenkueche.v1';

export function defaults() {
  return {
    dishes: [],
    plan: null, // { date, reviewed, items:[{id, addedOn}] }
    settings: { sperrfrist: 14, deckel: 60 },
    plansSinceExport: 0,
    lastExport: null,
    lastSetup: { days: 3, t: { Fleisch: 0, Fisch: 0, Vegetarisch: 0 }, kind: 0 },
    draft: null, // an unfinished planning, so a phone call in between does not lose it
  };
}

export function load() {
  const base = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { data: base, ok: true };
    const d = JSON.parse(raw);
    return {
      data: {
        ...base,
        ...d,
        settings: { ...base.settings, ...(d.settings || {}) },
        lastSetup: { ...base.lastSetup, ...(d.lastSetup || {}), t: { ...base.lastSetup.t, ...((d.lastSetup || {}).t || {}) } },
      },
      ok: true,
    };
  } catch {
    return { data: base, ok: false };
  }
}

// Returns true when the data was stored.
export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// Asks the browser to keep the data and not clear it when space gets short. The answer may be no.
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch {
    /* not available */
  }
  return false;
}
