import { computed } from "vue";
import { state } from "../store.js";

// Compact "created X ago" label from an ISO timestamp.
function relativeAge(iso) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

// Review status → badge label + CSS class (see .pr-status.* in style.css).
function reviewStatus(pr) {
  if (pr.isDraft) return { statusLabel: "Draft", statusCls: "draft" };
  switch (pr.reviewDecision) {
    case "APPROVED":
      return { statusLabel: "Approved", statusCls: "approved" };
    case "CHANGES_REQUESTED":
      return { statusLabel: "Changes", statusCls: "changes" };
    default:
      return { statusLabel: "Review", statusCls: "pending" };
  }
}

// CI rollup → glyph + CSS class (see .pr-ci.* in style.css).
function ciStatus(pr) {
  switch (pr.ciState) {
    case "SUCCESS":
      return { ciIcon: "✓", ciCls: "pass" };
    case "FAILURE":
    case "ERROR":
      return { ciIcon: "✗", ciCls: "fail" };
    case "PENDING":
    case "EXPECTED":
      return { ciIcon: "●", ciCls: "running" };
    default:
      return { ciIcon: "•", ciCls: "" };
  }
}

// Derives the flat rows the PRsView presenter renders from the raw GitHub PRs
// in the store. Mirrors the month/day/tasks view-model pattern.
export function usePRsView() {
  const model = computed(() => {
    const prs = state.ghPrs.map(pr => ({
      title: pr.title,
      repo: pr.repo,
      num: pr.num,
      url: pr.url,
      age: relativeAge(pr.createdAt),
      comments: pr.comments,
      ...reviewStatus(pr),
      ...ciStatus(pr),
    }));
    return { prs, count: prs.length };
  });

  return { model };
}
