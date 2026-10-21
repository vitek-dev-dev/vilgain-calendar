import { computed } from "vue";
import { state } from "../store.js";
import { relativeAge } from "../utils/date.js";

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
