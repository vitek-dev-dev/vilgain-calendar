import { ref, reactive } from "vue";
import { state } from "../store.js";
import { cuFetch, cuReady } from "./useClickUp.js";

// ClickUp's v2 API has no task-name query parameter, so the finder loads a
// page-capped pool of the current assignee's tasks once per (workspace,
// assignee, closed) combo and filters it in the browser. Pasting a task link or
// id bypasses the pool entirely through GET /task/{id}, which is how you reach a
// task that is not assigned to you or falls outside the pool.
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

// cacheKey -> { tasks, truncated }
const pools = new Map();

export function clearTaskPools(){ pools.clear(); }

// ClickUp exposes no sprint flag anywhere in the v2 API, so the sprint is read
// off where the task sits. A task lives in a home List and is *added* to a
// Sprint List via "Tasks in Multiple Lists"; the payload reports those extra
// lists in `locations` (the home list is not among them).
//
// Not every such list is a sprint, though — a task can equally be added to a
// plain working list. What separates them is dates: ClickUp gives a Sprint List
// a real start/due range, and leaves both null on an ordinary list. So we look
// each location up once via GET /list/{id} and treat only the dated ones as
// sprints; the one whose range contains today is the current sprint.
//
// listId -> { id, name, start, due, isSprint }. Session-lived: sprint boundaries
// don't move, and a failed lookup is cached as "not a sprint" so it is not
// retried on every pool load.
const listMeta = new Map();
const META_CONCURRENCY = 8;
const META_MAX = 120;

async function fetchListMeta(id){
  if (listMeta.has(id)) return listMeta.get(id);
  let meta = { id, name: "", start: 0, due: 0, isSprint: false };
  try {
    const l = await cuFetch(`/list/${encodeURIComponent(id)}`);
    const start = Number(l.start_date) || 0;
    const due = Number(l.due_date) || 0;
    meta = { id, name: l.name || "", start, due, isSprint: !!(start && due) };
  } catch {
    // Keep the "not a sprint" default.
  }
  listMeta.set(id, meta);
  return meta;
}

// Resolve every location we haven't seen before, in bounded parallel batches.
async function resolveListMeta(tasks){
  const seen = new Set();
  const todo = [];
  for (const t of tasks){
    for (const l of t.locations){
      if (!l.id || seen.has(l.id) || listMeta.has(l.id)) continue;
      seen.add(l.id);
      todo.push(l.id);
    }
  }
  const capped = todo.slice(0, META_MAX);
  for (let i = 0; i < capped.length; i += META_CONCURRENCY){
    await Promise.all(capped.slice(i, i + META_CONCURRENCY).map(fetchListMeta));
  }
}

// Fold the resolved list metadata onto the task, so everything downstream can
// keep reading a plain `task.sprint`.
function stampSprint(task, now){
  const metas = task.locations
    .map(l => listMeta.get(l.id))
    .filter(m => m && m.isSprint)
    .sort((a, b) => a.start - b.start);

  if (!metas.length){
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
  task.sprintIsFolder = false;
  task.sprintIsCurrent = !!current;
}

async function applySprints(tasks){
  await resolveListMeta(tasks);
  const now = Date.now();
  for (const t of tasks) stampSprint(t, now);
  return tasks;
}

// Normalized shape the finder UI consumes. Richer than the Tasks view's
// normalizer: it keeps the custom id, the folder/list breadcrumb and the sprint,
// all of which people search by.
function normalize(t){
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
    locations: (t.locations || []).filter(l => l && l.id).map(l => ({ id: l.id, name: l.name || "" })),
    // Filled in by applySprints() once the location lists have been resolved.
    sprint: "",
    sprints: [],
    sprintIsFolder: false,
    sprintIsCurrent: false,
    url: t.url || (t.id ? `https://app.clickup.com/t/${t.id}` : ""),
  };
}

async function fetchPool({ includeClosed }){
  const assignee = state.config.assigneeId || (state.cuUser && String(state.cuUser.id)) || "";
  const tasks = [];
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++){
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("include_closed", includeClosed ? "true" : "false");
    params.set("subtasks", "true");
    params.set("order_by", "updated");
    if (assignee) params.append("assignees[]", assignee);
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
  return { tasks, truncated };
}

// A ClickUp task URL (app.clickup.com/t/<teamId>/<id> or /t/<id>), a bare task
// id, or a custom id like "CU-123". Returns null when the text reads as a plain
// search phrase rather than an identifier — a bare word must contain both a
// digit and a letter to be taken for an id, so "standup" stays a search.
const CUSTOM_ID_RE = /^[A-Za-z][A-Za-z0-9]*-\d+$/;

export function parseTaskRef(text){
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

export async function cuGetTask(taskRef){
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
export function filterTasks(tasks, query, limit = 80){
  const q = String(query || "").trim().toLowerCase();
  if (!q) return tasks.slice(0, limit);
  const terms = q.split(/\s+/);
  const hits = [];
  for (const t of tasks){
    const title = t.title.toLowerCase();
    // Every list the task sits in, so an older sprint still finds it.
    const places = t.locations.map(l => l.name).join(" ");
    const hay = `${title} ${t.customId} ${places} ${t.list} ${t.folder} ${t.statusName}`.toLowerCase();
    if (!terms.every(term => hay.includes(term))) continue;
    const i = title.indexOf(terms[0]);
    const rank = i === 0 ? 0 : i > 0 ? (/[\s\-_/[\]]/.test(title[i - 1]) ? 1 : 2) : 3;
    hits.push({ t, rank });
  }
  hits.sort((a, b) => a.rank - b.rank);
  return hits.slice(0, limit).map(h => h.t);
}

// Display labels for task ids we hold without a name — i.e. the `taskId` values
// hard-coded in src/timeTemplates.js. Resolved lazily, once per id; a failed
// lookup caches null so we don't retry it on every render.
export const taskLabels = reactive(new Map());
// Guarded by a plain Set rather than by taskLabels itself: callers run this from
// a watchEffect, and reading the reactive map here would make every resolution
// re-trigger that effect.
const attempted = new Set();

export function ensureTaskLabel(id){
  if (!id || attempted.has(id) || !cuReady()) return;
  attempted.add(id);
  const taskRef = parseTaskRef(id) || { id, custom: false, fromUrl: false };
  cuGetTask(taskRef)
    .then(t => taskLabels.set(id, t))
    .catch(() => taskLabels.set(id, null));
}

export function useTaskFinder(){
  const loading = ref(false);
  const error = ref("");
  const tasks = ref([]);
  const truncated = ref(false);

  async function load({ includeClosed, force = false }){
    if (!cuReady()){
      tasks.value = [];
      error.value = "Connect ClickUp in settings (⚙) first.";
      return;
    }
    const assignee = state.config.assigneeId || (state.cuUser && String(state.cuUser.id)) || "";
    const key = `${state.config.teamId}|${assignee || "me"}|${includeClosed ? "closed" : "open"}`;
    if (!force && pools.has(key)){
      const pool = pools.get(key);
      tasks.value = pool.tasks;
      truncated.value = pool.truncated;
      error.value = "";
      return;
    }
    loading.value = true;
    error.value = "";
    try {
      const pool = await fetchPool({ includeClosed });
      pools.set(key, pool);
      tasks.value = pool.tasks;
      truncated.value = pool.truncated;
    } catch (err){
      error.value = err.message;
      tasks.value = [];
      truncated.value = false;
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, tasks, truncated, load };
}
