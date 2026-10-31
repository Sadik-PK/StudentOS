import { z } from "zod"

const optionalValue = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === null ? undefined : value), schema.optional())

const timetableEntrySchema = z.object({
  id: z.string().min(1).max(128),

  day: z.string().min(1).max(20),

  startTime: z.string().min(1).max(10),

  endTime: z.string().min(1).max(10),

  courseCode: z.string().min(1).max(32),

  courseName: z.string().min(1).max(200),

  type: z.string().min(1).max(32),

  room: z.string().max(100),

  group: optionalValue(z.string().max(100)),

  note: optionalValue(z.string().max(1000)),
})

const attendanceRecordSchema = z.object({
  courseCode: z.string().min(1).max(32),

  attended: z.number().int().min(0).max(100000),

  total: z.number().int().min(0).max(100000),

  dutyLeave: z.number().int().min(0).max(100000),
})

const assignmentSchema = z.object({
  id: z.string().min(1).max(128),

  courseCode: z.string().min(1).max(32),

  title: z.string().min(1).max(300),

  dueDate: z.string().min(1).max(50),

  priority: z.enum(["high", "medium", "low"]),

  completed: z.boolean(),

  notes: z.string().max(20000),

  reminderMinutes: optionalValue(z.number().int().min(0).max(1440)),

  fileId: optionalValue(z.string().uuid()),
  fileName: optionalValue(z.string().max(255)),
  createdAt: z.string().min(1).max(50),
})

const examSchema = z.object({
  id: z.string().min(1).max(128),

  courseCode: z.string().min(1).max(32),

  type: z.string().min(1).max(100),

  date: z.string().min(1).max(50),

  startTime: z.string().max(20),

  room: z.string().max(100),
})

const noteSchema = z.object({
  id: z.string().min(1).max(128),

  courseCode: z.string().min(1).max(32),

  title: z.string().min(1).max(300),

  description: z.string().max(20000),

  fileName: optionalValue(z.string().max(255)),

  fileId: optionalValue(z.string().uuid()),

  date: z.string().min(1).max(50),

  pinned: z.boolean(),
})

const gradeSchema = z.object({
  courseCode: z.string().min(1).max(32),

  grade: z.string().max(10),
})

const todoSchema = z.object({
  id: z.string().min(1).max(128),

  text: z.string().min(1).max(1000),

  done: z.boolean(),

  createdAt: z.string().min(1).max(50),
})

const expenseSchema = z.object({
  id: z.string().min(1).max(128),

  description: z.string().max(500),

  amount: z.number().finite().min(0).max(1000000000),

  category: z.string().min(1).max(100),

  date: z.string().min(1).max(50),

  createdAt: z.string().min(1).max(50),
})

const dashboardSectionSchema = z.enum([
  "nextClass",
  "todaySchedule",
  "semesterProgress",
  "calendar",
  "expenses",
  "attendance",
  "assignments",
  "exams",
  "todos",
])

export const appStateSchema = z
  .object({
    timetable: z.array(timetableEntrySchema).max(1000),

    attendance: z.array(attendanceRecordSchema).max(1000),

    attendanceMarks: z.record(
      z.string().max(128),
      z.enum(["present", "absent"]),
    ),

    assignments: z.array(assignmentSchema).max(1000),

    exams: z.array(examSchema).max(1000),

    notes: z.array(noteSchema).max(1000),

    gpaGrades: z.array(gradeSchema).max(1000),

    settings: z.object({
      profileName: z.string().max(100),

      semesterStartDate: z.string().max(50),

      semesterEndDate: z.string().max(50),

      profilePictureId: optionalValue(z.string().uuid()),

      dashboardOrder: optionalValue(z.array(dashboardSectionSchema).max(9)),
    }),

    todos: z.array(todoSchema).max(1000),

    expenses: z.array(expenseSchema).max(10000),

    customExpenseCategories: z
      .array(
        z.object({
          id: z.string().min(1).max(100),

          label: z.string().min(1).max(100),
        }),
      )
      .max(100),

    pomodoro: z.object({
      mode: z.enum(["focus", "break"]),

      remainingSeconds: z.number().int().min(0).max(86400),

      focusDurationSeconds: z.number().int().min(1).max(86400),

      breakDurationSeconds: z.number().int().min(1).max(86400),

      isRunning: z.boolean(),

      endTime: z.string().max(50).nullable(),

      completedSessions: z.number().int().min(0).max(1000000),
    }),
  })
  .superRefine((state, context) => {
    const dashboardOrder = state.settings.dashboardOrder ?? []
    if (new Set(dashboardOrder).size !== dashboardOrder.length) {
      context.addIssue({
        code: "custom",
        path: ["settings", "dashboardOrder"],
        message: "Dashboard sections must be unique.",
      })
    }

    const uniqueBy = (values: string[], path: string[]) => {
      const seen = new Set<string>()

      for (const [index, value] of values.entries()) {
        if (seen.has(value)) {
          context.addIssue({
            code: "custom",
            path: [...path, index],
            message: "Duplicate record identifier.",
          })
        }

        seen.add(value)
      }
    }

    uniqueBy(
      state.timetable.map((item) => item.id),
      ["timetable"],
    )

    uniqueBy(
      state.attendance.map((item) => item.courseCode),
      ["attendance"],
    )

    uniqueBy(
      state.assignments.map((item) => item.id),
      ["assignments"],
    )

    uniqueBy(
      state.exams.map((item) => item.id),
      ["exams"],
    )

    uniqueBy(
      state.notes.map((item) => item.id),
      ["notes"],
    )

    uniqueBy(
      state.gpaGrades.map((item) => item.courseCode),
      ["gpaGrades"],
    )

    uniqueBy(
      state.todos.map((item) => item.id),
      ["todos"],
    )

    uniqueBy(
      state.expenses.map((item) => item.id),
      ["expenses"],
    )

    uniqueBy(
      state.customExpenseCategories.map((item) => item.id),
      ["customExpenseCategories"],
    )
  })

export const stateWriteSchema = z.object({
  state: appStateSchema,

  revision: z.number().int().min(0),
})

export type AppStatePayload = z.infer<typeof appStateSchema>
