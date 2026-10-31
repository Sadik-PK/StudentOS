import type { ComponentType } from "react"
import type {
  DashboardWidgetId,
  DashboardWidgetSize,
  WidgetRenderContext,
} from "./types"
import {
  AssignmentsWidget,
  AttendanceWidget,
  CalendarWidget,
  CurrentTimeWidget,
  ExpensesWidget,
  ExamsWidget,
  GpaWidget,
  NextClassWidget,
  QuickActionsWidget,
  RecentTransactionsWidget,
  SemesterProgressWidget,
  TodayScheduleWidget,
  TodosWidget,
  WeeklyTimetableWidget,
} from "./widgets"

export interface DashboardWidgetDefinition {
  id: DashboardWidgetId
  name: string
  description: string
  category: "Academic" | "Productivity" | "Financial" | "General"
  icon: string
  defaultSize: DashboardWidgetSize
  minSize: DashboardWidgetSize
  maxSize: DashboardWidgetSize
  renderer: ComponentType<WidgetRenderContext>
  settings: { key: string; label: string; kind: "boolean" | "number" | "select" | "courses"; options?: string[] }[]
}

export const DASHBOARD_WIDGET_REGISTRY: DashboardWidgetDefinition[] = [
  { id: "todaySchedule", name: "Today's Timetable", description: "Today's classes and rooms.", category: "Academic", icon: "▦", defaultSize: "large", minSize: "medium", maxSize: "full", renderer: TodayScheduleWidget, settings: [{ key: "showRoom", label: "Show room", kind: "boolean" }] },
  { id: "nextClass", name: "Next Class", description: "Your next class and time.", category: "Academic", icon: "◷", defaultSize: "medium", minSize: "small", maxSize: "large", renderer: NextClassWidget, settings: [] },
  { id: "weeklyTimetable", name: "Weekly Timetable", description: "Recurring classes for the week.", category: "Academic", icon: "▤", defaultSize: "large", minSize: "medium", maxSize: "full", renderer: WeeklyTimetableWidget, settings: [{ key: "showRoom", label: "Show room", kind: "boolean" }] },
  { id: "attendance", name: "Attendance Overview", description: "Attendance percentages from your records.", category: "Academic", icon: "▣", defaultSize: "medium", minSize: "small", maxSize: "large", renderer: AttendanceWidget, settings: [{ key: "warningThreshold", label: "Warning threshold (%)", kind: "number" }, { key: "courseCodes", label: "Limit to selected courses", kind: "courses" }] },
  { id: "assignments", name: "Upcoming Assignments", description: "Pending assignment deadlines.", category: "Academic", icon: "▤", defaultSize: "medium", minSize: "small", maxSize: "large", renderer: AssignmentsWidget, settings: [{ key: "limit", label: "Items to show", kind: "number" }] },
  { id: "exams", name: "Upcoming Exams", description: "Your examination schedule.", category: "Academic", icon: "△", defaultSize: "medium", minSize: "small", maxSize: "large", renderer: ExamsWidget, settings: [{ key: "limit", label: "Items to show", kind: "number" }] },
  { id: "semesterProgress", name: "Semester Progress", description: "Progress based on your semester dates.", category: "Academic", icon: "▰", defaultSize: "small", minSize: "small", maxSize: "medium", renderer: SemesterProgressWidget, settings: [] },
  { id: "gpa", name: "GPA Overview", description: "Credit-weighted GPA from entered grades.", category: "Academic", icon: "◈", defaultSize: "small", minSize: "small", maxSize: "medium", renderer: GpaWidget, settings: [] },
  { id: "todos", name: "To-Do List", description: "Create and manage your own tasks.", category: "Productivity", icon: "☑", defaultSize: "medium", minSize: "small", maxSize: "large", renderer: TodosWidget, settings: [] },
  { id: "calendar", name: "Upcoming Calendar Events", description: "Classes, deadlines, exams and personal events.", category: "Productivity", icon: "◷", defaultSize: "large", minSize: "medium", maxSize: "full", renderer: CalendarWidget, settings: [{ key: "limit", label: "Items to show", kind: "number" }] },
  { id: "quickActions", name: "Quick Actions", description: "Shortcuts to real StudentOS modules.", category: "Productivity", icon: "＋", defaultSize: "medium", minSize: "small", maxSize: "large", renderer: QuickActionsWidget, settings: [] },
  { id: "currentTime", name: "Date and Time", description: "Current local date and time.", category: "General", icon: "◷", defaultSize: "small", minSize: "small", maxSize: "medium", renderer: CurrentTimeWidget, settings: [] },
  { id: "expenses", name: "Monthly Expenses", description: "Totals from your expense records.", category: "Financial", icon: "◇", defaultSize: "medium", minSize: "small", maxSize: "large", renderer: ExpensesWidget, settings: [{ key: "period", label: "Summary period", kind: "select", options: ["week", "month"] }] },
  { id: "recentTransactions", name: "Recent Transactions", description: "Your most recently recorded expenses.", category: "Financial", icon: "≡", defaultSize: "medium", minSize: "small", maxSize: "large", renderer: RecentTransactionsWidget, settings: [{ key: "limit", label: "Items to show", kind: "number" }] },
]

export const DASHBOARD_WIDGETS = Object.fromEntries(
  DASHBOARD_WIDGET_REGISTRY.map((widget) => [widget.id, widget]),
) as Record<DashboardWidgetId, DashboardWidgetDefinition>

export function isDashboardWidgetId(value: string): value is DashboardWidgetId {
  return value in DASHBOARD_WIDGETS
}
