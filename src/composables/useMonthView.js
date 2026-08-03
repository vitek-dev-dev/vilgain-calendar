import { computed } from "vue";
import { state, hoursPerDay, mandayHours } from "../store.js";
import { mondayIndex, isoWeekNumber, iso, sameDay, daysInMonth, formatHours } from "../utils/date.js";
import { cuReady } from "./useClickUp.js";

// Decide which numbers show inside a day cell, mirroring the original buildHours():
// returns nothing (show:false) when the cell should stay empty.
function dayHours(hasClickUp, isWorkday, logged, target){
  if (hasClickUp){
    if (isWorkday){
      return {
        show: true,
        loggedStr: formatHours(logged),
        logClass: logged + 1e-6 >= target ? "ok" : "bad",
        targetStr: formatHours(target),
      };
    }
    if (logged > 0){
      return { show: true, loggedStr: formatHours(logged), logClass: "ok", targetStr: "" };
    }
    return { show: false };
  }
  // Not connected: preview the target on workdays only.
  if (isWorkday) return { show: true, loggedStr: "", logClass: "", targetStr: formatHours(target) };
  return { show: false };
}

// Derives the whole month grid (week rows, day cells, running subtotals) and the
// header stat cards from reactive state, mirroring the original renderMonth().
export function useMonthView(){
  const model = computed(() => {
    const cursor = state.cursor;
    const year = cursor.getFullYear();
    const month = cursor.getMonth();

    const first = new Date(year, month, 1);
    const leading = mondayIndex(first);
    const total = daysInMonth(first);
    const cellCount = Math.ceil((leading + total) / 7) * 7;
    const today = new Date();
    const hasClickUp = cuReady();
    const target = hoursPerDay.value;

    let workDays = 0, weekendDays = 0, holidayOnWeekday = 0, loggedTotal = 0, onCallTotal = 0;
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
    let targetToToday = 0, loggedToToday = 0;
    let runningTarget = 0, runningLogged = 0;

    const weeks = [];
    let week = null;

    for (let i = 0; i < cellCount; i++){
      const dayNum = i - leading + 1;
      const date = new Date(year, month, dayNum);
      const inMonth = dayNum >= 1 && dayNum <= total;
      const key = iso(date);
      const wIdx = mondayIndex(date);
      const isWeekend = wIdx >= 5;
      const holidayName = state.holidays.get(key);
      const isHoliday = !!holidayName;
      const isWorkday = inMonth && !isWeekend && !isHoliday;
      const logged = state.entries.get(key) || 0;
      const onCall = state.onCall.get(key) || 0;

      if (i % 7 === 0){
        week = {
          weekNum: isoWeekNumber(date),
          days: [],
          target: 0,
          logged: 0,
          onCall: 0,
          workDays: 0,
          hasInMonth: false,
          runningTarget: 0,
          runningLogged: 0,
        };
      }

      if (inMonth){
        week.hasInMonth = true;
        week.logged += logged;
        week.onCall += onCall;
        onCallTotal += onCall;
        if (isWorkday){
          week.workDays++;
          week.target += target;
          workDays++;
        } else if (isWeekend) {
          weekendDays++;
        } else if (isHoliday) {
          holidayOnWeekday++;
        }
        loggedTotal += logged;
        if (isCurrentMonth && date.getDate() <= today.getDate()){
          if (isWorkday) targetToToday += target;
          loggedToToday += logged;
        }
      }

      week.days.push({
        key,
        date,
        dayNum: date.getDate(),
        inMonth,
        isWeekend: inMonth && isWeekend,
        isHoliday: inMonth && isHoliday,
        holidayName: inMonth ? holidayName : undefined,
        isToday: inMonth && sameDay(date, today),
        onCall,
        onCallStr: formatHours(onCall),
        hours: inMonth ? dayHours(hasClickUp, isWorkday, logged, target) : { show: false },
      });

      if (i % 7 === 6){
        if (week.hasInMonth){
          runningTarget += week.target;
          runningLogged += week.logged;
          week.runningTarget = runningTarget;
          week.runningLogged = runningLogged;
        }
        // Precompute the TOTAL cell display.
        week.sumLogClass = week.logged + 1e-6 >= week.target ? "ok" : "bad";
        week.sumLoggedStr = formatHours(week.logged);
        week.sumTargetStr = formatHours(week.target);
        week.cumLoggedStr = formatHours(week.runningLogged);
        week.cumTargetStr = formatHours(week.runningTarget);
        week.onCallStr = formatHours(week.onCall);
        weeks.push(week);
      }
    }

    const targetTotal = workDays * target;
    let diffText = "–", diffClass = "";
    if (hasClickUp){
      const diff = isCurrentMonth ? (loggedToToday - targetToToday) : (loggedTotal - targetTotal);
      diffText = (diff > 0 ? "+" : "") + formatHours(diff);
      if (Math.abs(diff) < 0.05) diffClass = "zero";
      else if (diff > 0) diffClass = "pos";
      else diffClass = "neg";
    }

    return {
      hasClickUp,
      weeks,
      stats: {
        weekendDays,
        holidayOnWeekday,
        workDays,
        targetTotal: formatHours(targetTotal),
        logged: hasClickUp ? formatHours(loggedTotal) : "–",
        loggedMandays: hasClickUp && loggedTotal > 0 ? `${formatHours(loggedTotal / mandayHours.value)} MD` : "",
        onCall: hasClickUp ? formatHours(onCallTotal) : "–",
        onCallBonus: hasClickUp ? formatHours(onCallTotal * 0.2) : "",
        diffLabel: isCurrentMonth ? "Diff to today" : "Diff",
        diffText,
        diffClass,
      },
    };
  });

  return { model };
}
