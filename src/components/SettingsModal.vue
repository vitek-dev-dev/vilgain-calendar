<script setup>
import { ref, computed, watch, nextTick } from "vue";
import { state, saveConfig, setStatus, setCuPill, syncPill, workingHours, mandayHours } from "../store.js";
import { pad } from "../utils/date.js";
import { cuReady, cuLoadAccount, cuLoadTeams, cuLoadFolders, isValidOnCallPattern } from "../composables/useClickUp.js";
import { isValidPriorityPattern, clearTaskPools } from "../composables/useTaskFinder.js";
import { ghReady, ghLoadAccount, ghLoadPRs } from "../composables/useGitHub.js";
import { refresh } from "../composables/useCalendar.js";

const props = defineProps({
  open: { type: Boolean, default: false },
});
const emit = defineEmits(["close"]);

const TABS = [
  { key: "integrations", label: "Integrations" },
  { key: "tasks", label: "Tasks" },
  { key: "preferences", label: "Preferences" },
];
const activeTab = ref("integrations");

const tokenInput = ref("");
const ghTokenInput = ref("");
const ghOrgInput = ref("");
const onCallRows = ref([]);
const excludeRows = ref([]);
const priorityRows = ref([]);
const tokenEl = ref(null);
const cuTeamsLoading = ref(false);
const ghAccountLoading = ref(false);

const connected = computed(() => !!state.cuUser && cuReady());
const ghConnected = computed(() => !!state.ghUser && ghReady());

const teamOptions = computed(() =>
  state.cuTeams.map(t => ({ value: String(t.id), label: t.name })),
);

const cuName = computed(() => state.cuUser?.username || state.cuUser?.email || "");
const cuSub = computed(() => state.cuUser?.email || state.cuUser?.username || "Not connected");
const cuInitials = computed(() => initials(cuName.value));

const ghName = computed(() => state.ghUser?.name || state.ghUser?.login || "");
const ghSub = computed(() => {
  if (state.ghUser) return "@" + (state.ghUser.login || "");
  return ghAccountLoading.value ? "Checking token…" : "Not connected";
});
const ghInitials = computed(() => initials(ghName.value) || "GH");
const ghBadge = computed(() => {
  if (ghAccountLoading.value) return "Checking…";
  return ghConnected.value ? "Connected" : "Not connected";
});

function initials(name){
  if (!name) return "CU";
  const parts = String(name).trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(name).slice(0, 2).toUpperCase();
}

// The workspace list populates nothing but the select below, so it is fetched on
// first open instead of on page load. On failure the list stays empty (the select
// falls back to "—") and the status line carries the reason.
async function loadCuTeams(){
  cuTeamsLoading.value = true;
  try {
    await cuLoadTeams();
  } catch (err){
    setStatus("ClickUp: " + err.message);
  } finally {
    cuTeamsLoading.value = false;
  }
}

// The GitHub identity is shown nowhere but this dialog, so it is fetched on
// first open instead of on page load. A failure leaves ghUser null, which falls
// back to the Connect form (with the stored token prefilled) and reports the
// error on the status line — so a revoked token is visible rather than silently
// stuck on "Connected".
async function loadGhAccount(){
  ghAccountLoading.value = true;
  try {
    await ghLoadAccount();
  } catch (err){
    setStatus("GitHub: " + err.message);
  } finally {
    ghAccountLoading.value = false;
  }
}

// Re-hydrate the local (non-live) inputs whenever the dialog opens.
watch(() => props.open, (isOpen) => {
  if (!isOpen) return;
  activeTab.value = "integrations";
  tokenInput.value = state.config.token || "";
  ghTokenInput.value = state.config.githubToken || "";
  ghOrgInput.value = state.config.githubOrg || "";
  onCallRows.value = [...(state.config.onCallTasks || [])];
  excludeRows.value = [...(state.config.excludeStatuses || [])];
  priorityRows.value = [...(state.config.priorityTasks || [])];
  // Guarded so reopening the dialog doesn't refetch what we already have, or fire
  // a second request while the first is still in flight. The workspace list is
  // gated on the token alone, not cuReady(), so it also loads in the state where
  // a token is stored but no workspace has been picked yet.
  if (!state.cuTeams.length && state.config.token && !cuTeamsLoading.value) loadCuTeams();
  if (!state.ghUser && ghReady() && !ghAccountLoading.value) loadGhAccount();
  nextTick(() => { if (!connected.value) tokenEl.value?.focus(); });
});

