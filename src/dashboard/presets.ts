import type {
  DashboardLayout,
  DashboardPreset,
  DashboardWidgetId,
} from "./types"

const sectionFor: Record<DashboardWidgetId, string> = {
  nextClass: "overview",

  todaySchedule: "academics",

  semesterProgress: "academics",

  calendar: "overview",

  expenses: "finance",

  attendance: "academics",

  assignments: "academics",

  exams: "academics",

  todos: "productivity",

  weeklyTimetable: "academics",

  gpa: "academics",

  quickActions: "overview",

  currentTime: "overview",

  recentTransactions: "finance",
}

const widgetsByPreset: Record<DashboardPreset, DashboardWidgetId[]> = {
  student: [
    "nextClass",

    "todaySchedule",

    "attendance",

    "assignments",

    "exams",

    "calendar",

    "semesterProgress",

    "todos",

    "quickActions",
  ],

  academic: [
    "weeklyTimetable",

    "attendance",

    "gpa",

    "semesterProgress",

    "assignments",

    "exams",

    "nextClass",
  ],

  productivity: [
    "todos",

    "calendar",

    "todaySchedule",

    "quickActions",

    "currentTime",

    "weeklyTimetable",
  ],

  finance: ["expenses", "recentTransactions", "quickActions", "currentTime"],

  minimal: ["nextClass", "assignments", "calendar", "todos"],

  custom: [],
}

function defaultSettings(id: DashboardWidgetId): Record<string, unknown> {
  switch (id) {
    case "todaySchedule":

    case "weeklyTimetable":
      return { showRoom: true }

    case "calendar":

    case "assignments":

    case "exams":
      return { limit: id === "calendar" ? 5 : 3 }

    case "attendance":
      return { warningThreshold: 75, courseCodes: [] }

    case "expenses":
      return { period: "month" }

    case "recentTransactions":
      return { limit: 5 }

    case "currentTime":
      return {}

    default:
      return {}
  }
}

export function createDashboardLayout(
  preset: DashboardPreset,
): DashboardLayout {
  const sections = [
    { id: "overview", name: "Overview" },

    { id: "academics", name: "Academics" },

    { id: "productivity", name: "Productivity" },

    { id: "finance", name: "Finance" },
  ]

  return {
    version: 1,

    preset,

    columns: 2,

    density: "comfortable",

    showGreeting: true,

    showWidgetHeaders: true,

    sections,

    widgets: widgetsByPreset[preset].map((id) => ({
      id,

      size: [
        "todaySchedule",

        "calendar",

        "weeklyTimetable",

        "expenses",

        "recentTransactions",
      ].includes(id)
        ? "large"
        : "medium",

      sectionId: sectionFor[id],

      settings: defaultSettings(id),
    })),
  }
}

export const DASHBOARD_PRESETS: {
  id: Exclude<DashboardPreset, "custom">

  name: string

  description: string
}[] = [
  {
    id: "student",
    name: "Student",
    description: "A balanced overview for your day.",
  },

  {
    id: "academic",
    name: "Academic",
    description: "Timetable, attendance, grades and deadlines.",
  },

  {
    id: "productivity",
    name: "Productivity",
    description: "Tasks, schedule and quick links.",
  },

  {
    id: "finance",
    name: "Finance",
    description: "Your actual expense records and summaries.",
  },

  {
    id: "minimal",
    name: "Minimal",
    description: "A focused set of essential widgets.",
  },
]
