// Date helpers. Dates are plain 'YYYY-MM-DD' strings so that time zones and summer time never matter.

function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

// Number of days from a to b (positive when b is later).
export function daysBetween(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

export function addDays(iso, n) {
  const t = new Date(toUTC(iso) + n * 86400000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

// Today's date on the device, as 'YYYY-MM-DD'.
export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// The later of two optional dates.
export function maxDate(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a >= b ? a : b;
}
