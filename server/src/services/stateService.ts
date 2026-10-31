import { Prisma } from "@prisma/client"

import { prisma } from "../db.js"

import type { AppStatePayload } from "../schemas/state.js"

export class StateConflictError extends Error {
  constructor(
    message = "Cloud data changed in another session. Reload the cloud version before continuing.",
  ) {
    super(message)

    this.name = "StateConflictError"
  }
}

export class StateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateValidationError";
  }
}

const subjectCredits: Record<string, number> = {
  CSE111: 3,
  CSE326: 2,
  INT108: 4,
  INT335: 2,
  MEC136: 4,
  MTH165: 4,
}

function subjectNames(state: AppStatePayload) {
  const names = new Map<string, string>()

  const add = (code: string, name = code) => {
    if (!names.has(code)) names.set(code, name)
  }

  for (const entry of state.timetable) add(entry.courseCode, entry.courseName)

  for (const row of state.attendance) add(row.courseCode)

  for (const row of state.assignments) add(row.courseCode)

  for (const row of state.exams) add(row.courseCode)

  for (const row of state.notes) add(row.courseCode)

  for (const row of state.gpaGrades) add(row.courseCode)

  return [...names].map(([code, name]) => ({
    code,
    name,
    credits: subjectCredits[code] ?? 0,
  }))
}

