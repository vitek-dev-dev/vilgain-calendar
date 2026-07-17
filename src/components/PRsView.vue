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
</script>

<template>
  <div class="panel list-panel" :class="{ loading: loading && !prs.length }">
    <div v-if="!prs.length && !loading" class="list-empty">{{ emptyText }}</div>

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

    <div class="loader" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
      <div>Loading…</div>
    </div>
  </div>
</template>
