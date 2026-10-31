import { lazy, Suspense, useEffect, useState } from "react"
import { Page } from "./types"
import { useAppStore } from "./store"
import { authClient } from "./auth"
import AuthScreen from "./components/AuthScreen"
import Dashboard from "./pages/Dashboard"
import Timetable from "./pages/Timetable"
import Attendance from "./pages/Attendance"
import Assignments from "./pages/Assignments"
import Exams from "./pages/Exams"
import Notes from "./pages/Notes"
import GPA from "./pages/GPA"
import Expenses from "./pages/Expenses"
import StudyTimer from "./pages/StudyTimer"
import Settings from "./pages/Settings"

const AIStudy = lazy(() => import("./pages/AIStudy"))

const NAV: { page: Page; label: string; icon: string }[] = [
  { page: "dashboard", label: "DASHBOARD", icon: "○" },
  { page: "ai-study", label: "AI STUDY", icon: "✧" },
  { page: "timetable", label: "TIMETABLE", icon: "▦" },
  { page: "attendance", label: "ATTENDANCE", icon: "▣" },
  { page: "assignments", label: "ASSIGNMENTS", icon: "▤" },
  { page: "exams", label: "EXAMS", icon: "△" },
  { page: "notes", label: "NOTES", icon: "☰" },
  { page: "gpa", label: "GPA", icon: "◈" },
  { page: "expenses", label: "EXPENSES", icon: "◇" },
  { page: "study-timer", label: "STUDY TIMER", icon: "◷" },
]

const PAGE_TITLES: Record<Page, string> = {
  dashboard: "DASHBOARD",
  "ai-study": "AI STUDY ASSISTANT",
  timetable: "TIMETABLE",
  attendance: "ATTENDANCE",
  assignments: "ASSIGNMENTS",
  exams: "EXAMS",
  notes: "NOTES",
  gpa: "GPA CALCULATOR",
  expenses: "EXPENSE TRACKER",
  "study-timer": "STUDY TIMER",
  settings: "SETTINGS",
}

