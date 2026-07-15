<script setup>
import { computed } from "vue";
import { cuReady } from "../composables/useClickUp.js";

// Renders ClickUp tasks grouped by status. Each group:
// { name, dotColor, tasks: [{ title, priority, list, url, trackedStr, estimateStr, over }] }.
const props = defineProps({
  groups: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
});

const emptyText = computed(() =>
  cuReady()
    ? "No tasks are assigned to you in this workspace."
    : "Connect ClickUp in settings (⚙) to see your assigned tasks, grouped by status.",
);
</script>

<template>
  <div class="panel list-panel" :class="{ loading }">
    <div v-if="!groups.length && !loading" class="list-empty">{{ emptyText }}</div>

    <div v-else class="task-groups">
      <div v-for="g in groups" :key="g.name" class="task-group">
        <div class="group-head">
          <span class="group-dot" :style="{ background: g.dotColor }"></span>
          <span class="group-name">{{ g.name }}</span>
          <span class="group-count">{{ g.tasks.length }}</span>
        </div>
        <div class="task-cards">
          <component
            :is="t.url ? 'a' : 'div'"
            v-for="(t, i) in g.tasks"
            :key="i"
            class="task-card"
            :class="{ clickable: t.url }"
            :href="t.url || null"
            :target="t.url ? '_blank' : null"
            :rel="t.url ? 'noopener noreferrer' : null"
          >
            <div class="task-main">
              <div class="task-title">{{ t.title }}</div>
              <div v-if="t.priority || t.list" class="task-meta">
                <span v-if="t.priority" class="task-prio">{{ t.priority }}</span>
                <span v-if="t.priority && t.list" class="dotsep">·</span>
                <span v-if="t.list" class="task-list">{{ t.list }}</span>
              </div>
            </div>
            <div class="task-time">
              <div class="task-tracked" :class="{ over: t.over }">{{ t.trackedStr }}</div>
              <div v-if="t.estimateStr" class="task-est">/ {{ t.estimateStr }} est</div>
            </div>
          </component>
        </div>
      </div>
    </div>

    <div class="loader" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
      <div>Loading…</div>
    </div>
  </div>
</template>
