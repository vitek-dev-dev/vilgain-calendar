import { state, setStatus, setCuPill } from "../store.js";
import { iso } from "../utils/date.js";

export function cuReady(){ return !!(state.config.token && state.config.teamId); }

// On-call task names are user-supplied regexes, matched case-insensitively and
// unanchored (use ^…$ for an exact match). Compiled patterns are cached because
// isOnCallTask() runs per time entry; invalid patterns compile to null and never
// match.
const onCallReCache = new Map();

function onCallRegex(pattern){
  if (onCallReCache.has(pattern)) return onCallReCache.get(pattern);
  let re = null;
  try { re = new RegExp(pattern, "i"); } catch { re = null; }
  onCallReCache.set(pattern, re);
  return re;
}

// Blank patterns count as valid so a freshly added, still-empty row isn't flagged.
export function isValidOnCallPattern(pattern){
  const p = String(pattern ?? "").trim();
  return !p || !!onCallRegex(p);
}

export function isOnCallTask(name){
  if (!name) return false;
  const n = String(name).trim();
  if (!n) return false;
  return (state.config.onCallTasks || []).some(t => {
    const p = String(t).trim();
    if (!p) return false;
    const re = onCallRegex(p);
    return !!re && re.test(n);
  });
}

export async function cuFetch(path, params){
  const token = state.config.token;
  if (!token) throw new Error("Chybí token");
  const qs = params ? ("?" + new URLSearchParams(params)) : "";
  const res = await fetch(`https://api.clickup.com/api/v2${path}${qs}`, {
    headers: { "Authorization": token, "Accept": "application/json" },
  });
  if (!res.ok){
    const body = await res.text().catch(() => "");
    throw new Error(`ClickUp ${res.status}${body ? ": " + body.slice(0, 200) : ""}`);
  }
  return res.json();
}

// Create a single time entry via ClickUp's "Create a time entry" endpoint
// (POST /team/{teamId}/time_entries). `start` and `duration` are epoch ms.
// Attaches to a task when `taskId` is given, otherwise logs a description-only
// entry. Assigns to the configured assignee when set (requires an admin token).
export async function cuCreateTimeEntry({ start, stop, duration, description, taskId, billable }){
  const token = state.config.token;
  if (!token) throw new Error("Chybí token");
  if (!state.config.teamId) throw new Error("No workspace selected");
  // Send both `stop` and `duration`. With `duration` alone ClickUp leaves the
  // entry's end unset ("Invalid date"), so we pass the explicit end timestamp.
  const body = { start, stop, duration, billable: !!billable };
  if (description) body.description = description;
  if (taskId) body.tid = taskId;
  if (state.config.assigneeId) body.assignee = Number(state.config.assigneeId);
  const res = await fetch(`https://api.clickup.com/api/v2/team/${state.config.teamId}/time_entries`, {
    method: "POST",
    headers: {
      "Authorization": token,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok){
    const b = await res.text().catch(() => "");
    throw new Error(`ClickUp ${res.status}${b ? ": " + b.slice(0, 200) : ""}`);
  }
  return res.json();
}

export async function cuLoadAccount(){
  const [u, t] = await Promise.all([cuFetch("/user"), cuFetch("/team")]);
  state.cuUser = u.user;
  state.cuTeams = t.teams || [];
}

export async function cuLoadTimeEntries(year, month){
  state.entries.clear();
  state.onCall.clear();
  if (!cuReady()) return;
  const first = new Date(year, month, 1, 0, 0, 0, 0);
  // Extend the window one extra day so entries that start on the last day of the
  // month but end after midnight (e.g. an On Call shift ending at 00:00) are still
  // returned by ClickUp. We bucket by the entry's start day below, so the extra
  // day's entries land on a next-month key and are simply not rendered this month.
  const last = new Date(year, month + 1, 1, 23, 59, 59, 999);
  // ClickUp treats start_date as an exclusive lower bound, so an entry starting
  // exactly at midnight of the 1st (== first) is dropped. Nudge the bound back a
  // millisecond so that boundary entry is returned; anything pulled from the tail
  // of the previous day is bucketed to a previous-month key and not rendered here.
  const params = { start_date: String(first.getTime() - 1), end_date: String(last.getTime()) };
  if (state.config.assigneeId) params.assignee = String(state.config.assigneeId);
  try {
    const json = await cuFetch(`/team/${state.config.teamId}/time_entries`, params);
    const list = json.data || [];
    for (const e of list){
      const start = new Date(Number(e.start));
      const key = iso(start);
      const hours = Math.max(0, Number(e.duration) || 0) / 3600000;
      const name = (e.task && e.task.name) || e.description || "";
      if (isOnCallTask(name)){
        state.onCall.set(key, (state.onCall.get(key) || 0) + hours);
      } else {
        state.entries.set(key, (state.entries.get(key) || 0) + hours);
      }
    }
    setCuPill("ok", `ClickUp: ${list.length} entries`);
  } catch (err){
    setCuPill("err", "ClickUp: error");
    setStatus("ClickUp: " + err.message);
  }
}

export async function cuLoadDayEntries(){
  state.dayEntries = [];
  if (!cuReady()) return;
  const d = state.dayCursor;
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  // Query from the start of the previous day through the end of the next day so a
  // shift that crosses this day's midnight in either direction — e.g. an On Call
  // block that began the evening before and is still running at 00:00, or one that
  // ends after midnight — is returned by ClickUp. We narrow back to entries that
  // actually fall on this day below.
  const queryStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 0, 0, 0, 0);
  const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 23, 59, 59, 999);
  const params = { start_date: String(queryStart.getTime()), end_date: String(dayEnd.getTime()) };
  if (state.config.assigneeId) params.assignee = String(state.config.assigneeId);
  try {
    const json = await cuFetch(`/team/${state.config.teamId}/time_entries`, params);
    const list = json.data || [];
    const dayStartMs = dayStart.getTime();
    const nextMidnightMs = dayStartMs + 24 * 3600000;
    const entries = [];
    for (const e of list){
      const startMs = Number(e.start);
      const durMs = Math.max(0, Number(e.duration) || 0);
      const endMs = e.end ? Number(e.end) : startMs + durMs;
      // The window above also returns the neighbouring days' entries. Keep only
      // those that start on the viewed day or overlap into it (an overnight shift
      // that began the day before and is still running through this midnight).
      const startsInDay = startMs >= dayStartMs && startMs < nextMidnightMs;
      const overlapsDay = startMs < dayStartMs && endMs > dayStartMs;
      if (!startsInDay && !overlapsDay) continue;
      const task = e.task || {};
      entries.push({
        id: e.id,
        start: new Date(startMs),
        end: new Date(endMs),
        durationMs: durMs,
        hours: durMs / 3600000,
        taskId: task.id || null,
        taskCustomId: task.custom_id || null,
        taskName: task.name || e.description || "(bez úkolu)",
        description: e.description || "",
        taskStatus: (task.status && task.status.status) || "",
        billable: !!e.billable,
      });
    }
    entries.sort((a, b) => a.start.getTime() - b.start.getTime());
    state.dayEntries = entries;
    setCuPill("ok", `ClickUp: ${entries.length} ${entries.length === 1 ? "entry" : "entries"} this day`);
  } catch (err){
    setCuPill("err", "ClickUp: error");
    setStatus("ClickUp: " + err.message);
  }
}

