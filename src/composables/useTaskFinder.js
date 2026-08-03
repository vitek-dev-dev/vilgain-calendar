import { ref } from "vue";
import { state } from "../store.js";
import { cuFetch, cuReady, cuMyUserId } from "./useClickUp.js";

// ClickUp's v2 API has no task-name query parameter, so the finder loads a
// page-capped pool of your tasks once per (workspace, closed) combo and filters
// it in the browser. Pasting a task link or id bypasses the pool entirely
// through GET /task/{id}, which is how you reach a task that is not assigned to
// you or falls outside the pool.
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

// cacheKey -> { tasks, truncated }
const pools = new Map();

// The sprint running today, across every sprint list we have resolved. Shown in
// the Log time header; empty until a pool load has populated listMeta.
export const currentSprint = ref("");

export function clearTaskPools() {
  pools.clear();
  listMeta.clear();
  folderLoaded.clear();
  // Derived from listMeta, so it would otherwise keep naming a sprint resolved
  // under the previous workspace / sprint folder.
  currentSprint.value = "";
}

// ClickUp exposes no sprint flag anywhere in the v2 API, so the sprint is read
// off where the task sits. A task lives in a home List and is *added* to a
// Sprint List via "Tasks in Multiple Lists"; the payload reports those extra
// lists in `locations` (the home list is not among them). Nothing in that
// payload says which of those lists is a sprint, and neither does the List
// itself — so the Sprint Folder is named in settings (config.sprintFolderId).
// Its lists are the sprints, anything else is not, and one request resolves the
// lot. Without it configured, no sprints are detected at all.
//
// listId -> { id, name, start, due, isSprint }, for the lists of that folder.
const listMeta = new Map();
const folderLoaded = new Set();

function toMeta(l) {
  return {
    id: String(l.id),
    name: l.name || "",
    start: Number(l.start_date) || 0,
    due: Number(l.due_date) || 0,
    // A list in the Sprint Folder is a sprint whether or not it carries dates;
    // the dates only decide which one is current.
    isSprint: true,
  };
}

async function ensureSprintFolder() {
  const folderId = String(state.config.sprintFolderId || "");
  if (!folderId || folderLoaded.has(folderId)) return;
  folderLoaded.add(folderId);
  try {
    const json = await cuFetch(`/folder/${encodeURIComponent(folderId)}/list`);
    for (const l of json.lists || []) {
      const meta = toMeta(l);
      listMeta.set(meta.id, meta);
    }
  } catch {
    folderLoaded.delete(folderId); // let the next load retry
  }
}

// Fold the resolved list metadata onto the task, so everything downstream can
// keep reading a plain `task.sprint`.
function stampSprint(task, now) {
  const metas = task.locations
    .map(l => listMeta.get(l.id))
    .filter(m => m && m.isSprint)
    .sort((a, b) => a.start - b.start);

  if (!metas.length) {
    // Not in any sprint — fall back to the folder, flagged so the UI doesn't
    // present a folder name as though it were a sprint.
    task.sprints = [];
    task.sprint = task.folder || "";
    task.sprintIsFolder = !!task.folder;
    task.sprintIsCurrent = false;
    return;
  }
  const current = metas.find(m => now >= m.start && now < m.due) || null;
  const chosen = current || metas[metas.length - 1];
  task.sprints = metas.map(m => m.name);
  task.sprint = chosen.name;
  task.sprintStart = chosen.start;
  task.sprintIsFolder = false;
  task.sprintIsCurrent = !!current;
}

function currentSprintMeta(now) {
  let best = null;
  for (const m of listMeta.values()) {
    if (!m.isSprint || !m.start || !m.due || now < m.start || now >= m.due) continue;
    if (!best || m.start > best.start) best = m;
  }
  return best;
}

function refreshCurrentSprint(now) {
  const best = currentSprintMeta(now);
  currentSprint.value = best ? best.name : "";
}

async function applySprints(tasks) {
  await ensureSprintFolder();
  const now = Date.now();
  for (const t of tasks) stampSprint(t, now);
  refreshCurrentSprint(now);
  return tasks;
}

// Normalized shape the finder UI consumes. Richer than the Tasks view's
// normalizer: it keeps the custom id, the folder/list breadcrumb and the sprint,
// all of which people search by.
function normalize(t) {
  const status = t.status || {};
  const folder = t.folder && !t.folder.hidden ? t.folder.name : "";
  return {
    id: t.id,
    customId: t.custom_id || "",
    title: t.name || "(no name)",
    statusName: status.status || "",
    statusColor: status.color || "#94a3b8",
    list: (t.list && t.list.name) || "",
    folder,
    locations: (t.locations || [])
      .filter(l => l && l.id)
      .map(l => ({ id: l.id, name: l.name || "" })),
    dateUpdated: Number(t.date_updated) || 0,
    // Filled in by applySprints() once the location lists have been resolved.
    sprint: "",
    sprints: [],
    sprintStart: 0,
    sprintIsFolder: false,
    sprintIsCurrent: false,
    url: t.url || (t.id ? `https://app.clickup.com/t/${t.id}` : ""),
  };
}

