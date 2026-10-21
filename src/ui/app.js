// Screens and operation. All rules come from src/logic, nothing is decided here.

import { CATS, createDish, updateDish, deleteDish, activeDishes, findDuplicateName, validateDish } from '../logic/dishes.js';
import { todayISO } from '../logic/dates.js';
import { suggestForDay, suggestExtra, sperrHint, gapDays } from '../logic/suggest.js';
import { createPlan, addExtra, needsReview, defaultReview, applyReview } from '../logic/plan.js';
import { exportData, parseImport, previewImport, mergeDishes, exportReminderDue } from '../logic/backup.js';
import { load, save, requestPersistence } from './store.js';

const loaded = load();
const S = {
  ...loaded.data,
  tab: 'week',
  flow: null,
  q: '',
  fcat: 'Alle',
  storageOk: loaded.ok,
  persisted: null,
};

const $ = (s) => document.querySelector(s);
const today = () => todayISO();
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const byId = (id) => S.dishes.find((d) => d.id === id && !d.deleted) || null;
const dishes = () => activeDishes(S.dishes);

/* ---------- storage ---------- */

function persist() {
  const draftable = S.flow && ['review', 'setup', 'pick'].includes(S.flow.type);
  S.draft = draftable ? clone(S.flow) : null;
  const ok = save({
    dishes: S.dishes,
    plan: S.plan,
    settings: S.settings,
    plansSinceExport: S.plansSinceExport,
    lastExport: S.lastExport,
    lastSetup: S.lastSetup,
    draft: S.draft,
  });
  S.storageOk = ok;
}

/* ---------- small pieces ---------- */

function agoText(d) {
  const g = gapDays(d, today());
  if (g === Infinity) return 'noch nie gekocht';
  if (g <= 0) return 'heute';
  if (g === 1) return 'gestern';
  if (g < 14) return `vor ${g} Tagen`;
  if (g < 60) return `vor ${Math.round(g / 7)} Wochen`;
  return `vor ${Math.round(g / 30)} Monaten`;
}
const isOld = (d) => gapDays(d, today()) >= 45;

function dishMeta(d, withAgo) {
  return `<div class="meta"><span class="k-${d.cat}"><i class="dot"></i>${esc(d.cat)}</span>` +
    (d.minutes ? `<span>${d.minutes} Min</span>` : '') +
    (d.kind ? '<span class="badge">kindgerecht</span>' : '') +
    (withAgo ? `<span class="${isOld(d) ? 'old' : ''}">${agoText(d)}</span>` : '') + '</div>';
}

function toast(m) {
  const t = $('#toast');
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), 3200);
}

function stepper(key, label, sub, val, min, max) {
  return `<div class="prow"><div class="plabel">${label}${sub ? `<small>${sub}</small>` : ''}</div><div class="stepper">` +
    `<button data-act="step" data-k="${key}" data-d="-1" aria-label="Weniger: ${esc(label)}" ${val <= min ? 'disabled' : ''}>−</button>` +
    `<output>${val}</output>` +
    `<button data-act="step" data-k="${key}" data-d="1" aria-label="Mehr: ${esc(label)}" ${val >= max ? 'disabled' : ''}>+</button></div></div>`;
}

