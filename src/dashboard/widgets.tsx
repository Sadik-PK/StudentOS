import { useEffect, useMemo, useRef, useState } from "react"
import type { AppState, TodoItem } from "../types"
import { apiRequest } from "../api"
import {
  addLocalDays,
  dateAtNoon,
  expandPersonalEvents,
  localDateKey,
  zonedDateTime,
  type CalendarItem,
  type PersonalEvent,
} from "../calendar"
import { COURSES, formatTime12, getDayName, GRADE_POINTS, timeToMinutes } from "../data"
import type { WidgetRenderContext } from "./types"

const muted = "font-mono text-[10px] text-[#718096]"
const border = "border-[#19222e]"

function openModule(onNavigate: (page: string) => void, page: string, label: string) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(page)}
      className="font-mono text-[9px] text-amber-400 hover:text-amber-300"
    >
      {label} →
    </button>
  )
}

function todayClasses(state: AppState, now: Date) {
  return state.timetable
    .filter((entry) => entry.day === getDayName(now))
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
}

function UpcomingWidget({
  values,
  label,
}: {
  values: { id: string; title: string; subtitle: string; date: string; priority?: string }[]
  label: string
}) {
  if (values.length === 0) {
    return <p className="px-4 py-5 text-center font-mono text-[10px] text-[#4e5e72]">NO {label} TO SHOW</p>
  }
  return (
    <div className={`divide-y ${border}`}>
      {values.map((item) => (
        <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm text-[#cdd5df]">{item.title}</p>
            <p className={muted}>{item.subtitle}</p>
          </div>
          <div className="shrink-0 text-right">
            {item.priority && <p className="font-mono text-[9px] uppercase text-amber-400">{item.priority}</p>}
            <p className={muted}>{item.date}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export function NextClassWidget({ state, now }: WidgetRenderContext) {
  const minutes = now.getHours() * 60 + now.getMinutes()
  const next = todayClasses(state, now).find((entry) => timeToMinutes(entry.endTime) > minutes)
  if (!next) return <p className="px-4 py-6 text-center font-mono text-[10px] text-[#4e5e72]">NO MORE CLASSES TODAY</p>
  const starts = timeToMinutes(next.startTime)
  const ends = timeToMinutes(next.endTime)
  const active = minutes >= starts && minutes < ends
  const remaining = Math.max(0, (active ? ends : starts) - minutes)
  return (
    <div className="p-4">
      <p className="font-mono text-sm font-semibold text-amber-400">{next.courseCode}</p>
      <p className="mt-1 text-sm text-[#cdd5df]">{next.courseName}</p>
      <p className={`${muted} mt-2`}>
        {next.type} · {formatTime12(next.startTime)}–{formatTime12(next.endTime)}
      </p>
      <p className={`${muted} mt-1`}>{next.room ? `Room ${next.room}` : "Room not set"}</p>
      <p className={`mt-3 font-mono text-[10px] ${active ? "text-green-400" : "text-amber-400"}`}>
        {active ? "IN PROGRESS" : "UP NEXT"} · {remaining >= 60 ? `${Math.floor(remaining / 60)}h ` : ""}{remaining % 60}m
      </p>
    </div>
  )
}

export function TodayScheduleWidget({ state, now, settings, onNavigate }: WidgetRenderContext) {
  const classes = todayClasses(state, now)
  const showRoom = settings.showRoom !== false
  return (
    <>
      {classes.length ? (
        <div className={`divide-y ${border}`}>
          {classes.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-24 shrink-0 font-mono text-[9px] text-[#718096]">
                {formatTime12(entry.startTime)}<br />{formatTime12(entry.endTime)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-[#cdd5df]">
                <span className="font-mono text-[10px] text-amber-400">{entry.courseCode}</span> · {entry.courseName}
              </span>
              {showRoom && entry.room && <span className="hidden font-mono text-[9px] text-[#718096] sm:block">{entry.room}</span>}
            </div>
          ))}
        </div>
      ) : <p className="px-4 py-5 text-center font-mono text-[10px] text-[#4e5e72]">NO CLASSES SCHEDULED</p>}
      <div className={`border-t ${border} px-4 py-2`}>{openModule(onNavigate, "timetable", "VIEW TIMETABLE")}</div>
    </>
  )
}

export function WeeklyTimetableWidget({ state, now, settings, onNavigate }: WidgetRenderContext) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
  const showRoom = settings.showRoom !== false
  return (
    <div className="grid grid-cols-1 divide-y divide-[#19222e] sm:grid-cols-2 sm:divide-y-0">
      {days.map((day) => {
        const entries = state.timetable
          .filter((entry) => entry.day === day)
          .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
        return (
          <section key={day} className={`min-w-0 border-b ${border} p-3 sm:odd:border-r`}>
            <p className={`mb-2 font-mono text-[9px] uppercase tracking-wider ${day === getDayName(now) ? "text-amber-400" : "text-[#718096]"}`}>{day}</p>
            {entries.length ? entries.map((entry) => (
              <p key={entry.id} className="mb-1 truncate text-[11px] text-[#cdd5df]">
                <span className="font-mono text-[9px] text-[#718096]">{entry.startTime}</span> {entry.courseCode}
                {showRoom && entry.room && <span className="text-[#718096]"> · {entry.room}</span>}
              </p>
            )) : <p className="font-mono text-[9px] text-[#4e5e72]">No classes</p>}
          </section>
        )
      })}
      <div className={`col-span-full px-4 py-2`}>{openModule(onNavigate, "timetable", "EDIT TIMETABLE")}</div>
    </div>
  )
}

export function AttendanceWidget({ state, settings, onNavigate }: WidgetRenderContext) {
  const selected = Array.isArray(settings.courseCodes) ? settings.courseCodes as string[] : []
  const visible = state.attendance.filter((record) => selected.length === 0 || selected.includes(record.courseCode))
  const threshold = typeof settings.warningThreshold === "number" ? settings.warningThreshold : 75
  if (!visible.length) {
    return <p className="px-4 py-5 text-center font-mono text-[10px] text-[#4e5e72]">NO ATTENDANCE RECORDS</p>
  }
  return (
    <>
      <div className={`divide-y ${border}`}>
        {visible.map((record) => {
          const pct = record.total ? Math.round(((record.attended + record.dutyLeave) / record.total) * 100) : 0
          const color = pct >= threshold ? "bg-green-500" : "bg-red-400"
          return (
            <div key={record.courseCode} className="px-4 py-2.5">
              <div className="mb-1 flex justify-between gap-2 font-mono text-[10px]">
                <span className="text-amber-400">{record.courseCode}</span>
                <span className={pct >= threshold ? "text-green-400" : "text-red-300"}>{pct}%</span>
              </div>
              <div className={`h-1 ${border} bg-[#19222e]`}><div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
              <p className={`${muted} mt-1`}>{record.attended + record.dutyLeave}/{record.total} classes attended</p>
            </div>
          )
        })}
      </div>
      <div className={`border-t ${border} px-4 py-2`}>{openModule(onNavigate, "attendance", "VIEW ATTENDANCE")}</div>
    </>
  )
}

export function AssignmentsWidget({ state, now, settings, onNavigate }: WidgetRenderContext) {
  const limit = typeof settings.limit === "number" ? settings.limit : 3
  const today = localDateKey(now)
  const assignments = state.assignments
    .filter((item) => !item.completed)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.courseCode,
      date: item.dueDate < today ? "OVERDUE" : item.dueDate === today ? "TODAY" : dateText(item.dueDate),
      priority: item.priority,
    }))
  return <><UpcomingWidget values={assignments} label="PENDING ASSIGNMENTS" /><div className={`border-t ${border} px-4 py-2`}>{openModule(onNavigate, "assignments", "VIEW ASSIGNMENTS")}</div></>
}

export function ExamsWidget({ state, now, settings, onNavigate }: WidgetRenderContext) {
  const limit = typeof settings.limit === "number" ? settings.limit : 3
  const today = localDateKey(now)
  const exams = state.exams
    .filter((exam) => exam.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .slice(0, limit)
    .map((exam) => ({
      id: exam.id,
      title: `${exam.type} · ${exam.courseCode}`,
      subtitle: exam.room || "Room not set",
      date: dateText(exam.date),
    }))
  return <><UpcomingWidget values={exams} label="UPCOMING EXAMS" /><div className={`border-t ${border} px-4 py-2`}>{openModule(onNavigate, "exams", "VIEW EXAMS")}</div></>
}

function dateText(date: string) {
  const parsed = dateAtNoon(date)
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function SemesterProgressWidget({ state, now }: WidgetRenderContext) {
  const start = Date.parse(`${state.settings.semesterStartDate}T00:00:00`)
  const end = Date.parse(`${state.settings.semesterEndDate}T00:00:00`)
  const percentage = Number.isFinite(start) && Number.isFinite(end) && end > start
    ? Math.max(0, Math.min(100, Math.round(((now.getTime() - start) / (end - start)) * 100)))
    : null
  if (percentage === null) return <p className="px-4 py-5 text-center font-mono text-[10px] text-[#4e5e72]">ADD SEMESTER DATES IN SETTINGS</p>
  return (
    <div className="p-4">
      <div className="mb-2 flex items-end justify-between"><span className="font-mono text-3xl text-[#cdd5df]">{percentage}%</span><span className={muted}>SEMESTER</span></div>
      <div className="h-1 bg-[#19222e]"><div className="h-full bg-amber-400" style={{ width: `${percentage}%` }} /></div>
      <div className={`mt-2 flex justify-between ${muted}`}><span>{state.settings.semesterStartDate}</span><span>{state.settings.semesterEndDate}</span></div>
    </div>
  )
}

export function GpaWidget({ state, onNavigate }: WidgetRenderContext) {
  let credits = 0
  let points = 0
  for (const grade of state.gpaGrades) {
    const course = COURSES.find((item) => item.code === grade.courseCode)
    const gradePoints = GRADE_POINTS[grade.grade]
    if (!course || gradePoints === undefined) continue
    credits += course.credits
    points += gradePoints * course.credits
  }
  return (
    <div className="p-4">
      <p className="font-mono text-3xl font-semibold text-amber-400">{credits ? (points / credits).toFixed(2) : "—"}</p>
      <p className={`${muted} mt-1`}>{credits ? `${credits} weighted credits graded` : "Enter grades to see your GPA."}</p>
      <div className="mt-3">{openModule(onNavigate, "gpa", "OPEN GPA CALCULATOR")}</div>
    </div>
  )
}

export function TodosWidget({ state, update }: WidgetRenderContext) {
  const [input, setInput] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const pending = state.todos.filter((todo) => !todo.done)
  const completed = state.todos.filter((todo) => todo.done)
  function addTodo() {
    const text = input.trim()
    if (!text) return
    const todos: TodoItem[] = [{ id: crypto.randomUUID(), text, done: false, createdAt: new Date().toISOString() }, ...state.todos]
    update({ todos })
    setInput("")
    inputRef.current?.focus()
  }
  return (
    <>
      <form className={`flex border-b ${border}`} onSubmit={(event) => { event.preventDefault(); addTodo() }}>
        <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Add a task…" className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm" />
        <button type="submit" className={`border-l ${border} px-4 font-mono text-sm text-amber-400`}>+</button>
      </form>
      <div className="max-h-64 divide-y divide-[#19222e] overflow-y-auto">
        {[...pending, ...completed].map((todo) => (
          <div key={todo.id} className="flex items-center gap-3 px-4 py-2">
            <input type="checkbox" checked={todo.done} aria-label={`Mark ${todo.text} ${todo.done ? "incomplete" : "complete"}`} onChange={() => update({ todos: state.todos.map((item) => item.id === todo.id ? { ...item, done: !item.done } : item) })} />
            <span className={`min-w-0 flex-1 truncate text-sm ${todo.done ? "text-[#718096] line-through" : "text-[#cdd5df]"}`}>{todo.text}</span>
            <button type="button" aria-label={`Delete ${todo.text}`} onClick={() => update({ todos: state.todos.filter((item) => item.id !== todo.id) })} className="font-mono text-xs text-[#718096] hover:text-red-400">×</button>
          </div>
        ))}
        {!state.todos.length && <p className="px-4 py-4 font-mono text-[10px] text-[#4e5e72]">NO TASKS YET</p>}
      </div>
    </>
  )
}

export function ExpensesWidget({ state, now, settings, onNavigate }: WidgetRenderContext) {
  const period = settings.period === "week" ? "week" : "month"
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const weekStart = addLocalDays(now, -((now.getDay() + 6) % 7))
  const startKey = localDateKey(period === "week" ? weekStart : firstDay)
  const expenses = state.expenses.filter((item) => item.date >= startKey && item.date <= localDateKey(now))
  const sum = expenses.reduce((total, item) => total + item.amount, 0)
  const formatter = new Intl.NumberFormat(undefined, { style: "currency", currency: "INR", maximumFractionDigits: 2 })
  return (
    <div className="p-4">
      <p className={muted}>{period === "week" ? "THIS WEEK" : "THIS MONTH"} · {expenses.length} TRANSACTIONS</p>
      <p className="mt-1 truncate font-mono text-2xl text-amber-400">{formatter.format(sum)}</p>
      <p className={`${muted} mt-2`}>Calculated from your saved expense records.</p>
      <div className="mt-3">{openModule(onNavigate, "expenses", "VIEW EXPENSES")}</div>
    </div>
  )
}

export function RecentTransactionsWidget({ state, settings, onNavigate }: WidgetRenderContext) {
  const limit = typeof settings.limit === "number" ? settings.limit : 5
  const formatter = new Intl.NumberFormat(undefined, { style: "currency", currency: "INR", maximumFractionDigits: 2 })
  const recent = [...state.expenses].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, limit)
  return (
    <>
      {recent.length ? (
        <div className={`divide-y ${border}`}>
          {recent.map((expense) => <div key={expense.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0"><p className="truncate text-sm text-[#cdd5df]">{expense.description || "No description"}</p><p className={muted}>{expense.category} · {dateText(expense.date)}</p></div>
            <span className="shrink-0 font-mono text-[10px] text-amber-400">{formatter.format(expense.amount)}</span>
          </div>)}
        </div>
      ) : <p className="px-4 py-5 text-center font-mono text-[10px] text-[#4e5e72]">NO EXPENSES RECORDED</p>}
      <div className={`border-t ${border} px-4 py-2`}>{openModule(onNavigate, "expenses", "VIEW EXPENSES")}</div>
    </>
  )
}

export function QuickActionsWidget({ onNavigate }: WidgetRenderContext) {
  const actions = [
    ["assignments", "Assignments"],
    ["exams", "Exams"],
    ["notes", "Notes"],
    ["attendance", "Attendance"],
    ["study-timer", "Study timer"],
    ["calendar", "Calendar / events"],
    ["expenses", "Expenses"],
  ]
  return <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
    {actions.map(([page, label]) => <button key={page} type="button" onClick={() => onNavigate(page)} className={`border ${border} px-2 py-2 text-left font-mono text-[9px] text-[#cdd5df] hover:border-amber-400 hover:text-amber-300`}>{label} →</button>)}
  </div>
}

export function CurrentTimeWidget({ now, settings }: WidgetRenderContext) {
  const timeZone = typeof settings.timeZone === "string" && settings.timeZone ? settings.timeZone : undefined
  const dateOptions: Intl.DateTimeFormatOptions = { weekday: "long", year: "numeric", month: "long", day: "numeric", ...(timeZone ? { timeZone } : {}) }
  const timeOptions: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", second: "2-digit", ...(timeZone ? { timeZone } : {}) }
  return <div className="p-4"><p className="font-mono text-3xl text-amber-400">{now.toLocaleTimeString(undefined, timeOptions)}</p><p className={`${muted} mt-2`}>{now.toLocaleDateString(undefined, dateOptions)}</p></div>
}

export function CalendarWidget({ state, now, settings, onNavigate }: WidgetRenderContext) {
  const [personalEvents, setPersonalEvents] = useState<PersonalEvent[]>([])
  const [error, setError] = useState("")
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  const startDate = localDateKey(now)
  const endExclusiveDate = localDateKey(addLocalDays(dateAtNoon(startDate), 31))
  const endDate = localDateKey(addLocalDays(dateAtNoon(endExclusiveDate), -1))
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({
      start: zonedDateTime(startDate, "00:00", timeZone).toISOString(),
      end: zonedDateTime(endExclusiveDate, "00:00", timeZone).toISOString(),
      startDate,
      endDate,
    })
    void apiRequest<PersonalEvent[]>(`/api/calendar/events?${params}`, { signal: controller.signal })
      .then(setPersonalEvents)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Calendar events could not be loaded.")
      })
    return () => controller.abort()
  }, [startDate, endDate, endExclusiveDate, timeZone])

  const items = useMemo(() => {
    const result = expandPersonalEvents(
      personalEvents,
      zonedDateTime(startDate, "00:00", timeZone),
      zonedDateTime(endExclusiveDate, "00:00", timeZone),
      timeZone,
    )
    const cursor = dateAtNoon(startDate)
    while (localDateKey(cursor) < endExclusiveDate) {
      const dateKey = localDateKey(cursor)
      state.timetable.filter((entry) => entry.day === getDayName(cursor)).forEach((entry) => {
        const start = zonedDateTime(dateKey, entry.startTime, timeZone)
        result.push({
          key: `class:${entry.id}:${dateKey}`, id: entry.id, source: "class",
          title: `${entry.courseCode} · ${entry.courseName}`, startsAt: start.toISOString(),
          endsAt: zonedDateTime(dateKey, entry.endTime, timeZone).toISOString(), allDay: false,
          startDate: null, endDate: null, category: "college", color: "blue",
        })
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    state.assignments.filter((item) => !item.completed && item.dueDate >= startDate && item.dueDate <= endDate).forEach((item) => {
      result.push({
        key: `assignment:${item.id}`, id: item.id, source: "assignment", title: item.title,
        startsAt: `${item.dueDate}T12:00:00.000Z`, endsAt: null, allDay: true,
        startDate: item.dueDate, endDate: item.dueDate, category: "college", color: "amber",
      })
    })
    state.exams.filter((item) => item.date >= startDate && item.date <= endDate).forEach((item) => {
      const start = zonedDateTime(item.date, item.startTime || "09:00", timeZone)
      result.push({
        key: `exam:${item.id}`, id: item.id, source: "exam", title: `${item.type} · ${item.courseCode}`,
        startsAt: start.toISOString(), endsAt: null, allDay: false, startDate: null,
        endDate: null, category: "college", color: "red",
      })
    })
    return result.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  }, [personalEvents, startDate, endDate, endExclusiveDate, state.timetable, state.assignments, state.exams, timeZone])

  const limit = typeof settings.limit === "number" ? settings.limit : 5
  const upcoming = items.filter((item) => {
    if (item.allDay && item.startDate) return item.startDate >= startDate
    return Date.parse(item.startsAt) >= now.getTime()
  }).slice(0, limit)
  return (
    <>
      {error && <p role="alert" className="px-4 py-2 font-mono text-[9px] text-red-300">{error}</p>}
      {upcoming.length ? <div className={`divide-y ${border}`}>
        {upcoming.map((item) => <CalendarEventRow key={item.key} item={item} timeZone={timeZone} onNavigate={onNavigate} />)}
      </div> : <p className="px-4 py-5 text-center font-mono text-[10px] text-[#4e5e72]">NO UPCOMING EVENTS</p>}
      <div className={`border-t ${border} px-4 py-2`}>{openModule(onNavigate, "calendar", "OPEN CALENDAR")}</div>
    </>
  )
}

function CalendarEventRow({ item, timeZone, onNavigate }: { item: CalendarItem; timeZone: string; onNavigate: (page: string) => void }) {
  const date = item.allDay && item.startDate
    ? `${dateText(item.startDate)} · ALL DAY`
    : new Intl.DateTimeFormat(undefined, { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(item.startsAt))
  return <button type="button" onClick={() => onNavigate("calendar")} className="block w-full px-4 py-2.5 text-left hover:bg-[#111720]">
    <p className={muted}>{date} · {item.source.toUpperCase()}</p>
    <p className="mt-1 truncate text-sm text-[#cdd5df]">{item.title}</p>
  </button>
}
