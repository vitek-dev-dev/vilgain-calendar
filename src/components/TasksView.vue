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

// Card counts for the first-load skeleton — two status groups, so the placeholder
// has the shape of a real grouped list. Refreshes keep the stale list on screen
// and only show the tab spinner, so this is only ever seen on an empty view.
const SKELETON_GROUPS = [4, 3];
</script>

<template>
  <div class="panel list-panel fill">
    <div
      v-if="loading && !groups.length"
      class="task-groups"
      role="status"
      aria-label="Loading tasks"
    >
      <div v-for="(cards, gi) in SKELETON_GROUPS" :key="gi" class="task-group" aria-hidden="true">
        <div class="group-head">
          <span class="group-dot sk"></span>
          <span class="group-name sk">&nbsp;</span>
          <span class="group-count sk">&nbsp;</span>
        </div>
        <div class="task-cards">
          <div v-for="i in cards" :key="i" class="task-card sk-row">
            <div class="task-main">
              <div class="task-title sk sk-title">&nbsp;</div>
              <div class="task-meta">
                <span class="task-prio sk sk-meta">&nbsp;</span>
              </div>
            </div>
            <div class="task-time">
              <div class="task-tracked sk">&nbsp;</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="!groups.length" class="list-empty">{{ emptyText }}</div>

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
  </div>
</template>
