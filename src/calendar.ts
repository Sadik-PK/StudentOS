export type CalendarView = "month" | "week" | "day" | "agenda"

export type CalendarSource = "class" | "assignment" | "exam" | "personal" | "study"

export type CalendarCategory = "personal" | "college" | "study" | "work" | "health" | "other"

export type CalendarRecurrence = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "custom-weekly"

export interface PersonalEvent {
  id: string

  title: string

  description: string | null

  startsAt: string

  endsAt: string | null

  allDay: boolean

  startDate: string | null

  endDate: string | null

  category: CalendarCategory

  location: string | null

  color: string

  reminderMinutes: number | null

  recurrenceRule: CalendarRecurrence

  recurrenceDays: number[]

  recurrenceUntil: string | null

  timeZone: string

  excludedOccurrences: string[]
}

export interface CalendarItem {
  key: string

  id: string

  source: CalendarSource

  title: string

  description?: string

  startsAt: string

  endsAt: string | null

  allDay: boolean

  startDate: string | null

  endDate: string | null

  category: CalendarCategory

  location?: string

  color: string

  reminderMinutes?: number | null

  recurrenceDate?: string

  sourceId?: string

  courseCode?: string

  completed?: boolean

  priority?: string

  type?: string

  room?: string

  recurrence?: CalendarRecurrence

  recurrenceDays?: number[]

  recurrenceUntil?: string | null

  timeZone?: string

  seriesStartsAt?: string

  seriesEndsAt?: string | null

  seriesStartDate?: string | null

