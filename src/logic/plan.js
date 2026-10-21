// The weekly plan and the review. A plan is a plain list of dishes without fixed weekdays.
// No screen code in here. Nothing is changed in place, every function returns new data.

import { maxDate } from './dates.js';

// ids: the chosen dishes. today: the day the planning was finished (counts as the cooking date).
export function createPlan(ids, today) {
  return { date: today, reviewed: false, items: ids.map((id) => ({ id, addedOn: today })) };
}

// Adds one dish to the running week. The date it is added counts as its cooking date.
export function addExtra(plan, id, today) {
  if (plan.items.some((i) => i.id === id)) return plan;
  return { ...plan, items: [...plan.items, { id, addedOn: today }] };
}

export function needsReview(plan) {
  return !!plan && !plan.reviewed && plan.items.length > 0;
}

export function canStartPlanning(plan) {
  return !needsReview(plan);
}

// In the review every dish starts as "cooked".
export function defaultReview(plan) {
  return plan.items.map((i) => ({ id: i.id, status: 'ok' }));
}

// status: 'ok' (cooked), 'no' (not cooked), 'other' (another dish was cooked, give its id as "other"), 'out' (ate out or ordered)
// Cooked dishes get the date they were planned for, but never an older date than they already have.
export function applyReview(dishes, plan, review) {
  const dates = new Map();
  for (const r of review) {
    const item = plan.items.find((i) => i.id === r.id);
    if (!item) continue;
    if (r.status === 'ok') dates.set(r.id, maxDate(dates.get(r.id), item.addedOn));
    if (r.status === 'other' && r.other) dates.set(r.other, maxDate(dates.get(r.other), item.addedOn));
  }
  const next = dishes.map((d) => (dates.has(d.id) ? { ...d, lastCooked: maxDate(d.lastCooked, dates.get(d.id)) } : { ...d }));
  return { dishes: next, plan: { ...plan, reviewed: true, items: plan.items.map((i) => ({ ...i })) } };
}
