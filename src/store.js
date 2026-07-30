import { reactive, computed } from "vue";
import { LS_KEY, VIEW_LS_KEY } from "./constants.js";
import { startOfMonth, startOfDay } from "./utils/date.js";

export function loadConfig(){
  const defaults = { token: "", teamId: "", assigneeId: "", hoursPerDay: 8, onCallTasks: [], excludeStatuses: [], githubToken: "", githubOrg: "" };
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEY)) || {};
    return { ...defaults, ...parsed };
  } catch {
    return { ...defaults };
  }
}

export function viewFromHash(){
  const h = (location.hash || "").replace(/^#/, "").toLowerCase();
  if (h === "day" || h === "today") return "day";
  if (h === "month" || h === "calendar") return "month";
  if (h === "tasks") return "tasks";
  if (h === "prs" || h === "pulls" || h === "pull-requests") return "prs";
  if (h === "templates" || h === "log") return "templates";
  return null;
}

const VIEWS = ["month", "day", "tasks", "prs", "templates"];
const savedView = localStorage.getItem(VIEW_LS_KEY);
const initialConfig = loadConfig();

// Single reactive source of truth — the Vue counterpart of the original global
// `state` object. Mutate it and the components re-render.
export const state = reactive({
  view: viewFromHash() || (VIEWS.includes(savedView) ? savedView : "month"),
  cursor: startOfMonth(new Date()),
  dayCursor: startOfDay(new Date()),
  holidays: new Map(),   // dayKey -> holiday name
  entries: new Map(),    // dayKey -> regular logged hours
  onCall: new Map(),     // dayKey -> On Call hours
  dayEntries: [],        // raw entries for the timeline
  tasks: [],             // normalized ClickUp tasks assigned to the current user
  ghPrs: [],             // normalized GitHub pull requests authored by the current user
  hoursPerDay: initialConfig.hoursPerDay ?? 8,
  config: initialConfig,
  cuUser: null,
  cuTeams: [],
  ghUser: null,          // authenticated GitHub account (login/name/avatar)
  loading: 0,
  status: "",
  pill: { kind: "off", text: "ClickUp: vypnuto" },
});

export const isLoading = computed(() => state.loading > 0);

export function saveConfig(){ localStorage.setItem(LS_KEY, JSON.stringify(state.config)); }
export function setStatus(msg){ state.status = msg || ""; }
export function setCuPill(kind, text){ state.pill = { kind, text }; }

// Reflects the pill state derived purely from config (used on boot / after
// connect / after clearing), mirroring the original syncSettingsUI logic.
export function syncPill(cuReady){
  if (cuReady) setCuPill("ok", "ClickUp: connected");
  else if (state.config.token) setCuPill("off", "ClickUp: select a workspace");
  else setCuPill("off", "ClickUp: off");
}
