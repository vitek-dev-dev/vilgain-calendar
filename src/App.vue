<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { state, setStatus, syncPill, viewFromHash, isLoading } from "./store.js";
import { cuReady, cuLoadAccount } from "./composables/useClickUp.js";
import { ghLoadAccount } from "./composables/useGitHub.js";
import { setView, shiftMonth, shiftDay } from "./composables/useCalendar.js";
import { useMonthView } from "./composables/useMonthView.js";
import { useDayView } from "./composables/useDayView.js";
import { useTasksView } from "./composables/useTasksView.js";
import { usePRsView } from "./composables/usePRsView.js";
import { useTemplatesView } from "./composables/useTemplatesView.js";

import AppHeader from "./components/AppHeader.vue";
import SettingsModal from "./components/SettingsModal.vue";
import StatsBar from "./components/StatsBar.vue";
import MonthGrid from "./components/MonthGrid.vue";
import DayTimeline from "./components/DayTimeline.vue";
import TasksView from "./components/TasksView.vue";
import PRsView from "./components/PRsView.vue";
import TemplatesView from "./components/TemplatesView.vue";

const { model: monthModel } = useMonthView();
const { model: dayModel } = useDayView();
const { model: tasksModel } = useTasksView();
const { model: prsModel } = usePRsView();
const { model: templatesModel } = useTemplatesView();

const settingsOpen = ref(false);

function onKeydown(e){
  if (e.key === "Escape" && settingsOpen.value){
    settingsOpen.value = false;
    e.preventDefault();
    return;
  }
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  if (state.view === "day"){
    if (e.key === "ArrowLeft") shiftDay(-1);
    else if (e.key === "ArrowRight") shiftDay(1);
    return;
  }
  if (state.view === "month"){
    if (e.key === "ArrowLeft") shiftMonth(-1);
    else if (e.key === "ArrowRight") shiftMonth(1);
  }
}

function onHashChange(){
  const v = viewFromHash();
  if (v && v !== state.view) setView(v, { skipHash: true });
}

onMounted(async () => {
  syncPill(cuReady());
  const initialHash = "#" + state.view;
  if (location.hash !== initialHash){
    try { history.replaceState(null, "", initialHash); } catch { location.hash = initialHash; }
  }
  setView(state.view, { skipHash: true });

  window.addEventListener("keydown", onKeydown);
  window.addEventListener("hashchange", onHashChange);

  if (state.config.token){
    try {
      await cuLoadAccount();
      syncPill(cuReady());
    } catch (err){
      setStatus("ClickUp: " + err.message);
    }
  }

  if (state.config.githubToken){
    try {
      await ghLoadAccount();
    } catch (err){
      setStatus("GitHub: " + err.message);
    }
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  window.removeEventListener("hashchange", onHashChange);
});
</script>

<template>
  <div class="app">
    <AppHeader />

    <SettingsModal :open="settingsOpen" @close="settingsOpen = false" />

    <button
      class="settings-fab"
      type="button"
      title="Settings"
      aria-label="Open settings"
      @click="settingsOpen = true"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path fill="currentColor" d="M19.14 12.94a7.49 7.49 0 0 0 .05-.94 7.49 7.49 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7.3 7.3 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.65 8.48a.5.5 0 0 0 .12.64L4.8 10.7c-.03.31-.05.62-.05.94s.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.68.22l2.39-.96c.5.39 1.05.71 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.23 1.13-.55 1.63-.94l2.39.96c.25.1.54 0 .68-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.04-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/>
      </svg>
    </button>

    <!-- Calendar (month) -->
    <template v-if="state.view === 'month'">
      <StatsBar :stats="monthModel.stats" />
      <MonthGrid :weeks="monthModel.weeks" :has-click-up="monthModel.hasClickUp" />
    </template>

    <!-- Day -->
    <DayTimeline v-else-if="state.view === 'day'" :model="dayModel" />

    <!-- Tasks -->
    <template v-else-if="state.view === 'tasks'">
      <div class="seclbl">
        <span class="sec-ico" aria-hidden="true">☰</span>
        ClickUp tasks — assigned to me
        <span class="secct">{{ tasksModel.count }}</span>
        <span v-if="isLoading && tasksModel.count" class="sec-spin" role="status" aria-label="Refreshing"></span>
      </div>
      <TasksView :groups="tasksModel.groups" :loading="isLoading" />
    </template>

    <!-- Pull requests -->
    <template v-else-if="state.view === 'prs'">
      <div class="seclbl">
        <span class="sec-ico" aria-hidden="true">⌥</span>
        GitHub pull requests — authored by me
        <span class="secct">{{ prsModel.count }}</span>
        <span v-if="isLoading && prsModel.count" class="sec-spin" role="status" aria-label="Refreshing"></span>
      </div>
      <PRsView :prs="prsModel.prs" :loading="isLoading" />
    </template>

    <!-- Time entry templates -->
    <template v-else-if="state.view === 'templates'">
      <div class="seclbl">
        <span class="sec-ico" aria-hidden="true">⏱</span>
        Time entry templates — one click to log to ClickUp
        <span class="secct">{{ templatesModel.count }}</span>
      </div>
      <TemplatesView :groups="templatesModel.groups" />
    </template>

    <div class="status">{{ state.status }}</div>
  </div>
</template>