const DAILY_MIN = 0.5, DAILY_MAX = 24;
function stepTarget(delta){
  const next = Math.min(DAILY_MAX, Math.max(DAILY_MIN, +(state.hoursPerDay + delta).toFixed(1)));
  state.hoursPerDay = next;
  state.config.hoursPerDay = next;
  saveConfig();
  refresh();
}

// Manday hours — the stats read config reactively, so persisting is enough.
function stepManday(delta){
  const next = Math.min(DAILY_MAX, Math.max(DAILY_MIN, +(mandayHours.value + delta).toFixed(1)));
  state.config.mandayHours = next;
  saveConfig();
}

// Working hours — whole hours, start strictly before end. The steppers clamp to
// the neighbouring bound so the window can never invert.
const workStartLabel = computed(() => `${pad(workingHours.value.start)}:00`);
const workEndLabel = computed(() => `${pad(workingHours.value.end)}:00`);

function stepWorkStart(delta){
  const { start, end } = workingHours.value;
  state.config.workStartHour = Math.min(end - 1, Math.max(0, start + delta));
  state.config.workEndHour = end;
  saveConfig();
}
function stepWorkEnd(delta){
  const { start, end } = workingHours.value;
  state.config.workStartHour = start;
  state.config.workEndHour = Math.min(24, Math.max(start + 1, end + delta));
  saveConfig();
}

// On-call task patterns (row editor) — persist trimmed, non-empty values.
// Patterns that don't compile are kept (so the user can fix a typo) but flagged.
function persistOnCall(){
  state.config.onCallTasks = onCallRows.value.map(s => s.trim()).filter(Boolean);
  saveConfig();
  refresh();
}
function onCallRowInvalid(i){ return !isValidOnCallPattern(onCallRows.value[i]); }
function addOnCall(){ onCallRows.value.push(""); }
function removeOnCall(i){ onCallRows.value.splice(i, 1); persistOnCall(); }

// Exclude statuses (row editor) — the Tasks view model reads config reactively,
// so persisting is enough (no refetch needed).
function persistExclude(){
  state.config.excludeStatuses = excludeRows.value.map(s => s.trim()).filter(Boolean);
  saveConfig();
}
function addExclude(){ excludeRows.value.push(""); }
function removeExclude(i){ excludeRows.value.splice(i, 1); persistExclude(); }

// Sprint folder — loaded only when the Tasks tab is opened, since enumerating
// folders costs a request per Space.
const folders = ref([]);
const foldersLoading = ref(false);

async function loadFolders(){
  if (folders.value.length || foldersLoading.value || !cuReady()) return;
  foldersLoading.value = true;
  try {
    folders.value = await cuLoadFolders();
  } catch (err){
    setStatus("ClickUp: " + err.message);
  } finally {
    foldersLoading.value = false;
  }
}

watch(activeTab, (tab) => { if (tab === "tasks") loadFolders(); });

// Changing it changes what counts as a sprint, so drop the cached pools and the
// list metadata derived from the old setting.
function applySprintFolder(){
  saveConfig();
  clearTaskPools();
}

// Priority tasks (row editor) — the task picker reads config reactively, so
// persisting is enough.
function persistPriority(){
  state.config.priorityTasks = priorityRows.value.map(s => s.trim()).filter(Boolean);
  saveConfig();
}
function priorityRowInvalid(i){ return !isValidPriorityPattern(priorityRows.value[i]); }
function addPriority(){ priorityRows.value.push(""); }
function removePriority(i){ priorityRows.value.splice(i, 1); persistPriority(); }

function applyClickUpSelect(){
  saveConfig();
  refresh();
}

