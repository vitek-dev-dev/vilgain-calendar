<script setup>
import { isLoading, monthLoaded } from "../store.js";
import { WEEKDAYS_SHORT } from "../constants.js";
import { openDay } from "../composables/useCalendar.js";

defineProps({
  weeks: { type: Array, required: true },
  hasClickUp: { type: Boolean, required: true },
});

const LEGEND = [
  { label: "Working day", fill: "#16a34a", border: "#edfbf3" },
  { label: "Weekend", fill: "#94a3b8", border: "#f1f3f7" },
  { label: "Holiday", fill: "#3b82f6", border: "#eaf2ff" },
  { label: "Today", fill: "#d4a017", border: "#fffdf3" },
];

function onCellKeydown(e, date){
  if (e.key === "Enter" || e.key === " "){
    e.preventDefault();
    openDay(date);
  }
}
</script>

<template>
  <div class="panel cal-panel" :class="{ loading: isLoading && !monthLoaded }" aria-live="polite">
    <div class="cal-row cal-head">
      <div class="hd-faint">W</div>
      <div v-for="(w, i) in WEEKDAYS_SHORT" :key="w" :class="{ we: i >= 5 }">{{ w }}</div>
      <div class="hd-faint">TOTAL</div>
    </div>

    <div v-for="week in weeks" :key="week.days[0].key" class="cal-row">
      <div class="wnum">W{{ week.weekNum }}</div>

      <div
        v-for="cell in week.days"
        :key="cell.key"
        class="daycell"
        :class="{
          muted: !cell.inMonth,
          weekend: cell.isWeekend,
          holiday: cell.isHoliday,
          today: cell.isToday,
          clickable: cell.inMonth,
        }"
        :role="cell.inMonth ? 'button' : null"
        :tabindex="cell.inMonth ? 0 : null"
        @click="cell.inMonth && openDay(cell.date)"
        @keydown="cell.inMonth && onCellKeydown($event, cell.date)"
      >
        <div class="dnum">{{ cell.dayNum }}</div>
        <div v-if="cell.isHoliday" class="dholiday">{{ cell.holidayName }}</div>

        <div v-if="cell.hours.show" class="dh">
          <span v-if="cell.hours.loggedStr" class="dh-log" :class="cell.hours.logClass">{{ cell.hours.loggedStr }}</span>
          <span v-if="cell.hours.loggedStr && cell.hours.targetStr" class="dh-tgt">/ {{ cell.hours.targetStr }}</span>
          <span v-else-if="cell.hours.targetStr" class="dh-tgt">{{ cell.hours.targetStr }}</span>
          <span class="dh-unit">h</span>
        </div>

        <div v-if="hasClickUp && cell.onCall > 0" class="doncall" title="On Call (deducted from logged hours)">
          📞 {{ cell.onCallStr }} h
        </div>
      </div>

      <div class="wtotal">
        <template v-if="hasClickUp">
          <div class="wt-main">
            <span class="wt-log" :class="week.sumLogClass">{{ week.sumLoggedStr }}</span>
            <span class="wt-rest"> / {{ week.sumTargetStr }} h</span>
          </div>
          <div class="wt-cum">Σ {{ week.cumLoggedStr }} / {{ week.cumTargetStr }} h</div>
          <div v-if="week.onCall > 0" class="wt-oncall">📞 {{ week.onCallStr }} h</div>
        </template>
        <div v-else class="wt-main"><span class="wt-rest">{{ week.sumTargetStr }} h</span></div>
      </div>
    </div>

    <div class="cal-legend">
      <div v-for="l in LEGEND" :key="l.label" class="lg">
        <span class="sw" :style="{ background: l.fill, borderColor: l.border }"></span>{{ l.label }}
      </div>
    </div>

    <div class="loader" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
      <div>Loading…</div>
    </div>
  </div>
</template>
