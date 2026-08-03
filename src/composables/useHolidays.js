import { state, setStatus } from "../store.js";
import { iso, daysInMonth, monthKey } from "../utils/date.js";

// Czech public holidays, merged into the shared dayKey -> name map. The map is
// only ever added to: entries are keyed by full date, so months can't collide,
// and a slow or failed fetch can never blank the holidays already on screen.
// One request per month, remembered for the session (the month view and the day
// view both ask for the same month, and navigating back re-asks).
const loaded = new Map(); // "YYYY-MM" -> in-flight or settled request

export function loadHolidays(year, month){
  const first = new Date(year, month, 1);
  const period = monthKey(first);
  let request = loaded.get(period);
  if (!request){
    request = fetchMonth(first).catch(err => {
      loaded.delete(period); // let the next visit retry
      setStatus("Holidays could not be loaded: " + err.message);
    });
    loaded.set(period, request);
  }
  return request;
}

async function fetchMonth(first){
  const url = `https://svatkyapi.cz/api/day/${iso(first)}/interval/${daysInMonth(first)}`;
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  const days = Array.isArray(data) ? data : Array.isArray(data?.days) ? data.days : [data];
  for (const d of days){
    if (d && d.isHoliday && d.date) state.holidays.set(d.date, d.holidayName || "Public holiday");
  }
}