async function fetchPool({ includeClosed }) {
  const assignee = await cuMyUserId();
  if (!assignee) throw new Error("Couldn't identify your ClickUp account.");
  const tasks = [];
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("include_closed", includeClosed ? "true" : "false");
    params.set("subtasks", "true");
    params.set("order_by", "updated");
    params.append("assignees[]", assignee);
    const json = await cuFetch(`/team/${state.config.teamId}/task`, params);
    const list = json.tasks || [];
    tasks.push(...list.map(normalize));
    if (json.last_page || list.length < PAGE_SIZE) break;
    // Ran out of pages before ClickUp ran out of tasks — the pool is a prefix of
    // the workspace, so the UI tells the user to narrow by link/id instead.
    if (page === MAX_PAGES - 1) truncated = true;
  }
  // Resolve sprints before the pool is handed over, so rows never render with a
  // placeholder that then corrects itself.
  await applySprints(tasks);
  const sprintTasks = await fetchCurrentSprintTasks(new Set(tasks.map(t => t.id)), includeClosed);
  return { tasks, sprintTasks, truncated };
}

// Everything in the sprint running today, whoever it is assigned to, minus what
// the pool above already holds. The picker keeps only the ones matching the
// priority patterns — a shared task you log against is often assigned to someone
// else, so scoping this by assignee would miss exactly the ones wanted. Filtering
// happens at render rather than here, so editing the patterns takes effect
// without a refetch.
async function fetchCurrentSprintTasks(excludeIds, includeClosed) {
  const sprint = currentSprintMeta(Date.now());
  if (!sprint) return [];
  const out = [];
  try {
    for (let page = 0; page < 5; page++) {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("include_closed", includeClosed ? "true" : "false");
      params.set("subtasks", "true");
      const json = await cuFetch(`/list/${encodeURIComponent(sprint.id)}/task`, params);
      const list = json.tasks || [];
      for (const t of list) {
        if (excludeIds.has(t.id)) continue;
        out.push(normalize(t));
      }
      if (json.last_page || list.length < PAGE_SIZE) break;
    }
  } catch {
    return []; // the pool is still usable without them
  }
  const now = Date.now();
  for (const t of out) stampSprint(t, now);
  return out;
}

// A ClickUp task URL (app.clickup.com/t/<teamId>/<id> or /t/<id>), a bare task
// id, or a custom id like "CU-123". Returns null when the text reads as a plain
// search phrase rather than an identifier — a bare word must contain both a
// digit and a letter to be taken for an id, so "standup" stays a search.
const CUSTOM_ID_RE = /^[A-Za-z][A-Za-z0-9]*-\d+$/;

