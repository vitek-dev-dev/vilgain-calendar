<script setup>
import { computed } from "vue";
import { cuReady, crFieldName } from "../composables/useClickUp.js";

// Presentational: renders the ClickUp tasks waiting on your code review. Each
// review: { title, url, customId, list, statusName, statusColor, priority, age,
// assignee, others, trackedStr }.
const props = defineProps({
  reviews: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  // Why the list is empty, when the loader can say something more useful than
  // "nothing here" — a status filter that matched nothing, or a CR field name
  // no task carries.
  hint: { type: String, default: "" },
});

const emptyText = computed(() => {
  if (!cuReady()) {
    return "Connect ClickUp in settings (⚙) to see the tasks waiting on your code review.";
  }
  if (props.hint) return `${props.hint} Adjust this in settings (⚙) → Tasks → Code reviews.`;
  return `No tasks are waiting on you — you aren't in the “${crFieldName()}” field of anything in review.`;
});

// Row count for the first-load skeleton. Reviews are a flat list, so no group
// heads. Refreshes keep the stale list on screen and only show the tab spinner,
// so this is only ever seen on an empty view.
const SKELETON_ROWS = 5;
</script>

<template>
  <div class="panel list-panel fill">
    <div
      v-if="loading && !reviews.length"
      class="cr-list"
      role="status"
      aria-label="Loading code reviews"
    >
      <div v-for="i in SKELETON_ROWS" :key="i" class="cr-card sk-row" aria-hidden="true">
        <span class="cr-dot sk"></span>
        <div class="cr-main">
          <div class="cr-title sk sk-title">&nbsp;</div>
          <div class="cr-meta">
            <span class="cr-list-name sk sk-meta">&nbsp;</span>
          </div>
        </div>
        <span class="cr-status sk">&nbsp;</span>
      </div>
    </div>

    <div v-else-if="!reviews.length" class="list-empty">{{ emptyText }}</div>

    <div v-else class="cr-list">
      <component
        :is="r.url ? 'a' : 'div'"
        v-for="(r, i) in reviews"
        :key="i"
        class="cr-card"
        :class="{ clickable: r.url }"
        :href="r.url || null"
        :target="r.url ? '_blank' : null"
        :rel="r.url ? 'noopener noreferrer' : null"
      >
        <span class="cr-dot" :style="{ background: r.statusColor }" aria-hidden="true"></span>
        <div class="cr-main">
          <div class="cr-title">{{ r.title }}</div>
          <div class="cr-meta">
            <span v-if="r.customId" class="cr-id">{{ r.customId }}</span>
            <span v-if="r.customId && r.list" class="dotsep">·</span>
            <span v-if="r.list" class="cr-list-name">{{ r.list }}</span>
            <span v-if="r.assignee" class="cr-by">by {{ r.assignee }}</span>
            <span v-if="r.priority" class="cr-prio">{{ r.priority }}</span>
            <!-- The queue is ordered by this, so it earns a place on every row. -->
            <span v-if="r.age" class="cr-age" title="Last updated">waiting {{ r.age }}</span>
            <span v-if="r.others" class="cr-others" title="Other reviewers on this task"
              >+{{ r.others }} reviewer{{ r.others === 1 ? "" : "s" }}</span
            >
            <span v-if="r.trackedStr" class="cr-tracked">{{ r.trackedStr }} logged</span>
          </div>
        </div>
        <span class="cr-status" :style="{ color: r.statusColor, borderColor: r.statusColor }">{{
          r.statusName
        }}</span>
      </component>
    </div>
  </div>
</template>
