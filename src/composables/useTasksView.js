import { computed } from "vue";
import { state } from "../store.js";
import { formatHours } from "../utils/date.js";

// ClickUp status types, ordered the way a board reads top-to-bottom.
const TYPE_ORDER = { open: 0, custom: 1, done: 2, closed: 3 };

function titleCase(s){
  return String(s).replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}
function prioLabel(p){ return p ? p[0].toUpperCase() + p.slice(1) : ""; }

// Groups the assigned tasks by their ClickUp status (real names + colors), then
// orders the groups by status type (open → custom → done → closed) and the
// status orderindex within a type. Mirrors the month/day view-model pattern.
export function useTasksView(){
  const model = computed(() => {
    // Statuses to hide (case-insensitive, exact match on the status name).
    const excluded = new Set((state.config.excludeStatuses || []).map(s => String(s).trim().toLowerCase()).filter(Boolean));

    const byStatus = new Map();
    let count = 0;
    for (const t of state.tasks){
      if (excluded.has(t.statusName.trim().toLowerCase())) continue;
      count++;
      const key = t.statusName.toLowerCase();
      let g = byStatus.get(key);
      if (!g){
        g = { name: titleCase(t.statusName), dotColor: t.statusColor, type: t.statusType, order: t.statusOrder, tasks: [] };
        byStatus.set(key, g);
      }
      g.order = Math.min(g.order, t.statusOrder);
      g.tasks.push({
        title: t.title,
        priority: prioLabel(t.priority),
        list: t.list,
        url: t.url,
        trackedStr: formatHours(t.spentHours) + "h",
        estimateStr: t.estHours > 0 ? formatHours(t.estHours) + "h" : null,
        over: t.estHours > 0 && t.spentHours > t.estHours,
      });
    }

    const groups = [...byStatus.values()].sort((a, b) => {
      const ta = TYPE_ORDER[a.type] ?? 1, tb = TYPE_ORDER[b.type] ?? 1;
      if (ta !== tb) return ta - tb;
      if (a.order !== b.order) return a.order - b.order;
      return a.name.localeCompare(b.name);
    });

    return { groups, count };
  });

  return { model };
}
