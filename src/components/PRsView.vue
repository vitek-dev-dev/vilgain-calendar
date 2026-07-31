<script setup>
import { computed } from "vue";
import { ghReady } from "../composables/useGitHub.js";

// Presentational: renders GitHub pull requests authored by the current user.
// Each PR: { title, repo, num, url, statusLabel, statusCls, ciIcon, ciCls,
// age, comments }.
defineProps({
  prs: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
});

const emptyText = computed(() =>
  ghReady()
    ? "No open pull requests authored by you."
    : "Connect GitHub in settings (⚙) to see pull requests you've authored.",
);

// Row count for the first-load skeleton. PRs are a flat list, so no group heads.
// Refreshes keep the stale list on screen and only show the tab spinner, so this
// is only ever seen on an empty view.
const SKELETON_ROWS = 6;
</script>

<template>
  <div class="panel list-panel fill">
    <div
      v-if="loading && !prs.length"
      class="pr-list"
      role="status"
      aria-label="Loading pull requests"
    >
      <div v-for="i in SKELETON_ROWS" :key="i" class="pr-card sk-row" aria-hidden="true">
        <span class="pr-ci sk">&nbsp;</span>
        <div class="pr-main">
          <div class="pr-title sk sk-title">&nbsp;</div>
          <div class="pr-meta">
            <span class="pr-repo sk sk-meta">&nbsp;</span>
          </div>
        </div>
        <span class="pr-status sk">&nbsp;</span>
      </div>
    </div>

    <div v-else-if="!prs.length" class="list-empty">{{ emptyText }}</div>

    <div v-else class="pr-list">
      <component
        :is="p.url ? 'a' : 'div'"
        v-for="(p, i) in prs"
        :key="i"
        class="pr-card"
        :class="{ clickable: p.url }"
        :href="p.url || null"
        :target="p.url ? '_blank' : null"
        :rel="p.url ? 'noopener noreferrer' : null"
      >
        <span class="pr-ci" :class="p.ciCls" aria-hidden="true">{{ p.ciIcon }}</span>
        <div class="pr-main">
          <div class="pr-title">{{ p.title }}</div>
          <div class="pr-meta">
            <span class="pr-repo">{{ p.repo }} #{{ p.num }}</span>
            <span class="dotsep">·</span>
            <span class="pr-age">{{ p.age }}</span>
            <span v-if="p.comments" class="pr-comments">💬 {{ p.comments }}</span>
          </div>
        </div>
        <span class="pr-status" :class="p.statusCls">{{ p.statusLabel }}</span>
      </component>
    </div>
  </div>
</template>
