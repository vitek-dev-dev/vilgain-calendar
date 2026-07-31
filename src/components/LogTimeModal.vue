<script setup>
import { ref, computed, watch, onUnmounted } from "vue";
import { state, setStatus } from "../store.js";
import { cuReady, cuLogTimeRange } from "../composables/useClickUp.js";
import { refresh } from "../composables/useCalendar.js";
import { iso, pad, formatHoursMinutes } from "../utils/date.js";
import TaskFinderPanel from "./TaskFinderPanel.vue";
import { currentSprint } from "../composables/useTaskFinder.js";

// "Log an entry to ClickUp" as an off-canvas drawer rather than a dialog stack:
// the form sits at the top at its natural height and the task search fills the
// rest, so picking a task never hides what you already filled in. Opens
// prefilled from whatever context launched it and refreshes the active view once
// the entry lands.
const props = defineProps({
  open: { type: Boolean, default: false },
  // Seed values applied each time the overlay opens. All optional:
  // { dateIso, start, end, task }
  preset: { type: Object, default: () => ({}) },
});
const emit = defineEmits(["close", "logged"]);

const date = ref(iso(new Date()));
const start = ref("09:00");
const end = ref("10:00");
const task = ref(null);
const saving = ref(false);
const error = ref("");

const connected = computed(() => cuReady());

// Round "now" down to the previous quarter hour so the default range starts on a
// tidy boundary rather than at 09:37.
function nowQuarter(){
  const d = new Date();
  return `${pad(d.getHours())}:${pad(Math.floor(d.getMinutes() / 15) * 15)}`;
}

function plusHour(hhmm){
  const [h, m] = hhmm.split(":").map(Number);
  return `${pad((h + 1) % 24)}:${pad(m)}`;
}

watch(() => props.open, (isOpen) => {
  if (!isOpen) return;
  const p = props.preset || {};
  // Default to the day being viewed rather than today — logging almost always
  // targets the day already on screen.
  date.value = p.dateIso || (state.view === "day" ? iso(state.dayCursor) : iso(new Date()));
  start.value = p.start || nowQuarter();
  end.value = p.end || plusHour(start.value);
  task.value = p.task || null;
  error.value = "";
  saving.value = false;
});

// Escape closes from anywhere in the overlay, including the search field, which
// a keydown handler on the container would miss once focus moves around.
function onKeydown(e){
  if (e.key === "Escape" && props.open){
    e.preventDefault();
    emit("close");
  }
}
watch(() => props.open, (isOpen) => {
  if (isOpen) window.addEventListener("keydown", onKeydown);
  else window.removeEventListener("keydown", onKeydown);
});
onUnmounted(() => window.removeEventListener("keydown", onKeydown));

function toMinutes(hhmm){
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

const durationMinutes = computed(() => {
  if (!start.value || !end.value) return 0;
  let s = toMinutes(start.value), e = toMinutes(end.value);
  if (e <= s) e += 24 * 60; // overnight
  return e - s;
});

const durationLabel = computed(() => formatHoursMinutes(durationMinutes.value / 60));
const overnight = computed(() => !!start.value && !!end.value && toMinutes(end.value) <= toMinutes(start.value));

// The entry carries no description of its own, so it is only meaningful once it
// is attached to a task — ClickUp rejects an entry with neither.
const canSave = computed(() => connected.value && !saving.value && !!task.value && durationMinutes.value > 0);

async function save(){
  if (!canSave.value) return;
  saving.value = true;
  error.value = "";
  try {
    await cuLogTimeRange({
      dateIso: date.value,
      start: start.value,
      end: end.value,
      taskId: task.value.id,
    });
    setStatus(`Logged ${durationLabel.value} on ${date.value} to “${task.value.title}”.`);
    emit("logged");
    emit("close");
    refresh();
  } catch (err){
    error.value = err.message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="lt-overlay" :class="{ open }" @click="emit('close')"></div>
  <aside
    class="lt-drawer"
    :class="{ open }"
    role="dialog"
    aria-modal="true"
    aria-labelledby="logtime-title"
  >
    <header class="finder-head">
      <h2 id="logtime-title">Log time</h2>
      <span
        v-if="currentSprint"
        class="finder-sprint lt-head-sprint"
        :title="`Current sprint: ${currentSprint}`"
      ><span aria-hidden="true">🏃</span>{{ currentSprint }}</span>
      <button class="settings-close" type="button" aria-label="Close" @click="emit('close')">✕</button>
    </header>

    <TaskFinderPanel
      :active="open"
      :selected-id="task ? task.id : ''"
      @select="task = $event"
    />

    <div class="lt-when-body">
      <!-- No empty state: with the list directly above, an unfilled slot here
           would just be telling you to do the obvious. -->
      <div v-if="task" class="lt-field">
        <span class="mini-label">Task</span>
        <div class="lt-picked">
          <div class="lt-picked-name">{{ task.title }}</div>
          <div v-if="task.sprint || task.customId" class="lt-picked-sub">
            <span v-if="task.sprint" class="finder-sprint"><span aria-hidden="true">🏃</span>{{ task.sprint }}</span>
            <span v-if="task.customId" class="finder-cid">{{ task.customId }}</span>
          </div>
        </div>
      </div>

      <div class="lt-row">
        <label class="lt-field">
          <span class="mini-label">Date</span>
          <input v-model="date" type="date" class="lt-input" :disabled="!connected" @keydown.enter="save">
        </label>
        <label class="lt-field lt-narrow">
          <span class="mini-label">From</span>
          <input v-model="start" type="time" class="lt-input" :disabled="!connected" @keydown.enter="save">
        </label>
        <label class="lt-field lt-narrow">
          <span class="mini-label">To</span>
          <input v-model="end" type="time" class="lt-input" :disabled="!connected" @keydown.enter="save">
        </label>
        <div class="lt-summary">
          <span class="lt-duration">{{ durationLabel }}</span>
          <span v-if="overnight" class="lt-overnight">+1d</span>
        </div>
      </div>

      <div v-if="error" class="lt-error">{{ error }}</div>
      <div v-else-if="!connected" class="lt-hint">Connect ClickUp in settings (⚙) to log time.</div>
    </div>

    <footer class="lt-foot">
      <button class="lt-cancel" type="button" @click="emit('close')">Cancel</button>
      <button class="primary-btn" type="button" :disabled="!canSave" @click="save">
        {{ saving ? "Logging…" : "Log time" }}
      </button>
    </footer>
  </aside>
</template>