async function writeState(
  tx: Prisma.TransactionClient,

  userId: string,

  state: AppStatePayload,

  expectedRevision: number,

  isLegacyMigration: boolean,
) {
  const current = await tx.studentData.findUnique({ where: { userId } })

  if (current) {
    if (current.revision !== expectedRevision) throw new StateConflictError()

    if (isLegacyMigration && current.legacyMigratedAt)
      throw new StateConflictError("Legacy data has already been migrated.")

    const updated = await tx.studentData.updateMany({
      where: { userId, revision: expectedRevision },

      data: {
        revision: { increment: 1 },

        lastSyncedAt: new Date(),

        ...(isLegacyMigration ? { legacyMigratedAt: new Date() } : {}),
      },
    })

    if (updated.count !== 1) throw new StateConflictError()
  } else {
    if (expectedRevision !== 0) throw new StateConflictError()

    await tx.studentData.create({
      data: {
        userId,

        revision: 1,

        lastSyncedAt: new Date(),

        ...(isLegacyMigration ? { legacyMigratedAt: new Date() } : {}),
      },
    })
  }

  const expectedFiles = [
    ...(state.settings.profilePictureId
      ? [{ id: state.settings.profilePictureId, purpose: "profile" }]
      : []),
    ...state.notes.flatMap((note) =>
      note.fileId ? [{ id: note.fileId, purpose: "note" }] : [],
    ),
    ...state.assignments.flatMap((assignment) =>
      assignment.fileId ? [{ id: assignment.fileId, purpose: "assignment" }] : [],
    ),
  ];
  if (new Set(expectedFiles.map((file) => file.id)).size !== expectedFiles.length) {
    throw new StateValidationError("A file cannot be attached to more than one record.");
  }
  const filesById = new Map(
    (await tx.uploadedFile.findMany({
      where: {
        userId,
        id: { in: expectedFiles.map((file) => file.id) },
        status: "complete",
      },
    })).map((file) => [file.id, file]),
  );
  for (const expected of expectedFiles) {
    const file = filesById.get(expected.id);
    if (!file || file.purpose !== expected.purpose) {
      throw new StateValidationError("An attached file is missing, incomplete, or belongs to another account.");
    }
  }

  await tx.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      displayName: state.settings.profileName,
      semesterStartDate: state.settings.semesterStartDate,
      semesterEndDate: state.settings.semesterEndDate,
      avatarFileId: state.settings.profilePictureId ?? null,
    },
    update: {
      displayName: state.settings.profileName,
      semesterStartDate: state.settings.semesterStartDate,
      semesterEndDate: state.settings.semesterEndDate,
      avatarFileId: state.settings.profilePictureId ?? null,
    },
  })

  const timer = state.pomodoro

  await tx.userSettings.upsert({
    where: { userId },

    create: {
      userId,

      pomodoroMode: timer.mode,

      remainingSeconds: timer.remainingSeconds,

      focusDurationSeconds: timer.focusDurationSeconds,

      breakDurationSeconds: timer.breakDurationSeconds,

      pomodoroIsRunning: timer.isRunning,

      pomodoroEndTime: timer.endTime,

      completedSessions: timer.completedSessions,

      dashboardOrder: state.settings.dashboardOrder ?? [],
    },

    update: {
      pomodoroMode: timer.mode,

      remainingSeconds: timer.remainingSeconds,

      focusDurationSeconds: timer.focusDurationSeconds,

      breakDurationSeconds: timer.breakDurationSeconds,

      pomodoroIsRunning: timer.isRunning,

      pomodoroEndTime: timer.endTime,

      completedSessions: timer.completedSessions,

      dashboardOrder: state.settings.dashboardOrder ?? [],
    },
  })

  for (const subject of subjectNames(state)) {
    await tx.subject.upsert({
      where: { userId_code: { userId, code: subject.code } },
      create: { userId, ...subject },
      update: { name: subject.name, credits: subject.credits },
    })
  }

  await Promise.all([
    tx.timetableEntry.deleteMany({ where: { userId } }),

    tx.attendanceRecord.deleteMany({ where: { userId } }),

    tx.attendanceMark.deleteMany({ where: { userId } }),

    tx.assignment.deleteMany({ where: { userId } }),

    tx.exam.deleteMany({ where: { userId } }),

    tx.grade.deleteMany({ where: { userId } }),

    tx.note.deleteMany({ where: { userId } }),

    tx.task.deleteMany({ where: { userId } }),

    tx.expense.deleteMany({ where: { userId } }),

    tx.customExpenseCategory.deleteMany({ where: { userId } }),
  ])

  await Promise.all([
    tx.timetableEntry.createMany({
      data: state.timetable.map((item) => ({ ...item, userId })),
    }),

    tx.attendanceRecord.createMany({
      data: state.attendance.map((item) => ({ ...item, userId })),
    }),

    tx.attendanceMark.createMany({
      data: Object.entries(state.attendanceMarks).map(([markKey, status]) => ({
        userId,
        markKey,
        status,
      })),
    }),

    tx.assignment.createMany({
      data: state.assignments.map((item) => ({ ...item, userId })),
    }),

    tx.exam.createMany({
      data: state.exams.map((item) => ({ ...item, userId })),
    }),

    tx.grade.createMany({
      data: state.gpaGrades.map((item) => ({ ...item, userId })),
    }),

    tx.note.createMany({
      data: state.notes.map((item) => ({ ...item, userId })),
    }),

    tx.task.createMany({
      data: state.todos.map((item) => ({ ...item, userId })),
    }),

    tx.expense.createMany({
      data: state.expenses.map((item) => ({ ...item, userId })),
    }),

    tx.customExpenseCategory.createMany({
      data: state.customExpenseCategories.map((item) => ({ ...item, userId })),
    }),
  ])

  return expectedRevision + 1
}

export async function saveUserState(
  userId: string,

  state: AppStatePayload,

  expectedRevision: number,

  isLegacyMigration = false,
) {
  try {
    return await prisma.$transaction(
      (tx) => writeState(tx, userId, state, expectedRevision, isLegacyMigration),
      {
        isolationLevel: "Serializable",
        maxWait: 10_000,
        timeout: 30_000,
      },
    )
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      throw new StateConflictError()
    }
    throw error
  }
}

