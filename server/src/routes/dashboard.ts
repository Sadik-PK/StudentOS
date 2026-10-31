import { Router } from "express"

import { z } from "zod"

import { prisma } from "../db.js"

import { requireAuth } from "../middleware/requireAuth.js"

export const dashboardRouter = Router()

dashboardRouter.use(requireAuth)

const widgetIds = [
  "nextClass",

  "todaySchedule",

  "semesterProgress",

  "calendar",

  "expenses",

  "attendance",

  "assignments",

  "exams",

  "todos",

  "weeklyTimetable",

  "gpa",

  "quickActions",

  "currentTime",

  "recentTransactions",
] as const

const presets = [
  "student",
  "academic",
  "productivity",
  "finance",
  "minimal",
  "custom",
] as const

const sizes = ["small", "medium", "large", "full"] as const

const sectionSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),

    name: z.string().trim().min(1).max(60),
  })
  .strict()

const widgetSchema = z
  .object({
    id: z.enum(widgetIds),

    size: z.enum(sizes),

    sectionId: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),

    settings: z.record(z.string(), z.json()),
  })
  .strict()

const layoutSchema = z
  .object({
    version: z.literal(1),

    preset: z.enum(presets),

    columns: z.union([z.literal(1), z.literal(2), z.literal(3)]),

    density: z.enum(["compact", "comfortable", "spacious"]),

    showGreeting: z.boolean(),

    showWidgetHeaders: z.boolean(),

    sections: z.array(sectionSchema).min(1).max(8),

    widgets: z.array(widgetSchema).max(widgetIds.length),
  })
  .strict()

type DashboardWidgetId = typeof widgetIds[number]

type DashboardPreset = typeof presets[number]

type DashboardLayout = z.infer<typeof layoutSchema>

type DashboardJsonValue = z.infer<ReturnType<typeof z.json>>

const widgetSettings: Record<DashboardWidgetId, z.ZodType<Record<string, DashboardJsonValue>>> =
  {
    nextClass: z.object({}).strict(),

    todaySchedule: z.object({ showRoom: z.boolean().default(true) }).strict(),

    semesterProgress: z.object({}).strict(),

    calendar: z
      .object({ limit: z.number().int().min(1).max(10).default(5) })
      .strict(),

    expenses: z
      .object({ period: z.enum(["week", "month"]).default("month") })
      .strict(),

    attendance: z
      .object({
        warningThreshold: z.number().min(0).max(100).default(75),

        courseCodes: z.array(z.string().min(1).max(32)).max(100).default([]),
      })
      .strict(),

    assignments: z
      .object({ limit: z.number().int().min(1).max(10).default(3) })
      .strict(),

    exams: z
      .object({ limit: z.number().int().min(1).max(10).default(3) })
      .strict(),

    todos: z.object({}).strict(),

    weeklyTimetable: z.object({ showRoom: z.boolean().default(true) }).strict(),

    gpa: z.object({}).strict(),

    quickActions: z.object({}).strict(),

    currentTime: z
      .object({ timeZone: z.string().max(100).optional() })
      .strict(),

    recentTransactions: z
      .object({ limit: z.number().int().min(1).max(10).default(5) })
      .strict(),
  }

const defaultSections = [
  { id: "overview", name: "Overview" },

  { id: "academics", name: "Academics" },

  { id: "productivity", name: "Productivity" },

  { id: "finance", name: "Finance" },
]

