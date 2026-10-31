import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { apiRequest } from "../api"

import { COURSES, formatTime12, getDayName, timeToMinutes } from "../data"

import {
  addLocalDays,
  CalendarCategory,
  CalendarItem,
  CalendarRecurrence,
  CalendarSource,
  CalendarView,
  dateAtNoon,
  dateKeyInZone,
  expandPersonalEvents,
  getCalendarRange,
  localDateKey,
  PersonalEvent,
  timeInZone,
  zonedDateTime,
} from "../calendar"

import type { AppState, Assignment, Exam, TimetableEntry } from "../types"

interface Props {
  state: AppState

  update: (patch: Partial<AppState>) => void

  onNavigate: (page: string) => void
}

interface CalendarPreferences {
  calendarView: CalendarView

  calendarVisibleSources: CalendarSource[]

  calendarVisibleCategories: CalendarCategory[]

  calendarTimezone: string
}

type EventForm = {
  title: string

  description: string

  startDate: string

  startTime: string

  endDate: string

  endTime: string

  allDay: boolean

  category: CalendarCategory

  location: string

  reminderMinutes: string

  recurrence: CalendarRecurrence

  recurrenceUntil: string

  recurrenceDays: number[]

  color: string

  completed: boolean

  priority: Assignment["priority"]

  courseCode: string

  type: string

  room: string

  group: string
}

type ModalState = { open: false } | {
  open: true
  item: CalendarItem | null
  form: EventForm
  duplicate?: boolean
  editSeries?: boolean
}

interface CalendarSourceOption {
  id: CalendarSource
  label: string
  color: string
}

const SOURCES: CalendarSourceOption[] = [
  { id: "class", label: "Classes", color: "bg-sky-400" },

  { id: "assignment", label: "Assignments", color: "bg-amber-400" },

  { id: "exam", label: "Exams", color: "bg-red-400" },

  { id: "personal", label: "Personal", color: "bg-violet-400" },

  { id: "study", label: "Study sessions", color: "bg-green-400" },
]

const CATEGORIES: CalendarCategory[] = [
  "personal",
  "college",
  "study",
  "work",
  "health",
  "other",
]

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const HOURS = Array.from({ length: 16 }, (_, index) => index + 7)

const REMINDERS = [
  { value: "", label: "No reminder" },

  { value: "0", label: "At event time" },

  { value: "5", label: "5 minutes before" },

  { value: "15", label: "15 minutes before" },

  { value: "30", label: "30 minutes before" },

  { value: "60", label: "1 hour before" },

  { value: "1440", label: "1 day before" },
]

const defaultTimezone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"

function getWeekday(dateKey: string) {
  return dateAtNoon(dateKey).getDay()
}

function eventDateKey(item: CalendarItem, timeZone: string) {
  return item.allDay && item.startDate
    ? item.startDate
    : dateKeyInZone(new Date(item.startsAt), timeZone)
}

function formForItem(
  item: CalendarItem | null,
  timeZone: string,
  initialDate: string,
): EventForm {
  if (!item) {
    return {
      title: "",

      description: "",

      startDate: initialDate,

      startTime: "09:00",

      endDate: initialDate,

      endTime: "10:00",

      allDay: false,

      category: "personal",

      location: "",

      reminderMinutes: "",

      recurrence: "none",

      recurrenceUntil: "",

      recurrenceDays: [],

      color: "amber",

      completed: false,

      priority: "medium",

      courseCode: "CSE111",

      type: "Lecture",

      room: "",

      group: "",
    }
  }

  const start = new Date(item.startsAt)

  const end = item.endsAt
    ? new Date(item.endsAt)
    : new Date(start.getTime() + 60 * 60 * 1000)

  return {
    title: item.title,

    description: item.description || "",

    startDate: item.startDate || dateKeyInZone(start, timeZone),

    startTime: timeInZone(start, timeZone),

    endDate: item.endDate || dateKeyInZone(end, timeZone),

    endTime: timeInZone(end, timeZone),

    allDay: item.allDay,

    category: item.category,

    location: item.location || "",

    reminderMinutes:
      item.reminderMinutes == null ? "" : String(item.reminderMinutes),

    recurrence: item.recurrence || "none",

    recurrenceUntil: item.recurrenceUntil || "",

    recurrenceDays: item.recurrenceDays || [],

    color: item.color || "amber",

    completed: item.completed || false,

    priority: item.priority as Assignment["priority"] || "medium",

    courseCode: item.courseCode || "CSE111",

    type: item.type || "Lecture",

    room: item.room || "",

    group: "",
  }
}

function dateLabel(
  dateKey: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
  },
) {
  return dateAtNoon(dateKey).toLocaleDateString(undefined, options)
}

function colorClass(item: CalendarItem) {
  if (item.source === "class")
    return "border-sky-400 bg-sky-400/10 text-sky-200"

  if (item.source === "assignment")
    return "border-amber-400 bg-amber-400/10 text-amber-200"

  if (item.source === "exam") return "border-red-400 bg-red-400/10 text-red-200"

  return item.category === "study"
    ? "border-green-400 bg-green-400/10 text-green-200"
    : "border-violet-400 bg-violet-400/10 text-violet-200"
}

function localItemTime(item: CalendarItem, timeZone: string) {
  if (item.allDay) return "ALL DAY"

  return timeInZone(new Date(item.startsAt), timeZone)
}

function makeDefaultPreferences(): CalendarPreferences {
  return {
    calendarView: window.matchMedia("(max-width: 640px)").matches
      ? "agenda"
      : "month",

    calendarVisibleSources: SOURCES.map((source) => source.id),

    calendarVisibleCategories: CATEGORIES,

    calendarTimezone: defaultTimezone(),
  }
}

function CalendarEventButton({
  item,

  timeZone,

  onClick,

  onDragStart,
}: {
  item: CalendarItem

  timeZone: string

  onClick: () => void

  onDragStart?: (event: React.DragEvent) => void
}) {
  const time = localItemTime(item, timeZone)

  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      title={`${time} · ${item.title}${
        item.location ? ` · ${item.location}` : ""
      }`}
      className={`block w-full truncate border-l-2 px-1.5 py-1 text-left text-[10px] leading-tight hover:brightness-125 focus:outline-none focus:ring-1 focus:ring-amber-400 ${colorClass(item)}`}
    >
      {!item.allDay && <span className="mr-1 font-mono">{time}</span>}
      {item.title}
    </button>
  )
}

