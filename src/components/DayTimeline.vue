<script setup>
import { isLoading, dayLoaded } from "../store.js";

defineProps({
  model: { type: Object, required: true },
});
</script>

<template>
  <div>
    <section class="tiles" :class="[model.stats.onCallShow ? 'cols-6' : 'cols-5', { loading: isLoading && !dayLoaded }]">
      <div class="tile"><div class="label">Logged</div><div class="value">{{ model.stats.logged }}</div></div>
      <div class="tile"><div class="label">Target</div><div class="value">{{ model.stats.goal }}</div></div>
      <div class="tile"><div class="label">Remaining</div><div class="value green">{{ model.stats.remaining }}</div></div>
      <div class="tile"><div class="label">Diff</div><div class="value" :class="model.stats.diffClass">{{ model.stats.diffText }}</div></div>
      <div class="tile"><div class="label">Records</div><div class="value accent">{{ model.stats.count }}</div></div>
      <div v-if="model.stats.onCallShow" class="tile"><div class="label">On call</div><div class="value oncall">{{ model.stats.onCall }}</div></div>
    </section>

    <section class="panel day-panel" :class="{ loading: isLoading && !dayLoaded }" aria-label="Day timeline">
      <div class="day-badge-row">
        <span class="day-badge" :class="model.badge.cls">{{ model.badge.label }}</span>
      </div>

      <div v-if="model.empty" class="tl-empty">{{ model.empty }}</div>

      <div v-else class="timeline" :style="{ height: model.timeline.height + 'px' }">
        <div
          v-for="row in model.timeline.hours"
          :key="row.h"
          class="tl-hour-line"
          :style="{ top: row.top + 'px' }"
        >
          <span class="lbl">{{ row.label }}</span>
        </div>

        <div
          v-for="slot in model.timeline.placeholders"
          :key="slot.id"
          class="tl-free"
          :class="{ short: slot.short }"
          :style="{ top: slot.top + 'px', height: slot.height + 'px', left: slot.left, width: slot.width }"
          :title="slot.tooltip"
        >
          <span class="tf-range">{{ slot.rangeText }}</span>
          <span class="tf-meta">{{ slot.durationText }} free</span>
        </div>

        <component
          :is="block.tag"
          v-for="block in model.timeline.blocks"
          :key="block.id"
          class="tl-block"
          :class="{ oncall: block.isOnCall, short: block.short, clickable: block.clickable }"
          :href="block.href || null"
          :target="block.href ? '_blank' : null"
          :rel="block.href ? 'noopener noreferrer' : null"
          :style="{ top: block.top + 'px', height: block.height + 'px', left: block.left, width: block.width }"
          :title="block.tooltip"
        >
          <div class="tb-title">{{ block.titleText }}</div>
          <div v-if="block.showMeta" class="tb-meta">{{ block.metaText }}</div>
        </component>

        <div v-if="model.timeline.nowLine" class="tl-now" :style="{ top: model.timeline.nowLine.top + 'px' }">
          <span class="now-label">{{ model.timeline.nowLine.label }}</span>
        </div>
      </div>

      <div class="loader" role="status" aria-live="polite">
        <div class="spinner" aria-hidden="true"></div>
        <div>Loading…</div>
      </div>
    </section>
  </div>
</template>
