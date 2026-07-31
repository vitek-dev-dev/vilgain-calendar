<script setup>
import { ref, computed, watch, nextTick, onUnmounted } from "vue";
import { state, saveConfig } from "../store.js";
import { cuReady, cuTaskStats } from "../composables/useClickUp.js";
import {
  useTaskFinder, searchTasks, sortHits, isPriorityTask,
  SORT_MODES, parseTaskRef, cuGetTask,
} from "../composables/useTaskFinder.js";

// The task search itself — input, filters and result list — with no dialog
// chrome, so it can be dropped into any surface. Emits `select` with a
// normalized task; selecting does not dismiss anything, the host decides that.
const props = defineProps({
  // Flipped on when the surrounding surface opens: resets the query, reloads the
  // pool and takes focus. The host keeps this component mounted so its CSS
  // transitions still work.
  active: { type: Boolean, default: false },
  selectedId: { type: String, default: "" },
  autofocus: { type: Boolean, default: true },
});
const emit = defineEmits(["select"]);

const { loading, refreshing, error, tasks, sprintTasks, truncated, load } = useTaskFinder();

const query = ref("");
const includeClosed = ref(false);
const activeIndex = ref(0);
const inputEl = ref(null);
const listEl = ref(null);

// A pasted task link / id resolved straight from the API, shown pinned above the
// pool results.
const resolved = ref(null);
const resolving = ref(false);
const resolveError = ref("");
let resolveToken = 0;
let resolveTimer = null;

const connected = computed(() => cuReady());

// Sort mode is persisted — it is a working preference, not a per-open choice.
const sortMode = ref(SORT_MODES.some(m => m.key === state.config.taskSort) ? state.config.taskSort : "default");

// Per-task hours / last-worked for the current calendar month. Free when the
// calendar already loaded that month; one request otherwise.
const monthStats = ref(new Map());

async function loadStats(){
  if (!cuReady()) return;
  const now = new Date();
  try {
    monthStats.value = await cuTaskStats(now.getFullYear(), now.getMonth());
  } catch {
    monthStats.value = new Map();
  }
}

function setSort(key){
  sortMode.value = key;
  state.config.taskSort = key;
  saveConfig();
  activeIndex.value = 0;
  if (NEEDS_STATS.has(key)) loadStats();
}

const RESULT_LIMIT = 80;

// Priority tasks from the current sprint that aren't assigned to you. Default
// only — the other sorts are about your own history, which these have none of.
// Filtered here rather than at fetch so editing the patterns applies at once.
const extraTasks = computed(() =>
  sortMode.value === "default" ? sprintTasks.value.filter(isPriorityTask) : [],
);

const results = computed(() => {
  const pool = extraTasks.value.length ? [...extraTasks.value, ...tasks.value] : tasks.value;
  const hits = searchTasks(pool, query.value);
  const sorted = sortHits(hits, {
    mode: sortMode.value,
    stats: monthStats.value,
    hasQuery: !!query.value.trim(),
  });
  const list = sorted.slice(0, RESULT_LIMIT).map(h => h.task);
  return resolved.value ? list.filter(t => t.id !== resolved.value.id) : list;
});

