import { computed } from "vue";
import { state, workingHours } from "../store.js";
import { PX_PER_HOUR } from "../constants.js";
import { iso, pad, sameDay, startOfDay, timeOfDay, formatHoursMinutes, formatTodayHeader } from "../utils/date.js";
import { cuReady, isOnCallTask } from "./useClickUp.js";

// Timeline block geometry (design tokens): a fixed left gutter for the hour
// labels (BASE), right padding (RPAD) and gap between overlap columns (GAP).
const BASE = 70, RPAD = 8, GAP = 6;

// Free windows shorter than this (in hours) are dropped — they are rounding
// noise rather than a slot anything could be logged into.
const MIN_FREE_HOURS = 1 / 60;

// Subtract the busy intervals from [from, to] and return what's left. Inputs are
// hours-from-midnight; overlapping busy intervals are merged as we sweep.
function freeWindows(busy, from, to){
  const clipped = busy
    .map(([s, e]) => [Math.max(s, from), Math.min(e, to)])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);

  const out = [];
  let cursor = from;
  for (const [s, e] of clipped){
    if (s > cursor) out.push([cursor, s]);
    cursor = Math.max(cursor, e);
    if (cursor >= to) break;
  }
  if (cursor < to) out.push([cursor, to]);
  return out.filter(([s, e]) => e - s >= MIN_FREE_HOURS);
}

// "9.5" -> "09:30"
function hhmm(frac){
  const total = Math.round(frac * 60);
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

// Group entries into clusters of transitive overlap, then greedily assign each
// entry within a cluster to the first free column. Every entry in a cluster
// shares the cluster's column count so overlapping blocks sit side by side while
// non-overlapping ones span the full width. Mirrors the design prototype.
function layoutColumns(entries){
  const sorted = [...entries].sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime());
  const clusters = [];
  let cur = [], curEnd = -Infinity;
  for (const e of sorted){
    if (cur.length && e.start.getTime() >= curEnd){ clusters.push(cur); cur = []; curEnd = -Infinity; }
    cur.push(e);
    curEnd = Math.max(curEnd, e.end.getTime());
  }
  if (cur.length) clusters.push(cur);

  for (const cl of clusters){
    const laneEnds = [];
    for (const e of cl){
      let col = laneEnds.findIndex(end => e.start.getTime() >= end);
      if (col === -1){ col = laneEnds.length; laneEnds.push(e.end.getTime()); }
      else laneEnds[col] = e.end.getTime();
      e._col = col;
    }
    const cols = laneEnds.length;
    cl.forEach(e => { e._cols = cols; });
  }
  return sorted;
}

