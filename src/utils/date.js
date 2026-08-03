import { WEEKDAYS_FULL, MONTHS } from "../constants.js";

export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function pad(n) {
  return String(n).padStart(2, "0");
}
export function iso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function monthKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
export function daysInMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

// Week starts Monday: 0=Mon … 6=Sun. Indices >= 5 are the weekend.
export function mondayIndex(d) {
  return (d.getDay() + 6) % 7;
}

export function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

export function formatHours(h) {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

export function formatHoursMinutes(h) {
  if (!isFinite(h) || h <= 0) return "0 min";
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  if (hh === 0) return `${mm} min`;
  if (mm === 0) return `${hh} h`;
  return `${hh} h ${mm} min`;
}

export function timeOfDay(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTodayHeader(date) {
  const wd = WEEKDAYS_FULL[mondayIndex(date)];
  return `${wd}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
