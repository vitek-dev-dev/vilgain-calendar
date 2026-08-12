<script setup>
import { computed } from "vue";
import {
  state,
  isLoading,
  monthLoaded,
  monthHolidayHours,
  setMonthHolidayHours,
} from "../store.js";
import { monthKey } from "../utils/date.js";
import { MONTHS } from "../constants.js";

defineProps({
  stats: { type: Object, required: true },
});

// The field always edits the month on screen, so navigating months swaps the
// value under it. Blank rather than 0 for a month with no holiday.
const holiday = computed(() => {
  const h = monthHolidayHours(monthKey(state.cursor));
  return h > 0 ? h : "";
});

const holidayLabel = computed(
  () => `Holiday hours in ${MONTHS[state.cursor.getMonth()]} ${state.cursor.getFullYear()}`,
);

// Committed on change (blur / Enter / stepper) rather than on every keystroke, so
// a half-typed "1." is never rewritten under the cursor.
function onHolidayChange(e) {
  setMonthHolidayHours(monthKey(state.cursor), e.target.value);
  // Reflect the cleaned figure back: a rejected value leaves the computed
  // unchanged, so Vue would have nothing to patch and the raw text would stay.
  e.target.value = holiday.value;
}
</script>

<template>
  <section class="tiles cols-7" :class="{ loading: isLoading && !monthLoaded }">
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
      <div class="value accent" :class="{ 'has-note': stats.targetGross }">
        {{ stats.targetTotal }}
        <span v-if="stats.targetGross" class="value-note">({{ stats.targetGross }})</span>
      </div>
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
      <div class="label">Holiday</div>
      <label class="tile-input" title="Holiday taken this month — taken off the target hours.">
        <input
          type="number"
          min="0"
          step="0.5"
          inputmode="decimal"
          placeholder="0"
          :value="holiday"
          :aria-label="holidayLabel"
          @change="onHolidayChange"
        />
        <span class="tile-input-unit" aria-hidden="true">h</span>
      </label>
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
