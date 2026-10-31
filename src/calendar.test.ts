import { describe, expect, it } from "vitest"

import {
  dateKeyInZone,
  expandPersonalEvents,
  getCalendarRange,
  localDateKey,
  timeInZone,
  zonedDateTime,
  type PersonalEvent,
} from "./calendar"

const timeZone = "America/New_York"

function event(overrides: Partial<PersonalEvent> = {}): PersonalEvent {
  return {
    id: "event-1",

    title: "Study",

    description: null,

    startsAt: "2026-03-07T14:00:00.000Z",

    endsAt: "2026-03-07T15:00:00.000Z",

    allDay: false,

    startDate: null,

    endDate: null,

    category: "study",

    location: null,

    color: "green",

    reminderMinutes: null,

    recurrenceRule: "daily",

    recurrenceDays: [],

    recurrenceUntil: null,

    timeZone,

    excludedOccurrences: [],

    ...overrides,
  }
}

describe("calendar date and recurrence helpers", () => {
  it("calculates bounded ranges for each calendar view", () => {
    const anchor = new Date(2026, 10, 4, 12)

    const month = getCalendarRange(anchor, "month")
    const week = getCalendarRange(anchor, "week")
    const day = getCalendarRange(anchor, "day")
    const agenda = getCalendarRange(anchor, "agenda")

    expect(localDateKey(month.start)).toBe("2026-10-26")
    expect(localDateKey(month.end)).toBe("2026-12-07")
    expect(localDateKey(week.start)).toBe("2026-11-02")
    expect(localDateKey(week.end)).toBe("2026-11-09")
    expect(localDateKey(day.start)).toBe("2026-11-04")
    expect(localDateKey(day.end)).toBe("2026-11-05")
    expect(localDateKey(agenda.end)).toBe("2026-12-05")
  })

  it("keeps local event times stable through daylight-saving changes", () => {
    const before = zonedDateTime("2026-03-07", "09:00", timeZone)

    const after = zonedDateTime("2026-03-08", "09:00", timeZone)

    expect(timeInZone(before, timeZone)).toBe("09:00")

    expect(timeInZone(after, timeZone)).toBe("09:00")

    expect(after.getTime() - before.getTime()).toBe(23 * 60 * 60 * 1000)
  })

  it("moves a nonexistent daylight-saving time forward through the gap", () => {
    const shifted = zonedDateTime("2026-03-08", "02:30", timeZone)

    expect(dateKeyInZone(shifted, timeZone)).toBe("2026-03-08")

    expect(timeInZone(shifted, timeZone)).toBe("03:30")
  })

  it("expands recurring events only within the visible range and omits excluded dates", () => {
    const start = zonedDateTime("2026-03-07", "00:00", timeZone)

    const end = zonedDateTime("2026-03-10", "00:00", timeZone)

    const items = expandPersonalEvents(
      [event({ excludedOccurrences: ["2026-03-08"] })],

      start,

      end,

      timeZone,
    )

    expect(items.map((item) => item.recurrenceDate)).toEqual([
      "2026-03-07",

      "2026-03-09",
    ])

    expect(
      items.map((item) => timeInZone(new Date(item.startsAt), timeZone)),
    ).toEqual([
      "09:00",

      "09:00",
    ])
  })

  it("supports custom weekdays and the inclusive recurrence end date", () => {
    const start = zonedDateTime("2026-03-08", "00:00", timeZone)

    const end = zonedDateTime("2026-03-15", "00:00", timeZone)

    const items = expandPersonalEvents(
      [
        event({
          recurrenceRule: "custom-weekly",

          recurrenceDays: [1, 3],

          recurrenceUntil: "2026-03-11",
        }),
      ],

      start,

      end,

      timeZone,
    )

    expect(items.map((item) => item.recurrenceDate)).toEqual([
      "2026-03-09",

      "2026-03-11",
    ])
  })

  it("expands monthly recurrences on matching calendar days", () => {
    const start = zonedDateTime("2026-01-01", "00:00", timeZone)

    const end = zonedDateTime("2026-04-01", "00:00", timeZone)

    const items = expandPersonalEvents(
      [
        event({
          startsAt: "2026-01-31T14:00:00.000Z",

          endsAt: "2026-01-31T15:00:00.000Z",

          recurrenceRule: "monthly",
        }),
      ],

      start,

      end,

      timeZone,
    )

    expect(items.map((item) => item.recurrenceDate)).toEqual([
      "2026-01-31",

      "2026-03-31",
    ])
  })

  it("keeps all-day event dates fixed across time zones", () => {
    const start = zonedDateTime("2026-07-14", "00:00", "Pacific/Auckland")

    const end = zonedDateTime("2026-07-15", "00:00", "Pacific/Auckland")

    const allDay = event({
      allDay: true,

      startsAt: "2026-07-14T12:00:00.000Z",

      endsAt: null,

      startDate: "2026-07-14",

      endDate: "2026-07-14",

      recurrenceRule: "none",

      timeZone: "UTC",
    })

    const items = expandPersonalEvents([allDay], start, end, "Pacific/Auckland")

    expect(items).toHaveLength(1)

    expect(items[0].startDate).toBe("2026-07-14")
  })
})