async function connect(){
  const token = tokenInput.value.trim();
  if (!token){ setStatus("Enter a ClickUp token."); return; }
  state.config.token = token;
  try {
    setCuPill("off", "ClickUp: connecting…");
    await cuLoadAccount();
    if (!state.config.teamId && state.cuTeams[0]) state.config.teamId = String(state.cuTeams[0].id);
    saveConfig();
    setCuPill("ok", `ClickUp: ${state.cuUser?.username || "connected"}`);
    setStatus("Connected. Loading time entries…");
    refresh();
  } catch (err){
    setCuPill("err", "ClickUp: error");
    setStatus("ClickUp: " + err.message);
  }
}

function disconnect(){
  // Clear only the ClickUp credentials — every other preference survives.
  Object.assign(state.config, { token: "", teamId: "", hoursPerDay: state.hoursPerDay });
  state.cuUser = null;
  state.cuTeams = [];
  // A different token may see a different workspace, so don't reuse the pool.
  clearTaskPools();
  state.entries.clear();
  state.onCall.clear();
  state.dayEntries = [];
  // Drop the loaded-period markers too, so the calendar and day views treat the
  // next refresh as a first load rather than a silent one.
  state.entriesPeriod = "";
  state.dayEntriesKey = "";
  saveConfig();
  tokenInput.value = "";
  syncPill(cuReady());
  setStatus("ClickUp disconnected.");
}

async function connectGh(){
  const token = ghTokenInput.value.trim();
  if (!token){ setStatus("Enter a GitHub token."); return; }
  state.config.githubToken = token;
  try {
    setStatus("GitHub: connecting…");
    await ghLoadAccount();
    saveConfig();
    setStatus(`GitHub: connected as @${state.ghUser?.login || ""}`);
    await ghLoadPRs();
  } catch (err){
    setStatus("GitHub: " + err.message);
  }
}

function applyGhOrg(){
  state.config.githubOrg = ghOrgInput.value.trim();
  saveConfig();
  ghLoadPRs();
}

function disconnectGh(){
  state.config.githubToken = "";
  state.ghUser = null;
  state.ghPrs = [];
  saveConfig();
  ghTokenInput.value = "";
  setStatus("GitHub disconnected.");
}
</script>

