<script setup>
import { computed } from "vue";
import { state, isLoading } from "../store.js";
import { MONTHS } from "../constants.js";
import { formatTodayHeader } from "../utils/date.js";
import { setView, shiftMonth, shiftDay, goToThisMonth, goToToday } from "../composables/useCalendar.js";

const TABS = [
  { key: "month", label: "Calendar", icon: "📅" },
  { key: "day", label: "Day", icon: "🕒" },
  { key: "tasks", label: "Tasks", icon: "✅" },
  { key: "prs", label: "Pull requests", icon: "🔀" },
  { key: "templates", label: "Templates", icon: "⏱" },
];

const title = computed(() => {
  switch (state.view){
    case "month": return `${MONTHS[state.cursor.getMonth()]} ${state.cursor.getFullYear()}`;
    case "day": return formatTodayHeader(state.dayCursor);
    default: return "";
  }
});

// On Tasks / PRs the label is replaced by a link to the source app.
const titleLink = computed(() => {
  switch (state.view){
    case "tasks": return { href: "https://app.clickup.com", label: "app.clickup.com" };
    case "prs": {
      const org = (state.config.githubOrg || "").trim();
      return org
        ? { href: `https://github.com/${org}`, label: `github.com/${org}` }
        : { href: "https://github.com", label: "github.com" };
    }
    default: return null;
  }
});

const isCal = computed(() => state.view === "month" || state.view === "day");

// Only the view on screen fetches anything, so the spinner belongs on the active
// tab — it takes the icon's place so the tab does not change width mid-refresh.
function isTabLoading(key){ return state.view === key && isLoading.value; }

function prev(){ state.view === "day" ? shiftDay(-1) : shiftMonth(-1); }
function next(){ state.view === "day" ? shiftDay(1) : shiftMonth(1); }
function today(){ state.view === "day" ? goToToday() : goToThisMonth(); }
</script>

<template>
  <header class="tabbar">
    <div class="tabs" role="tablist" aria-label="View">
      <button
        v-for="t in TABS"
        :key="t.key"
        class="tab"
        :class="{ active: state.view === t.key }"
        role="tab"
        :aria-selected="state.view === t.key"
        @click="setView(t.key)"
      >
        <span class="tab-slot">
          <span
            v-if="isTabLoading(t.key)"
            class="tab-spin"
            role="status"
            :aria-label="`Loading ${t.label}`"
          ></span>
          <span v-else class="tab-ico" aria-hidden="true">{{ t.icon }}</span>
        </span>{{ t.label }}
      </button>
    </div>

    <div class="tabbar-right">
      <a
        v-if="titleLink"
        class="view-title view-title-link"
        :href="titleLink.href"
        target="_blank"
        rel="noopener noreferrer"
      >{{ titleLink.label }} <span class="ext-ico" aria-hidden="true">↗</span></a>
      <div v-else class="view-title">{{ title }}</div>
      <div v-if="isCal" class="datenav" role="group" aria-label="Date navigation">
        <button class="ghbtn" :aria-label="state.view === 'day' ? 'Previous day' : 'Previous month'" @click="prev">‹</button>
        <button class="pillbtn" :title="state.view === 'day' ? 'Jump to today' : 'Jump to this month'" @click="today">Today</button>
        <button class="ghbtn" :aria-label="state.view === 'day' ? 'Next day' : 'Next month'" @click="next">›</button>
      </div>
    </div>
  </header>
</template>
