<script setup>
import { isLoading } from "../store.js";

defineProps({
  stats: { type: Object, required: true },
});
</script>

<template>
  <section class="tiles cols-6" :class="{ loading: isLoading }">
    <div class="tile">
      <div class="label">Weekend / Holidays</div>
      <div class="value">{{ stats.weekendDays }} / {{ stats.holidayOnWeekday }}</div>
    </div>
    <div class="tile">
      <div class="label">Working days</div>
      <div class="value">{{ stats.workDays }}</div>
    </div>
    <div class="tile">
      <div class="label">Target hours</div>
      <div class="value accent">{{ stats.targetTotal }}</div>
    </div>
    <div class="tile">
      <div class="label">Logged</div>
      <div class="value">{{ stats.logged }}</div>
    </div>
    <div class="tile">
      <div class="label">{{ stats.diffLabel }}</div>
      <div class="value" :class="stats.diffClass">{{ stats.diffText }}</div>
    </div>
    <div class="tile">
      <div class="label">On call</div>
      <div class="value oncall">{{ stats.onCall }}<span v-if="stats.onCallBonus" class="oncall-bonus"> ({{ stats.onCallBonus }})</span></div>
    </div>
  </section>
</template>
