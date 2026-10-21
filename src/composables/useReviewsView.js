import { computed } from "vue";
import { state } from "../store.js";
import { relativeAge, formatHours } from "../utils/date.js";
import { titleCase } from "./useTasksView.js";

// A code review is work that is *waiting* on you, so the queue is ordered by how
// long it has been sitting rather than by status or name — the task at the top is
// the one holding someone up the longest. A task with no usable timestamp sorts
// last instead of jumping the queue on a 0.
function waitingSince(r) {
  return r.updatedAt > 0 ? r.updatedAt : Infinity;
}

// One or two names read as themselves; beyond that the count carries it, since
// the row only has one line for the whole authorship.
function assigneeText(assignees) {
  const names = assignees.map(a => a.name).filter(Boolean);
  if (!names.length) return "";
  if (names.length <= 2) return names.join(", ");
  return `${names[0]} +${names.length - 1}`;
}

// Derives the flat rows ReviewsView renders from the raw reviews in the store.
// Mirrors the month/day/tasks/PRs view-model pattern.
export function useReviewsView() {
  const model = computed(() => {
    const reviews = [...state.reviews]
      .sort((a, b) => waitingSince(a) - waitingSince(b))
      .map(r => ({
        title: r.title,
        url: r.url,
        customId: r.customId,
        list: r.list,
        statusName: titleCase(r.statusName),
        statusColor: r.statusColor,
        priority: r.priority ? titleCase(r.priority) : "",
        age: relativeAge(r.updatedAt),
        assignee: assigneeText(r.assignees),
        // Other people on the same review — worth knowing before you pick it up,
        // and the reason the row doesn't claim the review is yours alone.
        others: r.otherReviewers,
        trackedStr: r.spentHours > 0 ? formatHours(r.spentHours) + "h" : "",
      }));
    return { reviews, count: reviews.length, hint: state.reviewsHint };
  });

  return { model };
}
