import { state, setStatus } from "../store.js";
import { iso, daysInMonth } from "../utils/date.js";

export async function loadHolidays(year, month){
  const firstDay = new Date(year, month, 1);
  const n = daysInMonth(firstDay);
  const url = `https://svatkyapi.cz/api/day/${iso(firstDay)}/interval/${n}`;
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const arr = Array.isArray(data) ? data : Array.isArray(data?.days) ? data.days : [data];
    state.holidays.clear();
    for (const d of arr){
      if (d && d.isHoliday) state.holidays.set(d.date, d.holidayName || "Státní svátek");
    }
  } catch (err){
    state.holidays.clear();
    setStatus("Svátky se nepodařilo načíst: " + err.message);
  }
}