function closeSheet() { $('#sheet').innerHTML = ''; }
function openSheet(html) {
  $('#sheet').innerHTML = `<div class="scrim" data-act="closeSheet"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
}

function banners() {
  let h = '';
  if (!S.storageOk) h += '<div class="warn">Dieser Browser erlaubt kein Speichern. Die Eingaben gehen verloren, sobald du die Seite schließt.</div>';
  return h;
}

function fmtDate(iso) {
  const [, m, d] = iso.split('-');
  return `${d}.${m}.`;
}

/* ---------- Woche ---------- */

function weekTab() {
  const p = S.plan;
  const hasDishes = dishes().length > 0;
  let h = `<div class="stack">${banners()}`;
  if (exportReminderDue(S.plansSinceExport)) {
    h += `<div class="banner"><p>Seit der letzten Sicherung wurden ${S.plansSinceExport} Pläne gespeichert. Zeit für einen Export.</p><button class="btn small" data-act="tab" data-t="backup">Zur Sicherung</button></div>`;
  }
  if (!hasDishes) {
    return h + '<h1>Diese Woche</h1><div class="empty"><p>Noch keine Gerichte. Lege zuerst die Gerichte an, die ihr kocht.</p><button class="btn" data-act="newDish">Erstes Gericht anlegen</button></div></div>';
  }
  if (!p || !p.items.length) {
    return h + '<h1>Diese Woche</h1><div class="empty"><p class="muted">Noch keine Woche geplant.</p><button class="btn" data-act="startPlan">Neue Woche planen</button></div></div>';
  }
  const items = p.items.map((i) => {
    const d = byId(i.id);
    return d
      ? `<div class="dish"><div class="dish-main"><div class="dish-name">${esc(d.name)}</div>${dishMeta(d, false)}</div></div>`
      : '<div class="dish"><div class="dish-main muted">Gelöschtes Gericht</div></div>';
  }).join('');
  const state = p.reviewed ? 'Rückblick erledigt' : 'Rückblick steht noch aus';
  h += `<h1>${p.reviewed ? 'Letzte Woche' : 'Diese Woche'}</h1><p class="muted">Geplant am ${fmtDate(p.date)} · ${p.items.length} ${p.items.length === 1 ? 'Gericht' : 'Gerichte'} · ${state}</p>` +
    `<div class="list">${items}</div>` +
    '<div class="row2"><button class="btn ghost" data-act="startExtra">Zusätzliches Gericht</button><button class="btn" data-act="startPlan">Neue Woche planen</button></div>';
  return h + '</div>';
}

/* ---------- planning flow ---------- */

function startPlan() {
  if (!dishes().length) return;
  if (needsReview(S.plan)) {
    const items = defaultReview(S.plan).filter((r) => byId(r.id));
    if (items.length) { S.flow = { type: 'review', items }; return; }
  }
  toSetup();
}

function toSetup() {
  S.flow = { type: 'setup', ...clone(S.lastSetup) };
  clampSetup(S.flow);
}

function clampSetup(f) {
  const t = f.t;
  let sum = t.Fleisch + t.Fisch + t.Vegetarisch;
  while (sum > f.days) {
    const k = ['Vegetarisch', 'Fisch', 'Fleisch'].find((c) => t[c] > 0);
    t[k]--;
    sum--;
  }
  if (f.kind > f.days) f.kind = f.days;
}

function reviewScreen() {
  const f = S.flow;
  const labels = { ok: 'Gekocht', no: 'Nicht gekocht', other: 'Anderes gekocht', out: 'Auswärts / bestellt' };
  const rows = f.items.map((it, i) => {
    const d = byId(it.id);
    let st = labels[it.status];
    if (it.status === 'other' && it.other) st = 'Stattdessen: ' + (byId(it.other) ? byId(it.other).name : '?');
    return `<button class="dish" data-act="reviewRow" data-i="${i}"><div class="dish-main"><div class="dish-name">${esc(d.name)}</div></div><span class="pill ${it.status === 'ok' ? 'ok' : ''}">${esc(st)}</span></button>`;
  }).join('');
  return '<div class="flowbar"><button class="btn ghost small" data-act="cancelFlow">Abbrechen</button><span class="step">Schritt 1 von 3</span></div>' +
    '<div class="stack"><h1>Rückblick</h1><p class="muted">Alles ist als gekocht markiert. Tippe nur auf Gerichte, bei denen es anders war.</p>' +
    `<div class="list">${rows}</div>` +
    '<button class="btn ghost block" data-act="reviewAllNo">Ganze Woche nicht gekocht</button>' +
    '<button class="btn block" data-act="reviewDone">Rückblick abschließen</button></div>';
}

function reviewSheet(i) {
  const it = S.flow.items[i];
  const d = byId(it.id);
  const opt = (k, label, sub) => `<button class="opt" data-act="reviewSet" data-i="${i}" data-s="${k}" aria-pressed="${it.status === k}"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span></button>`;
  openSheet(`<h2>${esc(d.name)}</h2>` +
    opt('ok', 'Gekocht', 'Das Gericht gilt als zuletzt gekocht.') +
    opt('no', 'Nicht gekocht', 'Das Datum bleibt wie vorher.') +
    opt('other', 'Anderes Gericht gekocht', 'Du wählst das Gericht aus der Sammlung.') +
    opt('out', 'Auswärts oder bestellt', 'Keine Änderung.') +
    '<button class="btn ghost block" data-act="closeSheet">Schließen</button>');
}

function fillReviewList(q) {
  const inPlan = new Set(S.plan.items.map((i) => i.id));
  const list = dishes().filter((d) => !inPlan.has(d.id) && (!q || d.name.toLowerCase().includes(q.toLowerCase())));
  $('#rlist').innerHTML = list.map((d) => `<button class="dish" data-act="reviewPick" data-id="${d.id}"><div class="dish-main"><div class="dish-name">${esc(d.name)}</div>${dishMeta(d, false)}</div></button>`).join('') || '<p class="muted">Nichts gefunden.</p>';
}

function setupScreen() {
  const f = S.flow;
  const t = f.t;
  const sum = t.Fleisch + t.Fisch + t.Vegetarisch;
  const free = f.days - sum;
  const mx = (c) => Math.max(0, f.days - (sum - t[c]));
  return '<div class="flowbar"><button class="btn ghost small" data-act="cancelFlow">Abbrechen</button><span class="step">Schritt 2 von 3</span></div>' +
    '<div class="stack"><h1>Neue Woche</h1><div class="card">' +
    stepper('days', 'Kochtage', 'Wie viele Tage wird gekocht?', f.days, 1, 7) +
    '</div><div class="card"><h3>Mischung</h3>' +
    stepper('Fleisch', 'Fleisch', '', t.Fleisch, 0, mx('Fleisch')) +
    stepper('Fisch', 'Fisch', '', t.Fisch, 0, mx('Fisch')) +
    stepper('Vegetarisch', 'Vegetarisch', '', t.Vegetarisch, 0, mx('Vegetarisch')) +
    `<p class="notice">Beliebig: ${free} ${free === 1 ? 'Tag' : 'Tage'} (jede Kategorie möglich)</p></div>` +
    `<div class="card">${stepper('kind', 'Kindgerecht', 'Wie viele Tage genau?', f.kind, 0, f.days)}</div>` +
    '<button class="btn block" data-act="setupDone">Vorschläge ansehen</button></div>';
}

function suggestDay(f, fresh) {
  const r = suggestForDay({
    dishes: S.dishes, today: today(), settings: S.settings,
    days: f.days, targets: f.t, kind: f.kind, chosen: f.chosen, shown: fresh ? f.shown : [],
  });
  f.sugg = r.ids;
  f.hint = r.hint;
  r.ids.forEach((id) => { if (!f.shown.includes(id)) f.shown.push(id); });
}

function counts(f) {
  const c = { Fleisch: 0, Fisch: 0, Vegetarisch: 0 };
  let k = 0;
  f.chosen.forEach((id) => { const d = byId(id); if (d) { c[d.cat]++; if (d.kind) k++; } });
  return { c, k };
}

function needsLine(f) {
  const ct = counts(f);
  const r = f.days - f.chosen.length;
  const parts = [];
  let sumN = 0;
  CATS.forEach((c) => { const nd = Math.max(0, f.t[c] - ct.c[c]); sumN += nd; if (nd > 0) parts.push(`${c} ${nd}`); });
  const free = Math.max(0, r - sumN);
  if (free > 0) parts.push(`beliebig ${free}`);
  parts.push(`kindgerecht ${Math.max(0, f.kind - ct.k)}`);
  return parts;
}

function suggCard(id, primary) {
  const d = byId(id);
  if (!d) return '';
  return `<div class="card"><h3>${esc(d.name)}</h3>${dishMeta(d, true)}<button class="btn ${primary ? '' : 'ghost'} block" data-act="choose" data-id="${d.id}">Dieses kochen</button></div>`;
}

function pickScreen() {
  const f = S.flow;
  const i = f.chosen.length;
  if (i >= f.days) return summaryScreen();
  let dots = '';
  for (let x = 0; x < f.days; x++) dots += `<i class="${x < i ? 'on' : x === i ? 'now' : ''}"></i>`;
  const chosen = i ? `<div class="chosen">${f.chosen.map((id) => { const d = byId(id); return d ? `<span class="k-${d.cat}"><i class="dot"></i>${esc(d.name)}</span>` : ''; }).join('')}</div>` : '';
  const cards = f.sugg.length ? f.sugg.map((id, k) => suggCard(id, k === 0)).join('') : '<div class="card muted">Keine Gerichte mehr übrig. Lege weitere Gerichte an.</div>';
  return `<div class="flowbar"><button class="btn ghost small" data-act="cancelFlow">Abbrechen</button><span class="step">Schritt 3 von 3 · Tag ${i + 1} von ${f.days}</span></div>` +
    `<div class="dots" aria-hidden="true">${dots}</div>` +
    `<div class="stack"><h1>Was kocht ihr an Tag ${i + 1}?</h1>${chosen}` +
    `<div class="needs" aria-label="Noch offen">${needsLine(f).map((p) => `<span>${esc(p)}</span>`).join('')}</div>` +
    (f.hint ? `<div class="hint">${esc(f.hint)}</div>` : '') +
    `<div class="sugg">${cards}</div>` +
    '<div class="row2"><button class="btn ghost" data-act="renew">3 neue Vorschläge</button><button class="btn ghost" data-act="manual">Selbst wählen</button></div>' +
    (i ? '<button class="btn ghost block small" data-act="undo">Letzte Wahl zurücknehmen</button>' : '') + '</div>';
}

function summaryScreen() {
  const f = S.flow;
  const ct = counts(f);
  const list = f.chosen.map((id) => { const d = byId(id); return d ? `<div class="dish"><div class="dish-main"><div class="dish-name">${esc(d.name)}</div>${dishMeta(d, false)}</div></div>` : ''; }).join('');
  const sumLine = CATS.filter((c) => f.t[c] > 0 || ct.c[c] > 0).map((c) => `<span>${c} ${ct.c[c]}/${f.t[c]}</span>`).join('') + `<span>kindgerecht ${ct.k}/${f.kind}</span>`;
  return '<div class="flowbar"><button class="btn ghost small" data-act="undo">Zurück</button><span class="step">Fertig</span></div>' +
    `<div class="stack"><h1>Die Woche steht</h1><div class="needs">${sumLine}</div><div class="list">${list}</div>` +
    '<button class="btn block" data-act="savePlan">Plan speichern</button></div>';
}

function pickerList(q) {
  const f = S.flow;
  const taken = new Set(f.type === 'pick' ? f.chosen : (S.plan && !S.plan.reviewed ? S.plan.items.map((i) => i.id) : []));
  const list = dishes().filter((d) => !taken.has(d.id) && (!q || d.name.toLowerCase().includes(q.toLowerCase())));
  return list.length ? list.map((d) => {
    const w = sperrHint(d, today(), S.settings);
    return `<button class="dish" data-act="pickDish" data-id="${d.id}"><div class="dish-main"><div class="dish-name">${esc(d.name)}</div>${dishMeta(d, true)}${w ? `<div class="meta"><span class="old">Sperrfrist: ${esc(w)}</span></div>` : ''}</div></button>`;
  }).join('') : '<p class="muted">Nichts gefunden.</p>';
}

function openPicker() {
  openSheet(`<h2>Gericht selbst wählen</h2><input class="search" id="pq" type="search" placeholder="Gericht suchen" autocomplete="off"><div class="list" id="plist">${pickerList('')}</div><button class="btn ghost block" data-act="closeSheet">Schließen</button>`);
}

/* ---------- additional dish ---------- */

function extraScreen() {
  const f = S.flow;
  const bar = '<div class="flowbar"><button class="btn ghost small" data-act="cancelFlow">Abbrechen</button><span class="step">Zusätzliches Gericht</span></div>';
  if (f.step === 'cat') {
    return bar + `<div class="stack"><h1>Welche Kategorie?</h1><div class="big3">${CATS.map((c) => `<button data-act="extraCat" data-c="${c}" class="k-${c}"><i class="dot"></i>${c}</button>`).join('')}</div></div>`;
  }
  if (f.step === 'kind') {
    return bar + `<div class="stack"><h1>Kindgerecht?</h1><p class="muted">${esc(f.cat)}</p><div class="big3">` +
      '<button data-act="extraKind" data-k="ja">Ja<span class="muted" style="font-weight:400;margin-left:8px">nur kindgerechte</span></button>' +
      '<button data-act="extraKind" data-k="nein">Nein<span class="muted" style="font-weight:400;margin-left:8px">nur nicht kindgerechte</span></button>' +
      '<button data-act="extraKind" data-k="egal">Egal</button></div></div>';
  }
  const cards = f.sugg.length ? f.sugg.map((id, k) => suggCard(id, k === 0)).join('') : `<div class="card muted">Keine passenden ${esc(f.cat)}-Gerichte übrig.</div>`;
  const tag = f.kindSel === 'ja' ? ' · kindgerecht' : f.kindSel === 'nein' ? ' · nicht kindgerecht' : '';
  return bar + `<div class="stack"><h1>Drei Vorschläge</h1><p class="muted">${esc(f.cat)}${tag}</p>` +
    (f.hint ? `<div class="hint">${esc(f.hint)}</div>` : '') + `<div class="sugg">${cards}</div>` +
    '<div class="row2"><button class="btn ghost" data-act="renew">3 neue Vorschläge</button><button class="btn ghost" data-act="manual">Selbst wählen</button></div></div>';
}

function suggestExtraNow(f) {
  const planIds = S.plan && !S.plan.reviewed ? S.plan.items.map((i) => i.id) : [];
  const r = suggestExtra({ dishes: S.dishes, today: today(), settings: S.settings, cat: f.cat, kindSel: f.kindSel, planIds, shown: f.shown });
  f.sugg = r.ids;
  f.hint = r.hint;
  r.ids.forEach((id) => { if (!f.shown.includes(id)) f.shown.push(id); });
}

function addExtraDish(id) {
  if (!S.plan || S.plan.reviewed) S.plan = createPlan([id], today());
  else S.plan = addExtra(S.plan, id, today());
  S.flow = null;
  S.tab = 'week';
  render();
  toast('Gericht zur Woche hinzugefügt');
  window.scrollTo(0, 0);
}

/* ---------- dishes ---------- */

function dishesTab() {
  const q = S.q.trim().toLowerCase();
  const all = dishes();
  const list = all.filter((d) => (S.fcat === 'Alle' || d.cat === S.fcat) && (!q || d.name.toLowerCase().includes(q)))
    .sort((a, b) => {
      const ga = gapDays(a, today()); const gb = gapDays(b, today());
      return (gb === Infinity ? 1e9 : gb) - (ga === Infinity ? 1e9 : ga) || a.name.localeCompare(b.name, 'de');
    });
  const rows = list.map((d) => `<button class="dish" data-act="editDish" data-id="${d.id}"><div class="dish-main"><div class="dish-name">${esc(d.name)}</div>${dishMeta(d, true)}</div></button>`).join('');
  const chips = ['Alle', ...CATS].map((c) => `<button class="fchip" data-act="fcat" data-c="${c}" aria-pressed="${S.fcat === c}">${c}</button>`).join('');
  if (!all.length) {
    return `<div class="stack">${banners()}<h1>Gerichte</h1><div class="empty"><p>Noch keine Gerichte. Lege die Gerichte an, die ihr kocht. Name und Kategorie genügen.</p><button class="btn" data-act="newDish">Erstes Gericht anlegen</button></div></div>`;
  }
  return `<div class="stack">${banners()}<h1>Gerichte <span class="muted" style="font-size:18px;font-weight:600">${all.length}</span></h1>` +
    '<button class="btn block" data-act="newDish">Neues Gericht</button>' +
    `<input class="search" id="q" type="search" placeholder="Gerichte durchsuchen" value="${esc(S.q)}" autocomplete="off">` +
    `<div class="chips">${chips}</div>` +
    '<p class="notice">Sortiert nach der längsten Pause. Gelb markiert: lange nicht gekocht.</p>' +
    `<div class="list">${rows || '<p class="muted">Keine Treffer.</p>'}</div></div>`;
}

function formSheet(id, cat) {
  const d = id ? byId(id) : { name: '', cat: cat || 'Fleisch', kind: false, minutes: null };
  const cats = CATS.map((c) => `<label><input type="radio" name="cat" value="${c}" ${d.cat === c ? 'checked' : ''}><span>${c}</span></label>`).join('');
  openSheet(`<form id="dform" data-id="${id || ''}" novalidate style="display:flex;flex-direction:column;gap:14px">` +
    `<h2>${id ? 'Gericht bearbeiten' : 'Neues Gericht'}</h2>` +
    `<div><label class="lbl" for="f-name">Name</label><input class="field" id="f-name" type="text" value="${esc(d.name)}" autocomplete="off" placeholder="z. B. Käsespätzle"></div>` +
    `<div><span class="lbl" style="display:block">Kategorie</span><div class="seg" role="radiogroup" aria-label="Kategorie">${cats}</div></div>` +
    `<div><label class="lbl" for="f-min">Dauer in Minuten (freiwillig)</label><input class="field" id="f-min" type="number" inputmode="numeric" min="1" max="600" value="${d.minutes || ''}" placeholder="z. B. 30"></div>` +
    `<label class="check"><input type="checkbox" id="f-kind" ${d.kind ? 'checked' : ''}><span>Kindgerecht</span></label>` +
    '<p class="err" id="f-err" role="alert"></p>' +
    '<button type="submit" class="btn block" data-next="0">Speichern</button>' +
    (id ? '' : '<button type="submit" class="btn ghost block" data-next="1">Speichern und nächstes</button>') +
    '<button type="button" class="btn ghost block" data-act="closeSheet">Abbrechen</button>' +
    (id ? `<button type="button" class="btn danger block" data-act="delDish" data-id="${id}">Löschen</button>` : '') + '</form>');
  setTimeout(() => { const e = $('#f-name'); if (e) e.focus(); }, 40);
}

function submitForm(e) {
  e.preventDefault();
  const id = e.target.dataset.id || null;
  const err = $('#f-err');
  const minRaw = $('#f-min').value.trim();
  const input = {
    name: $('#f-name').value.trim(),
    cat: (e.target.querySelector('input[name=cat]:checked') || {}).value,
    kind: $('#f-kind').checked,
    minutes: minRaw === '' ? null : Number(minRaw),
  };
  const v = validateDish(input);
  if (!v.ok) { err.textContent = v.errors[0]; return; }
  if (findDuplicateName(S.dishes, input.name, id)) { err.textContent = 'Dieses Gericht gibt es schon.'; return; }
  if (id) {
    S.dishes = S.dishes.map((d) => (d.id === id ? updateDish(d, input) : d));
  } else {
    S.dishes = [...S.dishes, createDish(input)];
  }
  const next = e.submitter && e.submitter.dataset.next === '1';
  closeSheet();
  render();
  if (next) { formSheet(null, input.cat); toast(`„${input.name}“ gespeichert`); }
}

/* ---------- backup and settings ---------- */

let pendingImport = null;

function backupTab() {
  const total = dishes().length;
  const kb = Math.max(1, Math.round(JSON.stringify(exportData(S.dishes)).length / 1024));
  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare;
  const last = S.lastExport ? `Letzte Sicherung: ${fmtDate(S.lastExport)}` : 'Noch keine Sicherung erstellt.';
  return `<div class="stack">${banners()}<h1>Sicherung</h1>` +
    `<div class="card"><h3>Export</h3><p class="muted" style="margin:6px 0 12px">Erzeugt eine Datei mit allen Gerichten (${total}) und der Historie, etwa ${kb} KB. Die Datei schickt ihr euch per Messenger oder Mail. ${last}</p>` +
    `<div class="row2"><button class="btn" data-act="exportSave">Datei speichern</button>${canShare ? '<button class="btn ghost" data-act="exportShare">Teilen</button>' : ''}</div></div>` +
    '<div class="card"><h3>Import</h3><p class="muted" style="margin:6px 0 12px">Führt die Datei mit euren Gerichten zusammen. Nichts wird einfach überschrieben. Vorher seht ihr eine Vorschau.</p>' +
    '<button class="btn ghost block" data-act="importPick">Datei auswählen</button><input class="hidden-file" id="ifile" type="file" accept=".json,application/json" tabindex="-1"></div>' +
    `<div class="card"><h3>Einstellungen</h3>${stepper('sperrfrist', 'Sperrfrist', 'Gerichte der letzten Tage werden nicht vorgeschlagen', S.settings.sperrfrist, 0, 30)}</div>` +
    `<p class="notice">${S.persisted === true ? 'Der Browser behält die Daten dauerhaft. ' : ''}Die App erinnert nach jeweils 4 Plänen ans Exportieren. Seit der letzten Sicherung: ${S.plansSinceExport} von 4 Plänen.</p></div>`;
}

function exportText() {
  return JSON.stringify(exportData(S.dishes, new Date().toISOString()));
}
const exportName = () => `wochenkueche-${today()}.json`;

function markExported() {
  S.plansSinceExport = 0;
  S.lastExport = today();
  render();
}

function downloadFile(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function shareFile() {
  const file = new File([exportText()], exportName(), { type: 'application/json' });
  if (!(navigator.canShare && navigator.canShare({ files: [file] }))) {
    downloadFile(file.name, exportText());
    markExported();
    toast('Teilen geht hier nicht. Die Datei wurde gespeichert.');
    return;
  }
  try {
    await navigator.share({ files: [file], title: 'Wochenküche Sicherung' });
    markExported();
  } catch (e) {
    if (e && e.name !== 'AbortError') toast('Teilen hat nicht geklappt. Nutze "Datei speichern".');
  }
}

function showImportPreview(text) {
  const parsed = parseImport(text);
  if (!parsed.ok) { openSheet(`<h2>Import nicht möglich</h2><p>${esc(parsed.error)}</p><button class="btn block" data-act="closeSheet">Schließen</button>`); return; }
  pendingImport = parsed.data;
  const p = previewImport(S.dishes, parsed.data.dishes);
  const warn = p.nameConflicts.length
    ? `<div class="warn"><b>Gleiche Namen mit unterschiedlicher Kennung:</b><ul>${p.nameConflicts.map((n) => `<li>${esc(n)}</li>`).join('')}</ul><p style="margin-top:6px">Diese Gerichte werden als eigene Gerichte hinzugefügt. Lösche Doppelte danach von Hand.</p></div>` : '';
  const nothing = !p.added && !p.changed && !p.removed && !p.historyUpdated;
  openSheet('<h2>Vorschau des Imports</h2>' +
    `<div class="needs"><span>${p.added} neue</span><span>${p.changed} geändert</span><span>${p.removed} gelöscht</span><span>${p.historyUpdated} Historien-Einträge</span></div>` +
    (nothing ? '<p class="muted">Die Datei bringt nichts Neues.</p>' : '<p>Nichts wird überschrieben. Wenn ihr ein Gericht beide geändert habt, gewinnt die jüngere Änderung. Beim Datum "zuletzt gekocht" gewinnt das jüngere.</p>') + warn +
    `<button class="btn block" data-act="importOk" ${nothing ? 'disabled' : ''}>Importieren</button><button class="btn ghost block" data-act="closeSheet">Abbrechen</button>`);
}

/* ---------- rendering ---------- */

function render() {
  const f = S.flow;
  let html;
  if (f) {
    html = f.type === 'review' ? reviewScreen() : f.type === 'setup' ? setupScreen() : f.type === 'pick' ? pickScreen() : extraScreen();
    $('#nav').style.display = 'none';
  } else {
    html = S.tab === 'week' ? weekTab() : S.tab === 'dishes' ? dishesTab() : backupTab();
    $('#nav').style.display = '';
  }
  const a = document.activeElement;
  const keep = a && a.id === 'q';
  $('#app').innerHTML = html;
  if (keep) { const q = $('#q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  const ic = {
    week: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
    dishes: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
    backup: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  };
  const names = { week: 'Woche', dishes: 'Gerichte', backup: 'Sicherung' };
  $('#navin').innerHTML = ['week', 'dishes', 'backup'].map((k) => `<button data-act="tab" data-t="${k}" ${S.tab === k ? 'aria-current="page"' : ''}>${ic[k]}${names[k]}</button>`).join('');
  persist();
}

/* ---------- actions ---------- */

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act;
  const f = S.flow;
  if (a === 'closeSheet') { if (el.classList.contains('scrim') && e.target !== el) return; closeSheet(); return; }
  if (a === 'tab') { S.tab = el.dataset.t; render(); window.scrollTo(0, 0); return; }
  if (a === 'startPlan') { startPlan(); render(); window.scrollTo(0, 0); return; }
  if (a === 'startExtra') { S.flow = { type: 'extra', step: 'cat', cat: null, kindSel: null, sugg: [], shown: [], hint: '' }; render(); window.scrollTo(0, 0); return; }
  if (a === 'cancelFlow') { S.flow = null; render(); return; }

  if (a === 'reviewRow') { reviewSheet(+el.dataset.i); return; }
  if (a === 'reviewSet') {
    const it = f.items[+el.dataset.i];
    const s = el.dataset.s;
    if (s === 'other') {
      it.status = 'other'; it.other = null;
      S.rIdx = +el.dataset.i;
      openSheet('<h2>Welches Gericht wurde gekocht?</h2><input class="search" id="rq" type="search" placeholder="Gericht suchen" autocomplete="off"><div class="list" id="rlist"></div><button class="btn ghost block" data-act="closeSheet">Abbrechen</button>');
      fillReviewList('');
      return;
    }
    it.status = s; it.other = null; closeSheet(); render(); return;
  }
  if (a === 'reviewPick') { f.items[S.rIdx].other = el.dataset.id; closeSheet(); render(); return; }
  if (a === 'reviewAllNo') { f.items.forEach((it) => { it.status = 'no'; it.other = null; }); render(); return; }
  if (a === 'reviewDone') {
    const items = f.items.map((it) => (it.status === 'other' && !it.other ? { ...it, status: 'no' } : it));
    const res = applyReview(S.dishes, S.plan, items);
    S.dishes = res.dishes;
    S.plan = res.plan;
    toSetup();
    render();
    window.scrollTo(0, 0);
    return;
  }

  if (a === 'step') {
    const k = el.dataset.k;
    const d = +el.dataset.d;
    if (k === 'sperrfrist') { S.settings.sperrfrist = Math.max(0, Math.min(30, S.settings.sperrfrist + d)); render(); return; }
    if (k === 'days') f.days = Math.max(1, Math.min(7, f.days + d));
    else if (k === 'kind') f.kind = Math.max(0, Math.min(f.days, f.kind + d));
    else f.t[k] = Math.max(0, f.t[k] + d);
    clampSetup(f);
    render();
    return;
  }
  if (a === 'setupDone') {
    S.lastSetup = { days: f.days, t: clone(f.t), kind: f.kind };
    S.flow = { type: 'pick', days: f.days, t: clone(f.t), kind: f.kind, chosen: [], sugg: [], shown: [], hint: '' };
    suggestDay(S.flow, false);
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (a === 'choose') {
    if (f.type === 'pick') {
      f.chosen.push(el.dataset.id); f.shown = [];
      if (f.chosen.length < f.days) suggestDay(f, false);
      render(); window.scrollTo(0, 0);
    } else addExtraDish(el.dataset.id);
    return;
  }
  if (a === 'renew') { if (f.type === 'pick') suggestDay(f, true); else suggestExtraNow(f); render(); return; }
  if (a === 'manual') { openPicker(); return; }
  if (a === 'pickDish') {
    closeSheet();
    if (f.type === 'pick') {
      f.chosen.push(el.dataset.id); f.shown = [];
      if (f.chosen.length < f.days) suggestDay(f, false);
      render(); window.scrollTo(0, 0);
    } else addExtraDish(el.dataset.id);
    return;
  }
  if (a === 'undo') { if (f.chosen.length) { f.chosen.pop(); f.shown = []; suggestDay(f, false); render(); } return; }
  if (a === 'savePlan') {
    S.plan = createPlan(f.chosen.slice(), today());
    S.plansSinceExport += 1;
    S.flow = null; S.tab = 'week';
    render(); toast('Plan gespeichert'); window.scrollTo(0, 0);
    return;
  }
  if (a === 'extraCat') { f.cat = el.dataset.c; f.step = 'kind'; render(); return; }
  if (a === 'extraKind') { f.kindSel = el.dataset.k; f.step = 'sugg'; f.shown = []; suggestExtraNow(f); render(); return; }

  if (a === 'fcat') { S.fcat = el.dataset.c; render(); return; }
  if (a === 'newDish') { formSheet(null, S.fcat === 'Alle' ? null : S.fcat); return; }
  if (a === 'editDish') { formSheet(el.dataset.id); return; }
  if (a === 'delDish') {
    if (el.dataset.armed) {
      const id = el.dataset.id;
      S.dishes = S.dishes.map((d) => (d.id === id ? deleteDish(d) : d));
      closeSheet(); render(); toast('Gericht gelöscht');
      return;
    }
    el.dataset.armed = '1'; el.textContent = 'Wirklich löschen?';
    return;
  }

  if (a === 'exportSave') { downloadFile(exportName(), exportText()); markExported(); toast('Sicherung gespeichert'); return; }
  if (a === 'exportShare') { shareFile(); return; }
  if (a === 'importPick') { const i = $('#ifile'); if (i) i.click(); return; }
  if (a === 'importOk') {
    if (pendingImport) { S.dishes = mergeDishes(S.dishes, pendingImport.dishes); pendingImport = null; }
    closeSheet(); render(); toast('Import abgeschlossen');
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'q') { S.q = e.target.value; render(); }
  else if (e.target.id === 'pq') { $('#plist').innerHTML = pickerList(e.target.value); }
  else if (e.target.id === 'rq') { fillReviewList(e.target.value); }
});

document.addEventListener('change', (e) => {
  if (e.target.id !== 'ifile') return;
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => showImportPreview(String(reader.result));
  reader.onerror = () => openSheet('<h2>Import nicht möglich</h2><p>Die Datei konnte nicht gelesen werden.</p><button class="btn block" data-act="closeSheet">Schließen</button>');
  reader.readAsText(file);
  e.target.value = '';
});

document.addEventListener('submit', (e) => { if (e.target.id === 'dform') submitForm(e); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

/* ---------- start ---------- */

function resumeDraft() {
  const d = S.draft;
  if (!d) return;
  try {
    if (d.type === 'review') {
      if (!needsReview(S.plan)) return;
      d.items = d.items.filter((it) => byId(it.id));
      if (!d.items.length) return;
      S.flow = d;
    } else if (d.type === 'setup') {
      S.flow = d;
    } else if (d.type === 'pick') {
      d.chosen = d.chosen.filter((id) => byId(id));
      d.shown = [];
      if (d.chosen.length < d.days) suggestDay(d, false);
      S.flow = d;
    }
  } catch {
    S.flow = null;
  }
}

resumeDraft();
render();
requestPersistence().then((ok) => { S.persisted = ok; if (!S.flow && S.tab === 'backup') render(); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