const presetWidgets: Record<DashboardPreset, DashboardWidgetId[]> = {
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

const widgetSection: Record<DashboardWidgetId, string> = {
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

function defaultSettings(
  id: DashboardWidgetId,
): Record<string, DashboardJsonValue> {
  return widgetSettings[id].parse({})
}

function createLayout(preset: DashboardPreset = "student"): DashboardLayout {
  return {
    version: 1,

    preset,

    columns: 2,

    density: "comfortable",

    showGreeting: true,

    showWidgetHeaders: true,

    sections: defaultSections,

    widgets: presetWidgets[preset].map((id) => ({
      id,

      size:
        id === "todaySchedule" || id === "calendar" || id === "weeklyTimetable"
          ? "large"
          : "medium",

      sectionId: widgetSection[id],

      settings: defaultSettings(id),
    })),
  }
}

function validateLayout(value: unknown): DashboardLayout {
  const parsed = layoutSchema.parse(value)

  const sectionIds = new Set(parsed.sections.map((section) => section.id))

  if (sectionIds.size !== parsed.sections.length) {
    throw new z.ZodError([
      {
        code: "custom",

        path: ["sections"],

        message: "Section identifiers must be unique.",
      },
    ])
  }

  const widgetSeen = new Set<string>()

  const widgets = parsed.widgets.map((widget, index) => {
    if (widgetSeen.has(widget.id)) {
      throw new z.ZodError([
        {
          code: "custom",

          path: ["widgets", index, "id"],

          message: "A widget can only appear once in a workspace.",
        },
      ])
    }

    if (!sectionIds.has(widget.sectionId)) {
      throw new z.ZodError([
        {
          code: "custom",

          path: ["widgets", index, "sectionId"],

          message: "Widget must belong to a workspace section.",
        },
      ])
    }

    widgetSeen.add(widget.id)

    return {
      ...widget,

      settings: widgetSettings[widget.id].parse(widget.settings),
    }
  })

  return { ...parsed, widgets }
}

const workspaceNameSchema = z.string().trim().min(1).max(60)

const createSchema = z
  .object({
    name: workspaceNameSchema,

    preset: z.enum(presets).default("student"),
  })
  .strict()

const patchSchema = z
  .object({
    name: workspaceNameSchema.optional(),

    layout: z.unknown().optional(),

    revision: z.number().int().positive(),
  })
  .strict()

const duplicateSchema = z
  .object({ name: workspaceNameSchema.optional() })
  .strict()

const MAX_WORKSPACES = 10

function serializeWorkspace(workspace: {
  id: string

  name: string

  preset: string

  layout: unknown

  revision: number

  createdAt: Date

  updatedAt: Date
}) {
  let layout: DashboardLayout

  let recovered = false

  try {
    layout = validateLayout(workspace.layout)
  } catch {
    layout = createLayout("student")

    recovered = true
  }

  return { ...workspace, preset: layout.preset, layout, recovered }
}

dashboardRouter.get("/workspaces", async (req, res, next) => {
  try {
    let workspaces = await prisma.dashboardWorkspace.findMany({
      where: { userId: req.userId! },

      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })

    if (workspaces.length === 0) {
      const settings = await prisma.userSettings.findUnique({
        where: { userId: req.userId! },

        select: { dashboardOrder: true },
      })

      const base = createLayout("student")

      const legacyOrder =
        settings?.dashboardOrder.filter(
          (id): id is DashboardWidgetId =>
            widgetIds.includes(id as DashboardWidgetId),
        ) ?? []

      const order = [
        ...new Set([...legacyOrder, ...base.widgets.map(({ id }) => id)]),
      ]

      const legacyLayout = validateLayout({
        ...base,

        widgets: order.map(
          (id) =>
            base.widgets.find((widget) => widget.id === id) ?? {
              id,

              size: "medium",

              sectionId: widgetSection[id],

              settings: defaultSettings(id),
            },
        ),
      })

      const created = await prisma.dashboardWorkspace.upsert({
        where: { userId_id: { userId: req.userId!, id: "default" } },

        create: {
          userId: req.userId!,

          id: "default",

          name: "My Dashboard",

          preset: "student",

          layout: legacyLayout,
        },

        update: {},
      })

      workspaces = [created]
    }

    let activeWorkspaceId = (
      await prisma.userSettings.findUnique({
        where: { userId: req.userId! },

        select: { activeDashboardWorkspaceId: true },
      })
    )?.activeDashboardWorkspaceId

    if (!workspaces.some((workspace) => workspace.id === activeWorkspaceId)) {
      activeWorkspaceId = workspaces[0].id

      await prisma.userSettings.upsert({
        where: { userId: req.userId! },

        create: {
          userId: req.userId!,
          activeDashboardWorkspaceId: activeWorkspaceId,
        },

        update: { activeDashboardWorkspaceId: activeWorkspaceId },
      })
    }

    res.json({
      workspaces: workspaces.map(serializeWorkspace),

      activeWorkspaceId,

      maxWorkspaces: MAX_WORKSPACES,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res
        .status(500)
        .json({
          error:
            "Stored dashboard layout is invalid and could not be recovered.",
        })

      return
    }

    next(error)
  }
})

dashboardRouter.post("/workspaces", async (req, res, next) => {
  const parsed = createSchema.safeParse(req.body)

  if (!parsed.success) {
    res
      .status(400)
      .json({
        error: "Invalid workspace details.",
        details: parsed.error.issues,
      })

    return
  }

  try {
    const count = await prisma.dashboardWorkspace.count({
      where: { userId: req.userId! },
    })

    if (count >= MAX_WORKSPACES) {
      res
        .status(409)
        .json({ error: `You can save up to ${MAX_WORKSPACES} workspaces.` })

      return
    }

    const workspace = await prisma.dashboardWorkspace.create({
      data: {
        userId: req.userId!,

        id: crypto.randomUUID(),

        name: parsed.data.name,

        preset: parsed.data.preset,

        layout: createLayout(parsed.data.preset),
      },
    })

    res.status(201).json(serializeWorkspace(workspace))
  } catch (error) {
    next(error)
  }
})

dashboardRouter.post("/workspaces/:id/duplicate", async (req, res, next) => {
  const parsed = duplicateSchema.safeParse(req.body)

  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid workspace name.", details: parsed.error.issues })

    return
  }

  try {
    const [count, original] = await Promise.all([
      prisma.dashboardWorkspace.count({ where: { userId: req.userId! } }),

      prisma.dashboardWorkspace.findFirst({
        where: { userId: req.userId!, id: req.params.id },
      }),
    ])

    if (!original) {
      res.status(404).json({ error: "Workspace not found." })

      return
    }

    if (count >= MAX_WORKSPACES) {
      res
        .status(409)
        .json({ error: `You can save up to ${MAX_WORKSPACES} workspaces.` })

      return
    }

    const workspace = await prisma.dashboardWorkspace.create({
      data: {
        userId: req.userId!,

        id: crypto.randomUUID(),

        name: parsed.data.name ?? `${original.name} copy`.slice(0, 60),

        preset: original.preset,

        layout: validateLayout(original.layout),
      },
    })

    res.status(201).json(serializeWorkspace(workspace))
  } catch (error) {
    if (error instanceof z.ZodError) {
      res
        .status(400)
        .json({
          error: "The workspace layout is invalid and cannot be duplicated.",
        })

      return
    }

    next(error)
  }
})

dashboardRouter.patch("/workspaces/:id/activate", async (req, res, next) => {
  try {
    const workspace = await prisma.dashboardWorkspace.findFirst({
      where: { userId: req.userId!, id: req.params.id },

      select: { id: true },
    })

    if (!workspace) {
      res.status(404).json({ error: "Workspace not found." })

      return
    }

    await prisma.userSettings.upsert({
      where: { userId: req.userId! },

      create: { userId: req.userId!, activeDashboardWorkspaceId: workspace.id },

      update: { activeDashboardWorkspaceId: workspace.id },
    })

    res.json({ activeWorkspaceId: workspace.id })
  } catch (error) {
    next(error)
  }
})

dashboardRouter.patch("/workspaces/:id", async (req, res, next) => {
  const parsed = patchSchema.safeParse(req.body)

  if (!parsed.success) {
    res
      .status(400)
      .json({
        error: "Invalid workspace update.",
        details: parsed.error.issues,
      })

    return
  }

  let layout: DashboardLayout | undefined

  if (parsed.data.layout !== undefined) {
    try {
      layout = validateLayout(parsed.data.layout)
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Invalid dashboard layout.", details: error.issues })

        return
      }

      next(error)

      return
    }
  }

  try {
    const updated = await prisma.dashboardWorkspace.updateMany({
      where: {
        userId: req.userId!,

        id: req.params.id,

        revision: parsed.data.revision,
      },

      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),

        ...(layout ? { layout, preset: layout.preset } : {}),

        revision: { increment: 1 },
      },
    })

    if (!updated.count) {
      const existing = await prisma.dashboardWorkspace.findFirst({
        where: { userId: req.userId!, id: req.params.id },

        select: { revision: true },
      })

      if (!existing) {
        res.status(404).json({ error: "Workspace not found." })

        return
      }

      res
        .status(409)
        .json({
          error: "This workspace changed elsewhere. Reload it before saving.",
          revision: existing.revision,
        })

      return
    }

    const workspace = await prisma.dashboardWorkspace.findFirst({
      where: { userId: req.userId!, id: req.params.id },
    })

    res.json(serializeWorkspace(workspace!))
  } catch (error) {
    next(error)
  }
})

dashboardRouter.delete("/workspaces/:id", async (req, res, next) => {
  try {
    const workspaces = await prisma.dashboardWorkspace.findMany({
      where: { userId: req.userId! },

      orderBy: { createdAt: "asc" },

      select: { id: true },
    })

    const target = workspaces.find(({ id }) => id === req.params.id)

    if (!target) {
      res.status(404).json({ error: "Workspace not found." })

      return
    }

    if (workspaces.length <= 1) {
      res
        .status(400)
        .json({ error: "At least one dashboard workspace must remain." })

      return
    }

    const fallback = workspaces.find(({ id }) => id !== target.id)!

    await prisma.$transaction(async (transaction) => {
      await transaction.dashboardWorkspace.delete({
        where: { userId_id: { userId: req.userId!, id: target.id } },
      })

      await transaction.userSettings.updateMany({
        where: { userId: req.userId!, activeDashboardWorkspaceId: target.id },

        data: { activeDashboardWorkspaceId: fallback.id },
      })
    })

    res.json({ deleted: true, fallbackWorkspaceId: fallback.id })
  } catch (error) {
    next(error)
  }
})
