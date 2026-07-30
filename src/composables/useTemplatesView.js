import { computed } from "vue";
import { TIME_TEMPLATES } from "../timeTemplates.js";
import { cuCreateTimeEntry, cuReady } from "./useClickUp.js";
import { formatHours } from "../utils/date.js";

function toMinutes(hhmm){
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Presents the code-defined templates as view models, bucketed by their `group`.
// Groups keep the order they first appear in TIME_TEMPLATES. Mirrors the
// useTasksView.js grouping pattern.
export function useTemplatesView(){
  const model = computed(() => {
    const byGroup = new Map();
    let count = 0;
    TIME_TEMPLATES.forEach((t, i) => {
      const startMin = toMinutes(t.start);
      let endMin = toMinutes(t.end);
      if (endMin <= startMin) endMin += 24 * 60; // overnight
      const durHours = (endMin - startMin) / 60;
      const tpl = {
        id: i,
        label: t.label,
        icon: t.icon || "⏱",
        start: t.start,
        end: t.end,
        rangeStr: `${t.start}–${t.end}`,
        durationStr: formatHours(durHours) + "h",
        taskId: t.taskId || "",
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
  if (!cuReady()) throw new Error("Connect ClickUp first");
  const [y, mo, d] = dateIso.split("-").map(Number);
  const [sh, sm] = tpl.start.split(":").map(Number);
  const [eh, em] = tpl.end.split(":").map(Number);
  const startMs = new Date(y, mo - 1, d, sh, sm, 0, 0).getTime();
  let endDate = new Date(y, mo - 1, d, eh, em, 0, 0);
  if (endDate.getTime() <= startMs) endDate = new Date(y, mo - 1, d + 1, eh, em, 0, 0);
  const endMs = endDate.getTime();
  return cuCreateTimeEntry({
    start: startMs,
    stop: endMs,
    duration: endMs - startMs,
    description: tpl.description,
    taskId: tpl.taskId,
    billable: tpl.billable,
  });
}
