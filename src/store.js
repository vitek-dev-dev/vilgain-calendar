import { reactive, computed, ref } from "vue";
import { LS_KEY, VIEW_LS_KEY, VIEWS } from "./constants.js";
import { startOfMonth, startOfDay, iso, monthKey } from "./utils/date.js";

export function loadConfig() {
  const defaults = {
    token: "",
    teamId: "",
    hoursPerDay: 8,
    mandayHours: 8,
    workStartHour: 8,
    workEndHour: 16,
    onCallTasks: [],
    excludeStatuses: [],
    statusOrder: [],
    priorityStatuses: [],
    priorityTasks: [],
    sprintFolderId: "",
    taskSort: "default",
    githubToken: "",
    githubOrg: "",
  };
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEY)) || {};
    // Legacy: the assignee used to be selectable. Everything is scoped to the
    // token owner now, so a stored value is dropped rather than re-persisted.
    delete parsed.assigneeId;
    return { ...defaults, ...parsed };
  } catch {
    return { ...defaults };
  }
}

export function viewFromHash() {
  const h = (location.hash || "").replace(/^#/, "").toLowerCase();
  if (h === "day" || h === "today") return "day";
  if (h === "month" || h === "calendar") return "month";
  if (h === "tasks") return "tasks";
  if (h === "prs" || h === "pulls" || h === "pull-requests") return "prs";
  return null;
}

const savedView = localStorage.getItem(VIEW_LS_KEY);
const initialConfig = loadConfig();

// Single reactive source of truth — the Vue counterpart of the original global
// `state` object. Mutate it and the components re-render.
export const state = reactive({
  view: viewFromHash() || (VIEWS.includes(savedView) ? savedView : "month"),
  cursor: startOfMonth(new Date()),
  dayCursor: startOfDay(new Date()),
  holidays: new Map(), // dayKey -> holiday name
  entries: new Map(), // dayKey -> regular logged hours
  onCall: new Map(), // dayKey -> On Call hours
  entriesPeriod: "", // "YYYY-MM" the entries/onCall maps were loaded for
  dayEntries: [], // raw entries for the timeline
  dayEntriesKey: "", // "YYYY-MM-DD" dayEntries was loaded for
  tasks: [], // normalized ClickUp tasks assigned to the current user
  ghPrs: [], // normalized GitHub pull requests authored by the current user
  config: initialConfig,
  cuUser: null, // authenticated ClickUp account; its id scopes task queries
  // Workspaces — only the settings dialog reads these, so they are fetched when
  // it opens rather than on boot.
  cuTeams: [],
  ghUser: null, // authenticated GitHub account (login/name/avatar)
  loading: 0,
  status: "",
  pill: { kind: "off", text: "ClickUp: off" },
});

export const isLoading = computed(() => state.loading > 0);

// Wall clock, republished on an interval (see App.vue) so views that draw "now"
// keep up on a page left open — the day timeline's current-time line and the
// trailing free slot that runs up to it.
export const nowTick = ref(Date.now());
export const NOW_TICK_MS = 30000;

// Whether the month / day on screen has already been fetched. These drive the
// same silent-refresh behaviour the Tasks and PRs views have: a period we have
// already loaded keeps its data on screen and only shows the small tab spinner,
// while a period we have never loaded gets the full-panel loader. Navigating to
// another month or day resets the marker, so the loader appears there again.
export const monthLoaded = computed(
  () => !!state.entriesPeriod && state.entriesPeriod === monthKey(state.cursor),
);
export const dayLoaded = computed(
  () => !!state.dayEntriesKey && state.dayEntriesKey === iso(state.dayCursor),
);

function clampHour(v, fallback) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(24, Math.max(0, n)) : fallback;
}

// A stored hour count, guarded against a malformed value.
function positiveHours(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// The expected logged hours per working day. Derived from config rather than
// mirrored into `state`, so there is one copy to keep valid.
export const hoursPerDay = computed(() => positiveHours(state.config.hoursPerDay, 8));

// Hours that make up one manday, used to express logged time in mandays. Kept
// separate from the daily target: the target is what you aim to log, a manday is
// the unit work is estimated in.
export const mandayHours = computed(() => positiveHours(state.config.mandayHours, 8));

// The configured working-hours window, normalized to whole hours with
// start < end. Both the settings UI and the day timeline read this so a
// malformed stored value can never produce an inverted window.
export const workingHours = computed(() => {
  const start = clampHour(state.config.workStartHour, 8);
  const end = clampHour(state.config.workEndHour, 16);
  return end > start ? { start, end } : { start, end: Math.min(24, start + 1) };
});

export function saveConfig() {
  localStorage.setItem(LS_KEY, JSON.stringify(state.config));
}
export function setStatus(msg) {
  state.status = msg || "";
}
export function setCuPill(kind, text) {
  state.pill = { kind, text };
}

// Reflects the pill state derived purely from config (used on boot / after
// connect / after clearing), mirroring the original syncSettingsUI logic.
export function syncPill(cuReady) {
  if (cuReady) setCuPill("ok", "ClickUp: connected");
  else if (state.config.token) setCuPill("off", "ClickUp: select a workspace");
  else setCuPill("off", "ClickUp: off");
}
