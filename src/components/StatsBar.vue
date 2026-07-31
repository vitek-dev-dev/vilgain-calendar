<script setup>
import { isLoading, monthLoaded } from "../store.js";

defineProps({
  stats: { type: Object, required: true },
});
</script>

<template>
  <section class="tiles cols-6" :class="{ loading: isLoading && !monthLoaded }">
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
      <div class="value" :class="{ 'has-note': stats.loggedMandays }">
        {{ stats.logged }}
        <span v-if="stats.loggedMandays" class="value-note">({{ stats.loggedMandays }})</span>
      </div>
    </div>
    <div class="tile">
      <div class="label">{{ stats.diffLabel }}</div>
      <div class="value" :class="stats.diffClass">{{ stats.diffText }}</div>
    </div>
    <div class="tile">
      <div class="label">On call</div>
      <div class="value oncall" :class="{ 'has-note': stats.onCallBonus }">
        {{ stats.onCall }}
        <span v-if="stats.onCallBonus" class="value-note">({{ stats.onCallBonus }})</span>
      </div>
    </div>
  </section>
</template>
