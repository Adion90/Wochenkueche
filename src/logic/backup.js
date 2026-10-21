// Export and import. The import merges, it never replaces. No screen code in here.

import { maxDate } from './dates.js';

export const FORMAT = 'wochenkueche';
export const VERSION = 1;

const FIELDS = ['id', 'name', 'cat', 'kind', 'minutes', 'lastCooked', 'updated'];

function clean(d) {
  const out = {};
  for (const k of FIELDS) out[k] = d[k] === undefined ? null : d[k];
  if (d.deleted) out.deleted = true;
  return out;
}

// The file holds dishes and history (the last cooked date of every dish), not the running week.
export function exportData(dishes, now = new Date().toISOString()) {
  return { format: FORMAT, version: VERSION, exportedAt: now, dishes: dishes.map(clean) };
}

// Checks text from a file. Returns { ok, data } or { ok:false, error }.
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Die Datei ist keine gültige Sicherung.' };
  }
  if (!data || data.format !== FORMAT) return { ok: false, error: 'Die Datei stammt nicht aus der Wochenküche.' };
  if (data.version !== VERSION) return { ok: false, error: 'Die Datei hat eine unbekannte Version.' };
  if (!Array.isArray(data.dishes)) return { ok: false, error: 'In der Datei fehlen die Gerichte.' };
  for (const d of data.dishes) {
    if (!d || typeof d.id !== 'string' || typeof d.name !== 'string' || typeof d.cat !== 'string' || typeof d.updated !== 'string') {
      return { ok: false, error: 'Ein Gericht in der Datei ist unvollständig.' };
    }
  }
  return { ok: true, data };
}

function sameContent(a, b) {
  return a.name === b.name && a.cat === b.cat && !!a.kind === !!b.kind && (a.minutes ?? null) === (b.minutes ?? null) && !!a.deleted === !!b.deleted;
}

// The younger change wins (ties: the local one). "lastCooked" always takes the younger date.
function mergeOne(local, incoming) {
  const winner = incoming.updated > local.updated ? incoming : local;
  const merged = { ...clean(winner), lastCooked: maxDate(local.lastCooked, incoming.lastCooked) };
  return merged;
}

export function mergeDishes(local, incoming) {
  const byId = new Map(local.map((d) => [d.id, d]));
  const out = local.map((d) => clean(d));
  const index = new Map(out.map((d, i) => [d.id, i]));
  for (const inc of incoming) {
    if (index.has(inc.id)) {
      out[index.get(inc.id)] = mergeOne(byId.get(inc.id), inc);
    } else {
      index.set(inc.id, out.length);
      out.push(clean(inc));
    }
  }
  return out;
}

// What an import would do, for the preview before the user confirms.
export function previewImport(local, incoming) {
  const byId = new Map(local.map((d) => [d.id, d]));
  const p = { added: 0, changed: 0, removed: 0, historyUpdated: 0, nameConflicts: [] };
  const activeNames = new Set(local.filter((d) => !d.deleted).map((d) => d.name.trim().toLowerCase()));
  for (const inc of incoming) {
    const loc = byId.get(inc.id);
    if (!loc) {
      if (!inc.deleted) {
        p.added++;
        if (activeNames.has(inc.name.trim().toLowerCase())) p.nameConflicts.push(inc.name);
      }
      continue;
    }
    const m = mergeOne(loc, inc);
    if (m.deleted && !loc.deleted) p.removed++;
    else if (!sameContent(m, loc)) p.changed++;
    if (m.lastCooked !== (loc.lastCooked ?? null)) p.historyUpdated++;
  }
  return p;
}

// After how many saved plans the app reminds to export.
export function exportReminderDue(plansSinceExport, every = 4) {
  return plansSinceExport >= every;
}
