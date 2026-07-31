<script setup>
import { ref, computed, watch, nextTick, onUnmounted } from "vue";
import { cuReady } from "../composables/useClickUp.js";
import { useTaskFinder, filterTasks, parseTaskRef, cuGetTask } from "../composables/useTaskFinder.js";

// The task search itself — input, filters and result list — with no dialog
// chrome, so it can be dropped into a modal (Templates) or sit as a card in the
// Log time overlay. Emits `select` with a normalized task, or null for the "No
// task" row. Selecting does not dismiss anything; the host decides that.
const props = defineProps({
  // Flipped on when the surrounding surface opens: resets the query, reloads the
  // pool and takes focus. The host keeps this component mounted so its CSS
  // transitions still work.
  active: { type: Boolean, default: false },
  selectedId: { type: String, default: "" },
  allowNone: { type: Boolean, default: true },
  autofocus: { type: Boolean, default: true },
});
const emit = defineEmits(["select"]);

const { loading, error, tasks, truncated, load } = useTaskFinder();

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

const results = computed(() => {
  const list = filterTasks(tasks.value, query.value);
  return resolved.value ? list.filter(t => t.id !== resolved.value.id) : list;
});

// Flat row list the keyboard walks over: the optional "no task" escape hatch,
// the pinned resolved reference, then the filtered pool.
const rows = computed(() => {
  const out = props.allowNone ? [{ kind: "none" }] : [];
  if (resolved.value) out.push({ kind: "task", task: resolved.value, pinned: true });
  for (const t of results.value) out.push({ kind: "task", task: t });
  return out;
});

watch(() => props.active, (isActive) => {
  if (!isActive) return;
  query.value = "";
  activeIndex.value = 0;
  resolved.value = null;
  resolveError.value = "";
  load({ includeClosed: includeClosed.value });
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
  emit("select", row.kind === "none" ? null : row.task);
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
      <span class="finder-scope-note">Assigned to me</span>
      <label class="finder-check">
        <input type="checkbox" v-model="includeClosed">
        Include closed
      </label>
      <button
        class="finder-refresh"
        type="button"
        title="Reload tasks from ClickUp"
        aria-label="Reload tasks from ClickUp"
        :disabled="loading || !connected"
        @click="load({ includeClosed, force: true })"
      >↻</button>
    </div>

    <div ref="listEl" class="finder-list">
      <div v-if="error" class="finder-msg finder-msg-err">{{ error }}</div>
      <div v-else-if="loading && !tasks.length" class="finder-msg">Loading tasks…</div>

      <button
        v-for="(row, i) in rows"
        :key="row.kind === 'none' ? 'none' : row.task.id"
        type="button"
        class="finder-row"
        :class="{ active: i === activeIndex, none: row.kind === 'none', current: row.kind === 'task' && row.task.id === selectedId }"
        @mousemove="activeIndex = i"
        @click="choose(row)"
      >
        <template v-if="row.kind === 'none'">
          <span class="finder-none-ico" aria-hidden="true">∅</span>
          <span class="finder-main">
            <span class="finder-title">No task</span>
            <span class="finder-sub">Log a description-only time entry</span>
          </span>
        </template>

        <template v-else>
          <span class="finder-dot" :style="{ background: row.task.statusColor }" aria-hidden="true"></span>
          <span class="finder-main">
            <span class="finder-title">{{ row.task.title }}</span>
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
          <span v-if="row.pinned" class="finder-tag">from link</span>
          <span v-else-if="row.task.id === selectedId" class="finder-tag current">selected</span>
        </template>
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
      <span v-else-if="connected">↑↓ to move · Enter to select</span>
      <span v-else>Connect ClickUp in settings (⚙) to search tasks.</span>
    </div>
  </div>
</template>
