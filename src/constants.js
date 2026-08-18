export const WEEKDAYS_SHORT = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
export const WEEKDAYS_FULL = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const LS_KEY = "calendar.clickup.v1";
export const VIEW_LS_KEY = "calendar.view.v1";
// Every view the app can show; also the whitelist for the stored / hash view.
export const VIEWS = ["month", "day", "tasks", "prs"];
// Timeline scale: one hour = 64px (design token).
export const PX_PER_HOUR = 64;

// Recurring ceremonies that always land on the same clock window. They open the
// Log time drawer prefilled with the range so only the task is left to pick —
// the times are fixed by the meeting, not by configuration. Kept in start order
// so the row reads as the shape of the day.
export const QUICK_LOG_TEMPLATES = [
  { label: "Standup", start: "09:30", end: "10:00" },
  { label: "TechTalks", start: "12:00", end: "13:00" },
  { label: "Refinement", start: "13:30", end: "14:00" },
  { label: "Planning", start: "14:30", end: "15:30" },
];