export function parseTaskRef(text) {
  const s = String(text || "").trim();
  if (!s || /\s/.test(s)) return null;

  const m = s.match(/clickup\.com\/t\/(?:\d+\/)?([^/?#]+)/i);
  const token = m ? m[1] : s.replace(/^#/, "");
  if (!token) return null;

  const fromUrl = !!m;
  if (CUSTOM_ID_RE.test(token)) return { id: token, custom: true, fromUrl };
  if (fromUrl) return { id: token, custom: false, fromUrl };
  const looksLikeId = /^[0-9a-z]{6,}$/i.test(token) && /\d/.test(token) && /[a-z]/i.test(token);
  return looksLikeId ? { id: token, custom: false, fromUrl } : null;
}

export async function cuGetTask(taskRef) {
  const params = taskRef.custom
    ? { custom_task_ids: "true", team_id: String(state.config.teamId || "") }
    : undefined;
  const task = normalize(await cuFetch(`/task/${encodeURIComponent(taskRef.id)}`, params));
  await applySprints([task]);
  return task;
}

// Match every whitespace-separated term against the task's searchable text, then
// rank by how well the first term hits the title: prefix beats word-start beats
// mid-word beats a hit somewhere other than the title. The sort is stable, so
// ClickUp's recently-updated order survives inside a rank.
// Returns [{ task, rank }] for everything matching, rank 0 when there is no
// query. Ordering is left to sortHits() so the chosen sort mode can decide how
// much weight relevance carries.
export function searchTasks(tasks, query) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return tasks.map(task => ({ task, rank: 0 }));
  const terms = q.split(/\s+/);
  const hits = [];
  for (const t of tasks) {
    const title = t.title.toLowerCase();
    // Every list the task sits in, so an older sprint still finds it.
    const places = t.locations.map(l => l.name).join(" ");
    const hay =
      `${title} ${t.customId} ${places} ${t.list} ${t.folder} ${t.statusName}`.toLowerCase();
    if (!terms.every(term => hay.includes(term))) continue;
    const i = title.indexOf(terms[0]);
    const rank = i === 0 ? 0 : i > 0 ? (/[\s\-_/[\]]/.test(title[i - 1]) ? 1 : 2) : 3;
    hits.push({ task: t, rank });
  }
  return hits;
}

export const SORT_MODES = [
  { key: "default", label: "Default" },
  { key: "worked", label: "Most worked on" },
  { key: "recent", label: "Last worked on" },
  { key: "updated", label: "Last updated" },
];

// Priority task patterns (config.priorityTasks) — regexes matched against the
// title, pinning matches to the top of the Default sort.
const prioReCache = new Map();

function prioRegex(pattern) {
  if (prioReCache.has(pattern)) return prioReCache.get(pattern);
  let re = null;
  try {
    re = new RegExp(pattern, "i");
  } catch {
    re = null;
  }
  prioReCache.set(pattern, re);
  return re;
}

export function isValidPriorityPattern(pattern) {
  const p = String(pattern ?? "").trim();
  return !p || !!prioRegex(p);
}

export function isPriorityTask(task) {
  const title = task && task.title;
  if (!title) return false;
  return (state.config.priorityTasks || []).some(p => {
    const s = String(p).trim();
    if (!s) return false;
    const re = prioRegex(s);
    return !!re && re.test(title);
  });
}

// Sprint ordering: the sprint running today first, then the most recent sprints,
// then tasks in no sprint at all. Descending, so a bigger key sorts earlier.
function sprintKey(t) {
  if (t.sprintIsCurrent) return Number.MAX_SAFE_INTEGER;
  if (t.sprintIsFolder || !t.sprintStart) return -1;
  return t.sprintStart;
}

function bySprintThenName(a, b) {
  const d = sprintKey(b.task) - sprintKey(a.task);
  if (d) return d;
  return a.task.title.localeCompare(b.task.title);
}

function statOf(hit, stats) {
  return (stats && stats.get(hit.task.id)) || { hours: 0, last: 0 };
}

export function sortHits(hits, { mode, stats, hasQuery }) {
  const out = hits.slice();
  if (mode === "worked") {
    out.sort((a, b) => statOf(b, stats).hours - statOf(a, stats).hours || bySprintThenName(a, b));
  } else if (mode === "recent") {
    out.sort((a, b) => statOf(b, stats).last - statOf(a, stats).last || bySprintThenName(a, b));
  } else if (mode === "updated") {
    // Straight off the task's own date_updated — no time entries involved.
    out.sort((a, b) => b.task.dateUpdated - a.task.dateUpdated || bySprintThenName(a, b));
  } else {
    // Default: pinned tasks first, then relevance while searching, then sprint
    // and name.
    out.sort(
      (a, b) =>
        (isPriorityTask(a.task) ? 0 : 1) - (isPriorityTask(b.task) ? 0 : 1) ||
        (hasQuery ? a.rank - b.rank : 0) ||
        bySprintThenName(a, b),
    );
  }
  return out;
}

function poolKey(includeClosed) {
  return `${state.config.teamId}|${includeClosed ? "closed" : "open"}`;
}

// key -> in-flight fetch. Shared so the boot-time prewarm and a drawer opening
// moments later join the same request instead of racing two identical sweeps.
const inflight = new Map();

function fetchPoolOnce(key, includeClosed) {
  if (inflight.has(key)) return inflight.get(key);
  const p = fetchPool({ includeClosed })
    .then(pool => {
      pools.set(key, pool);
      return pool;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// Warm the cache on boot so the Log time drawer opens against a populated list
// instead of a spinner. Failures are swallowed — nothing is on screen to report
// them against, and opening the drawer will retry and surface them properly.
export function prewarmTaskPool({ includeClosed = false } = {}) {
  if (!cuReady()) return;
  const key = poolKey(includeClosed);
  if (pools.has(key) || inflight.has(key)) return;
  fetchPoolOnce(key, includeClosed).catch(() => {});
}

export function useTaskFinder() {
  // `loading` blocks the list (nothing to show yet); `refreshing` is a silent
  // revalidation behind data that is already on screen.
  const loading = ref(false);
  const refreshing = ref(false);
  const error = ref("");
  const tasks = ref([]);
  // Current-sprint tasks not assigned to you, kept apart from the pool so only
  // the Default sort surfaces them.
  const sprintTasks = ref([]);
  const truncated = ref(false);

  function apply(pool) {
    tasks.value = pool.tasks;
    sprintTasks.value = pool.sprintTasks || [];
    truncated.value = pool.truncated;
  }

  async function load({ includeClosed, force = false }) {
    if (!cuReady()) {
      tasks.value = [];
      sprintTasks.value = [];
      error.value = "Connect ClickUp in settings (⚙) first.";
      return;
    }
    const key = poolKey(includeClosed);
    const cached = pools.get(key);
    // Show what we already have immediately, then decide whether to revalidate.
    if (cached) {
      apply(cached);
      error.value = "";
      if (!force) return;
    }

    // With data on screen the refetch is silent: no spinner over the list, and a
    // failure leaves the stale list alone rather than emptying it.
    const silent = !!cached;
    if (silent) refreshing.value = true;
    else loading.value = true;
    error.value = "";
    try {
      apply(await fetchPoolOnce(key, includeClosed));
    } catch (err) {
      if (!silent) {
        error.value = err.message;
        tasks.value = [];
        sprintTasks.value = [];
        truncated.value = false;
      }
    } finally {
      refreshing.value = false;
      loading.value = false;
    }
  }

  return { loading, refreshing, error, tasks, sprintTasks, truncated, load };
}