export default function Calendar({ state, update, onNavigate }: Props) {
  const [anchor, setAnchor] = useState(() => new Date())

  const [preferences, setPreferences] = useState<CalendarPreferences>(
    makeDefaultPreferences,
  )

  const [timezoneDraft, setTimezoneDraft] = useState(defaultTimezone)

  const [preferencesLoaded, setPreferencesLoaded] = useState(false)

  const [personalEvents, setPersonalEvents] = useState<PersonalEvent[]>([])

  const [eventsError, setEventsError] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)

  const [refreshKey, setRefreshKey] = useState(0)

  const [search, setSearch] = useState("")

  const [modal, setModal] = useState<ModalState>({ open: false })

  const [toast, setToast] = useState("")

  const [reminderToast, setReminderToast] = useState("")

  const [now, setNow] = useState(() => new Date())

  const [miniMonth, setMiniMonth] = useState(() => new Date())

  const dragItemRef = useRef<CalendarItem | null>(null)

  const remindedRef = useRef(new Set<string>())

  const range = useMemo(
    () => getCalendarRange(anchor, preferences.calendarView),

    [anchor, preferences.calendarView],
  )

  const rangeStartKey = localDateKey(range.start)

  const rangeEndKey = localDateKey(addLocalDays(range.end, -1))

  const rangeStart = zonedDateTime(
    rangeStartKey,
    "00:00",
    preferences.calendarTimezone,
  )

  const rangeEnd = zonedDateTime(
    localDateKey(range.end),
    "00:00",
    preferences.calendarTimezone,
  )

  const loadEvents = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)

      setEventsError(null)

      const params = new URLSearchParams({
        start: rangeStart.toISOString(),

        end: rangeEnd.toISOString(),

        startDate: rangeStartKey,

        endDate: rangeEndKey,
      })

      try {
        const result = await apiRequest<PersonalEvent[]>(
          `/api/calendar/events?${params}`,
          { signal },
        )

        setPersonalEvents(result)
      } catch (error) {
        if (signal?.aborted) return

        setEventsError(
          error instanceof Error
            ? error.message
            : "Could not load calendar events.",
        )
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [rangeStart.getTime(), rangeEnd.getTime(), rangeStartKey, rangeEndKey],
  )

  useEffect(() => {
    const controller = new AbortController()

    void apiRequest<Partial<CalendarPreferences> & {
      calendarTimezone: string | null
    }>(
      "/api/calendar/preferences",

      { signal: controller.signal },
    )
      .then((saved) => {
        setPreferences({
          ...makeDefaultPreferences(),

          ...saved,

          calendarTimezone: saved.calendarTimezone || defaultTimezone(),
        })

        setTimezoneDraft(saved.calendarTimezone || defaultTimezone())

        setPreferencesLoaded(true)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setEventsError(
            error instanceof Error
              ? error.message
              : "Could not load calendar preferences.",
          )

          setPreferencesLoaded(true)
        }
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    void loadEvents(controller.signal)

    return () => controller.abort()
  }, [loadEvents, refreshKey])

  useEffect(() => {
    if (!preferencesLoaded) return

    const timer = window.setTimeout(() => {
      void apiRequest("/api/calendar/preferences", {
        method: "PATCH",

        body: JSON.stringify({
          calendarView: preferences.calendarView,

          calendarVisibleSources: preferences.calendarVisibleSources,

          calendarVisibleCategories: preferences.calendarVisibleCategories,

          calendarTimezone: preferences.calendarTimezone,
        }),
      }).catch((error: unknown) => {
        setToast(
          error instanceof Error
            ? error.message
            : "Could not save calendar preferences.",
        )
      })
    }, 500)

    return () => window.clearTimeout(timer)
  }, [preferences, preferencesLoaded])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000)

    return () => window.clearInterval(timer)
  }, [])

  const items = useMemo(() => {
    const result = expandPersonalEvents(
      personalEvents,
      rangeStart,
      rangeEnd,
      preferences.calendarTimezone,
    )

    const cursor = new Date(
      range.start.getFullYear(),
      range.start.getMonth(),
      range.start.getDate(),
      12,
    )

    while (cursor < range.end) {
      const dateKey = localDateKey(cursor)

      const weekday = getDayName(cursor)

      state.timetable
        .filter((entry) => entry.day === weekday)
        .forEach((entry) => {
          const startsAt = zonedDateTime(
            dateKey,
            entry.startTime,
            preferences.calendarTimezone,
          )

          const endsAt = zonedDateTime(
            dateKey,
            entry.endTime,
            preferences.calendarTimezone,
          )

          result.push({
            key: `class:${entry.id}:${dateKey}`,

            id: entry.id,

            sourceId: entry.id,

            source: "class",

            title: `${entry.courseCode} · ${entry.courseName}`,

            description: entry.note,

            startsAt: startsAt.toISOString(),

            endsAt: endsAt.toISOString(),

            allDay: false,

            startDate: null,

            endDate: null,

            category: "college",

            location: entry.room,

            color: "blue",

            courseCode: entry.courseCode,

            type: entry.type,

            room: entry.room,

            recurrenceDate: dateKey,
          })
        })

      cursor.setDate(cursor.getDate() + 1)
    }

    state.assignments.forEach((assignment) => {
      if (
        assignment.dueDate < rangeStartKey ||
        assignment.dueDate > rangeEndKey
      )
        return

      result.push({
        key: `assignment:${assignment.id}`,

        id: assignment.id,

        sourceId: assignment.id,

        source: "assignment",

        title: assignment.title,

        description: assignment.notes,

        startsAt: `${assignment.dueDate}T12:00:00.000Z`,

        endsAt: null,

        allDay: true,

        startDate: assignment.dueDate,

        endDate: assignment.dueDate,

        category: "college",

        color: "amber",

        courseCode: assignment.courseCode,

        completed: assignment.completed,

        priority: assignment.priority,

        reminderMinutes: assignment.reminderMinutes ?? null,
      })
    })

    state.exams.forEach((exam) => {
      if (exam.date < rangeStartKey || exam.date > rangeEndKey) return

      const startsAt = zonedDateTime(
        exam.date,
        exam.startTime || "09:00",
        preferences.calendarTimezone,
      )

      const courseName = COURSES.find(
        (course) => course.code === exam.courseCode,
      )?.name

      result.push({
        key: `exam:${exam.id}`,

        id: exam.id,

        sourceId: exam.id,

        source: "exam",

        title: `${exam.type} · ${exam.courseCode}`,

        description: courseName,

        startsAt: startsAt.toISOString(),

        endsAt: new Date(startsAt.getTime() + 90 * 60_000).toISOString(),

        allDay: false,

        startDate: null,

        endDate: null,

        category: "college",

        location: exam.room,

        color: "red",

        courseCode: exam.courseCode,

        type: exam.type,

        room: exam.room,
      })
    })

    return result.sort((first, second) => {
      const firstDate =
        first.allDay && first.startDate
          ? dateAtNoon(first.startDate).getTime()
          : Date.parse(first.startsAt)

      const secondDate =
        second.allDay && second.startDate
          ? dateAtNoon(second.startDate).getTime()
          : Date.parse(second.startsAt)

      return firstDate - secondDate
    })
  }, [
    personalEvents,
    rangeStart.getTime(),
    rangeEnd.getTime(),
    state.timetable,
    state.assignments,
    state.exams,
    preferences.calendarTimezone,
    rangeStartKey,
    rangeEndKey,
  ])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()

    return items.filter((item) => {
      const sourceVisible = preferences.calendarVisibleSources.includes(
        item.source,
      )

      const categoryVisible = preferences.calendarVisibleCategories.includes(
        item.category,
      )

      const matchesSearch =
        !query ||
        [
          item.title,
          item.description,
          item.courseCode,
          item.category,
          item.location,
        ].some((value) => value?.toLowerCase().includes(query))

      return sourceVisible && categoryVisible && matchesSearch
    })
  }, [
    items,
    search,
    preferences.calendarVisibleSources,
    preferences.calendarVisibleCategories,
  ])

  const dateEvents = (dateKey: string) =>
    filteredItems.filter(
      (item) => eventDateKey(item, preferences.calendarTimezone) === dateKey,
    )

  function setView(view: CalendarView) {
    setPreferences((current) => ({ ...current, calendarView: view }))
  }

  function navigatePeriod(amount: number) {
    setAnchor((current) => {
      const next = new Date(current)

      if (preferences.calendarView === "month")
        next.setMonth(next.getMonth() + amount)
      else if (preferences.calendarView === "week")
        next.setDate(next.getDate() + amount * 7)
      else if (preferences.calendarView === "agenda")
        next.setDate(next.getDate() + amount * 31)
      else next.setDate(next.getDate() + amount)

      setMiniMonth(new Date(next.getFullYear(), next.getMonth(), 1))

      return next
    })
  }

  function openNewEvent(dateKey = localDateKey(anchor)) {
    setModal({
      open: true,
      item: null,
      form: formForItem(null, preferences.calendarTimezone, dateKey),
    })
  }

  function openItem(item: CalendarItem) {
    setModal({
      open: true,
      item,
      form: formForItem(
        item,
        preferences.calendarTimezone,
        eventDateKey(item, preferences.calendarTimezone),
      ),
    })
  }

  function updateSourceEvent(item: CalendarItem, form: EventForm) {
    if (item.source === "assignment") {
      update({
        assignments: state.assignments.map((assignment) =>
          assignment.id === item.sourceId
            ? {
                ...assignment,

                title: form.title,

                dueDate: form.startDate,

                completed: form.completed,

                priority: form.priority,

                notes: form.description,

                reminderMinutes:
                  form.reminderMinutes === ""
                    ? undefined
                    : Number(form.reminderMinutes),
              }
            : assignment,
        ),
      })
    } else if (item.source === "exam") {
      update({
        exams: state.exams.map((exam) =>
          exam.id === item.sourceId
            ? {
                ...exam,
                type: form.type,
                date: form.startDate,
                startTime: form.startTime,
                room: form.room,
              }
            : exam,
        ),
      })
    } else if (item.source === "class") {
      update({
        timetable: state.timetable.map((entry) =>
          entry.id === item.sourceId
            ? {
                ...entry,

                day: getDayName(
                  dateAtNoon(form.startDate),
                ) as TimetableEntry["day"],

                startTime: form.startTime,

                endTime: form.endTime,

                type: form.type as TimetableEntry["type"],

                room: form.room,

                group: form.group,

                note: form.description,
              }
            : entry,
        ),
      })
    }
  }

  async function saveEvent(event: React.FormEvent) {
    event.preventDefault()

    if (!modal.open || !modal.form.title.trim()) return

    const { item, form } = modal

    if (item && ["class", "assignment", "exam"].includes(item.source)) {
      updateSourceEvent(item, form)

      setModal({ open: false })

      setToast("Source event updated.")

      return
    }

    const startsAt = zonedDateTime(
      form.startDate,
      form.startTime || "09:00",
      preferences.calendarTimezone,
    )

    const endsAt = zonedDateTime(
      form.endDate,
      form.endTime || "10:00",
      preferences.calendarTimezone,
    )

    const payload = {
      title: form.title.trim(),

      description: form.description || null,

      startsAt: startsAt.toISOString(),

      endsAt: form.allDay ? null : endsAt.toISOString(),

      allDay: form.allDay,

      startDate: form.allDay ? form.startDate : null,

      endDate: form.allDay ? form.endDate : null,

      category: form.category,

      location: form.location || null,

      color: form.color,

      reminderMinutes:
        form.reminderMinutes === "" ? null : Number(form.reminderMinutes),

      recurrenceRule:
        item?.recurrenceDate && !modal.editSeries ? "none" : form.recurrence,

      recurrenceDays:
        item?.recurrenceDate && !modal.editSeries ? [] : form.recurrenceDays,

      recurrenceUntil:
        item?.recurrenceDate && !modal.editSeries
          ? null
          : form.recurrenceUntil || null,

      timeZone: preferences.calendarTimezone,
    }

    try {
      if (item && !modal.duplicate) {
        const occurrenceQuery =
          item.recurrenceDate && !modal.editSeries
            ? `?occurrenceDate=${encodeURIComponent(item.recurrenceDate)}`
            : ""

        await apiRequest(`/api/calendar/events/${item.id}${occurrenceQuery}`, {
          method: "PATCH",

          body: JSON.stringify(payload),
        })

        setToast("Event updated.")
      } else {
        await apiRequest("/api/calendar/events", {
          method: "POST",

          body: JSON.stringify(payload),
        })

        setToast(modal.duplicate ? "Event duplicated." : "Event created.")
      }

      setModal({ open: false })

      setRefreshKey((key) => key + 1)
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not save event.")
    }
  }

  async function deleteItem(item: CalendarItem, occurrenceOnly = false) {
    if (
      !window.confirm(
        occurrenceOnly
          ? `Delete this occurrence of “${item.title}”?`
          : `Delete “${item.title}”${
              item.recurrence && item.recurrence !== "none"
                ? " and the whole series"
                : ""
            }?`,
      )
    )
      return

    try {
      if (item.source === "personal" || item.source === "study") {
        const params =
          occurrenceOnly && item.recurrenceDate
            ? `?occurrenceDate=${encodeURIComponent(item.recurrenceDate)}`
            : ""

        await apiRequest(`/api/calendar/events/${item.id}${params}`, {
          method: "DELETE",
        })

        setRefreshKey((key) => key + 1)
      } else if (item.source === "assignment") {
        update({
          assignments: state.assignments.filter(
            (assignment) => assignment.id !== item.sourceId,
          ),
        })
      } else if (item.source === "exam") {
        update({
          exams: state.exams.filter((exam) => exam.id !== item.sourceId),
        })
      } else if (item.source === "class") {
        update({
          timetable: state.timetable.filter(
            (entry) => entry.id !== item.sourceId,
          ),
        })
      }

      setModal({ open: false })

      setToast("Event deleted.")
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "Could not delete event.",
      )
    }
  }

  function markAssignmentComplete(item: CalendarItem) {
    update({
      assignments: state.assignments.map((assignment) =>
        assignment.id === item.sourceId
          ? { ...assignment, completed: !assignment.completed }
          : assignment,
      ),
    })

    setModal({ open: false })
  }

  function moveItem(item: CalendarItem, targetDate: string) {
    if (item.source === "personal" || item.source === "study") {
      const current = new Date(item.startsAt)

      const newStart = zonedDateTime(
        targetDate,
        timeInZone(current, preferences.calendarTimezone),
        preferences.calendarTimezone,
      )

      const duration = item.endsAt
        ? Date.parse(item.endsAt) - current.getTime()
        : 0

      const form = formForItem(item, preferences.calendarTimezone, targetDate)

      form.startDate = targetDate

      form.endDate = targetDate

      const payload = {
        title: item.title,

        description: item.description || null,

        startsAt: newStart.toISOString(),

        endsAt:
          item.allDay || !item.endsAt
            ? null
            : new Date(newStart.getTime() + duration).toISOString(),

        allDay: item.allDay,

        startDate: item.allDay ? targetDate : null,

        endDate: item.allDay ? targetDate : null,

        category: item.category,

        location: item.location || null,

        color: item.color,

        reminderMinutes: item.reminderMinutes ?? null,

        recurrenceRule: "none",

        recurrenceDays: [],

        recurrenceUntil: null,

        timeZone: preferences.calendarTimezone,
      }

      const occurrenceQuery = item.recurrenceDate
        ? `?occurrenceDate=${encodeURIComponent(item.recurrenceDate)}`
        : ""

      void apiRequest(`/api/calendar/events/${item.id}${occurrenceQuery}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      })

        .then(() => setRefreshKey((key) => key + 1))

        .catch((error: unknown) =>
          setToast(
            error instanceof Error
              ? error.message
              : "Could not reschedule event.",
          ),
        )

      return
    }

    const form = formForItem(item, preferences.calendarTimezone, targetDate)

    form.startDate = targetDate

    form.endDate = targetDate

    updateSourceEvent(item, form)
  }

  function renderEvent(item: CalendarItem, compact = false) {
    return (
      <CalendarEventButton
        key={item.key}
        item={item}
        timeZone={preferences.calendarTimezone}
        onClick={() => openItem(item)}
        onDragStart={(event) => {
          dragItemRef.current = item

          event.dataTransfer.effectAllowed = "move"
        }}
      />
    )
  }

  function renderMonthView() {
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12)

    const gridStart = addLocalDays(monthStart, -((monthStart.getDay() + 6) % 7))

    const days = Array.from({ length: 42 }, (_, index) =>
      addLocalDays(gridStart, index),
    )

    return (
      <div className="overflow-hidden border border-[#19222e]">
        <div className="grid grid-cols-7 border-b border-[#19222e] bg-[#0d1219]">
          {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => (
            <div
              key={day}
              className="py-2 text-center font-mono text-[9px] tracking-wider text-[#4e5e72]"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = localDateKey(day)

            const matches = dateEvents(key)

            const today =
              key === dateKeyInZone(now, preferences.calendarTimezone)

            return (
              <div
                key={key}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()

                  if (dragItemRef.current) moveItem(dragItemRef.current, key)

                  dragItemRef.current = null
                }}
                className={`min-h-24 border-b border-r border-[#19222e] p-1 sm:min-h-32 ${
                  day.getMonth() !== anchor.getMonth()
                    ? "bg-[#090d12] text-[#354153]"
                    : "bg-[#0b1016]"
                } ${today ? "ring-1 ring-inset ring-amber-400" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setAnchor(day)
                    setView("day")
                  }}
                  className={`mb-1 flex h-6 w-6 items-center justify-center font-mono text-[10px] ${
                    today
                      ? "bg-amber-400 font-bold text-[#090b0e]"
                      : "text-[#7f8da1] hover:text-white"
                  }`}
                >
                  {day.getDate()}
                </button>
                <div className="space-y-1">
                  {matches.slice(0, 3).map((item) => renderEvent(item, true))}
                  {matches.length > 3 && (
                    <button
                      onClick={() => {
                        setAnchor(day)
                        setView("day")
                      }}
                      className="font-mono text-[9px] text-amber-400 hover:text-amber-300"
                    >
                      +{matches.length - 3} MORE
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function renderTimeGrid() {
    const days =
      preferences.calendarView === "day"
        ? [startOfLocalDay(anchor)]
        : Array.from({ length: 7 }, (_, index) =>
            addLocalDays(range.start, index),
          )

    const todayKey = dateKeyInZone(now, preferences.calendarTimezone)

    const currentTime = timeInZone(now, preferences.calendarTimezone)

    const nowMinutes =
      Number(currentTime.slice(0, 2)) * 60 + Number(currentTime.slice(3))

    return (
      <div className="overflow-auto border border-[#19222e]">
        <div className="min-w-[700px]">
          <div
            className="sticky top-0 z-10 grid border-b border-[#19222e] bg-[#0d1219]"
            style={{
              gridTemplateColumns: `56px repeat(${days.length}, minmax(100px, 1fr))`,
            }}
          >
            <div />
            {days.map((day) => {
              const key = localDateKey(day)

              return (
                <button
                  key={key}
                  onClick={() => {
                    setAnchor(day)
                    setView("day")
                  }}
                  className={`border-l border-[#19222e] py-2 text-center ${
                    key === todayKey ? "text-amber-400" : "text-[#7f8da1]"
                  }`}
                >
                  <span className="block font-mono text-[9px]">
                    {WEEKDAYS[day.getDay()].toUpperCase()}
                  </span>
                  <span
                    className={`mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs ${
                      key === todayKey
                        ? "bg-amber-400 font-bold text-[#090b0e]"
                        : ""
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </button>
              )
            })}
          </div>
          <div
            className="grid"
            style={{
              gridTemplateColumns: `56px repeat(${days.length}, minmax(100px, 1fr))`,
            }}
          >
            <div className="relative">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="h-14 border-b border-[#19222e] pr-2 text-right font-mono text-[9px] text-[#4e5e72]"
                >
                  {formatTime12(`${String(hour).padStart(2, "0")}:00`)}
                </div>
              ))}
            </div>
            {days.map((day) => {
              const key = localDateKey(day)

              const dayItems = dateEvents(key)

              const timed = dayItems.filter((item) => !item.allDay)

              return (
                <div
                  key={key}
                  className="relative border-l border-[#19222e]"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()

                    if (dragItemRef.current) moveItem(dragItemRef.current, key)

                    dragItemRef.current = null
                  }}
                >
                  <div className="absolute inset-x-0 top-0 z-[1] flex gap-1 overflow-hidden border-b border-[#19222e] bg-[#0b1016] p-1">
                    {dayItems
                      .filter((item) => item.allDay)
                      .map((item) => renderEvent(item))}
                  </div>
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="h-14 border-b border-[#19222e]"
                    />
                  ))}
                  {timed.map((item) => {
                    const start = new Date(item.startsAt)

                    const startMinutes =
                      Number(
                        timeInZone(start, preferences.calendarTimezone).slice(
                          0,
                          2,
                        ),
                      ) *
                        60 +
                      Number(
                        timeInZone(start, preferences.calendarTimezone).slice(
                          3,
                        ),
                      )

                    const end = item.endsAt
                      ? new Date(item.endsAt)
                      : new Date(start.getTime() + 45 * 60_000)

                    const endMinutes =
                      Number(
                        timeInZone(end, preferences.calendarTimezone).slice(
                          0,
                          2,
                        ),
                      ) *
                        60 +
                      Number(
                        timeInZone(end, preferences.calendarTimezone).slice(3),
                      )

                    const top = Math.max(0, (startMinutes - 7 * 60) * 0.93)

                    const height = Math.max(
                      24,
                      Math.min(300, (endMinutes - startMinutes) * 0.93),
                    )

                    return (
                      <div
                        key={item.key}
                        className="absolute z-[2] left-1 right-1"
                        style={{ top, height }}
                      >
                        {renderEvent(item)}
                      </div>
                    )
                  })}
                  {key === todayKey &&
                    nowMinutes >= 7 * 60 &&
                    nowMinutes < 23 * 60 && (
                      <div
                        className="pointer-events-none absolute left-0 right-0 z-[3] border-t border-red-400"
                        style={{ top: (nowMinutes - 7 * 60) * 0.93 }}
                      >
                        <span className="-ml-1 -mt-1 block h-2 w-2 rounded-full bg-red-400" />
                      </div>
                    )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  function renderAgendaView() {
    const days: string[] = []

    let cursor = new Date(range.start)

    while (cursor < range.end) {
      days.push(localDateKey(cursor))

      cursor = addLocalDays(cursor, 1)
    }

    const todayKey = dateKeyInZone(now, preferences.calendarTimezone)

    return (
      <div className="space-y-3">
        {days.map((key) => {
          const matches = dateEvents(key)

          return (
            <section
              key={key}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()

                if (dragItemRef.current) moveItem(dragItemRef.current, key)

                dragItemRef.current = null
              }}
              className={`border border-[#19222e] bg-[#0d1219] ${
                key === todayKey ? "border-l-2 border-l-amber-400" : ""
              }`}
            >
              <div className="flex items-center justify-between border-b border-[#19222e] px-3 py-2">
                <span
                  className={`font-mono text-xs ${
                    key === todayKey ? "text-amber-400" : "text-[#cdd5df]"
                  }`}
                >
                  {dateLabel(key)}
                </span>
                <button
                  onClick={() => openNewEvent(key)}
                  className="font-mono text-[10px] text-[#4e5e72] hover:text-amber-400"
                >
                  + ADD
                </button>
              </div>
              {matches.length ? (
                <div className="divide-y divide-[#19222e]">
                  {matches.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center gap-3 p-2.5"
                    >
                      <span className="w-16 shrink-0 font-mono text-[9px] text-[#718096]">
                        {localItemTime(item, preferences.calendarTimezone)}
                      </span>
                      <div className="min-w-0 flex-1">{renderEvent(item)}</div>
                      {item.location && (
                        <span className="hidden max-w-32 truncate font-mono text-[9px] text-[#718096] sm:block">
                          {item.location}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => openNewEvent(key)}
                  className="w-full px-3 py-4 text-left font-mono text-[10px] text-[#4e5e72] hover:text-amber-400"
                >
                  No events · add one
                </button>
              )}
            </section>
          )
        })}
      </div>
    )
  }

  function renderMiniCalendar() {
    const first = new Date(miniMonth.getFullYear(), miniMonth.getMonth(), 1, 12)

    const start = addLocalDays(first, -((first.getDay() + 6) % 7))

    return (
      <div className="border border-[#19222e] bg-[#0d1219] p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-wider text-[#cdd5df]">
            {miniMonth
              .toLocaleDateString(undefined, { month: "long", year: "numeric" })
              .toUpperCase()}
          </span>
          <div className="flex gap-2">
            <button
              aria-label="Previous mini calendar month"
              onClick={() =>
                setMiniMonth(
                  new Date(
                    miniMonth.getFullYear(),
                    miniMonth.getMonth() - 1,
                    1,
                  ),
                )
              }
              className="px-1 text-[#7f8da1] hover:text-white"
            >
              ‹
            </button>
            <button
              aria-label="Next mini calendar month"
              onClick={() =>
                setMiniMonth(
                  new Date(
                    miniMonth.getFullYear(),
                    miniMonth.getMonth() + 1,
                    1,
                  ),
                )
              }
              className="px-1 text-[#7f8da1] hover:text-white"
            >
              ›
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 text-center">
          {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
            <span
              key={`${day}-${index}`}
              className="py-1 font-mono text-[8px] text-[#4e5e72]"
            >
              {day}
            </span>
          ))}
          {Array.from({ length: 42 }, (_, index) => {
            const day = addLocalDays(start, index)

            const key = localDateKey(day)

            const active = key === localDateKey(anchor)

            const hasEvents = items.some(
              (item) =>
                eventDateKey(item, preferences.calendarTimezone) === key,
            )

            return (
              <button
                key={key}
                onClick={() => {
                  setAnchor(day)
                  setMiniMonth(new Date(day.getFullYear(), day.getMonth(), 1))
                }}
                className={`relative mx-auto flex h-7 w-7 items-center justify-center rounded-full font-mono text-[9px] ${
                  day.getMonth() !== miniMonth.getMonth()
                    ? "text-[#3e4a5b]"
                    : "text-[#9ca9ba]"
                } ${
                  active
                    ? "bg-amber-400 font-bold text-[#090b0e]"
                    : "hover:bg-[#19222e]"
                }`}
              >
                {day.getDate()}
                {hasEvents && !active && (
                  <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-amber-400" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const heading =
    preferences.calendarView === "month"
      ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : preferences.calendarView === "day"
        ? dateLabel(localDateKey(anchor), {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })
        : preferences.calendarView === "week"
          ? `${dateLabel(localDateKey(range.start), { month: "short", day: "numeric" })} – ${dateLabel(localDateKey(addLocalDays(range.end, -1)), { month: "short", day: "numeric", year: "numeric" })}`
          : `UPCOMING · ${anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`

  const nextItems = filteredItems
    .filter((item) => {
      const itemDate =
        item.allDay && item.startDate
          ? dateAtNoon(item.startDate)
          : new Date(item.startsAt)

      return (
        itemDate.getTime() >= now.getTime() ||
        (item.allDay &&
          item.startDate === dateKeyInZone(now, preferences.calendarTimezone))
      )
    })
    .slice(0, 5)

  useEffect(() => {
    for (const item of items) {
      if (
        item.reminderMinutes == null ||
        (item.allDay && item.source !== "assignment")
      )
        continue

      const eventTime =
        item.source === "assignment" && item.startDate
          ? zonedDateTime(
              item.startDate,
              "09:00",
              preferences.calendarTimezone,
            ).getTime()
          : Date.parse(item.startsAt)

      const reminderAt = eventTime - item.reminderMinutes * 60_000

      const key = `${item.key}:${item.reminderMinutes}`

      if (
        !remindedRef.current.has(key) &&
        now.getTime() >= reminderAt &&
        now.getTime() < reminderAt + 30_000
      ) {
        remindedRef.current.add(key)

        setReminderToast(
          `${item.title}${
            item.reminderMinutes
              ? ` in ${item.reminderMinutes} minutes`
              : " is starting now"
          }`,
        )
      }
    }
  }, [items, now, preferences.calendarTimezone])

  useEffect(() => {
    if (!toast) return

    const timer = window.setTimeout(() => setToast(""), 5000)

    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!reminderToast) return

    const timer = window.setTimeout(() => setReminderToast(""), 10_000)

    return () => window.clearTimeout(timer)
  }, [reminderToast])

  return (
    <div className="space-y-4 p-3 sm:p-5 lg:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center">
          <button
            aria-label="Previous calendar period"
            onClick={() => navigatePeriod(-1)}
            className="h-9 w-9 border border-[#19222e] text-lg text-[#9ca9ba] hover:border-amber-400 hover:text-amber-400"
          >
            ‹
          </button>
          <button
            aria-label="Next calendar period"
            onClick={() => navigatePeriod(1)}
            className="h-9 w-9 border-y border-r border-[#19222e] text-lg text-[#9ca9ba] hover:border-amber-400 hover:text-amber-400"
          >
            ›
          </button>
        </div>
        <button
          onClick={() => {
            setAnchor(new Date())
            setMiniMonth(new Date())
          }}
          className="h-9 border border-[#19222e] px-3 font-mono text-[10px] text-[#cdd5df] hover:border-amber-400"
        >
          TODAY
        </button>
        <h2 className="min-w-0 flex-1 truncate font-mono text-sm tracking-wider text-[#e2e8f0] sm:text-base">
          {heading.toUpperCase()}
        </h2>
        <input
          aria-label="Jump to date"
          type="date"
          value={localDateKey(anchor)}
          onChange={(event) => {
            if (!event.target.value) return

            const next = dateAtNoon(event.target.value)

            setAnchor(next)

            setMiniMonth(new Date(next.getFullYear(), next.getMonth(), 1))
          }}
          className="h-9 min-w-0 border border-[#19222e] px-2 font-mono text-[10px]"
        />
        <button
          onClick={() => openNewEvent()}
          className="h-9 bg-amber-400 px-3 font-mono text-[10px] font-semibold text-[#090b0e] hover:bg-amber-300"
        >
          + EVENT
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#19222e] pb-3">
        <div className="flex flex-wrap">
          {(["month", "week", "day", "agenda"] as CalendarView[]).map(
            (view) => (
              <button
                key={view}
                onClick={() => setView(view)}
                className={`border px-3 py-2 font-mono text-[9px] uppercase tracking-wider ${
                  preferences.calendarView === view
                    ? "border-amber-400 bg-amber-400 text-[#090b0e]"
                    : "border-[#19222e] text-[#8190a3] hover:text-white"
                }`}
              >
                {view}
              </button>
            ),
          )}
        </div>
        <label className="flex items-center gap-2 font-mono text-[9px] text-[#718096]">
          TIMEZONE
          <input
            aria-label="Calendar timezone"
            value={timezoneDraft}
            onChange={(event) => setTimezoneDraft(event.target.value)}
            onBlur={() => {
              try {
                new Intl.DateTimeFormat(undefined, { timeZone: timezoneDraft })

                setPreferences((current) => ({
                  ...current,
                  calendarTimezone: timezoneDraft,
                }))
              } catch {
                setTimezoneDraft(preferences.calendarTimezone)

                setToast("Enter a valid IANA timezone, such as Asia/Kolkata.")
              }
            }}
            className="w-36 border border-[#19222e] px-2 py-1.5 text-[10px] text-[#cdd5df]"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="order-2 space-y-4 xl:order-1">
          {renderMiniCalendar()}
          <div className="border border-[#19222e] bg-[#0d1219] p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-mono text-[10px] tracking-wider text-[#cdd5df]">
                CALENDAR SOURCES
              </h3>
              <button
                onClick={() =>
                  setPreferences((current) => ({
                    ...current,
                    calendarVisibleSources:
                      current.calendarVisibleSources.length === SOURCES.length
                        ? []
                        : SOURCES.map(({ id }) => id),
                  }))
                }
                className="font-mono text-[8px] text-amber-400"
              >
                TOGGLE ALL
              </button>
            </div>
            <div className="space-y-2">
              {SOURCES.map((source) => (
                <label
                  key={source.id}
                  className="flex cursor-pointer items-center gap-2 font-mono text-[10px] text-[#aeb9c8]"
                >
                  <input
                    type="checkbox"
                    checked={preferences.calendarVisibleSources.includes(
                      source.id,
                    )}
                    onChange={(event) =>
                      setPreferences((current) => ({
                        ...current,
                        calendarVisibleSources: event.target.checked
                          ? [...current.calendarVisibleSources, source.id]
                          : current.calendarVisibleSources.filter(
                              (value) => value !== source.id,
                            ),
                      }))
                    }
                  />
                  <span className={`h-2 w-2 ${source.color}`} />
                  {source.label}
                </label>
              ))}
            </div>
            <div className="my-3 border-t border-[#19222e]" />
            <h3 className="mb-2 font-mono text-[10px] tracking-wider text-[#cdd5df]">
              CATEGORIES
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((category) => (
                <label
                  key={category}
                  className="flex cursor-pointer items-center gap-1.5 font-mono text-[9px] capitalize text-[#aeb9c8]"
                >
                  <input
                    type="checkbox"
                    checked={preferences.calendarVisibleCategories.includes(
                      category,
                    )}
                    onChange={(event) =>
                      setPreferences((current) => ({
                        ...current,
                        calendarVisibleCategories: event.target.checked
                          ? [...current.calendarVisibleCategories, category]
                          : current.calendarVisibleCategories.filter(
                              (value) => value !== category,
                            ),
                      }))
                    }
                  />
                  {category}
                </label>
              ))}
            </div>
          </div>
          <div className="border border-[#19222e] bg-[#0d1219]">
            <div className="border-b border-[#19222e] px-3 py-2 font-mono text-[10px] tracking-wider text-[#cdd5df]">
              UP NEXT
            </div>
            {nextItems.length ? (
              nextItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => openItem(item)}
                  className="block w-full border-b border-[#19222e] p-2.5 text-left last:border-0 hover:bg-[#111720]"
                >
                  <span className="block font-mono text-[9px] text-[#718096]">
                    {dateLabel(
                      eventDateKey(item, preferences.calendarTimezone),
                      { weekday: "short", month: "short", day: "numeric" },
                    )}{" "}
                    · {localItemTime(item, preferences.calendarTimezone)}
                  </span>
                  <span className="mt-1 block truncate text-xs text-[#d3dce8]">
                    {item.title}
                  </span>
                </button>
              ))
            ) : (
              <p className="p-3 font-mono text-[9px] text-[#718096]">
                NOTHING UPCOMING
              </p>
            )}
          </div>
          <button
            onClick={() => openNewEvent()}
            className="w-full border border-amber-400 py-2 font-mono text-[10px] text-amber-400 hover:bg-amber-400 hover:text-[#090b0e]"
          >
            + QUICK CREATE
          </button>
        </aside>

        <section className="order-1 min-w-0 xl:order-2">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, course, category, location..."
              className="min-w-[190px] flex-1 border border-[#19222e] px-3 py-2 text-xs"
            />
            <span className="font-mono text-[9px] text-[#718096]">
              {filteredItems.length} EVENTS
            </span>
          </div>
          {eventsError && (
            <p
              role="alert"
              className="mb-3 border border-red-500/40 bg-red-500/10 p-3 font-mono text-[10px] text-red-300"
            >
              {eventsError}
            </p>
          )}
          {loading && (
            <p className="mb-2 font-mono text-[9px] text-[#718096]">
              SYNCING CALENDAR…
            </p>
          )}
          {preferences.calendarView === "month" && renderMonthView()}
          {(preferences.calendarView === "week" ||
            preferences.calendarView === "day") &&
            renderTimeGrid()}
          {preferences.calendarView === "agenda" && renderAgendaView()}
          <p className="mt-2 font-mono text-[8px] text-[#617086]">
            CLASS, ASSIGNMENT AND EXAM CHANGES SYNC WITH THEIR ORIGINAL
            STUDENTOS RECORDS. DRAG EVENTS TO ANOTHER DAY TO RESCHEDULE.
          </p>
        </section>
      </div>

      {(toast || reminderToast) && (
        <div
          role={reminderToast ? "alert" : "status"}
          className="fixed bottom-4 right-4 z-40 max-w-sm border border-amber-400 bg-[#111720] p-3 font-mono text-xs text-amber-200 shadow-xl"
        >
          {reminderToast ? `REMINDER · ${reminderToast}` : toast}
          <button
            onClick={() => {
              setToast("")
              setReminderToast("")
            }}
            className="ml-3 text-[#9ca9ba]"
          >
            ×
          </button>
        </div>
      )}

      {modal.open && (
        <EventModal
          modal={modal}
          onClose={() => setModal({ open: false })}
          onChange={(form) =>
            setModal((current) =>
              current.open ? { ...current, form } : current,
            )
          }
          onSave={saveEvent}
          onDelete={deleteItem}
          onDuplicate={(item) =>
            setModal({
              open: true,
              item,
              form: formForItem(
                item,
                preferences.calendarTimezone,
                eventDateKey(item, preferences.calendarTimezone),
              ),
              duplicate: true,
            })
          }
          onEditSeries={(editSeries) => {
            setModal((current) => {
              if (!current.open || !current.item) return current

              const { item } = current

              const seriesItem = editSeries
                ? {
                    ...item,

                    startsAt: item.seriesStartsAt || item.startsAt,

                    endsAt: item.seriesEndsAt ?? item.endsAt,

                    startDate: item.seriesStartDate ?? item.startDate,

                    endDate: item.seriesEndDate ?? item.endDate,
                  }
                : item

              const date = eventDateKey(
                seriesItem,
                preferences.calendarTimezone,
              )

              return {
                ...current,

                editSeries,

                form: formForItem(
                  seriesItem,
                  preferences.calendarTimezone,
                  date,
                ),
              }
            })
          }}
          onComplete={markAssignmentComplete}
          onNavigate={onNavigate}
        />
      )}
    </div>
  )
}

function EventModal({
  modal,

  onClose,

  onChange,

  onSave,

  onDelete,

  onDuplicate,

  onEditSeries,

  onComplete,

  onNavigate,
}: {
  modal: Extract<ModalState, { open: true }>

  onClose: () => void

  onChange: (form: EventForm) => void

  onSave: (event: React.FormEvent) => void

  onDelete: (item: CalendarItem, occurrenceOnly?: boolean) => void

  onDuplicate: (item: CalendarItem) => void

  onEditSeries: (editSeries: boolean) => void

  onComplete: (item: CalendarItem) => void

  onNavigate: (page: string) => void
}) {
  const { item, form } = modal

  const sourceEdit =
    item && ["class", "assignment", "exam"].includes(item.source)

  const recurrence = item?.recurrence && item.recurrence !== "none"

  const set = (patch: Partial<EventForm>) => onChange({ ...form, ...patch })

  const title = sourceEdit
    ? "EDIT SOURCE EVENT"
    : item && !modal.duplicate
      ? "EDIT EVENT"
      : modal.duplicate
        ? "DUPLICATE EVENT"
        : "NEW EVENT"

  const submit = (event: React.FormEvent) => onSave(event)

  const sourceLabel =
    item?.source === "class"
      ? "RECURRING TIMETABLE CLASS"
      : item?.source === "assignment"
        ? "ASSIGNMENT DEADLINE"
        : item?.source === "exam"
          ? "EXAMINATION"
          : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form
        onSubmit={submit}
        className="max-h-[92dvh] w-full max-w-xl overflow-y-auto border border-[#29374a] bg-[#0d1219] shadow-2xl sm:max-h-[90vh]"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#19222e] bg-[#0d1219] px-4 py-3">
          <div>
            <h2 className="font-mono text-xs tracking-widest text-[#cdd5df]">
              {title}
            </h2>
            {sourceLabel && (
              <p className="mt-1 font-mono text-[8px] text-amber-400">
                {sourceLabel} · SAVES TO ORIGINAL RECORD
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close event editor"
            className="px-2 text-lg text-[#718096] hover:text-white"
          >
            ×
          </button>
        </div>
        {item && (
          <div className="flex flex-wrap gap-2 border-b border-[#19222e] px-4 py-2">
            <button
              type="button"
              onClick={() => onDuplicate(item)}
              className="border border-[#29374a] px-2 py-1 font-mono text-[9px] text-[#b8c2d0] hover:border-amber-400"
            >
              DUPLICATE
            </button>
            {item.source === "assignment" && (
              <button
                type="button"
                onClick={() => onComplete(item)}
                className="border border-green-500/50 px-2 py-1 font-mono text-[9px] text-green-300"
              >
                {item.completed ? "MARK INCOMPLETE" : "MARK COMPLETE"}
              </button>
            )}
            {item.source === "study" && (
              <button
                type="button"
                onClick={() => onNavigate("study-timer")}
                className="border border-green-500/50 px-2 py-1 font-mono text-[9px] text-green-300"
              >
                OPEN STUDY TIMER
              </button>
            )}
          </div>
        )}
        <div className="space-y-3 p-4">
          <label className="block">
            <span className="mb-1 block font-mono text-[9px] text-[#8190a3]">
              TITLE
            </span>
            <input
              required
              maxLength={200}
              value={form.title}
              disabled={item?.source === "class" || item?.source === "exam"}
              onChange={(event) => set({ title: event.target.value })}
              className="w-full px-3 py-2 text-sm disabled:opacity-70"
            />
          </label>
          <div
            className={`grid ${
              item?.source === "assignment" ? "grid-cols-1" : "grid-cols-2"
            } gap-3`}
          >
            <label>
              <span className="mb-1 block font-mono text-[9px] text-[#8190a3]">
                START DATE
              </span>
              <input
                required
                type="date"
                value={form.startDate}
                onChange={(event) => set({ startDate: event.target.value })}
                className="w-full px-2 py-2 font-mono text-xs"
              />
            </label>
            {item?.source === "assignment" ? null : form.allDay ? (
              <label>
                <span className="mb-1 block font-mono text-[9px] text-[#8190a3]">
                  END DATE
                </span>
                <input
                  required
                  type="date"
                  min={form.startDate}
                  value={form.endDate}
                  onChange={(event) => set({ endDate: event.target.value })}
                  className="w-full px-2 py-2 font-mono text-xs"
                />
              </label>
            ) : (
              <label>
                <span className="mb-1 block font-mono text-[9px] text-[#8190a3]">
                  START TIME
                </span>
                <input
                  required
                  type="time"
                  value={form.startTime}
                  onChange={(event) => set({ startTime: event.target.value })}
                  className="w-full px-2 py-2 font-mono text-xs"
                />
              </label>
            )}
          </div>
          {!form.allDay && (
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="mb-1 block font-mono text-[9px] text-[#8190a3]">
                  END DATE
                </span>
                <input
                  required
                  type="date"
                  min={form.startDate}
                  value={form.endDate}
                  onChange={(event) => set({ endDate: event.target.value })}
                  className="w-full px-2 py-2 font-mono text-xs"
                />
              </label>
              <label>
                <span className="mb-1 block font-mono text-[9px] text-[#8190a3]">
                  END TIME
                </span>
                <input
                  required
                  type="time"
                  value={form.endTime}
                  onChange={(event) => set({ endTime: event.target.value })}
                  className="w-full px-2 py-2 font-mono text-xs"
                />
              </label>
            </div>
          )}
          {!sourceEdit && (
            <label className="flex min-h-10 items-center gap-2 font-mono text-[10px] text-[#cdd5df]">
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={(event) => set({ allDay: event.target.checked })}
              />
              ALL DAY EVENT
            </label>
          )}

          {item?.source === "assignment" && (
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="mb-1 block font-mono text-[9px] text-[#8190a3]">
                  PRIORITY
                </span>
                <select
                  value={form.priority}
                  onChange={(event) =>
                    set({
                      priority: event.target.value as Assignment["priority"],
                    })
                  }
                  className="w-full px-2 py-2 text-xs"
                >
                  {(["high", "medium", "low"] as const).map((priority) => (
                    <option key={priority} value={priority}>
                      {priority.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <p className="self-end pb-2 font-mono text-[9px] text-[#8190a3]">
                {item.courseCode} · due date changes update assignment
              </p>
              <label className="col-span-2">
                <span className="mb-1 block font-mono text-[9px] text-[#8190a3]">
                  DEADLINE REMINDER
                </span>
                <select
                  value={form.reminderMinutes}
                  onChange={(event) =>
                    set({ reminderMinutes: event.target.value })
                  }
                  className="w-full px-2 py-2 text-xs"
                >
                  {REMINDERS.map((reminder) => (
                    <option key={reminder.value} value={reminder.value}>
                      {reminder.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block font-mono text-[8px] text-[#718096]">
                  Reminder time is 9:00 AM on the due date.
                </span>
              </label>
            </div>
          )}

          {item?.source === "exam" && (
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="mb-1 block font-mono text-[9px] text-[#8190a3]">
                  EXAM TYPE
                </span>
                <input
                  value={form.type}
                  onChange={(event) => set({ type: event.target.value })}
                  className="w-full px-2 py-2 text-xs"
                />
              </label>
              <label>
                <span className="mb-1 block font-mono text-[9px] text-[#8190a3]">
                  ROOM
                </span>
                <input
                  value={form.room}
                  onChange={(event) => set({ room: event.target.value })}
                  className="w-full px-2 py-2 text-xs"
                />
              </label>
            </div>
          )}

          {item?.source === "class" && (
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="mb-1 block font-mono text-[9px] text-[#8190a3]">
                  CLASS TYPE
                </span>
                <select
                  value={form.type}
                  onChange={(event) => set({ type: event.target.value })}
                  className="w-full px-2 py-2 text-xs"
                >
                  {["Lecture", "Tutorial", "Practical"].map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block font-mono text-[9px] text-[#8190a3]">
                  ROOM
                </span>
                <input
                  value={form.room}
                  onChange={(event) => set({ room: event.target.value })}
                  className="w-full px-2 py-2 text-xs"
                />
              </label>
            </div>
          )}

          {!sourceEdit && (
            <>
              {recurrence && item?.recurrenceDate && (
                <label className="flex items-center gap-2 border border-[#19222e] p-2 font-mono text-[9px] text-[#cdd5df]">
                  <input
                    type="checkbox"
                    checked={Boolean(modal.editSeries)}
                    onChange={(event) => onEditSeries(event.target.checked)}
                  />
                  EDIT ENTIRE SERIES INSTEAD
                </label>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="mb-1 block font-mono text-[9px] text-[#8190a3]">
                    CATEGORY
                  </span>
                  <select
                    value={form.category}
                    onChange={(event) =>
                      set({ category: event.target.value as CalendarCategory })
                    }
                    className="w-full px-2 py-2 text-xs"
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block font-mono text-[9px] text-[#8190a3]">
                    LOCATION
                  </span>
                  <input
                    maxLength={300}
                    value={form.location}
                    onChange={(event) => set({ location: event.target.value })}
                    className="w-full px-2 py-2 text-xs"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="mb-1 block font-mono text-[9px] text-[#8190a3]">
                    REMINDER
                  </span>
                  <select
                    value={form.reminderMinutes}
                    onChange={(event) =>
                      set({ reminderMinutes: event.target.value })
                    }
                    className="w-full px-2 py-2 text-xs"
                  >
                    {REMINDERS.map((reminder) => (
                      <option key={reminder.value} value={reminder.value}>
                        {reminder.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block font-mono text-[9px] text-[#8190a3]">
                    COLOR
                  </span>
                  <input
                    type="color"
                    value={
                      form.color.startsWith("#")
                        ? form.color
                        : {
                            amber: "#e8a020",
                            green: "#1ea854",
                            blue: "#3b82f6",
                            purple: "#a78bfa",
                            red: "#ef4444",
                            pink: "#ec4899",
                          }[form.color] || "#e8a020"
                    }
                    onChange={(event) => set({ color: event.target.value })}
                    className="h-9 w-full px-1"
                  />
                </label>
              </div>
              {(!recurrence || !item?.recurrenceDate || modal.editSeries) && (
                <>
                  <label>
                    <span className="mb-1 block font-mono text-[9px] text-[#8190a3]">
                      REPEAT
                    </span>
                    <select
                      value={form.recurrence}
                      onChange={(event) =>
                        set({
                          recurrence: event.target.value as CalendarRecurrence,
                        })
                      }
                      className="w-full px-2 py-2 text-xs"
                    >
                      {[
                        ["none", "Does not repeat"],

                        ["daily", "Every day"],

                        ["weekdays", "Every weekday"],

                        ["weekly", "Every week"],

                        ["monthly", "Every month"],

                        ["custom-weekly", "Custom weekly"],
                      ].map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {form.recurrence === "custom-weekly" && (
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map((day, index) => (
                        <label
                          key={day}
                          className="flex items-center gap-1 font-mono text-[9px] text-[#b8c2d0]"
                        >
                          <input
                            type="checkbox"
                            checked={form.recurrenceDays.includes(index)}
                            onChange={(event) =>
                              set({
                                recurrenceDays: event.target.checked
                                  ? [...form.recurrenceDays, index].sort()
                                  : form.recurrenceDays.filter(
                                      (value) => value !== index,
                                    ),
                              })
                            }
                          />
                          {day}
                        </label>
                      ))}
                    </div>
                  )}
                  {form.recurrence !== "none" && (
                    <label>
                      <span className="mb-1 block font-mono text-[9px] text-[#8190a3]">
                        REPEAT UNTIL (OPTIONAL)
                      </span>
                      <input
                        type="date"
                        min={form.startDate}
                        value={form.recurrenceUntil}
                        onChange={(event) =>
                          set({ recurrenceUntil: event.target.value })
                        }
                        className="w-full px-2 py-2 font-mono text-xs"
                      />
                    </label>
                  )}
                </>
              )}
            </>
          )}

          <label className="block">
            <span className="mb-1 block font-mono text-[9px] text-[#8190a3]">
              DESCRIPTION / NOTES
            </span>
            <textarea
              maxLength={5000}
              rows={3}
              value={form.description}
              disabled={item?.source === "exam"}
              onChange={(event) => set({ description: event.target.value })}
              className="w-full resize-y px-3 py-2 text-sm disabled:opacity-70"
            />
          </label>
          {recurrence && (
            <p className="font-mono text-[9px] text-amber-300">
              {item?.recurrenceDate && !modal.editSeries
                ? "SAVING EDITS ONLY THIS OCCURRENCE; THE REST OF THE SERIES REMAINS UNCHANGED."
                : "EDITING THIS EVENT CHANGES THE ENTIRE SERIES. DELETE CAN REMOVE ONE OCCURRENCE OR THE WHOLE SERIES."}
            </p>
          )}
          {!sourceEdit && (
            <p className="font-mono text-[9px] text-[#718096]">
              REMINDERS ARE IN-APP WHILE STUDENTOS IS OPEN. ALL-DAY EVENTS DO
              NOT TRIGGER TIMED REMINDERS.
            </p>
          )}
        </div>
        <div className="sticky bottom-0 flex gap-2 border-t border-[#19222e] bg-[#0d1219] p-3">
          {item && (
            <button
              type="button"
              onClick={() => void onDelete(item)}
              className="border border-red-500/70 px-3 py-2 font-mono text-[9px] text-red-300 hover:bg-red-500/10"
            >
              DELETE{recurrence ? " SERIES" : ""}
            </button>
          )}
          {recurrence && (
            <button
              type="button"
              onClick={() => void onDelete(item!, true)}
              className="border border-red-500/70 px-3 py-2 font-mono text-[9px] text-red-300 hover:bg-red-500/10"
            >
              DELETE THIS OCCURRENCE
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-[#29374a] py-2 font-mono text-[9px] text-[#b8c2d0]"
          >
            CANCEL
          </button>
          <button
            type="submit"
            className="flex-1 bg-amber-400 py-2 font-mono text-[9px] font-bold text-[#090b0e] hover:bg-amber-300"
          >
            {item && !modal.duplicate ? "SAVE CHANGES" : "CREATE EVENT"}
          </button>
        </div>
      </form>
    </div>
  )
}