<template>
  <div class="settings-backdrop" :class="{ open }" @click="emit('close')"></div>
  <section
    class="settings"
    :class="{ open }"
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-title"
    aria-label="Settings"
  >
    <header class="settings-head">
      <h2 id="settings-title">Settings</h2>
      <button class="settings-close" type="button" aria-label="Close" @click="emit('close')">✕</button>
    </header>

    <div class="settings-tabs" role="tablist" aria-label="Settings sections">
      <button
        v-for="t in TABS"
        :key="t.key"
        class="settings-tab"
        :class="{ active: activeTab === t.key }"
        role="tab"
        :aria-selected="activeTab === t.key"
        type="button"
        @click="activeTab = t.key"
      >{{ t.label }}</button>
    </div>

    <div class="settings-body">
      <!-- ── Integrations ── -->
      <template v-if="activeTab === 'integrations'">
        <!-- ClickUp -->
        <div class="set-card">
          <div class="int-head">
            <div class="int-left">
              <div class="avatar" style="background:#6d5df0">{{ cuInitials }}</div>
              <div class="int-id">
                <div class="int-label">ClickUp</div>
                <div class="int-sub">{{ cuSub }}</div>
              </div>
            </div>
            <span class="badge" :class="connected ? 'connected' : 'off'">{{ connected ? "Connected" : "Not connected" }}</span>
          </div>

          <template v-if="connected">
            <div v-if="cuTeamsLoading" class="int-help">Loading workspaces…</div>
            <label v-else class="mini-field">
              <span class="mini-label">Workspace</span>
              <div class="sel-wrap">
                <select v-model="state.config.teamId" @change="applyClickUpSelect">
                  <option value="">—</option>
                  <option v-for="t in teamOptions" :key="t.value" :value="t.value">{{ t.label }}</option>
                </select>
                <span class="sel-caret" aria-hidden="true">▾</span>
              </div>
            </label>
            <div class="disconnect-row">
              <button class="link-btn" type="button" @click="disconnect">Disconnect</button>
            </div>
          </template>

          <template v-else>
            <div class="int-connect">
              <input
                ref="tokenEl"
                v-model="tokenInput"
                type="password"
                autocomplete="off"
                placeholder="pk_xxx…"
                @keydown.enter="connect"
              >
              <button class="primary-btn" type="button" @click="connect">Connect</button>
            </div>
            <div class="int-help">Your token is stored only in this browser's localStorage. Generate one in ClickUp → Settings → Apps.</div>
          </template>
        </div>

        <!-- GitHub -->
        <div class="set-card">
          <div class="int-head">
            <div class="int-left">
              <div class="avatar" style="background:#1e293b">{{ ghInitials }}</div>
              <div class="int-id">
                <div class="int-label">GitHub</div>
                <div class="int-sub">{{ ghSub }}</div>
              </div>
            </div>
            <span class="badge" :class="ghConnected ? 'connected' : 'off'">{{ ghBadge }}</span>
          </div>

          <template v-if="ghAccountLoading">
            <div class="int-help">Loading your GitHub account…</div>
          </template>

          <template v-else-if="ghConnected">
            <label class="mini-field">
              <span class="mini-label">Organisation</span>
              <input v-model="ghOrgInput" type="text" autocomplete="off" placeholder="my-org" @change="applyGhOrg">
            </label>
            <div class="int-help">Only load pull requests in repositories owned by this org (or user). Leave empty to load from everywhere.</div>
            <div class="disconnect-row">
              <button class="link-btn" type="button" @click="disconnectGh">Disconnect</button>
            </div>
          </template>

          <template v-else>
            <div class="int-connect">
              <input
                v-model="ghTokenInput"
                type="password"
                autocomplete="off"
                placeholder="ghp_xxx…"
                @keydown.enter="connectGh"
              >
              <button class="primary-btn" type="button" @click="connectGh">Connect</button>
            </div>
            <div class="int-help">A personal access token with <code>repo</code> scope, stored only in this browser's localStorage. Generate one in GitHub → Settings → Developer settings → Tokens.</div>
          </template>
        </div>
      </template>

      <!-- ── Tasks ── -->
      <template v-else-if="activeTab === 'tasks'">
        <!-- On-call task patterns -->
        <div class="set-card">
          <div>
            <div class="set-label">On-call task patterns</div>
            <div class="set-help">
              Hours logged to a ClickUp task whose name matches any of these patterns count as on-call.
              Each row is a regular expression, case-insensitive and matched anywhere in the name —
              e.g. <code>^BAU \| Oncall.*</code>.
            </div>
          </div>
          <div v-if="onCallRows.length" class="list-rows">
            <div v-for="(_, i) in onCallRows" :key="i" class="list-row">
              <input
                v-model="onCallRows[i]"
                :class="{ invalid: onCallRowInvalid(i) }"
                :title="onCallRowInvalid(i) ? 'Not a valid regular expression — this row never matches.' : ''"
                type="text"
                autocomplete="off"
                spellcheck="false"
                placeholder="Task name pattern"
                @change="persistOnCall"
              >
              <button class="row-remove" type="button" aria-label="Remove" @click="removeOnCall(i)">−</button>
            </div>
          </div>
          <div v-else class="list-empty-note">No on-call task patterns yet.</div>
          <button class="row-add" type="button" @click="addOnCall">＋ Add pattern</button>
        </div>

        <!-- Sprint folder -->
        <div class="set-card">
          <div>
            <div class="set-label">Sprint folder</div>
            <div class="set-help">
              The Folder holding your Sprint Lists. ClickUp's API doesn't mark sprints, so this
              is what makes them detectable — until it's set, tasks show their Folder instead of
              a sprint.
            </div>
          </div>
          <div class="sel-wrap">
            <select
              v-model="state.config.sprintFolderId"
              :class="{ invalid: connected && !state.config.sprintFolderId }"
              :disabled="!connected"
              @change="applySprintFolder"
            >
              <option value="" disabled>{{ foldersLoading ? "Loading folders…" : "Select a folder…" }}</option>
              <option v-for="f in folders" :key="f.id" :value="f.id">{{ f.space }} / {{ f.name }}</option>
            </select>
            <span class="sel-caret" aria-hidden="true">▾</span>
          </div>
        </div>

        <!-- Priority tasks -->
        <div class="set-card">
          <div>
            <div class="set-label">Priority task patterns</div>
            <div class="set-help">
              Tasks whose name matches any of these are pinned to the top of the task picker
              under the Default sort, including ones in the current sprint that aren't assigned
              to you. Each row is a case-insensitive regular expression matched anywhere in the
              name — e.g. <code>^BAU \|</code> for a prefix.
            </div>
          </div>
          <div v-if="priorityRows.length" class="list-rows">
            <div v-for="(_, i) in priorityRows" :key="i" class="list-row">
              <input
                v-model="priorityRows[i]"
                :class="{ invalid: priorityRowInvalid(i) }"
                :title="priorityRowInvalid(i) ? 'Not a valid regular expression — this row never matches.' : ''"
                type="text"
                autocomplete="off"
                spellcheck="false"
                placeholder="Task name pattern"
                @change="persistPriority"
              >
              <button class="row-remove" type="button" aria-label="Remove" @click="removePriority(i)">−</button>
            </div>
          </div>
          <div v-else class="list-empty-note">No priority task patterns yet.</div>
          <button class="row-add" type="button" @click="addPriority">＋ Add pattern</button>
        </div>

        <!-- Exclude statuses -->
        <div class="set-card">
          <div>
            <div class="set-label">Exclude statuses</div>
            <div class="set-help">Tasks in these ClickUp statuses are hidden from the Tasks view.</div>
          </div>
          <div v-if="excludeRows.length" class="list-rows">
            <div v-for="(_, i) in excludeRows" :key="i" class="list-row">
              <input v-model="excludeRows[i]" type="text" autocomplete="off" placeholder="Status" @change="persistExclude">
              <button class="row-remove" type="button" aria-label="Remove" @click="removeExclude(i)">−</button>
            </div>
          </div>
          <div v-else class="list-empty-note">No excluded statuses yet.</div>
          <button class="row-add" type="button" @click="addExclude">＋ Add status</button>
        </div>
      </template>

      <!-- ── Preferences ── -->
      <template v-else-if="activeTab === 'preferences'">
        <div class="pref-row">
          <div>
            <div class="set-label">Daily target</div>
            <div class="set-help">Expected logged hours per working day.</div>
          </div>
          <div class="stepper">
            <button type="button" aria-label="Decrease" @click="stepTarget(-0.5)">−</button>
            <div class="val">{{ state.hoursPerDay }} h</div>
            <button type="button" aria-label="Increase" @click="stepTarget(0.5)">+</button>
          </div>
        </div>

        <div class="pref-row">
          <div>
            <div class="set-label">Manday hours</div>
            <div class="set-help">Hours in one manday. Logged time is shown in mandays alongside the hours.</div>
          </div>
          <div class="stepper">
            <button type="button" aria-label="Decrease" @click="stepManday(-0.5)">−</button>
            <div class="val">{{ mandayHours }} h</div>
            <button type="button" aria-label="Increase" @click="stepManday(0.5)">+</button>
          </div>
        </div>

        <div class="pref-row">
          <div>
            <div class="set-label">Working hours</div>
            <div class="set-help">The window the day timeline fills with free-slot placeholders.</div>
          </div>
          <div class="work-hours">
            <div class="stepper">
              <button type="button" aria-label="Decrease start hour" @click="stepWorkStart(-1)">−</button>
              <div class="val">{{ workStartLabel }}</div>
              <button type="button" aria-label="Increase start hour" @click="stepWorkStart(1)">+</button>
            </div>
            <span class="work-hours-dash" aria-hidden="true">–</span>
            <div class="stepper">
              <button type="button" aria-label="Decrease end hour" @click="stepWorkEnd(-1)">−</button>
              <div class="val">{{ workEndLabel }}</div>
              <button type="button" aria-label="Increase end hour" @click="stepWorkEnd(1)">+</button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