  seriesEndDate?: string | null
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function dateAtNoon(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00`)
}

export function addLocalDays(date: Date, amount: number): Date {
  const result = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
  )

  result.setDate(result.getDate() + amount)

  return result
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function getCalendarRange(anchor: Date, view: CalendarView) {
  const start = startOfLocalDay(anchor)

  let end: Date

  if (view === "month") {
    start.setDate(1)

    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))

    end = addLocalDays(start, 42)
  } else if (view === "week") {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))

    end = addLocalDays(start, 7)
  } else if (view === "agenda") {
    end = addLocalDays(start, 31)
  } else {
    end = addLocalDays(start, 1)
  }

  return { start, end }
}

function zonedParts(date: Date, timeZone: string) {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone,

    year: "numeric",

    month: "2-digit",

    day: "2-digit",

    hour: "2-digit",

    minute: "2-digit",

    second: "2-digit",

    hourCycle: "h23",
  }).formatToParts(date)

  return Object.fromEntries(values.map(({ type, value }) => [type, value]))
}

export function dateKeyInZone(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone)

  return `${parts.year}-${parts.month}-${parts.day}`
}

export function timeInZone(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone)

  return `${parts.hour}:${parts.minute}`
}

export function zonedDateTime(
  dateKey: string,
  time: string,
  timeZone: string,
): Date {
  const [year, month, day] = dateKey.split("-").map(Number)

  const [hour, minute] = time.split(":").map(Number)

  const target = Date.UTC(year, month - 1, day, hour, minute)

  let result = target

  const visited = new Set<number>()

  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = zonedParts(new Date(result), timeZone)

    const represented = Date.UTC(
      Number(parts.year),

      Number(parts.month) - 1,

      Number(parts.day),

      Number(parts.hour),

      Number(parts.minute),

      Number(parts.second),
    )

    const difference = target - represented

    if (difference === 0) return new Date(result)

    const next = result + difference

    if (visited.has(next)) return new Date(Math.max(result, next))

    visited.add(result)

    result = next
  }

  return new Date(result)
}

export function expandPersonalEvents(
  events: PersonalEvent[],

  rangeStart: Date,

  rangeEnd: Date,

  displayTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
): CalendarItem[] {
  const items: CalendarItem[] = []

  for (const event of events) {
    const timeZone = event.timeZone || "UTC"

    const visibleStart = dateKeyInZone(
      rangeStart,
      event.allDay ? displayTimeZone : timeZone,
    )

    const visibleEnd = dateKeyInZone(
      new Date(rangeEnd.getTime() - 1),
      event.allDay ? displayTimeZone : timeZone,
    )

    const seriesDate =
      event.allDay && event.startDate
        ? event.startDate
        : dateKeyInZone(new Date(event.startsAt), timeZone)

    const addOccurrence = (dateKey: string) => {
      if (event.excludedOccurrences.includes(dateKey)) return

      let startsAt = event.startsAt

      let endsAt = event.endsAt

      let startDate = event.startDate

      let endDate = event.endDate

      if (event.recurrenceRule !== "none") {
        if (event.allDay) {
          const duration = Math.max(
            0,

            Math.round(
              (dateAtNoon(
                event.endDate || event.startDate || dateKey,
              ).getTime() -
                dateAtNoon(event.startDate || dateKey).getTime()) /
                86400000,
            ),
          )

          startDate = dateKey

          endDate = localDateKey(addLocalDays(dateAtNoon(dateKey), duration))

          startsAt = `${dateKey}T12:00:00.000Z`

          endsAt = null
        } else {
          const originalStart = new Date(event.startsAt)

          const originalEnd = event.endsAt ? new Date(event.endsAt) : null

          const localStart = zonedDateTime(
            dateKey,
            timeInZone(originalStart, timeZone),
            timeZone,
          )

          startsAt = localStart.toISOString()

          endsAt = originalEnd
            ? new Date(
                localStart.getTime() +
                  originalEnd.getTime() -
                  originalStart.getTime(),
              ).toISOString()
            : null
        }
      }

      const occurrenceStart =
        event.allDay && startDate ? dateAtNoon(startDate) : new Date(startsAt)

      const occurrenceEnd =
        event.allDay && endDate
          ? addLocalDays(dateAtNoon(endDate), 1)
          : endsAt
            ? new Date(endsAt)
            : occurrenceStart

      if (event.allDay) {
        if (
          (endDate || startDate || dateKey) < visibleStart ||
          (startDate || dateKey) > visibleEnd
        )
          return
      } else if (occurrenceEnd <= rangeStart || occurrenceStart >= rangeEnd)
        return

      items.push({
        key: `${event.id}:${dateKey}`,

        id: event.id,

        source: event.category === "study" ? "study" : "personal",

        title: event.title,

        description: event.description || undefined,

        startsAt,

        endsAt,

        allDay: event.allDay,

        startDate,

        endDate,

        category: event.category,

        location: event.location || undefined,

        color: event.color,

        reminderMinutes: event.reminderMinutes,

        recurrenceDate: event.recurrenceRule === "none" ? undefined : dateKey,

        recurrence: event.recurrenceRule,

        recurrenceDays: event.recurrenceDays,

        recurrenceUntil: event.recurrenceUntil,

        timeZone,

        seriesStartsAt: event.startsAt,

        seriesEndsAt: event.endsAt,

        seriesStartDate: event.startDate,

        seriesEndDate: event.endDate,
      })
    }

    if (event.recurrenceRule === "none") {
      addOccurrence(seriesDate)

      continue
    }

    let cursor = dateAtNoon(seriesDate)

    const firstVisible = dateAtNoon(visibleStart)

    if (cursor < firstVisible) cursor = firstVisible

    const lastVisible = dateAtNoon(visibleEnd)

    const originalStart = dateAtNoon(seriesDate)

    const originalWeekday = originalStart.getDay()

    while (cursor <= lastVisible) {
      const dateKey = localDateKey(cursor)

      const day = cursor.getDay()

      const elapsedDays = Math.round(
        (cursor.getTime() - originalStart.getTime()) / 86400000,
      )

      const matches =
        event.recurrenceRule === "daily" ||
        (event.recurrenceRule === "weekdays" && day >= 1 && day <= 5) ||
        (event.recurrenceRule === "weekly" &&
          day === originalWeekday &&
          elapsedDays >= 0) ||
        (event.recurrenceRule === "monthly" &&
          cursor.getDate() === originalStart.getDate()) ||
        (event.recurrenceRule === "custom-weekly" &&
          event.recurrenceDays.includes(day))

      if (
        matches &&
        dateKey >= seriesDate &&
        (!event.recurrenceUntil || dateKey <= event.recurrenceUntil)
      )
        addOccurrence(dateKey)

      cursor = addLocalDays(cursor, 1)
    }
  }

  return items.sort((a, b) => {
    const first =
      a.allDay && a.startDate
        ? dateAtNoon(a.startDate).getTime()
        : Date.parse(a.startsAt)

    const second =
      b.allDay && b.startDate
        ? dateAtNoon(b.startDate).getTime()
        : Date.parse(b.startsAt)

    return first - second || a.title.localeCompare(b.title)
  })
}
