<script setup>
import { ref, computed, watch } from "vue";
import { cuReady } from "../composables/useClickUp.js";
import { logTemplate } from "../composables/useTemplatesView.js";
import { setStatus } from "../store.js";
import { iso, formatHours } from "../utils/date.js";

// Code-defined time-entry templates, grouped for display. Each group:
// { name, templates: [{ id, label, icon, taskId, description, billable, start,
// end }] }. The start/end are defaults from src/timeTemplates.js — the user can
// override them per card before confirming.
const props = defineProps({
  groups: { type: Array, default: () => [] },
});

// Date the entries are logged onto — defaults to today.
const date = ref(iso(new Date()));

// Flat list of every template across all groups (for seeding edits).
const allTemplates = computed(() => props.groups.flatMap(g => g.templates));

// Editable per-template times: id -> { start, end }. Seeded from the template
// defaults; existing edits are preserved when the template list re-computes.
const edits = ref({});
watch(
  allTemplates,
  (list) => {
    const next = {};
    for (const t of list){
      next[t.id] = edits.value[t.id] || { start: t.start, end: t.end };
    }
    edits.value = next;
  },
  { immediate: true },
);

// Per-template UI state: id -> 'saving' | 'done' | 'error'.
const status = ref({});

const connected = computed(() => cuReady());

function toMinutes(hhmm){
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function durationStr(id){
  const e = edits.value[id];
  if (!e || !e.start || !e.end) return "—";
  let s = toMinutes(e.start), en = toMinutes(e.end);
  if (en <= s) en += 24 * 60; // overnight
  return formatHours((en - s) / 60) + "h";
}

function btnLabel(id){
  switch (status.value[id]){
    case "saving": return "Logging…";
    case "done": return "Logged ✓";
    case "error": return "Retry";
    default: return "Log";
  }
}

async function onLog(t){
  if (!connected.value){ setStatus("Connect ClickUp in settings (⚙) first."); return; }
  if (status.value[t.id] === "saving") return;
  const e = edits.value[t.id];
  if (!e || !e.start || !e.end){ setStatus("Set a start and end time first."); return; }
  status.value = { ...status.value, [t.id]: "saving" };
  try {
    await logTemplate({ ...t, start: e.start, end: e.end }, date.value);
    status.value = { ...status.value, [t.id]: "done" };
    setStatus(`Logged “${t.label}” (${e.start}–${e.end}) on ${date.value}.`);
  } catch (err){
    status.value = { ...status.value, [t.id]: "error" };
    setStatus("ClickUp: " + err.message);
  }
}
</script>

<template>
  <div class="panel list-panel">
    <div class="tpl-toolbar">
      <label class="tpl-datelbl">
        Log to
        <input type="date" class="tpl-date" v-model="date" />
      </label>
    </div>

    <div v-if="!groups.length" class="list-empty">
      No templates defined. Add them in <code>src/timeTemplates.js</code>.
    </div>

    <div v-else class="task-groups">
      <div v-for="g in groups" :key="g.name" class="task-group">
        <div class="group-head">
          <span class="group-name">{{ g.name }}</span>
          <span class="group-count">{{ g.templates.length }}</span>
        </div>
        <div class="tpl-cards">
          <div
            v-for="t in g.templates"
            :key="t.id"
            class="task-card tpl-card"
            :class="status[t.id]"
          >
            <span class="tpl-ico" aria-hidden="true">{{ t.icon }}</span>
            <div class="task-main">
              <div class="task-title">{{ t.label }}</div>
            </div>

            <div class="tpl-times">
              <input
                type="time"
                class="tpl-time"
                :aria-label="`${t.label} start time`"
                v-model="edits[t.id].start"
                :disabled="!connected || status[t.id] === 'saving'"
              />
              <span class="tpl-dash" aria-hidden="true">–</span>
              <input
                type="time"
                class="tpl-time"
                :aria-label="`${t.label} end time`"
                v-model="edits[t.id].end"
                :disabled="!connected || status[t.id] === 'saving'"
              />
            </div>

            <div class="task-time">
              <div class="task-tracked">{{ durationStr(t.id) }}</div>
            </div>

            <button
              type="button"
              class="tpl-log-btn"
              :disabled="!connected || status[t.id] === 'saving'"
              @click="onLog(t)"
            >{{ btnLabel(t.id) }}</button>
          </div>
        </div>
      </div>
    </div>

    <p v-if="!connected" class="list-empty-note tpl-note">
      Connect ClickUp in settings (⚙) to enable logging.
    </p>
  </div>
</template>