function CloudLoadingScreen({
  error,
  onRetry,
}: {
  error: string | null
  onRetry: () => void
}) {
  const [scramble, setScramble] = useState("0A1B2C")

  useEffect(() => {
    const characters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    const interval = window.setInterval(() => {
      setScramble(
        Array.from(
          { length: 6 },
          () => characters[Math.floor(Math.random() * characters.length)],
        ).join(""),
      )
    }, 90)

    return () => window.clearInterval(interval)
  }, [])

  return (
    <div className="h-full bg-[#080b0f] flex flex-col items-center justify-center gap-3 font-mono text-xs text-[#4e5e72]">
      <p>
        {error ? "CLOUD DATA UNAVAILABLE" : "LOADING YOUR CLOUD DATA..."}
      </p>
      <span
        aria-hidden="true"
        className="text-amber-400 tracking-[0.3em] animate-pulse"
      >
        {scramble}
      </span>
      {error && (
        <>
          <p role="alert" className="max-w-md px-4 text-center text-red-400">
            {error}
          </p>
          <button
            onClick={onRetry}
            className="border border-amber-400 px-3 py-1.5 text-amber-400 hover:bg-amber-400 hover:text-[#090b0e]"
          >
            RETRY CLOUD CONNECTION
          </button>
        </>
      )}
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>("dashboard")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const authState = authClient.useSession()
  const sessionUser = authState.data?.user
  const user = sessionUser ?? null
  const {
    state,
    ready,
    update,
    reset,
    storageStatus,
    lastSaved,
    hasPendingSync,
    syncError,
    refreshFromCloud,
    retryLoad,
    retrySave,
  } = useAppStore(user?.id ?? null, user?.name ?? "")

  if (authState.isPending) {
    return (
      <div className="h-full bg-[#080b0f] flex items-center justify-center font-mono text-xs text-[#4e5e72]">
        CONNECTING TO STUDENT/OS...
      </div>
    )
  }
  if (!user) return <AuthScreen />
  if (!ready) {
    return <CloudLoadingScreen error={syncError} onRetry={retryLoad} />
  }

  async function logout() {
    setLogoutError(null)
    try {
      const result = await authClient.signOut()
      if (result.error) {
        setLogoutError(result.error.message ?? "Could not log out.")
      }
    } catch (error) {
      setLogoutError(
        error instanceof Error ? error.message : "Could not log out.",
      )
    }
  }

  const now = new Date()
  const dateStr = now
    .toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    .toUpperCase()
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  })

  const pendingAssignments = state.assignments.filter(
    (a) => !a.completed,
  ).length
  const lowAttendance = state.attendance.filter((r) => {
    const pct =
      r.total === 0
        ? 0
        : Math.round(((r.attended + (r.dutyLeave || 0)) / r.total) * 100)
    return pct < 75
  }).length

  return (
    <div className="flex h-full bg-[#080b0f] text-[#cdd5df] overflow-hidden">
      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 lg:z-auto w-56 bg-[#080b0f] border-r border-[#19222e] flex flex-col transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="px-4 py-5 border-b border-[#19222e]">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-amber-400 font-bold text-sm tracking-wider">
              STUDENT
            </span>
            <span className="font-mono text-[#2a3548] text-xs">/</span>
            <span className="font-mono text-[#4e5e72] text-xs tracking-wider">
              OS
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="font-mono text-[10px] text-[#4e5e72]">
              SEM 1 · OPERATIONAL
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {NAV.map((item) => {
            const isActive = page === item.page
            const hasBadge =
              item.page === "assignments" && pendingAssignments > 0
            const hasAlert = item.page === "attendance" && lowAttendance > 0
            return (
              <button
                key={item.page}
                onClick={() => {
                  setPage(item.page)
                  setSidebarOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors group ${
                  isActive
                    ? "bg-[#0f1a0a] border-l-2 border-amber-400"
                    : "border-l-2 border-transparent hover:bg-[#0d1219]"
                }`}
              >
                <span
                  className={`font-mono text-sm ${
                    isActive
                      ? "text-amber-400"
                      : "text-[#2a3548] group-hover:text-[#4e5e72]"
                  }`}
                >
                  {item.icon}
                </span>
                <span
                  className={`font-mono text-[11px] tracking-wider flex-1 ${
                    isActive
                      ? "text-amber-400"
                      : "text-[#4e5e72] group-hover:text-[#cdd5df]"
                  }`}
                >
                  {item.label}
                </span>
                {hasBadge && (
                  <span className="font-mono text-[10px] bg-amber-400 text-[#080b0f] px-1 min-w-[16px] text-center">
                    {pendingAssignments}
                  </span>
                )}
                {hasAlert && (
                  <span className="font-mono text-[10px] text-red-400">▲</span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Settings at bottom */}
        <div className="border-t border-[#19222e] py-2">
          <button
            onClick={() => {
              setPage("settings")
              setSidebarOpen(false)
            }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors group border-l-2 ${
              page === "settings"
                ? "bg-[#0f1a0a] border-amber-400"
                : "border-transparent hover:bg-[#0d1219]"
            }`}
          >
            <span
              className={`font-mono text-sm ${
                page === "settings"
                  ? "text-amber-400"
                  : "text-[#2a3548] group-hover:text-[#4e5e72]"
              }`}
            >
              ⊙
            </span>
            <span
              className={`font-mono text-[11px] tracking-wider ${
                page === "settings"
                  ? "text-amber-400"
                  : "text-[#4e5e72] group-hover:text-[#cdd5df]"
              }`}
            >
              SETTINGS
            </span>
          </button>
          <div className="px-4 py-2">
            <p className="font-mono text-[9px] text-[#2a3548]">
              {state.settings.profileName.toUpperCase()}
            </p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="border-b border-[#19222e] bg-[#080b0f] px-4 lg:px-6 py-3 flex items-center gap-4 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden font-mono text-xs text-[#4e5e72] hover:text-[#cdd5df] transition-colors"
          >
            ≡ MENU
          </button>
          <div className="flex-1 flex items-center gap-4">
            <span className="font-mono text-[11px] tracking-widest text-[#4e5e72] hidden sm:block">
              {dateStr}
            </span>
            <span className="text-[#19222e] hidden sm:block">|</span>
            <h1 className="font-mono text-[11px] tracking-widest text-[#cdd5df]">
              {PAGE_TITLES[page]}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-[10px] text-[#4e5e72] hidden md:block">
              {timeStr}
            </span>
            {lowAttendance > 0 && (
              <button
                onClick={() => setPage("attendance")}
                className="font-mono text-[10px] text-red-400 border border-red-400 px-2 py-0.5 hover:bg-red-400 hover:text-[#090b0e] transition-colors"
              >
                ▲ {lowAttendance} CRIT
              </button>
            )}
            <div className="w-7 h-7 bg-[#19222e] flex items-center justify-center">
              <span className="font-mono text-[10px] text-[#4e5e72]">
                {state.settings.profileName.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {page === "dashboard" && (
            <Dashboard
              state={state}
              onNavigate={(p) => setPage(p as Page)}
              update={update}
            />
          )}
          {page === "ai-study" && (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center font-mono text-xs text-[#4e5e72]">
                  LOADING AI STUDY ASSISTANT...
                </div>
              }
            >
              <AIStudy state={state} update={update} />
            </Suspense>
          )}
          {page === "timetable" && <Timetable state={state} update={update} />}
          {page === "attendance" && (
            <Attendance state={state} update={update} />
          )}
          {page === "assignments" && (
            <Assignments state={state} update={update} />
          )}
          {page === "exams" && <Exams state={state} update={update} />}
          {page === "notes" && <Notes state={state} update={update} />}
          {page === "gpa" && <GPA state={state} update={update} />}
          {page === "expenses" && <Expenses state={state} update={update} />}
          {page === "study-timer" && (
            <StudyTimer state={state} update={update} />
          )}
          {page === "settings" && (
            <Settings
              state={state}
              update={update}
              reset={reset}
              storageStatus={storageStatus}
              lastSaved={lastSaved}
              email={user.email}
              hasPendingSync={hasPendingSync}
              syncError={syncError}
              logoutError={logoutError}
              onReloadCloud={refreshFromCloud}
              onRetrySave={retrySave}
              onLogout={logout}
            />
          )}
        </main>
      </div>
    </div>
  )
}
