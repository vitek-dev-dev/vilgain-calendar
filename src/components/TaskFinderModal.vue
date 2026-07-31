<script setup>
import TaskFinderPanel from "./TaskFinderPanel.vue";

// Dialog chrome around TaskFinderPanel for callers that pick a task and are then
// done — the Templates view. The Log time overlay embeds the panel directly
// instead, so its list stays on screen while you set the times.
defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: "Select a ClickUp task" },
  selectedId: { type: String, default: "" },
  allowNone: { type: Boolean, default: true },
});
const emit = defineEmits(["select", "close"]);

function onSelect(task){
  emit("select", task);
  emit("close");
}
</script>

<template>
  <div class="finder-backdrop" :class="{ open }" @click="emit('close')"></div>
  <section
    class="finder"
    :class="{ open }"
    role="dialog"
    aria-modal="true"
    aria-labelledby="finder-title"
    @keydown.esc.stop.prevent="emit('close')"
  >
    <header class="finder-head">
      <h2 id="finder-title">{{ title }}</h2>
      <button class="settings-close" type="button" aria-label="Close" @click="emit('close')">✕</button>
    </header>

    <TaskFinderPanel
      :active="open"
      :selected-id="selectedId"
      :allow-none="allowNone"
      @select="onSelect"
    />
  </section>
</template>
