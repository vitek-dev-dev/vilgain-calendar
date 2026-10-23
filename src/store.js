import { reactive, computed, ref } from "vue";
import {
  LS_KEY,
  VIEW_LS_KEY,
  VIEWS,
  DEFAULT_CR_FIELD_NAME,
  DEFAULT_REVIEW_STATUSES,
} from "./constants.js";
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
    // Where shared pinned tasks (e.g. "BAU | Meetings", assigned to nobody) are
    // loaded from: { kind: "list" | "folder", id, name, link } or null.
    pinnedSource: null,
    taskSort: "default",
    crFieldName: DEFAULT_CR_FIELD_NAME,
    reviewStatuses: [...DEFAULT_REVIEW_STATUSES],
    githubToken: "",
    githubOrg: "",
    holidayHours: {}, // "YYYY-MM" -> hours of holiday taken that month
  };
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEY)) || {};
    // Legacy: the assignee used to be selectable. Everything is scoped to the
    // token owner now, so a stored value is dropped rather than re-persisted.
    delete parsed.assigneeId;
    // A malformed holiday map would break the spread below, so it falls back to
    // the empty default rather than reaching the rest of the app.
    if (!parsed.holidayHours || typeof parsed.holidayHours !== "object") {
      delete parsed.holidayHours;
    }
    // A hand-edited or half-migrated value would otherwise reach the Code
    // reviews query as a non-iterable; fall back to the default rather than
    // shipping it a broken filter.
    if (!Array.isArray(parsed.reviewStatuses)) delete parsed.reviewStatuses;
    // Same for the pinned-tasks location: anything without an id would reach the
    // task query as a filter on "undefined".
    if (
      !parsed.pinnedSource ||
      typeof parsed.pinnedSource !== "object" ||
      !parsed.pinnedSource.id
    ) {
      delete parsed.pinnedSource;
    }
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
  if (h === "reviews" || h === "code-reviews" || h === "cr") return "reviews";
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
  reviews: [], // normalized ClickUp tasks in a review status with me in the CR field
  // Why the Code reviews list came back empty, when it did: distinguishes "no
  // task is waiting on you" from "the configured CR field isn't on these tasks".
  reviewsHint: "",
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

// Pixel height available to the day timeline, measured from the DOM (see
// DayTimeline.vue). The day view scales its per-hour density to fill this so the
// timeline reaches the bottom of the screen instead of ending mid-page on a tall
// display. 0 until measured — the model falls back to the default density then.
export const dayTimelineViewport = ref(0);

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

// Holiday (paid time off) is entered by hand per month: ClickUp has no record of
// it, so without it every month with a holiday in it would keep a permanent
// shortfall in the diff. The hours are subtracted from that month's target.
const HOLIDAY_MAX = 744; // hours in the longest possible month

export function monthHolidayHours(key) {
  const n = Number(state.config.holidayHours?.[key]);
  return Number.isFinite(n) && n > 0 ? Math.min(HOLIDAY_MAX, n) : 0;
}

export function setMonthHolidayHours(key, hours) {
  const n = Number(hours);
  const clean = Number.isFinite(n) && n > 0 ? Math.min(HOLIDAY_MAX, Math.round(n * 100) / 100) : 0;
  // Replaced rather than mutated so the reactive read in the month view is
  // tracked; an emptied month drops out of storage instead of persisting a 0.
  const next = { ...state.config.holidayHours };
  if (clean > 0) next[key] = clean;
  else delete next[key];
  state.config.holidayHours = next;
  saveConfig();
}

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
