import { computed } from "vue";
import { state } from "../store.js";
import { formatHours } from "../utils/date.js";

// ClickUp status types, ordered the way a board reads top-to-bottom.
const TYPE_ORDER = { open: 0, custom: 1, done: 2, closed: 3 };

// ClickUp hands statuses back lowercase ("in progress"), so they are title-cased
// for display. Shared with the settings editor, so a status reads the same there
// as in the group heading it controls.
export function titleCase(s){
  return String(s).replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}
function prioLabel(p){ return p ? p[0].toUpperCase() + p.slice(1) : ""; }

// The configured group order (config.statusOrder) as statusKey -> position.
// Matched case-insensitively on the status name; the first mention of a name wins
// so a duplicated row can't shuffle the one above it.
export function statusRanks(names){
  const ranks = new Map();
  for (const raw of names || []){
    const key = String(raw).trim().toLowerCase();
    if (key && !ranks.has(key)) ranks.set(key, ranks.size);
  }
  return ranks;
}

// How status groups are ordered, over anything carrying { key, type, order, name }.
// Shared with the settings editor so its list is an exact preview of this view:
// configured positions first, then ClickUp's own order for the rest. `missing`
// marks a status kept from config that no loaded task uses — it can't appear in
// the view at all, so an unplaced one sinks to the end of the editor's list.
export function statusOrderComparator(ranks){
  return (a, b) => {
    const ra = ranks.has(a.key) ? ranks.get(a.key) : Infinity;
    const rb = ranks.has(b.key) ? ranks.get(b.key) : Infinity;
    if (ra !== rb) return ra - rb;
    if (!!a.missing !== !!b.missing) return a.missing ? 1 : -1;
    const ta = TYPE_ORDER[a.type] ?? 1, tb = TYPE_ORDER[b.type] ?? 1;
    if (ta !== tb) return ta - tb;
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name);
  };
}

// Groups the assigned tasks by their ClickUp status (real names + colors), then
// orders the groups: the statuses named in settings first, in exactly that order,
// then everything else by status type (open → custom → done → closed) and the
// status orderindex within a type. Leaving a status unconfigured therefore keeps
// ClickUp's own placement rather than dropping it to the bottom in name order.
// Mirrors the month/day view-model pattern.
export function useTasksView(){
  const model = computed(() => {
    // Statuses to hide (case-insensitive, exact match on the status name).
    const excluded = new Set((state.config.excludeStatuses || []).map(s => String(s).trim().toLowerCase()).filter(Boolean));
    // Statuses whose group is called out with a highlight. Hidden wins by
    // construction — an excluded status never reaches the grouping below.
    const prioritized = new Set((state.config.priorityStatuses || []).map(s => String(s).trim().toLowerCase()).filter(Boolean));
    const ranks = statusRanks(state.config.statusOrder);

    const byStatus = new Map();
    let count = 0;
    for (const t of state.tasks){
      if (excluded.has(t.statusName.trim().toLowerCase())) continue;
      count++;
      const key = t.statusName.trim().toLowerCase();
      let g = byStatus.get(key);
      if (!g){
        g = {
          key, name: titleCase(t.statusName), dotColor: t.statusColor,
          type: t.statusType, order: t.statusOrder,
          priority: prioritized.has(key), tasks: [],
        };
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

    const groups = [...byStatus.values()].sort(statusOrderComparator(ranks));

    return { groups, count };
  });

  return { model };
}
