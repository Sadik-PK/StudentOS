import { Router } from "express"

import { z } from "zod"

import { prisma } from "../db.js"

import { requireAuth } from "../middleware/requireAuth.js"

export const calendarRouter = Router()

calendarRouter.use(requireAuth)

const categories = [
  "personal",
  "college",
  "study",
  "work",
  "health",
  "other",
] as const

const sources = ["class", "assignment", "exam", "personal", "study"] as const

const views = ["month", "week", "day", "agenda"] as const

const recurrenceRules = [
  "none",
  "daily",
  "weekdays",
  "weekly",
  "monthly",
  "custom-weekly",
] as const

const datePattern = /^\d{4}-\d{2}-\d{2}$/

const dateSchema = z
  .string()
  .regex(datePattern)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`)

    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    )
  })

const eventSchema = z
  .object({
    title: z.string().trim().min(1).max(200),

    description: z.string().max(5000).nullable(),

    startsAt: z.string().datetime({ offset: true }),

    endsAt: z.string().datetime({ offset: true }).nullable(),

    allDay: z.boolean(),

    startDate: dateSchema.nullable(),

    endDate: dateSchema.nullable(),

    category: z.enum(categories),

    location: z.string().max(300).nullable(),

    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .or(z.enum(["amber", "green", "blue", "purple", "red", "pink"])),

    reminderMinutes: z.number().int().min(0).max(1440).nullable(),

    recurrenceRule: z.enum(recurrenceRules),

    recurrenceDays: z.array(z.number().int().min(0).max(6)).max(7),

    recurrenceUntil: dateSchema.nullable(),

    timeZone: z.string().min(1).max(100),
  })
  .superRefine((event, context) => {
    if (event.allDay) {
      if (!event.startDate || !event.endDate) {
        context.addIssue({
          code: "custom",
          path: ["startDate"],
          message: "All-day events require start and end dates.",
        })
      } else if (event.endDate < event.startDate) {
        context.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "End date must be on or after start date.",
        })
      }
    } else {
      const start = Date.parse(event.startsAt)

      if (!event.endsAt || Date.parse(event.endsAt) <= start) {
        context.addIssue({
          code: "custom",
          path: ["endsAt"],
          message: "End time must be after start time.",
        })
      }
    }

    if (
      event.recurrenceRule === "custom-weekly" &&
      event.recurrenceDays.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["recurrenceDays"],
        message: "Choose at least one weekday.",
      })
    }

    try {
      new Intl.DateTimeFormat("en-US", { timeZone: event.timeZone })
    } catch {
      context.addIssue({
        code: "custom",
        path: ["timeZone"],
        message: "Use a valid IANA timezone.",
      })
    }
  })

const preferencesSchema = z
  .object({
    calendarView: z.enum(views).optional(),

    calendarVisibleSources: z
      .array(z.enum(sources))
      .max(sources.length)
      .optional(),

    calendarVisibleCategories: z
      .array(z.enum(categories))
      .max(categories.length)
      .optional(),

    calendarTimezone: z.string().min(1).max(100).optional(),
  })
  .strict()

const defaultPreferences = {
  calendarView: "agenda",

  calendarVisibleSources: [...sources],

  calendarVisibleCategories: [...categories],
}

calendarRouter.get("/preferences", async (req, res, next) => {
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId: req.userId! },
    })

    res.json({
      calendarView: settings?.calendarView ?? defaultPreferences.calendarView,

      calendarVisibleSources:
        settings?.calendarVisibleSources ??
        defaultPreferences.calendarVisibleSources,

      calendarVisibleCategories:
        settings?.calendarVisibleCategories ??
        defaultPreferences.calendarVisibleCategories,

      calendarTimezone: settings?.calendarTimezone ?? null,
    })
  } catch (error) {
    next(error)
  }
})

calendarRouter.patch("/preferences", async (req, res, next) => {
  const parsed = preferencesSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid calendar preferences.",
      details: parsed.error.issues,
    })

    return
  }

  if (parsed.data.calendarTimezone) {
    try {
      new Intl.DateTimeFormat("en-US", {
        timeZone: parsed.data.calendarTimezone,
      })
    } catch {
      res.status(400).json({ error: "Use a valid IANA timezone." })

      return
    }
  }

  try {
    const settings = await prisma.userSettings.upsert({
      where: { userId: req.userId! },

      create: {
        userId: req.userId!,

        ...defaultPreferences,

        ...parsed.data,
      },

      update: parsed.data,
    })

    res.json({
      calendarView: settings.calendarView,

      calendarVisibleSources: settings.calendarVisibleSources,

      calendarVisibleCategories: settings.calendarVisibleCategories,

      calendarTimezone: settings.calendarTimezone,
    })
  } catch (error) {
    next(error)
  }
})

calendarRouter.get("/events", async (req, res, next) => {
  const query = z
    .object({
      start: z.string().datetime({ offset: true }),

      end: z.string().datetime({ offset: true }),

      startDate: dateSchema,

      endDate: dateSchema,
    })
    .safeParse(req.query)

  if (
    !query.success ||
    Date.parse(query.data.end) <= Date.parse(query.data.start)
  ) {
    res
      .status(400)
      .json({ error: "Provide a valid, increasing calendar range." })

    return
  }

  if (
    Date.parse(query.data.end) - Date.parse(query.data.start) >
    93 * 86400000
  ) {
    res.status(400).json({ error: "Calendar ranges cannot exceed 93 days." })

    return
  }

  const { start, end, startDate, endDate } = query.data

  try {
    const events = await prisma.calendarEvent.findMany({
      where: {
        userId: req.userId!,

        OR: [
          {
            recurrenceRule: "none",

            startsAt: { lt: new Date(end) },

            OR: [{ endsAt: null }, { endsAt: { gte: new Date(start) } }],
          },

          {
            recurrenceRule: { not: "none" },

            startsAt: { lt: new Date(end) },

            OR: [
              { recurrenceUntil: null },
              { recurrenceUntil: { gte: startDate } },
            ],
          },

          {
            allDay: true,

            startDate: { lte: endDate },

            endDate: { gte: startDate },
          },
        ],
      },

      orderBy: [{ startsAt: "asc" }, { id: "asc" }],

      take: 1001,
    })

    if (events.length > 1000) {
      res.status(413).json({
        error:
          "This range contains too many events. Choose a shorter calendar range.",
      })

      return
    }

    res.json(events)
  } catch (error) {
    next(error)
  }
})

calendarRouter.post("/events", async (req, res, next) => {
  const parsed = eventSchema.safeParse(req.body)

  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid calendar event.", details: parsed.error.issues })

    return
  }

  const event = parsed.data

  try {
    const created = await prisma.calendarEvent.create({
      data: {
        userId: req.userId!,

        id: crypto.randomUUID(),

        ...event,

        startsAt: event.allDay
          ? new Date(`${event.startDate}T12:00:00.000Z`)
          : new Date(event.startsAt),

        endsAt: event.allDay || !event.endsAt ? null : new Date(event.endsAt),
      },
    })

    res.status(201).json(created)
  } catch (error) {
    next(error)
  }
})

calendarRouter.patch("/events/:id", async (req, res, next) => {
  const parsed = eventSchema.safeParse(req.body)

  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid calendar event.", details: parsed.error.issues })

    return
  }

  const event = parsed.data

  const occurrenceDate = req.query.occurrenceDate

  if (
    occurrenceDate !== undefined &&
    (typeof occurrenceDate !== "string" ||
      !dateSchema.safeParse(occurrenceDate).success)
  ) {
    res.status(400).json({ error: "Invalid occurrence date." })

    return
  }

  try {
    if (occurrenceDate) {
      const series = await prisma.calendarEvent.findFirst({
        where: { userId: req.userId!, id: req.params.id },
      })

      if (!series) {
        res.status(404).json({ error: "Calendar event not found." })

        return
      }

      if (series.recurrenceRule === "none") {
        res.status(400).json({ error: "This event is not recurring." })

        return
      }

      const existingException = await prisma.calendarEvent.findFirst({
        where: {
          userId: req.userId!,

          seriesId: series.id,

          seriesOccurrenceDate: occurrenceDate,
        },
      })

      if (existingException) {
        const updatedException = await prisma.calendarEvent.update({
          where: {
            userId_id: {
              userId: req.userId!,

              id: existingException.id,
            },
          },

          data: {
            ...event,

            recurrenceRule: "none",

            recurrenceDays: [],

            recurrenceUntil: null,

            startsAt: event.allDay
              ? new Date(`${event.startDate}T12:00:00.000Z`)
              : new Date(event.startsAt),

            endsAt:
              event.allDay || !event.endsAt ? null : new Date(event.endsAt),
          },
        })

        res.json(updatedException)

        return
      }

      const [, exception] = await prisma.$transaction([
        prisma.calendarEvent.update({
          where: { userId_id: { userId: req.userId!, id: req.params.id } },

          data: {
            excludedOccurrences: [
              ...new Set([...series.excludedOccurrences, occurrenceDate]),
            ],
          },
        }),

        prisma.calendarEvent.create({
          data: {
            userId: req.userId!,

            id: crypto.randomUUID(),

            seriesId: series.id,

            seriesOccurrenceDate: occurrenceDate,

            ...event,

            recurrenceRule: "none",

            recurrenceDays: [],

            recurrenceUntil: null,

            startsAt: event.allDay
              ? new Date(`${event.startDate}T12:00:00.000Z`)
              : new Date(event.startsAt),

            endsAt:
              event.allDay || !event.endsAt ? null : new Date(event.endsAt),
          },
        }),
      ])

      res.status(201).json(exception)

      return
    }

    const updated = await prisma.calendarEvent.updateMany({
      where: { userId: req.userId!, id: req.params.id },

      data: {
        ...event,

        startsAt: event.allDay
          ? new Date(`${event.startDate}T12:00:00.000Z`)
          : new Date(event.startsAt),

        endsAt: event.allDay || !event.endsAt ? null : new Date(event.endsAt),
      },
    })

    if (!updated.count) {
      res.status(404).json({ error: "Calendar event not found." })

      return
    }

    const saved = await prisma.calendarEvent.findFirst({
      where: { userId: req.userId!, id: req.params.id },
    })

    res.json(saved)
  } catch (error) {
    next(error)
  }
})

calendarRouter.delete("/events/:id", async (req, res, next) => {
  const occurrenceDate = req.query.occurrenceDate

  if (
    occurrenceDate !== undefined &&
    (typeof occurrenceDate !== "string" ||
      !dateSchema.safeParse(occurrenceDate).success)
  ) {
    res.status(400).json({ error: "Invalid occurrence date." })

    return
  }

  try {
    if (occurrenceDate) {
      const event = await prisma.calendarEvent.findFirst({
        where: { userId: req.userId!, id: req.params.id },
      })

      if (!event) {
        res.status(404).json({ error: "Calendar event not found." })

        return
      }

      if (event.recurrenceRule === "none") {
        res.status(400).json({ error: "This event is not recurring." })

        return
      }

      const excludedOccurrences = [
        ...new Set([...event.excludedOccurrences, occurrenceDate]),
      ]

      await prisma.calendarEvent.update({
        where: { userId_id: { userId: req.userId!, id: req.params.id } },

        data: { excludedOccurrences },
      })

      res.status(204).end()

      return
    }

    const deleted = await prisma.calendarEvent.deleteMany({
      where: { userId: req.userId!, id: req.params.id },
    })

    if (!deleted.count) {
      res.status(404).json({ error: "Calendar event not found." })

      return
    }

    res.status(204).end()
  } catch (error) {
    next(error)
  }
})