// Normalize a ClickUp task into the flat shape the Tasks view consumes. Status
// name/color and priority come straight from ClickUp so real workspace statuses
// (and their colors) drive the grouping rather than a fixed set.
function normalizeTask(t){
  const status = t.status || {};
  const prio = t.priority && t.priority.priority ? String(t.priority.priority) : "";
  const spentMs = Math.max(0, Number(t.time_spent) || 0);
  const estMs = Math.max(0, Number(t.time_estimate) || 0);
  const orderRaw = Number(status.orderindex);
  return {
    id: t.id,
    title: t.name || "(no name)",
    statusName: status.status || "No status",
    statusColor: status.color || "#94a3b8",
    statusType: status.type || "custom",
    statusOrder: Number.isFinite(orderRaw) ? orderRaw : 999,
    priority: prio,
    list: (t.list && t.list.name) || "",
    url: t.url || (t.id ? `https://app.clickup.com/t/${t.id}` : null),
    spentHours: spentMs / 3600000,
    estHours: estMs / 3600000,
  };
}

// Load open + closed tasks assigned to the current user (or the configured
// assignee) across the workspace, via the "Get Filtered Team Tasks" endpoint.
// Paginated (100/page); we bucket by status in the view model.
export async function cuLoadTasks(){
  // Keep any previously loaded tasks visible while we refetch — only reset the
  // list when there is nothing to show (ClickUp not connected). The fetched data
  // replaces the list atomically below, and on error we keep the stale data.
  if (!cuReady()){ state.tasks = []; return; }
  const assignee = state.config.assigneeId || (state.cuUser && String(state.cuUser.id)) || "";
  const all = [];
  try {
    for (let page = 0; page < 10; page++){
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("include_closed", "true");
      params.set("subtasks", "true");
      params.set("order_by", "updated");
      if (assignee) params.append("assignees[]", assignee);
      const json = await cuFetch(`/team/${state.config.teamId}/task`, params);
      const list = json.tasks || [];
      all.push(...list);
      if (json.last_page || list.length < 100) break;
    }
    state.tasks = all.map(normalizeTask);
    setCuPill("ok", `ClickUp: ${all.length} ${all.length === 1 ? "task" : "tasks"}`);
  } catch (err){
    setCuPill("err", "ClickUp: error");
    setStatus("ClickUp: " + err.message);
  }
}
