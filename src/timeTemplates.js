// Time-entry templates for one-click logging into ClickUp.
//
// Edit this list to add / remove templates or change the exact times. Each entry:
//
//   label        Display name on the card. (required)
//   start        "HH:MM" 24h local time the entry begins. (required)
//   end          "HH:MM" 24h local time the entry ends. (required)
//                If end is <= start it is treated as the next day (overnight).
//   group        Heading the card is listed under. (optional; default "Other")
//                Groups appear in the order they first show up in this list.
//   taskId       ClickUp task id the time is attached to. (optional)
//                Find it in the task URL: app.clickup.com/t/<taskId>. Leave "" (or
//                omit) for a task-less, description-only entry.
//   description  Text stored on the entry. (optional; defaults to label)
//   billable     Whether the entry is billable. (optional; default false)
//   icon         Emoji shown on the card. (optional)
//
// Times are editable in the UI before you confirm; entries are logged onto the
// date selected at the top of the Templates tab (today by default).

export const TIME_TEMPLATES = [
  // --- Meetings ---
  { label: "Standup", start: "09:30", end: "10:00", group: "Meetings", taskId: "", description: "Daily standup", icon: "🧍" },

  // --- Oncalls ---
  { label: "Oncall-Morning", start: "00:00", end: "08:00", group: "Oncalls", taskId: "", description: "Oncall-Morning", icon: "🌅" },
  { label: "Oncall-Afternoon", start: "16:00", end: "00:00", group: "Oncalls", taskId: "", description: "Oncall-Afternoon", icon: "🌆" },
  { label: "Oncall-Weekend", start: "00:00", end: "00:00", group: "Oncalls", taskId: "", description: "Oncall-Weekend", icon: "🗓️" },
];