export async function loadUserState(userId: string) {
  const [
    dataVersion,

    profile,

    settings,

    timetable,

    attendance,

    marks,

    assignments,

    exams,

    grades,

    notes,

    tasks,

    expenses,

    categories,
  ] = await Promise.all([
    prisma.studentData.findUnique({ where: { userId } }),

    prisma.userProfile.findUnique({ where: { userId } }),

    prisma.userSettings.findUnique({ where: { userId } }),

    prisma.timetableEntry.findMany({
      where: { userId },
      orderBy: [{ day: "asc" }, { startTime: "asc" }],
    }),

    prisma.attendanceRecord.findMany({
      where: { userId },
      orderBy: { courseCode: "asc" },
    }),

    prisma.attendanceMark.findMany({ where: { userId } }),

    prisma.assignment.findMany({
      where: { userId },
      orderBy: { dueDate: "asc" },
    }),

    prisma.exam.findMany({ where: { userId }, orderBy: { date: "asc" } }),

    prisma.grade.findMany({
      where: { userId },
      orderBy: { courseCode: "asc" },
    }),

    prisma.note.findMany({ where: { userId }, orderBy: { date: "desc" } }),

    prisma.task.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),

    prisma.expense.findMany({ where: { userId }, orderBy: { date: "desc" } }),

    prisma.customExpenseCategory.findMany({
      where: { userId },
      orderBy: { label: "asc" },
    }),
  ])

  if (!dataVersion) {
    return {
      state: null,
      revision: 0,
      lastSyncedAt: null,
      legacyMigrated: false,
    }
  }

  return {
    state: {
      timetable: timetable.map(
        ({
          userId: _userId,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          ...item
        }) => item,
      ),

      attendance: attendance.map(
        ({
          userId: _userId,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          ...item
        }) => item,
      ),

      attendanceMarks: Object.fromEntries(
        marks.map(({ markKey, status }) => [markKey, status]),
      ),

      assignments: assignments.map(
        ({
          userId: _userId,
          storedAt: _storedAt,
          updatedAt: _updatedAt,
          fileId,
          fileName,
          ...item
        }) => ({
          ...item,
          ...(fileId ? { fileId } : {}),
          ...(fileName ? { fileName } : {}),
        }),
      ),

      exams: exams.map(
        ({
          userId: _userId,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          ...item
        }) => item,
      ),

      notes: notes.map(
        ({
          userId: _userId,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          fileId,
          fileName,
          ...item
        }) => ({
          ...item,
          ...(fileId ? { fileId } : {}),
          ...(fileName ? { fileName } : {}),
        }),
      ),

      gpaGrades: grades.map(
        ({
          userId: _userId,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          ...item
        }) => item,
      ),

      settings: {
        profileName: profile?.displayName ?? "",
        semesterStartDate: profile?.semesterStartDate ?? "",
        semesterEndDate: profile?.semesterEndDate ?? "",
        ...(profile?.avatarFileId ? { profilePictureId: profile.avatarFileId } : {}),
        dashboardOrder: settings?.dashboardOrder ?? [
          "nextClass",
          "todaySchedule",
          "semesterProgress",
          "calendar",
          "expenses",
          "attendance",
          "assignments",
          "exams",
          "todos",
        ],
      },

      todos: tasks.map(
        ({
          userId: _userId,
          storedAt: _storedAt,
          updatedAt: _updatedAt,
          ...item
        }) => item,
      ),

      expenses: expenses.map(
        ({
          userId: _userId,
          storedAt: _storedAt,
          updatedAt: _updatedAt,
          ...item
        }) => item,
      ),

      customExpenseCategories: categories.map(
        ({
          userId: _userId,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          ...item
        }) => item,
      ),

      pomodoro: {
        mode: settings?.pomodoroMode ?? "focus",

        remainingSeconds: settings?.remainingSeconds ?? 1500,

        focusDurationSeconds: settings?.focusDurationSeconds ?? 1500,

        breakDurationSeconds: settings?.breakDurationSeconds ?? 300,

        isRunning: settings?.pomodoroIsRunning ?? false,

        endTime: settings?.pomodoroEndTime ?? null,

        completedSessions: settings?.completedSessions ?? 0,
      },
    },

    revision: dataVersion.revision,

    lastSyncedAt: dataVersion.lastSyncedAt,

    legacyMigrated: Boolean(dataVersion.legacyMigratedAt),
  }
}
