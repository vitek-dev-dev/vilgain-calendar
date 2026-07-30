import { state } from "../store.js";
import { VIEW_LS_KEY } from "../constants.js";
import { startOfMonth, startOfDay } from "../utils/date.js";
import { cuLoadTimeEntries, cuLoadDayEntries, cuLoadTasks } from "./useClickUp.js";
import { ghLoadPRs } from "./useGitHub.js";
import { loadHolidays } from "./useHolidays.js";

function beginLoading(){ state.loading++; }
function endLoading(){ state.loading = Math.max(0, state.loading - 1); }

// Fetch holidays + ClickUp data for the active view in parallel. `loading` is a
// counter so concurrent refreshes don't clear the spinner early.
export async function refresh(){
  beginLoading();
  try {
    if (state.view === "day"){
      await Promise.all([
        loadHolidays(state.dayCursor.getFullYear(), state.dayCursor.getMonth()),
        cuLoadDayEntries(),
      ]);
    } else if (state.view === "tasks"){
      await cuLoadTasks();
    } else if (state.view === "prs"){
      await ghLoadPRs();
    } else if (state.view === "month"){
      await Promise.all([
        loadHolidays(state.cursor.getFullYear(), state.cursor.getMonth()),
        cuLoadTimeEntries(state.cursor.getFullYear(), state.cursor.getMonth()),
      ]);
    }
  } finally {
    endLoading();
  }
}

export function setView(view, opts){
  if (!["month", "day", "tasks", "prs", "templates"].includes(view)) return;
  state.view = view;
  try { localStorage.setItem(VIEW_LS_KEY, view); } catch { /* ignore */ }
  const desiredHash = "#" + view;
  if (!opts?.skipHash && location.hash !== desiredHash){
    try { history.pushState(null, "", desiredHash); } catch { location.hash = desiredHash; }
  }
  refresh();
}

export function shiftMonth(delta){
  state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + delta, 1);
  refresh();
}

export function shiftDay(delta){
  state.dayCursor = new Date(state.dayCursor.getFullYear(), state.dayCursor.getMonth(), state.dayCursor.getDate() + delta);
  refresh();
}

export function goToThisMonth(){
  state.cursor = startOfMonth(new Date());
  refresh();
}

export function goToToday(){
  state.dayCursor = startOfDay(new Date());
  refresh();
}

export function openDay(date){
  state.dayCursor = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  setView("day");
}