export function useDayView(){
  const model = computed(() => {
    const day = state.dayCursor;
    const dayKey = iso(day);
    const isToday = sameDay(day, new Date());
    const title = formatTodayHeader(day);

    const wIdx = (day.getDay() + 6) % 7;
    const isWeekend = wIdx >= 5;
    const holidayName = state.holidays.get(dayKey);
    const isHoliday = !!holidayName;
    const isWorkday = !isWeekend && !isHoliday;
    const badge = isHoliday
      ? { label: holidayName, cls: "holiday" }
      : isWeekend
        ? { label: "Weekend", cls: "weekend" }
        : { label: "Working day", cls: "work" };

    const entries = state.dayEntries;
    const dayStartMs = startOfDay(day).getTime();
    const nextMidnightMs = dayStartMs + 24 * 3600000;
    // Hours-from-midnight for an entry, clamped to the visible day (handles entries
    // that start before / end after the day, e.g. an On Call shift crossing midnight).
    const startFracOf = e => Math.max(0, (e.start.getTime() - dayStartMs) / 3600000);
    const endFracOf = e => Math.min(24, (Math.min(e.end.getTime(), nextMidnightMs) - dayStartMs) / 3600000);
    const inDayHours = e => Math.max(0, endFracOf(e) - startFracOf(e));

    // On Call entries are excluded from the day summary stats and surfaced
    // separately, mirroring the month view. They still appear as normal blocks on
    // the timeline. Hours are counted by the part that falls on this day so an
    // overnight shift isn't double-counted across two days.
    const regularEntries = entries.filter(e => !isOnCallTask(e.taskName));
    const totalLogged = regularEntries.reduce((s, e) => s + inDayHours(e), 0);
    const onCallTotal = entries.reduce((s, e) => s + (isOnCallTask(e.taskName) ? inDayHours(e) : 0), 0);
    const target = state.hoursPerDay;
    const goal = isWorkday ? target : 0;
    const remaining = Math.max(0, goal - totalLogged);
    const hasClickUp = cuReady();

    let diffText = "–", diffClass = "";
    if (hasClickUp && goal > 0){
      const diff = totalLogged - goal;
      if (Math.abs(diff) < 0.02){
        diffText = "0 min";
        diffClass = "zero";
      } else {
        const sign = diff > 0 ? "+" : "−";
        diffText = sign + formatHoursMinutes(Math.abs(diff));
        diffClass = diff > 0 ? "pos" : "neg";
      }
    }

    const stats = {
      logged: hasClickUp ? formatHoursMinutes(totalLogged) : "–",
      goal: goal > 0 ? formatHoursMinutes(goal) : "—",
      remaining: (hasClickUp && goal > 0) ? formatHoursMinutes(remaining) : "—",
      count: hasClickUp ? String(regularEntries.length) : "–",
      diffText,
      diffClass,
      onCallShow: hasClickUp && onCallTotal > 0,
      onCall: formatHoursMinutes(onCallTotal),
    };

    if (!hasClickUp){
      return { title, badge, stats, empty: "Connect ClickUp in settings (⚙) to see this day's time entries.", timeline: null };
    }
    // Unlogged slots inside the configured working hours. Only days that are
    // meant to be worked get them — a weekend or holiday has no window to fill.
    const work = workingHours.value;
    const freeSlots = isWorkday
      ? freeWindows(entries.map(e => [startFracOf(e), endFracOf(e)]), work.start, work.end)
      : [];

    if (entries.length === 0 && freeSlots.length === 0){
      return { title, badge, stats, empty: "No time entries logged for this day yet.", timeline: null };
    }

    let minH = work.start, maxH = Math.max(work.end, work.start + 1);
    for (const e of entries){
      const sH = Math.floor(startFracOf(e));
      const eH = Math.ceil(endFracOf(e));
      if (sH < minH) minH = sH;
      if (eH > maxH) maxH = eH;
    }
    const now = new Date();
    if (isToday){
      const nowH = now.getHours();
      if (nowH < minH) minH = nowH;
      if (nowH + 1 > maxH) maxH = nowH + 1;
    }
    minH = Math.max(0, minH);
    maxH = Math.min(24, maxH);
    if (maxH <= minH) maxH = minH + 1;

    // Hour gridlines, inclusive of the closing hour (design shows 08:00…17:00).
    const hours = [];
    for (let h = minH; h <= maxH; h++){
      hours.push({ h, label: `${pad(h)}:00`, top: (h - minH) * PX_PER_HOUR });
    }
    const height = (maxH - minH) * PX_PER_HOUR;

    // Placeholders never overlap a real entry (they are the complement of them),
    // so they always span the full width behind the blocks.
    const placeholders = freeSlots.map(([s, e]) => {
      const blockHeight = Math.max(22, (e - s) * PX_PER_HOUR - 6);
      return {
        id: `free-${s}-${e}`,
        top: (s - minH) * PX_PER_HOUR,
        height: blockHeight,
        left: `${BASE}px`,
        width: `calc(100% - ${BASE + RPAD}px)`,
        short: blockHeight < 40,
        rangeText: `${hhmm(s)}–${hhmm(e)}`,
        durationText: formatHoursMinutes(e - s),
        tooltip: `Nothing logged ${hhmm(s)}–${hhmm(e)} (${formatHoursMinutes(e - s)})`,
      };
    });

    const laid = layoutColumns(entries.map(e => ({ ...e })));
    const blocks = laid.map(e => {
      const startFrac = startFracOf(e);
      const top = (startFrac - minH) * PX_PER_HOUR;
      const rawHeight = (endFracOf(e) - startFrac) * PX_PER_HOUR - 6;
      const blockHeight = Math.max(22, rawHeight);
      const cols = e._cols, col = e._col;
      const span = `(100% - ${BASE + RPAD}px - ${(cols - 1) * GAP}px)/${cols}`;
      const width = `calc(${span})`;
      const left = col === 0 ? `${BASE}px` : `calc(${BASE}px + ${col} * (${span} + ${GAP}px))`;
      const taskUrl = e.taskId ? `https://app.clickup.com/t/${e.taskId}` : null;

      let tip = `${e.taskName}\n${timeOfDay(e.start)}–${timeOfDay(e.end)} (${formatHoursMinutes(e.hours)})`;
      if (e.taskStatus) tip += `\nStatus: ${e.taskStatus}`;
      if (e.description && e.description !== e.taskName) tip += `\n${e.description}`;
      if (taskUrl) tip += `\nClick to open in ClickUp`;

      return {
        id: e.id,
        tag: taskUrl ? "a" : "div",
        href: taskUrl,
        isOnCall: isOnCallTask(e.taskName),
        short: blockHeight < 40,
        clickable: !!taskUrl,
        top,
        height: blockHeight,
        left,
        width,
        titleText: e.taskCustomId ? `${e.taskCustomId} · ${e.taskName}` : e.taskName,
        showMeta: blockHeight >= 34,
        metaText: `${timeOfDay(e.start)}–${timeOfDay(e.end)} · ${formatHoursMinutes(e.hours)}`,
        tooltip: tip,
      };
    });

    const nowFrac = now.getHours() + now.getMinutes() / 60;
    const nowLine = (isToday && nowFrac >= minH && nowFrac <= maxH)
      ? { top: (nowFrac - minH) * PX_PER_HOUR, label: timeOfDay(now) }
      : null;

    return {
      title,
      badge,
      stats,
      empty: null,
      timeline: { hours, blocks, placeholders, nowLine, height },
    };
  });

  return { model };
}