function shortDate(ms){
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

// Whatever figure the active sort is ordering by, shown on the row so the order
// is legible rather than mysterious.
function statLabel(task){
  if (sortMode.value === "updated") return task.dateUpdated ? shortDate(task.dateUpdated) : "";
  const s = monthStats.value.get(task.id);
  if (!s) return "";
  if (sortMode.value === "worked") return s.hours >= 0.05 ? `${s.hours.toFixed(1)}h` : "";
  if (sortMode.value === "recent" && s.last) return shortDate(s.last);
  return "";
}

// Only the time-entry sorts need the month's totals.
const NEEDS_STATS = new Set(["worked", "recent"]);

// Flat row list the keyboard walks over: the pinned resolved reference first,
// then the filtered pool.
const rows = computed(() => {
  const out = [];
  if (resolved.value) out.push({ task: resolved.value, pinned: true });
  for (const t of results.value) out.push({ task: t });
  return out;
});

watch(() => props.active, (isActive) => {
  if (!isActive) return;
  query.value = "";
  activeIndex.value = 0;
  resolved.value = null;
  resolveError.value = "";
  // Revalidate on every open: the cached list shows at once and is replaced when
  // the fresh one lands.
  load({ includeClosed: includeClosed.value, force: true });
  if (NEEDS_STATS.has(sortMode.value)) loadStats();
  if (props.autofocus) nextTick(() => inputEl.value?.focus());
}, { immediate: true });

watch(includeClosed, () => {
  if (!props.active) return;
  activeIndex.value = 0;
  load({ includeClosed: includeClosed.value });
});

// Typing resets the cursor to the top row and re-arms the link/id resolver. The
// token guards against an earlier, slower lookup overwriting a later one.
watch(query, (q) => {
  activeIndex.value = 0;
  clearTimeout(resolveTimer);
  resolved.value = null;
  resolveError.value = "";
  const taskRef = parseTaskRef(q);
  if (!taskRef || !connected.value){ resolving.value = false; return; }
  resolving.value = true;
  const token = ++resolveToken;
  resolveTimer = setTimeout(async () => {
    try {
      const task = await cuGetTask(taskRef);
      if (token === resolveToken) resolved.value = task;
    } catch (err){
      if (token === resolveToken) resolveError.value = err.message;
    } finally {
      if (token === resolveToken) resolving.value = false;
    }
  }, 300);
});

onUnmounted(() => clearTimeout(resolveTimer));

function move(delta){
  const n = rows.value.length;
  if (!n) return;
  activeIndex.value = (activeIndex.value + delta + n) % n;
  nextTick(() => {
    listEl.value?.querySelector(".finder-row.active")?.scrollIntoView({ block: "nearest" });
  });
}

function choose(row){
  emit("select", row.task);
}

function chooseActive(){
  const row = rows.value[activeIndex.value];
  if (row) choose(row);
}

// Carried-over tasks sit in several sprints; the chip shows the live one and the
// tooltip spells out the whole run.
function sprintTitle(t){
  if (t.sprintIsFolder) return `Folder: ${t.sprint} — not in a sprint`;
  const run = t.sprints.length > 1 ? `\nAll sprints: ${t.sprints.join(" → ")}` : "";
  return t.sprintIsCurrent
    ? `Current sprint: ${t.sprint}${run}`
    : `Sprint: ${t.sprint} (not the current one)${run}`;
}

function sprintIcon(t){
  if (t.sprintIsFolder) return "📁";
  return t.sprintIsCurrent ? "🏃" : "🕓";
}

// The sprint gets its own chip, so keep it out of the breadcrumb it came from.
function breadcrumb(t){
  return [t.folder, t.list].filter(Boolean).filter(name => name !== t.sprint).join(" / ");
}
</script>

<template>
  <div class="tf-panel">
    <div class="finder-search">
      <span class="finder-search-ico" aria-hidden="true">🔍</span>
      <input
        ref="inputEl"
        v-model="query"
        type="text"
        autocomplete="off"
        spellcheck="false"
        placeholder="Search tasks, or paste a task link / ID"
        aria-label="Search ClickUp tasks"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="chooseActive"
      >
    </div>

    <div class="finder-filters">
      <div class="finder-sort" role="group" aria-label="Sort tasks">
        <button
          v-for="m in SORT_MODES"
          :key="m.key"
          type="button"
          :class="{ active: sortMode === m.key }"
          @click="setSort(m.key)"
        >{{ m.label }}</button>
      </div>
      <label class="finder-check">
        <input type="checkbox" v-model="includeClosed">
        Include closed
      </label>
      <button
        class="finder-refresh"
        :class="{ busy: refreshing }"
        type="button"
        title="Reload tasks from ClickUp"
        aria-label="Reload tasks from ClickUp"
        :disabled="loading || refreshing || !connected"
        @click="load({ includeClosed, force: true })"
      >↻</button>
    </div>

    <div ref="listEl" class="finder-list">
      <div v-if="error" class="finder-msg finder-msg-err">{{ error }}</div>
      <div v-else-if="loading && !tasks.length" class="finder-msg">Loading tasks…</div>

      <button
        v-for="(row, i) in rows"
        :key="row.task.id"
        type="button"
        class="finder-row"
        :class="{ active: i === activeIndex, current: row.task.id === selectedId }"
        @mousemove="activeIndex = i"
        @click="choose(row)"
      >
        <span class="finder-dot" :style="{ background: row.task.statusColor }" aria-hidden="true"></span>
        <span class="finder-main">
          <span class="finder-title">
            <span v-if="isPriorityTask(row.task)" class="finder-pin" title="Priority task" aria-hidden="true">📌</span>
            {{ row.task.title }}
          </span>
          <span class="finder-sub">
            <span
              v-if="row.task.sprint"
              class="finder-sprint"
              :class="{ folder: row.task.sprintIsFolder, past: !row.task.sprintIsFolder && !row.task.sprintIsCurrent }"
              :title="sprintTitle(row.task)"
            >
              <span aria-hidden="true">{{ sprintIcon(row.task) }}</span>{{ row.task.sprint }}
              <span v-if="row.task.sprints.length > 1" class="finder-sprint-more">+{{ row.task.sprints.length - 1 }}</span>
            </span>
            <span v-if="row.task.statusName" class="finder-status">{{ row.task.statusName }}</span>
            <span v-if="row.task.statusName && (breadcrumb(row.task) || row.task.customId)" class="dotsep">·</span>
            <span v-if="breadcrumb(row.task)">{{ breadcrumb(row.task) }}</span>
            <span v-if="breadcrumb(row.task) && row.task.customId" class="dotsep">·</span>
            <span v-if="row.task.customId" class="finder-cid">{{ row.task.customId }}</span>
          </span>
        </span>
        <span v-if="statLabel(row.task)" class="finder-stat">{{ statLabel(row.task) }}</span>
        <span v-if="row.pinned" class="finder-tag">from link</span>
        <span v-else-if="row.task.id === selectedId" class="finder-tag current">selected</span>
      </button>

      <div v-if="resolving" class="finder-msg">Looking up that task…</div>
      <div v-else-if="resolveError" class="finder-msg finder-msg-err">Task lookup failed: {{ resolveError }}</div>

      <div v-if="!loading && !error && !results.length && !resolved && !resolving" class="finder-msg">
        <template v-if="query">No task matches “{{ query }}”.</template>
        <template v-else>No tasks in this workspace.</template>
      </div>
    </div>

    <div class="finder-foot">
      <span v-if="truncated">
        Showing the {{ tasks.length }} most recently updated tasks — paste a task link or ID to reach any other.
      </span>
      <span v-else-if="connected">Assigned to me · ↑↓ to move · Enter to select</span>
      <span v-else>Connect ClickUp in settings (⚙) to search tasks.</span>
    </div>
  </div>
</template>
