import { computed } from "vue";
import { TIME_TEMPLATES } from "../timeTemplates.js";
import { state, saveConfig } from "../store.js";
import { cuLogTimeRange } from "./useClickUp.js";
import { formatHours } from "../utils/date.js";

function toMinutes(hhmm){
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Tasks picked in the task finder are stored per template in localStorage, keyed
// by "<group>/<label>" rather than by position so reordering TIME_TEMPLATES does
// not shuffle the links. Once a template has an entry it wins over the `taskId`
// hard-coded in the templates file — including an entry of null, which means the
// user deliberately unlinked the task.
function templateKey(t){ return `${(t.group || "Other").trim() || "Other"}/${t.label}`; }

export function setTemplateTask(key, task){
  state.config.templateTasks = {
    ...(state.config.templateTasks || {}),
    [key]: task
      ? { id: task.id, title: task.title, customId: task.customId || "", sprint: task.sprint || "", url: task.url || "" }
      : null,
  };
  saveConfig();
}

// Presents the code-defined templates as view models, bucketed by their `group`.
// Groups keep the order they first appear in TIME_TEMPLATES. Mirrors the
// useTasksView.js grouping pattern.
export function useTemplatesView(){
  const model = computed(() => {
    const overrides = state.config.templateTasks || {};
    const byGroup = new Map();
    let count = 0;
    TIME_TEMPLATES.forEach((t, i) => {
      const startMin = toMinutes(t.start);
      let endMin = toMinutes(t.end);
      if (endMin <= startMin) endMin += 24 * 60; // overnight
      const durHours = (endMin - startMin) / 60;
      const key = templateKey(t);
      // A picked task wins over the templates file; with nothing picked we only
      // know the id the file supplied, and the view resolves its name lazily.
      const hasOverride = Object.prototype.hasOwnProperty.call(overrides, key);
      const task = hasOverride
        ? overrides[key]
        : (t.taskId ? { id: t.taskId, title: "", customId: "", url: "", fromFile: true } : null);
      const tpl = {
        id: i,
        taskKey: key,
        label: t.label,
        icon: t.icon || "⏱",
        start: t.start,
        end: t.end,
        rangeStr: `${t.start}–${t.end}`,
        durationStr: formatHours(durHours) + "h",
        task,
        taskId: task ? task.id : "",
        description: t.description || t.label,
        billable: !!t.billable,
      };
      count++;
      const name = (t.group || "Other").trim() || "Other";
      let g = byGroup.get(name);
      if (!g){ g = { name, templates: [] }; byGroup.set(name, g); }
      g.templates.push(tpl);
    });
    return { groups: [...byGroup.values()], count };
  });

  return { model };
}

// Log a template as a ClickUp time entry onto `dateIso` ("YYYY-MM-DD"). The
// template's start/end times are anchored to that date in local time.
export async function logTemplate(tpl, dateIso){
  return cuLogTimeRange({
    dateIso,
    start: tpl.start,
    end: tpl.end,
    description: tpl.description,
    taskId: tpl.taskId,
    billable: tpl.billable,
  });
}
