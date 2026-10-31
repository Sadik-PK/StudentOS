import type { AppState } from "../types"

export type DashboardWidgetId =
  | "nextClass"
  | "todaySchedule"
  | "semesterProgress"
  | "calendar"
  | "expenses"
  | "attendance"
  | "assignments"
  | "exams"
  | "todos"
  | "weeklyTimetable"
  | "gpa"
  | "quickActions"
  | "currentTime"
  | "recentTransactions"

export type DashboardPreset =
  | "student"
  | "academic"
  | "productivity"
  | "finance"
  | "minimal"
  | "custom"

export type DashboardWidgetSize = "small" | "medium" | "large" | "full"
export type DashboardDensity = "compact" | "comfortable" | "spacious"

export interface DashboardSection {
  id: string
  name: string
}

export interface DashboardWidgetConfig {
  id: DashboardWidgetId
  size: DashboardWidgetSize
  sectionId: string
  settings: Record<string, unknown>
}

export interface DashboardLayout {
  version: 1
  preset: DashboardPreset
  columns: 1 | 2 | 3
  density: DashboardDensity
  showGreeting: boolean
  showWidgetHeaders: boolean
  sections: DashboardSection[]
  widgets: DashboardWidgetConfig[]
}

export interface DashboardWorkspace {
  id: string
  name: string
  preset: DashboardPreset
  layout: DashboardLayout
  revision: number
  createdAt: string
  updatedAt: string
  recovered?: boolean
}

export interface WorkspaceListResponse {
  workspaces: DashboardWorkspace[]
  activeWorkspaceId: string
  maxWorkspaces: number
}

export interface WidgetRenderContext {
  state: AppState
  now: Date
  onNavigate: (page: string) => void
  update: (patch: Partial<AppState>) => void
  settings: Record<string, unknown>
}
